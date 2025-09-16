import { inngest } from "./client";
import { init } from "@mastra/inngest";
import { registerApiRoute as originalRegisterApiRoute } from "@mastra/core/server";
import { type Mastra } from "@mastra/core";
import { type Inngest, InngestFunction, NonRetriableError } from "inngest";
import { serve as originalInngestServe } from "inngest/hono";
import { checkReminders } from "../../inngest/reminder.js";

/**
 * We only export functions that have a trigger (cron or event).
 * This avoids Inngest sync errors about "trigger must supply an event or cron".
 */

// Initialize Inngest with Mastra to get Inngest-compatible workflow helpers
const { createWorkflow: originalCreateWorkflow, cloneStep } = init(inngest);

export function createWorkflow(
  params: Parameters<typeof originalCreateWorkflow>[0],
): ReturnType<typeof originalCreateWorkflow> {
  return originalCreateWorkflow({
    ...params,
    retryConfig: {
      attempts: 3,
      ...(params.retryConfig ?? {}),
    },
  });
}

// Export the Inngest client and workflow helpers
export { inngest, cloneStep };

// Only include triggered functions here
const inngestFunctions: InngestFunction.Any[] = [checkReminders];

/**
 * Route generator — these generated functions DO have an event trigger,
 * so it's safe to push them into `inngestFunctions`.
 */
export function registerApiRoute<P extends string>(
  ...args: Parameters<typeof originalRegisterApiRoute<P>>
): ReturnType<typeof originalRegisterApiRoute<P>> {
  const [path, options] = args;
  if (path.startsWith("/api/") || typeof options !== "object") {
    // This will throw an error.
    return originalRegisterApiRoute(...args);
  }

  const fn = inngest.createFunction(
    {
      id: `api-${path.replace(/^\/+/, "").replaceAll(/\/+/g, "-")}`,
      name: path,
    },
    {
      event: `event/api.${path.replace(/^\/+/, "").replaceAll(/\/+/g, ".")}`,
    },
    async ({ event, step }) => {
      await step.run("forward request to Mastra", async () => {
        // Forward the request to the local Mastra server.
        const response = await fetch(`http://localhost:5000${path}`, {
          method: event.data.method,
          headers: event.data.headers,
          body: event.data.body,
        });

        if (!response.ok) {
          if (
            (response.status >= 500 && response.status < 600) ||
            response.status === 429 ||
            response.status === 408
          ) {
            // 5XX, 429 (Rate-Limit Exceeded), 408 (Request Timeout) are retriable.
            throw new Error(
              `Failed to forward request to Mastra: ${response.statusText}`,
            );
          } else {
            // All other errors are non-retriable.
            throw new NonRetriableError(
              `Failed to forward request to Mastra: ${response.statusText}`,
            );
          }
        }
      });
    },
  );

  inngestFunctions.push(fn);
  return originalRegisterApiRoute(...args);
}

/**
 * Helper for adding a cron-triggered workflow. This creates a function with BOTH
 * an event trigger and a cron trigger. It is safe to push to `inngestFunctions`.
 */
export function registerCronWorkflow(cronExpression: string, workflow: any) {
  const f = inngest.createFunction(
    { id: "cron-trigger" },
    [{ event: "replit/cron.trigger" }, { cron: cronExpression }],
    async () => {
      const run = await workflow.createRunAsync();
      const result = await run.start({ inputData: {} });
      return result;
    },
  );
  inngestFunctions.push(f);
}

/**
 * Serve only the explicitly listed, triggered functions.
 * We intentionally do NOT auto-include Mastra workflows here,
 * because some may lack triggers and would break Inngest sync.
 */
export function inngestServe({
  mastra, // kept for signature compatibility; not used
  inngest,
}: {
  mastra: Mastra;
  inngest: Inngest;
}): ReturnType<typeof originalInngestServe> {
  const functions = Array.from(new Set<InngestFunction.Any>(inngestFunctions));

  let serveHost: string | undefined;
  if (process.env.NODE_ENV === "production") {
    if (process.env.REPLIT_DOMAINS) {
      serveHost = `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`;
    }
  } else {
    serveHost = "http://localhost:5000";
  }

  return originalInngestServe({
    client: inngest,
    functions,
    serveHost,
    signingKey: process.env.INNGEST_SIGNING_KEY,
  });
}
