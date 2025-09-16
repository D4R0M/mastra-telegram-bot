import type { Inngest } from "inngest";

export function onSchedule(
  client: Inngest,
  id: string,
  cron: string,
  handler: any,
) {
  return client.createFunction({ id, cron }, handler);
}

