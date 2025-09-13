import type { CommandResponse, ConversationState } from "../commandParser.js";
import { buildToolExecCtx } from "../context.js";
import { getComprehensiveStatsTool } from "../tools/statisticsTools.js";
import { formatStatistics } from "./utils.js";

export default async function handleStatsCommand(
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
    const result = await getComprehensiveStatsTool.execute({
      context: {
        owner_id: userId,
        timezone: "Europe/Stockholm",
        success_threshold: 3,
      },
      runtimeContext,
      tracingContext,
      mastra,
    });

    if (result.success && result.stats) {
      const stats = result.stats;
      return {
        response: formatStatistics(stats),
        parse_mode: "HTML",
      };
    } else {
      return {
        response: `❌ ${result.message || "Could not fetch statistics"}`,
        parse_mode: "HTML",
      };
    }
  } catch (error) {
    logger?.error("❌ [CommandParser] Error fetching stats:", error);
    return {
      response: "❌ Error fetching statistics. Please try again.",
      parse_mode: "HTML",
    };
  }
}
