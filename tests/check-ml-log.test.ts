import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../src/mastra/authorization.ts", () => ({
  isAdmin: vi.fn(),
}));

vi.mock("../src/db/reviewEvents.ts", () => ({
  fetch24hTotals: vi.fn(),
  fetchLatestEvent: vi.fn(),
  fetchOptOutCount: vi.fn(),
}));

vi.mock("../src/lib/mlPrivacy.ts", () => ({
  isMlLoggingEnabled: vi.fn(),
}));

import { isAdmin } from "../src/mastra/authorization.ts";
import {
  fetch24hTotals,
  fetchLatestEvent,
  fetchOptOutCount,
} from "../src/db/reviewEvents.ts";
import { isMlLoggingEnabled } from "../src/lib/mlPrivacy.ts";
import handleCheckMlLogCommand from "../src/mastra/commands/checkMLLog.ts";

function extractJson(response: string): any {
  const match = response.match(/<pre><code>([\s\S]+)<\/code><\/pre>/);
  if (!match) {
    throw new Error(`Response did not contain JSON payload: ${response}`);
  }
  const unescaped = match[1]
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
  return JSON.parse(unescaped);
}

describe("/check_ml_log command", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("rejects non-admin users", async () => {
    vi.mocked(isAdmin).mockResolvedValue(false);

    const result = await handleCheckMlLogCommand([], "", "123");

    expect(result.response).toBe("Not authorized.");
    expect(result.parse_mode).toBe("HTML");
    expect(fetch24hTotals).not.toHaveBeenCalled();
  });

  it("returns aggregated JSON when admin", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(isMlLoggingEnabled).mockReturnValue(true);
    vi.mocked(fetch24hTotals).mockResolvedValue([
      { mode: "telegram_inline", events: 5, graded: 3, accuracy: 0.6 },
      { mode: "webapp_practice", events: 7, graded: 5, accuracy: 0.7 },
    ]);
    vi.mocked(fetchLatestEvent).mockResolvedValue({
      ts: new Date("2025-09-01T10:00:00Z"),
      mode: "webapp_practice",
      action: "graded",
      session_id: "session-1",
      card_id: "card-1",
      grade: 4,
      is_correct: true,
      latency_ms: 1200,
      client: "web",
    });
    vi.mocked(fetchOptOutCount).mockResolvedValue(2);

    const result = await handleCheckMlLogCommand([], "", "9001", undefined, {
      getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
    });

    expect(result.parse_mode).toBe("HTML");
    const payload = extractJson(result.response);
    expect(payload).toMatchObject({
      logging_enabled: true,
      opted_out_users: 2,
    });
    expect(payload.totals_24h).toHaveLength(2);
    expect(payload.latest_event.mode).toBe("webapp_practice");
  });

  it("handles downstream errors", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(isMlLoggingEnabled).mockReturnValue(false);
    vi.mocked(fetch24hTotals).mockRejectedValue(new Error("db down"));

    const result = await handleCheckMlLogCommand([], "", "9001", undefined, {
      getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
    });

    expect(result.response).toBe("Failed to fetch ML log summary.");
  });
});
