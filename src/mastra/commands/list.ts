import type { CommandResponse, ConversationState } from "../commandParser.js";
import { buildToolExecCtx } from "../context.js";
import { listCardsTool } from "../tools/vocabularyTools.js";
import { formatCard } from "./utils.js";

export default async function handleListCommand(
  params: string[],
  rawParams: string,
  userId: string,
  state?: ConversationState,
  mastra?: any,
): Promise<CommandResponse> {
  const logger = mastra?.getLogger();

  try {
    // Parse offset and limit from params
    const offset = params.length > 0 ? parseInt(params[0]) : 0;
    const limit = params.length > 1 ? parseInt(params[1]) : 20;

    const { runtimeContext, tracingContext } = buildToolExecCtx(mastra, {
      requestId: userId,
    });

    const result = await listCardsTool.execute({
      context: {
        owner_id: userId,
        limit: isNaN(limit) ? 20 : limit,
        offset: isNaN(offset) ? 0 : offset,
        active_only: true,
      },
      runtimeContext,
      tracingContext,
      mastra,
    });

    if (result.success && result.cards && result.cards.length > 0) {
      const startNumber = (isNaN(offset) ? 0 : offset) + 1;
      const cardsList = result.cards
        .map(
          (card: any, index: number) =>
            `${startNumber + index}. ${formatCard(card, true)}`,
        )
        .join("\n\n");

      const hasPrev = (isNaN(offset) ? 0 : offset) > 0;
      const hasNext =
        (isNaN(offset) ? 0 : offset) + (isNaN(limit) ? 20 : limit) <
        result.total_found;

      const inline_keyboard = hasPrev || hasNext
        ? {
            inline_keyboard: [
              [
                ...(hasPrev
                  ? [{ text: "⬅️ Prev", callback_data: "list_nav:prev" }]
                  : []),
                ...(hasNext
                  ? [{ text: "Next ➡️", callback_data: "list_nav:next" }]
                  : []),
              ],
            ],
          }
        : undefined;

      return {
        response: `📚 <b>Your Vocabulary Cards (${result.total_found} total)</b>\n\n${cardsList}\n\n<i>Use /edit [id] to edit a card\nUse /delete [id] to remove a card</i>`,
        parse_mode: "HTML",
        inline_keyboard,
        conversationState: inline_keyboard
          ? {
              mode: "list_navigation",
              data: {
                offset: isNaN(offset) ? 0 : offset,
                limit: isNaN(limit) ? 20 : limit,
              },
            }
          : undefined,
      };
    } else if (result.cards && result.cards.length === 0) {
      return {
        response:
          "📭 You don't have any cards yet.\n\nUse <code>/add</code> to create your first card!",
        parse_mode: "HTML",
      };
    } else {
      return {
        response: `❌ ${result.message}`,
        parse_mode: "HTML",
      };
    }
  } catch (error) {
    logger?.error("❌ [CommandParser] Error listing cards:", error);
    return {
      response: "❌ Error listing cards. Please try again.",
      parse_mode: "HTML",
    };
  }
}
