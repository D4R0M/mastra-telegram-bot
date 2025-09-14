import { describe, it, expect, vi } from "vitest";
import handleStreakCommand from "../src/mastra/commands/streak.ts";

vi.mock("../src/mastra/tools/statisticsTools.ts", () => ({
  getStreakStatsTool: {
    execute: vi.fn(async () => ({
      success: true,
      stats: {
        current_streak: 2,
        longest_streak: 5,
        total_study_days: 10,
        reviews_today: 1,
        average_daily_reviews: 2.5,
        last_review_date: "2024-01-01",
      },
    })),
  },
}));

describe("streak command", () => {
  it("returns formatted HTML and inline keyboard", async () => {
    const res = await handleStreakCommand([], "", "user");
    expect(res.response).toContain("🔥 Your Study Streak");
    expect(res.inline_keyboard).toBeTruthy();
    expect(res.parse_mode).toBe("HTML");
    expect(res.response).not.toContain("undefined");
  });
});
