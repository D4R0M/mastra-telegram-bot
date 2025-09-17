import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { requireTelegramWebAppAuth } from "../webappInit.js";
import { buildToolExecCtx } from "../../mastra/context.js";
import {
  getDueCardsTool,
  startReviewTool,
  submitReviewTool,
} from "../../mastra/tools/reviewTools.js";
import { getDueCardsStatsTool } from "../../mastra/tools/statisticsTools.js";
import { logReviewEvent } from "../../lib/mlLogger.js";
import { hashUserId } from "../../lib/mlPrivacy.js";
import type { Sm2Snapshot } from "../../types/ml.js";

type Handler = (c: any) => Promise<any>;

type PracticeWebAppHandlerOptions = {
  distPath?: string;
};

const DEFAULT_PRACTICE_DIST = path.resolve(process.cwd(), "webapp", "dist");

const MIME_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stats = await stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}

function isWithinDir(dir: string, target: string): boolean {
  const relative = path.relative(dir, target);
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}

function cacheControlForExt(ext: string): string {
  if (ext === ".html") {
    return "no-cache";
  }
  if (ext === ".map") {
    return "no-store";
  }
  return "public, max-age=31536000, immutable";
}


function toNonNegativeInt(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const int = Math.max(0, Math.floor(parsed));
  return Number.isFinite(int) ? int : null;
}

function parseSm2SnapshotPayload(raw: unknown): Sm2Snapshot | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const data = raw as Record<string, unknown>;
  const interval = Number(data.interval);
  const ease = Number(data.ease);
  const reps = Number(data.reps);
  if (!Number.isFinite(interval) || !Number.isFinite(ease) || !Number.isFinite(reps)) {
    return null;
  }
  const snapshot: Sm2Snapshot = {
    interval: Math.max(0, Math.round(interval)),
    ease,
    reps: Math.max(0, Math.round(reps)),
    due_at: typeof data.due_at === "string" ? data.due_at : null,
  };
  return snapshot;
}

function resolvePracticeSource(c: any, explicit?: unknown): string | undefined {
  if (typeof explicit === "string" && explicit.trim().length > 0) {
    return explicit;
  }
  let querySource: string | undefined;
  try {
    querySource = typeof c.req?.query === "function" ? c.req.query("source") : undefined;
  } catch {
    querySource = undefined;
  }
  if (querySource && querySource.trim().length > 0) {
    return querySource;
  }
  try {
    const url = new URL(c.req.url);
    const sessionParam = url.searchParams.get("session");
    if (sessionParam && sessionParam.trim().length > 0) {
      return sessionParam;
    }
  } catch {
    // ignore
  }
  return undefined;
}

