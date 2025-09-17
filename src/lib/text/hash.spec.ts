import { describe, expect, it } from "vitest";
import { makeCardContentHash } from "./normalize.js";

describe("makeCardContentHash", () => {
  it("produces identical hashes for equivalent card content", () => {
    const base = makeCardContentHash({
      front: "  Hund  ",
      back: "DOG",
      tags: ["Animals"],
    });

    const variant = makeCardContentHash({
      front: "hund",
      back: " dog ",
      tags: [" animals "],
    });

    expect(variant).toBe(base);
  });

  it("changes when tags differ", () => {
    const animals = makeCardContentHash({ front: "hund", back: "dog", tags: ["animals"] });
    const pets = makeCardContentHash({ front: "hund", back: "dog", tags: ["pets"] });

    expect(pets).not.toBe(animals);
  });

  it("ignores tag ordering", () => {
    const first = makeCardContentHash({ front: "konjugera", back: "to conjugate", tags: ["grammar", "verbs"] });
    const second = makeCardContentHash({ front: "Konjugera", back: "TO CONJUGATE", tags: ["verbs", "grammar"] });

    expect(second).toBe(first);
  });
});
