import type { CommandResponse, ConversationState } from "../commandParser.js";
import { buildToolExecCtx } from "../context.js";
import { getUserSettingsTool } from "../tools/settingsTools.js";

export default async function handleSettingsCommand(
  params: string[],
  rawParams: string,
  userId: string,
  state?: ConversationState,
  mastra?: any,
): Promise<CommandResponse> {
  const logger = mastra?.getLogger();

  try {
    const { runtimeContext, tracingContext } = buildToolExecCtx(mastra, {
      requestId: userId,
    });
    const result = await getUserSettingsTool.execute({
      context: {
        user_id: userId,
      },
      runtimeContext,
      tracingContext,
      mastra,
    });

    if (result.success && result.settings) {
      const settings = result.settings;
      const settingsText = [
        "⚙️ <b>Your Settings</b>\n",
        `📍 Timezone: ${settings.timezone}`,
        `🔕 Do Not Disturb: ${settings.dnd_start} - ${settings.dnd_end}`,
        `📚 Daily New Cards: ${settings.daily_new_limit}`,
        `🔄 Daily Reviews: ${settings.daily_review_limit}`,
        `📖 Session Size: ${settings.session_size} cards`,
        `🔔 Reminders: ${settings.reminders_enabled ? "Enabled" : "Disabled"}`,
        `⏰ Reminder Times: ${settings.reminder_times.join(", ")}`,
        `🧮 Algorithm: ${settings.algorithm.toUpperCase()}`,
        `🌐 Language: ${settings.locale}`,
        "\n<i>Use specific commands to update settings:</i>",
        "<code>/settings session [size]</code>",
        "<code>/settings reminders on/off</code>",
        "<code>/settings timezone [tz]</code>",
      ];

      return {
        response: settingsText.join("\n"),
        parse_mode: "HTML",
      };
    } else {
      return {
        response: `❌ ${result.message || "Could not fetch settings"}`,
        parse_mode: "HTML",
      };
    }
  } catch (error) {
    logger?.error("❌ [CommandParser] Error fetching settings:", error);
    return {
      response: "❌ Error fetching settings. Please try again.",
      parse_mode: "HTML",
    };
  }
}
