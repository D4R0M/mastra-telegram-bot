import { describe, it, expect } from "vitest";
import {
  bar,
  deltaArrow,
  fmtStatsHTML,
  fmtSettingsHTML,
  type Stats,
  type Settings,
} from "../src/mastra/ui/format.ts";

describe("format helpers", () => {
  it("renders bars with correct fill", () => {
    expect(bar(0.5, 10, "#", "-")).toBe("#####-----");
    expect(bar(0, 5)).toBe("░░░░░");
  });

  it("renders delta arrows", () => {
    expect(deltaArrow(0.1)).toBe("▲");
    expect(deltaArrow(-0.2)).toBe("▼");
    expect(deltaArrow(0)).toBe("▬");
  });

  it("formats stats HTML with fallbacks", () => {
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
    expect(html).toContain("🗂️ <b>Total cards:</b> 0");
    expect(html).toContain("<b>Retention (30d):</b> 0%");
    expect(html).not.toContain("undefined");
    expect(html).not.toContain("N/A");
  });

  it("formats settings grouped into sections", () => {
    const settings: Settings = {
      timezone: "Europe/Stockholm",
      dnd_start: "22:00",
      dnd_end: "07:00",
      daily_new_limit: 20,
      daily_review_limit: 200,
      session_size: 10,
      reminders_enabled: true,
      reminder_times: ["09:00", "14:00", "19:00"],
      algorithm: "sm2",
      locale: "en",
    };
    const html = fmtSettingsHTML(settings);
    expect(html).toContain("⚙️ General Settings");
    expect(html).toContain("📚 Study Settings");
    expect(html).toContain("🔔 Notifications");
  });
});
