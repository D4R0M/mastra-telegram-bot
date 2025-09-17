import type {
  ConversationState,
  CommandResponse,
  CommandContext,
} from "../commandTypes.js";
import { buildToolExecCtx } from "../context.js";
import { getDueCardsTool, startReviewTool } from "../tools/reviewTools.js";
import { getUserSettingsTool } from "../tools/settingsTools.js";
import { logReviewEvent } from "../../lib/mlLogger.js";

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

  try {
    const url = new URL(PUBLIC_WEBAPP_URL);
    const normalizedPath = url.pathname.replace(/\/+$/, "");
    if (!normalizedPath || normalizedPath === "/") {
      url.pathname = "/practice";
    } else {
      url.pathname = normalizedPath;
    }
    if (!url.searchParams.has("session")) {
      url.searchParams.set("session", "practice");
    }
    return url.toString();
  } catch {
    const trimmed = PUBLIC_WEBAPP_URL.replace(/\/+$/, "");
    const base = trimmed.endsWith("/practice") ? trimmed : `${trimmed}/practice`;
    return `${base}?session=practice`;
  }
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
        position_in_session: 1,
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
        ? `
Filter: ${PRACTICE_FILTER_LABELS[filter]}`
        : "";
      const mlSource = filter
        ? `practice_filter:${filter}`
        : "practice_inline";

      await logReviewEvent({
        mode: "telegram_inline",
        action: "presented",
        session_id: sessionId,
        attempt: 0,
        hint_count: 0,
        latency_ms: 0,
        userId,
        card_id: card.id,
        sm2_before: startResult.sm2 ?? null,
        client: "bot",
        source: mlSource,
        logger,
      });

      return {
        response: `<b>Review Session Started!</b>
Cards in session: ${totalCards}${filterLine}

<b>Card ${currentIndex}/${totalCards}</b>

<b>${card.front}</b>

<i>Try to recall the answer, then type your response or type "show" to reveal.</i>`,
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
            ml_attempts: 0,
            ml_hints: 0,
            ml_answer_text: null,
            ml_answer_logged: false,
            ml_sm2_before: startResult.sm2 ?? null,
            ml_source: mlSource,
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
