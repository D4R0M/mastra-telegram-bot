import type { CommandResponse, ConversationState } from "../commandTypes.js";
import { isAdmin, listAllowed } from "../authorization.js";

export default async function handleUsersCommand(
  params: string[],
  rawParams: string,
  userId: string,
  _state?: ConversationState,
  mastra?: any,
): Promise<CommandResponse> {
  if (!(await isAdmin(userId))) {
    return { response: "Not authorized.", parse_mode: "HTML" };
  }
  const page = parseInt(params[0] || "1", 10);
  const users = await listAllowed(isNaN(page) ? 1 : page);
  if (!users.length) {
    return { response: "(empty)", parse_mode: "HTML" };
  }
  const lines = users.map(
    (u) => `${u.user_id} | ${u.username || ""} | ${u.role} | ${u.note || ""}`,
  );
  return {
    response: lines.join("\n"),
    parse_mode: "HTML",
  };
}
