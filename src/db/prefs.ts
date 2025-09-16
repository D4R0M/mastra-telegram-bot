import { getPool } from './client.js';
import type { PoolClient } from 'pg';
import type { ID } from '../types/ids.js';

export interface UserPrefs {
  user_id: ID;
  chat_id: string;
  timezone: string;
  dnd_start?: string; // HH:MM format
  dnd_end?: string; // HH:MM format
  daily_new_limit: number;
  daily_review_limit: number;
  session_size: number;
  reminders_enabled: boolean;
  reminder_times: string[]; // Array of HH:MM time strings
  algorithm: string;
  locale: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreatePrefsData {
  user_id: ID;
  chat_id: string;
  timezone?: string;
  dnd_start?: string;
  dnd_end?: string;
  daily_new_limit?: number;
  daily_review_limit?: number;
  session_size?: number;
  reminders_enabled?: boolean;
  reminder_times?: string[];
  algorithm?: string;
  locale?: string;
}

export interface UpdatePrefsData {
  timezone?: string;
  dnd_start?: string;
  dnd_end?: string;
  daily_new_limit?: number;
  daily_review_limit?: number;
  session_size?: number;
  reminders_enabled?: boolean;
  reminder_times?: string[];
  algorithm?: string;
  locale?: string;
}

export async function createUserPrefs(data: CreatePrefsData, client?: PoolClient): Promise<UserPrefs> {
  const pool = client || getPool();
  
  const result = await pool.query(`
    INSERT INTO prefs (
      user_id, chat_id, timezone, dnd_start, dnd_end, daily_new_limit,
      daily_review_limit, session_size, reminders_enabled, reminder_times,
      algorithm, locale
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    ON CONFLICT (user_id) DO UPDATE SET
      chat_id = EXCLUDED.chat_id,
      timezone = EXCLUDED.timezone,
      dnd_start = EXCLUDED.dnd_start,
      dnd_end = EXCLUDED.dnd_end,
      daily_new_limit = EXCLUDED.daily_new_limit,
      daily_review_limit = EXCLUDED.daily_review_limit,
      session_size = EXCLUDED.session_size,
      reminders_enabled = EXCLUDED.reminders_enabled,
      reminder_times = EXCLUDED.reminder_times,
      algorithm = EXCLUDED.algorithm,
      locale = EXCLUDED.locale
    RETURNING *
  `, [
    data.user_id,
    data.chat_id,
    data.timezone || 'Europe/Stockholm',
    data.dnd_start || '21:00',
    data.dnd_end || '08:00',
    data.daily_new_limit || 20,
    data.daily_review_limit || 200,
    data.session_size || 10,
    data.reminders_enabled !== undefined ? data.reminders_enabled : true,
    data.reminder_times || [],
    data.algorithm || 'sm2',
    data.locale || 'en'
  ]);
  
  const row = result.rows[0];
  return { ...row, user_id: String(row.user_id) };
}

export async function getUserPrefs(user_id: ID, client?: PoolClient): Promise<UserPrefs | null> {
  const pool = client || getPool();
  
  const result = await pool.query(`
    SELECT * FROM prefs WHERE user_id = $1
  `, [user_id]);

  const row = result.rows[0];
  return row ? { ...row, user_id: String(row.user_id) } : null;
}

export async function getUserPrefsByChatId(chat_id: string, client?: PoolClient): Promise<UserPrefs | null> {
  const pool = client || getPool();
  
  const result = await pool.query(`
    SELECT * FROM prefs WHERE chat_id = $1
  `, [chat_id]);

  const row = result.rows[0];
  return row ? { ...row, user_id: String(row.user_id) } : null;
}

export async function updateUserPrefs(user_id: ID, data: UpdatePrefsData, client?: PoolClient): Promise<UserPrefs | null> {
  const pool = client || getPool();
  
  const setClause = [];
  const params: unknown[] = [user_id];
  let paramIndex = 2;
  
  if (data.timezone !== undefined) {
    setClause.push(`timezone = $${paramIndex}`);
    params.push(data.timezone);
    paramIndex++;
  }
  
  if (data.dnd_start !== undefined) {
    setClause.push(`dnd_start = $${paramIndex}`);
    params.push(data.dnd_start);
    paramIndex++;
  }
  
  if (data.dnd_end !== undefined) {
    setClause.push(`dnd_end = $${paramIndex}`);
    params.push(data.dnd_end);
    paramIndex++;
  }
  
  if (data.daily_new_limit !== undefined) {
    setClause.push(`daily_new_limit = $${paramIndex}`);
    params.push(data.daily_new_limit);
    paramIndex++;
  }
  
  if (data.daily_review_limit !== undefined) {
    setClause.push(`daily_review_limit = $${paramIndex}`);
    params.push(data.daily_review_limit);
    paramIndex++;
  }
  
  if (data.session_size !== undefined) {
    setClause.push(`session_size = $${paramIndex}`);
    params.push(data.session_size);
    paramIndex++;
  }
  
  if (data.reminders_enabled !== undefined) {
    setClause.push(`reminders_enabled = $${paramIndex}`);
    params.push(data.reminders_enabled);
    paramIndex++;
  }
  
  if (data.reminder_times !== undefined) {
    setClause.push(`reminder_times = $${paramIndex}::text[]`);
    params.push(data.reminder_times);
    paramIndex++;
  }
  
  if (data.algorithm !== undefined) {
    setClause.push(`algorithm = $${paramIndex}`);
    params.push(data.algorithm);
    paramIndex++;
  }
  
  if (data.locale !== undefined) {
    setClause.push(`locale = $${paramIndex}`);
    params.push(data.locale);
    paramIndex++;
  }
  
  if (setClause.length === 0) {
    return null;
  }
  
  const query = `
    UPDATE prefs 
    SET ${setClause.join(', ')}
    WHERE user_id = $1
    RETURNING *
  `;
  
  const result = await pool.query(query, params);
  const row = result.rows[0];
  return row ? { ...row, user_id: String(row.user_id) } : null;
}

export async function deleteUserPrefs(user_id: ID, client?: PoolClient): Promise<boolean> {
  const pool = client || getPool();
  
  const result = await pool.query(`
    DELETE FROM prefs WHERE user_id = $1
  `, [user_id]);
  
  return (result.rowCount || 0) > 0;
}