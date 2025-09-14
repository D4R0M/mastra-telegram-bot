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

export type Streak = {
  current: number | null;
  longest: number | null;
  totalDays: number | null;
  reviewsToday: number | null;
  avgDailyReviews: number | null;
  lastReviewDate: string | null;
};

export function fmtStreakHTML(s: Streak) {
  const current = num(s.current);
  const longest = num(s.longest);
  const total = num(s.totalDays);
  const reviewsToday = num(s.reviewsToday);
  const avgDaily =
    s.avgDailyReviews == null ? 'N/A' : s.avgDailyReviews.toFixed(1);
  const lastReview = s.lastReviewDate ?? 'N/A';

  let note = '';
  if (current >= 30) {
    note = "\n🏆 Amazing! You've maintained your streak for over a month!";
  } else if (current >= 7) {
    note = "\n⭐ Great job! You're on a weekly streak!";
  } else if (current >= 3) {
    note = "\n👍 Good work! Keep it up!";
  }

  return [
    '<b>🔥 Your Study Streak</b>',
    `Current streak: ${current} days`,
    `Longest streak: ${longest} days`,
    `Total study days: ${total}`,
    `Reviews today: ${reviewsToday}`,
    `Avg daily reviews: ${avgDaily}`,
    `Last review: ${lastReview}`,
    note,
  ]
    .filter(Boolean)
    .join('\n');
}

export type Settings = {
  timezone: string;
  dnd_start: string;
  dnd_end: string;
  daily_new_limit: number;
  daily_review_limit: number;
  session_size: number;
  reminders_enabled: boolean;
  reminder_times: string[];
  algorithm: string;
  locale: string;
};

export function fmtSettingsHTML(s: Settings) {
  return [
    '<b>⚙️ Your Settings</b>',
    `📍 <b>Timezone:</b> ${s.timezone}`,
    `🔕 <b>Do Not Disturb:</b> ${s.dnd_start} - ${s.dnd_end}`,
    `📚 <b>Daily New Cards:</b> ${s.daily_new_limit}`,
    `🔄 <b>Daily Reviews:</b> ${s.daily_review_limit}`,
    `📖 <b>Session Size:</b> ${s.session_size} cards`,
    `🔔 <b>Reminders:</b> ${s.reminders_enabled ? 'Enabled' : 'Disabled'}`,
    `⏰ <b>Reminder Times:</b> ${s.reminder_times.join(', ')}`,
    `🧮 <b>Algorithm:</b> ${s.algorithm.toUpperCase()}`,
    `🌐 <b>Language:</b> ${s.locale}`,
  ].join('\n');
}

export function fmtHelpHTML() {
  return [
    '<b>📚 Vocabulary Learning Bot Commands</b>',
    '',
    '<b>Core Commands:</b>',
    '/add - Add a new vocabulary card',
    '/practice - Start a review session',
    '/list - Show all your cards',
    '/due - Check cards due for review',
    '/stats - View your learning statistics',
    '/streak - Check your study streak',
    '',
    '<b>Card Management:</b>',
    '/edit [id] - Edit a card',
    '/delete [id] - Delete a card',
    '/export csv - Export cards to CSV',
    '/import - Import cards from CSV',
    '',
    '<b>Settings:</b>',
    '/settings - View your settings',
    '/reset - Reset settings to defaults',
    '',
    '<b>Quick Add Formats:</b>',
    '/add word | translation',
    '/add word :: translation',
    '/add word | translation | tags | example',
    '',
    '<i>During reviews, grade yourself 0-5:</i>',
    '0 = Complete failure',
    '1 = Incorrect, saw answer',
    '2 = Incorrect, but easy',
    '3 = Correct, difficult',
    '4 = Correct, hesitated',
    '5 = Perfect recall',
  ].join('\n');
}

export { clamp01, num };
