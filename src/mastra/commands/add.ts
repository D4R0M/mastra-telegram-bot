import type { ConversationState, CommandResponse } from "../commandTypes.js";
import { buildToolExecCtx } from "../context.js";
import { addCardTool } from "../tools/vocabularyTools.js";
import { formatCard } from "./utils.js";

export default async function handleAddCommand(
  params: string[],
  rawParams: string,
  userId: string,
  state?: ConversationState,
  mastra?: any,
): Promise<CommandResponse> {
  const logger = mastra?.getLogger();

  // Check if params contain quick-add syntax with | or ::
  if (rawParams && (rawParams.includes("|") || rawParams.includes("::"))) {
    let input = rawParams;

    // Convert :: to | for consistency
    if (rawParams.includes("::")) {
      input = rawParams.replace("::", "|");
    }

    logger?.info("🔧 [CommandParser] Quick add detected:", { input });

    try {
      const { runtimeContext, tracingContext } = buildToolExecCtx(mastra, {
        requestId: userId,
      });
      const result = await addCardTool.execute({
        context: {
          owner_id: userId,
          input: input,
          lang_front: "sv",
          lang_back: "en",
        },
        runtimeContext,
        tracingContext,
        mastra,
      });

      if (result.success && result.card) {
        return {
          response: `✅ Card added successfully!\n\n${formatCard(result.card)}\n\nUse /list to see all your cards.`,
          parse_mode: "HTML",
        };
      } else {
        return {
          response: `❌ ${result.message}`,
          parse_mode: "HTML",
        };
      }
    } catch (error) {
      logger?.error("❌ [CommandParser] Error adding card:", error);
      return {
        response: "❌ Error adding card. Please try again.",
        parse_mode: "HTML",
      };
    }
  }

  // Start guided flow if no params
  if (params.length === 0) {
    return {
      response:
        "📝 <b>Adding a new card</b>\n\nPlease enter the <b>front side</b> of your card (the word or phrase to remember):",
      conversationState: {
        mode: "add_card_guided",
        step: 1,
        data: {},
      },
      parse_mode: "HTML",
      remove_keyboard: true,
    };
  }

  // If params provided but not in quick-add format
  return {
    response:
      "❓ To add a card, use one of these formats:\n\n• <code>/add word | translation</code>\n• <code>/add word :: translation</code>\n• <code>/add</code> (for guided mode)\n\nOptionally add tags and examples:\n<code>/add word | translation | tag1,tag2 | example sentence</code>",
    parse_mode: "HTML",
  };
}
