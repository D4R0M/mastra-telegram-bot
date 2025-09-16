import { getPool } from './client.js';
import type { PoolClient } from 'pg';
import type { ID } from '../types/ids.js';

export interface WhitelistUser {
  user_id: ID;
  username: string | null;
  role: string;
  added_at: Date;
  added_by: ID | null;
  note: string | null;
}

export interface UpsertWhitelistUser {
  user_id: ID;
  username?: string | null;
  role?: string;
  added_by?: ID | null;
  note?: string | null;
}

export async function upsertWhitelistUser(
  data: UpsertWhitelistUser,
  client?: PoolClient,
): Promise<void> {
  const pool = client || getPool();
  await pool.query(
    `INSERT INTO user_whitelist (user_id, username, role, added_by, note)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id) DO UPDATE
     SET username = EXCLUDED.username,
         role = EXCLUDED.role,
         added_by = EXCLUDED.added_by,
         note = EXCLUDED.note`,
    [
      data.user_id,
      data.username || null,
      data.role || 'user',
      data.added_by || null,
      data.note || null,
    ],
  );
}

export async function removeWhitelistUser(
  user_id: ID,
  client?: PoolClient,
): Promise<void> {
  const pool = client || getPool();
  await pool.query(`DELETE FROM user_whitelist WHERE user_id = $1`, [user_id]);
}

export async function listWhitelist(
  limit = 100,
  offset = 0,
  client?: PoolClient,
): Promise<WhitelistUser[]> {
  const pool = client || getPool();
  const res = await pool.query(
    `SELECT * FROM user_whitelist ORDER BY added_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  return res.rows.map((row) => ({
    ...row,
    user_id: String(row.user_id),
    added_by: row.added_by ? String(row.added_by) : null,
  }));
}

export async function exportWhitelist(
  client?: PoolClient,
): Promise<WhitelistUser[]> {
  const pool = client || getPool();
  const res = await pool.query(`SELECT * FROM user_whitelist ORDER BY added_at DESC`);
  return res.rows.map((row) => ({
    ...row,
    user_id: String(row.user_id),
    added_by: row.added_by ? String(row.added_by) : null,
  }));
}

export async function fetchWhitelist(
  client?: PoolClient,
): Promise<WhitelistUser[]> {
  const pool = client || getPool();
  const res = await pool.query(`SELECT * FROM user_whitelist`);
  return res.rows.map((row) => ({
    ...row,
    user_id: String(row.user_id),
    added_by: row.added_by ? String(row.added_by) : null,
  }));
}
