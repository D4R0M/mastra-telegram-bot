const envIds =
  process.env.ALLOWED_USER_IDS?.split(",").map((id) => id.trim()).filter(Boolean) ||
  ["6776842238"];

export const AUTHORIZED_TELEGRAM_USER_IDS = new Set<string>(envIds);

export function isAuthorizedTelegramUser(
  userId: string | number | undefined,
): boolean {
  if (userId === undefined || userId === null) {
    return false;
  }
  return AUTHORIZED_TELEGRAM_USER_IDS.has(String(userId));
}
