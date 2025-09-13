import type { CommandResponse, ConversationState } from "../commandParser.js";
import { buildToolExecCtx } from "../context.js";
import { getDueCardsStatsTool } from "../tools/statisticsTools.js";

export default async function handleDueCommand(
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
    const result = await getDueCardsStatsTool.execute({
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
      const dueText = [
        "📋 <b>Cards Due for Review</b>\n",
        `Total Cards: ${stats.total_cards}`,
        `Due Today: ${stats.cards_due_today}`,
        `Due Tomorrow: ${stats.cards_due_tomorrow}`,
        `New Cards: ${stats.new_cards}`,
        `Learning Cards: ${stats.learning_cards}`,
        `Review Cards: ${stats.review_cards}`,
        `Overdue Cards: ${stats.overdue_cards}`,
      ];

      if (stats.cards_due_today > 0) {
        dueText.push(
          "\n💡 <i>Start your review session with</i> <code>/practice</code>",
        );
      } else {
        dueText.push("\n✨ <i>All caught up! No cards due today.</i>");
      }

      return {
        response: dueText.join("\n"),
        parse_mode: "HTML",
      };
    } else {
      return {
        response: `❌ ${result.message || "Could not fetch due cards"}`,
        parse_mode: "HTML",
      };
    }
  } catch (error) {
    logger?.error("❌ [CommandParser] Error fetching due cards:", error);
    return {
      response: "❌ Error fetching due cards. Please try again.",
      parse_mode: "HTML",
    };
  }
}
