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
      ];

      const inline_keyboard = {
        inline_keyboard: [
          [
            {
              text: settings.reminders_enabled
                ? "Disable Reminders"
                : "Enable Reminders",
              callback_data: "settings:toggle_reminders",
            },
          ],
          [
            {
              text: "Change Timezone",
              callback_data: "settings:change_timezone",
            },
          ],
          [
            {
              text: "Session Size",
              callback_data: "settings:session_size",
            },
          ],
        ],
      };

      return {
        response: settingsText.join("\n"),
        parse_mode: "HTML",
        inline_keyboard,
        conversationState: {
          mode: "settings_menu",
          step: 1,
        },
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
