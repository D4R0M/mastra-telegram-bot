import { describe, expect, it, vi, beforeEach } from "vitest";

process.env.ML_HASH_SALT = "test-salt";

vi.mock("../src/mastra/authorization.ts", () => ({
  isAdmin: vi.fn(),
}));

vi.mock("../src/db/reviewEvents.ts", () => ({
  fetchRecentReviewEvents: vi.fn(),
  countEvents: vi.fn(),
}));

vi.mock("../src/ml/shouldLogML.ts", () => ({
  shouldLogML: vi.fn(),
  isMlHashSaltConfigured: vi.fn(),
}));

import { isAdmin } from "../src/mastra/authorization.ts";
import {
  fetchRecentReviewEvents,
  countEvents,
} from "../src/db/reviewEvents.ts";
import {
  shouldLogML,
  isMlHashSaltConfigured,
} from "../src/ml/shouldLogML.ts";
import handleCheckMlLogCommand from "../src/mastra/commands/checkMLLog.ts";

function extractPre(response: string): string {
  const match = response.match(/<pre>([\s\S]+)<\/pre>/);
  if (!match) {
    throw new Error(`Response did not contain preformatted payload: ${response}`);
  }
  return match[1]
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function expectSummaryRow(lines: string[], label: string, expectedValue: string) {
  const row = lines.find((line) => line.startsWith(label));
  expect(row, `Expected summary row for ${label}`).toBeDefined();
  const [, value] = row!.split("│");
  expect(value?.trim()).toBe(expectedValue);
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
    expect(fetchRecentReviewEvents).not.toHaveBeenCalled();
    expect(countEvents).not.toHaveBeenCalled();
  });

  it("returns a formatted summary for admins with user scope", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(shouldLogML).mockReturnValue(true);
    vi.mocked(isMlHashSaltConfigured).mockReturnValue(true);
    vi.mocked(fetchRecentReviewEvents).mockResolvedValue([
      {
        ts: new Date("2025-09-01T10:00:00Z"),
        mode: "webapp_practice",
        action: "graded",
        session_id: "practice_9001_1758062745383",
        card_id: "card-1",
        grade: 4,
        is_correct: true,
        latency_ms: 1200,
        client: "miniapp",
      },
      {
        ts: new Date("2025-09-01T09:55:00Z"),
        mode: "webapp_practice",
        action: "graded",
        session_id: "practice_9001_1758062500000",
        card_id: "card-2",
        grade: 3,
        is_correct: true,
        latency_ms: 950,
        client: "miniapp",
      },
    ]);
    vi.mocked(countEvents).mockResolvedValue(11);

    const info = vi.fn();
    const logger = { info, warn: vi.fn(), error: vi.fn() };

    const result = await handleCheckMlLogCommand(
      [],
      "user:9001 limit:2",
      "9001",
      undefined,
      {
        getLogger: () => logger,
      },
    );

    expect(result.parse_mode).toBe("HTML");
    const body = extractPre(result.response);
    const lines = body.split("\n");
    expect(lines[0]).toBe("📑 ML Log Report");
    expect(lines[1]).toBe("────────────────────────────");
    expectSummaryRow(lines, "Scope", "user 9001");
    expectSummaryRow(lines, "Events", "11");
    expectSummaryRow(lines, "Limit", "2");
    expectSummaryRow(lines, "Logging", "✅ yes");
    expectSummaryRow(lines, "Hash Salt", "✅ yes");
    expect(lines).toContain("📝 Most recent 2 events");
    expect(body).toContain("• 2025-09-01 10:00 UTC");
    expect(body).toContain("card card-1");
    expect(body).toContain("user 9001");
    expect(body).toContain("latency 1200ms");
    expect(body).toContain("session practice_9001_1758062745383");

    expect(info).toHaveBeenCalledWith(
      "check_ml_log_summary",
      expect.objectContaining({
        env_enabled: true,
        hash_salt_configured: true,
        limit: 2,
        total_events: 11,
        returned_events: 2,
        requested_user: "9001",
        last_event_ts: new Date("2025-09-01T10:00:00Z"),
      }),
    );
    const logArgs = info.mock.calls[0][1] as Record<string, any>;
    expect(logArgs.filters).toEqual(
      expect.objectContaining({
        user_hash: expect.any(String),
      }),
    );
  });

  it("handles empty result sets", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(shouldLogML).mockReturnValue(false);
    vi.mocked(isMlHashSaltConfigured).mockReturnValue(false);
    vi.mocked(fetchRecentReviewEvents).mockResolvedValue([]);
    vi.mocked(countEvents).mockResolvedValue(0);

    const info = vi.fn();
    const logger = { info, warn: vi.fn(), error: vi.fn() };

    const result = await handleCheckMlLogCommand([], "", "9001", undefined, {
      getLogger: () => logger,
    });

    const body = extractPre(result.response);
    const lines = body.split("\n");
    expectSummaryRow(lines, "Scope", "all users");
    expectSummaryRow(lines, "Events", "0");
    expectSummaryRow(lines, "Limit", "5");
    expectSummaryRow(lines, "Logging", "❌ no");
    expectSummaryRow(lines, "Hash Salt", "❌ no");
    expect(lines).toContain("🔎 No events recorded for this scope");

    expect(info).toHaveBeenCalledWith(
      "check_ml_log_summary",
      expect.objectContaining({
        env_enabled: false,
        hash_salt_configured: false,
        limit: 5,
        total_events: 0,
        returned_events: 0,
        last_event_ts: null,
      }),
    );
  });

  it("handles downstream errors", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(shouldLogML).mockReturnValue(false);
    vi.mocked(isMlHashSaltConfigured).mockReturnValue(false);
    vi.mocked(fetchRecentReviewEvents).mockRejectedValue(
      new Error("db down"),
    );

    const result = await handleCheckMlLogCommand([], "", "9001", undefined, {
      getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
    });

    expect(result.response).toBe("Failed to fetch ML log summary.");
  });
});