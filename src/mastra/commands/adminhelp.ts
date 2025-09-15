import type { CommandResponse, ConversationState } from "../commandTypes.js";
import { isAdmin } from "../authorization.js";

const ADMIN_HELP = [
  "<b>🛠 Admin Commands</b>",
  "<code>/users</code> — list whitelisted users",
  "<code>/allow &lt;user_id&gt;</code> — add someone to the whitelist",
  "<code>/deny &lt;user_id&gt;</code> — remove someone from the whitelist",
  "<code>/invite</code> — create a one-time invite link",
  "<code>/export_users</code> — download the whitelist as CSV",
  "<code>/promote &lt;user_id&gt;</code> — grant admin rights",
  "<code>/demote &lt;user_id&gt;</code> — revoke admin rights",
  "<code>/check_ml_log [options]</code> — review ML logging status",
  "",
  "<i>Tip:</i> Use <code>/check_ml_log user:&lt;id&gt; limit:10</code> to inspect a specific user.",
].join("\n");

const DENIED_RESPONSE =
  "🚫 This command is only available to bot admins.";

export default async function handleAdminHelpCommand(
  params: string[],
  rawParams: string,
  userId: string,
  _state?: ConversationState,
  mastra?: any,
): Promise<CommandResponse> {
  const logger = mastra?.getLogger?.();

  if (!(await isAdmin(userId))) {
    logger?.info?.("adminhelp_denied", { user_id: userId });
    return { response: DENIED_RESPONSE, parse_mode: "HTML" };
  }

  const response = { response: ADMIN_HELP, parse_mode: "HTML" };
  logger?.info?.("adminhelp_sent", {
    user_id: userId,
    response_length: ADMIN_HELP.length,
  });
  return response;
}
