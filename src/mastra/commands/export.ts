import type { CommandResponse, ConversationState } from "../commandTypes.js";
import { buildToolExecCtx } from "../context.js";
import { exportCSVTool, parseCSV } from "../tools/importExportTools.js";

export default async function handleExportCommand(
  params: string[],
  rawParams: string,
  userId: string,
  state?: ConversationState,
  mastra?: any,
): Promise<CommandResponse> {
  const logger = mastra?.getLogger();

  try {
    let idx = 0;
    if (params[0]?.toLowerCase() === "csv") {
      idx = 1;
    }
    const action = params[idx]?.toLowerCase();
    let dueOnly = false;
    let tags: string[] | undefined;

    if (action === "due") {
      dueOnly = true;
    } else if (action === "tag") {
      const tag = params.slice(idx + 1).join(" ");
      if (tag) tags = [tag];
    } else if (action && action !== "all") {
      return {
        response: "❓ Unsupported export option.",
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
        tags_filter: tags,
        due_only: dueOnly,
      },
      runtimeContext,
      tracingContext,
      mastra,
    });

    if (result.success && result.csv_data) {
      const rows = parseCSV(result.csv_data);
      const dataRows = rows.slice(1);
      const previewRows = dataRows.slice(0, 3);
      const previewText = previewRows
        .map((r, i) => `${i + 1}️⃣ ${r[0]} → ${r[1]}`)
        .join("\n");

      return {
        response: `📂 CSV Export Ready\nTotal cards: ${result.card_count}\nPreview (first ${previewRows.length} of ${result.card_count}):\n\n${previewText}\n\n💡 Use the buttons below to get your full CSV.`,
        parse_mode: "HTML",
        inline_keyboard: {
          inline_keyboard: [
            [
              { text: "⬇ Download CSV", callback_data: "export:download" },
              { text: "📋 Copy Preview", callback_data: "export:copy" },
            ],
            [{ text: "🔄 Export Options", callback_data: "export:options" }],
          ],
        },
        conversationState: {
          mode: "export_csv",
          data: {
            csv: result.csv_data,
            preview: previewText,
            filename: result.filename_suggestion || "cards_export.csv",
          },
        },
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
