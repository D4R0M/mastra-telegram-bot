import type { CommandResponse, ConversationState } from "../commandParser.js";
import { buildToolExecCtx } from "../context.js";
import { getUserSettingsTool } from "../tools/settingsTools.js";
import { fmtSettingsHTML, type Settings as SettingsUI } from "../ui/format.js";

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
      const settings: SettingsUI = result.settings;
      const inline_keyboard = {
        inline_keyboard: [
          [
            {
              text: "🌍 Change Timezone",
              callback_data: "settings:change_timezone",
            },
            {
              text: "🌐 Change Language",
              callback_data: "settings:change_language",
            },
          ],
          [
            {
              text: "🆕 New Cards",
              callback_data: "settings:new_cards",
            },
            {
              text: "🔁 Daily Reviews",
              callback_data: "settings:daily_reviews",
            },
          ],
          [
            {
              text: "🎯 Session Size",
              callback_data: "settings:session_size",
            },
          ],
          [
            {
              text: settings.reminders_enabled
                ? "🔔 Disable Reminders"
                : "🔔 Enable Reminders",
              callback_data: "settings:toggle_reminders",
            },
            {
              text: "⏰ Reminder Times",
              callback_data: "settings:reminder_times",
            },
          ],
          [
            {
              text: "⚡ Advanced Settings",
              callback_data: "settings:advanced",
            },
          ],
          [
            { text: "⬅ Back", callback_data: "settings:back" },
            { text: "📂 Export", callback_data: "settings:export" },
            { text: "🔄 Reset", callback_data: "settings:reset" },
            { text: "❌ Close", callback_data: "settings:close" },
          ],
        ],
      };

      return {
        response: fmtSettingsHTML(settings),
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
