import { describe, expect, it, vi, beforeEach } from "vitest";

process.env.ML_HASH_SALT = "test-salt";

vi.mock("../src/mastra/authorization.ts", () => ({
  isAdmin: vi.fn(),
}));

vi.mock("../src/db/reviewEvents.ts", () => ({
  fetchLatestEvent: vi.fn(),
  countEventsForUser: vi.fn(),
}));

vi.mock("../src/ml/shouldLogML.ts", () => ({
  shouldLogML: vi.fn(),
}));

import { isAdmin } from "../src/mastra/authorization.ts";
import {
  fetchLatestEvent,
  countEventsForUser,
} from "../src/db/reviewEvents.ts";
import { shouldLogML } from "../src/ml/shouldLogML.ts";
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
    expect(fetchLatestEvent).not.toHaveBeenCalled();
  });

  it("returns status summary for admins", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(shouldLogML).mockReturnValue(true);
    vi.mocked(fetchLatestEvent).mockResolvedValue({
      ts: new Date("2025-09-01T10:00:00Z"),
      mode: "webapp_practice",
      action: "graded",
      session_id: "session-1",
      card_id: "card-1",
      grade: 4,
      is_correct: true,
      latency_ms: 1200,
      client: "miniapp",
    });
    vi.mocked(countEventsForUser).mockResolvedValue(42);

    const result = await handleCheckMlLogCommand(
      [],
      "user:9001",
      "9001",
      undefined,
      {
        getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
      },
    );

    expect(result.parse_mode).toBe("HTML");
    const payload = extractJson(result.response);
    expect(payload).toMatchObject({
      envEnabled: true,
      totalEventsForUser: 42,
    });
    expect(payload.lastEventTs).toBe("2025-09-01T10:00:00.000Z");
  });

  it("handles downstream errors", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(shouldLogML).mockReturnValue(false);
    vi.mocked(fetchLatestEvent).mockRejectedValue(new Error("db down"));

    const result = await handleCheckMlLogCommand([], "", "9001", undefined, {
      getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
    });

    expect(result.response).toBe("Failed to fetch ML log summary.");
  });
});
