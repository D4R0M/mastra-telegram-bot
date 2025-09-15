import type { CommandResponse, ConversationState } from "../commandTypes.js";
import { isAdmin } from "../authorization.js";

const ADMIN_HELP = [
  "<b>🛠 Admin Commands</b>",
  "/users - list whitelisted users",
  "/allow <user_id> - add to whitelist",
  "/deny <user_id> - remove from whitelist",
  "/invite - create one-time invite link",
  "/export_users - export whitelist CSV",
  "/promote <user_id> - grant admin rights",
  "/demote <user_id> - revoke admin rights",
  "/check_ml_log - review ML logging status",
].join("\n");

export default async function handleAdminHelpCommand(
  params: string[],
  rawParams: string,
  userId: string,
  _state?: ConversationState,
  mastra?: any,
): Promise<CommandResponse> {
  if (!(await isAdmin(userId))) {
    return { response: "Not authorized.", parse_mode: "HTML" };
  }
  return { response: ADMIN_HELP, parse_mode: "HTML" };
}
