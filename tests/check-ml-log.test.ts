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

  it("rejects non-admin users", async () => {
    vi.spyOn(authorization, "isAdmin").mockResolvedValue(false);

    const result = await handleCheckMlLogCommand([], "", "123");

    expect(result.response).toBe("Not authorized.");
    expect(result.parse_mode).toBe("HTML");
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("returns total count and recent events for admins", async () => {
    vi.spyOn(authorization, "isAdmin").mockResolvedValue(true);
    vi.spyOn(dbClient, "getPool").mockReturnValue({
      query: queryMock,
    } as unknown as ReturnType<typeof dbClient.getPool>);

    queryMock.mockResolvedValueOnce({ rows: [{ total: "3" }] });
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          card_id: "42",
          user_id: 1001,
          reviewed_at: new Date("2025-09-15T12:00:00Z"),
        },
        {
          card_id: null,
          user_id: 1002,
          reviewed_at: "2025-09-14T00:00:00Z",
        },
      ],
    });

    const result = await handleCheckMlLogCommand([], "", "123");

    expect(queryMock).toHaveBeenCalledTimes(2);
    expect(queryMock).toHaveBeenNthCalledWith(
      1,
      "SELECT COUNT(*) AS total FROM review_events",
    );
    expect(queryMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("ORDER BY reviewed_at DESC"),
    );
    expect(result.response).toContain("📊 ML Logging");
    expect(result.response).toContain("Total events: 3");
    expect(result.response).toContain("- Card 42 by user 1001 at 2025-09-15");
    expect(result.response).toContain(
      "- Card unknown by user 1002 at 2025-09-14",
    );
    expect(result.parse_mode).toBe("HTML");
  });

  it("handles empty event logs gracefully", async () => {
    vi.spyOn(authorization, "isAdmin").mockResolvedValue(true);
    vi.spyOn(dbClient, "getPool").mockReturnValue({
      query: queryMock,
    } as unknown as ReturnType<typeof dbClient.getPool>);

    queryMock.mockResolvedValueOnce({ rows: [{ total: "0" }] });
    queryMock.mockResolvedValueOnce({ rows: [] });

    const result = await handleCheckMlLogCommand([], "", "123");

    expect(result.response).toContain("Total events: 0");
    expect(result.response).toContain("- No review events recorded yet.");
  });
});
