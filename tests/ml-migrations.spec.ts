import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readMigration(filename: string): string {
  return readFileSync(path.resolve("src/db/migrations", filename), "utf8");
}

describe("review_events migrations", () => {
  const tableMigration = readMigration("009_create_review_events_v2.sql");
  const viewMigration = readMigration("010_add_review_events_7d_view.sql");

  it("creates review_events table with required columns", () => {
    expect(tableMigration).toMatch(/CREATE TABLE IF NOT EXISTS review_events/i);
    [
      "mode",
      "action",
      "session_id",
      "user_hash",
      "card_id",
      "sm2_before",
      "sm2_after",
      "client",
      "app_version",
      "source",
    ].forEach((column) => {
      expect(tableMigration).toMatch(new RegExp(`\\b${column}\\b`, "i"));
    });
    expect(tableMigration).toMatch(/CREATE INDEX IF NOT EXISTS idx_review_events_user_ts/i);
    expect(tableMigration).toMatch(/CREATE TABLE IF NOT EXISTS ml_opt_outs/i);
  });

  it("defines review_events_last_7d view", () => {
    expect(viewMigration).toMatch(/CREATE OR REPLACE VIEW review_events_last_7d/i);
    expect(viewMigration).toMatch(/COUNT\(DISTINCT user_hash\)/i);
    expect(viewMigration).toMatch(/AVG\(CASE WHEN action = ''graded''/i);
  });
});
