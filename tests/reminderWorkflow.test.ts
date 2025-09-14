import { describe, it, expect, vi, beforeEach } from "vitest";
import { processRemindersStep } from "../src/mastra/workflows/reminderWorkflow.ts";

vi.mock("../src/mastra/tools/reminderTools.ts", () => ({
  checkReminderTimeTool: { execute: vi.fn() },
  recordReminderSentTool: { execute: vi.fn() },
}));

vi.mock("../src/mastra/tools/statisticsTools.ts", () => ({
  getDueCardsStatsTool: { execute: vi.fn() },
}));

vi.mock("../src/mastra/workflows/vocabularyWorkflow.ts", () => ({
  sendTelegramResponseStep: { execute: vi.fn() },
}));

import {
  checkReminderTimeTool,
  recordReminderSentTool,
} from "../src/mastra/tools/reminderTools.ts";
import { getDueCardsStatsTool } from "../src/mastra/tools/statisticsTools.ts";
import { sendTelegramResponseStep } from "../src/mastra/workflows/vocabularyWorkflow.ts";

const user = { user_id: "u1", chat_id: "c1" };

describe("reminder workflow", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("sends reminder when due cards exist", async () => {
    checkReminderTimeTool.execute.mockResolvedValue({
      success: true,
      should_send_reminder: true,
    });
    getDueCardsStatsTool.execute.mockResolvedValue({
      success: true,
      stats: { due_cards: 3 },
    });
    sendTelegramResponseStep.execute.mockResolvedValue({ messageSent: true });
    recordReminderSentTool.execute.mockResolvedValue({});

    const res = await processRemindersStep.execute({
      inputData: { users: [user] },
      mastra: undefined,
    });

    expect(sendTelegramResponseStep.execute).toHaveBeenCalledOnce();
    expect(recordReminderSentTool.execute).toHaveBeenCalledOnce();
    expect(res.remindersSent).toBe(1);
  });

  it("skips reminder when no cards are due", async () => {
    checkReminderTimeTool.execute.mockResolvedValue({
      success: true,
      should_send_reminder: true,
    });
    getDueCardsStatsTool.execute.mockResolvedValue({
      success: true,
      stats: { due_cards: 0 },
    });

    const res = await processRemindersStep.execute({
      inputData: { users: [user] },
      mastra: undefined,
    });

    expect(sendTelegramResponseStep.execute).not.toHaveBeenCalled();
    expect(recordReminderSentTool.execute).not.toHaveBeenCalled();
    expect(res.remindersSent).toBe(0);
  });
});
