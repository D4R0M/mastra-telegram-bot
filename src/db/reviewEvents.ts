import type { PoolClient } from "pg";
import { getPool } from "./client.js";
import type { Ml24hTotals, ReviewEvent } from "../types/ml.js";

export async function insertReviewEvent(
  event: ReviewEvent,
  client?: PoolClient,
): Promise<void> {
  const pool = client ?? getPool();
  await pool.query(
    `INSERT INTO review_events (
      ts,
      mode,
      action,
      session_id,
      attempt,
      hint_count,
      latency_ms,
      user_hash,
      card_id,
      deck_id,
      grade,
      is_correct,
      answer_text,
      sm2_before,
      sm2_after,
      ease_before,
      ease_after,
      reps_before,
      reps_after,
      interval_before,
      interval_after,
      client,
      app_version,
      source
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7,
      $8, $9, $10, $11, $12, $13,
      $14, $15, $16, $17, $18, $19, $20,
      $21, $22, $23
    )`,
    [
      event.ts ?? null,
      event.mode,
      event.action,
      event.session_id,
      event.attempt ?? null,
      event.hint_count ?? null,
      event.latency_ms ?? null,
      event.user_hash,
      event.card_id,
      event.deck_id ?? null,
      event.grade ?? null,
      event.is_correct ?? null,
      event.answer_text ?? null,
      event.sm2_before ? JSON.stringify(event.sm2_before) : null,
      event.sm2_after ? JSON.stringify(event.sm2_after) : null,
      event.ease_before ?? null,
      event.ease_after ?? null,
      event.reps_before ?? null,
      event.reps_after ?? null,
      event.interval_before ?? null,
      event.interval_after ?? null,
      event.client ?? "bot",
      event.app_version ?? null,
      event.source ?? null,
    ],
  );
}


export async function countEventsForUser(userHash: string): Promise<number> {
  const pool = getPool();
  const result = await pool.query<{ count: string }>(
    SELECT COUNT(*)::BIGINT AS count FROM review_events WHERE user_hash = ,
    [userHash],
  );
  return Number(result.rows[0]?.count ?? 0);
}

export interface ReviewEventSample {
  ts: Date;
  mode: string;
  action: string;
  session_id: string;
  card_id: string;
  grade: number | null;
  is_correct: boolean | null;
  latency_ms: number | null;
  client: string | null;
}

export async function fetchRecentReviewEvents(
  limit: number,
): Promise<ReviewEventSample[]> {
  const pool = getPool();
  const result = await pool.query<ReviewEventSample>(
    `SELECT ts, mode, action, session_id, card_id, grade, is_correct, latency_ms, client
     FROM review_events
     ORDER BY ts DESC
     LIMIT $1`,
    [limit],
  );
  return result.rows;
}

export async function fetch24hTotals(): Promise<Ml24hTotals[]> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT
        mode,
        COUNT(*)::BIGINT AS events,
        COUNT(*) FILTER (WHERE action = 'graded')::BIGINT AS graded,
        AVG(CASE WHEN action = 'graded' THEN CASE WHEN is_correct THEN 1 ELSE 0 END END)::DOUBLE PRECISION AS accuracy
     FROM review_events
     WHERE ts >= now() - interval '24 hours'
     GROUP BY mode
     ORDER BY mode`,
  );
  return result.rows.map((row) => ({
    mode: row.mode,
    events: Number(row.events) || 0,
    graded: Number(row.graded) || 0,
    accuracy: row.accuracy === null ? null : Number(row.accuracy),
  }));
}

export async function fetchLatestEvent(): Promise<ReviewEventSample | null> {
  const pool = getPool();
  const result = await pool.query<ReviewEventSample>(
    `SELECT ts, mode, action, session_id, card_id, grade, is_correct, latency_ms, client
     FROM review_events
     ORDER BY ts DESC
     LIMIT 1`,
  );
  return result.rows[0] ?? null;
}


export interface ReviewEvents7dRow {
  day: string;
  mode: string;
  events: number;
  unique_users: number;
  accuracy: number | null;
}

export async function fetchEventsLast7d(): Promise<ReviewEvents7dRow[]> {
  const pool = getPool();
  const result = await pool.query<ReviewEvents7dRow>(
    `SELECT day, mode, events, unique_users, accuracy
       FROM review_events_last_7d
       ORDER BY day DESC, mode`,
  );
  return result.rows.map((row) => ({
    day: row.day,
    mode: row.mode,
    events: Number(row.events) || 0,
    unique_users: Number(row.unique_users) || 0,
    accuracy: row.accuracy === null ? null : Number(row.accuracy),
  }));
}
