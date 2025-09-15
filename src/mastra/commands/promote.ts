import type { CommandResponse, ConversationState } from "../commandTypes.js";
import { isAdmin, promoteUser } from "../authorization.js";

export default async function handlePromoteCommand(
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
    return { response: "Provide user id to promote.", parse_mode: "HTML" };
  }
  await promoteUser(target);
  return { response: `✅ ${target} promoted`, parse_mode: "HTML" };
}
