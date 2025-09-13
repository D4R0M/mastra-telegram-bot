import type { ConversationState, CommandResponse } from "../commandParser.js";
import { buildToolExecCtx } from "../context.js";
import { getDueCardsTool, startReviewTool } from "../tools/reviewTools.js";

export default async function handlePracticeCommand(
  params: string[],
  rawParams: string,
  userId: string,
  state?: ConversationState,
  mastra?: any,
): Promise<CommandResponse> {
  const logger = mastra?.getLogger();

  try {
    // Get due cards
    const { runtimeContext, tracingContext } = buildToolExecCtx(mastra, {
      requestId: userId,
    });
    const dueResult = await getDueCardsTool.execute({
      context: {
        owner_id: userId,
        limit: 10,
        include_new: true,
      },
      runtimeContext,
      tracingContext,
      mastra,
    });

    if (
      !dueResult.success ||
      !dueResult.cards ||
      dueResult.cards.length === 0
    ) {
      return {
        response:
          "🎉 No cards are due for review right now!\n\nYour vocabulary is all up to date. Come back later or add new cards with <code>/add</code>.",
        parse_mode: "HTML",
      };
    }

    // Start review session
    const {
      runtimeContext: startRuntimeContext,
      tracingContext: startTracingContext,
    } = buildToolExecCtx(mastra, { requestId: userId });
    const startResult = await startReviewTool.execute({
      context: {
        owner_id: userId,
        card_id: dueResult.cards[0].card_id, // Start with first due card
        session_id: `session_${userId}_${Date.now()}`,
      },
      runtimeContext: startRuntimeContext,
      tracingContext: startTracingContext,
      mastra,
    });

    if (startResult.success && startResult.card) {
      // Ensure we retain the back side of the card in the session state
      const card = {
        ...startResult.card,
        back: startResult.card.back ?? dueResult.cards[0].back,
      };
      const sessionId = `session_${userId}_${Date.now()}`;
      const currentIndex = 1;
      const totalCards = dueResult.cards.length;
      return {
        response: `📚 <b>Review Session Started!</b>\nCards in session: ${totalCards}\n\n<b>Card ${currentIndex}/${totalCards}</b>\n\n❓ <b>${card.front}</b>\n\n<i>Try to recall the answer, then type your response or type "show" to reveal.</i>`,
        conversationState: {
          mode: "review_session",
          step: 1,
          data: {
            session_id: sessionId,
            current_card: card,
            current_index: currentIndex,
            total_cards: totalCards,
            all_cards: dueResult.cards,
            start_time: startResult.start_time,
          },
        },
        parse_mode: "HTML",
        remove_keyboard: true,
      };
    } else {
      return {
        response: `❌ ${startResult.message || "Could not start review session"}`,
        parse_mode: "HTML",
      };
    }
  } catch (error) {
    logger?.error("❌ [CommandParser] Error starting practice:", error);
    return {
      response: "❌ Error starting practice session. Please try again.",
      parse_mode: "HTML",
    };
  }
}
