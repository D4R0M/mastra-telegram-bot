import type { CommandResponse, ConversationState } from "../commandTypes.js";
import { fmtStartHTML } from "../ui/format.js";
import { consumeInvite } from "../authorization.js";

export default async function handleStartCommand(
  params: string[] = [],
  rawParams: string = "",
  userId: string = "",
  state?: ConversationState,
  mastra?: any,
): Promise<CommandResponse> {
  const code = params[0];
  if (code) {
    const entry = consumeInvite(code, userId);
    if (entry) {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (token) {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: entry.adminId,
            text: `User ${userId} requests access`,
            reply_markup: {
              inline_keyboard: [
                [
                  { text: "Approve", callback_data: `invite:${code}:approve` },
                  { text: "Reject", callback_data: `invite:${code}:reject` },
                ],
              ],
            },
          }),
        }).catch(() => {});
      }
      return {
        response: "Request sent to admin. Please wait for approval.",
        parse_mode: "HTML",
      };
    }
  }
  return {
    response: fmtStartHTML(),
    parse_mode: "HTML",
    reply_keyboard: [
      ["/add", "/practice"],
      ["/cards", "/stats"],
      ["/settings"],
    ],
  };
}
