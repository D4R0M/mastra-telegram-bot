import type { CommandResponse, ConversationState } from "../commandTypes.js";
import { buildToolExecCtx } from "../context.js";
import { getDueCardsStatsTool } from "../tools/statisticsTools.js";

export default async function handleTestCommand(
  params: string[],
  rawParams: string,
  userId: string,
  state?: ConversationState,
  mastra?: any,
): Promise<CommandResponse> {
  const { runtimeContext, tracingContext } = buildToolExecCtx(mastra, {
    requestId: userId,
  });
  const stats = await getDueCardsStatsTool.execute({
    context: { owner_id: userId, timezone: "Europe/Stockholm" },
    runtimeContext,
    tracingContext,
    mastra,
  });
  const due = stats.success ? stats.stats.due_cards : 0;
  const message =
    due > 0
      ? `🔔 Time to review! You have ${due} cards due—/practice to start reviewing`
      : `🎉 No cards due right now—/practice to start reviewing`;
  return { response: message, parse_mode: "HTML" };
}
