import { beforeEach, vi } from "vitest";

if (!process.env.TELEGRAM_BOT_TOKEN) {
  process.env.TELEGRAM_BOT_TOKEN = "123456:ABCDEF";
}

const poolMocks = vi.hoisted(() => {
  const queryMock = vi.fn(async () => ({ rows: [] }));
  const connectMock = vi.fn(async () => ({ query: queryMock, release: vi.fn() }));
  const pool = {
    query: queryMock,
    connect: connectMock,
    on: vi.fn(),
  };
  return { pool, queryMock, connectMock };
});

vi.mock("../src/db/client.ts", () => ({
  getPool: () => poolMocks.pool,
  withTransaction: async (fn: any) => fn({ query: poolMocks.queryMock, release: vi.fn() }),
  closePool: vi.fn(),
}));

const whitelistStore = vi.hoisted(() => ({
  entries: new Map<string, any>(),
}));

vi.mock("../src/db/userWhitelist.js", () => ({
  upsertWhitelistUser: vi.fn(async (data) => {
    whitelistStore.entries.set(String(data.user_id), {
      user_id: data.user_id,
      username: data.username ?? null,
      role: data.role ?? "user",
      added_at: new Date(),
      added_by: data.added_by ?? null,
      note: data.note ?? null,
    });
  }),
  removeWhitelistUser: vi.fn(async (userId: string) => {
    whitelistStore.entries.delete(String(userId));
  }),
  listWhitelist: vi.fn(async () => Array.from(whitelistStore.entries.values())),
  exportWhitelist: vi.fn(async () => Array.from(whitelistStore.entries.values())),
  fetchWhitelist: vi.fn(async () => Array.from(whitelistStore.entries.values())),
}));

beforeEach(() => {
  poolMocks.queryMock.mockClear();
  poolMocks.connectMock.mockClear();
});
