import type { CommandResponse, ConversationState } from "../commandTypes.js";
import { isAdmin } from "../authorization.js";
import { getPool } from "../../db/client.js";

interface ReviewEventRow {
  card_id: string | null;
  user_id: number | null;
  reviewed_at: Date | string | null;
}

export default async function handleCheckMlLogCommand(
  _params: string[],
  _rawParams: string,
  userId: string,
  _state?: ConversationState,
  mastra?: any,
): Promise<CommandResponse> {
  if (!(await isAdmin(userId))) {
    return { response: "Not authorized.", parse_mode: "HTML" };
  }

  const logger = mastra?.getLogger?.();

  try {
    const pool = getPool();

    const totalResult = await pool.query<{ total?: string }>(
      "SELECT COUNT(*) AS total FROM review_events",
    );
    const totalRaw = totalResult.rows?.[0]?.total;
    const totalParsed = Number(totalRaw ?? 0);
    const total = Number.isFinite(totalParsed) ? totalParsed : 0;

    const recentResult = await pool.query<ReviewEventRow>(
      `SELECT card_id, user_id, reviewed_at
       FROM review_events
       ORDER BY reviewed_at DESC
       LIMIT 5`,
    );

    const recentLines = recentResult.rows.map((row) => {
      const cardId = row.card_id ?? "unknown";
      const userIdValue = row.user_id ?? "unknown";
      let reviewedAtText = "unknown time";

      if (row.reviewed_at) {
        const dateValue =
          row.reviewed_at instanceof Date
            ? row.reviewed_at
            : new Date(row.reviewed_at);

        reviewedAtText = Number.isNaN(dateValue.getTime())
          ? String(row.reviewed_at)
          : dateValue.toISOString().slice(0, 10);
      }

      return `- Card ${cardId} by user ${userIdValue} at ${reviewedAtText}`;
    });

    if (recentLines.length === 0) {
      recentLines.push("- No review events recorded yet.");
    }

    const message = [
      "📊 ML Logging",
      `Total events: ${total}`,
      "",
      "Most recent 5:",
      ...recentLines,
    ].join("\n");

    return { response: message, parse_mode: "HTML" };
  } catch (error) {
    logger?.error?.("Failed to fetch ML log", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      response: "❌ Failed to fetch ML log. Please try again later.",
      parse_mode: "HTML",
    };
  }
}
