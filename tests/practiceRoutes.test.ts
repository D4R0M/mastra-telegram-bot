import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import crypto from "crypto";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const mocks = vi.hoisted(() => ({
  getDueCardsExecute: vi.fn(),
  startReviewExecute: vi.fn(),
  submitReviewExecute: vi.fn(),
  dueStatsExecute: vi.fn(),
}));

vi.mock("../src/mastra/context.js", () => ({
  buildToolExecCtx: vi.fn(() => ({ runtimeContext: {}, tracingContext: {} })),
}));

vi.mock("../src/mastra/tools/reviewTools.js", () => ({
  getDueCardsTool: { execute: mocks.getDueCardsExecute },
  startReviewTool: { execute: mocks.startReviewExecute },
  submitReviewTool: { execute: mocks.submitReviewExecute },
}));

vi.mock("../src/mastra/tools/statisticsTools.js", () => ({
  getDueCardsStatsTool: { execute: mocks.dueStatsExecute },
}));

import {
  createPracticeNextHandler,
  createPracticeSubmitHandler,
  createPracticeWebAppHandler,
  __resetPracticeRateLimit,
} from "../src/server/routes/practice.ts";

const BOT_TOKEN = "123456:ABCDEF";
const BOT_ID = BOT_TOKEN.split(":")[0];

beforeEach(() => {
  process.env.ML_HASH_SALT = "test-salt";
});

afterEach(() => {
  delete process.env.ML_HASH_SALT;
});

function signedInitData(user: { id: number; username?: string; first_name?: string }) {
  const authDate = Math.floor(Date.now() / 1000);
  const params = new URLSearchParams({
    auth_date: String(authDate),
    user: JSON.stringify(user),
  });
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = crypto
    .createHmac("sha256", "WebAppData")
    .update(BOT_TOKEN)
    .digest();
  const hash = crypto
    .createHmac("sha256", secret)
    .update(dataCheckString)
    .digest("hex");
  params.set("hash", hash);
  return params.toString();
}

function createMockContext({
  method = "GET",
  headers = {},
  query = {},
  body,
  url = "http://localhost/test",
  pathname,
}: {
  method?: string;
  headers?: Record<string, string>;
  query?: Record<string, string | undefined>;
  body?: any;
  url?: string;
  pathname?: string;
} = {}) {
  const normalizedHeaders = new Map<string, string>();
  Object.entries(headers).forEach(([key, value]) => {
    if (value !== undefined) {
      normalizedHeaders.set(key.toLowerCase(), value);
    }
  });
  const responseHeaders = new Map<string, string>();
  let statusCode = 200;

  let derivedPath = pathname;
  if (!derivedPath) {
    try {
      derivedPath = new URL(url).pathname;
    } catch {
      derivedPath = "/";
    }
  }

  const send = (
    payload: any,
    code: number,
    extraHeaders: Record<string, string> = {},
  ) => {
    statusCode = code;
    Object.entries(extraHeaders).forEach(([key, value]) => {
      responseHeaders.set(key, value);
    });
    return {
      status: code,
      body: payload,
      headers: Object.fromEntries(responseHeaders),
    };
  };

  return {
    req: {
      method,
      url,
      path: derivedPath,
      header: (name: string) => normalizedHeaders.get(name.toLowerCase()) ?? null,
      query: (name: string) => query[name],
      json: async () => body,
    },
    res: {
      headers: {
        set: (key: string, value: string) => {
          responseHeaders.set(key, value);
        },
        get: (key: string) => responseHeaders.get(key) ?? null,
      },
    },
    get: () => undefined,
    status(code: number) {
      statusCode = code;
      return {
        json(payload: any) {
          return send(payload, code);
        },
      };
    },
    json(payload: any, code = statusCode) {
      return send(payload, code);
    },
    text(payload: string, code = statusCode) {
      return send(payload, code, {
        "Content-Type": "text/plain; charset=utf-8",
      });
    },
    body(payload: any, code = statusCode, extraHeaders: Record<string, string> = {}) {
      return send(payload, code, extraHeaders);
    },
  };
}

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

const mastra = {
  getLogger: () => logger,
};

beforeEach(() => {
  vi.resetAllMocks();
  __resetPracticeRateLimit();
  process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN;
});

