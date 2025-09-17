import crypto from "node:crypto";

export function normalizeForHash(value?: string | null): string {
  if (!value) {
    return "";
  }

  return value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTagsForHash(tags?: string | string[] | null): string {
  if (!tags) {
    return "";
  }

  if (Array.isArray(tags)) {
    const normalized = tags
      .map(normalizeForHash)
      .filter((entry) => entry.length > 0)
      .sort();

    return normalized.join(",");
  }

  return normalizeForHash(tags);
}

export interface CardHashInput {
  front?: string | null;
  back?: string | null;
  tags?: string | string[] | null;
}

export function makeCardContentHash(input: CardHashInput): string {
  const front = normalizeForHash(input.front);
  const back = normalizeForHash(input.back);
  const tags = normalizeTagsForHash(input.tags);
  const joined = `${front}||${back}||${tags}`;

  return crypto.createHash("sha256").update(joined, "utf8").digest("hex");
}
