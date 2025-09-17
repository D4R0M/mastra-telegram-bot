import { describe, expect, it, vi } from "vitest";

vi.mock("../src/mastra/authorization.js", () => ({
  isAdmin: vi.fn(async () => true),
}));

vi.mock("../src/db/reviewEvents.ts", () => ({
  fetch24hTotals: vi.fn(async () => [
    { mode: "telegram_inline", events: 5, graded: 3, accuracy: 0.6 },
    { mode: "webapp_practice", events: 7, graded: 5, accuracy: 0.71 },
  ]),
  fetchLatestEvent: vi.fn(async () => ({
    ts: new Date("2024-01-01T00:00:00Z"),
    mode: "webapp_practice",
    action: "graded",
    session_id: "session-1",
    card_id: "card-1",
    grade: 4,
    is_correct: true,
    latency_ms: 1200,
    client: "web",
  })),
  fetchOptOutCount: vi.fn(async () => 2),
}));

vi.mock("../src/lib/mlPrivacy.ts", () => ({
  isMlLoggingEnabled: () => true,
}));

import handleCheckMlLogCommand from "../src/mastra/commands/checkMLLog.js";

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

describe("check_ml_log command", () => {
  it("returns escaped JSON payload", async () => {
    const result = await handleCheckMlLogCommand([], "", "42", undefined, {
      getLogger: () => logger,
    });

    expect(result.parse_mode).toBe("HTML");
    const match = result.response.match(/<pre><code>([\s\S]+)<\/code><\/pre>/);
    expect(match).toBeTruthy();
    const jsonText = match![1]
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
    const payload = JSON.parse(jsonText);

    expect(payload.logging_enabled).toBe(true);
    expect(payload.opted_out_users).toBe(2);
    expect(Array.isArray(payload.totals_24h)).toBe(true);
    expect(payload.latest_event.mode).toBe("webapp_practice");
  });
});
