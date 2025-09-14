import { describe, it, expect, vi } from "vitest";
import handleDueCommand from "../src/mastra/commands/due.ts";

vi.mock("../src/db/client.ts", () => ({
  getPool: () => ({ query: vi.fn() }),
}));

vi.mock("../src/mastra/tools/statisticsTools.ts", () => ({
  getDueCardsStatsTool: {
    execute: vi.fn(async () => ({
      success: true,
      stats: {
        total_cards: 15,
        new_cards: 9,
        due_cards: 15,
        learning_cards: 1,
        review_cards: 5,
        overdue_cards: 6,
        cards_due_today: 9,
        cards_due_tomorrow: 1,
        average_ease: 2.5,
        total_reviews: 0,
      },
    })),
  },
}));

describe("due command", () => {
  it("renders dashboard with inline actions", async () => {
    const res = await handleDueCommand([], "", "user");
    expect(res.response).toContain("Cards Due for Review");
    expect(res.response).toContain("Total: 15");
    expect(res.inline_keyboard).toBeTruthy();
  });

  it("supports compact mode", async () => {
    const res = await handleDueCommand(["compact"], "", "user");
    expect(res.response).toContain("Today:");
    expect(res.response).toContain("→ /practice");
    expect(res.inline_keyboard).toBeUndefined();
  });
});
