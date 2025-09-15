import type { CommandResponse, ConversationState } from "../commandTypes.js";
import { generateInvite, isAdmin } from "../authorization.js";

export default async function handleInviteCommand(
  params: string[],
  rawParams: string,
  userId: string,
  _state?: ConversationState,
  mastra?: any,
): Promise<CommandResponse> {
  if (!(await isAdmin(userId))) {
    return { response: "Not authorized.", parse_mode: "HTML" };
  }
  const code = generateInvite(userId);
  const botName = process.env.TELEGRAM_BOT_USERNAME || "";
  const link = botName ? `https://t.me/${botName}?start=${code}` : code;
  return { response: link, parse_mode: "HTML" };
}
