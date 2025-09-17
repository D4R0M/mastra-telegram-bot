import type { CommandResponse } from "../commandTypes.js";
import { isAdmin } from "../authorization.js";
import { fetch24hTotals, fetchLatestEvent, fetchOptOutCount } from "../../db/reviewEvents.js";
import { isMlLoggingEnabled } from "../../lib/mlPrivacy.js";

function escapeHtml(value: string): string {
  return value.replace(/[&<>]/g, (match) => {
    switch (match) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      default:
        return match;
    }
  });
}

export default async function handleCheckMlLogCommand(
  _params: string[],
  _rawParams: string,
  userId: string,
  _state?: unknown,
  mastra?: any,
): Promise<CommandResponse> {
  const logger = mastra?.getLogger?.();
  const admin = await isAdmin(userId);
  if (!admin) {
    return {
      response: "Not authorized.",
      parse_mode: "HTML",
    };
  }

  try {
    const [totals, latest, optOutCount] = await Promise.all([
      fetch24hTotals(),
      fetchLatestEvent(),
      fetchOptOutCount(),
    ]);

    const payload = {
      logging_enabled: isMlLoggingEnabled(),
      opted_out_users: optOutCount,
      totals_24h: totals,
      latest_event: latest,
    };

    const jsonBody = escapeHtml(JSON.stringify(payload, null, 2));

    logger?.info?.("check_ml_log_summary", {
      totals,
      opted_out_users: optOutCount,
      has_latest: Boolean(latest),
    });

    return {
      response: `<pre><code>${jsonBody}</code></pre>`,
      parse_mode: "HTML",
    };
  } catch (error) {
    logger?.error?.("check_ml_log_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      response: "Failed to fetch ML log summary.",
      parse_mode: "HTML",
    };
  }
}
