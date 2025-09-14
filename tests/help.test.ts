import { describe, it, expect } from "vitest";
import handleHelpCommand from "../src/mastra/commands/help.ts";

describe("help command", () => {
  it("renders help with inline keyboard", async () => {
    const res = await handleHelpCommand([], "", "user");
    expect(res.response).toContain("Vocabulary Learning Bot Commands");
    expect(res.inline_keyboard).toBeTruthy();
    expect(res.parse_mode).toBe("HTML");
  });
});
