import type { CommandResponse, ConversationState } from "../commandTypes.js";
import { fmtHelpHTML } from "../ui/format.js";

export default async function handleHelpCommand(
  params: string[] = [],
  rawParams: string = "",
  userId: string = "",
  state?: ConversationState,
  mastra?: any,
): Promise<CommandResponse> {
  const showKeyboard = params.includes("__with_keyboard");
  const page = params.find((p) => !p.startsWith("__"))?.toLowerCase();
  const response: CommandResponse = {
    response: fmtHelpHTML(page),
    parse_mode: "HTML",
    inline_keyboard: {
      inline_keyboard: [
        [
          { text: "📌 Core", callback_data: "/help core" },
          { text: "🗂 Cards", callback_data: "/help cards" },
        ],
        [
          { text: "⚙ Settings", callback_data: "/help settings" },
          { text: "⚡ Quick Add", callback_data: "/help quickadd" },
        ],
      ],
    },
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
