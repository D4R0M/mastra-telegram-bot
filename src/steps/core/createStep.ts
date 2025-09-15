import { init } from "@mastra/inngest";
import { inngest } from "../../mastra/inngest/client.js";

// Pure leaf utility — do not import commands/registry here.
const { createStep } = init(inngest);

export { createStep };
export type StepConfig = Parameters<typeof createStep>[0];
