import crypto from "crypto";

export interface TelegramWebAppUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
}

export interface TelegramWebAppInitData {
  user?: TelegramWebAppUser;
  chat_type?: string;
  chat_instance?: string;
  query_id?: string;
  auth_date: number;
  hash: string;
  start_param?: string;
  receiver?: { id: number; type?: string; username?: string };
  [key: string]: unknown;
}

export interface VerifiedInitData {
  raw: string;
  data: TelegramWebAppInitData;
}

const AUTH_WINDOW_SECONDS = 60 * 60 * 24; // 24 hours per Telegram guidance

function parseInitData(initData: string): TelegramWebAppInitData {
  const params = new URLSearchParams(initData);
  const data: TelegramWebAppInitData = {
    auth_date: 0,
    hash: "",
  };

  for (const [key, value] of params.entries()) {
    if (key === "user" || key === "receiver") {
      try {
        (data as Record<string, unknown>)[key] = JSON.parse(value);
      } catch {
        (data as Record<string, unknown>)[key] = undefined;
      }
    } else if (key === "auth_date") {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed)) {
        data.auth_date = parsed;
      }
    } else if (key === "hash") {
      data.hash = value;
    } else {
      (data as Record<string, unknown>)[key] = value;
    }
  }

  return data;
}

function computeVerificationHash(
  initData: string,
  botToken: string,
): string {
  const params = new URLSearchParams(initData);
  const entries: string[] = [];

  for (const [key, value] of params.entries()) {
    if (key === "hash") continue;
    entries.push(`${key}=${value}`);
  }
  entries.sort();

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();

  return crypto
    .createHmac("sha256", secretKey)
    .update(entries.join("\n"))
    .digest("hex");
}

export function verifyInitData(rawInitData?: string | null): VerifiedInitData {
  if (!rawInitData) {
    throw new Error("Missing init data");
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    throw new Error("Bot token not configured");
  }

  const parsed = parseInitData(rawInitData);
  if (!parsed.hash) {
    throw new Error("Missing init data hash");
  }

  const expectedHash = computeVerificationHash(rawInitData, botToken);
  const providedHash = Buffer.from(parsed.hash, "hex");
  const computedHash = Buffer.from(expectedHash, "hex");
  if (providedHash.length !== computedHash.length) {
    throw new Error("Invalid init data hash");
  }
  if (!crypto.timingSafeEqual(providedHash, computedHash)) {
    throw new Error("Invalid init data hash");
  }

  if (!Number.isFinite(parsed.auth_date)) {
    throw new Error("Invalid auth date");
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (nowSeconds - parsed.auth_date > AUTH_WINDOW_SECONDS) {
    throw new Error("Init data expired");
  }

  return {
    raw: rawInitData,
    data: parsed,
  };
}
