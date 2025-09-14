import { getPool } from "../db/client.js";
import type { Pool } from "pg";

export type ReviewRange = "today" | "7d" | "30d" | "all";

export interface ReviewStats {
  total: number;
  correct: number;
  wrong: number;
  avgLatency: number | null;
  byDay: { day: string; count: number }[];
  topTags: { tag: string; count: number }[];
  recent: { card_id: string; grade: number; ts_shown: Date }[];
}

function rangeFilter(range: ReviewRange) {
  switch (range) {
    case "today":
      return { clause: "WHERE ts_shown::date = current_date", params: [] };
    case "7d":
      return { clause: "WHERE ts_shown >= now() - $1::interval", params: ["7 days"] };
    case "30d":
      return {
        clause: "WHERE ts_shown >= now() - $1::interval",
        params: ["30 days"],
      };
    default:
      return { clause: "", params: [] };
  }
}

export async function getReviewStats(range: ReviewRange): Promise<ReviewStats> {
  const pool: Pool = getPool();
  const { clause, params } = rangeFilter(range);

  const totals = await pool.query(
    `SELECT COUNT(*) AS total,
            COUNT(*) FILTER (WHERE grade >= 3) AS correct,
            COUNT(*) FILTER (WHERE grade < 3) AS wrong,
            AVG(answer_latency_ms) FILTER (WHERE answer_latency_ms IS NOT NULL) AS avg_latency
       FROM reviews ${clause}`,
    params,
  );
  const totalRow = totals.rows[0] || {};

  const byDay = await pool.query(
    `SELECT date_trunc('day', ts_shown)::date AS day, COUNT(*) AS n
       FROM reviews ${clause}
       GROUP BY 1
       ORDER BY 1 DESC
       LIMIT 7`,
    params,
  );

  const topTags = await pool.query(
    `SELECT COALESCE(c.tag_primary, '—') AS tag, COUNT(*) AS n
       FROM reviews r
       LEFT JOIN cards c ON c.card_id = r.card_id
       ${clause ? clause.replace(/ts_shown/g, 'r.ts_shown') : ''}
       GROUP BY 1
       ORDER BY n DESC
       LIMIT 5`,
    params,
  );

  const recent = await pool.query(
    `SELECT r.card_id, r.grade, r.ts_shown
       FROM reviews r
       ${clause ? clause.replace(/ts_shown/g, 'r.ts_shown') : ''}
       ORDER BY r.ts_shown DESC
       LIMIT 5`,
    params,
  );

  return {
    total: Number(totalRow.total) || 0,
    correct: Number(totalRow.correct) || 0,
    wrong: Number(totalRow.wrong) || 0,
    avgLatency:
      totalRow.avg_latency !== null ? Math.round(Number(totalRow.avg_latency)) : null,
    byDay: byDay.rows.map((r) => ({ day: r.day.toISOString().slice(0, 10), count: Number(r.n) })),
    topTags: topTags.rows.map((r) => ({ tag: r.tag, count: Number(r.n) })),
    recent: recent.rows.map((r) => ({
      card_id: r.card_id,
      grade: Number(r.grade),
      ts_shown: new Date(r.ts_shown),
    })),
  };
}

function dayBar(count: number, max: number): string {
  if (max <= 0) return "";
  const width = Math.round((count / max) * 10);
  return "█".repeat(width);
}

const RANGE_LABEL: Record<ReviewRange, string> = {
  today: "today",
  "7d": "7 days",
  "30d": "30 days",
  all: "all time",
};

export function formatStatsMessage(
  dto: ReviewStats & { range: ReviewRange },
): { text: string; keyboard: any } {
  const lines: string[] = [];
  lines.push(`📊 Review Log — last ${RANGE_LABEL[dto.range]}`);
  lines.push("");
  lines.push(`Total: ${dto.total}`);
  lines.push(`✔️ Correct: ${dto.correct}   ❌ Wrong: ${dto.wrong}`);
  lines.push(
    `⏱ Avg response: ${dto.avgLatency !== null ? dto.avgLatency : 0} ms`,
  );
  lines.push("");

  if (dto.total > 0) {
    lines.push("By day (last 7):");
    const max = Math.max(...dto.byDay.map((d) => d.count), 0);
    for (const d of dto.byDay) {
      lines.push(
        `${d.day} | ${dayBar(d.count, max)} ${d.count}`.trim(),
      );
    }
    lines.push("");

    if (dto.topTags.length) {
      const tagLine = dto.topTags
        .slice(0, 3)
        .map((t) => `${t.tag}: ${t.count}`)
        .join(" • ");
      lines.push("Top tags:");
      lines.push(tagLine);
      lines.push("");
    }

    if (dto.recent.length) {
      lines.push("Recent:");
      for (const r of dto.recent) {
        const ts = r.ts_shown.toISOString().replace("T", " ").slice(0, 16);
        lines.push(`• ${ts} — ${r.card_id.slice(0, 8)} — grade ${r.grade}`);
      }
    }
  } else {
    lines.push("No reviews in this range.");
  }

  const kb: any = { inline_keyboard: [] as any[] };
  kb.inline_keyboard.push([
    { text: "Today", callback_data: "check_reviews:today" },
    { text: "7d", callback_data: "check_reviews:7d" },
    { text: "30d", callback_data: "check_reviews:30d" },
    { text: "All", callback_data: "check_reviews:all" },
  ]);
  if (dto.total > 0) {
    kb.inline_keyboard.push([
      {
        text: `⬇ Export CSV (${RANGE_LABEL[dto.range]})`,
        callback_data: `check_reviews_export:${dto.range}`,
      },
    ]);
  }
  kb.inline_keyboard.push([
    { text: "🔁 Refresh", callback_data: `check_reviews_refresh:${dto.range}` },
  ]);

  return { text: lines.join("\n"), keyboard: kb };
}

export async function exportReviewsCsv(
  range: ReviewRange,
): Promise<{ buffer: Buffer; filename: string }> {
  const pool: Pool = getPool();
  const { clause, params } = rangeFilter(range);
  const cols = [
    "review_id",
    "card_id",
    "ts_shown",
    "ts_answered",
    "grade",
    "scheduled_at",
    "prev_review_at",
    "prev_interval_days",
    "due_interval_days",
    "was_overdue",
    "ease_factor",
    "repetition",
    "lapses",
    "is_new",
    "answer_latency_ms",
    "session_id",
    "position_in_session",
    "time_of_day_bucket",
    "weekday",
  ];
  const query = `SELECT ${cols.join(", ")} FROM reviews ${clause}`;
  const result = await pool.query(query, params);
  const header = cols.join(",");
  const lines = result.rows.map((row) =>
    cols
      .map((c) => {
        const val = row[c];
        if (val === null || val === undefined) return "";
        if (val instanceof Date) return val.toISOString();
        return String(val).replace(/"/g, '""');
      })
      .join(","),
  );
  const csv = [header, ...lines].join("\n");
  const filename = `reviews_${range}_${new Date().toISOString().slice(0, 10)}.csv`;
  return { buffer: Buffer.from(csv, "utf8"), filename };
}
