import { createHash } from "crypto";
import { getPool } from "../db/client.js";

const ANSWER_MAX_LENGTH = 256;
let cachedSalt: string | null = null;
const optOutCache = new Map<string, boolean>();

function normalizeUserId(raw: string | number): string {
  return typeof raw === "number" ? raw.toString(10) : raw;
}

export function isMlLoggingEnabled(): boolean {
  const flag = process.env.ML_LOGGING_ENABLED;
  if (!flag) return true;
  const normalized = flag.trim().toLowerCase();
  return normalized !== "false" && normalized !== "0" && normalized !== "off";
}

export function getMlHashSalt(): string {
  if (cachedSalt) {
    return cachedSalt;
  }
  const salt = process.env.ML_HASH_SALT;
  if (!salt || !salt.trim()) {
    throw new Error("ML_HASH_SALT is required for ML logging");
  }
  cachedSalt = salt;
  return salt;
}

export function hashUserId(raw: string | number): string {
  const salt = getMlHashSalt();
  const normalized = normalizeUserId(raw);
  return createHash("sha256").update(`${salt}:${normalized}`).digest("hex");
}

export function redactAnswerText(answer?: string | null): string | null {
  if (!answer) {
    return null;
  }
  if (answer.length <= ANSWER_MAX_LENGTH) {
    return answer;
  }
  return answer.slice(0, ANSWER_MAX_LENGTH);
}

export async function isUserOptedOut(userId: string | number): Promise<boolean> {
  const normalized = normalizeUserId(userId);
  if (optOutCache.has(normalized)) {
    return optOutCache.get(normalized) ?? false;
  }

  const pool = getPool();
  const result = await pool.query<{ exists: boolean }>(
    `SELECT TRUE AS exists FROM ml_opt_outs WHERE user_id = $1 LIMIT 1`,
    [normalized],
  );
  const optedOut = result.rowCount > 0;
  optOutCache.set(normalized, optedOut);
  return optedOut;
}

export function invalidateOptOutCache(userId: string | number): void {
  const normalized = normalizeUserId(userId);
  optOutCache.delete(normalized);
}

export async function setUserOptOut(
  userId: string | number,
  source?: string,
): Promise<void> {
  const normalized = normalizeUserId(userId);
  const pool = getPool();
  await pool.query(
    `INSERT INTO ml_opt_outs (user_id, source)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE
       SET source = EXCLUDED.source,
           updated_at = now()
    `,
    [normalized, source || null],
  );
  invalidateOptOutCache(normalized);
}

export async function clearUserOptOut(userId: string | number): Promise<void> {
  const normalized = normalizeUserId(userId);
  const pool = getPool();
  await pool.query(`DELETE FROM ml_opt_outs WHERE user_id = $1`, [normalized]);
  invalidateOptOutCache(normalized);
}

export async function shouldLogMlEvents(userId?: string | number): Promise<boolean> {
  if (!isMlLoggingEnabled()) {
    return false;
  }
  if (userId === undefined || userId === null) {
    return true;
  }
  try {
    return !(await isUserOptedOut(userId));
  } catch (error) {
    // Fail closed: if opt-out lookup fails, do not log
    return false;
  }
}

export function getAppVersion(): string | undefined {
  return (
    process.env.APP_VERSION ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.RAILWAY_GIT_COMMIT_SHA ||
    process.env.COMMIT_SHA ||
    undefined
  );
}

export { ANSWER_MAX_LENGTH };
