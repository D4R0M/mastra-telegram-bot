import type { CommandResponse, ConversationState } from "../commandTypes.js";
import { buildToolExecCtx } from "../context.js";
import { deleteCardTool } from "../tools/vocabularyTools.js";

export default async function handleDeleteCommand(
  params: string[],
  rawParams: string,
  userId: string,
  state?: ConversationState,
  mastra?: any,
): Promise<CommandResponse> {
  const logger = mastra?.getLogger();

  if (params.length === 0) {
    return {
      response:
        "❓ Please specify the card ID to delete:\n<code>/delete [card_id]</code>\n\nUse <code>/list</code> to see card IDs.",
      parse_mode: "HTML",
    };
  }

  const cardId = params[0];

  try {
    const { runtimeContext, tracingContext } = buildToolExecCtx(mastra, {
      requestId: userId,
    });
    const result = await deleteCardTool.execute({
      context: {
        owner_id: userId,
        card_id: cardId,
        confirm: true,
      },
      runtimeContext,
      tracingContext,
      mastra,
    });

    if (result.success) {
      return {
        response: `✅ ${result.message}`,
        parse_mode: "HTML",
      };
    } else {
      return {
        response: `❌ ${result.message}`,
        parse_mode: "HTML",
      };
    }
  } catch (error) {
    logger?.error("❌ [CommandParser] Error deleting card:", error);
    return {
      response: "❌ Error deleting card. Please try again.",
      parse_mode: "HTML",
    };
  }
}
