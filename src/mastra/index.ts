import "dotenv/config";
import { Mastra } from "@mastra/core";
import { MastraError } from "@mastra/core/error";
import { PinoLogger } from "@mastra/loggers";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";

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
  createPracticeNextHandler,
  createPracticeSubmitHandler,
} from "../server/routes/practice.js";
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

const practiceRoutesEnabled = process.env.WEBAPP_PRACTICE_ENABLED === "true";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let practiceDistDir: string | null = null;
let practiceIndexFile: string | null = null;

if (practiceRoutesEnabled) {
  const candidates = [
    path.resolve(__dirname, "../webapp/dist"),
    path.resolve(__dirname, "../../webapp/dist"),
    path.resolve(process.cwd(), "webapp/dist"),
  ];

  for (const candidate of candidates) {
    try {
      const stats = await fs.stat(candidate);
      if (stats.isDirectory()) {
        practiceDistDir = candidate;
        practiceIndexFile = path.join(candidate, "index.html");
        break;
      }
    } catch {
      // ignore missing candidates
    }
  }

  if (!practiceDistDir) {
    console.warn(
      "⚠️ [Practice WebApp] Unable to locate built assets. Run `npm run build:webapp` before serving static files.",
    );
  }
}

const practiceStaticMiddleware = practiceRoutesEnabled
  ? createPracticeStaticMiddleware(practiceDistDir, practiceIndexFile)
  : null;

const telegramOriginPatterns = [
  /^https:\/\/[a-z0-9.-]+\.telegram\.org$/i,
  /^https:\/\/telegram\.org$/i,
  /^https:\/\/t\.me$/i,
  /^https:\/\/web\.telegram\.org$/i,
  /^https:\/\/appassets\.androidplatform\.net$/i,
  /^https:\/\/[a-z0-9.-]+\.telegram-cdn\.org$/i,
];

const publicWebAppOrigin = (() => {
  if (!process.env.PUBLIC_WEBAPP_URL) return undefined;
  try {
    return new URL(process.env.PUBLIC_WEBAPP_URL).origin;
  } catch {
    return undefined;
  }
})();

function isAllowedOrigin(origin?: string | null): boolean {
  if (!origin) return false;
  if (publicWebAppOrigin && origin === publicWebAppOrigin) {
    return true;
  }
  if (origin.startsWith("http://localhost") || origin.startsWith("http://127.0.0.1")) {
    return true;
  }
  return telegramOriginPatterns.some((pattern) => pattern.test(origin));
}

const STATIC_MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".webmanifest": "application/manifest+json",
};

function createPracticeStaticMiddleware(
  distDir: string | null,
  indexFile: string | null,
) {
  if (!distDir || !indexFile) {
    return async (_ctx: any, next: () => Promise<void>) => {
      await next();
    };
  }

  const normalizedDist = path.resolve(distDir);
  const fallbackIndex = path.resolve(indexFile);

  return async (ctx: any, next: () => Promise<void>) => {
    const method = ctx.req.method?.toUpperCase?.() ?? ctx.req.method;
    if (method !== "GET" && method !== "HEAD") {
      await next();
      return;
    }

    let pathname: string;
    try {
      pathname = new URL(ctx.req.url).pathname;
    } catch {
      await next();
      return;
    }

    if (!pathname.startsWith("/practice")) {
      await next();
      return;
    }

    let relativePath = pathname.slice("/practice".length);
    if (relativePath.startsWith("/")) {
      relativePath = relativePath.slice(1);
    }

    try {
      relativePath = decodeURIComponent(relativePath);
    } catch {
      return ctx.newResponse("Bad Request", { status: 400 });
    }

    let targetPath = fallbackIndex;
    if (relativePath.length > 0) {
      const resolvedCandidate = path.resolve(normalizedDist, relativePath);
      const relativeToDist = path.relative(normalizedDist, resolvedCandidate);
      if (relativeToDist.startsWith("..") || path.isAbsolute(relativeToDist)) {
        return ctx.newResponse("Not Found", { status: 404 });
      }

      try {
        const stats = await fs.stat(resolvedCandidate);
        if (stats.isDirectory()) {
          targetPath = path.join(resolvedCandidate, "index.html");
        } else {
          targetPath = resolvedCandidate;
        }
      } catch {
        targetPath = fallbackIndex;
      }
    }

    try {
      const file = await fs.readFile(targetPath);
      const ext = path.extname(targetPath).toLowerCase();
      const headers = new Headers();
      headers.set(
        "Content-Type",
        STATIC_MIME_TYPES[ext] || "application/octet-stream",
      );
      if (ext === ".html") {
        headers.set("Cache-Control", "no-cache");
      } else {
        headers.set("Cache-Control", "public, max-age=31536000, immutable");
      }

      if (method === "HEAD") {
        return ctx.newResponse(null, { status: 200, headers });
      }

      return ctx.newResponse(file, { status: 200, headers });
    } catch {
      await next();
    }
  };
}

const corsMiddleware = async (c: any, next: () => Promise<void>) => {
  const origin = c.req.header("origin");
  const allowed = isAllowedOrigin(origin);

  const appendVaryOrigin = () => {
    const current = c.res.headers.get("Vary");
    if (!current) {
      c.res.headers.set("Vary", "Origin");
      return;
    }
    const values = current
      .split(",")
      .map((value: string) => value.trim().toLowerCase());
    if (!values.includes("origin")) {
      c.res.headers.set("Vary", `${current}, Origin`);
    }
  };

  if (c.req.method === "OPTIONS") {
    if (allowed && origin) {
      c.res.headers.set("Access-Control-Allow-Origin", origin);
    }
    if (origin) {
      appendVaryOrigin();
    }
    c.res.headers.set(
      "Access-Control-Allow-Headers",
      "Content-Type, X-Telegram-Init-Data",
    );
    c.res.headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    c.res.headers.set("Access-Control-Max-Age", "86400");
    return c.text("", 204);
  }

  await next();

  if (allowed && origin) {
    c.res.headers.set("Access-Control-Allow-Origin", origin);
  }
  if (origin) {
    appendVaryOrigin();
    c.res.headers.set(
      "Access-Control-Allow-Headers",
      "Content-Type, X-Telegram-Init-Data",
    );
  }
};

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
      corsMiddleware,
      ...(practiceStaticMiddleware ? [practiceStaticMiddleware] : []),
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
        method: "GET" as const,
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
        method: "POST" as const,
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
      ...(practiceRoutesEnabled
        ? [
            {
              path: "/api/practice/next",
              method: "GET" as const,
              createHandler: async ({ mastra }) =>
                createPracticeNextHandler(mastra),
            },
            {
              path: "/api/practice/submit",
              method: "POST" as const,
              createHandler: async ({ mastra }) =>
                createPracticeSubmitHandler(mastra),
            },
          ]
        : []),
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

if (process.env.REMINDERS_ENABLED === "true") {
  reminderWorkflow.__registerMastra(mastra);
  registerCronWorkflow("*/30 * * * *", reminderWorkflow);
}

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
