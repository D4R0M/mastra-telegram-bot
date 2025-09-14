export type Stats = {
  totalCards: number | null;
  dueToday: number | null;
  newToday: number | null;
  avgEase: number | null;            // e.g., SM-2 E-Factor
  retentionRate: number | null;      // 0..1
  retentionDelta: number | null;     // -1..1 (vs previous 30d)
  currentStreakDays: number | null;
  longestStreakDays: number | null;
  dueNowPct: number | null;          // 0..1 of today's due already done
  newTodayPct: number | null;        // 0..1 of daily new target already added
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const num = (v: any, fb = 0) => (Number.isFinite(Number(v)) ? Number(v) : fb);
export const pctStr = (p: number | null) =>
  p == null ? 'N/A' : `${Math.round(clamp01(p) * 100)}%`;

export function bar(p: number | null, width = 15, fill = '█', empty = '░'): string {
  if (p == null) return empty.repeat(width);
  const filled = Math.round(clamp01(p) * width);
  return fill.repeat(filled) + empty.repeat(width - filled);
}

export function deltaArrow(d: number | null): string {
  if (d == null || !Number.isFinite(d)) return '';
  if (d > 0.005) return '▲';
  if (d < -0.005) return '▼';
  return '▬';
}

export function fmtStatsHTML(s: Stats) {
  const total = num(s.totalCards);
  const due = num(s.dueToday);
  const newly = num(s.newToday);
  const ease = s.avgEase == null ? 'N/A' : s.avgEase.toFixed(2);

  const retentionPct = s.retentionRate == null ? 'N/A'
    : `${Math.round(clamp01(s.retentionRate) * 100)}%`;
  const retentionBar = bar(s.retentionRate, 15, '█', '░');
  const retentionDelta = s.retentionDelta == null
    ? ''
    : ` ${deltaArrow(s.retentionDelta)} ${Math.round(Math.abs(s.retentionDelta) * 100)}%`;

  const streakNow = num(s.currentStreakDays);
  const streakBest = num(s.longestStreakDays);

  const dueNowBar = bar(s.dueNowPct, 10, '■', '□');
  const newTodayBar = bar(s.newTodayPct, 10, '■', '□');

  return [
    `<b>📊 Your Learning Stats</b>`,
    `⏱️ <b>Today:</b> ${due} due • ${newly} new`,
    `🗂️ <b>Total cards:</b> ${total}`,
    '',
    `<b>Retention (30d):</b> ${retentionPct}${retentionDelta}`,
    `<code>${retentionBar}</code>`,
    '',
    `<b>Ease avg:</b> ${ease}`,
    `<b>Streak:</b> 🔥 ${streakNow} days (best ${streakBest})`,
    '',
    `<b>Today’s load</b>`,
    `Due now: <code>${dueNowBar}</code> ${pctStr(s.dueNowPct)}`,
    `New today: <code>${newTodayBar}</code> ${pctStr(s.newTodayPct)}`,
  ].join('\n');
}

export { clamp01, num };
