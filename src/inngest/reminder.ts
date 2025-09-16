import { inngest } from "../mastra/inngest/client.js";

/**
 * Scheduled reminder workflow
 * Logs [ReminderWorkflow] and a step [CheckReminderTime] so we can verify scheduling.
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

    const result = await step.run("CheckReminderTime", async () => {
      logger.info("[CheckReminderTime] starting");
      // TODO: implement: find due cards/users and enqueue/send reminders
      // For now, just log so we can verify scheduling works.
      logger.info("[CheckReminderTime] completed");
      return { ok: true };
    });

    return result;
  }
);

export default checkReminders;