export function createPracticeWebAppHandler(
  options: PracticeWebAppHandlerOptions = {},
): Handler {
  const distRoot = path.resolve(options.distPath ?? DEFAULT_PRACTICE_DIST);
  const indexPath = path.join(distRoot, "index.html");

  return async (c) => {
    const logger = c?.get?.("mastra")?.getLogger?.();

    if (!(await fileExists(indexPath))) {
      logger?.error?.("practice_webapp_missing_assets", {
        indexPath,
      });
      return c.text(
        "Practice WebApp assets missing. Build the webapp with `npm --prefix webapp run build` before deploying.",
        503,
      );
    }

    const requestUrl = new URL(c.req.url);
    const incomingPath =
      typeof c.req?.path === "string" && c.req.path.length > 0
        ? c.req.path
        : requestUrl.pathname;

    if (!incomingPath.startsWith("/practice")) {
      return c.text("Not found", 404);
    }

    let relativePath = incomingPath.replace(/^\/practice/, "");
    if (!relativePath || relativePath === "/") {
      relativePath = "/index.html";
    }

    const strippedRelative = relativePath.startsWith("/")
      ? relativePath.slice(1)
      : relativePath;
    let candidatePath = path.resolve(distRoot, strippedRelative);

    const within = isWithinDir(distRoot, candidatePath);
    if (!within) {
      return c.text("Not found", 404);
    }

    let servePath = candidatePath;
    let stats;
    try {
      stats = await stat(candidatePath);
    } catch (error) {
      if (strippedRelative.startsWith("assets/")) {
        logger?.warn?.("practice_webapp_asset_missing", {
          asset: strippedRelative,
          error: error instanceof Error ? error.message : String(error),
        });
        return c.text("Not found", 404);
      }
      servePath = indexPath;
    }

    if (stats?.isDirectory()) {
      servePath = indexPath;
    }

    try {
      const data = await readFile(servePath);
      const ext = path.extname(servePath).toLowerCase() || ".html";
      const headers: Record<string, string> = {
        "Content-Type": MIME_TYPES[ext] ?? "application/octet-stream",
        "Cache-Control": cacheControlForExt(ext),
      };
      return c.body(data, 200, headers);
    } catch (error) {
      logger?.error?.("practice_webapp_serve_failed", {
        path: servePath,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.text("Practice WebApp unavailable", 500);
    }
  };
}

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const SUBMIT_WINDOW_MS = 60_000;
const SUBMIT_LIMIT = 10;
const submitBuckets = new Map<string, RateLimitBucket>();

function takeRateLimitToken(key: string): boolean {
  const now = Date.now();
  const bucket = submitBuckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    submitBuckets.set(key, { count: 1, resetAt: now + SUBMIT_WINDOW_MS });
    return true;
  }

  if (bucket.count >= SUBMIT_LIMIT) {
    return false;
  }

  bucket.count += 1;
  return true;
}

const QUALITY_TO_GRADE: Record<string, number> = {
  again: 0,
  forgot: 0,
  wrong: 1,
  hard: 3,
  difficult: 3,
  good: 4,
  easy: 5,
  "0": 0,
  "1": 0,
  "2": 3,
  "3": 4,
  "4": 5,
  "5": 5,
};

function parseGrade(value: unknown): number | undefined {
  if (typeof value === "number") {
    if (Number.isInteger(value) && value >= 0 && value <= 5) {
      return value;
    }
    return undefined;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return undefined;
    }
    const parsed = Number(trimmed);
    if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 5) {
      return parsed;
    }
  }
  return undefined;
}

function resolveGrade(quality: unknown): number | undefined {
  if (typeof quality === "number") {
    return parseGrade(quality);
  }
  if (typeof quality === "string") {
    const normalized = quality.trim().toLowerCase();
    if (normalized.length === 0) {
      return undefined;
    }
    return QUALITY_TO_GRADE[normalized];
  }
  return undefined;
}

const DEFAULT_TIMEZONE = "Europe/Stockholm";

