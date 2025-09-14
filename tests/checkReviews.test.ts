import { describe, it, expect } from "vitest";
import handleCheckReviewsCommand from "../src/mastra/commands/checkReviews.ts";

describe("check reviews command", () => {
  it("handles missing GitHub username gracefully", async () => {
    const oldUsername = process.env.GITHUB_USERNAME;
    delete process.env.GITHUB_USERNAME;

    const res = await handleCheckReviewsCommand([], "", "user");
    expect(res.response).toContain("GitHub username not configured");

    if (oldUsername) process.env.GITHUB_USERNAME = oldUsername;
    else delete process.env.GITHUB_USERNAME;
  });
});
