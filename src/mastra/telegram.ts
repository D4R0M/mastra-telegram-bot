import type { Mastra } from "@mastra/core";
import {
  parseCommand,
  processCommand,
  handleListCallback,
  handleSettingsCallback,
} from "./commandParser.js";
import { handleExportCallback } from "./commands/exportCallback.js";
import {
  getConversationState,
  saveConversationState,
} from "./conversationStateStorage.js";
import { isAuthorizedTelegramUser } from "./authorization.js";

export function resolveChatId(update: any): string | undefined {
  return (
    update?.message?.chat?.id?.toString() ||
    update?.callback_query?.message?.chat?.id?.toString() ||
    update?.channel_post?.chat?.id?.toString()
  );
}

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

  const chatId = resolveChatId(update);
  const from =
    update?.message?.from ||
    update?.callback_query?.from ||
    update?.channel_post?.from;
  const userId = from?.id;
  const username = from?.username;

  if (!isAuthorizedTelegramUser(userId)) {
    logger?.warn("unauthorized", { userId, username });
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
  if (!token || !chatId) {
    logger?.error("missing_token_or_chat", { update_id: updateId });
    return;
  }

  try {
    const userIdStr = String(userId);
    const { state: existingState, expired } =
      await getConversationState(userIdStr);
    let result;
    let commandHandled = "fallback";

    if (update?.callback_query?.data) {
      const data = update.callback_query.data.trim();
      if (data.startsWith("list:")) {
        const parts = data.split(":");
        const action = parts[1];
        const payload = parts.slice(2).join(":");
        result = await handleListCallback(action, payload, userIdStr, mastra);
        commandHandled = `callback_list_${action}`;
      } else if (data.startsWith("settings:")) {
        const action = data.split(":")[1];
        result = await handleSettingsCallback(action, userIdStr, mastra);
        commandHandled = `callback_settings_${action}`;
      } else if (data === "practice_now") {
        result = await processCommand(
          "/practice",
          userIdStr,
          chatId,
          existingState,
          mastra,
          expired,
        );
        commandHandled = "callback_practice_now";
      } else if (data === "add_card") {
        result = await processCommand(
          "/add",
          userIdStr,
          chatId,
          existingState,
          mastra,
          expired,
        );
        commandHandled = "callback_add_card";
      } else if (data === "open_stats_detail") {
        result = {
          response: "Coming soon: daily breakdown & tag analytics.",
          parse_mode: "HTML",
        };
        commandHandled = "callback_open_stats_detail";
      } else if (data.startsWith("export:")) {
        const action = data.split(":")[1];
        result = await handleExportCallback(action, existingState);
        commandHandled = `callback_export_${action}`;
      } else {
        result = await processCommand(
          data,
          userIdStr,
          chatId,
          existingState,
          mastra,
          expired,
        );
        const parsed = parseCommand(data);
        if (parsed?.command) {
          commandHandled = parsed.command.replace(/^\//, "");
        }
      }
      if (update.callback_query.id) {
        await fetch(
          `https://api.telegram.org/bot${token}/answerCallbackQuery`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              callback_query_id: update.callback_query.id,
            }),
          },
        ).catch(() => {});
      }
    } else {
      const text = update?.message?.text || update?.channel_post?.text || "";
      result = await processCommand(
        text,
        userIdStr,
        chatId,
        existingState,
        mastra,
        expired,
      );
      const parsed = parseCommand(text);
      if (parsed?.command) {
        commandHandled = parsed.command.replace(/^\//, "");
      }
    }

    if (result.conversationState !== existingState) {
      await saveConversationState(userIdStr, result.conversationState);
    }

    const body: any = {
      chat_id: chatId,
      text: result.response,
      parse_mode: result.parse_mode || "HTML",
    };
    if (result.document) {
      const form = new FormData();
      form.append("chat_id", chatId);
      form.append(
        "document",
        new Blob([result.document.content], { type: "text/csv" }),
        result.document.filename,
      );
      if (result.response) form.append("caption", result.response);
      if (result.inline_keyboard) {
        form.append("reply_markup", JSON.stringify(result.inline_keyboard));
      }
      await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
        method: "POST",
        body: form,
      });
    } else {
      if (result.inline_keyboard) {
        body.reply_markup = result.inline_keyboard;
      } else if (result.reply_keyboard) {
        body.reply_markup = result.reply_keyboard;
      } else if (result.remove_keyboard) {
        body.reply_markup = { remove_keyboard: true };
      }
      if (result.edit_message_id) {
        body.message_id = result.edit_message_id;
        await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        const res = await fetch(
          `https://api.telegram.org/bot${token}/sendMessage`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
        );
        const data: any = await res.json().catch(() => ({}));
        const sentMessageId = data?.result?.message_id;
        logger?.info("reply_sent", {
          update_id: updateId,
          ms: Date.now() - start,
          message_id: sentMessageId,
        });
      }
    }

    logger?.info("command_handled", {
      update_id: updateId,
      chat_id: chatId,
      command: commandHandled,
    });
  } catch (err) {
    logger?.error("process_error", {
      update_id: updateId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