describe("practice webapp handler", () => {
  it("returns 503 when webapp assets are missing", async () => {
    const handler = createPracticeWebAppHandler({
      distPath: path.join(os.tmpdir(), `missing-${Date.now()}`),
    });

    const response = await handler(
      createMockContext({ url: "http://localhost/practice" }),
    );

    expect(response.status).toBe(503);
    expect(String(response.body)).toContain("Practice WebApp assets missing");
  });

  it("serves index html and static assets", async () => {
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), "practice-webapp-"));
    try {
      const assetsDir = path.join(tmpDir, "assets");
      mkdirSync(assetsDir);
      const indexHtml = "<!doctype html><html><body>Practice Ready</body></html>";
      writeFileSync(path.join(tmpDir, "index.html"), indexHtml);
      writeFileSync(path.join(assetsDir, "main.js"), "console.log('asset');");

      const handler = createPracticeWebAppHandler({ distPath: tmpDir });

      const indexResponse = await handler(
        createMockContext({ url: "http://localhost/practice?session=practice" }),
      );
      expect(indexResponse.status).toBe(200);
      expect(indexResponse.headers["Content-Type"]).toContain("text/html");
      expect(indexResponse.headers["Cache-Control"]).toBe("no-cache");
      expect(indexResponse.body.toString()).toContain("Practice Ready");

      const assetResponse = await handler(
        createMockContext({ url: "http://localhost/practice/assets/main.js" }),
      );
      expect(assetResponse.status).toBe(200);
      expect(assetResponse.headers["Content-Type"]).toContain("javascript");
      expect(assetResponse.headers["Cache-Control"]).toContain("immutable");
      expect(assetResponse.body.toString()).toContain("asset");

      const missingAsset = await handler(
        createMockContext({ url: "http://localhost/practice/assets/missing.js" }),
      );
      expect(missingAsset.status).toBe(404);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("rejects paths outside the dist directory", async () => {
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), "practice-webapp-"));
    try {
      writeFileSync(path.join(tmpDir, "index.html"), "<html></html>");
      const handler = createPracticeWebAppHandler({ distPath: tmpDir });

      const response = await handler(
        createMockContext({
          url: "http://localhost/practice/../secret",
          pathname: "/practice/../secret",
        }),
      );
      expect(response.status).toBe(404);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("practice routes", () => {
  it("rejects requests with invalid init data", async () => {
    const handler = createPracticeNextHandler(mastra);
    const response = await handler(createMockContext());

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "unauthorized" });
  });

  it("serves next card and records submissions", async () => {
    const userId = 101;
    const initData = signedInitData({ id: userId, username: "tester" });

    mocks.getDueCardsExecute.mockResolvedValueOnce({
      success: true,
      cards: [
        {
          card_id: "card-1",
          front: "Bonjour",
          back: "Hello",
          example: "Bonjour, comment ça va?",
          tags: ["greeting"],
          queue: "review",
          repetitions: 2,
          ease_factor: 2.5,
          lapses: 0,
        },
      ],
    });
    mocks.startReviewExecute.mockResolvedValueOnce({
      success: true,
      card: {
        id: "card-1",
        front: "Bonjour",
        back: "Hello",
        example: "Bonjour, comment ça va?",
        tags: ["greeting"],
        lang_front: "fr",
        lang_back: "en",
        queue: "review",
        repetitions: 2,
        ease_factor: 2.5,
        lapses: 0,
      },
      start_time: 1700000000,
    });
    mocks.dueStatsExecute
      .mockResolvedValueOnce({ success: true, stats: { due_cards: 5 } })
      .mockResolvedValueOnce({ success: true, stats: { due_cards: 4 } });

    const nextHandler = createPracticeNextHandler(mastra);
    const nextResponse = await nextHandler(
      createMockContext({
        headers: { "x-telegram-init-data": initData },
        query: {},
      }),
    );

    expect(nextResponse.status).toBe(200);
    expect(nextResponse.body.card.front).toBe("Bonjour");
    expect(nextResponse.body.user.id).toBe(userId);
    expect(nextResponse.body.dueCount).toBe(5);

    mocks.submitReviewExecute.mockResolvedValueOnce({
      success: true,
      review_result: {
        previous_ease: 2.5,
        new_ease: 2.6,
        previous_interval: 1,
        new_interval: 2,
        previous_repetitions: 2,
        new_repetitions: 3,
        latency_ms: 900,
      },
    });

    const submitHandler = createPracticeSubmitHandler(mastra);
    const submitResponse = await submitHandler(
      createMockContext({
        method: "POST",
        headers: { "x-telegram-init-data": initData },
        body: {
          sessionId: nextResponse.body.sessionId,
          cardId: "card-1",
          quality: "good",
          elapsedMs: 8000,
          clientTs: Date.now(),
        },
      }),
    );

    expect(submitResponse.status).toBe(200);
    expect(submitResponse.body.remainingDue).toBe(4);
    expect(mocks.submitReviewExecute).toHaveBeenCalledWith({
      context: expect.objectContaining({
        owner_id: userId,
        card_id: "card-1",
        grade: 4,
      }),
      runtimeContext: expect.any(Object),
      tracingContext: expect.any(Object),
      mastra,
    });
    expect(logger.info).toHaveBeenCalledWith(
      "practice_submit_recorded",
      expect.objectContaining({
        user_hash: crypto
          .createHash("sha256")
          .update(`test-salt:${userId}`)
          .digest("hex"),
        remaining_due: 4,
        source: null,
      }),
    );
  });
});
