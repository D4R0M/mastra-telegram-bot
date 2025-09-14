import { describe, it, expect } from 'vitest';
import { bar, deltaArrow, fmtStatsHTML, type Stats } from '../src/mastra/ui/format.ts';

describe('format helpers', () => {
  it('renders bars with correct fill', () => {
    expect(bar(0.5, 10, '#', '-')).toBe('#####-----');
    expect(bar(0, 5)).toBe('░░░░░');
  });

  it('renders delta arrows', () => {
    expect(deltaArrow(0.1)).toBe('▲');
    expect(deltaArrow(-0.2)).toBe('▼');
    expect(deltaArrow(0)).toBe('▬');
  });

  it('formats stats HTML with fallbacks', () => {
    const stats: Stats = {
      totalCards: 0,
      dueToday: 0,
      newToday: 0,
      avgEase: 0,
      retentionRate: 0,
      retentionDelta: 0,
      currentStreakDays: 0,
      longestStreakDays: 0,
      dueNowPct: 0,
      newTodayPct: 0,
    };
    const html = fmtStatsHTML(stats);
    expect(html).toContain('🗂️ <b>Total cards:</b> 0');
    expect(html).toContain('<b>Retention (30d):</b> 0%');
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('N/A');
  });
});
