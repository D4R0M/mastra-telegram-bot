import type { CommandResponse } from "../commandTypes.js";
import { isAdmin } from "../authorization.js";
import {
  fetchRecentReviewEvents,
  countEvents,
  type ReviewEventQueryFilters,
  type ReviewEventSample,
} from "../../db/reviewEvents.js";
import { hashUserId } from "../../lib/mlPrivacy.js";
import {
  shouldLogML,
  isMlHashSaltConfigured,
} from "../../ml/shouldLogML.js";

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 50;

type ParsedOptions = {
  userId?: string;
  limit: number;
  mode?: string;
  action?: string;
  client?: string;
};

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

function clampLimit(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_LIMIT;
  }
  return Math.max(1, Math.min(MAX_LIMIT, Math.trunc(value)));
}

function sanitizeFilterValue(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  return /^[a-z0-9_:-]+$/i.test(trimmed) ? trimmed.toLowerCase() : null;
}

function parseOptions(rawParams: string): ParsedOptions {
  const options: ParsedOptions = { limit: DEFAULT_LIMIT };
  const tokens = rawParams.split(/\s+/).filter(Boolean);

  for (const token of tokens) {
    const match = token.match(/^([a-z_]+)[=:](.+)$/i);
    if (!match) {
      continue;
    }
    const key = match[1].toLowerCase();
    const value = match[2];

    switch (key) {
      case "user":
      case "user_id": {
        const sanitized = value.trim();
        if (sanitized) {
          options.userId = sanitized;
        }
        break;
      }
      case "limit": {
        const parsed = Number.parseInt(value, 10);
        options.limit = clampLimit(parsed);
        break;
      }
      case "mode": {
        const sanitized = sanitizeFilterValue(value);
        if (sanitized) {
          options.mode = sanitized;
        }
        break;
      }
      case "action": {
        const sanitized = sanitizeFilterValue(value);
        if (sanitized) {
          options.action = sanitized;
        }
        break;
      }
      case "client": {
        const sanitized = sanitizeFilterValue(value);
        if (sanitized) {
          options.client = sanitized;
        }
        break;
      }
      default:
        break;
    }
  }

  return options;
}

function formatTimestamp(ts: Date): string {
  const iso = ts.toISOString();
  return iso.slice(0, 16).replace("T", " ");
}

function extractUserIdFromSession(sessionId: string): string | null {
  const parts = sessionId.split("_");
  if (parts.length < 2) {
    return null;
  }
  const candidate = parts[1];
  return /^\d+$/.test(candidate) ? candidate : null;
}

function formatEvent(event: ReviewEventSample): string {
  const segments: string[] = [];
  segments.push(`${formatTimestamp(event.ts)} UTC`);
  segments.push(`card ${event.card_id}`);

  const userId = extractUserIdFromSession(event.session_id);
  if (userId) {
    segments.push(`user ${userId}`);
  }

  if (typeof event.grade === "number") {
    segments.push(`grade ${event.grade}`);
  }

  if (typeof event.latency_ms === "number") {
    segments.push(`latency ${event.latency_ms}ms`);
  }

  if (event.client) {
    segments.push(`client ${event.client}`);
  }

  segments.push(`session ${event.session_id}`);
  return segments.join(" | ");
}

function buildScopeValue(options: ParsedOptions): string {
  const scope = options.userId ? `user ${options.userId}` : "all users";
  const extras: string[] = [];
  if (options.mode) {
    extras.push(`mode=${options.mode}`);
  }
  if (options.action) {
    extras.push(`action=${options.action}`);
  }
  if (options.client) {
    extras.push(`client=${options.client}`);
  }
  return extras.length > 0 ? `${scope} (${extras.join(", ")})` : scope;
}

function formatSummaryRows(rows: Array<[string, string]>): string[] {
  const labelWidth = rows.reduce(
    (max, [label]) => Math.max(max, label.length),
    0,
  );
  return rows.map(([label, value]) => `${label.padEnd(labelWidth, " ")} │ ${value}`);
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

  const envEnabled = shouldLogML();
  const hashSaltConfigured = isMlHashSaltConfigured();
  const options = parseOptions(rawParams);
  const filters: ReviewEventQueryFilters = {};
  const warnings: string[] = [];

  if (options.mode) {
    filters.mode = options.mode;
  }
  if (options.action) {
    filters.action = options.action;
  }
  if (options.client) {
    filters.client = options.client;
  }

  if (options.userId) {
    try {
      filters.userHash = hashUserId(options.userId);
    } catch (error) {
      warnings.push("Warning: unable to hash user id; defaulting to all users.");
      logger?.warn?.("check_ml_log_user_hash_failed", {
        requested_user: options.userId,
        error: error instanceof Error ? error.message : String(error),
      });
      delete filters.userHash;
    }
  }

  try {
    const [events, totalEvents] = await Promise.all([
      fetchRecentReviewEvents(options.limit, filters),
      countEvents(filters),
    ]);

    const lines: string[] = [];
    lines.push("📑 ML Log Report");
    lines.push("────────────────────────────");
    const summaryRows = formatSummaryRows([
      ["Scope", buildScopeValue(options)],
      ["Events", String(totalEvents)],
      ["Limit", String(options.limit)],
      ["Logging", envEnabled ? "✅ yes" : "❌ no"],
      ["Hash Salt", hashSaltConfigured ? "✅ yes" : "❌ no"],
    ]);
    lines.push(...summaryRows);
    lines.push("────────────────────────────");

    if (warnings.length > 0) {
      for (const warning of warnings) {
        lines.push(`⚠️ ${warning}`);
      }
    }

    if (events.length === 0) {
      lines.push("🔎 No events recorded for this scope");
    } else {
      const plural = events.length === 1 ? "event" : "events";
      lines.push(`📝 Most recent ${events.length} ${plural}`);
      for (const event of events) {
        lines.push(`• ${formatEvent(event)}`);
      }
    }

    const responseBody = lines.join("\n");
    const logFilters: Record<string, unknown> = {};
    if (filters.userHash) {
      logFilters.user_hash = filters.userHash;
    }
    if (options.mode) {
      logFilters.mode = options.mode;
    }
    if (options.action) {
      logFilters.action = options.action;
    }
    if (options.client) {
      logFilters.client = options.client;
    }

    const logPayload: Record<string, unknown> = {
      env_enabled: envEnabled,
      hash_salt_configured: hashSaltConfigured,
      limit: options.limit,
      total_events: totalEvents,
      returned_events: events.length,
      last_event_ts: events[0]?.ts ?? null,
    };

    if (options.userId) {
      logPayload.requested_user = options.userId;
    }

    if (Object.keys(logFilters).length > 0) {
      logPayload.filters = logFilters;
    }

    if (warnings.length > 0) {
      logPayload.warnings = warnings;
    }

    logger?.info?.("check_ml_log_summary", logPayload);

    return {
      response: `<pre>${escapeHtml(responseBody)}</pre>`,
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