import type { CommandResponse, ConversationState } from "../commandTypes.js";
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
      const dc = raw.due_cards || {};
      const ret = raw.retention || {};
      const streak = raw.streaks || {};
      const stats: Stats = {
        totalCards: dc.total_cards ?? 0,
        dueToday: dc.cards_due_today ?? 0,
        newToday: dc.new_cards ?? 0,
        avgEase: dc.average_ease ?? 0,
        retentionRate:
          ret.retention_rate != null ? ret.retention_rate / 100 : 0,
        retentionDelta:
          ret.success_rate_last_30_days != null &&
          ret.retention_rate != null
            ? (ret.success_rate_last_30_days - ret.retention_rate) / 100
            : 0,
        currentStreakDays: streak.current_streak ?? 0,
        longestStreakDays: streak.longest_streak ?? 0,
        dueNowPct: 0,
        newTodayPct: 0,
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
