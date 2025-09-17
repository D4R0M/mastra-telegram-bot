#!/usr/bin/env node
import "dotenv/config";
import { closePool } from "../src/db/client.js";
import {
  fetch24hTotals,
  fetchEventsLast7d,
  fetchOptOutCount,
} from "../src/db/reviewEvents.js";
import { isMlLoggingEnabled } from "../src/lib/mlPrivacy.js";

function printSection(title: string) {
  console.log(`\n=== ${title} ===`);
}

async function main() {
  try {
    const [totals24h, last7d, optOutCount] = await Promise.all([
      fetch24hTotals(),
      fetchEventsLast7d(),
      fetchOptOutCount(),
    ]);

    console.log("ML logging enabled:", isMlLoggingEnabled());
    console.log("Opted-out users:", optOutCount);

    printSection("Last 24h by mode");
    if (!totals24h.length) {
      console.log("(no events recorded)");
    } else {
      totals24h.forEach((row) => {
        console.log(
          `${row.mode.padEnd(18)} events=${row.events.toString().padStart(4)} ` +
            `graded=${row.graded.toString().padStart(4)} accuracy=${
              row.accuracy === null ? "n/a" : row.accuracy.toFixed(2)
            }`,
        );
      });
    }

    printSection("Last 7 days");
    if (!last7d.length) {
      console.log("(no events recorded)");
    } else {
      last7d.forEach((row) => {
        console.log(
          `${row.day.slice(0, 10)} ${row.mode.padEnd(18)} events=${
            row.events.toString().padStart(4)
          } unique=${row.unique_users.toString().padStart(4)} accuracy=${
            row.accuracy === null ? "n/a" : row.accuracy.toFixed(2)
          }`,
        );
      });
    }
  } finally {
    await closePool();
  }
}

main().catch((error) => {
  console.error("Failed to print ML stats:", error);
  process.exitCode = 1;
});
