import { describe, it, expect, vi, beforeEach } from "vitest";
import { processTelegramUpdate } from "../src/mastra/telegram";

vi.mock("../src/mastra/conversationStateStorage.js", () => ({
  getConversationState: vi.fn().mockResolvedValue({ state: undefined, expired: false }),
  saveConversationState: vi.fn().mockResolvedValue(undefined),
  clearConversationState: vi.fn().mockResolvedValue(undefined),
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

  it("responds to /start with help text", async () => {
    const logger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    } as any;
    const mastra = { getLogger: () => logger } as any;
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ result: { message_id: 43 } }),
    });
    // @ts-ignore
    global.fetch = fetchMock;
    process.env.TELEGRAM_BOT_TOKEN = "test";

    const update = {
      update_id: 2,
      message: {
        chat: { id: 1 },
        from: { id: 6776842238 },
        text: "/start",
        message_id: 10,
      },
    };

    await processTelegramUpdate(update, mastra as any, Date.now());

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.text).toContain("Vocabulary Learning Bot Commands");
  });
});
