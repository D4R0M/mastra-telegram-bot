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

const formatNumber = (value: number): string =>
  new Intl.NumberFormat("en-US").format(value);

const emphasizeValue = (value: number): string => `<b>${formatNumber(value)}</b>`;

const formatOverdueLine = (value: number): string => {
  const icon = value > 0 ? "🔥" : "✅";
  const label = value > 0 ? "Overdue" : "Overdue cleared";
  return `• ${label}: ${emphasizeValue(value)} ${icon}`.trim();
};

function formatDashboard(stats: DueStats): string {
  const newCardsIcon = stats.new_cards > 0 ? "✨" : "📦";
  const learningIcon = stats.learning_cards > 0 ? "📘" : "📗";
  const reviewIcon = stats.review_cards > 0 ? "🧠" : "🫙";

  const lines = [
    "📚 <b>Review Dashboard</b>",
    "━━━━━━━━━━━━━━━━━━━━",
    "<b>📅 Schedule</b>",
    `• Today: ${emphasizeValue(stats.cards_due_today)}`,
    `• Tomorrow: ${emphasizeValue(stats.cards_due_tomorrow)}`,
    formatOverdueLine(stats.overdue_cards),
    "",
    "<b>🗂️ Card Types</b>",
    `• Total: ${emphasizeValue(stats.total_cards)}`,
    `• ${newCardsIcon} New ready: ${emphasizeValue(stats.new_cards)}`,
    `• ${learningIcon} Learning: ${emphasizeValue(stats.learning_cards)}`,
    `• ${reviewIcon} Review: ${emphasizeValue(stats.review_cards)}`,
    "",
    "<b>🏁 Progress</b>",
    `• Reviews logged today: ${emphasizeValue(stats.total_reviews)}`,
    "",
    "<i>Tip: Tap a shortcut below to jump back into practice.</i>",
  ];

  return lines.join("\n");
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
            { text: "⚡ Practice now", callback_data: "practice_now" },
            { text: "➕ Add card", callback_data: "add_card" },
            { text: "📤 Export", callback_data: "export:cards" },
          ],
          [
            { text: "📘 Learning", callback_data: "practice_learning" },
            { text: "🆕 New", callback_data: "practice_new" },
            { text: "🔥 Overdue", callback_data: "practice_overdue" },
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
