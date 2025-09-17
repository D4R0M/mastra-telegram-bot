import type { CommandResponse } from "../commandTypes.js";
import { isMlLoggingEnabled, isUserOptedOut } from "../../lib/mlPrivacy.js";

export default async function handlePrivacyCommand(
  _params: string[],
  _rawParams: string,
  userId: string,
): Promise<CommandResponse> {
  const loggingEnabled = isMlLoggingEnabled();
  const optedOut = await isUserOptedOut(userId);

  const statusLine = loggingEnabled
    ? optedOut
      ? "<b>Status:</b> ML logging is <b>paused</b> for your account."
      : "<b>Status:</b> ML logging is <b>enabled</b> for your account."
    : "<b>Status:</b> ML logging is <b>disabled globally</b>.";

  const actionLine = loggingEnabled
    ? optedOut
      ? "Use <code>/optin_ml</code> if you want to re-enable logging."
      : "Use <code>/optout_ml</code> to stop contributing anonymised review events."
    : "You do not need to do anything right now.";

  return {
    response: [
      "<b>Privacy controls</b>",
      statusLine,
      actionLine,
      "",
      "Logging only stores a salted hash of your account id and never raw PII.",
    ].join("\n"),
    parse_mode: "HTML",
  };
}
