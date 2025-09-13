import type { CommandResponse, ConversationState } from "../commandParser.js";

export default async function handleHelpCommand(
  params: string[] = [],
  rawParams: string = "",
  userId: string = "",
  state?: ConversationState,
  mastra?: any,
): Promise<CommandResponse> {
  const helpText = [
    "📚 <b>Vocabulary Learning Bot Commands</b>\n",
    "<b>Core Commands:</b>",
    "/add - Add a new vocabulary card",
    "/practice - Start a review session",
    "/list - Show all your cards",
    "/due - Check cards due for review",
    "/stats - View your learning statistics",
    "/streak - Check your study streak",
    "",
    "<b>Card Management:</b>",
    "/edit [id] - Edit a card",
    "/delete [id] - Delete a card",
    "/export csv - Export cards to CSV",
    "/import - Import cards from CSV",
    "",
    "<b>Settings:</b>",
    "/settings - View your settings",
    "/reset - Reset settings to defaults",
    "",
    "<b>Quick Add Formats:</b>",
    "/add word | translation",
    "/add word :: translation",
    "/add word | translation | tags | example",
    "",
    "<i>During reviews, grade yourself 0-5:</i>",
    "0 = Complete failure",
    "1 = Incorrect, saw answer",
    "2 = Incorrect, but easy",
    "3 = Correct, difficult",
    "4 = Correct, hesitated",
    "5 = Perfect recall",
  ];

  const showKeyboard = params.includes("__with_keyboard");
  const response: CommandResponse = {
    response: helpText.join("\n"),
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
