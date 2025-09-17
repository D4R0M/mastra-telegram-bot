import { createHash } from "crypto";

const ANSWER_MAX_LENGTH = 256;
let cachedSalt: string | null = null;

function normalizeUserId(raw: string | number): string {
  return typeof raw === "number" ? raw.toString(10) : raw;
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
