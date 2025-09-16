import { inngest } from "./client";
import { init } from "@mastra/inngest";
import { registerApiRoute as originalRegisterApiRoute } from "@mastra/core/server";
import { type Mastra } from "@mastra/core";
import { type Inngest, InngestFunction, NonRetriableError } from "inngest";
import { serve as originalInngestServe } from "inngest/hono";
import { checkReminders } from "../../inngest/reminder.js";

/**
 * NOTE:
 * Inngest sync fails if any exported function has NO trigger (no cron/event).
 * We therefore export ONLY triggered functions explicitly via `inngestFunctions`.
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

// IMPORTANT: Only include functions that have a trigger (cron or event)
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
  inngestFunctions.push(
    inngest.createFunction(
      {
        id: `api-${path.replace(/^\/+/, "").replaceAll(/\/+/g, "-")}`,
        name: path,
      },
      {
        event: `event/api.${path.replace(/^\/+/, "").replaceAll(/\/+/g, ".")}`,
      },
      async ({ event, step }) => {
        await step.run("forward request to Mastra", async () => {
          // It is hard to obtain an internal handle on the Hono server,
          // so we just forward the request to the local Mastra server.
          const
