import { getPool } from './client.js';
import type { PoolClient } from 'pg';
import type { ID } from '../types/ids.js';

export interface UpsertUser {
  user_id: ID;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  lang_code?: string | null;
  role?: string | null;
}

export async function upsertUser(data: UpsertUser, client?: PoolClient): Promise<void> {
  const pool = client || getPool();
  await pool.query(
    `INSERT INTO users (user_id, username, first_name, last_name, lang_code, role)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id) DO UPDATE
       SET username = EXCLUDED.username,
           first_name = EXCLUDED.first_name,
           last_name = EXCLUDED.last_name,
           lang_code = EXCLUDED.lang_code,
           role = EXCLUDED.role`,
    [
      data.user_id,
      data.username || null,
      data.first_name || null,
      data.last_name || null,
      data.lang_code || null,
      data.role || 'user',
    ],
  );
}
