import type {
  ConversationState,
  CommandResponse,
  CommandContext,
} from "../commandTypes.js";
import { buildToolExecCtx } from "../context.js";
import { getDueCardsTool, startReviewTool } from "../tools/reviewTools.js";

const WEBAPP_ENABLED = process.env.WEBAPP_PRACTICE_ENABLED === "true";
const PUBLIC_WEBAPP_URL = process.env.PUBLIC_WEBAPP_URL;

function buildWebAppUrl(): string | undefined {
  if (!PUBLIC_WEBAPP_URL) return undefined;
  const trimmed = PUBLIC_WEBAPP_URL.endsWith("/")
    ? PUBLIC_WEBAPP_URL.slice(0, -1)
    : PUBLIC_WEBAPP_URL;
  return `${trimmed}/practice?session=practice`;
}

async function startInlinePractice(
  userId: string,
  mastra?: any,
): Promise<CommandResponse> {
  const logger = mastra?.getLogger();

  try {
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

    const {
      runtimeContext: startRuntimeContext,
      tracingContext: startTracingContext,
    } = buildToolExecCtx(mastra, { requestId: userId });
    const sessionId = `session_${userId}_${Date.now()}`;
    const firstCard = dueResult.cards[0];
    const cardId = firstCard.card_id;
    const startResult = await startReviewTool.execute({
      context: {
        owner_id: userId,
        card_id: cardId,
        session_id: sessionId,
      },
      runtimeContext: startRuntimeContext,
      tracingContext: startTracingContext,
      mastra,
    });

    if (startResult.success && startResult.card) {
      const card = {
        ...startResult.card,
        back: startResult.card.back ?? firstCard.back,
      };
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
            correct_streak: 0,
          },
        },
        parse_mode: "HTML",
      };
    }

    return {
      response: `❌ ${startResult.message || "Could not start review session"}`,
      parse_mode: "HTML",
    };
  } catch (error) {
    logger?.error("❌ [CommandParser] Error starting practice:", error);
    return {
      response: "❌ Error starting practice session. Please try again.",
      parse_mode: "HTML",
    };
  }
}

export default async function handlePracticeCommand(
  params: string[],
  rawParams: string,
  userId: string,
  state?: ConversationState,
  mastra?: any,
  commandContext?: CommandContext,
): Promise<CommandResponse> {
  const forceInline = params.some(
    (param) => typeof param === "string" && param.toLowerCase() === "inline",
  );

  const webAppUrl = buildWebAppUrl();
  const webAppEnabled = WEBAPP_ENABLED && !!webAppUrl;
  const chatType = commandContext?.chatType;
  const isPrivate = chatType ? chatType === "private" : true;

  if (webAppEnabled && isPrivate && !forceInline) {
    return {
      response: [
        "🧠 <b>Practice in chat</b>",
        "Use the Telegram WebApp for a faster review flow.",
        "If the WebApp doesn't open, choose inline mode instead.",
      ].join("\n"),
      parse_mode: "HTML",
      inline_keyboard: {
        inline_keyboard: [
          [
            {
              text: "🚀 Open Practice",
              web_app: { url: webAppUrl! },
            },
          ],
          [
            {
              text: "⬇ Use inline mode",
              callback_data: "practice_inline",
            },
          ],
        ],
      },
    };
  }

  return startInlinePractice(userId, mastra);
}
