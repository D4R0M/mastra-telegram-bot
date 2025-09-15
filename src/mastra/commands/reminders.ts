import type { CommandResponse, ConversationState } from "../commandTypes.js";
import { buildToolExecCtx } from "../context.js";
import { getReminderSettingsTool } from "../tools/reminderTools.js";

export default async function handleRemindersCommand(
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
    const result = await getReminderSettingsTool.execute({
      context: { user_id: userId },
      runtimeContext,
      tracingContext,
      mastra,
    });
    if (result.success && result.settings) {
      const s = result.settings;
      return {
        response: `🔔 <b>Reminder Settings</b>\n\nEnabled: ${s.enabled ? "Yes" : "No"}\nTimes: ${s.preferred_times.join(", ")}\nTimezone: ${s.timezone}\nDND: ${s.dnd_start} - ${s.dnd_end}`,
        parse_mode: "HTML",
      };
    }
    return {
      response: `❌ ${result.message}`,
      parse_mode: "HTML",
    };
  } catch (error) {
    return {
      response: "❌ Error fetching reminder settings.",
      parse_mode: "HTML",
    };
  }
}
