import type { CommandResponse } from "../commandTypes.js";
import { setUserOptOut } from "../../lib/mlPrivacy.js";

export default async function handleOptOutMlCommand(
  _params: string[],
  _rawParams: string,
  userId: string,
  _state?: unknown,
  mastra?: any,
): Promise<CommandResponse> {
  const logger = mastra?.getLogger?.();

  await setUserOptOut(userId, "telegram_command");
  logger?.info?.("ml_opt_out", { user_id: userId, source: "telegram_command" });

  return {
    response: [
      "You have opted out of ML logging.",
      "",
      "We'll stop writing new review events for training, but existing events remain in analytics.",
      "Use <code>/optin_ml</code> to re-enable logging anytime.",
    ].join("\n"),
    parse_mode: "HTML",
  };
}
