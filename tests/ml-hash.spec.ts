import { describe, expect, it, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
  process.env.ML_HASH_SALT = "salt-one";
});

describe("mlPrivacy hashing", () => {
  it("produces deterministic hashes for same salt", async () => {
    const { hashUserId } = await import("../src/lib/mlPrivacy.js");
    const first = hashUserId(123);
    const second = hashUserId("123");
    expect(first).toBe(second);
  });

  it("changes hash when salt differs", async () => {
    const moduleOne = await import("../src/lib/mlPrivacy.js");
    const first = moduleOne.hashUserId(456);
    vi.resetModules();
    process.env.ML_HASH_SALT = "salt-two";
    const moduleTwo = await import("../src/lib/mlPrivacy.js");
    const second = moduleTwo.hashUserId(456);
    expect(first).not.toBe(second);
  });

  it("redacts long answer text", async () => {
    const { redactAnswerText } = await import("../src/lib/mlPrivacy.js");
    const long = "a".repeat(400);
    const result = redactAnswerText(long);
    expect(result?.length).toBe(256);
  });
});
