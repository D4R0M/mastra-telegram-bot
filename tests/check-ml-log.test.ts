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
    expect(body).toContain("ML Review Events");
    expect(body).toContain("Scope: user 9001");
    expect(body).toContain("Limit: 2");
    expect(body).toContain("Total events in scope: 11");
    expect(body).toContain("Most recent 2 events:");
    expect(body).toContain("- 2025-09-01 10:00 UTC");
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
    expect(body).toContain("Scope: all users");
    expect(body).toContain("Limit: 5");
    expect(body).toContain("Total events in scope: 0");
    expect(body).toContain("Logging enabled: no");
    expect(body).toContain("Hash salt configured: no");
    expect(body).toContain("No events found for this scope.");

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