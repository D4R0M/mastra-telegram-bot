import { describe, it, expect, vi } from "vitest";

vi.mock("../src/db/client.ts", () => ({
  getPool: () => ({ query: vi.fn() }),
}));

vi.mock("../src/mastra/tools/reviewTools.ts", () => ({
  submitReviewTool: {
    execute: vi.fn(async () => ({ success: true, message: "ok" })),
  },
}));

import { processCommand } from "../src/mastra/commandParser.ts";

const baseState = () => ({
  mode: "review_session",
  step: 1,
  data: {
    session_id: "s1",
    current_card: {
      card_id: "1",
      front: "Spell",
      back: "receive",
    },
    current_index: 1,
    total_cards: 1,
    all_cards: [{ card_id: "1", front: "Spell", back: "receive" }],
    start_time: Date.now(),
  },
});

describe("fuzzy matching", () => {
  it("detects small typos", async () => {
    const state = baseState();
    const res = await processCommand("recieve", "user", "chat", state);
    expect(res.response).toContain("Close! Just a small typo.");
  });

  it("normalizes diacritics", async () => {
    const state = baseState();
    state.data.current_card.back = "cafe";
    const res = await processCommand("Caf\u00e9 ", "user", "chat", state);
    expect(res.response).toContain("✅ Correct!");
  });
});
