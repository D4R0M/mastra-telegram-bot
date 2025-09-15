import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'crypto';

vi.mock('../src/db/reviews.ts', () => ({
  getReviewState: vi.fn(async () => ({
    interval_days: 0,
    repetitions: 0,
    ease_factor: 2.5,
    due_date: '2024-01-01',
    lapses: 0,
    last_reviewed_at: null,
  })),
  updateReviewState: vi.fn(),
  createReviewLog: vi.fn(),
  logReview: vi.fn(),
  logReviewEvent: vi.fn(),
}));

vi.mock('../src/db/cards.ts', () => ({
  getCardById: vi.fn(async () => ({
    id: 'c1',
    front: 'front',
    back: 'back',
    tags: [],
    lang_front: 'en',
    lang_back: 'de',
  })),
}));

vi.mock('../src/lib/sm2.ts', () => ({
  applySM2: vi.fn(() => ({
    intervalDays: 1,
    repetitions: 1,
    easeFactor: 2.6,
    lapses: 0,
  })),
}));

vi.mock('../src/db/client.ts', () => ({
  withTransaction: async (fn: any) => fn({}),
  getPool: () => ({ query: vi.fn() }),
}));

import { submitReviewTool } from '../src/mastra/tools/reviewTools.ts';
import { logReview, logReviewEvent } from '../src/db/reviews.ts';

describe('submitReviewTool', () => {
  it('handles string start_time by converting to valid timestamp', async () => {
    const start = String(Date.now() - 5000);
    const result = await submitReviewTool.execute({
      context: {
        owner_id: 'user1',
        card_id: 'c1',
        grade: 5,
        start_time: start,
        session_id: 's1',
        position_in_session: 1,
      },
      mastra: { getLogger: () => ({ info: vi.fn(), error: vi.fn() }) },
    });
    expect(result.success).toBe(true);
    expect(logReview).toHaveBeenCalled();
    const event = vi.mocked(logReview).mock.calls[0][0];
    expect(event.ts_shown).toBeInstanceOf(Date);
    expect(isNaN(event.ts_shown.getTime())).toBe(false);
    expect(event.scheduled_at).toBeInstanceOf(Date);
    expect(isNaN(event.scheduled_at.getTime())).toBe(false);

    expect(logReviewEvent).toHaveBeenCalled();
    const logEvent = vi.mocked(logReviewEvent).mock.calls[0][0];
    const expectedHash = createHash('sha256').update('user1').digest('hex');
    const expectedLatency =
      event.ts_answered.getTime() - event.ts_shown.getTime();
    expect(logEvent.user_hash).toBe(expectedHash);
    expect(logEvent.grade).toBe(5);
    expect(logEvent.session_id).toBe('s1');
    expect(logEvent.latency_ms).toBe(expectedLatency);
    expect(logEvent.was_overdue).toBe(true);
    expect(logEvent.prev_ease).toBe(2.5);
    expect(logEvent.new_ease).toBe(2.6);
    expect(logEvent.prev_interval_days).toBe(0);
    expect(logEvent.new_interval_days).toBe(1);
    expect(logEvent.prev_repetitions).toBe(0);
    expect(logEvent.new_repetitions).toBe(1);
    expect(logEvent.prev_ease).not.toBe(logEvent.new_ease);
    expect(logEvent.prev_interval_days).not.toBe(
      logEvent.new_interval_days,
    );
    expect(logEvent.prev_repetitions).not.toBe(logEvent.new_repetitions);
  });
});
