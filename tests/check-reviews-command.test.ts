import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import handleCheckReviewsCommand from "../src/mastra/commands/checkReviews.ts";

describe("check reviews command", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    delete (global as any).fetch;
    delete process.env.GITHUB_USERNAME;
    process.env.GITHUB_TOKEN = "test-token";
  });

  afterEach(() => {
    delete process.env.GITHUB_TOKEN;
  });

  it("fetches GitHub username from token when not provided", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ login: "octocat" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ total_count: 5 }),
      });
    (global as any).fetch = fetchMock;

    const res = await handleCheckReviewsCommand([], "", "user1");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.github.com/user",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
        }),
      }),
    );
    expect(res.response).toContain("reviewed 5 pull request");
  });
});
