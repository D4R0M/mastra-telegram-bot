import { getPool } from "./client.js";
import type { Pool, PoolClient } from "pg";
import { DuplicateCardError } from "../errors/DuplicateCardError.js";
import type { DuplicateCardDetails } from "../errors/DuplicateCardError.js";
import { makeCardContentHash, normalizeForHash } from "../lib/text/normalize.js";

export interface Card {
  id: string;
  owner_id: number;
  front: string;
  back: string;
  tags: string[];
  example?: string;
  lang_front: string;
  lang_back: string;
  active: boolean;
  created_at: Date;
  updated_at: Date;
  content_hash: string;
}

export interface CreateCardData {
  owner_id: number;
  front: string;
  back: string;
  tags?: string[];
  example?: string;
  lang_front?: string;
  lang_back?: string;
}

export interface UpdateCardData {
  front?: string;
  back?: string;
  tags?: string[];
  example?: string;
  lang_front?: string;
  lang_back?: string;
  active?: boolean;
}

type QueryableClient = PoolClient | Pool;

function resolveClient(client?: PoolClient): QueryableClient {
  return client ?? getPool();
}

function mapCard(row: any): Card {
  return {
    id: row.id,
    owner_id: Number(row.owner_id),
    front: row.front,
    back: row.back,
    tags: Array.isArray(row.tags) ? row.tags : row.tags ? [row.tags] : [],
    example: row.example ?? undefined,
    lang_front: row.lang_front,
    lang_back: row.lang_back,
    active: Boolean(row.active),
    created_at: row.created_at,
    updated_at: row.updated_at,
    content_hash: row.content_hash,
  };
}

function toDuplicateDetails(card: Card | null): DuplicateCardDetails | undefined {
  if (!card) {
    return undefined;
  }

  return {
    id: card.id,
    front: card.front,
    back: card.back,
    tags: card.tags,
    example: card.example,
  };
}

export async function findCardByHash(
  owner_id: number,
  contentHash: string,
  client?: PoolClient,
): Promise<Card | null> {
  const pool = resolveClient(client);
  const result = await pool.query(
    `
      SELECT *
      FROM cards
      WHERE owner_id = $1 AND content_hash = $2
      LIMIT 1
    `,
    [owner_id, contentHash],
  );

  return result.rows[0] ? mapCard(result.rows[0]) : null;
}

export interface FindSimilarCardsOptions {
  limit?: number;
  threshold?: number;
  includeInactive?: boolean;
}

export interface SimilarCard extends Card {
  similarity: number;
}

export async function findSimilarCards(
  owner_id: number,
  probe: string,
  options: FindSimilarCardsOptions = {},
  client?: PoolClient,
): Promise<SimilarCard[]> {
  const searchTerm = normalizeForHash(probe);
  if (!searchTerm) {
    return [];
  }

  const limit = options.limit ?? 5;
  const threshold = options.threshold ?? 0.45;
  const includeInactive = options.includeInactive ?? false;
  const pool = resolveClient(client);
  const activeClause = includeInactive ? "" : "AND active = true";

  const result = await pool.query(
    `
      SELECT *, similarity(lower(front), $2) AS similarity
      FROM cards
      WHERE owner_id = $1
        ${activeClause}
        AND similarity(lower(front), $2) >= $3
      ORDER BY similarity DESC, created_at DESC
      LIMIT $4
    `,
    [owner_id, searchTerm, threshold, limit],
  );

  return result.rows.map((row) => {
    const card = mapCard(row);
    return {
      ...card,
      similarity: Number(row.similarity ?? 0),
    };
  });
}

function sanitizeTags(tags?: string[]): string[] {
  if (!tags) {
    return [];
  }

  return tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0);
}

function buildDuplicateError(ownerId: number, hash: string, existing: Card | null): DuplicateCardError {
  return new DuplicateCardError(String(ownerId), hash, toDuplicateDetails(existing));
}

export async function createCard(data: CreateCardData, client?: PoolClient): Promise<Card> {
  const pool = resolveClient(client);
  const tags = sanitizeTags(data.tags);
  const contentHash = makeCardContentHash({ front: data.front, back: data.back, tags });

  const preexisting = await findCardByHash(data.owner_id, contentHash, client);
  if (preexisting) {
    throw buildDuplicateError(data.owner_id, contentHash, preexisting);
  }

  const langFront = data.lang_front ?? "sv";
  const langBack = data.lang_back ?? "en";
  const example = data.example ?? null;

  try {
    const result = await pool.query(
      `
        INSERT INTO cards (owner_id, front, back, tags, example, lang_front, lang_back, content_hash)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `,
      [
        data.owner_id,
        data.front,
        data.back,
        tags,
        example,
        langFront,
        langBack,
        contentHash,
      ],
    );

    return mapCard(result.rows[0]);
  } catch (error: any) {
    if (error?.code === "23505") {
      const existing = await findCardByHash(data.owner_id, contentHash, client);
      throw buildDuplicateError(data.owner_id, contentHash, existing);
    }

    throw error;
  }
}

