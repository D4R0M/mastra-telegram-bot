import type { CommandResponse, ConversationState } from "../commandTypes.js";
import { allowUser, isAdmin } from "../authorization.js";

export default async function handleAllowCommand(
  params: string[],
  rawParams: string,
  userId: string,
  _state?: ConversationState,
  mastra?: any,
): Promise<CommandResponse> {
  const logger = mastra?.getLogger();
  if (!(await isAdmin(userId))) {
    return { response: "Not authorized", parse_mode: "HTML" };
  }
  const target = params[0];
  const note = params.slice(1).join(" ") || undefined;
  if (!target) {
    return {
      response: "Provide user id or forward a message from the user and retry.",
      parse_mode: "HTML",
    };
  }
  await allowUser(target, null, note, userId);
  logger?.info("allow_user", { by: userId, target, note });
  return { response: `✅ ${target} allowed`, parse_mode: "HTML" };
}
