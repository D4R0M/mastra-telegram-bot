export const AUTHORIZED_TELEGRAM_USER_IDS = new Set<string>(["6776842238"]);

export function isAuthorizedTelegramUser(
  userId: string | number | undefined,
): boolean {
  if (userId === undefined || userId === null) {
    return false;
  }
  return AUTHORIZED_TELEGRAM_USER_IDS.has(String(userId));
}
