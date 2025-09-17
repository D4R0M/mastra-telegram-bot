import { beforeEach, describe, expect, it, vi } from "vitest";

describe("shouldLogML", () => {
  beforeEach(() => {
    delete process.env.ML_HASH_SALT;
    delete process.env.ML_LOGGING_ENABLED;
    vi.resetModules();
  });

  it("returns false when the hash salt is missing", async () => {
    const { shouldLogML, isMlHashSaltConfigured } = await import(
      "../src/ml/shouldLogML.ts"
    );
    expect(isMlHashSaltConfigured()).toBe(false);
    expect(shouldLogML()).toBe(false);
  });

  it("respects the ML_LOGGING_ENABLED flag", async () => {
    process.env.ML_HASH_SALT = "salt";
    process.env.ML_LOGGING_ENABLED = "false";

    const { shouldLogML } = await import("../src/ml/shouldLogML.ts");
    expect(shouldLogML()).toBe(false);
  });

  it("returns true when the environment is fully configured", async () => {
    process.env.ML_HASH_SALT = "salt";

    const { shouldLogML, isMlHashSaltConfigured } = await import(
      "../src/ml/shouldLogML.ts"
    );
    expect(isMlHashSaltConfigured()).toBe(true);
    expect(shouldLogML()).toBe(true);
  });
});
