import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../tools/vocabularyTools.js", () => ({
  addCardTool: {
    execute: vi.fn(),
  },
}));

const { default: handleAddCommand } = await import("./add.js");
const { addCardTool } = await import("../tools/vocabularyTools.js");

describe("handleAddCommand quick-add", () => {
  const logger = { info: vi.fn(), error: vi.fn() };
  const mastra = { getLogger: () => logger };

  beforeEach(() => {
    vi.mocked(addCardTool.execute).mockReset();
    logger.info.mockClear();
    logger.error.mockClear();
  });

  it("returns duplicate response with inline keyboard", async () => {
    vi.mocked(addCardTool.execute).mockResolvedValue({
      success: false,
      message: "This card already exists ?\n\n- <b>hund</b> -&gt; dog",
      duplicate: {
        existing: { id: "card-1", front: "hund", back: "dog", tags: [] },
        similar: [],
      },
    });

    const response = await handleAddCommand([], "/add Hund | Dog", "123", undefined, mastra);

    expect(response.response).toContain("already exists");
    expect(response.inline_keyboard).toBeTruthy();
    expect(response.inline_keyboard?.inline_keyboard[0][0].callback_data).toBe("list:menu:card-1");
    expect(response.parse_mode).toBe("HTML");
  });

  it("includes similar suggestions when provided", async () => {
    vi.mocked(addCardTool.execute).mockResolvedValue({
      success: false,
      message: "This card already exists ?\n\nDid you mean",
      duplicate: {
        existing: { id: "card-1", front: "hund", back: "dog", tags: [] },
        similar: [
          { id: "card-2", front: "Hunden springer", back: "The dog runs", tags: [], similarity: 0.6 },
        ],
      },
    });

    const response = await handleAddCommand([], "/add Hund | Dog", "123", undefined, mastra);

    expect(response.inline_keyboard).toBeTruthy();
    expect(response.inline_keyboard?.inline_keyboard.length).toBe(2);
    expect(response.inline_keyboard?.inline_keyboard[1][0].callback_data).toBe("list:menu:card-2");
    expect(response.response).toContain("Did you mean");
  });
});
