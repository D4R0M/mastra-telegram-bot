import { createWorkflow, createStep } from "../inngest";
import { z } from "zod";
import { processCommand } from "../commandParser";
import {
  getConversationState,
  saveConversationState,
} from "../conversationStateStorage";

// Step 1: Use the command parser to process message
const useCommandParserStep = createStep({
  id: "use-command-parser",
  description: "Process message using deterministic command parser",
  inputSchema: z.object({
    message: z.string().describe("The user's message content"),
    threadId: z
      .string()
      .describe("Unique thread identifier for conversation context"),
    owner_id: z
      .string()
      .describe("User ID for personalization and data access"),
    chatId: z
      .string()
      .describe("Telegram chat ID to pass through to next step"),
    messageId: z
      .string()
      .optional()
      .describe("Original message ID to pass through to next step"),
  }),
  outputSchema: z.object({
    response: z.string().describe("The parser's response to send back to user"),
    chatId: z
      .string()
      .describe("Telegram chat ID to pass through to next step"),
    messageId: z
      .string()
      .optional()
      .describe("Original message ID to pass through to next step"),
    inline_keyboard: z
      .any()
      .optional()
      .describe("Inline keyboard markup for Telegram"),
    parse_mode: z
      .string()
      .optional()
      .describe("Parse mode for Telegram message"),
  }),

  execute: async ({ inputData, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info(
      "🤖 [VocabularyWorkflow] Starting command parser step with params:",
      {
        message: inputData.message,
        threadId: inputData.threadId,
        owner_id: inputData.owner_id,
      },
    );

    try {
      // Get any existing conversation state
      const existingState = await getConversationState(inputData.owner_id);

      // Process the command using the deterministic parser
      const result = await processCommand(
        inputData.message,
        inputData.owner_id,
        inputData.chatId,
        existingState,
        mastra,
      );

      // Save the new conversation state if changed
      if (result.conversationState !== existingState) {
        await saveConversationState(
          inputData.owner_id,
          result.conversationState,
        );
      }

      logger?.info("✅ [VocabularyWorkflow] Command parsed successfully:", {
        responseLength: result.response.length,
        hasState: !!result.conversationState,
        threadId: inputData.threadId,
        owner_id: inputData.owner_id,
      });

      return {
        response: result.response,
        chatId: inputData.chatId,
        messageId: inputData.messageId,
        inline_keyboard: result.inline_keyboard,
        parse_mode: result.parse_mode || "HTML",
      };
    } catch (error) {
      logger?.error("❌ [VocabularyWorkflow] Error processing command:", {
        error: error instanceof Error ? error.message : String(error),
        threadId: inputData.threadId,
        owner_id: inputData.owner_id,
      });

      // Return fallback response for error cases
      return {
        response:
          "❌ Error processing your command. Please try again or use /help for available commands.",
        chatId: inputData.chatId,
        messageId: inputData.messageId,
        parse_mode: "HTML",
      };
    }
  },
});

// Step 2: Send response to Telegram
export const sendTelegramResponseStep = createStep({
  id: "send-telegram-response",
  description: "Send the agent's response back to Telegram",
  inputSchema: z.object({
    response: z.string().describe("The response text to send"),
    chatId: z.string().describe("Telegram chat ID to send the message to"),
    messageId: z
      .string()
      .optional()
      .describe("Original message ID for replying"),
    inline_keyboard: z
      .any()
      .optional()
      .describe("Inline keyboard markup for Telegram"),
    parse_mode: z
      .string()
      .optional()
      .describe("Parse mode for Telegram message"),
  }),
  outputSchema: z.object({
    agentResponse: z.string().describe("The response text that was sent"),
    messageSent: z
      .boolean()
      .describe("Whether the message was sent successfully"),
    sentMessageId: z.string().optional().describe("ID of the sent message"),
  }),

  execute: async ({ inputData, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info(
      "📱 [VocabularyWorkflow] Starting Telegram message sending step with params:",
      {
        responseLength: inputData.response.length,
        chatId: inputData.chatId,
        messageId: inputData.messageId,
      },
    );

    try {
      // ONLY send the message to Telegram - NO other logic
      // Using basic HTTP API for Telegram messaging (token will be provided during deployment)
      const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

      if (!TELEGRAM_BOT_TOKEN) {
        logger?.warn(
          "⚠️ [VocabularyWorkflow] TELEGRAM_BOT_TOKEN not available, simulating send",
        );
        return {
          agentResponse: inputData.response,
          messageSent: true,
          sentMessageId: `simulated_${Date.now()}`,
        };
      }

      const telegramApiUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

      const body: any = {
        chat_id: inputData.chatId,
        text: inputData.response,
        reply_to_message_id: inputData.messageId,
        parse_mode: inputData.parse_mode || "HTML",
      };

      // Add inline keyboard if provided
      if (inputData.inline_keyboard) {
        body.reply_markup = inputData.inline_keyboard;
      }

      const response = await fetch(telegramApiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Telegram API error: ${response.status} - ${errorText}`,
        );
      }

      const result = await response.json();

      logger?.info(
        "✅ [VocabularyWorkflow] Message sent to Telegram successfully:",
        {
          chatId: inputData.chatId,
          sentMessageId: result.result?.message_id,
        },
      );

      return {
        agentResponse: inputData.response,
        messageSent: true,
        sentMessageId: result.result?.message_id?.toString(),
      };
    } catch (error) {
      logger?.error(
        "❌ [VocabularyWorkflow] Error sending message to Telegram:",
        {
          error: error instanceof Error ? error.message : String(error),
          chatId: inputData.chatId,
        },
      );

      return {
        agentResponse: inputData.response,
        messageSent: false,
      };
    }
  },
});

// Create the workflow with exactly 2 steps
export const vocabularyWorkflow = createWorkflow({
  id: "vocabulary-workflow",
  description:
    "Process vocabulary learning messages through command parser and send to Telegram",
  inputSchema: z.object({
    message: z.string().describe("The user's message content"),
    threadId: z
      .string()
      .describe("Unique thread identifier for conversation context"),
    owner_id: z
      .string()
      .describe("User ID for personalization and data access"),
    chatId: z.string().describe("Telegram chat ID to send the response to"),
    messageId: z
      .string()
      .optional()
      .describe("Original message ID for replying"),
  }),
  outputSchema: z.object({
    agentResponse: z.string().describe("The response generated by the parser"),
    messageSent: z
      .boolean()
      .describe("Whether the message was sent successfully"),
    sentMessageId: z.string().optional().describe("ID of the sent message"),
  }),
})
  .then(useCommandParserStep)
  .then(sendTelegramResponseStep)
  .commit();
