import type { CommandResponse } from "../commandTypes.js";
import { isAdmin } from "../authorization.js";
import { fetchLatestEvent, countEventsForUser } from "../../db/reviewEvents.js";
import { hashUserId } from "../../lib/mlPrivacy.js";
import {
  shouldLogML,
  isMlHashSaltConfigured,
} from "../../ml/shouldLogML.js";

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

function parseUserId(raw: string): string | null {
  const match = raw.match(/user:(\d+)/i);
  return match ? match[1] : null;
}

export default async function handleCheckMlLogCommand(
  _params: string[],
  rawParams: string,
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
    const latest = await fetchLatestEvent();
    const userParam = parseUserId(rawParams);

    let totalEventsForUser = 0;
    if (userParam) {
      try {
        const hash = hashUserId(userParam);
        totalEventsForUser = await countEventsForUser(hash);
      } catch (error) {
        logger?.warn?.("check_ml_log_user_hash_failed", {
          requested_user: userParam,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const payload = {
      envEnabled: shouldLogML(),
      hashSaltConfigured: isMlHashSaltConfigured(),
      lastEventTs: latest?.ts ?? null,
      totalEventsForUser,
    };

    const jsonBody = escapeHtml(JSON.stringify(payload, null, 2));

    logger?.info?.("check_ml_log_summary", {
      env_enabled: payload.envEnabled,
      last_event_ts: payload.lastEventTs,
      total_events_for_user: totalEventsForUser,
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
