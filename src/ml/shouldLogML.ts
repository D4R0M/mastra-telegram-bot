import { getMlHashSalt } from "../lib/mlPrivacy.js";

export function isMlHashSaltConfigured(): boolean {
  const salt = process.env.ML_HASH_SALT;
  return Boolean(salt && salt.trim());
}

export function shouldLogML(): boolean {
  if (process.env.ML_LOGGING_ENABLED === "false") {
    return false;
  }

  if (!isMlHashSaltConfigured()) {
    return false;
  }

  try {
    getMlHashSalt();
    return true;
  } catch (error) {
    return false;
  }
}
