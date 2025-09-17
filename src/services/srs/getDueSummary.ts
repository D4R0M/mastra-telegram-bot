import { getPool } from "../../db/client.js";

export interface DueSummary {
  total: number;
  dueToday: number;
  dueTomorrow: number;
  newCount: number;
  learningCount: number;
  reviewCount: number;
  overdueCount: number;
  loadPct: number;
  reviewedToday: number;
}

const DAY_MS = 86_400_000;

function utcMidnight(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function getDueSummary(userId: number): Promise<DueSummary> {
  if (!Number.isFinite(userId)) {
    throw new Error("userId must be a finite number");
  }

  const now = new Date();
  const todayUtc = utcMidnight(now);
  const tomorrowUtc = new Date(todayUtc.getTime() + DAY_MS);

  const todayDate = isoDate(todayUtc);
  const tomorrowDate = isoDate(tomorrowUtc);

  const pool = getPool();

  const statsResult = await pool.query(
    `
    SELECT
      COUNT(*)::BIGINT AS total,
      COUNT(*) FILTER (WHERE rs.due_date = $2)::BIGINT AS due_today,
      COUNT(*) FILTER (WHERE rs.due_date = $3)::BIGINT AS due_tomorrow,
      COUNT(*) FILTER (WHERE rs.due_date < $2)::BIGINT AS overdue,
      COUNT(*) FILTER (WHERE rs.queue = 'new')::BIGINT AS new_count,
      COUNT(*) FILTER (WHERE rs.queue = 'learning')::BIGINT AS learning_count,
      COUNT(*) FILTER (WHERE rs.queue = 'review')::BIGINT AS review_count
    FROM review_state rs
    JOIN cards c ON c.id = rs.card_id
    WHERE rs.user_id = $1
      AND c.active = TRUE
    `,
    [userId, todayDate, tomorrowDate],
  );

  const stats = statsResult.rows[0] ?? {};

  const reviewedResult = await pool.query(
    `
    SELECT COUNT(*)::BIGINT AS reviewed_today
    FROM review_log
    WHERE user_id = $1
      AND reviewed_at >= $2
      AND reviewed_at < $3
    `,
    [userId, todayUtc.toISOString(), tomorrowUtc.toISOString()],
  );

  const dueToday = Number(stats.due_today ?? 0);
  const overdueCount = Number(stats.overdue ?? 0);
  const loadTotal = dueToday + overdueCount;

  return {
    total: Number(stats.total ?? 0),
    dueToday,
    dueTomorrow: Number(stats.due_tomorrow ?? 0),
    newCount: Number(stats.new_count ?? 0),
    learningCount: Number(stats.learning_count ?? 0),
    reviewCount: Number(stats.review_count ?? 0),
    overdueCount,
    loadPct: loadTotal > 0 ? dueToday / loadTotal : 0,
    reviewedToday: Number(reviewedResult.rows[0]?.reviewed_today ?? 0),
  };
}
