import { getPool } from "./client.js";
import type { PoolClient } from "pg";

export interface ReviewState {
  card_id: string;
  user_id: number;
  interval_days: number;
  repetitions: number;
  ease_factor: number;
  due_date: string; // ISO date string
  last_reviewed_at?: Date;
  last_grade?: number;
  lapses: number;
  queue: "new" | "learning" | "review";
  direction_mode: string;
}

export interface ReviewLog {
  id: string;
  card_id: string;
  user_id: number;
  reviewed_at: Date;
  grade: number;
  prev_ease?: number;
  new_ease?: number;
  prev_interval?: number;
  new_interval?: number;
  prev_repetitions?: number;
  new_repetitions?: number;
  prev_due?: string;
  new_due?: string;
  latency_ms?: number;
  session_id?: string;
  direction: string;
}

export interface CreateReviewStateData {
  card_id: string;
  user_id: number;
  interval_days?: number;
  repetitions?: number;
  ease_factor?: number;
  due_date?: string;
  queue?: "new" | "learning" | "review";
  direction_mode?: string;
}

export interface UpdateReviewStateData {
  interval_days?: number;
  repetitions?: number;
  ease_factor?: number;
  due_date?: string;
  last_reviewed_at?: Date;
  last_grade?: number;
  lapses?: number;
  queue?: "new" | "learning" | "review";
  direction_mode?: string;
}

export interface CreateReviewLogData {
  card_id: string;
  user_id: number;
  grade: number;
  prev_ease?: number;
  new_ease?: number;
  prev_interval?: number;
  new_interval?: number;
  prev_repetitions?: number;
  new_repetitions?: number;
  prev_due?: string;
  new_due?: string;
  latency_ms?: number;
  session_id?: string;
  direction?: string;
}

export async function createReviewState(
  data: CreateReviewStateData,
  client?: PoolClient,
): Promise<ReviewState> {
  const pool = client || getPool();
  if (!data.user_id) {
    throw new Error('user_id is required');
  }

  const result = await pool.query(
    `
    INSERT INTO review_state (card_id, user_id, interval_days, repetitions, ease_factor, due_date, queue, direction_mode)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (card_id) DO NOTHING
    RETURNING *
  `,
    [
      data.card_id,
      data.user_id,
      data.interval_days || 0,
      data.repetitions || 0,
      data.ease_factor || 2.5,
      data.due_date || new Date().toISOString().split("T")[0],
      data.queue || "new",
      data.direction_mode || "front_to_back",
    ],
  );

  return result.rows[0];
}

export async function getReviewState(
  card_id: string,
  client?: PoolClient,
): Promise<ReviewState | null> {
  const pool = client || getPool();

  const result = await pool.query(
    `
    SELECT * FROM review_state WHERE card_id = $1
  `,
    [card_id],
  );

  return result.rows[0] || null;
}

export async function getReviewStates(
  card_ids: string[],
  client?: PoolClient,
): Promise<ReviewState[]> {
  const pool = client || getPool();

  if (card_ids.length === 0) {
    return [];
  }

  const placeholders = card_ids.map((_, i) => `$${i + 1}`).join(",");
  const result = await pool.query(
    `SELECT * FROM review_state WHERE card_id IN (${placeholders})`,
    card_ids,
  );

  return result.rows as ReviewState[];
}

