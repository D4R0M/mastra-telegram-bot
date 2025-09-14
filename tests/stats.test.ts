import { describe, expect, it, vi } from 'vitest';
import handleStatsCommand from '../src/mastra/commands/stats.ts';

vi.mock('../src/db/client.ts', () => ({
  getPool: () => ({ query: vi.fn() }),
}));

vi.mock('../src/mastra/tools/statisticsTools.ts', () => ({
  getComprehensiveStatsTool: {
    execute: vi.fn(async () => ({
      success: true,
      stats: {
        due_cards: {
          total_cards: 2,
          new_cards: 1,
          due_cards: 1,
          learning_cards: 0,
          review_cards: 1,
          overdue_cards: 0,
          cards_due_today: 1,
          cards_due_tomorrow: 0,
          average_ease: 2.5,
          total_reviews: 0,
        },
        retention: {
          total_reviews: 0,
          successful_reviews: 0,
          retention_rate: 50,
          average_grade: 0,
          reviews_last_7_days: 0,
          reviews_last_30_days: 0,
          success_rate_last_7_days: 0,
          success_rate_last_30_days: 0,
          mature_cards: 0,
          young_cards: 0,
        },
        streaks: {
          current_streak: 3,
          longest_streak: 5,
          total_study_days: 0,
          days_since_last_review: 0,
          reviews_today: 0,
          average_daily_reviews: 0,
          streak_start_date: null,
          last_review_date: null,
        },
        ease_summary: {
          average_ease: 2.5,
          median_ease: 2.5,
          cards_below_default: 0,
          cards_above_default: 0,
        },
      },
    })),
  },
}));

import { getComprehensiveStatsTool } from '../src/mastra/tools/statisticsTools.ts';

describe('stats command', () => {
  it('renders numbers without undefined', async () => {
    const res = await handleStatsCommand([], '', 'user');
    expect(res.response).toContain('Total Cards: 2');
    expect(res.response).toContain('Cards Due Today: 1');
    expect(res.response).toContain('Retention Rate: 50%');
    expect(res.response).not.toContain('undefined');
  });

  it('handles missing stats with safe fallbacks', async () => {
    getComprehensiveStatsTool.execute.mockResolvedValueOnce({
      success: true,
      stats: {
        due_cards: { total_cards: null, cards_due_today: null, new_cards: null, average_ease: null },
        retention: { retention_rate: null },
        streaks: { current_streak: null, longest_streak: null },
      },
    });
    const res = await handleStatsCommand([], '', 'user');
    expect(res.response).toContain('Total Cards: 0');
    expect(res.response).toContain('Average Ease: N/A');
    expect(res.response).toContain('Retention Rate: N/A');
  });
});
