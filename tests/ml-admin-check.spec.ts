import { describe, expect, it, vi } from "vitest";

process.env.ML_HASH_SALT = "test-salt";

vi.mock("../src/mastra/authorization.js", () => ({
  isAdmin: vi.fn(async () => true),
}));

vi.mock("../src/db/reviewEvents.ts", () => ({
  fetchLatestEvent: vi.fn(async () => ({
    ts: new Date("2024-01-01T00:00:00Z"),
    mode: "webapp_practice",
    action: "graded",
    session_id: "session-1",
    card_id: "card-1",
    grade: 4,
    is_correct: true,
    latency_ms: 1200,
    client: "miniapp",
  })),
  countEventsForUser: vi.fn(async () => 12),
}));

vi.mock("../src/ml/shouldLogML.ts", () => ({
  shouldLogML: () => true,
}));

import handleCheckMlLogCommand from "../src/mastra/commands/checkMLLog.js";

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

describe("check_ml_log command", () => {
  it("returns escaped JSON payload", async () => {
    const result = await handleCheckMlLogCommand([], "user:42", "42", undefined, {
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

    expect(payload.envEnabled).toBe(true);
    expect(payload.totalEventsForUser).toBe(12);
    expect(payload.lastEventTs).toBe("2024-01-01T00:00:00.000Z");
  });
});
