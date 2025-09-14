import type { CommandResponse, ConversationState } from "../commandParser.js";
import { fmtStartHTML } from "../ui/format.js";

export default async function handleStartCommand(
  params: string[] = [],
  rawParams: string = "",
  userId: string = "",
  state?: ConversationState,
  mastra?: any,
): Promise<CommandResponse> {
  return {
    response: fmtStartHTML(),
    parse_mode: "HTML",
    reply_keyboard: [
      ["/add", "/practice"],
      ["/list", "/stats"],
      ["/settings"],
    ],
  };
}
