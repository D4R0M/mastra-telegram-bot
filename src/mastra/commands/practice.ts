import type {
  ConversationState,
  CommandResponse,
  CommandContext,
} from "../commandTypes.js";
import { buildToolExecCtx } from "../context.js";
import { getDueCardsTool, startReviewTool } from "../tools/reviewTools.js";
import { getUserSettingsTool } from "../tools/settingsTools.js";

const WEBAPP_ENABLED = process.env.WEBAPP_PRACTICE_ENABLED === "true";
const PUBLIC_WEBAPP_URL = process.env.PUBLIC_WEBAPP_URL;

type PracticeFilter = "learning" | "new" | "overdue";

const PRACTICE_FILTERS: PracticeFilter[] = [
  "learning",
  "new",
  "overdue",
];

function isPracticeFilter(value: string): value is PracticeFilter {
  return (PRACTICE_FILTERS as ReadonlyArray<string>).includes(value);
}

const PRACTICE_FILTER_LABELS: Record<PracticeFilter, string> = {
  learning: "Learning cards only",
  new: "New cards only",
  overdue: "Overdue cards only",
};

const PRACTICE_FILTER_EMPTY_MESSAGES: Record<PracticeFilter, string> = {
  learning:
    "🎉 No learning cards are due for review right now!\n\nTake a breather or run /practice to see everything that's due.",
  new:
    "🎉 No new cards are ready right now!\n\nAdd fresh vocabulary with <code>/add</code> or review due cards with /practice.",
  overdue:
    "🎉 Amazing! You have no overdue cards!\n\nKeep up the momentum with a regular /practice session.",
};

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
  options?: { filter?: PracticeFilter },
): Promise<CommandResponse> {
  const logger = mastra?.getLogger();
  const filter = options?.filter;
  const queue = filter === "learning" ? "learning" : filter === "new" ? "new" : undefined;
  const overdueOnly = filter === "overdue";
  let includeNewCards: boolean | undefined;
  if (filter === "new") {
    includeNewCards = true;
  } else if (filter) {
    includeNewCards = false;
  }
  let sessionSize = 10;

  try {
    try {
      const {
        runtimeContext: settingsRuntimeContext,
        tracingContext: settingsTracingContext,
      } = buildToolExecCtx(mastra, { requestId: userId });
      const settingsResult = await getUserSettingsTool.execute({
        context: { user_id: userId },
        runtimeContext: settingsRuntimeContext,
        tracingContext: settingsTracingContext,
        mastra,
      });

      if (settingsResult.success && settingsResult.settings) {
        sessionSize = settingsResult.settings.session_size ?? sessionSize;
        if (includeNewCards === undefined) {
          includeNewCards = settingsResult.settings.daily_new_limit > 0;
        }
      } else if (includeNewCards === undefined) {
        includeNewCards = true;
      }
    } catch (settingsError) {
      logger?.warn?.("practice_settings_fetch_failed", {
        error:
          settingsError instanceof Error
            ? settingsError.message
            : String(settingsError),
      });
      if (includeNewCards === undefined) {
        includeNewCards = true;
      }
    }

    if (includeNewCards === undefined) {
      includeNewCards = true;
    }

    const { runtimeContext, tracingContext } = buildToolExecCtx(mastra, {
      requestId: userId,
    });
    const dueResult = await getDueCardsTool.execute({
      context: {
        owner_id: userId,
        limit: sessionSize,
        include_new: includeNewCards,
        queue,
        overdue_only: overdueOnly,
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
      const emptyMessage = filter
        ? PRACTICE_FILTER_EMPTY_MESSAGES[filter]
        : "🎉 No cards are due for review right now!\n\nYour vocabulary is all up to date. Come back later or add new cards with <code>/add</code>.";
      return {
        response: emptyMessage,
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
      const filterLine = filter
        ? `\n🎯 Filter: ${PRACTICE_FILTER_LABELS[filter]}`
        : "";
      return {
        response: `📚 <b>Review Session Started!</b>\nCards in session: ${totalCards}${filterLine}\n\n<b>Card ${currentIndex}/${totalCards}</b>\n\n❓ <b>${card.front}</b>\n\n<i>Try to recall the answer, then type your response or type "show" to reveal.</i>`,
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
            filter,
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
  const normalizedParams = params
    .filter((param): param is string => typeof param === "string")
    .map((param) => param.toLowerCase());

  const filter = normalizedParams.find(isPracticeFilter);

  const forceInline = normalizedParams.includes("inline");
  const shouldForceInline = forceInline || !!filter;

  const webAppUrl = buildWebAppUrl();
  const webAppEnabled = WEBAPP_ENABLED && !!webAppUrl;
  const chatType = commandContext?.chatType;
  const isPrivate = chatType ? chatType === "private" : true;

  if (webAppEnabled && isPrivate && !shouldForceInline) {
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

  return startInlinePractice(userId, mastra, { filter });
}
