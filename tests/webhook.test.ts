import { describe, it, expect, vi, beforeEach } from "vitest";
import { processTelegramUpdate } from "../src/mastra/telegram";

vi.mock("../src/mastra/conversationStateStorage.ts", () => ({
  getConversationState: vi.fn(async () => ({ state: undefined, expired: false })),
  saveConversationState: vi.fn(async () => {}),
}));

describe("processTelegramUpdate", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sends message once per update_id", async () => {
    const logger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    } as any;
    const mastra = { getLogger: () => logger } as any;
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ result: { message_id: 42 } }),
    });
    // @ts-ignore
    global.fetch = fetchMock;
    process.env.TELEGRAM_BOT_TOKEN = "test";

    const update = {
      update_id: 1,
      message: { chat: { id: 1 }, from: { id: 6776842238 }, text: "ping" },
    };

    await processTelegramUpdate(update, mastra as any, Date.now());
    await processTelegramUpdate(update, mastra as any, Date.now());

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
