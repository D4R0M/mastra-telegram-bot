import { describe, it, expect, vi } from "vitest";

// Allow test user ID 123 to pass authorization checks
process.env.ADMIN_USER_IDS = "123";
await import("../src/mastra/authorization.ts");

vi.mock("../src/mastra/commandParser.ts", () => ({
  parseCommand: vi.fn(),
  processCommand: vi.fn(async () => ({
    response: "ok",
    conversationState: {},
    parse_mode: "HTML",
  })),
}));

vi.mock("../src/mastra/conversationStateStorage.ts", () => ({
  getConversationState: vi.fn(async () => ({
    state: undefined,
    expired: false,
  })),
  saveConversationState: vi.fn(async () => {}),
}));

const { processTelegramUpdate } = await import("../src/mastra/telegram.ts");

const mastra = {
  getLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }),
} as any;

// @ts-ignore
const processCommandMock = (await import("../src/mastra/commandParser.ts"))
  .processCommand as any;

describe("grade callback handling", () => {
  it("passes grade from callback to processCommand", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ json: async () => ({ result: { message_id: 1 } }) });
    // @ts-ignore
    global.fetch = fetchMock;
    process.env.TELEGRAM_BOT_TOKEN = "test";

    const update = {
      update_id: 9999,
      callback_query: {
        id: "cb1",
        from: { id: 123 },
        data: "grade:4:card",
        message: { chat: { id: 555 } },
      },
    };

    await processTelegramUpdate(update, mastra, Date.now());

    expect(processCommandMock).toHaveBeenCalledWith(
      "4",
      "123",
      "555",
      undefined,
      mastra,
      false,
    );
    expect(fetchMock).toHaveBeenCalled();
  });
});
