import "dotenv/config";
import { Mastra } from "@mastra/core";
import { MastraError } from "@mastra/core/error";
import { PinoLogger } from "@mastra/loggers";

// Production startup validation for required environment variables
if (process.env.NODE_ENV === "production") {
  // Fail fast if Telegram token missing when webhooks enabled
  if (process.env.USE_POLLING !== "true" && !process.env.TELEGRAM_BOT_TOKEN) {
    console.error(
      "❌ TELEGRAM_BOT_TOKEN is required in production when using webhooks",
    );
    process.exit(1);
  }
}
import { LogLevel, MastraLogger } from "@mastra/core/logger";
import pino from "pino";
import { MCPServer } from "@mastra/mcp";
import { NonRetriableError } from "inngest";
import { z } from "zod";

import { sharedPostgresStorage } from "./storage";
import { inngest, inngestServe, registerCronWorkflow } from "./inngest";
import { runMigrations } from "../db/migrate.js";
import { processTelegramUpdate } from "./telegram.js";
import {
  addCardTool,
  listCardsTool,
  editCardTool,
  deleteCardTool,
} from "./tools/vocabularyTools.js";
import {
  getDueCardsTool,
  startReviewTool,
  submitReviewTool,
} from "./tools/reviewTools.js";
import {
  getReminderSettingsTool,
  updateReminderSettingsTool,
  checkReminderTimeTool,
  recordReminderSentTool,
} from "./tools/reminderTools.js";
import {
  importCSVTool,
  exportCSVTool,
  previewCSVTool,
} from "./tools/importExportTools.js";
import {
  getUserSettingsTool,
  updateSessionSettingsTool,
  updateAlgorithmSettingsTool,
  updateReminderSettingsAdvancedTool,
  resetSettingsTool,
} from "./tools/settingsTools.js";
import {
  getDueCardsStatsTool,
  getRetentionStatsTool,
  getStreakStatsTool,
  getEaseHistogramTool,
  getComprehensiveStatsTool,
} from "./tools/statisticsTools.js";
import { vocabularyWorkflow } from "./workflows/vocabularyWorkflow.js";
import { reminderWorkflow } from "./workflows/reminderWorkflow.js";

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
    info: (msg: string, data?: any) =>
      console.log("🔧 [DB Migration]", msg, data ? JSON.stringify(data) : ""),
    error: (msg: string, data?: any) =>
      console.error("🔥 [DB Migration]", msg, data ? JSON.stringify(data) : ""),
  });
  console.log("✅ [DB Migration] Database migrations completed successfully");
} else {
  console.warn("⚠️ [DB Migration] DATABASE_URL not set, skipping migrations");
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
            if (!process.env.TELEGRAM_BOT_TOKEN) {
              logger?.error("❌ [Telegram] TELEGRAM_BOT_TOKEN missing");
              return c.text("Configuration Error", 500);
            }

            const start = Date.now();
            let payload: any;
            try {
              payload = await c.req.json();
            } catch {
              return c.text("Bad Request", 400);
            }

            const updateId = payload?.update_id;
            logger?.info("received_webhook", {
              update_id: updateId,
              ts: start,
            });

            setImmediate(async () => {
              try {
                await processTelegramUpdate(payload, mastra, start);
              } catch (error) {
                logger?.error("process_error", {
                  update_id: updateId,
                  error: error instanceof Error ? error.message : String(error),
                });
              }
            });

            logger?.info("ack_sent", {
              update_id: updateId,
              ms: Date.now() - start,
            });
            return c.text("OK", 200);
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

reminderWorkflow.__registerMastra(mastra);
registerCronWorkflow("*/30 * * * *", reminderWorkflow);

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
