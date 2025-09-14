import { describe, expect, it, vi } from 'vitest';
import handleStreakCommand from '../src/mastra/commands/streak.ts';

vi.mock('../src/mastra/tools/statisticsTools.ts', () => ({
  getStreakStatsTool: {
    execute: vi.fn(async () => ({
      success: true,
      stats: {
        current_streak: 2,
        longest_streak: 5,
        total_study_days: 4,
        reviews_today: 1,
        average_daily_reviews: 1,
        last_review_date: '2025-09-14',
      }
    })),
  },
}));

describe('streak command', () => {
  it('returns formatted streak with inline actions', async () => {
    const res = await handleStreakCommand([], '', 'user');
    expect(res.response).toContain('🔥 Your Study Streak');
    expect(res.inline_keyboard).toBeTruthy();
    const texts = res.inline_keyboard.inline_keyboard[0].map((b: any) => b.text);
    expect(texts).toContain('📊 Stats');
    expect(texts).toContain('🗓 Weekly View');
    expect(texts).toContain('🔔 Reminders');
  });
});
