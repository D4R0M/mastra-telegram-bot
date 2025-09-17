import type { CommandResponse, ConversationState } from "../commandTypes.js";
import { fmtDueHTML, type DueSummary } from "../ui/format.js";
import { getDueSummary } from "../../services/srs/getDueSummary.js";

function toUserId(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
}

function compactSummary(summary: DueSummary): string {
  const totalDue = summary.dueToday + summary.overdueCount;
  return `Today: ${summary.dueToday} due | ${summary.overdueCount} overdue | ${summary.reviewedToday} done — /practice (${totalDue} left)`;
}

export default async function handleDueCommand(
  params: string[],
  _rawParams: string,
  userId: string,
  _state?: ConversationState,
  mastra?: any,
): Promise<CommandResponse> {
  const logger = mastra?.getLogger?.();
  const numericId = toUserId(userId);

  if (numericId === null) {
    logger?.warn?.("due_command_invalid_user", { user_id: userId });
    return {
      response: "Could not determine your account id.",
      parse_mode: "HTML",
    };
  }

  try {
    const summary = await getDueSummary(numericId);

    if (params[0] === "compact" || params[0] === "short") {
      return {
        response: compactSummary(summary),
        parse_mode: "HTML",
      };
    }

    return {
      response: fmtDueHTML(summary),
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
      user_id: numericId,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      response: "Error fetching due cards. Please try again.",
      parse_mode: "HTML",
    };
  }
}
