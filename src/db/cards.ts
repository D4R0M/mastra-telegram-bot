import { getPool } from './client.js';
import type { PoolClient } from 'pg';

export interface Card {
  id: string;
  owner_id: string;
  front: string;
  back: string;
  tags: string[];
  example?: string;
  lang_front: string;
  lang_back: string;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CreateCardData {
  owner_id: string;
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

export async function createCard(data: CreateCardData, client?: PoolClient): Promise<Card> {
  const pool = client || getPool();
  
  const result = await pool.query(`
    INSERT INTO cards (owner_id, front, back, tags, example, lang_front, lang_back)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `, [
    data.owner_id,
    data.front,
    data.back,
    data.tags || [],
    data.example,
    data.lang_front || 'sv',
    data.lang_back || 'en'
  ]);
  
  return result.rows[0];
}

export async function getCardById(id: string, owner_id: string, client?: PoolClient): Promise<Card | null> {
  const pool = client || getPool();
  
  const result = await pool.query(`
    SELECT * FROM cards
    WHERE id = $1 AND owner_id = $2 AND active = true
  `, [id, owner_id]);
  
  return result.rows[0] || null;
}

export async function getCardsByOwner(
  owner_id: string, 
  options: {
    limit?: number;
    offset?: number;
    tags?: string[];
    active?: boolean;
  } = {},
  client?: PoolClient
): Promise<Card[]> {
  const pool = client || getPool();
  
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
  return result.rows;
}

export async function updateCard(id: string, owner_id: string, data: UpdateCardData, client?: PoolClient): Promise<Card | null> {
  const pool = client || getPool();
  
  const setClause = [];
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
    setClause.push(`tags = $${paramIndex}::text[]`);
    params.push(data.tags);
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
    SET ${setClause.join(', ')}
    WHERE id = $1 AND owner_id = $2 AND active = true
    RETURNING *
  `;
  
  const result = await pool.query(query, params);
  return result.rows[0] || null;
}

export async function deleteCard(id: string, owner_id: string, client?: PoolClient): Promise<boolean> {
  const pool = client || getPool();
  
  const result = await pool.query(`
    UPDATE cards 
    SET active = false
    WHERE id = $1 AND owner_id = $2
  `, [id, owner_id]);
  
  return (result.rowCount || 0) > 0;
}

export async function countCards(owner_id: string, options: { active?: boolean; tags?: string[] } = {}, client?: PoolClient): Promise<number> {
  const pool = client || getPool();
  
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
  return parseInt(result.rows[0].count);
}