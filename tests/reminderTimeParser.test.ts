import { describe, expect, it } from "vitest";
import { parseReminderTimesInput } from "../src/mastra/utils/reminderTime.js";

describe("parseReminderTimesInput", () => {
  it("accepts bare hours and normalizes them", () => {
    const result = parseReminderTimesInput("8, 9, 17");
    expect(result).toEqual({
      success: true,
      times: ["08:00", "09:00", "17:00"],
    });
  });

  it("handles mixed hour and minute entries", () => {
    const result = parseReminderTimesInput("7, 7:30, 19:5");
    expect(result).toEqual({
      success: true,
      times: ["07:00", "07:30", "19:05"],
    });
  });

  it("deduplicates repeated entries while preserving order", () => {
    const result = parseReminderTimesInput("6, 6:00, 18, 6");
    expect(result).toEqual({
      success: true,
      times: ["06:00", "18:00"],
    });
  });

  it("rejects invalid tokens", () => {
    const result = parseReminderTimesInput("9, 25");
    expect(result).toEqual({
      success: false,
      error: "Invalid time entry: 25. Use HH or HH:MM format between 0-23 hours.",
    });
  });

  it("requires at least one value", () => {
    const result = parseReminderTimesInput("   ");
    expect(result).toEqual({
      success: false,
      error: "Please provide at least one reminder hour (e.g., 9, 13:30).",
    });
  });
});
