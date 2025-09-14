import { createWorkflow, createStep } from "../inngest";
import { z } from "zod";
import { getPool } from "../../db/client.js";
import { sendTelegramResponseStep } from "./vocabularyWorkflow";
import {
  checkReminderTimeTool,
  recordReminderSentTool,
} from "../tools/reminderTools.js";
import { getDueCardsStatsTool } from "../tools/statisticsTools.js";
import { buildToolExecCtx } from "../context";

// Step 1: Find users who have reminders enabled
const fetchReminderUsersStep = createStep({
  id: "fetch-reminder-users",
  description: "Fetch users with reminder notifications enabled",
  inputSchema: z.object({}),
  outputSchema: z.object({
    users: z.array(
      z.object({
        user_id: z.string(),
        chat_id: z.string(),
      }),
    ),
  }),
  execute: async ({ mastra }) => {
    const logger = mastra?.getLogger();
    const pool = getPool();
    logger?.info("🔎 [ReminderWorkflow] Fetching users with reminders enabled");

    try {
      const result = await pool.query(
        "SELECT user_id, chat_id FROM prefs WHERE reminders_enabled = true",
      );

      return {
        users: result.rows.map((r: any) => ({
          user_id: r.user_id as string,
          chat_id: r.chat_id as string,
        })),
      };
    } catch (error) {
      logger?.error(
        "❌ [ReminderWorkflow] Error fetching reminder users:",
        error,
      );
      return { users: [] };
    }
  },
});

// Step 2: For each user, check timing and send reminder if appropriate
export const processRemindersStep = createStep({
  id: "process-reminders",
  description: "Check reminder timing and send reminders via Telegram",
  inputSchema: z.object({
    users: z.array(
      z.object({
        user_id: z.string(),
        chat_id: z.string(),
      }),
    ),
  }),
  outputSchema: z.object({
    processed: z.number(),
    remindersSent: z.number(),
  }),
  execute: async ({ inputData, mastra }) => {
    const logger = mastra?.getLogger();
    let remindersSent = 0;

    for (const user of inputData.users) {
      const execCtx = buildToolExecCtx(mastra, { requestId: user.user_id });

      try {
        const check = await checkReminderTimeTool.execute({
          context: { user_id: user.user_id },
          ...execCtx,
          mastra,
        });

        if (!check.success || !check.should_send_reminder) {
          continue;
        }

        const stats = await getDueCardsStatsTool.execute({
          context: { owner_id: user.user_id, timezone: "Europe/Stockholm" },
          ...execCtx,
          mastra,
        });

        const due = stats.success ? stats.stats.due_cards : 0;
        if (due <= 0) {
          continue;
        }

        const message =
          `🔔 Time to review! You have ${due} cards due—/practice to start reviewing`;

        const sendResult = await sendTelegramResponseStep.execute({
          inputData: {
            response: message,
            chatId: user.chat_id,
            parse_mode: "HTML",
          },
          mastra,
        });

        if (sendResult.messageSent) {
          await recordReminderSentTool.execute({
            context: { user_id: user.user_id },
            ...execCtx,
            mastra,
          });
          remindersSent++;
        }
      } catch (error) {
        logger?.error("❌ [ReminderWorkflow] Error processing reminder:", {
          error: error instanceof Error ? error.message : String(error),
          user_id: user.user_id,
        });
      }
    }

    return { processed: inputData.users.length, remindersSent };
  },
});

export const reminderWorkflow = createWorkflow({
  id: "reminder-workflow",
  description: "Send study reminders to users based on their preferences",
  inputSchema: z.object({}),
  outputSchema: z.object({
    processed: z.number(),
    remindersSent: z.number(),
  }),
})
  .then(fetchReminderUsersStep)
  .then(processRemindersStep)
  .commit();
