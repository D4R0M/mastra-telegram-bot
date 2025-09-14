import type { CommandResponse, ConversationState } from "../commandParser.js";
import {
  getReviewStats,
  formatStatsMessage,
  exportReviewsCsv,
  type ReviewRange,
} from "../../stats/reviews.js";
import { AUTHORIZED_TELEGRAM_USER_IDS } from "../authorization.js";

const OWNER_ID =
  process.env.BOT_OWNER_ID || Array.from(AUTHORIZED_TELEGRAM_USER_IDS)[0];

function parseRange(r?: string): ReviewRange {
  if (r === "today" || r === "7d" || r === "30d" || r === "all") return r;
  return "7d";
}

export default async function handleCheckReviewsCommand(
  params: string[],
  rawParams: string,
  userId: string,
  state?: ConversationState,
  mastra?: any,
): Promise<CommandResponse> {
  const logger = mastra?.getLogger();
  if (String(userId) !== String(OWNER_ID)) {
    return { response: "This command is restricted.", parse_mode: "Markdown" };
  }

  const range = parseRange(params[0]);
  try {
    const stats = await getReviewStats(range);
    const { text, keyboard } = formatStatsMessage({ ...stats, range });
    return { response: text, parse_mode: "Markdown", inline_keyboard: keyboard };
  } catch (err) {
    logger?.error("check_reviews_error", err);
    return { response: "Couldn't load review stats", parse_mode: "Markdown" };
  }
}

export async function handleCheckReviewsExport(
  range: ReviewRange,
  userId: string,
  mastra?: any,
): Promise<CommandResponse> {
  const logger = mastra?.getLogger();
  if (String(userId) !== String(OWNER_ID)) {
    return { response: "This command is restricted.", parse_mode: "Markdown" };
  }
  try {
    const { buffer, filename } = await exportReviewsCsv(range);
    return {
      response: "Here is your export.",
      parse_mode: "Markdown",
      document: { filename, content: buffer.toString("utf8") },
    };
  } catch (err) {
    logger?.error("check_reviews_export_error", err);
    return { response: "Couldn't export review stats", parse_mode: "Markdown" };
  }
}
