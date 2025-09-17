import { createWorkflow } from "../inngest";
import { createStep } from "../../steps/core/createStep.js";
import { z } from "zod";
import { sendTelegramResponseStep } from "./vocabularyWorkflow";
import {
  fetchReminderUsers,
  processReminders,
  type SendReminderResult,
} from "../../reminders/reminderEngine.js";

// Step 1: Find users who have reminders enabled
const fetchReminderUsersStep = createStep({
  id: "fetch-reminder-users",
  description: "Fetch users with reminder notifications enabled",
  inputSchema: z.object({}),
  outputSchema: z.object({
    users: z.array(
      z.object({
        user_id: z.number(),
        chat_id: z.string(),
      }),
    ),
  }),
  execute: async ({ mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info("🔎 [ReminderWorkflow] Fetching users with reminders enabled");

    const users = await fetchReminderUsers(logger);

    logger?.info("📋 [ReminderWorkflow] Users fetched for reminders", {
      count: users.length,
    });

    return { users };
  },
});

// Step 2: For each user, check timing and send reminder if appropriate
const processRemindersStep = createStep({
  id: "process-reminders",
  description: "Check reminder timing and send reminders via Telegram",
  inputSchema: z.object({
    users: z.array(
      z.object({
        user_id: z.number(),
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

    const result = await processReminders(inputData.users, {
      mastra,
      logger,
      timezoneFallback: "Europe/Stockholm",
      sendReminder: async ({ chatId, message }) => {
        const sendResult = await sendTelegramResponseStep.execute({
          inputData: {
            response: message,
            chatId,
            parse_mode: "HTML",
          },
          mastra,
        });

        return {
          ok: sendResult.messageSent,
          messageId: sendResult.sentMessageId ?? undefined,
        } satisfies SendReminderResult;
      },
    });

    logger?.info("✅ [ReminderWorkflow] Reminder processing complete", result);

    return result;
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
