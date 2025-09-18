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

function expectSummaryRow(lines: string[], label: string, expectedValue: string) {
  const row = lines.find((line) => line.startsWith(label));
  expect(row, `Expected summary row for ${label}`).toBeDefined();
  const [, value] = row!.split("│");
  expect(value?.trim()).toBe(expectedValue);
}

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

    const lines = text.split("\n");
    expect(lines[0]).toBe("📑 ML Log Report");
    expectSummaryRow(lines, "Scope", "user 42");
    expectSummaryRow(lines, "Events", "12");
    expectSummaryRow(lines, "Limit", "5");
    expectSummaryRow(lines, "Logging", "✅ yes");
    expectSummaryRow(lines, "Hash Salt", "✅ yes");
    expect(lines).toContain("📝 Most recent 1 event");
    expect(text).toContain("card card-1");
    expect(text).toContain("user 42");
  });
});