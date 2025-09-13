import type { CommandResponse, ConversationState } from "../commandParser.js";
import { buildToolExecCtx } from "../context.js";
import { getStreakStatsTool } from "../tools/statisticsTools.js";

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
      const stats = result.stats;
      const streakText = [
        "🔥 <b>Your Study Streak</b>\n",
        `Current Streak: ${stats.current_streak} days`,
        `Longest Streak: ${stats.longest_streak} days`,
        `Total Study Days: ${stats.total_study_days}`,
        `Reviews Today: ${stats.reviews_today}`,
        `Average Daily Reviews: ${stats.average_daily_reviews.toFixed(1)}`,
      ];

      if (stats.last_review_date) {
        streakText.push(`Last Review: ${stats.last_review_date}`);
      }

      if (stats.current_streak > 0) {
        if (stats.current_streak >= 30) {
          streakText.push(
            "\n🏆 Amazing! You've maintained your streak for over a month!",
          );
        } else if (stats.current_streak >= 7) {
          streakText.push("\n⭐ Great job! You're on a weekly streak!");
        } else if (stats.current_streak >= 3) {
          streakText.push("\n👍 Good work! Keep it up!");
        }
      }

      return {
        response: streakText.join("\n"),
        parse_mode: "HTML",
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
