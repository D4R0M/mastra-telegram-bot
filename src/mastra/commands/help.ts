import type { CommandResponse, ConversationState } from "../commandParser.js";
import { fmtHelpHTML } from "../ui/format.js";

export default async function handleHelpCommand(
  params: string[] = [],
  rawParams: string = "",
  userId: string = "",
  state?: ConversationState,
  mastra?: any,
): Promise<CommandResponse> {
  const showKeyboard = params.includes("__with_keyboard");
  const response: CommandResponse = {
    response: fmtHelpHTML(),
    parse_mode: "HTML",
  };

  if (showKeyboard) {
    response.reply_keyboard = [
      ["/add", "/practice"],
      ["/list", "/stats"],
      ["/settings"],
    ];
  }

  return response;
}
