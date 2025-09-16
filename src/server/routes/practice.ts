import { createHash } from "crypto";
import { requireTelegramWebAppAuth } from "../webappInit.js";
import { buildToolExecCtx } from "../../mastra/context.js";
import type { ID } from "../../types/ids.js";
import {
  getDueCardsTool,
  startReviewTool,
  submitReviewTool,
} from "../../mastra/tools/reviewTools.js";
import { getDueCardsStatsTool } from "../../mastra/tools/statisticsTools.js";

type Handler = (c: any) => Promise<any>;

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

function computeUserHash(botId: string | undefined, userId: ID) {
  const prefix = botId && botId.length > 0 ? botId : "bot";
  return createHash("sha256")
    .update(`${prefix}:${userId}`)
    .digest("hex");
}

const botId = process.env.TELEGRAM_BOT_TOKEN?.split(":")[0];

const QUALITY_TO_GRADE: Record<string, number> = {
  again: 0,
  hard: 3,
  good: 4,
  easy: 5,
  "1": 0,
  "2": 3,
  "3": 4,
  "4": 5,
};

function resolveGrade(quality: unknown): number | undefined {
  if (typeof quality === "number") {
    return QUALITY_TO_GRADE[String(quality)];
  }
  if (typeof quality === "string") {
    return QUALITY_TO_GRADE[quality.toLowerCase()];
  }
  return undefined;
}

async function fetchDueCount(
  mastra: any,
  userId: ID,
): Promise<number> {
  try {
    const { runtimeContext, tracingContext } = buildToolExecCtx(mastra, {
      requestId: userId,
      spanName: "practice_due_stats",
    });
    const stats = await getDueCardsStatsTool.execute({
      context: { owner_id: userId, timezone: "UTC" },
      runtimeContext,
      tracingContext,
      mastra,
    });
    if (stats.success) {
      return stats.stats.due_cards;
    }
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
    const userId: ID = String(auth.tgUser.id);
    const requestId = `${userId}`;
    const sessionId =
      c.req.query("sessionId") || `practice_${userId}_${Date.now()}`;

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

      const dueCount = await fetchDueCount(mastra, userId);

      return c.json(
        {
          sessionId,
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
    const userId: ID = String(auth.tgUser.id);
    const userKey = String(userId);

    try {
      if (!takeRateLimitToken(userKey)) {
        return c.json({ error: "Too many submissions" }, 429);
      }

      const payload = await c.req.json();
      const cardId = payload?.cardId;
      const quality = payload?.quality;
      const elapsedMs = Number(payload?.elapsedMs ?? 0);
      const clientTs = Number(payload?.clientTs ?? 0);
      const sessionId = payload?.sessionId as string | undefined;

      if (!cardId || typeof cardId !== "string") {
        return c.json({ error: "cardId required" }, 400);
      }

      const grade = resolveGrade(quality);
      if (grade === undefined) {
        return c.json({ error: "Invalid quality" }, 400);
      }

      const safeElapsed = Number.isFinite(elapsedMs) ? elapsedMs : 0;
      const startTime = Math.max(receivedAt - Math.max(safeElapsed, 0), 0);

      const { runtimeContext, tracingContext } = buildToolExecCtx(mastra, {
        requestId: userKey,
        spanName: "practice_submit",
      });

      const submitResult = await submitReviewTool.execute({
        context: {
          owner_id: userId,
          card_id: cardId,
          grade,
          start_time: startTime,
          session_id: sessionId,
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

      const hash = computeUserHash(botId, userId);
      logger?.info("practice_submit_recorded", {
        user_hash: hash,
        card_id: cardId,
        session_id: sessionId,
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

export function __resetPracticeRateLimit() {
  submitBuckets.clear();
}
