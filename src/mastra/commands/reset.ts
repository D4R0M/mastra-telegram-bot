import type { CommandResponse, ConversationState } from "../commandTypes.js";
import { buildToolExecCtx } from "../context.js";
import { resetSettingsTool } from "../tools/settingsTools.js";

export default async function handleResetCommand(
  params: string[],
  rawParams: string,
  userId: string,
  state?: ConversationState,
  mastra?: any,
): Promise<CommandResponse> {
  try {
    const { runtimeContext, tracingContext } = buildToolExecCtx(mastra, {
      requestId: userId,
    });
    const result = await resetSettingsTool.execute({
      context: {
        user_id: userId,
        preserve_reminders: false,
        preserve_session: false,
        preserve_algorithm: false,
      },
      runtimeContext,
      tracingContext,
      mastra,
    });
    return {
      response: result.success
        ? "✅ Settings reset to defaults!"
        : `❌ ${result.message}`,
      parse_mode: "HTML",
    };
  } catch (error) {
    return {
      response: "❌ Error resetting settings.",
      parse_mode: "HTML",
    };
  }
}
