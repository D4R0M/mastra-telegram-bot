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
    // Parse limit from params
    const limit = params.length > 0 ? parseInt(params[0]) : 20;

    const { runtimeContext, tracingContext } = buildToolExecCtx(mastra, {
      requestId: userId,
    });
    const result = await listCardsTool.execute({
      context: {
        owner_id: userId,
        limit: isNaN(limit) ? 20 : limit,
        offset: 0,
        active_only: true,
      },
      runtimeContext,
      tracingContext,
      mastra,
    });

    if (result.success && result.cards && result.cards.length > 0) {
      const cardsList = result.cards
        .map(
          (card: any, index: number) =>
            `${index + 1}. ${formatCard(card, true)}`,
        )
        .join("\n\n");

      return {
        response: `📚 <b>Your Vocabulary Cards (${result.total_found} total)</b>\n\n${cardsList}\n\n<i>Use /edit [id] to edit a card\nUse /delete [id] to remove a card</i>`,
        parse_mode: "HTML",
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
