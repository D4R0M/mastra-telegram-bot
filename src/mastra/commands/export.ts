import type { CommandResponse, ConversationState } from "../commandParser.js";
import { buildToolExecCtx } from "../context.js";
import { exportCSVTool } from "../tools/importExportTools.js";

export default async function handleExportCommand(
  params: string[],
  rawParams: string,
  userId: string,
  state?: ConversationState,
  mastra?: any,
): Promise<CommandResponse> {
  const logger = mastra?.getLogger();

  try {
    const format = params[0]?.toLowerCase() || "csv";

    if (format !== "csv") {
      return {
        response:
          "❓ Currently only CSV export is supported:\n<code>/export csv</code>",
        parse_mode: "HTML",
      };
    }

    const { runtimeContext, tracingContext } = buildToolExecCtx(mastra, {
      requestId: userId,
    });
    const result = await exportCSVTool.execute({
      context: {
        owner_id: userId,
        include_inactive: false,
        limit: 1000,
      },
      runtimeContext,
      tracingContext,
      mastra,
    });

    if (result.success && result.csv_data) {
      // In a real implementation, you would send this as a file
      // For now, we'll return a truncated preview
      const lines = result.csv_data.split("\n");
      const preview = lines.slice(0, 5).join("\n");

      return {
        response: `📄 <b>CSV Export Ready</b>\n\nTotal cards: ${result.card_count}\n\n<b>Preview:</b>\n<code>${preview}</code>\n\n<i>Full CSV data has ${lines.length} lines.</i>`,
        parse_mode: "HTML",
      };
    } else {
      return {
        response: `❌ ${result.message || "Could not export cards"}`,
        parse_mode: "HTML",
      };
    }
  } catch (error) {
    logger?.error("❌ [CommandParser] Error exporting cards:", error);
    return {
      response: "❌ Error exporting cards. Please try again.",
      parse_mode: "HTML",
    };
  }
}
