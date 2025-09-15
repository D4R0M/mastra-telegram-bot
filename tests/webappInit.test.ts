import { describe, it, expect } from "vitest";
import crypto from "crypto";

import { validateInitData } from "../src/server/webappInit.ts";

const BOT_TOKEN = "123456:ABCDEF";

function buildInitData(payload: Record<string, string>): string {
  const params = new URLSearchParams(payload);
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = crypto
    .createHmac("sha256", "WebAppData")
    .update(BOT_TOKEN)
    .digest();
  const hash = crypto
    .createHmac("sha256", secret)
    .update(dataCheckString)
    .digest("hex");
  params.set("hash", hash);
  return params.toString();
}

describe("validateInitData", () => {
  it("accepts valid Telegram init data", () => {
    const authDate = Math.floor(Date.now() / 1000);
    const initData = buildInitData({
      auth_date: String(authDate),
      user: JSON.stringify({ id: 42, first_name: "Alice", username: "alice" }),
    });

    const result = validateInitData(initData, BOT_TOKEN);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user?.id).toBe(42);
      expect(result.user?.first_name).toBe("Alice");
      expect(result.params.get("auth_date")).toBe(String(authDate));
    }
  });

  it("rejects tampered init data", () => {
    const authDate = Math.floor(Date.now() / 1000);
    const initData = buildInitData({
      auth_date: String(authDate),
      user: JSON.stringify({ id: 42, first_name: "Alice" }),
    });
    const tampered = new URLSearchParams(initData);
    tampered.set("user", JSON.stringify({ id: 99, first_name: "Mallory" }));

    const result = validateInitData(tampered.toString(), BOT_TOKEN);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("bad-signature");
    }
  });

  it("rejects expired init data", () => {
    const now = Math.floor(Date.now() / 1000);
    const oldDate = now - 601;
    const initData = buildInitData({
      auth_date: String(oldDate),
      user: JSON.stringify({ id: 1 }),
    });

    const result = validateInitData(initData, BOT_TOKEN, 600);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("expired");
    }
  });
});
