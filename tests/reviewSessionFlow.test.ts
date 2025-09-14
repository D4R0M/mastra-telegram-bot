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

const makeState = () => ({
  mode: "review_session",
  step: 1,
  data: {
    session_id: "s1",
    current_card: {
      card_id: "1",
      front: "Contemptuous",
      back: "Looking down on something or not respecting it",
    },
    current_index: 1,
    total_cards: 2,
    all_cards: [
      {
        card_id: "1",
        front: "Contemptuous",
        back: "Looking down on something or not respecting it",
      },
      {
        card_id: "2",
        front: "Farmsteads",
        back: "Old farmhouse and its surrounding farm buildings",
      },
    ],
    start_time: Date.now(),
  },
});

describe("review session flow", () => {
  it("does not advance to next card until grade is submitted", async () => {
    const state = makeState();
    const answerRes = await processCommand(
      "Looking down on someone",
      "user",
      "chat",
      state,
    );
    expect(answerRes.conversationState?.data.current_index).toBe(1);

    // Sending another text before grading should not advance the card
    const retryRes = await processCommand(
      "still thinking",
      "user",
      "chat",
      answerRes.conversationState,
    );
    expect(retryRes.conversationState?.data.current_index).toBe(1);
    expect(retryRes.response).toContain("grade between 0 and 5");

    // Now provide a grade to move to next card
    const gradeRes = await processCommand(
      "4",
      "user",
      "chat",
      answerRes.conversationState,
    );
    expect(gradeRes.conversationState?.data.current_index).toBe(2);
    expect(gradeRes.response).toContain("Card 2/2");
  });
});
