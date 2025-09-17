import { inngest } from "../mastra/inngest/client.js";
import {
  fetchReminderUsers,
  processReminders,
  type LoggerLike,
  type SendReminderFn,
} from "../reminders/reminderEngine.js";

function createTelegramSender(
  logger: LoggerLike,
  token: string,
): SendReminderFn {
  return async ({ chatId, message }) => {
    const telegramApiUrl = `https://api.telegram.org/bot${token}/sendMessage`;
    const body = {
      chat_id: chatId,
      text: message,
      parse_mode: "HTML",
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(telegramApiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error?.("❌ [ReminderWorkflow] Telegram API error", {
          chatId,
          status: response.status,
          error: errorText,
        });
        return { ok: false };
      }

      const result = await response.json();
      const messageId = result.result?.message_id
        ? String(result.result.message_id)
        : undefined;

      logger.info?.("✅ [ReminderWorkflow] Reminder sent to Telegram", {
        chatId,
        messageId,
      });

      return { ok: true, messageId };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        logger.warn?.("⚠️ [ReminderWorkflow] Telegram request timed out", {
          chatId,
        });
      } else {
        logger.error?.(
          "❌ [ReminderWorkflow] Failed to send Telegram reminder",
          {
            chatId,
            error: error instanceof Error ? error.message : String(error),
          },
        );
      }
      return { ok: false };
    } finally {
      clearTimeout(timeoutId);
    }
  };
}

/**
 * Scheduled reminder workflow
 * Fetches users with reminders enabled and sends them notifications when appropriate.
 */
export const checkReminders = inngest.createFunction(
  {
    id: "check-reminders",
    name: "ReminderWorkflow",
  },
  {
    cron: "*/30 * * * *",
    timezone: "Europe/Stockholm",
  },
  async ({ step, logger }) => {
    logger.info("[ReminderWorkflow] scheduled reminder check started");

    const { users } = await step.run("FetchReminderUsers", async () => {
      const users = await fetchReminderUsers(logger);
      logger.info("[ReminderWorkflow] users fetched", { count: users.length });
      return { users };
    });

    const token = process.env.TELEGRAM_BOT_TOKEN;

    const result = await step.run("ProcessReminders", async () => {
      if (users.length === 0) {
        return { processed: 0, remindersSent: 0 };
      }

      if (!token) {
        logger.warn(
          "⚠️ [ReminderWorkflow] TELEGRAM_BOT_TOKEN missing, skipping reminder send",
        );
        return { processed: users.length, remindersSent: 0 };
      }

      return processReminders(users, {
        logger,
        timezoneFallback: "Europe/Stockholm",
        sendReminder: createTelegramSender(logger, token),
      });
    });

    logger.info("[ReminderWorkflow] reminder check completed", result);

    return result;
  },
);

export default checkReminders;
