import { describe, it, expect, vi } from "vitest";

vi.mock("../src/mastra/authorization.ts", () => ({
  isAdmin: vi.fn().mockResolvedValue(false),
  listAllowed: vi.fn().mockResolvedValue([]),
  exportAllowed: vi.fn().mockResolvedValue([]),
}));

import { commandRegistry } from "../src/mastra/commands/index.ts";
import list from "../src/mastra/commands/list.ts";
import users from "../src/mastra/commands/users.ts";
import exportUsers from "../src/mastra/commands/exportUsers.ts";
import {
  isAdmin,
  listAllowed,
  exportAllowed,
} from "../src/mastra/authorization.ts";

describe("admin command separation", () => {
  it("/list maps to card list handler", () => {
    expect(commandRegistry["/list"]).toBe(list);
    expect(commandRegistry["/list"]).not.toBe(users);
  });

  it("/users requires admin", async () => {
    const res = await users([], "", "1");
    expect(res.response).toBe("Not authorized.");
    (isAdmin as any).mockResolvedValueOnce(true);
    (listAllowed as any).mockResolvedValueOnce([
      { user_id: "1", username: "bob", role: "user", note: "" },
    ]);
    const ok = await users([], "", "1");
    expect(ok.response).toContain("bob");
  });

  it("/export_users exports csv for admins only", async () => {
    const res = await exportUsers([], "", "1");
    expect(res.response).toBe("Not authorized.");
    (isAdmin as any).mockResolvedValueOnce(true);
    (exportAllowed as any).mockResolvedValueOnce([
      {
        user_id: "1",
        username: null,
        role: "user",
        added_at: new Date(),
        added_by: null,
        note: null,
      },
    ]);
    const ok = await exportUsers([], "", "1");
    expect(ok.document?.filename).toBe("whitelist.csv");
  });
});
