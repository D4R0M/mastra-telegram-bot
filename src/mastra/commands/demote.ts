import type { CommandResponse, ConversationState } from "../commandTypes.js";
import { isAdmin, demoteUser } from "../authorization.js";

export default async function handleDemoteCommand(
  params: string[],
  rawParams: string,
  userId: string,
  _state?: ConversationState,
  mastra?: any,
): Promise<CommandResponse> {
  if (!(await isAdmin(userId))) {
    return { response: "Not authorized.", parse_mode: "HTML" };
  }
  const target = params[0];
  if (!target) {
    return { response: "Provide user id to demote.", parse_mode: "HTML" };
  }
  await demoteUser(target);
  return { response: `✅ ${target} demoted`, parse_mode: "HTML" };
}
