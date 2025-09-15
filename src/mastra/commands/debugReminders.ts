import type { CommandResponse } from "../commandTypes.js";
import { getPool } from "../../db/client.js";
import { isAuthorizedTelegramUser } from "../authorization.js";

export default async function debugReminders(
  _params: string[],
  _rawParams: string,
  userId: string,
): Promise<CommandResponse> {
  if (!isAuthorizedTelegramUser(userId)) {
    return { response: "Unauthorized" };
  }

  const pool = getPool();
  const { rows } = await pool.query(
    `with due as (
      select user_id, count(*) as due_count
      from review_states
      where due_at <= (now() at time zone 'utc')
      group by user_id
    )
    select user_id, due_count::int from due;`,
  );

  const ts = new Date().toISOString();
  const count = rows.length;
  return { response: `${count} users with due cards at ${ts}` };
}
