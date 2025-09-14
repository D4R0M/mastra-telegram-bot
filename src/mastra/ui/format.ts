export type Stats = {
  totalCards: number | null;
  dueToday: number | null;
  newToday: number | null;
  avgEase: number | null; // e.g., SM-2 E-Factor
  retentionRate: number | null; // 0..1
  retentionDelta: number | null; // -1..1 (vs previous 30d)
  currentStreakDays: number | null;
  longestStreakDays: number | null;
  dueNowPct: number | null; // 0..1 of today's due already done
  newTodayPct: number | null; // 0..1 of daily new target already added
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const num = (v: any, fb = 0) => (Number.isFinite(Number(v)) ? Number(v) : fb);
export const pctStr = (p: number | null) =>
  p == null ? "N/A" : `${Math.round(clamp01(p) * 100)}%`;

export const escapeHtml = (s: any) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export function bar(
  p: number | null,
  width = 15,
  fill = "█",
  empty = "░",
): string {
  if (p == null) return empty.repeat(width);
  const filled = Math.round(clamp01(p) * width);
  return fill.repeat(filled) + empty.repeat(width - filled);
}

export function deltaArrow(d: number | null): string {
  if (d == null || !Number.isFinite(d)) return "";
  if (d > 0.005) return "▲";
  if (d < -0.005) return "▼";
  return "▬";
}

export function fmtStatsHTML(s: Stats) {
  const total = num(s.totalCards);
  const due = num(s.dueToday);
  const newly = num(s.newToday);
  const ease = s.avgEase == null ? "N/A" : s.avgEase.toFixed(2);

  const retentionPct =
    s.retentionRate == null
      ? "N/A"
      : `${Math.round(clamp01(s.retentionRate) * 100)}%`;
  const retentionBar = bar(s.retentionRate, 15, "█", "░");
  const retentionDelta =
    s.retentionDelta == null
      ? ""
      : ` ${deltaArrow(s.retentionDelta)} ${Math.round(Math.abs(s.retentionDelta) * 100)}%`;

  const streakNow = num(s.currentStreakDays);
  const streakBest = num(s.longestStreakDays);

  const dueNowBar = bar(s.dueNowPct, 10, "■", "□");
  const newTodayBar = bar(s.newTodayPct, 10, "■", "□");

  return [
    `<b>📊 Your Learning Stats</b>`,
    `⏱️ <b>Today:</b> ${due} due • ${newly} new`,
    `🗂️ <b>Total cards:</b> ${total}`,
    "",
    `<b>Retention (30d):</b> ${retentionPct}${retentionDelta}`,
    `<code>${retentionBar}</code>`,
    "",
    `<b>Ease avg:</b> ${ease}`,
    `<b>Streak:</b> 🔥 ${streakNow} days (best ${streakBest})`,
    "",
    `<b>Today’s load</b>`,
    `Due now: <code>${dueNowBar}</code> ${pctStr(s.dueNowPct)}`,
    `New today: <code>${newTodayBar}</code> ${pctStr(s.newTodayPct)}`,
  ].join("\n");
}

export type StreakStats = {
  current_streak: number | null;
  longest_streak: number | null;
  total_study_days: number | null;
  reviews_today: number | null;
  average_daily_reviews: number | null;
  last_review_date?: string | null;
};

export function fmtStreakHTML(s: StreakStats) {
  const current = num(s.current_streak);
  const longest = num(s.longest_streak);
  const totalDays = num(s.total_study_days);
  const reviewsToday = num(s.reviews_today);
  const avgDaily =
    s.average_daily_reviews == null
      ? "N/A"
      : s.average_daily_reviews.toFixed(1);
  const lastReview = s.last_review_date
    ? escapeHtml(s.last_review_date)
    : "N/A";
  const streakBar =
    longest > 0 ? bar(current / longest, 15, "█", "░") : bar(null, 15);

  const lines = [
    `<b>🔥 Your Study Streak</b>`,
    `Current: ${current} days`,
    `Longest: ${longest} days`,
    `<code>${streakBar}</code>`,
    `Total study days: ${totalDays}`,
    `Reviews today: ${reviewsToday}`,
    `Avg daily reviews: ${avgDaily}`,
    `Last review: ${lastReview}`,
  ];

  if (current >= 30) {
    lines.push("\n🏆 Amazing! You've maintained your streak for over a month!");
  } else if (current >= 7) {
    lines.push("\n⭐ Great job! You're on a weekly streak!");
  } else if (current >= 3) {
    lines.push("\n👍 Good work! Keep it up!");
  }

  return lines.join("\n");
}

export type UserSettings = {
  timezone: string | null;
  dnd_start: string | null;
  dnd_end: string | null;
  daily_new_limit: number | null;
  daily_review_limit: number | null;
  session_size: number | null;
  reminders_enabled: boolean | null;
  reminder_times: string[] | null;
  algorithm: string | null;
  locale: string | null;
};

export function fmtSettingsHTML(s: UserSettings) {
  const tz = s.timezone ? escapeHtml(s.timezone) : "N/A";
  const dndStart = s.dnd_start || "N/A";
  const dndEnd = s.dnd_end || "N/A";
  const newLimit = num(s.daily_new_limit);
  const reviewLimit = num(s.daily_review_limit);
  const sessionSize = num(s.session_size);
  const reminders = s.reminders_enabled ? "Enabled" : "Disabled";
  const reminderTimes =
    s.reminder_times && s.reminder_times.length
      ? s.reminder_times.join(", ")
      : "—";
  const algorithm = s.algorithm ? s.algorithm.toUpperCase() : "N/A";
  const lang = s.locale || "N/A";

  return [
    `<b>⚙️ Your Settings</b>`,
    `📍 Timezone: ${tz}`,
    `🔕 Do Not Disturb: ${dndStart} - ${dndEnd}`,
    `📚 Daily New Cards: ${newLimit}`,
    `🔄 Daily Reviews: ${reviewLimit}`,
    `🗂️ Session Size: ${sessionSize} cards`,
    `🔔 Reminders: ${reminders}`,
    `⏰ Reminder Times: ${reminderTimes}`,
    `🧮 Algorithm: ${algorithm}`,
    `🌐 Language: ${lang}`,
  ].join("\n");
}

export function fmtHelpHTML() {
  return [
    `<b>📚 Vocabulary Learning Bot Commands</b>`,
    "",
    `<b>Core Commands:</b>`,
    `/add - Add a new vocabulary card`,
    `/practice - Start a review session`,
    `/list - Show all your cards`,
    `/due - Check cards due for review`,
    `/stats - View your learning statistics`,
    `/streak - Check your study streak`,
    "",
    `<b>Card Management:</b>`,
    `/edit [id] - Edit a card`,
    `/delete [id] - Delete a card`,
    `/export csv - Export cards to CSV`,
    `/import - Import cards from CSV`,
    "",
    `<b>Settings:</b>`,
    `/settings - View your settings`,
    `/reset - Reset settings to defaults`,
    "",
    `<b>Quick Add Formats:</b>`,
    `/add word | translation`,
    `/add word :: translation`,
    `/add word | translation | tags | example`,
    "",
    `<i>During reviews, grade yourself 0-5:</i>`,
    `0 = Complete failure`,
    `1 = Incorrect, saw answer`,
    `2 = Incorrect, but easy`,
    `3 = Correct, difficult`,
    `4 = Correct, hesitated`,
    `5 = Perfect recall`,
  ].join("\n");
}

export { clamp01, num };
