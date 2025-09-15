import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as dbClient from "../src/db/client.ts";
import * as authorization from "../src/mastra/authorization.ts";
import handleCheckMlLogCommand from "../src/mastra/commands/checkMLLog.ts";

const queryMock = vi.fn();

describe("/check_ml_log command", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("limits results to the requesting user for non-admins", async () => {
    vi.spyOn(authorization, "isAdmin").mockResolvedValue(false);
    vi.spyOn(dbClient, "getPool").mockReturnValue({
      query: queryMock,
    } as unknown as ReturnType<typeof dbClient.getPool>);

    queryMock.mockResolvedValueOnce({ rows: [{ total: "2" }] });
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          card_id: "42",
          user_id: "123",
          session_id: "session-1",
          grade: 5,
          latency_ms: 800,
          created_at: new Date("2025-09-15T12:00:00Z"),
        },
        {
          card_id: null,
          user_id: "123",
          session_id: null,
          grade: null,
          latency_ms: null,
          created_at: "2025-09-14T09:30:00Z",
        },
      ],
    });

    const result = await handleCheckMlLogCommand([], "", "123");

    expect(queryMock).toHaveBeenCalledTimes(2);
    expect(queryMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        text: expect.stringContaining("WHERE user_id = $1"),
        values: ["123"],
      }),
    );
    expect(queryMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        text: expect.stringContaining("ORDER BY created_at DESC"),
        values: ["123", 5],
      }),
    );
    expect(result.parse_mode).toBe("HTML");
    expect(result.response).toContain("<b>📊 ML Review Events</b>");
    expect(result.response).toContain("Scope: your review events");
    expect(result.response).toContain("Limit: 5");
    expect(result.response).toContain("Total events in scope: 2");
    expect(result.response).toContain("Most recent 2 events");
    expect(result.response).toContain("card <code>42</code>");
    expect(result.response).toContain("grade 5");
    expect(result.response).toContain("latency 800ms");
    expect(result.response).toContain("session <code>session-1</code>");
    expect(result.response).toContain("<i>unknown card</i>");
    expect(result.response).toContain("grade <i>n/a</i>");
    expect(result.response).not.toContain("user <code>123</code>");
  });

  it("allows admins to filter by user and limit", async () => {
    vi.spyOn(authorization, "isAdmin").mockResolvedValue(true);
    vi.spyOn(dbClient, "getPool").mockReturnValue({
      query: queryMock,
    } as unknown as ReturnType<typeof dbClient.getPool>);

    queryMock.mockResolvedValueOnce({ rows: [{ total: "3" }] });
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          card_id: "a1",
          user_id: "777",
          session_id: "sess-7",
          grade: 4,
          latency_ms: 600,
          created_at: new Date("2025-08-01T10:00:00Z"),
        },
        {
          card_id: "a2",
          user_id: "777",
          session_id: null,
          grade: 3,
          latency_ms: null,
          created_at: "2025-07-31T08:15:00Z",
        },
      ],
    });

    const result = await handleCheckMlLogCommand([], "user:777 limit:3", "9001");

    expect(queryMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        text: expect.stringContaining("WHERE user_id = $1"),
        values: ["777"],
      }),
    );
    expect(queryMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        values: ["777", 3],
      }),
    );
    expect(result.response).toContain("Scope: user <code>777</code>");
    expect(result.response).toContain("Limit: 3");
    expect(result.response).toContain("Total events in scope: 3");
    expect(result.response).toContain("Most recent 2 events");
    expect(result.response).toContain("user <code>777</code>");
  });

  it("handles empty event logs gracefully", async () => {
    vi.spyOn(authorization, "isAdmin").mockResolvedValue(true);
    vi.spyOn(dbClient, "getPool").mockReturnValue({
      query: queryMock,
    } as unknown as ReturnType<typeof dbClient.getPool>);

    queryMock.mockResolvedValueOnce({ rows: [{ total: "0" }] });
    queryMock.mockResolvedValueOnce({ rows: [] });

    const result = await handleCheckMlLogCommand([], "limit:2", "123");

    expect(result.response).toContain("Total events in scope: 0");
    expect(result.response).toContain("Limit: 2");
    expect(result.response).toContain("• No review events recorded yet.");
  });
});
