import { describe, it, expect, vi } from "vitest";
import handleSettingsCommand from "../src/mastra/commands/settings.ts";

vi.mock("../src/mastra/tools/settingsTools.ts", () => ({
  getUserSettingsTool: {
    execute: vi.fn(async () => ({
      success: true,
      settings: {
        timezone: "UTC",
        dnd_start: "22:00",
        dnd_end: "06:00",
        daily_new_limit: 10,
        daily_review_limit: 20,
        session_size: 5,
        reminders_enabled: true,
        reminder_times: ["09:00"],
        algorithm: "sm2",
        locale: "en",
      },
    })),
  },
}));

describe("settings command", () => {
  it("formats settings with inline keyboard", async () => {
    const res = await handleSettingsCommand([], "", "user");
    expect(res.response).toContain("⚙️ Your Settings");
    expect(res.inline_keyboard).toBeTruthy();
    expect(res.parse_mode).toBe("HTML");
    expect(res.response).not.toContain("undefined");
  });
});
