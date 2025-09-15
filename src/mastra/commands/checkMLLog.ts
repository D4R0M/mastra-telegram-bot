import type { CommandResponse, ConversationState } from "../commandTypes.js";
import { isAdmin } from "../authorization.js";
import { getPool } from "../../db/client.js";

interface ReviewEventRow {
  card_id: string | null;
  user_id: string | number;
  session_id: string | null;
  grade: number | null;
  latency_ms: number | null;
  created_at: Date | string | null;
}

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });
}

function formatTimestamp(value: Date | string | null): string {
  if (!value) {
    return "unknown time";
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return escapeHtml(String(value));
  }
  const iso = date.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

function formatEventRow(row: ReviewEventRow, includeUser: boolean): string {
  const createdAt = formatTimestamp(row.created_at ?? null);
  const cardPart = row.card_id
    ? `<code>${escapeHtml(row.card_id)}</code>`
    : "<i>unknown card</i>";
  const userPart =
    includeUser && row.user_id !== null && row.user_id !== undefined
      ? ` — user <code>${escapeHtml(String(row.user_id))}</code>`
      : "";
  const gradePart =
    row.grade === null || row.grade === undefined
      ? " — grade <i>n/a</i>"
      : ` — grade ${row.grade}`;
  const latencyPart =
    row.latency_ms === null || row.latency_ms === undefined
      ? ""
      : ` — latency ${row.latency_ms}ms`;
  const sessionPart = row.session_id
    ? ` — session <code>${escapeHtml(row.session_id)}</code>`
    : "";

  return `• ${createdAt} — card ${cardPart}${userPart}${gradePart}${latencyPart}${sessionPart}`;
}

function parseTokens(raw: string): string[] {
  return raw
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function extractValue(token: string): { key: string; value?: string } {
  const index = token.search(/[:=]/);
  if (index === -1) {
    return { key: token };
  }
  return { key: token.slice(0, index), value: token.slice(index + 1) };
}

export default async function handleCheckMlLogCommand(
  _params: string[],
  rawParams: string,
  userId: string,
  _state?: ConversationState,
  mastra?: any,
): Promise<CommandResponse> {
  const logger = mastra?.getLogger?.();
  const admin = await isAdmin(userId);

  const tokens = parseTokens(rawParams ?? "");
  let limit = DEFAULT_LIMIT;
  let targetUserId: string | undefined = admin ? undefined : userId;
  let sessionFilter: string | undefined;

  const setTargetUser = (value?: string) => {
    if (!value) return;
    if (value.toLowerCase() === "me") {
      targetUserId = userId;
      return;
    }
    if (/^\d+$/.test(value)) {
      targetUserId = value;
    }
  };

  for (const token of tokens) {
    const { key, value } = extractValue(token);
    const keyLower = key.toLowerCase();

    if (keyLower === "limit") {
      if (!value) continue;
      const parsed = Number.parseInt(value, 10);
      if (!Number.isNaN(parsed) && parsed > 0) {
        limit = Math.min(MAX_LIMIT, Math.max(1, parsed));
      }
      continue;
    }

    if (keyLower === "user" || keyLower === "u") {
      if (!admin) continue;
      setTargetUser(value);
      continue;
    }

    if (keyLower === "session" || keyLower === "s") {
      if (value) {
        sessionFilter = value;
      }
      continue;
    }

    if (token.toLowerCase() === "me") {
      setTargetUser("me");
      continue;
    }

    if (admin && /^\d+$/.test(token)) {
      setTargetUser(token);
    }
  }

  const whereClauses: string[] = [];
  const values: Array<string | number> = [];

  if (targetUserId) {
    values.push(targetUserId);
    whereClauses.push(`user_id = $${values.length}`);
  }

  if (sessionFilter) {
    values.push(sessionFilter);
    whereClauses.push(`session_id = $${values.length}`);
  }

  const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";

  try {
    const pool = getPool();

    const totalResult = await pool.query<{ total?: string }>({
      text: `SELECT COUNT(*) AS total FROM review_events ${whereSql}`,
      values,
    });

    const totalRaw = totalResult.rows?.[0]?.total ?? "0";
    const total = Number.parseInt(totalRaw, 10);
    const safeTotal = Number.isFinite(total) ? total : 0;

    const recentResult = await pool.query<ReviewEventRow>({
      text: `SELECT card_id, user_id, session_id, grade, latency_ms, created_at
             FROM review_events
             ${whereSql}
             ORDER BY created_at DESC
             LIMIT $${values.length + 1}`,
      values: [...values, limit],
    });

    const includeUser = admin;
    const recentLines = recentResult.rows.map((row) =>
      formatEventRow(row, includeUser),
    );

    if (recentLines.length === 0) {
      recentLines.push("• No review events recorded yet.");
    }

    const baseScope = admin
      ? targetUserId
        ? `Scope: user <code>${escapeHtml(targetUserId)}</code>`
        : "Scope: all users"
      : "Scope: your review events";

    const scopeLine = sessionFilter
      ? `${baseScope} • session <code>${escapeHtml(sessionFilter)}</code>`
      : baseScope;

    const recentCount = recentResult.rows.length;
    const recentLabel = `Most recent ${recentCount} event${recentCount === 1 ? "" : "s"}:`;

    const message = [
      "<b>📊 ML Review Events</b>",
      scopeLine,
      `Limit: ${limit}`,
      `Total events in scope: ${safeTotal}`,
      "",
      recentLabel,
      ...recentLines,
    ].join("\n");

    logger?.info?.("check_ml_log_fetched", {
      user_id: userId,
      admin,
      target_user_id: targetUserId ?? null,
      session: sessionFilter ?? null,
      limit,
      returned: recentResult.rows.length,
      total: safeTotal,
    });

    return { response: message, parse_mode: "HTML" };
  } catch (error) {
    logger?.error?.("Failed to fetch ML log", {
      error: error instanceof Error ? error.message : String(error),
      user_id: userId,
    });
    return {
      response: "❌ Failed to fetch ML log. Please try again later.",
      parse_mode: "HTML",
    };
  }
}