async function fetchDueCount(mastra: any, userId: number): Promise<number> {
  try {
    const { runtimeContext, tracingContext } = buildToolExecCtx(mastra, {
      requestId: userId,
      spanName: "practice_due_count",
    });
    const result = await getDueCardsStatsTool.execute({
      context: { owner_id: userId, timezone: DEFAULT_TIMEZONE },
      runtimeContext,
      tracingContext,
      mastra,
    });

    if (result.success) {
      const rawDue = Number(result.stats?.due_cards ?? 0);
      return Number.isFinite(rawDue) ? rawDue : 0;
    }

    mastra?.getLogger?.()?.warn("practice_due_count_failed", {
      user_id: userId,
      message: result.message,
    });
  } catch (error) {
    mastra?.getLogger?.()?.warn("practice_due_count_failed", {
      user_id: userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return 0;
}


export function createPracticeNextHandler(mastra: any): Handler {
  return requireTelegramWebAppAuth(async (c, auth) => {
    const logger = mastra?.getLogger?.();
    const userId = auth.tgUser.id;
    const requestId = `${userId}`;
    const sessionId =
      c.req.query("sessionId") || `practice_${userId}_${Date.now()}`;
    const sourceKey = resolvePracticeSource(c);
    try {
      const { runtimeContext, tracingContext } = buildToolExecCtx(mastra, {
        requestId,
        spanName: "practice_next",
      });

      const dueResult = await getDueCardsTool.execute({
        context: { owner_id: userId, limit: 1, include_new: true },
        runtimeContext,
        tracingContext,
        mastra,
      });

      if (!dueResult.success || !dueResult.cards?.length) {
        const dueCount = await fetchDueCount(mastra, userId);
        return c.json(
          {
            done: true,
            dueCount,
            source: sourceKey,
            sessionId,
            serverTime: Date.now(),
          },
          200,
        );
      }

      const cardInfo = dueResult.cards[0];

      const { runtimeContext: startRuntime, tracingContext: startTracing } =
        buildToolExecCtx(mastra, { requestId, spanName: "practice_start" });

      const startResult = await startReviewTool.execute({
        context: {
          owner_id: userId,
          card_id: cardInfo.card_id,
          session_id: sessionId,
        },
        runtimeContext: startRuntime,
        tracingContext: startTracing,
        mastra,
      });

      if (!startResult.success || !startResult.card) {
        logger?.error("practice_start_failed", {
          user_id: userId,
          card_id: cardInfo.card_id,
          message: startResult.message,
        });
        return c.json(
          { error: startResult.message || "Unable to start practice" },
          500,
        );
      }

      const sm2Before = startResult.sm2 ?? null;

      await logReviewEvent({
        mode: "webapp_practice",
        action: "presented",
        session_id: sessionId,
        attempt: 0,
        hint_count: 0,
        latency_ms: 0,
        userId,
        card_id: startResult.card.id,
        sm2_before: sm2Before,
        client: "miniapp",
        source: sourceKey,
        logger,
      });

      const dueCount = await fetchDueCount(mastra, userId);

      return c.json(
        {
          sessionId,
          source: sourceKey,
          card: {
            id: startResult.card.id,
            front: startResult.card.front,
            back: startResult.card.back,
            example: startResult.card.example,
            tags: startResult.card.tags,
            langFront: startResult.card.lang_front,
            langBack: startResult.card.lang_back,
            queue: startResult.card.queue,
            repetitions: startResult.card.repetitions,
            easeFactor: startResult.card.ease_factor,
            lapses: startResult.card.lapses,
          },
          startTime: startResult.start_time,
          sm2Before,
          dueCount,
          serverTime: Date.now(),
          user: {
            id: userId,
            username: auth.tgUser.username,
            firstName: auth.tgUser.first_name,
          },
        },
        200,
      );
    } catch (error) {
      logger?.warn("practice_next_error", {
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json({ error: "Practice failed" }, 500);
    }
  });
}

export function createPracticeSubmitHandler(mastra: any): Handler {
  return requireTelegramWebAppAuth(async (c, auth) => {
    const logger = mastra?.getLogger?.();
    const receivedAt = Date.now();
    const userId = auth.tgUser.id;
    const userKey = String(userId);

    try {
      if (!takeRateLimitToken(userKey)) {
        return c.json({ error: "Too many submissions" }, 429);
      }

      const payload = await c.req.json();
      const cardId = payload?.cardId;
      const gradeValue = parseGrade(payload?.grade);
      const quality = payload?.quality;
      const elapsedMs = Number(payload?.elapsedMs ?? 0);
      const clientTs = Number(payload?.clientTs ?? 0);
      const sessionId = payload?.sessionId as string | undefined;
        const attemptValue = toNonNegativeInt(payload?.attempt);
        const hintCountValue = toNonNegativeInt(payload?.hintCount);
        const answerText = typeof payload?.answerText === "string"
          ? payload.answerText
          : undefined;
        const sm2BeforePayload = parseSm2SnapshotPayload(payload?.sm2Before);
        const sourceKey = resolvePracticeSource(c, payload?.source);
        const answeredAlready = payload?.answeredLogged === true;

      if (!cardId || typeof cardId !== "string") {
        return c.json({ error: "cardId required" }, 400);
      }

      const grade = gradeValue ?? resolveGrade(quality);
      if (grade === undefined) {
        return c.json({ error: "Invalid grade" }, 400);
      }

      const safeElapsed = Number.isFinite(elapsedMs) ? elapsedMs : 0;
      const startTime = Math.max(receivedAt - Math.max(safeElapsed, 0), 0);
        const sessionIdentifier = sessionId ?? `practice_${userId}`;

      const { runtimeContext, tracingContext } = buildToolExecCtx(mastra, {
        requestId: userKey,
        spanName: "practice_submit",
      });

        if (!answeredAlready) {
          await logReviewEvent({
            mode: "webapp_practice",
            action: "answered",
            session_id: sessionIdentifier,
            attempt: attemptValue ?? null,
            hint_count: hintCountValue ?? null,
            latency_ms: safeElapsed,
            userId,
            card_id: cardId,
            answer_text: answerText ?? null,
            sm2_before: sm2BeforePayload,
            client: "miniapp",
            source: sourceKey,
            logger,
          });
        }

        const submitResult = await submitReviewTool.execute({
          context: {
            owner_id: userId,
            card_id: cardId,
            grade,
            start_time: startTime,
            session_id: sessionIdentifier,
            mode: "webapp_practice",
            client: "miniapp",
            source: sourceKey ?? undefined,
            attempt: attemptValue ?? undefined,
            hint_count: hintCountValue ?? undefined,
            answer_text: answerText,
            log_answer_event: false,
          },
          runtimeContext,
          tracingContext,
          mastra,
        });

      if (!submitResult.success) {
        logger?.warn("practice_submit_failed", {
          user_id: userId,
          card_id: cardId,
          message: submitResult.message,
        });
        return c.json({ error: submitResult.message }, 400);
      }

      const remainingDue = await fetchDueCount(mastra, userId);
      const latency = submitResult.review_result?.latency_ms ?? safeElapsed;
      const clockSkew = Number.isFinite(clientTs)
        ? clientTs - receivedAt
        : undefined;

      let hashedUser: string | undefined;
      try {
        hashedUser = hashUserId(userId);
      } catch {
        hashedUser = undefined;
      }
      logger?.info("practice_submit_recorded", {
        user_hash: hashedUser ?? null,
        card_id: cardId,
        session_id: sessionIdentifier,
        grade,
        latency_ms: latency,
        clock_skew_ms: clockSkew,
        prev_ease: submitResult.review_result?.previous_ease,
        new_ease: submitResult.review_result?.new_ease,
        prev_interval: submitResult.review_result?.previous_interval,
        new_interval: submitResult.review_result?.new_interval,
        prev_repetitions: submitResult.review_result?.previous_repetitions,
        new_repetitions: submitResult.review_result?.new_repetitions,
        remaining_due: remainingDue,
        source: sourceKey ?? null,
      });

      return c.json(
        {
          remainingDue,
          cardId,
          review: submitResult.review_result,
        },
        200,
      );
    } catch (error) {
      logger?.warn("practice_submit_error", {
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json({ error: "Submit failed" }, 500);
    }
  });
}

export function createPracticeHintHandler(mastra: any): Handler {
  return requireTelegramWebAppAuth(async (c, auth) => {
    const logger = mastra?.getLogger?.();
    try {
      const payload = await c.req.json();
      const cardId = typeof payload?.cardId === "string" ? payload.cardId : undefined;
      const sessionId = typeof payload?.sessionId === "string" ? payload.sessionId : undefined;
      if (!cardId || !sessionId) {
        return c.json({ error: "cardId and sessionId required" }, 400);
      }

      const attemptValue = toNonNegativeInt(payload?.attempt);
      const hintCountValue = toNonNegativeInt(payload?.hintCount);
      const elapsedRaw = Number(payload?.elapsedMs);
      const latencyMs = Number.isFinite(elapsedRaw)
        ? Math.max(0, Math.floor(elapsedRaw))
        : null;
      const sm2Before = parseSm2SnapshotPayload(payload?.sm2Before);
      const sourceKey = resolvePracticeSource(c, payload?.source);

      await logReviewEvent({
        mode: "webapp_practice",
        action: "hint_shown",
        session_id: sessionId,
        attempt: attemptValue ?? null,
        hint_count: hintCountValue ?? null,
        latency_ms: latencyMs,
        userId: auth.tgUser.id,
        card_id: cardId,
        sm2_before: sm2Before,
        client: "miniapp",
        source: sourceKey,
        logger,
      });

      return c.json({ ok: true }, 200);
    } catch (error) {
      logger?.warn("practice_hint_error", {
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json({ error: "Hint failed" }, 500);
    }
  });
}

export function __resetPracticeRateLimit() {
  submitBuckets.clear();
}
