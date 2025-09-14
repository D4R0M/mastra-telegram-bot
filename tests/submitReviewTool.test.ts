import { describe, it, expect, vi } from 'vitest';

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

vi.mock('../src/db/sm2.ts', () => ({
  calculateSM2: vi.fn(() => ({
    interval_days: 1,
    repetitions: 1,
    ease_factor: 2.6,
    due_date: '2024-01-02',
    lapses: 0,
  })),
}));

vi.mock('../src/db/client.ts', () => ({
  withTransaction: async (fn: any) => fn({}),
  getPool: () => ({ query: vi.fn() }),
}));

import { submitReviewTool } from '../src/mastra/tools/reviewTools.ts';
import { logReview } from '../src/db/reviews.ts';

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
  });
});
