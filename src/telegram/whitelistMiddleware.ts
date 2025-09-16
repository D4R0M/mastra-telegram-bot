import { isAdmin, isAuthorizedTelegramUser } from "../mastra/authorization.js";

export async function whitelistMiddleware(ctx: any, next: () => Promise<any>) {
  const tgUserId = String(ctx.from?.id);
  ctx.state = ctx.state || {};
  ctx.state.tgUserId = tgUserId;
  ctx.state.isAdmin = await isAdmin(tgUserId);
  if (ctx.state.isAdmin || (await isAuthorizedTelegramUser(tgUserId))) {
    return next();
  }
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = ctx.chat?.id;
  if (token && chatId) {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST" as const,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: "This bot is private. Ask the admin for access.",
      }),
    }).catch(() => {});
  }
}
