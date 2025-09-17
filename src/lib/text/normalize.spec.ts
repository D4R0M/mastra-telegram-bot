import { describe, expect, it } from "vitest";
import { normalizeForHash } from "./normalize.js";

describe("normalizeForHash", () => {
  it("lowercases, trims, and collapses whitespace", () => {
    expect(normalizeForHash("  Hello   WORLD  ")).toBe("hello world");
  });

  it("returns an empty string for nullish values", () => {
    expect(normalizeForHash(undefined)).toBe("");
    expect(normalizeForHash(null)).toBe("");
    expect(normalizeForHash("")).toBe("");
  });

  it("preserves diacritics while normalizing", () => {
    expect(normalizeForHash("�RV�ZTURO   T�K�RF�R�G�P")).toBe("�rv�zturo t�k�rf�r�g�p");
  });
});
