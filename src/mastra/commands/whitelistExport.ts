import type { CommandResponse, ConversationState } from "../commandTypes.js";
import { isAdmin, exportAllowed } from "../authorization.js";

export default async function handleWhitelistExport(
  params: string[],
  rawParams: string,
  userId: string,
  _state?: ConversationState,
  mastra?: any,
): Promise<CommandResponse> {
  if (!(await isAdmin(userId))) {
    return { response: "Not authorized", parse_mode: "HTML" };
  }
  const users = await exportAllowed();
  const rows = ["user_id,username,role,added_at,note"];
  for (const u of users) {
    rows.push(
      `${u.user_id},${u.username || ''},${u.role},${u.added_at.toISOString()},${u.note || ''}`,
    );
  }
  const csv = rows.join("\n");
  return {
    response: "Whitelist export",
    document: { filename: "whitelist.csv", content: csv },
  };
}
