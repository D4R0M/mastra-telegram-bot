import { getPool, closePool } from '../src/db/client.js';

async function main() {
  const pool = getPool();
  const tables = ['review_events', 'review_log', 'review_state', 'reviews'];
  for (const tbl of tables) {
    const res = await pool.query(`SELECT user_id, COUNT(*) AS count FROM ${tbl} GROUP BY user_id ORDER BY user_id`);
    console.log(`Table ${tbl}:`);
    console.table(res.rows);
  }
  await closePool();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