export async function getCardById(
  id: string,
  owner_id: number,
  client?: PoolClient,
): Promise<Card | null> {
  const pool = resolveClient(client);

  const result = await pool.query(
    `
      SELECT * FROM cards
      WHERE id = $1 AND owner_id = $2 AND active = true
    `,
    [id, owner_id],
  );

  return result.rows[0] ? mapCard(result.rows[0]) : null;
}

export async function getCardsByOwner(
  owner_id: number,
  options: {
    limit?: number;
    offset?: number;
    tags?: string[];
    active?: boolean;
  } = {},
  client?: PoolClient,
): Promise<Card[]> {
  const pool = resolveClient(client);

  let query = `
    SELECT * FROM cards
    WHERE owner_id = $1
  `;
  const params: any[] = [owner_id];
  let paramIndex = 2;

  if (options.active !== undefined) {
    query += ` AND active = $${paramIndex}`;
    params.push(options.active);
    paramIndex++;
  }

  if (options.tags && options.tags.length > 0) {
    query += ` AND tags && $${paramIndex}::text[]`;
    params.push(options.tags);
    paramIndex++;
  }

  query += ` ORDER BY created_at DESC`;

  if (options.limit) {
    query += ` LIMIT $${paramIndex}`;
    params.push(options.limit);
    paramIndex++;
  }

  if (options.offset) {
    query += ` OFFSET $${paramIndex}`;
    params.push(options.offset);
  }

  const result = await pool.query(query, params);
  return result.rows.map(mapCard);
}

export async function updateCard(
  id: string,
  owner_id: number,
  data: UpdateCardData,
  client?: PoolClient,
): Promise<Card | null> {
  const pool = resolveClient(client);

  const setClause: string[] = [];
  const params: unknown[] = [id, owner_id];
  let paramIndex = 3;

  if (data.front !== undefined) {
    setClause.push(`front = $${paramIndex}`);
    params.push(data.front);
    paramIndex++;
  }

  if (data.back !== undefined) {
    setClause.push(`back = $${paramIndex}`);
    params.push(data.back);
    paramIndex++;
  }

  if (data.tags !== undefined) {
    const tags = sanitizeTags(data.tags);
    setClause.push(`tags = $${paramIndex}::text[]`);
    params.push(tags);
    paramIndex++;
  }

  if (data.example !== undefined) {
    setClause.push(`example = $${paramIndex}`);
    params.push(data.example);
    paramIndex++;
  }

  if (data.lang_front !== undefined) {
    setClause.push(`lang_front = $${paramIndex}`);
    params.push(data.lang_front);
    paramIndex++;
  }

  if (data.lang_back !== undefined) {
    setClause.push(`lang_back = $${paramIndex}`);
    params.push(data.lang_back);
    paramIndex++;
  }

  if (data.active !== undefined) {
    setClause.push(`active = $${paramIndex}`);
    params.push(data.active);
    paramIndex++;
  }

  if (setClause.length === 0) {
    return null;
  }

  const query = `
    UPDATE cards
    SET ${setClause.join(", ")}
    WHERE id = $1 AND owner_id = $2 AND active = true
    RETURNING *
  `;

  const result = await pool.query(query, params);
  return result.rows[0] ? mapCard(result.rows[0]) : null;
}

export async function deleteCard(
  id: string,
  owner_id: number,
  client?: PoolClient,
): Promise<boolean> {
  const pool = resolveClient(client);

  const result = await pool.query(
    `
      UPDATE cards
      SET active = false
      WHERE id = $1 AND owner_id = $2
    `,
    [id, owner_id],
  );

  return (result.rowCount || 0) > 0;
}

export async function countCards(
  owner_id: number,
  options: { active?: boolean; tags?: string[] } = {},
  client?: PoolClient,
): Promise<number> {
  const pool = resolveClient(client);

  let query = `SELECT COUNT(*) FROM cards WHERE owner_id = $1`;
  const params: any[] = [owner_id];
  let paramIndex = 2;

  if (options.active !== undefined) {
    query += ` AND active = $${paramIndex}`;
    params.push(options.active);
    paramIndex++;
  }

  if (options.tags && options.tags.length > 0) {
    query += ` AND tags && $${paramIndex}::text[]`;
    params.push(options.tags);
  }

  const result = await pool.query(query, params);
  return Number(result.rows[0].count);
}
