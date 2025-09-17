import type { CommandResponse } from "../commandTypes.js";
import { clearUserOptOut } from "../../lib/mlPrivacy.js";

export default async function handleOptInMlCommand(
  _params: string[],
  _rawParams: string,
  userId: string,
  _state?: unknown,
  mastra?: any,
): Promise<CommandResponse> {
  const logger = mastra?.getLogger?.();

  await clearUserOptOut(userId);
  logger?.info?.("ml_opt_in", { user_id: userId, source: "telegram_command" });

  return {
    response: [
      "Thanks! ML logging has been re-enabled for your account.",
      "",
      "We only store salted hashes of your user id and never raw identifiers.",
    ].join("\n"),
    parse_mode: "HTML",
  };
}
