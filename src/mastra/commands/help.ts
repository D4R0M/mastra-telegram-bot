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
    inline_keyboard: {
      inline_keyboard: [
        [
          { text: "▶️ Practice now", callback_data: "practice_now" },
          { text: "➕ Add card", callback_data: "add_card" },
        ],
        [
          { text: "⚙️ Settings", callback_data: "/settings" },
          { text: "📊 Stats", callback_data: "/stats" },
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
