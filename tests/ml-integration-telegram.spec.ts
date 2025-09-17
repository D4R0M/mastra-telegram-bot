import { describe, expect, it, beforeEach } from "vitest";
import { capturedEvents, resetCapturedEvents, testLogger } from "./helpers/mockMlLogging";

import { logReviewEvent } from "../src/lib/mlLogger.js";
import { submitReviewTool } from "../src/mastra/tools/reviewTools.js";

describe("telegram practice logging", () => {
  beforeEach(() => {
    resetCapturedEvents();
  });

  it("records presented, answered, and graded events", async () => {
    await logReviewEvent({
      mode: "telegram_inline",
      action: "presented",
      session_id: "session-1",
      attempt: 0,
      hint_count: 0,
      latency_ms: 0,
      userId: 42,
      card_id: "card-1",
      sm2_before: { interval: 1, ease: 2.5, reps: 2, due_at: "2024-01-01T00:00:00Z" },
      client: "telegram",
      source: "practice_inline",
      logger: testLogger,
    });

    await logReviewEvent({
      mode: "telegram_inline",
      action: "answered",
      session_id: "session-1",
      attempt: 1,
      hint_count: 1,
      latency_ms: 1500,
      userId: 42,
      card_id: "card-1",
      answer_text: "typed answer",
      sm2_before: { interval: 1, ease: 2.5, reps: 2, due_at: "2024-01-01T00:00:00Z" },
      client: "telegram",
      source: "practice_inline",
      logger: testLogger,
    });

    await submitReviewTool.execute({
      context: {
        owner_id: 42,
        card_id: "card-1",
        grade: 5,
        start_time: Date.now() - 2_000,
        session_id: "session-1",
        mode: "telegram_inline",
        client: "telegram",
        source: "practice_inline",
        attempt: 1,
        hint_count: 1,
        log_answer_event: false,
      },
      mastra: { getLogger: () => testLogger },
    });

    expect(capturedEvents).toHaveLength(3);
    const [presented, answered, graded] = capturedEvents;

    expect(presented.action).toBe("presented");
    expect(answered.action).toBe("answered");
    expect(graded.action).toBe("graded");

    expect(presented.mode).toBe("telegram_inline");
    expect(answered.answer_text).toBe("typed answer");
    expect(graded.grade).toBe(5);
    expect(graded.is_correct).toBe(true);
    expect(graded.sm2_after?.interval).toBe(3);
  });
});
