import { vi } from "vitest";

export const capturedEvents: any[] = [];

vi.mock("../../src/db/reviewEvents.ts", () => ({
  insertReviewEvent: vi.fn(async (event) => {
    capturedEvents.push(event);
  }),
  fetch24hTotals: vi.fn(),
  fetchOptOutCount: vi.fn(),
  fetchLatestEvent: vi.fn(),
}));

vi.mock("../../src/lib/mlPrivacy.ts", () => ({
  isMlLoggingEnabled: () => true,
  shouldLogMlEvents: async () => true,
  hashUserId: (raw: string | number) => `hash-${raw}`,
  redactAnswerText: (text?: string | null) => {
    if (text == null) return null;
    return text.length > 256 ? text.slice(0, 256) : text;
  },
  getAppVersion: () => "test-sha",
}));

vi.mock("../../src/db/reviews.ts", () => ({
  getReviewState: vi.fn(async () => ({
    card_id: "card-1",
    user_id: 42,
    interval_days: 1,
    repetitions: 2,
    ease_factor: 2.5,
    due_date: "2024-01-01",
    last_reviewed_at: new Date("2023-12-31T00:00:00Z"),
    last_grade: 4,
    lapses: 0,
    queue: "review",
  })),
  updateReviewState: vi.fn(),
  createReviewLog: vi.fn(),
  logReview: vi.fn(),
  getReviewStates: vi.fn(),
  getDueCards: vi.fn(),
  createReviewState: vi.fn(),
}));

vi.mock("../../src/db/cards.ts", () => ({
  getCardById: vi.fn(async () => ({
    id: "card-1",
    front: "front",
    back: "back",
    tags: [],
    example: "example",
    lang_front: "en",
    lang_back: "de",
    queue: "review",
    repetitions: 2,
    ease_factor: 2.5,
    lapses: 0,
  })),
}));

vi.mock("../../src/lib/sm2.ts", () => ({
  applySM2: vi.fn(() => ({
    intervalDays: 3,
    easeFactor: 2.6,
    repetitions: 3,
    lapses: 0,
  })),
}));

vi.mock("../../src/db/client.ts", () => ({
  withTransaction: async (fn: any) => fn({}),
  getPool: () => ({ query: vi.fn() }),
}));

export const testLogger = {
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
};

export function resetCapturedEvents() {
  capturedEvents.length = 0;
  testLogger.warn.mockClear();
  testLogger.error.mockClear();
  testLogger.info.mockClear();
}
