import { describe, it, expect } from 'vitest';
import { bar, deltaArrow, fmtStatsHTML, type Stats } from '../src/mastra/ui/format.ts';

describe('format helpers', () => {
  it('renders bars with correct fill', () => {
    expect(bar(0.5, 10, '#', '-')).toBe('#####-----');
    expect(bar(null, 5)).toBe('░░░░░');
  });

  it('renders delta arrows', () => {
    expect(deltaArrow(0.1)).toBe('▲');
    expect(deltaArrow(-0.2)).toBe('▼');
    expect(deltaArrow(0)).toBe('▬');
    expect(deltaArrow(null)).toBe('');
  });

  it('formats stats HTML with fallbacks', () => {
    const stats: Stats = {
      totalCards: null,
      dueToday: null,
      newToday: null,
      avgEase: null,
      retentionRate: null,
      retentionDelta: null,
      currentStreakDays: null,
      longestStreakDays: null,
      dueNowPct: null,
      newTodayPct: null,
    };
    const html = fmtStatsHTML(stats);
    expect(html).toContain('Total cards: 0');
    expect(html).toContain('Retention (30d): N/A');
    expect(html).not.toContain('undefined');
  });
});
