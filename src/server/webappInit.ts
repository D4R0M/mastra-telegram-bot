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

export type ValidateInitDataFailureReason =
  | "missing"
  | "bad-signature"
  | "expired"
  | "invalid";

export type ValidateInitDataResult =
  | {
      ok: true;
      user: TelegramWebAppUser | null;
      params: URLSearchParams;
    }
  | {
      ok: false;
      reason: ValidateInitDataFailureReason;
    };

function parseUser(json: string | null): TelegramWebAppUser | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed.id !== "number") {
      return null;
    }
    return parsed as TelegramWebAppUser;
  } catch {
    return null;
  }
}

export function validateInitData(
  initData: string,
  botToken: string,
  maxAgeSec = 600,
): ValidateInitDataResult {
  if (!initData) {
    return { ok: false, reason: "missing" };
  }
  if (!botToken) {
    throw new Error("Bot token not configured");
  }

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) {
    return { ok: false, reason: "bad-signature" };
  }
  params.delete("hash");

  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secret = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();

  const computed = crypto
    .createHmac("sha256", secret)
    .update(dataCheckString)
    .digest("hex");

  const providedHash = Buffer.from(hash, "hex");
  const computedHash = Buffer.from(computed, "hex");
  if (
    providedHash.length !== computedHash.length ||
    !crypto.timingSafeEqual(providedHash, computedHash)
  ) {
    return { ok: false, reason: "bad-signature" };
  }

  const authDateRaw = params.get("auth_date");
  const authDate = authDateRaw ? Number(authDateRaw) : 0;
  if (!Number.isFinite(authDate) || authDate <= 0) {
    return { ok: false, reason: "invalid" };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (nowSeconds - authDate > maxAgeSec) {
    return { ok: false, reason: "expired" };
  }

  const user = parseUser(params.get("user"));

  return { ok: true, user, params };
}

export interface TelegramAuthContext {
  tgUser: TelegramWebAppUser;
  initParams: URLSearchParams;
  rawInitData: string;
}

export type TelegramAuthHandler = (
  ctx: any,
  auth: TelegramAuthContext,
) => Promise<any>;

export function requireTelegramWebAppAuth(
  handler: TelegramAuthHandler,
): (ctx: any) => Promise<any> {
  return async (ctx: any) => {
    const initDataHeader =
      ctx?.req?.header?.("x-telegram-init-data") ||
      ctx?.req?.header?.("X-Telegram-Init-Data");
    const initDataQuery = ctx?.req?.query?.("initData");
    const initData = initDataHeader || initDataQuery || "";

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      throw new Error("Bot token not configured");
    }

    const validation = validateInitData(initData, botToken);
    if (!validation.ok || !validation.user || typeof validation.user.id !== "number") {
      const response = ctx?.status?.(401)?.json?.({ error: "unauthorized" });
      if (response) {
        return response;
      }
      return ctx?.json?.({ error: "unauthorized" }, 401);
    }

    return handler(ctx, {
      tgUser: validation.user,
      initParams: validation.params,
      rawInitData: initData,
    });
  };
}
