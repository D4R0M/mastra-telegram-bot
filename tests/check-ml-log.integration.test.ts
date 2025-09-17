import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { ReviewEvent } from "../src/types/ml.ts";

const dbUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

if (!dbUrl) {
  describe.skip("check_ml_log SQL filters (integration)", () => {
    it("skips because no database is configured", () => {
      // Set TEST_DATABASE_URL or DATABASE_URL to run this integration suite.
    });
  });
} else {
  describe("check_ml_log SQL filters (integration)", () => {
    let fetchRecentReviewEvents!: typeof import("../src/db/reviewEvents.ts").fetchRecentReviewEvents;
    let countEvents!: typeof import("../src/db/reviewEvents.ts").countEvents;
    let insertReviewEvent!: typeof import("../src/db/reviewEvents.ts").insertReviewEvent;
    let closePool!: typeof import("../src/db/client.ts").closePool;
    let getPool!: typeof import("../src/db/client.ts").getPool;

    const insertedSessionIds: string[] = [];
    let targetSessionId!: string;
    let testUserHash!: string;

    beforeAll(async () => {
      process.env.DATABASE_URL = dbUrl;
      if (!process.env.ML_HASH_SALT) {
        process.env.ML_HASH_SALT = "integration-salt";
      }

      vi.resetModules();
      vi.unmock("../src/db/client.ts");

      const reviewEventsModule = await import("../src/db/reviewEvents.ts");
      fetchRecentReviewEvents = reviewEventsModule.fetchRecentReviewEvents;
      countEvents = reviewEventsModule.countEvents;
      insertReviewEvent = reviewEventsModule.insertReviewEvent;

      const clientModule = await import("../src/db/client.ts");
      getPool = clientModule.getPool;
      closePool = clientModule.closePool;

      const { hashUserId } = await import("../src/lib/mlPrivacy.ts");

      const baseTime = Date.now();
      const testUserId = `${baseTime}`;
      const otherUserId = `${baseTime + 1}`;

      testUserHash = hashUserId(testUserId);
      const otherUserHash = hashUserId(otherUserId);

      const sessionPrefix = `it_check_ml_${baseTime}`;
      targetSessionId = `${sessionPrefix}_target`;

      const events: ReviewEvent[] = [
        {
          ts: new Date(baseTime),
          mode: "webapp_practice",
          action: "graded",
          session_id: targetSessionId,
          user_hash: testUserHash,
          card_id: "card-target",
          grade: 4,
          is_correct: true,
          latency_ms: 900,
          client: "miniapp",
        },
        {
          ts: new Date(baseTime - 1000),
          mode: "webapp_practice",
          action: "graded",
          session_id: `${sessionPrefix}_other_client`,
          user_hash: testUserHash,
          card_id: "card-client",
          grade: 3,
          is_correct: true,
          latency_ms: 1100,
          client: "bot",
        },
        {
          ts: new Date(baseTime - 2000),
          mode: "webapp_practice",
          action: "presented",
          session_id: `${sessionPrefix}_other_action`,
          user_hash: testUserHash,
          card_id: "card-action",
          latency_ms: 800,
          client: "miniapp",
        },
        {
          ts: new Date(baseTime - 3000),
          mode: "telegram_inline",
          action: "graded",
          session_id: `${sessionPrefix}_other_mode`,
          user_hash: testUserHash,
          card_id: "card-mode",
          grade: 2,
          is_correct: false,
          latency_ms: 1400,
          client: "miniapp",
        },
        {
          ts: new Date(baseTime - 4000),
          mode: "webapp_practice",
          action: "graded",
          session_id: `${sessionPrefix}_other_user`,
          user_hash: otherUserHash,
          card_id: "card-user",
          grade: 1,
          is_correct: false,
          latency_ms: 1600,
          client: "miniapp",
        },
      ];

      for (const event of events) {
        insertedSessionIds.push(event.session_id);
        await insertReviewEvent(event);
      }
    });

    afterAll(async () => {
      if (insertedSessionIds.length === 0) {
        return;
      }
      const pool = getPool();
      await pool.query(
        "DELETE FROM review_events WHERE session_id = ANY($1)",
        [insertedSessionIds],
      );
      await closePool();
    });

    it("filters by user, mode, action, and client", async () => {
      const scoped = await fetchRecentReviewEvents(10, {
        userHash: testUserHash,
        mode: "webapp_practice",
        action: "graded",
        client: "miniapp",
      });

      expect(scoped).toHaveLength(1);
      expect(scoped[0]?.session_id).toBe(targetSessionId);

      const count = await countEvents({
        userHash: testUserHash,
        mode: "webapp_practice",
        action: "graded",
        client: "miniapp",
      });
      expect(count).toBe(1);
    });

    it("returns broader counts when client filter is dropped", async () => {
      const total = await countEvents({
        userHash: testUserHash,
        mode: "webapp_practice",
        action: "graded",
      });
      expect(total).toBe(2);
    });

    it("orders recent events by timestamp for the user scope", async () => {
      const events = await fetchRecentReviewEvents(10, { userHash: testUserHash });
      expect(events).toHaveLength(4);
      expect(events[0]?.session_id).toBe(targetSessionId);
    });
  });
}
