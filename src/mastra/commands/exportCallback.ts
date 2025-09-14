import type { CommandResponse, ConversationState } from "../commandParser.js";

export async function handleExportCallback(
  action: string,
  state: ConversationState | undefined,
): Promise<CommandResponse> {
  const csv = state?.data?.csv as string | undefined;
  const preview = state?.data?.preview as string | undefined;
  const filename = (state?.data?.filename as string) || "cards_export.csv";

  if (action === "download") {
    if (!csv) {
      return { response: "❌ No export data available.", parse_mode: "HTML" };
    }
    return {
      response: "Here is your CSV export.",
      document: { filename, content: csv },
      conversationState: state,
    };
  }

  if (action === "copy") {
    if (!preview) {
      return { response: "❌ No preview available.", parse_mode: "HTML", conversationState: state };
    }
    return {
      response: `<code>${preview}</code>`,
      parse_mode: "HTML",
      conversationState: state,
    };
  }

  return {
    response: "Export options coming soon.",
    parse_mode: "HTML",
    conversationState: state,
  };
}
