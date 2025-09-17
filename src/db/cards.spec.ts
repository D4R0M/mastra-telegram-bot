import { beforeEach, describe, expect, it } from "vitest";
import { createCard, findSimilarCards } from "./cards.js";
import { DuplicateCardError } from "../errors/DuplicateCardError.js";

interface StoredCard {
  id: string;
  owner_id: number;
  front: string;
  back: string;
  tags: string[];
  example: string | null;
  lang_front: string;
  lang_back: string;
  active: boolean;
  created_at: Date;
  updated_at: Date;
  content_hash: string;
}

class FakeClient {
  private cards: StoredCard[] = [];
  private nextId = 1;

  async query(sql: string, params: any[]) {
    const normalized = sql.replace(/\s+/g, " ").trim();

    if (normalized.startsWith("SELECT * FROM cards WHERE owner_id = $1 AND content_hash = $2")) {
      const [ownerId, hash] = params as [number, string];
      const found = this.cards.find((card) => card.owner_id === ownerId && card.content_hash === hash);
      return { rows: found ? [this.clone(found)] : [] };
    }

    if (normalized.startsWith("INSERT INTO cards")) {
      const [ownerId, front, back, tags, example, langFront, langBack, contentHash] = params;
      if (this.cards.some((card) => card.owner_id === ownerId && card.content_hash === contentHash)) {
        const error: any = new Error("duplicate key value violates unique constraint");
        error.code = "23505";
        throw error;
      }

      const timestamp = new Date();
      const stored: StoredCard = {
        id: `card-${this.nextId++}`,
        owner_id: Number(ownerId),
        front,
        back,
        tags: Array.isArray(tags) ? [...tags] : [],
        example: example ?? null,
        lang_front: langFront,
        lang_back: langBack,
        active: true,
        created_at: timestamp,
        updated_at: timestamp,
        content_hash: contentHash,
      };

      this.cards.push(stored);
      return { rows: [this.clone(stored)] };
    }

    if (normalized.startsWith("SELECT *, similarity(lower(front), $2) AS similarity FROM cards")) {
      const [ownerId, probe, threshold, limit] = params as [number, string, number, number];
      const matches = this.cards
        .filter((card) => card.owner_id === ownerId && card.active)
        .map((card) => ({
          card,
          similarity: computeTrigramSimilarity(card.front.toLowerCase(), String(probe)),
        }))
        .filter(({ similarity }) => similarity >= Number(threshold))
        .sort((a, b) => {
          if (b.similarity !== a.similarity) {
            return b.similarity - a.similarity;
          }
          return b.card.created_at.getTime() - a.card.created_at.getTime();
        })
        .slice(0, Number(limit))
        .map(({ card, similarity }) => ({ ...this.clone(card), similarity }));

      return { rows: matches };
    }

    throw new Error(`Unhandled query in FakeClient: ${normalized}`);
  }

  private clone(card: StoredCard): StoredCard {
    return {
      ...card,
      tags: [...card.tags],
      created_at: new Date(card.created_at.getTime()),
      updated_at: new Date(card.updated_at.getTime()),
    };
  }
}

function computeTrigramSimilarity(a: string, b: string): number {
  const trisA = collectTrigrams(a);
  const trisB = collectTrigrams(b.toLowerCase());

  const totalA = trisA.total;
  const totalB = trisB.total;
  if (totalA === 0 || totalB === 0) {
    return 0;
  }

  let matches = 0;
  for (const [tri, countA] of trisA.counts.entries()) {
    const countB = trisB.counts.get(tri) ?? 0;
    matches += Math.min(countA, countB);
  }

  return (2 * matches) / (totalA + totalB);
}

function collectTrigrams(text: string) {
  const sanitized = `  ${text}  `;
  const counts = new Map<string, number>();
  let total = 0;

  for (let i = 0; i < sanitized.length - 2; i += 1) {
    const tri = sanitized.slice(i, i + 3);
    counts.set(tri, (counts.get(tri) ?? 0) + 1);
    total += 1;
  }

  return { counts, total };
}

describe("cards data access", () => {
  let client: FakeClient;

  beforeEach(() => {
    client = new FakeClient();
  });

  it("prevents duplicate cards for the same owner", async () => {
    const payload = { owner_id: 1, front: "Hund", back: "Dog", tags: ["animals"] };

    await createCard(payload, client as any);

    await expect(createCard(payload, client as any)).rejects.toBeInstanceOf(DuplicateCardError);

    try {
      await createCard(payload, client as any);
    } catch (error) {
      expect(error).toBeInstanceOf(DuplicateCardError);
      const duplicate = error as DuplicateCardError;
      expect(duplicate.existingCard?.front).toBe("Hund");
    }
  });

  it("allows identical cards for different owners", async () => {
    const first = await createCard({ owner_id: 1, front: "Hund", back: "Dog" }, client as any);
    const second = await createCard({ owner_id: 2, front: "Hund", back: "Dog" }, client as any);

    expect(first.owner_id).toBe(1);
    expect(second.owner_id).toBe(2);
    expect(first.id).not.toBe(second.id);
  });

  it("returns similar cards ordered by similarity", async () => {
    await createCard({ owner_id: 1, front: "Hund", back: "Dog" }, client as any);
    await createCard({ owner_id: 1, front: "Hunden springer", back: "The dog runs" }, client as any);
    await createCard({ owner_id: 1, front: "Katt", back: "Cat" }, client as any);

    const results = await findSimilarCards(1, "hund", { threshold: 0.3, limit: 5 }, client as any);

    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results[0].front.toLowerCase()).toContain("hund");
    expect(results.some((card) => card.front === "Katt")).toBe(false);
  });
});
