import type { CommandResponse, ConversationState } from "../commandTypes.js";
import { buildToolExecCtx } from "../context.js";
import { getDueCardsStatsTool } from "../tools/statisticsTools.js";
import { fmtDueHTML, type DueSummary } from "../ui/format.js";

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
      const s = result.stats;
      const summary: DueSummary = {
        total: s.total_cards,
        dueToday: s.cards_due_today,
        dueTomorrow: s.cards_due_tomorrow,
        new: s.new_cards,
        learning: s.learning_cards,
        review: s.review_cards,
        overdue: s.overdue_cards,
      };

      if (params[0] === "compact" || params[0] === "short") {
        return {
          response: `📊 Today: ${summary.dueToday} due | ${summary.new} new | ${summary.overdue} overdue → /practice`,
          parse_mode: "HTML",
        };
      }

      return {
        response: fmtDueHTML(summary),
        parse_mode: "HTML",
        inline_keyboard: {
          inline_keyboard: [
            [
              { text: "▶️ Start Practice", callback_data: "practice_now" },
              { text: "➕ Add Card", callback_data: "add_card" },
              { text: "📂 Export", callback_data: "export:cards" },
            ],
            [
              { text: "📖 Only Learning", callback_data: "practice_learning" },
              { text: "🆕 Only New", callback_data: "practice_new" },
              { text: "⚠️ Overdue", callback_data: "practice_overdue" },
            ],
          ],
        },
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
