import type { CommandResponse, ConversationState } from "../commandParser.js";
import { buildToolExecCtx } from "../context.js";
import { getStreakStatsTool } from "../tools/statisticsTools.js";
import { fmtStreakHTML, type Streak } from "../ui/format.js";

export default async function handleStreakCommand(
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
    const result = await getStreakStatsTool.execute({
      context: {
        owner_id: userId,
        timezone: "Europe/Stockholm",
      },
      runtimeContext,
      tracingContext,
      mastra,
    });

    if (result.success && result.stats) {
      const raw = result.stats;
      const streak: Streak = {
        current: raw.current_streak ?? null,
        longest: raw.longest_streak ?? null,
        totalDays: raw.total_study_days ?? null,
        reviewsToday: raw.reviews_today ?? null,
        avgDailyReviews: raw.average_daily_reviews ?? null,
        lastReviewDate: raw.last_review_date ?? null,
      };
      return {
        response: fmtStreakHTML(streak),
        parse_mode: "HTML",
        inline_keyboard: {
          inline_keyboard: [
            [
              { text: "📊 Stats", callback_data: "/stats" },
              { text: "🗓 Weekly View", callback_data: "/streak week" },
              { text: "🔔 Reminders", callback_data: "/reminders" },
            ],
          ],
        },
      };
    } else {
      return {
        response: `❌ ${result.message || "Could not fetch streak data"}`,
        parse_mode: "HTML",
      };
    }
  } catch (error) {
    logger?.error("❌ [CommandParser] Error fetching streak:", error);
    return {
      response: "❌ Error fetching streak data. Please try again.",
      parse_mode: "HTML",
    };
  }
}