export async function updateReviewState(
  card_id: string,
  data: UpdateReviewStateData,
  client?: PoolClient,
): Promise<ReviewState | null> {
  const pool = client || getPool();

  const setClause = [];
  const params: unknown[] = [card_id];
  let paramIndex = 2;

  if (data.interval_days !== undefined) {
    setClause.push(`interval_days = $${paramIndex}`);
    params.push(data.interval_days);
    paramIndex++;
  }

  if (data.repetitions !== undefined) {
    setClause.push(`repetitions = $${paramIndex}`);
    params.push(data.repetitions);
    paramIndex++;
  }

  if (data.ease_factor !== undefined) {
    setClause.push(`ease_factor = $${paramIndex}`);
    params.push(data.ease_factor);
    paramIndex++;
  }

  if (data.due_date !== undefined) {
    setClause.push(`due_date = $${paramIndex}`);
    params.push(data.due_date);
    paramIndex++;
  }

  if (data.last_reviewed_at !== undefined) {
    setClause.push(`last_reviewed_at = $${paramIndex}`);
    params.push(data.last_reviewed_at.toISOString());
    paramIndex++;
  }

  if (data.last_grade !== undefined) {
    setClause.push(`last_grade = $${paramIndex}`);
    params.push(data.last_grade);
    paramIndex++;
  }

  if (data.lapses !== undefined) {
    setClause.push(`lapses = $${paramIndex}`);
    params.push(data.lapses);
    paramIndex++;
  }

  if (data.queue !== undefined) {
    setClause.push(`queue = $${paramIndex}`);
    params.push(data.queue);
    paramIndex++;
  }

  if (data.direction_mode !== undefined) {
    setClause.push(`direction_mode = $${paramIndex}`);
    params.push(data.direction_mode);
    paramIndex++;
  }

  if (setClause.length === 0) {
    return null;
  }

  const query = `
    UPDATE review_state 
    SET ${setClause.join(", ")}
    WHERE card_id = $1
    RETURNING *
  `;

  const result = await pool.query(query, params);
  return result.rows[0] || null;
}

export async function getDueCards(
  user_id: number,
  limit?: number,
  client?: PoolClient,
): Promise<Array<{ card: any; review_state: ReviewState }>> {
  const pool = client || getPool();

  const today = new Date().toISOString().split("T")[0];

  let query = `
    SELECT c.*, rs.*
    FROM review_state rs
    INNER JOIN cards c ON c.id = rs.card_id
    WHERE rs.user_id = $1
      AND c.active = true
      AND rs.due_date <= $2
    ORDER BY rs.due_date ASC, c.created_at ASC
  `;

  const params: (number | string)[] = [user_id, today];

  if (limit) {
    query += ` LIMIT $3`;
    params.push(limit);
  }

  const result = await pool.query(query, params);

  return result.rows.map((row) => ({
    card: {
      id: row.id,
      owner_id: row.owner_id,
      front: row.front,
      back: row.back,
      tags: row.tags,
      example: row.example,
      lang_front: row.lang_front,
      lang_back: row.lang_back,
      active: row.active,
      created_at: row.created_at,
      updated_at: row.updated_at,
    },
    review_state: {
      card_id: row.card_id,
      interval_days: row.interval_days,
      repetitions: row.repetitions,
      ease_factor: row.ease_factor,
      due_date: row.due_date,
      last_reviewed_at: row.last_reviewed_at,
      last_grade: row.last_grade,
      lapses: row.lapses,
      queue: row.queue,
      direction_mode: row.direction_mode,
    },
  }));
}

export async function createReviewLog(
  data: CreateReviewLogData,
  client?: PoolClient,
): Promise<ReviewLog> {
  const pool = client || getPool();
  if (!data.user_id) {
    throw new Error('user_id is required');
  }

  const result = await pool.query(
    `
    INSERT INTO review_log (
      card_id, user_id, grade, prev_ease, new_ease, prev_interval, new_interval,
      prev_repetitions, new_repetitions, prev_due, new_due, latency_ms,
      session_id, direction
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    RETURNING *
  `,
    [
      data.card_id,
      data.user_id,
      data.grade,
      data.prev_ease,
      data.new_ease,
      data.prev_interval,
      data.new_interval,
      data.prev_repetitions,
      data.new_repetitions,
      data.prev_due,
      data.new_due,
      data.latency_ms,
      data.session_id,
      data.direction || "front_to_back",
    ],
  );

  return result.rows[0];
}

