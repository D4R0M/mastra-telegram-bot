import { describe, it, expect, vi } from "vitest";
import handleExportCommand from "../src/mastra/commands/export.ts";

vi.mock("../src/mastra/tools/importExportTools.ts", () => ({
  exportCSVTool: { execute: vi.fn() },
  parseCSV: (csv: string) => csv.trim().split(/\r?\n/).map((l) => l.split(",")),
}));

const { exportCSVTool } = await import("../src/mastra/tools/importExportTools.ts");

describe("export command", () => {
  it("returns preview and buttons", async () => {
    vi.mocked(exportCSVTool.execute).mockResolvedValue({
      success: true,
      csv_data: 'Front,Back\nFarm,Field\nBarn,Storage\nHome,House\n',
      card_count: 3,
      filename_suggestion: 'cards_export.csv',
      message: 'ok',
    });

    const res = await handleExportCommand([], '', 12345);
    expect(res.response).toContain('CSV Export Ready');
    expect(res.inline_keyboard).toBeTruthy();
    expect(res.conversationState?.data?.csv).toContain('Front');
  });
});
