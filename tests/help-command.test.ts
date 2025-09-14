import { describe, it, expect } from "vitest";
import handleHelpCommand from "../src/mastra/commands/help.ts";

describe("help command", () => {
  it("returns main help with navigation buttons", async () => {
    const res = await handleHelpCommand();
    expect(res.response).toContain("Quick Start");
    expect(res.inline_keyboard).toBeTruthy();
  });

  it("supports section pages", async () => {
    const res = await handleHelpCommand(["core"]);
    expect(res.response).toContain("Core Commands");
    expect(res.response).toContain("Grading Scale");
  });
});
