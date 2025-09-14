import type { Mastra } from "@mastra/core";
import { isAuthorizedTelegramUser } from "./authorization.js";
import { processCommand, handleListCallback } from "./commandParser.js";
import {
  getConversationState,
  saveConversationState,
} from "./conversationStateStorage.js";
import { buildToolExecCtx } from "./context.js";
import { submitReviewTool } from "./tools/reviewTools.js";

// Simple in-memory idempotency guard
const seenUpdates = new Set<number>();

async function sendTelegramMessage(
  token: string,
  chatId: string | number,
  result: any,
  replyTo?: string | number,
): Promise<string | undefined> {
  const method = result.edit_message_id ? "editMessageText" : "sendMessage";
  const body: any = {
    chat_id: chatId,
    text: result.response,
    parse_mode: result.parse_mode || "HTML",
  };

  if (result.edit_message_id) {
    body.message_id = result.edit_message_id;
  } else if (replyTo) {
    body.reply_to_message_id = replyTo;
  }

  if (result.remove_keyboard) {
    body.reply_markup = { remove_keyboard: true };
  } else if (result.reply_keyboard) {
    body.reply_markup = {
      keyboard: result.reply_keyboard.map((row: string[]) =>
        row.map((text: string) => ({ text })),
      ),
      resize_keyboard: true,
    };
  } else if (result.inline_keyboard) {
    body.reply_markup = result.inline_keyboard;
  }

  const res = await fetch(
    `https://api.telegram.org/bot${token}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const data: any = await res.json().catch(() => ({}));
  return data?.result?.message_id;
}

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
  if (!chatId || !userId) {
    logger?.warn("missing_chat_or_user", { update_id: updateId });
    return;
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    logger?.error("missing_token_or_chat", { update_id: updateId });
    return;
  }

  if (!isAuthorizedTelegramUser(userId)) {
    logger?.warn("unauthorized", { userId });
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
    return;
  }

  // Handle callback queries (button presses)
  if (update?.callback_query) {
    const callbackData = update.callback_query.data || "";
    const chatIdStr = chatId.toString();
    const messageId = update.callback_query.message?.message_id;
    const callbackId = update.callback_query.id;

    try {
      if (callbackData.startsWith("grade:")) {
        const [_, gradeStr, cardId] = callbackData.split(":");
        const grade = parseInt(gradeStr);

        const { state } = await getConversationState(chatIdStr);
        if (state?.mode === "review_session" && state.data) {
          const { runtimeContext, tracingContext } = buildToolExecCtx(mastra, {
            requestId: chatIdStr,
          });
          await submitReviewTool.execute({
            context: {
              owner_id: chatIdStr,
              card_id: cardId,
              start_time: state.data.start_time || Date.now() - 10000,
              grade,
              session_id: state.data.session_id,
            },
            runtimeContext,
            tracingContext,
            mastra,
          });

          const answerUrl = `https://api.telegram.org/bot${token}/answerCallbackQuery`;
          const editUrl = `https://api.telegram.org/bot${token}/editMessageReplyMarkup`;
          await Promise.all([
            fetch(answerUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                callback_query_id: callbackId,
                text: `Grade ${grade} saved \u2713`,
              }),
            }),
            fetch(editUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: chatId,
                message_id: messageId,
                reply_markup: { inline_keyboard: [] },
              }),
            }),
          ]);

          const nextIndex = (state.data.current_index || 1) + 1;
          const hasMoreCards =
            state.data.all_cards &&
            nextIndex <= state.data.all_cards.length;

          if (hasMoreCards) {
            const nextCard = state.data.all_cards[nextIndex - 1];
            await saveConversationState(chatIdStr, {
              mode: "review_session",
              step: 1,
              data: {
                ...state.data,
                current_card: nextCard,
                current_index: nextIndex,
                start_time: Date.now(),
              },
            });
            const nextState = {
              mode: "review_session",
              step: 1,
              data: {
                ...state.data,
                current_card: nextCard,
                current_index: nextIndex,
                start_time: Date.now(),
              },
            };
            const result = await processCommand(
              "__next_card__",
              chatIdStr,
              chatIdStr,
              nextState,
              mastra,
            );
            if (result.conversationState !== nextState) {
              await saveConversationState(chatIdStr, result.conversationState);
            }
            const sentId = await sendTelegramMessage(token, chatId, result);
            logger?.info("reply_sent", {
              update_id: updateId,
              ms: Date.now() - start,
              message_id: sentId,
            });
          } else {
            await saveConversationState(chatIdStr, undefined);
            const result = await processCommand(
              "__session_complete__",
              chatIdStr,
              chatIdStr,
              undefined,
              mastra,
            );
            const sentId = await sendTelegramMessage(token, chatId, result);
            logger?.info("reply_sent", {
              update_id: updateId,
              ms: Date.now() - start,
              message_id: sentId,
            });
          }
        }
        return;
      }

      if (callbackData.startsWith("list:")) {
        const [, action, cardId] = callbackData.split(":");
        const { state } = await getConversationState(chatIdStr);
        const result = await handleListCallback(action, cardId, chatIdStr, mastra);
        if (result.conversationState !== state) {
          await saveConversationState(chatIdStr, result.conversationState);
        }
        const sentId = await sendTelegramMessage(token, chatId, result);
        await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ callback_query_id: callbackId }),
        });
        logger?.info("reply_sent", {
          update_id: updateId,
          ms: Date.now() - start,
          message_id: sentId,
        });
        return;
      }

      // Unknown callback - just answer to remove loading state
      await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callback_query_id: callbackId }),
      });
    } catch (err) {
      logger?.error("process_error", {
        update_id: updateId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  // Handle regular messages
  const text = update?.message?.text ?? "";
  try {
    const chatIdStr = chatId.toString();
    const { state, expired } = await getConversationState(chatIdStr);
    const result = await processCommand(
      text,
      chatIdStr,
      chatIdStr,
      state,
      mastra,
      expired,
    );
    if (result.conversationState !== state) {
      await saveConversationState(chatIdStr, result.conversationState);
    }
    const sentId = await sendTelegramMessage(
      token,
      chatId,
      result,
      update?.message?.message_id,
    );
    logger?.info("reply_sent", {
      update_id: updateId,
      ms: Date.now() - start,
      message_id: sentId,
    });
  } catch (err) {
    logger?.error("process_error", {
      update_id: updateId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
