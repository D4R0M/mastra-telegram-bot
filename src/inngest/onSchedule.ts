import type { Inngest } from "inngest";

type ScheduleOptions = {
  /** Optional timezone to evaluate the cron expression in. */
  timezone?: string;
};

export function onSchedule(
  client: Inngest,
  id: string,
  cron: string,
  handler: any,
  options: ScheduleOptions = {},
) {
  const trigger = options.timezone
    ? { cron, timezone: options.timezone }
    : { cron };

  return client.createFunction({ id, name: id }, trigger, handler);
}

