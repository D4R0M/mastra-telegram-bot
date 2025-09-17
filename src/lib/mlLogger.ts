import type { IMastraLogger } from "@mastra/core/logger";
import { insertReviewEvent } from "../db/reviewEvents.js";
import type { ReviewEvent, ReviewMode, ReviewAction, Sm2Snapshot } from "../types/ml.js";
import { shouldLogML } from "../ml/shouldLogML.js";
import {
  getAppVersion,
  hashUserId,
  redactAnswerText,
} from "./mlPrivacy.js";

export interface LogReviewEventArgs {
  ts?: Date;
  mode: ReviewMode;
  action: ReviewAction;
  session_id: string;
  attempt?: number | null;
  hint_count?: number | null;
  latency_ms?: number | null;
  userId?: string | number;
  user_hash?: string;
  card_id: string;
  deck_id?: string | null;
  grade?: number | null;
  is_correct?: boolean | null;
  answer_text?: string | null;
  sm2_before?: Sm2Snapshot | null;
  sm2_after?: Sm2Snapshot | null;
  client?: string | null;
  app_version?: string | null;
  source?: string | null;
  logger?: Pick<IMastraLogger, "warn" | "error"> | null;
}

function resolveUserHash(args: LogReviewEventArgs): string | undefined {
  if (args.user_hash) {
    return args.user_hash;
  }
  if (args.userId !== undefined && args.userId !== null) {
    try {
      return hashUserId(args.userId);
    } catch (error) {
      args.logger?.error?.("ml_log_hash_failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }
  return undefined;
}

export async function logReviewEvent(
  args: LogReviewEventArgs,
): Promise<void> {
  if (!shouldLogML()) {
    return;
  }

  const user_hash = resolveUserHash(args);
  if (!user_hash) {
    return;
  }

  const appVersion = args.app_version ?? getAppVersion();
  const sanitizedAnswer = redactAnswerText(args.answer_text);
  const easeBefore = args.sm2_before?.ease ?? null;
  const easeAfter = args.sm2_after?.ease ?? null;
  const repsBefore = args.sm2_before?.reps ?? null;
  const repsAfter = args.sm2_after?.reps ?? null;
  const intervalBefore = args.sm2_before?.interval ?? null;
  const intervalAfter = args.sm2_after?.interval ?? null;
  const payload: ReviewEvent = {
    ts: args.ts ?? new Date(),
    mode: args.mode,
    action: args.action,
    session_id: args.session_id,
    attempt: args.attempt ?? null,
    hint_count: args.hint_count ?? null,
    latency_ms: args.latency_ms ?? null,
    user_hash,
    card_id: args.card_id,
    deck_id: args.deck_id ?? null,
    grade: args.grade ?? null,
    is_correct: args.is_correct ?? null,
    answer_text: sanitizedAnswer,
    sm2_before: args.sm2_before ?? null,
    sm2_after: args.sm2_after ?? null,
    ease_before: easeBefore,
    ease_after: easeAfter,
    reps_before: repsBefore,
    reps_after: repsAfter,
    interval_before: intervalBefore,
    interval_after: intervalAfter,
    client: args.client ?? "bot",
    app_version: appVersion ?? null,
    source: args.source ?? null,
  };

  try {
    await insertReviewEvent(payload);
  } catch (error) {
    args.logger?.warn?.("ml_log_failed", {
      mode: args.mode,
      action: args.action,
      card_id: args.card_id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
