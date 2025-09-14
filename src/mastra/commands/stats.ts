import type { CommandResponse, ConversationState } from "../commandParser.js";
import { buildToolExecCtx } from "../context.js";
import { getComprehensiveStatsTool } from "../tools/statisticsTools.js";
import { fmtStatsHTML, type Stats } from "../ui/format.js";

export default async function handleStatsCommand(
  params: string[],
  rawParams: string,
  userId: string,
  state?: ConversationState,
  mastra?: any,
): Promise<CommandResponse> {
  const logger = mastra?.getLogger();

  try {
    const { runtimeContext, tracingContext } = buildToolExecCtx(mastra, {
      requestId: userId,
    });
    const result = await getComprehensiveStatsTool.execute({
      context: {
        owner_id: userId,
        timezone: "Europe/Stockholm",
        success_threshold: 3,
      },
      runtimeContext,
      tracingContext,
      mastra,
    });

    if (result.success && result.stats) {
      const raw = result.stats;
      const stats: Stats = {
        totalCards: raw.due_cards?.total_cards ?? null,
        dueToday: raw.due_cards?.cards_due_today ?? null,
        newToday: raw.due_cards?.new_cards ?? null,
        avgEase: raw.due_cards?.average_ease ?? null,
        retentionRate:
          raw.retention?.retention_rate != null
            ? raw.retention.retention_rate / 100
            : null,
        retentionDelta:
          raw.retention?.success_rate_last_30_days != null &&
          raw.retention?.retention_rate != null
            ? (raw.retention.success_rate_last_30_days -
                raw.retention.retention_rate) /
              100
            : null,
        currentStreakDays: raw.streaks?.current_streak ?? null,
        longestStreakDays: raw.streaks?.longest_streak ?? null,
        dueNowPct: null,
        newTodayPct: null,
      };
      return {
        response: fmtStatsHTML(stats),
        parse_mode: "HTML",
        inline_keyboard: {
          inline_keyboard: [
            [
              { text: "▶️ Practice now", callback_data: "practice_now" },
              { text: "➕ Add card", callback_data: "add_card" },
              { text: "📈 Detail", callback_data: "open_stats_detail" },
            ],
          ],
        },
      };
    } else {
      return {
        response: `❌ ${result.message || "Could not fetch statistics"}`,
        parse_mode: "HTML",
      };
    }
  } catch (error) {
    logger?.error("❌ [CommandParser] Error fetching stats:", error);
    return {
      response: "❌ Error fetching statistics. Please try again.",
      parse_mode: "HTML",
    };
  }
}
