import { describe, expect, it, vi } from "vitest";

process.env.ML_HASH_SALT = "test-salt";

vi.mock("../src/mastra/authorization.js", () => ({
  isAdmin: vi.fn(async () => true),
}));

vi.mock("../src/db/reviewEvents.ts", () => ({
  fetchRecentReviewEvents: vi.fn(async () => [
    {
      ts: new Date("2024-01-01T00:00:00Z"),
      mode: "webapp_practice",
      action: "graded",
      session_id: "practice_42_1700000000000",
      card_id: "card-1",
      grade: 4,
      is_correct: true,
      latency_ms: 1200,
      client: "miniapp",
    },
  ]),
  countEvents: vi.fn(async () => 12),
}));

vi.mock("../src/ml/shouldLogML.ts", () => ({
  shouldLogML: () => true,
  isMlHashSaltConfigured: () => true,
}));

import handleCheckMlLogCommand from "../src/mastra/commands/checkMLLog.js";

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

describe("check_ml_log command", () => {
  it("returns formatted output", async () => {
    const result = await handleCheckMlLogCommand([], "user:42", "42", undefined, {
      getLogger: () => logger,
    });

    expect(result.parse_mode).toBe("HTML");
    const match = result.response.match(/<pre>([\s\S]+)<\/pre>/);
    expect(match).toBeTruthy();
    const text = match![1]
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");

    expect(text).toContain("ML Review Events");
    expect(text).toContain("Scope: user 42");
    expect(text).toContain("Total events in scope: 12");
    expect(text).toContain("Most recent 1 event:");
    expect(text).toContain("card card-1");
    expect(text).toContain("user 42");
  });
});