export async function getReviewStats(
  user_id: number,
  client?: PoolClient,
): Promise<{
  total_cards: number;
  due_today: number;
  reviewed_today: number;
  new_cards: number;
  learning_cards: number;
  review_cards: number;
}> {
  const pool = client || getPool();

  const today = new Date().toISOString().split("T")[0];

  const result = await pool.query(
    `
    SELECT
      COUNT(*) as total_cards,
      COUNT(CASE WHEN rs.due_date <= $2 THEN 1 END) as due_today,
      COUNT(CASE WHEN rs.queue = 'new' THEN 1 END) as new_cards,
      COUNT(CASE WHEN rs.queue = 'learning' THEN 1 END) as learning_cards,
      COUNT(CASE WHEN rs.queue = 'review' THEN 1 END) as review_cards
    FROM review_state rs
    JOIN cards c ON rs.card_id = c.id
    WHERE rs.user_id = $1 AND c.active = true
  `,
    [user_id, today],
  );

  const reviewedTodayResult = await pool.query(
    `
    SELECT COUNT(*) as reviewed_today
    FROM review_log rl
    WHERE rl.user_id = $1
      AND rl.reviewed_at >= $2::date
      AND rl.reviewed_at < ($2::date + interval '1 day')
  `,
    [user_id, today],
  );

  const stats = result.rows[0];
  const reviewedStats = reviewedTodayResult.rows[0];

  return {
    total_cards: parseInt(stats.total_cards),
    due_today: parseInt(stats.due_today),
    reviewed_today: parseInt(reviewedStats.reviewed_today),
    new_cards: parseInt(stats.new_cards),
    learning_cards: parseInt(stats.learning_cards),
    review_cards: parseInt(stats.review_cards),
  };
}

export interface ReviewEvent {
  card_id: string;
  user_id: number;
  ts_shown: Date;
  ts_answered: Date;
  grade: number;
  scheduled_at: Date;
  prev_review_at?: Date | null;
  prev_interval_days: number;
  due_interval_days: number;
  was_overdue: boolean;
  ease_factor: number;
  repetition: number;
  lapses: number;
  is_new: boolean;
  answer_latency_ms: number;
  session_id?: string;
  position_in_session?: number;
  time_of_day_bucket: string;
  weekday: number;
}

export async function logReview(
  data: ReviewEvent,
  client?: PoolClient,
): Promise<void> {
  const pool = client || getPool();
  if (!data.user_id) {
    throw new Error('user_id is required');
  }

  await pool.query(
    `
    INSERT INTO reviews (
      user_id,
      card_id,
      ts_shown,
      ts_answered,
      grade,
      scheduled_at,
      prev_review_at,
      prev_interval_days,
      due_interval_days,
      was_overdue,
      ease_factor,
      repetition,
      lapses,
      is_new,
      answer_latency_ms,
      session_id,
      position_in_session,
      time_of_day_bucket,
      weekday
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
      $11, $12, $13, $14, $15, $16, $17, $18, $19
    )
  `,
    [
      data.user_id,
      data.card_id,
      data.ts_shown,
      data.ts_answered,
      data.grade,
      data.scheduled_at,
      data.prev_review_at,
      data.prev_interval_days,
      data.due_interval_days,
      data.was_overdue,
      data.ease_factor,
      data.repetition,
      data.lapses,
      data.is_new,
      data.answer_latency_ms,
      data.session_id,
      data.position_in_session,
      data.time_of_day_bucket,
      data.weekday,
    ],
  );
}

export interface ReviewEventLog {
  user_id: number;
  user_hash: string;
  session_id?: string;
  card_id?: string;
  grade?: number;
  latency_ms?: number;
  was_overdue?: boolean;
  prev_ease?: number;
  new_ease?: number;
  prev_interval_days?: number;
  new_interval_days?: number;
  prev_repetitions?: number;
  new_repetitions?: number;
}

export async function logReviewEvent(
  data: ReviewEventLog,
  client?: PoolClient,
): Promise<void> {
  const pool = client || getPool();
  if (!data.user_id) {
    throw new Error('user_id is required');
  }

  await pool.query(
    `
    INSERT INTO review_events (
      user_id,
      user_hash,
      session_id,
      card_id,
      grade,
      latency_ms,
      was_overdue,
      prev_ease,
      new_ease,
      prev_interval_days,
      new_interval_days,
      prev_repetitions,
      new_repetitions
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
    )
  `,
    [
      data.user_id,
      data.user_hash,
      data.session_id,
      data.card_id,
      data.grade,
      data.latency_ms,
      data.was_overdue,
      data.prev_ease,
      data.new_ease,
      data.prev_interval_days,
      data.new_interval_days,
      data.prev_repetitions,
      data.new_repetitions,
    ],
  );
}
