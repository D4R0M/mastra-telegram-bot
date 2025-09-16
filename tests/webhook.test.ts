import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

const commandMocks = vi.hoisted(() => ({
  processCommand: vi.fn(),
  handleListCallback: vi.fn(),
  handleSettingsCallback: vi.fn(),
}));

const recordedCommands: string[] = [];

vi.mock("../src/mastra/commandParser.js", () => ({
  parseCommand: (message: string) => {
    const trimmed = message.trim();
    if (!trimmed.startsWith("/")) {
      return null;
    }
    const parts = trimmed.split(/\s+/);
    let command = parts[0].toLowerCase();
    if (command.includes("@")) {
      command = command.split("@")[0];
    }
    const params = parts.slice(1);
    const rawParams = trimmed.substring(parts[0].length).trim();
    return { command, params, rawParams };
  },
  processCommand: commandMocks.processCommand,
  handleListCallback: commandMocks.handleListCallback,
  handleSettingsCallback: commandMocks.handleSettingsCallback,
}));

vi.mock("../src/mastra/conversationStateStorage.ts", () => ({
  getConversationState: vi.fn(async () => ({ state: undefined, expired: false })),
  saveConversationState: vi.fn(async () => {}),
}));

vi.mock("../src/mastra/authorization.js", () => ({
  isAuthorizedTelegramUser: vi.fn(async () => true),
  isAdmin: vi.fn(async () => false),
  allowUser: vi.fn(async () => {}),
  finalizeInvite: vi.fn(() => null),
}));

let processTelegramUpdate: typeof import("../src/mastra/telegram.ts").processTelegramUpdate;

beforeAll(async () => {
  ({ processTelegramUpdate } = await import("../src/mastra/telegram.ts"));
});

describe("processTelegramUpdate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordedCommands.length = 0;
    commandMocks.processCommand.mockReset();
    commandMocks.processCommand.mockImplementation(async (command: string) => {
      recordedCommands.push(command);
      return {
        response: "ok",
        parse_mode: "HTML",
      };
    });
    commandMocks.handleListCallback.mockReset();
    commandMocks.handleSettingsCallback.mockReset();
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

  it.each([
    ["practice_learning", "/practice inline learning", 101],
    ["practice_new", "/practice inline new", 102],
    ["practice_overdue", "/practice inline overdue", 103],
  ])(
    "routes %s callback to filtered practice",
    async (callbackData, expectedCommand, updateId) => {
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

      const { processCommand: importedProcessCommand } = await import(
        "../src/mastra/commandParser.js"
      );
      expect(importedProcessCommand).toBe(commandMocks.processCommand);

      const update = {
        update_id: updateId,
        callback_query: {
          id: "cb-1",
          data: callbackData,
          from: { id: 777, username: "tester" },
          message: {
            chat: { id: 42, type: "private" },
            message_id: 9,
          },
        },
      };

      await processTelegramUpdate(update, mastra as any, Date.now());

      expect(recordedCommands).toContain(expectedCommand);
      const call = commandMocks.processCommand.mock.calls.at(-1);
      expect(call?.[1]).toBe("777");
      expect(call?.[2]).toBe("42");
      expect(call?.[3]).toBeUndefined();
      expect(call?.[4]).toBe(mastra);
      expect(call?.[5]).toBe(false);
      expect(call?.[6]).toBe("tester");
      expect(call?.[7]).toEqual({ chatType: "private" });

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("answerCallbackQuery"),
        expect.any(Object),
      );
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("sendMessage"),
        expect.any(Object),
      );
    },
  );
});
