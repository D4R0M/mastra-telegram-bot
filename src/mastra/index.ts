import 'dotenv/config';
import { Mastra } from "@mastra/core";
import { MastraError } from "@mastra/core/error";
import { PinoLogger } from "@mastra/loggers";

// Production startup validation for required environment variables
if (process.env.NODE_ENV === 'production') {
  // Fail fast if Telegram token missing when webhooks enabled
  if (process.env.USE_POLLING !== 'true' && !process.env.TELEGRAM_BOT_TOKEN) {
    console.error('❌ TELEGRAM_BOT_TOKEN is required in production when using webhooks');
    process.exit(1);
  }
}
import { LogLevel, MastraLogger } from "@mastra/core/logger";
import pino from "pino";
import { MCPServer } from "@mastra/mcp";
import { NonRetriableError } from "inngest";
import { z } from "zod";

import { sharedPostgresStorage } from "./storage";
import { inngest, inngestServe } from "./inngest";
import { runMigrations } from "../db/migrate.js";
import { addCardTool, listCardsTool, editCardTool, deleteCardTool } from './tools/vocabularyTools.js';
import { getDueCardsTool, startReviewTool, submitReviewTool } from './tools/reviewTools.js';
import { getReminderSettingsTool, updateReminderSettingsTool, checkReminderTimeTool, recordReminderSentTool } from './tools/reminderTools.js';
import { importCSVTool, exportCSVTool, previewCSVTool } from './tools/importExportTools.js';
import { getUserSettingsTool, updateSessionSettingsTool, updateAlgorithmSettingsTool, updateReminderSettingsAdvancedTool, resetSettingsTool } from './tools/settingsTools.js';
import { getDueCardsStatsTool, getRetentionStatsTool, getStreakStatsTool, getEaseHistogramTool, getComprehensiveStatsTool } from './tools/statisticsTools.js';
import { vocabularyWorkflow } from './workflows/vocabularyWorkflow.js';

class ProductionPinoLogger extends MastraLogger {
  protected logger: pino.Logger;

  constructor(
    options: {
      name?: string;
      level?: LogLevel;
    } = {},
  ) {
    super(options);

    this.logger = pino({
      name: options.name || "app",
      level: options.level || LogLevel.INFO,
      base: {},
      formatters: {
        level: (label: string, _number: number) => ({
          level: label,
        }),
      },
      timestamp: () => `,"time":"${new Date(Date.now()).toISOString()}"`,
    });
  }

  debug(message: string, args: Record<string, any> = {}): void {
    this.logger.debug(args, message);
  }

  info(message: string, args: Record<string, any> = {}): void {
    this.logger.info(args, message);
  }

  warn(message: string, args: Record<string, any> = {}): void {
    this.logger.warn(args, message);
  }

  error(message: string, args: Record<string, any> = {}): void {
    this.logger.error(args, message);
  }
}

// Initialize database before creating Mastra instance
// Only run migrations if DATABASE_URL exists
if (process.env.DATABASE_URL) {
  await runMigrations({
    info: (msg: string, data?: any) => console.log('🔧 [DB Migration]', msg, data ? JSON.stringify(data) : ''),
    error: (msg: string, data?: any) => console.error('🔥 [DB Migration]', msg, data ? JSON.stringify(data) : '')
  });
  console.log('✅ [DB Migration] Database migrations completed successfully');
} else {
  console.warn('⚠️ [DB Migration] DATABASE_URL not set, skipping migrations');
}

