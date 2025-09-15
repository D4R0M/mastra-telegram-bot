import { inngest } from "../mastra/inngest/client.js";
import { getPool } from "../db/client.js";
import { isAuthorizedTelegramUser } from "../mastra/authorization.js";
import { sendTelegramResponseStep } from "../mastra/workflows/vocabularyWorkflow.js";

export const checkDue = inngest.onSchedule(
  "schedule.check-due",
  "*/2 * * * *",
  async ({ step }) => {
    const pool = getPool();
    const { rows } = await step.run("fetch due users", () =>
      pool.query(
        `with due as (
          select user_id, count(*) as due_count
          from review_states
          where due_at <= (now() at time zone 'utc')
          group by user_id
        )
        select user_id, due_count::int from due;`,
      ),
    );

    const allowed = rows.filter((r) =>
      isAuthorizedTelegramUser(String(r.user_id)),
    );

    await Promise.all(
      allowed.map(({ user_id, due_count }) =>
        step.run(`notify-${user_id}`, async () => {
          const message = `You have ${due_count} cards due. /practice`;
          await sendTelegramResponseStep.execute({
            inputData: { response: message, chatId: String(user_id) },
          });
        }),
      ),
    );

    const notified = allowed.length;
    console.log(`checkDue: notified ${notified} users`);
    return { notified };
  },
);

export default checkDue;
