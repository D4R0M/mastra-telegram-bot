import type { CommandResponse, ConversationState } from "../commandParser.js";
import { buildToolExecCtx } from "../context.js";
import { getStreakStatsTool } from "../tools/statisticsTools.js";
import { fmtStreakHTML } from "../ui/format.js";

export default async function handleStreakCommand(
  params: string[],
  rawParams: string,
  userId: string,
  state?: ConversationState,
  mastra?: any,
): Promise<CommandResponse> {
  const logger = mastra?.getLogger();

  try {
    const { runtimeContext, tracingContext } = buildToolExecCtx(mastra, {
      requestId: userId,
    });
    const result = await getStreakStatsTool.execute({
      context: {
        owner_id: userId,
        timezone: "Europe/Stockholm",
      },
      runtimeContext,
      tracingContext,
      mastra,
    });

    if (result.success && result.stats) {
      const message = fmtStreakHTML(result.stats);

      const inline_keyboard = {
        inline_keyboard: [
          [
            { text: "▶️ Practice now", callback_data: "practice_now" },
            { text: "📊 Stats", callback_data: "/stats" },
          ],
        ],
      };

      return {
        response: message,
        parse_mode: "HTML",
        inline_keyboard,
      };
    } else {
      return {
        response: `❌ ${result.message || "Could not fetch streak data"}`,
        parse_mode: "HTML",
      };
    }
  } catch (error) {
    logger?.error("❌ [CommandParser] Error fetching streak:", error);
    return {
      response: "❌ Error fetching streak data. Please try again.",
      parse_mode: "HTML",
    };
  }
}