export const mastra = new Mastra({
  storage: sharedPostgresStorage,
  agents: {},
  workflows: { vocabularyWorkflow },
  mcpServers: {
    allTools: new MCPServer({
      name: "allTools",
      version: "1.0.0",
      tools: {
        addCardTool,
        listCardsTool,
        editCardTool,
        deleteCardTool,
        getDueCardsTool,
        startReviewTool,
        submitReviewTool,
        getReminderSettingsTool,
        updateReminderSettingsTool,
        checkReminderTimeTool,
        recordReminderSentTool,
        importCSVTool,
        exportCSVTool,
        previewCSVTool,
        getUserSettingsTool,
        updateSessionSettingsTool,
        updateAlgorithmSettingsTool,
        updateReminderSettingsAdvancedTool,
        resetSettingsTool,
        getDueCardsStatsTool,
        getRetentionStatsTool,
        getStreakStatsTool,
        getEaseHistogramTool,
        getComprehensiveStatsTool,
      },
    }),
  },
  bundler: {
    // A few dependencies are not properly picked up by
    // the bundler if they are not added directly to the
    // entrypoint.
    externals: [
      "@slack/web-api",
      "inngest",
      "inngest/hono",
      "hono",
      "hono/streaming",
    ],
    // sourcemaps are good for debugging.
    sourcemap: true,
  },
  server: {
    host: "0.0.0.0",
    port: parseInt(process.env.PORT || "3000"),
    middleware: [
      async (c, next) => {
        const mastra = c.get("mastra");
        const logger = mastra?.getLogger();
        logger?.debug("[Request]", { method: c.req.method, url: c.req.url });
        try {
          await next();
        } catch (error) {
          logger?.error("[Response]", {
            method: c.req.method,
            url: c.req.url,
            error,
          });
          if (error instanceof MastraError) {
            if (error.id === "AGENT_MEMORY_MISSING_RESOURCE_ID") {
              // This is typically a non-retirable error. It means that the request was not
              // setup correctly to pass in the necessary parameters.
              throw new NonRetriableError(error.message, { cause: error });
            }
          } else if (error instanceof z.ZodError) {
            // Validation errors are never retriable.
            throw new NonRetriableError(error.message, { cause: error });
          }

          throw error;
        }
      },
    ],
    apiRoutes: [
      // Health check endpoint for Railway
      {
        path: "/health",
        method: "GET",
        createHandler: async () => {
          return (c) => c.json({ status: "ok" });
        },
      },
      // This API route is used to register the Mastra workflow (inngest function) on the inngest server
      {
        path: "/api/inngest",
        method: "ALL",
        createHandler: async ({ mastra }) => inngestServe({ mastra, inngest }),
      },
      // Telegram webhook endpoint
      {
        path: "/webhooks/telegram/action",
        method: "POST",
        createHandler: async ({ mastra }) => {
          return async (c) => {
            const logger = mastra.getLogger();
            
            // Validate token at request time
            if (!process.env.TELEGRAM_BOT_TOKEN) {
              logger?.error("❌ [Telegram] TELEGRAM_BOT_TOKEN missing");
              return c.text("Configuration Error", 500);
            }

            try {
              const payload = await c.req.json();

              logger?.info("📝 [Telegram] Received", { 
                type: payload?.message ? 'message' : payload?.callback_query ? 'callback' : 'unknown',
                chatId: payload?.message?.chat?.id || payload?.callback_query?.message?.chat?.id,
                userId: payload?.message?.from?.id || payload?.callback_query?.from?.id
              });

              // Handle callback queries (button presses)
              if (payload?.callback_query) {
                const callbackQuery = payload.callback_query;
                const callbackData = callbackQuery.data;
                const chatId = callbackQuery.message?.chat?.id?.toString() || '';
                const messageId = callbackQuery.message?.message_id?.toString();
                const callbackQueryId = callbackQuery.id;
                
                logger?.info('🎯 [Telegram Trigger] Received callback query:', {
                  callbackData,
                  chatId,
                  messageId,
                  callbackQueryId
                });

                // Process grade button press
                if (callbackData?.startsWith('grade:')) {
                  const [_, gradeStr, cardId] = callbackData.split(':');
                  const grade = parseInt(gradeStr);
                  const owner_id = chatId;
                  
                  try {
                    // Import submit review tool
                    const { submitReviewTool } = await import('./tools/reviewTools.js');
                    const { getConversationState, saveConversationState } = await import('./conversationStateStorage.js');
                    const { buildToolExecCtx } = await import('./context.js');
                    
                    // Get conversation state to get session data
                    const state = await getConversationState(owner_id);
                    
                    if (state?.mode === 'review_session' && state.data) {
                      // Submit the review
                      const { runtimeContext, tracingContext } = buildToolExecCtx(mastra, { requestId: owner_id });
                      const result = await submitReviewTool.execute({
                        context: {
                          owner_id,
                          card_id: cardId,
                          start_time: state.data.start_time || Date.now() - 10000,
                          grade,
                          session_id: state.data.session_id
                        },
                        runtimeContext,
                        tracingContext,
                        mastra
                      });
                      
                      // Answer the callback query to remove loading state
                      const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
                      if (TELEGRAM_BOT_TOKEN) {
                        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            callback_query_id: callbackQueryId,
                            text: `Grade ${grade} saved ✓`
                          })
                        });
                        
                        // Update the message to remove keyboard and show saved status
                        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageReplyMarkup`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            chat_id: chatId,
                            message_id: messageId,
                            reply_markup: { inline_keyboard: [] }
                          })
                        });
                      }
                      
                      // Check if there are more cards and send the next one
                      const nextIndex = (state.data.current_index || 1) + 1;
                      const hasMoreCards = state.data.all_cards && nextIndex <= state.data.all_cards.length;
                      
                      if (hasMoreCards) {
                        const nextCard = state.data.all_cards[nextIndex - 1];
                        
                        // Update state for next card
                        await saveConversationState(owner_id, {
                          mode: 'review_session',
                          step: 1,
                          data: {
                            ...state.data,
                            current_card: nextCard,
                            current_index: nextIndex,
                            start_time: Date.now()
                          }
                        });
                        
                        // Send next card
                        const run = await mastra.getWorkflow("vocabularyWorkflow").createRunAsync();
                        await run.start({
                          inputData: {
                            message: '__next_card__', // Special indicator for next card
                            threadId: `telegram_${chatId}_${Date.now()}`,
                            owner_id,
                            chatId,
                            messageId: undefined
                          }
                        });
                      } else {
                        // Session complete
                        await saveConversationState(owner_id, undefined);
                        
                        // Send completion message
                        const run = await mastra.getWorkflow("vocabularyWorkflow").createRunAsync();
                        await run.start({
                          inputData: {
                            message: '__session_complete__', // Special indicator for completion
                            threadId: `telegram_${chatId}_${Date.now()}`,
                            owner_id,
                            chatId,
                            messageId: undefined
                          }
                        });
                      }
                    }
                  } catch (error) {
                    logger?.error('❌ [Telegram Trigger] Error handling callback query:', {
                      error: error instanceof Error ? error.message : String(error),
                      callbackData,
                      chatId
                    });
                  }
                }
                return c.text("OK", 200);
              }

              // Handle regular messages
              logger?.info('📱 [Telegram Trigger] Received message:', {
                chatId: payload?.message?.chat?.id,
                messageId: payload?.message?.message_id,
                userName: payload?.message?.from?.username,
                messageText: payload?.message?.text?.substring(0, 100) + (payload?.message?.text?.length > 100 ? '...' : '')
              });

              // Extract message details for workflow
              const message = payload?.message?.text || '';
              const chatId = payload?.message?.chat?.id?.toString() || '';
              const messageId = payload?.message?.message_id?.toString();
              const threadId = `telegram_${chatId}_${messageId}`;
              const owner_id = chatId; // Use chat ID as owner_id

              if (!message.trim()) {
                logger?.warn('⚠️ [Telegram Trigger] Empty message received, skipping');
                return c.text("OK", 200);
              }

              try {
                // Start the vocabulary workflow
                logger?.info('🚀 [Telegram Trigger] Starting vocabulary workflow:', {
                  threadId,
                  owner_id,
                  chatId,
                  messageId
                });

                const run = await mastra.getWorkflow("vocabularyWorkflow").createRunAsync();
                const result = await run.start({
                  inputData: {
                    message,
                    threadId,
                    owner_id,
                    chatId,
                    messageId
                  }
                });

                logger?.info('✅ [Telegram Trigger] Workflow completed successfully:', {
                  threadId,
                  status: result?.status
                });

              } catch (error) {
                logger?.error('❌ [Telegram Trigger] Error starting workflow:', {
                  error: error instanceof Error ? error.message : String(error),
                  threadId,
                  owner_id,
                  chatId
                });
              }

              return c.text("OK", 200);
            } catch (error) {
              logger?.error("❌ [Telegram] Error handling webhook:", error);
              return c.text("Internal Server Error", 500);
            }
          };
        },
      },
    ],
  },
  logger:
    process.env.NODE_ENV === "production"
      ? new ProductionPinoLogger({
          name: "Mastra",
          level: "info",
        })
      : new PinoLogger({
          name: "Mastra",
          level: "info",
        }),
});

/*  Sanity check 1: Throw an error if there are more than 1 workflows.  */
// !!!!!! Do not remove this check. !!!!!!
if (Object.keys(mastra.getWorkflows()).length > 1) {
  throw new Error(
    "More than 1 workflows found. Currently, more than 1 workflows are not supported in the UI, since doing so will cause app state to be inconsistent.",
  );
}

/*  Sanity check 2: Throw an error if there are more than 1 agents.  */
// !!!!!! Do not remove this check. !!!!!!
if (Object.keys(mastra.getAgents()).length > 1) {
  throw new Error(
    "More than 1 agents found. Currently, more than 1 agents are not supported in the UI, since doing so will cause app state to be inconsistent.",
  );
}
