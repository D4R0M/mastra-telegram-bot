import type { CommandResponse, ConversationState } from "../commandTypes.js";
import { denyUser, isAdmin } from "../authorization.js";

export default async function handleDenyCommand(
  params: string[],
  rawParams: string,
  userId: string,
  _state?: ConversationState,
  mastra?: any,
): Promise<CommandResponse> {
  const logger = mastra?.getLogger();
  if (!(await isAdmin(userId))) {
    return { response: "Not authorized.", parse_mode: "HTML" };
  }
  const target = params[0];
  if (!target) {
    return {
      response: "Provide user id or forward a message from the user and retry.",
      parse_mode: "HTML",
    };
  }
  await denyUser(target);
  logger?.info("deny_user", { by: userId, target });
  return { response: `🚫 ${target} removed`, parse_mode: "HTML" };
}
