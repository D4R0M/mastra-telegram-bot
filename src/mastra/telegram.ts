import { isAuthorizedTelegramUser } from "./authorization.js";
import type { Mastra } from "@mastra/core";

// Simple in-memory idempotency guard
const seenUpdates = new Set<number>();

export async function processTelegramUpdate(
  update: any,
  mastra: Mastra,
  start: number,
): Promise<void> {
  const logger = mastra.getLogger();
  const updateId: number | undefined = update?.update_id;
  if (typeof updateId === "number") {
    if (seenUpdates.has(updateId)) {
      logger?.warn("duplicate_update", { update_id: updateId });
      return;
    }
    seenUpdates.add(updateId);
  }

  const chatId =
    update?.message?.chat?.id || update?.callback_query?.message?.chat?.id;
  const userId = update?.message?.from?.id || update?.callback_query?.from?.id;

  if (!isAuthorizedTelegramUser(userId)) {
    logger?.warn("unauthorized", { userId });
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (token && chatId) {
      try {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: "Sorry, you are not authorized to use this bot.",
          }),
        });
      } catch (err) {
        logger?.error("process_error", {
          update_id: updateId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return;
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const text = update?.message?.text ?? "";
  if (!token || !chatId) {
    logger?.error("missing_token_or_chat", { update_id: updateId });
    return;
  }

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text }),
      },
    );
    const data: any = await res.json().catch(() => ({}));
    const messageId = data?.result?.message_id;
    logger?.info("reply_sent", {
      update_id: updateId,
      ms: Date.now() - start,
      message_id: messageId,
    });
  } catch (err) {
    logger?.error("process_error", {
      update_id: updateId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
