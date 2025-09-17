import { describe, expect, it, beforeEach } from "vitest";
import { capturedEvents, resetCapturedEvents, testLogger } from "./helpers/mockMlLogging";

import { logReviewEvent } from "../src/lib/mlLogger.js";
import { submitReviewTool } from "../src/mastra/tools/reviewTools.js";

describe("web app practice logging", () => {
  beforeEach(() => {
    resetCapturedEvents();
  });

  it("records presented, hint, answered, and graded events", async () => {
    const sm2Snapshot = { interval: 1, ease: 2.5, reps: 2, due_at: "2024-01-01T00:00:00Z" };

    await logReviewEvent({
      mode: "webapp_practice",
      action: "presented",
      session_id: "session-2",
      attempt: 0,
      hint_count: 0,
      latency_ms: 0,
      userId: 42,
      card_id: "card-1",
      sm2_before: sm2Snapshot,
      client: "web",
      source: "webapp_practice",
      logger: testLogger,
    });

    await logReviewEvent({
      mode: "webapp_practice",
      action: "hint_shown",
      session_id: "session-2",
      attempt: 0,
      hint_count: 1,
      latency_ms: 800,
      userId: 42,
      card_id: "card-1",
      sm2_before: sm2Snapshot,
      client: "web",
      source: "webapp_practice",
      logger: testLogger,
    });

    await logReviewEvent({
      mode: "webapp_practice",
      action: "answered",
      session_id: "session-2",
      attempt: 1,
      hint_count: 1,
      latency_ms: 1600,
      userId: 42,
      card_id: "card-1",
      answer_text: null,
      sm2_before: sm2Snapshot,
      client: "web",
      source: "webapp_practice",
      logger: testLogger,
    });

    await submitReviewTool.execute({
      context: {
        owner_id: 42,
        card_id: "card-1",
        grade: 4,
        start_time: Date.now() - 2_500,
        session_id: "session-2",
        mode: "webapp_practice",
        client: "web",
        source: "webapp_practice",
        attempt: 1,
        hint_count: 1,
        log_answer_event: false,
      },
      mastra: { getLogger: () => testLogger },
    });

    expect(capturedEvents).toHaveLength(4);
    const [presented, hint, answered, graded] = capturedEvents;

    expect(presented.action).toBe("presented");
    expect(hint.action).toBe("hint_shown");
    expect(answered.action).toBe("answered");
    expect(graded.action).toBe("graded");
    expect(graded.mode).toBe("webapp_practice");
    expect(graded.client).toBe("web");
    expect(graded.hint_count).toBe(1);
    expect(graded.sm2_after?.interval).toBe(3);
  });
});
