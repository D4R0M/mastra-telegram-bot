import { getPool } from "../db/client.js";
import { buildToolExecCtx } from "../mastra/context.js";
import {
  checkReminderTimeTool,
  recordReminderSentTool,
} from "../mastra/tools/reminderTools.js";
import { getDueCardsStatsTool } from "../mastra/tools/statisticsTools.js";

type LoggerFn = (message: string, meta?: Record<string, unknown>) => void;

export type LoggerLike = {
  info?: LoggerFn;
  warn?: LoggerFn;
  error?: LoggerFn;
};

export type ReminderUser = {
  user_id: number;
  chat_id: string;
  timezone?: string | null;
};

export type SendReminderPayload = {
  chatId: string;
  message: string;
};

export type SendReminderResult = {
  ok: boolean;
  messageId?: string;
};

export type SendReminderFn = (
  payload: SendReminderPayload,
) => Promise<SendReminderResult>;

type ProcessRemindersOptions = {
  mastra?: any;
  logger?: LoggerLike;
  timezoneFallback?: string;
  sendReminder: SendReminderFn;
};

const DEFAULT_TIMEZONE = "Europe/Stockholm";

export async function fetchReminderUsers(
  logger?: LoggerLike,
): Promise<ReminderUser[]> {
  const pool = getPool();

  try {
    const result = await pool.query(
      "SELECT user_id, chat_id, timezone FROM prefs WHERE reminders_enabled = true",
    );

    return result.rows.map((row: any) => ({
      user_id: Number(row.user_id),
      chat_id: String(row.chat_id),
      timezone: row.timezone ? String(row.timezone) : null,
    }));
  } catch (error) {
    logger?.error?.("❌ [ReminderWorkflow] Error fetching reminder users", {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

export async function processReminders(
  users: ReminderUser[],
  {
    mastra,
    logger,
    timezoneFallback = DEFAULT_TIMEZONE,
    sendReminder,
  }: ProcessRemindersOptions,
): Promise<{ processed: number; remindersSent: number }> {
  let remindersSent = 0;

  for (const user of users) {
    const execCtx = buildToolExecCtx(mastra, { requestId: user.user_id });

    try {
      const timing = await checkReminderTimeTool.execute({
        context: { user_id: user.user_id },
        ...execCtx,
        mastra,
      });

      if (!timing.success) {
        logger?.warn?.(
          "⚠️ [ReminderWorkflow] Failed to evaluate reminder timing",
          {
            user_id: user.user_id,
            reason: timing.message,
          },
        );
        continue;
      }

      if (!timing.should_send_reminder) {
        logger?.info?.(
          "ℹ️ [ReminderWorkflow] Skipping reminder based on timing",
          {
            user_id: user.user_id,
            reason: timing.message ?? timing.reason,
          },
        );
        continue;
      }

      const timezone = user.timezone ?? timezoneFallback;
      const stats = await getDueCardsStatsTool.execute({
        context: { owner_id: user.user_id, timezone },
        ...execCtx,
        mastra,
      });

      if (!stats.success) {
        logger?.warn?.("⚠️ [ReminderWorkflow] Unable to fetch due card stats", {
          user_id: user.user_id,
          reason: stats.message,
        });
        continue;
      }

      const due = stats.stats.due_cards;
      if (due <= 0) {
        logger?.info?.(
          "ℹ️ [ReminderWorkflow] No due cards for user, skipping reminder",
          {
            user_id: user.user_id,
          },
        );
        continue;
      }

      const message = `You have ${due} cards due—/practice to start reviewing`;
      const sendResult = await sendReminder({
        chatId: user.chat_id,
        message,
      });

      if (!sendResult.ok) {
        logger?.warn?.(
          "⚠️ [ReminderWorkflow] Failed to send reminder message",
          {
            user_id: user.user_id,
          },
        );
        continue;
      }

      const recordResult = await recordReminderSentTool.execute({
        context: { user_id: user.user_id },
        ...execCtx,
        mastra,
      });

      if (!recordResult.success) {
        logger?.warn?.(
          "⚠️ [ReminderWorkflow] Failed to record reminder timestamp",
          {
            user_id: user.user_id,
            reason: recordResult.message,
          },
        );
        continue;
      }

      remindersSent++;
    } catch (error) {
      logger?.error?.("❌ [ReminderWorkflow] Error processing reminder", {
        user_id: user.user_id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { processed: users.length, remindersSent };
}
