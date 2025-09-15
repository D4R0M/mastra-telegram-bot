export type Stats = {
  totalCards: number;
  dueToday: number;
  newToday: number;
  avgEase: number; // e.g., SM-2 E-Factor
  retentionRate: number; // 0..1
  retentionDelta: number; // -1..1 (vs previous 30d)
  currentStreakDays: number;
  longestStreakDays: number;
  dueNowPct: number; // 0..1 of today's due already done
  newTodayPct: number; // 0..1 of daily new target already added
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const num = (v: any, fb = 0) => (Number.isFinite(Number(v)) ? Number(v) : fb);
export const pctStr = (p: number) => `${Math.round(clamp01(p) * 100)}%`;

export function bar(p: number, width = 15, fill = "█", empty = "░"): string {
  const filled = Math.round(clamp01(p) * width);
  return fill.repeat(filled) + empty.repeat(width - filled);
}

export function deltaArrow(d: number): string {
  if (!Number.isFinite(d)) return "";
  if (d > 0.005) return "▲";
  if (d < -0.005) return "▼";
  return "▬";
}

export function fmtStatsHTML(s: Stats) {
  const total = num(s.totalCards);
  const due = num(s.dueToday);
  const newly = num(s.newToday);
  const ease = num(s.avgEase).toFixed(2);

  const retentionPct = `${Math.round(clamp01(s.retentionRate) * 100)}%`;
  const retentionBar = bar(s.retentionRate, 15, "█", "░");
  const retentionDelta = s.retentionDelta
    ? ` ${deltaArrow(s.retentionDelta)} ${Math.round(Math.abs(s.retentionDelta) * 100)}%`
    : "";

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

export type DueSummary = {
  total: number;
  dueToday: number;
  dueTomorrow: number;
  new: number;
  learning: number;
  review: number;
  overdue: number;
};

export function fmtDueHTML(d: DueSummary) {
  const loadTotal = d.dueToday + d.overdue;
  const loadPct = loadTotal ? d.dueToday / loadTotal : 0;
  const loadBar = bar(loadPct, 10, "■", "□");
  const lines = [
    "📊 <b>Cards Due for Review</b>",
    "",
    `🃏 Total: ${d.total}`,
    `✅ Due Today: ${d.dueToday}`,
    `📅 Due Tomorrow: ${d.dueTomorrow}`,
    `🆕 New Cards: ${d.new}`,
    "",
    `📖 Learning: ${d.learning}`,
    `🔁 Review: ${d.review}`,
    `⚠️ Overdue: ${d.overdue}`,
    "",
    "<b>Today's Load</b>",
    `<code>${loadBar}</code> ${pctStr(loadPct)}`,
  ];
  if (d.dueToday > 0) {
    lines.push(
      "",
      `✨ Great job keeping up! Finish ${d.dueToday} reviews today to stay on track.`,
    );
  } else {
    lines.push("", "✨ All caught up! No cards due today.");
  }
  return lines.join("\n");
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
    s.avgDailyReviews == null ? "N/A" : s.avgDailyReviews.toFixed(1);
  const lastReview = s.lastReviewDate ?? "N/A";

  const lines = [
    "<b>🔥 Your Study Streak</b>",
    "<code>━━━━━━━━━━━━━━</code>",
    `📅 Current streak: ${current} days`,
    `🏆 Longest streak: ${longest} days`,
    `📊 Total study days: ${total}`,
    `🔁 Reviews today: ${reviewsToday}`,
    `📈 Avg daily reviews: ${avgDaily}`,
    `📌 Last review: ${lastReview}`,
  ];

  const streakIcons = "🔥".repeat(Math.min(current, 10));
  if (streakIcons) {
    lines.push(
      `${streakIcons} (${current} day${current === 1 ? "" : "s"})${longest > current ? ` — Keep going to hit ${current + 1}!` : ""}`,
    );
  }

  if (current === 3) {
    lines.push("🎉 First 3-day streak!");
  }
  if (current >= longest && longest > 0) {
    lines.push("🚀 Longest streak yet!");
  } else if (longest > current) {
    const diff = longest - current;
    lines.push(
      `➡️ Only ${diff} more day${diff === 1 ? "" : "s"} to beat your record!`,
    );
  }

  if (current >= 30) {
    lines.push("🏆 Amazing! You've maintained your streak for over a month!");
  } else if (current >= 7) {
    lines.push("⭐ Great job! You're on a weekly streak!");
  } else if (current >= 3) {
    lines.push("👍 Good work! Keep it up!");
  }

  lines.push("✨ Great job! Keep your streak alive today with /practice");

  return lines.join("\n");
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
    "<b>⚙️ General Settings</b>",
    `🌍 Timezone: ${s.timezone}`,
    `🔕 Do Not Disturb: ${s.dnd_start} – ${s.dnd_end}`,
    `🌐 Language: ${s.locale}`,
    "",
    "<b>📚 Study Settings</b>",
    `🆕 Daily New Cards: ${s.daily_new_limit}`,
    `🔁 Daily Reviews: ${s.daily_review_limit}`,
    `🎯 Session Size: ${s.session_size}`,
    `🧠 Algorithm: ${s.algorithm.toUpperCase()}`,
    "",
    "<b>🔔 Notifications</b>",
    `📌 Reminders: ${s.reminders_enabled ? "Enabled" : "Disabled"}`,
    `🕘 Reminder Times: ${s.reminder_times.join(", ")}`,
  ].join("\n");
}

export function fmtStartHTML() {
  return [
    "<b>👋 Welcome to Vocabulary Learning Bot!</b>",
    "",
    "I can help you build your vocabulary using spaced repetition.",
    "",
    "<b>Try these commands to begin:</b>",
    "/add - save a new word",
    "/practice - review your cards",
    "/stats - see your progress",
    "",
    "Use the menu below or type a command to get started. Happy learning!",
  ].join("\n");
}

export function fmtHelpHTML(section: string = "main") {
  if (section === "core") {
    return [
      "<b>📌 Core Commands</b>",
      "",
      "⭐ <b>Quick Start</b>",
      "/add → Add a card",
      "/practice → Start a review",
      "/due → See due cards",
      "",
      "/list → Show all your cards",
      "/stats → View learning statistics",
      "/streak → Check study streak",
      "",
      "🎯 <b>Grading Scale</b>",
      "0️⃣ Failure",
      "1️⃣ Incorrect, saw answer",
      "2️⃣ Incorrect, but easy",
      "3️⃣ Correct, difficult 😅",
      "4️⃣ Correct, hesitant",
      "5️⃣ Perfect recall 🚀",
    ].join("\n");
  }

  if (section === "cards") {
    return [
      "<b>🗂 Card Management</b>",
      "",
      "/edit [id] → Edit a card",
      "/delete [id] → Delete a card",
      "/export_cards → Export cards to CSV",
      "/import → Import cards from CSV",
    ].join("\n");
  }

  if (section === "settings") {
    return [
      "<b>⚙️ Settings</b>",
      "",
      "/settings → View settings",
      "/reset → Reset to defaults",
    ].join("\n");
  }

  if (section === "quickadd") {
    return [
      "<b>⚡ Quick Add</b>",
      "",
      "/add word | translation",
      "/add word :: translation",
      "/add word | translation | tag | example",
      "",
      "📝 <b>Example: Adding a card</b>",
      "/add prejudice | Making a judgement before you know the full picture",
    ].join("\n");
  }

  return [
    "<b>📚 Help Menu</b>",
    "",
    "⭐ <b>Quick Start</b>",
    "/add → Add a card",
    "/practice → Start a review",
    "/due → See due cards",
    "",
    "Use the buttons below to explore more commands.",
    "",
    "💡 Tip: Start your day with /due to never miss a review!",
    "🔥 Keep up your streak with /practice daily.",
  ].join("\n");
}

export { clamp01, num };
