import type { CommandResponse, ConversationState } from "../commandTypes.js";
import { buildToolExecCtx } from "../context.js";
import { getDueCardsStatsTool } from "../tools/statisticsTools.js";

type RawDueStats = {
  total_cards?: number;
  new_cards?: number;
  due_cards?: number;
  learning_cards?: number;
  review_cards?: number;
  overdue_cards?: number;
  cards_due_today?: number;
  cards_due_tomorrow?: number;
  total_reviews?: number;
};

type DueStats = Required<RawDueStats>;

const DEFAULT_TIMEZONE = "Europe/Stockholm";

const safeNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

function normalizeStats(raw: RawDueStats | undefined): DueStats {
  return {
    total_cards: safeNumber(raw?.total_cards),
    new_cards: safeNumber(raw?.new_cards),
    due_cards: safeNumber(raw?.due_cards),
    learning_cards: safeNumber(raw?.learning_cards),
    review_cards: safeNumber(raw?.review_cards),
    overdue_cards: safeNumber(raw?.overdue_cards),
    cards_due_today: safeNumber(raw?.cards_due_today),
    cards_due_tomorrow: safeNumber(raw?.cards_due_tomorrow),
    total_reviews: safeNumber(raw?.total_reviews),
  };
}

function formatDashboard(stats: DueStats): string {
  return [
    "<b>Cards Due for Review</b>",
    "",
    `Total: ${stats.total_cards}`,
    `Today: ${stats.cards_due_today}`,
    `Tomorrow: ${stats.cards_due_tomorrow}`,
    `New: ${stats.new_cards}`,
    "",
    `Learning: ${stats.learning_cards}`,
    `Review: ${stats.review_cards}`,
    `Overdue: ${stats.overdue_cards}`,
    "",
    `Reviews done today: ${stats.total_reviews}`,
    "",
    "→ /practice",
    "→ /stats",
    "→ /add",
  ].join("\n");
}

function formatCompact(stats: DueStats): string {
  const summaryParts = [
    `Today: ${stats.cards_due_today} due`,
    `${stats.overdue_cards} overdue`,
    `${stats.total_reviews} done`,
  ];
  const extra = stats.new_cards > 0 ? `New: ${stats.new_cards}` : null;
  if (extra) {
    summaryParts.push(extra);
  }
  return `${summaryParts.join(" • ")} → /practice`;
}

export default async function handleDueCommand(
  params: string[],
  _rawParams: string,
  userId: string,
  _state?: ConversationState,
  mastra?: any,
): Promise<CommandResponse> {
  const logger = mastra?.getLogger?.();

  try {
    const { runtimeContext, tracingContext } = buildToolExecCtx(mastra, {
      requestId: userId,
    });
    const result = await getDueCardsStatsTool.execute({
      context: {
        owner_id: userId,
        timezone: DEFAULT_TIMEZONE,
      },
      runtimeContext,
      tracingContext,
      mastra,
    });

    if (!result.success) {
      logger?.warn?.("due_command_stats_failed", {
        user_id: userId,
        message: result.message,
      });
      return {
        response: `Error fetching due cards. ${result.message ?? "Please try again."}`,
        parse_mode: "HTML",
      };
    }

    const stats = normalizeStats(result.stats);
    const compactMode = params[0] === "compact" || params[0] === "short";

    if (compactMode) {
      return {
        response: formatCompact(stats),
        parse_mode: "HTML",
      };
    }

    return {
      response: formatDashboard(stats),
      parse_mode: "HTML",
      inline_keyboard: {
        inline_keyboard: [
          [
            { text: "Start practice", callback_data: "practice_now" },
            { text: "Add card", callback_data: "add_card" },
            { text: "Export", callback_data: "export:cards" },
          ],
          [
            { text: "Only learning", callback_data: "practice_learning" },
            { text: "Only new", callback_data: "practice_new" },
            { text: "Overdue", callback_data: "practice_overdue" },
          ],
        ],
      },
    };
  } catch (error) {
    logger?.error?.("due_command_failed", {
      user_id: userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      response: "Error fetching due cards. Please try again.",
      parse_mode: "HTML",
    };
  }
}
