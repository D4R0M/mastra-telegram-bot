import { describe, it, expect, beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDueCardsExecute: vi.fn(),
  startReviewExecute: vi.fn(),
  getUserSettingsExecute: vi.fn(),
}));

vi.mock("../src/mastra/tools/reviewTools.js", () => ({
  getDueCardsTool: { execute: mocks.getDueCardsExecute },
  startReviewTool: { execute: mocks.startReviewExecute },
}));

vi.mock("../src/mastra/tools/settingsTools.js", () => ({
  getUserSettingsTool: { execute: mocks.getUserSettingsExecute },
}));

import handlePracticeCommand from "../src/mastra/commands/practice.ts";

const baseSettings = {
  user_id: 123,
  chat_id: "123",
  timezone: "UTC",
  dnd_start: "22:00",
  dnd_end: "07:00",
  daily_new_limit: 0,
  daily_review_limit: 100,
  session_size: 15,
  reminders_enabled: false,
  reminder_times: ["09:00"],
  algorithm: "sm2",
  locale: "en",
};

const dueCard = {
  card_id: "card-1",
  front: "hola",
  back: "hello",
  tags: [],
  example: undefined,
  lang_front: "es",
  lang_back: "en",
  queue: "review",
  due_date: "2024-01-01",
  repetitions: 3,
  ease_factor: 2.5,
  lapses: 0,
};

const startCard = {
  id: "card-1",
  front: "hola",
  back: "hello",
  tags: [],
  example: undefined,
  lang_front: "es",
  lang_back: "en",
  queue: "review",
  repetitions: 3,
  ease_factor: 2.5,
  lapses: 0,
};

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

const mastra = { getLogger: () => logger } as const;

describe("practice command respects settings", () => {
  beforeEach(() => {
    mocks.getDueCardsExecute.mockReset();
    mocks.startReviewExecute.mockReset();
    mocks.getUserSettingsExecute.mockReset();
  });

  it("uses session size and new card preference from settings", async () => {
    mocks.getUserSettingsExecute.mockResolvedValue({
      success: true,
      settings: baseSettings,
      message: "ok",
    });
    mocks.getDueCardsExecute.mockResolvedValue({
      success: true,
      cards: [dueCard],
      total_due: 1,
      message: "ok",
    });
    mocks.startReviewExecute.mockResolvedValue({
      success: true,
      card: startCard,
      start_time: Date.now(),
      message: "ok",
    });

    await handlePracticeCommand(["inline"], "inline", "123", undefined, mastra as any);

    expect(mocks.getUserSettingsExecute).toHaveBeenCalledTimes(1);
    expect(mocks.getDueCardsExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          owner_id: "123",
          limit: 15,
          include_new: false,
        }),
      }),
    );
  });

  it("overrides include_new when filtering for new cards", async () => {
    mocks.getUserSettingsExecute.mockResolvedValue({
      success: true,
      settings: baseSettings,
      message: "ok",
    });
    mocks.getDueCardsExecute.mockResolvedValue({
      success: true,
      cards: [dueCard],
      total_due: 1,
      message: "ok",
    });
    mocks.startReviewExecute.mockResolvedValue({
      success: true,
      card: startCard,
      start_time: Date.now(),
      message: "ok",
    });

    await handlePracticeCommand(
      ["inline", "new"],
      "inline new",
      "123",
      undefined,
      mastra as any,
    );

    expect(mocks.getDueCardsExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          owner_id: "123",
          limit: 15,
          include_new: true,
          queue: "new",
        }),
      }),
    );
  });
});
