import { describe, it, expect } from "vitest";
import {
  bar,
  deltaArrow,
  fmtStatsHTML,
  fmtStreakHTML,
  fmtSettingsHTML,
  fmtHelpHTML,
  type Stats,
  type StreakStats,
  type UserSettings,
} from "../src/mastra/ui/format.ts";

describe("format helpers", () => {
  it("renders bars with correct fill", () => {
    expect(bar(0.5, 10, "#", "-")).toBe("#####-----");
    expect(bar(null, 5)).toBe("░░░░░");
  });

  it("renders delta arrows", () => {
    expect(deltaArrow(0.1)).toBe("▲");
    expect(deltaArrow(-0.2)).toBe("▼");
    expect(deltaArrow(0)).toBe("▬");
    expect(deltaArrow(null)).toBe("");
  });

  it("formats stats HTML with fallbacks", () => {
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
    expect(html).toContain("Total cards: 0");
    expect(html).toContain("Retention (30d): N/A");
    expect(html).not.toContain("undefined");
  });

  it("formats streak HTML", () => {
    const s: StreakStats = {
      current_streak: 3,
      longest_streak: 5,
      total_study_days: 10,
      reviews_today: 2,
      average_daily_reviews: 1.5,
      last_review_date: "2024-05-01",
    };
    const html = fmtStreakHTML(s);
    expect(html).toContain("🔥 Your Study Streak");
    expect(html).toContain("Current: 3 days");
    expect(html).not.toContain("undefined");
  });

  it("formats settings HTML with fallbacks", () => {
    const s: UserSettings = {
      timezone: null,
      dnd_start: null,
      dnd_end: null,
      daily_new_limit: null,
      daily_review_limit: null,
      session_size: null,
      reminders_enabled: false,
      reminder_times: [],
      algorithm: null,
      locale: null,
    };
    const html = fmtSettingsHTML(s);
    expect(html).toContain("Timezone: N/A");
    expect(html).toContain("Reminders: Disabled");
    expect(html).not.toContain("undefined");
  });

  it("formats help HTML", () => {
    const html = fmtHelpHTML();
    expect(html).toContain("Vocabulary Learning Bot Commands");
    expect(html).toContain("/add - Add a new vocabulary card");
  });
});
