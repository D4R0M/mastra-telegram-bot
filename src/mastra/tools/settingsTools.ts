import { createTool } from "@mastra/core/tools";
import type { IMastraLogger } from "@mastra/core/logger";
import { z } from "zod";
import { getPool } from "../../db/client";

// ===============================
// Types for Settings Management
// ===============================

interface UserSettings {
  user_id: number;
  chat_id: string;
  timezone: string;
  dnd_start: string;
  dnd_end: string;
  daily_new_limit: number;
  daily_review_limit: number;
  session_size: number;
  reminders_enabled: boolean;
  reminder_times: string[];
  algorithm: string;
  locale: string;
  created_at?: Date;
  updated_at?: Date;
}

// Helper function to format time from database
function formatTimeFromDB(timeStr: string): string {
  if (!timeStr) return '';
  if (timeStr.length === 8) {
    return timeStr.substring(0, 5); // Remove seconds
  }
  return timeStr;
}

// Helper function to format time for database
function formatTimeForDB(timeStr: string): string {
  if (!timeStr) return '';
  if (timeStr.length === 5) {
    return timeStr + ':00'; // Add seconds
  }
  return timeStr;
}

// ===============================
// Get User Settings Tool
// ===============================

export const getUserSettingsTool = createTool({
  id: "get-user-settings-tool",
  description: `Get all user settings including session preferences, daily limits, reminder settings, and algorithm configuration`,
  inputSchema: z.object({
    user_id: z.coerce.number().describe("User identifier"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    settings: z.object({
      user_id: z.number(),
      chat_id: z.string(),
      timezone: z.string(),
      dnd_start: z.string(),
      dnd_end: z.string(),
      daily_new_limit: z.number(),
      daily_review_limit: z.number(),
      session_size: z.number(),
      reminders_enabled: z.boolean(),
      reminder_times: z.array(z.string()),
      algorithm: z.string(),
      locale: z.string(),
      created_at: z.string().optional(),
      updated_at: z.string().optional(),
    }),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info('🔧 [GetUserSettings] Starting to retrieve user settings with params:', {
      user_id: context.user_id
    });

    try {
      const pool = getPool();
      
      // First try to get existing settings
      let result = await pool.query(`
        SELECT * FROM prefs WHERE user_id = $1
      `, [context.user_id]);

      let settings: UserSettings;

      if (result.rows.length === 0) {
        // Create default settings for new user
        logger?.info('📝 [GetUserSettings] Creating default settings for new user');
        
        const defaultSettings = {
          user_id: context.user_id,
          chat_id: String(context.user_id),
          timezone: 'Europe/Stockholm',
          dnd_start: '22:00',
          dnd_end: '07:00',
          daily_new_limit: 20,
          daily_review_limit: 200,
          session_size: 10,
          reminders_enabled: true,
          reminder_times: ['09:00', '14:00', '19:00'],
          algorithm: 'sm2',
          locale: 'en',
        };

        result = await pool.query(`
          INSERT INTO prefs (
            user_id, chat_id, timezone, dnd_start, dnd_end, 
            daily_new_limit, daily_review_limit, session_size,
            reminders_enabled, reminder_times, algorithm, locale
          ) 
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          RETURNING *
        `, [
          defaultSettings.user_id,
          defaultSettings.chat_id,
          defaultSettings.timezone,
          formatTimeForDB(defaultSettings.dnd_start),
          formatTimeForDB(defaultSettings.dnd_end),
          defaultSettings.daily_new_limit,
          defaultSettings.daily_review_limit,
          defaultSettings.session_size,
          defaultSettings.reminders_enabled,
          defaultSettings.reminder_times.map(formatTimeForDB),
          defaultSettings.algorithm,
          defaultSettings.locale,
        ]);

        settings = {
          ...defaultSettings,
          created_at: result.rows[0].created_at,
          updated_at: result.rows[0].updated_at,
        };
      } else {
        const row = result.rows[0];
        settings = {
          user_id: row.user_id,
          chat_id: row.chat_id,
          timezone: row.timezone || 'Europe/Stockholm',
          dnd_start: formatTimeFromDB(row.dnd_start) || '22:00',
          dnd_end: formatTimeFromDB(row.dnd_end) || '07:00',
          daily_new_limit: row.daily_new_limit || 20,
          daily_review_limit: row.daily_review_limit || 200,
          session_size: row.session_size || 10,
          reminders_enabled: row.reminders_enabled !== false,
          reminder_times: Array.isArray(row.reminder_times) 
            ? row.reminder_times.map((time: string) => formatTimeFromDB(time))
            : ['09:00', '14:00', '19:00'],
          algorithm: row.algorithm || 'sm2',
          locale: row.locale || 'en',
          created_at: row.created_at,
          updated_at: row.updated_at,
        };
      }

      logger?.info('✅ [GetUserSettings] Successfully retrieved user settings:', {
        user_id: settings.user_id,
        session_size: settings.session_size,
        daily_limits: {
          new: settings.daily_new_limit,
          review: settings.daily_review_limit
        },
        reminders_enabled: settings.reminders_enabled,
        algorithm: settings.algorithm
      });

      return {
        success: true,
        settings: {
          user_id: settings.user_id,
          chat_id: settings.chat_id,
          timezone: settings.timezone,
          dnd_start: settings.dnd_start,
          dnd_end: settings.dnd_end,
          daily_new_limit: settings.daily_new_limit,
          daily_review_limit: settings.daily_review_limit,
          session_size: settings.session_size,
          reminders_enabled: settings.reminders_enabled,
          reminder_times: settings.reminder_times,
          algorithm: settings.algorithm,
          locale: settings.locale,
          created_at: settings.created_at?.toISOString(),
          updated_at: settings.updated_at?.toISOString(),
        },
        message: `Successfully retrieved settings for user ${context.user_id}`
      };
    } catch (error) {
      logger?.error('❌ [GetUserSettings] Error retrieving user settings:', {
        error: error instanceof Error ? error.message : String(error),
        user_id: context.user_id
      });
      
      return {
        success: false,
        settings: {
          user_id: context.user_id,
          chat_id: String(context.user_id),
          timezone: 'Europe/Stockholm',
          dnd_start: '22:00',
          dnd_end: '07:00',
          daily_new_limit: 20,
          daily_review_limit: 200,
          session_size: 10,
          reminders_enabled: true,
          reminder_times: ['09:00', '14:00', '19:00'],
          algorithm: 'sm2',
          locale: 'en',
        },
        message: `Error retrieving settings: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
});

// ===============================
// Update Session Settings Tool
// ===============================

export const updateSessionSettingsTool = createTool({
  id: "update-session-settings-tool",
  description: `Update session-related settings including session size, daily limits for new and review cards`,
  inputSchema: z.object({
    user_id: z.coerce.number().describe("User identifier"),
    session_size: z.number().min(1).max(100).optional().describe("Number of cards per review session (1-100)"),
    daily_new_limit: z.number().min(0).max(1000).optional().describe("Maximum new cards per day (0-1000)"),
    daily_review_limit: z.number().min(0).max(1000).optional().describe("Maximum review cards per day (0-1000)"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    updated_settings: z.object({
      session_size: z.number(),
      daily_new_limit: z.number(),
      daily_review_limit: z.number(),
    }),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info('🔧 [UpdateSessionSettings] Starting session settings update with params:', context);

    try {
      const pool = getPool();

      // Build dynamic update query
      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (context.session_size !== undefined) {
        updates.push(`session_size = $${paramIndex++}`);
        values.push(context.session_size);
      }
      if (context.daily_new_limit !== undefined) {
        updates.push(`daily_new_limit = $${paramIndex++}`);
        values.push(context.daily_new_limit);
      }
      if (context.daily_review_limit !== undefined) {
        updates.push(`daily_review_limit = $${paramIndex++}`);
        values.push(context.daily_review_limit);
      }

      if (updates.length === 0) {
        return {
          success: false,
          updated_settings: { session_size: 10, daily_new_limit: 20, daily_review_limit: 200 },
          message: "No session settings to update"
        };
      }

      // Add user_id parameter
      values.push(context.user_id);

      const query = `
        UPDATE prefs 
        SET ${updates.join(', ')}, updated_at = now()
        WHERE user_id = $${paramIndex}
        RETURNING session_size, daily_new_limit, daily_review_limit
      `;

      logger?.info('📝 [UpdateSessionSettings] Executing update query:', { 
        updates: updates.length,
        user_id: context.user_id 
      });

      const result = await pool.query(query, values);

      if (result.rows.length === 0) {
        return {
          success: false,
          updated_settings: { session_size: 10, daily_new_limit: 20, daily_review_limit: 200 },
          message: "User settings not found"
        };
      }

      const updatedSettings = result.rows[0];
      
      logger?.info('✅ [UpdateSessionSettings] Successfully updated session settings:', {
        user_id: context.user_id,
        session_size: updatedSettings.session_size,
        daily_new_limit: updatedSettings.daily_new_limit,
        daily_review_limit: updatedSettings.daily_review_limit
      });

      return {
        success: true,
        updated_settings: {
          session_size: updatedSettings.session_size,
          daily_new_limit: updatedSettings.daily_new_limit,
          daily_review_limit: updatedSettings.daily_review_limit,
        },
        message: `Successfully updated session settings for user ${context.user_id}`
      };
    } catch (error) {
      logger?.error('❌ [UpdateSessionSettings] Error updating session settings:', {
        error: error instanceof Error ? error.message : String(error),
        user_id: context.user_id
      });
      
      return {
        success: false,
        updated_settings: { session_size: 10, daily_new_limit: 20, daily_review_limit: 200 },
        message: `Error updating session settings: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
});

// ===============================
// Update Algorithm Settings Tool
// ===============================

export const updateAlgorithmSettingsTool = createTool({
  id: "update-algorithm-settings-tool",
  description: `Update spaced repetition algorithm settings and preferences`,
  inputSchema: z.object({
    user_id: z.coerce.number().describe("User identifier"),
    algorithm: z.enum(['sm2']).optional().describe("Spaced repetition algorithm (currently only 'sm2' supported)"),
    locale: z.string().optional().describe("User interface language preference (e.g., 'en', 'sv', 'de')"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    updated_settings: z.object({
      algorithm: z.string(),
      locale: z.string(),
    }),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info('🔧 [UpdateAlgorithmSettings] Starting algorithm settings update with params:', context);

    try {
      const pool = getPool();

      // Build dynamic update query
      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (context.algorithm !== undefined) {
        updates.push(`algorithm = $${paramIndex++}`);
        values.push(context.algorithm);
      }
      if (context.locale !== undefined) {
        updates.push(`locale = $${paramIndex++}`);
        values.push(context.locale);
      }

      if (updates.length === 0) {
        return {
          success: false,
          updated_settings: { algorithm: 'sm2', locale: 'en' },
          message: "No algorithm settings to update"
        };
      }

      // Add user_id parameter
      values.push(context.user_id);

      const query = `
        UPDATE prefs 
        SET ${updates.join(', ')}, updated_at = now()
        WHERE user_id = $${paramIndex}
        RETURNING algorithm, locale
      `;

      logger?.info('📝 [UpdateAlgorithmSettings] Executing update query:', { 
        updates: updates.length,
        user_id: context.user_id 
      });

      const result = await pool.query(query, values);

      if (result.rows.length === 0) {
        return {
          success: false,
          updated_settings: { algorithm: 'sm2', locale: 'en' },
          message: "User settings not found"
        };
      }

      const updatedSettings = result.rows[0];
      
      logger?.info('✅ [UpdateAlgorithmSettings] Successfully updated algorithm settings:', {
        user_id: context.user_id,
        algorithm: updatedSettings.algorithm,
        locale: updatedSettings.locale
      });

      return {
        success: true,
        updated_settings: {
          algorithm: updatedSettings.algorithm,
          locale: updatedSettings.locale,
        },
        message: `Successfully updated algorithm settings for user ${context.user_id}`
      };
    } catch (error) {
      logger?.error('❌ [UpdateAlgorithmSettings] Error updating algorithm settings:', {
        error: error instanceof Error ? error.message : String(error),
        user_id: context.user_id
      });
      
      return {
        success: false,
        updated_settings: { algorithm: 'sm2', locale: 'en' },
        message: `Error updating algorithm settings: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
});

// ===============================
// Update Reminder Settings Tool
// ===============================

export const updateReminderSettingsAdvancedTool = createTool({
  id: "update-reminder-settings-advanced-tool",
  description: `Update reminder settings including enabled status, reminder times, do not disturb periods, and timezone`,
  inputSchema: z.object({
    user_id: z.coerce.number().describe("User identifier"),
    reminders_enabled: z.boolean().optional().describe("Whether reminders are enabled"),
    reminder_times: z.array(z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)).optional().describe("List of reminder times in HH:MM format"),
    dnd_start: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).optional().describe("Do not disturb start time in HH:MM format"),
    dnd_end: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).optional().describe("Do not disturb end time in HH:MM format"),
    timezone: z.string().optional().describe("User timezone (e.g., 'Europe/Stockholm', 'America/New_York')"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    updated_settings: z.object({
      reminders_enabled: z.boolean(),
      reminder_times: z.array(z.string()),
      dnd_start: z.string(),
      dnd_end: z.string(),
      timezone: z.string(),
    }),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info('🔧 [UpdateReminderSettings] Starting reminder settings update with params:', context);

    try {
      const pool = getPool();

      // Build dynamic update query
      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (context.reminders_enabled !== undefined) {
        updates.push(`reminders_enabled = $${paramIndex++}`);
        values.push(context.reminders_enabled);
      }
      if (context.reminder_times !== undefined) {
        updates.push(`reminder_times = $${paramIndex++}`);
        values.push(context.reminder_times.map(formatTimeForDB));
      }
      if (context.dnd_start !== undefined) {
        updates.push(`dnd_start = $${paramIndex++}`);
        values.push(formatTimeForDB(context.dnd_start));
      }
      if (context.dnd_end !== undefined) {
        updates.push(`dnd_end = $${paramIndex++}`);
        values.push(formatTimeForDB(context.dnd_end));
      }
      if (context.timezone !== undefined) {
        updates.push(`timezone = $${paramIndex++}`);
        values.push(context.timezone);
      }

      if (updates.length === 0) {
        return {
          success: false,
          updated_settings: { 
            reminders_enabled: true, 
            reminder_times: ['09:00', '14:00', '19:00'],
            dnd_start: '22:00',
            dnd_end: '07:00',
            timezone: 'Europe/Stockholm'
          },
          message: "No reminder settings to update"
        };
      }

      // Add user_id parameter
      values.push(context.user_id);

      const query = `
        UPDATE prefs 
        SET ${updates.join(', ')}, updated_at = now()
        WHERE user_id = $${paramIndex}
        RETURNING reminders_enabled, reminder_times, dnd_start, dnd_end, timezone
      `;

      logger?.info('📝 [UpdateReminderSettings] Executing update query:', { 
        updates: updates.length,
        user_id: context.user_id 
      });

      const result = await pool.query(query, values);

      if (result.rows.length === 0) {
        return {
          success: false,
          updated_settings: { 
            reminders_enabled: true, 
            reminder_times: ['09:00', '14:00', '19:00'],
            dnd_start: '22:00',
            dnd_end: '07:00',
            timezone: 'Europe/Stockholm'
          },
          message: "User settings not found"
        };
      }

      const updatedSettings = result.rows[0];
      
      logger?.info('✅ [UpdateReminderSettings] Successfully updated reminder settings:', {
        user_id: context.user_id,
        reminders_enabled: updatedSettings.reminders_enabled,
        reminder_times_count: updatedSettings.reminder_times?.length || 0,
        timezone: updatedSettings.timezone
      });

      return {
        success: true,
        updated_settings: {
          reminders_enabled: updatedSettings.reminders_enabled,
          reminder_times: Array.isArray(updatedSettings.reminder_times) 
            ? updatedSettings.reminder_times.map((time: string) => formatTimeFromDB(time))
            : ['09:00', '14:00', '19:00'],
          dnd_start: formatTimeFromDB(updatedSettings.dnd_start) || '22:00',
          dnd_end: formatTimeFromDB(updatedSettings.dnd_end) || '07:00',
          timezone: updatedSettings.timezone || 'Europe/Stockholm',
        },
        message: `Successfully updated reminder settings for user ${context.user_id}`
      };
    } catch (error) {
      logger?.error('❌ [UpdateReminderSettings] Error updating reminder settings:', {
        error: error instanceof Error ? error.message : String(error),
        user_id: context.user_id
      });
      
      return {
        success: false,
        updated_settings: { 
          reminders_enabled: true, 
          reminder_times: ['09:00', '14:00', '19:00'],
          dnd_start: '22:00',
          dnd_end: '07:00',
          timezone: 'Europe/Stockholm'
        },
        message: `Error updating reminder settings: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
});

// ===============================
// Reset Settings Tool
// ===============================

export const resetSettingsTool = createTool({
  id: "reset-settings-tool",
  description: `Reset user settings to default values, optionally preserving certain categories`,
  inputSchema: z.object({
    user_id: z.coerce.number().describe("User identifier"),
    preserve_reminders: z.boolean().default(false).describe("Whether to preserve current reminder settings"),
    preserve_session: z.boolean().default(false).describe("Whether to preserve current session settings"),
    preserve_algorithm: z.boolean().default(false).describe("Whether to preserve current algorithm settings"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    reset_settings: z.object({
      session_size: z.number(),
      daily_new_limit: z.number(),
      daily_review_limit: z.number(),
      reminders_enabled: z.boolean(),
      reminder_times: z.array(z.string()),
      dnd_start: z.string(),
      dnd_end: z.string(),
      timezone: z.string(),
      algorithm: z.string(),
      locale: z.string(),
    }),
    preserved_categories: z.array(z.string()),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info('🔧 [ResetSettings] Starting settings reset with params:', context);

    try {
      const pool = getPool();

      // First get current settings if we need to preserve some
      let currentSettings: any = {};
      const preservedCategories: string[] = [];
      
      if (context.preserve_reminders || context.preserve_session || context.preserve_algorithm) {
        const getCurrentResult = await pool.query(`SELECT * FROM prefs WHERE user_id = $1`, [context.user_id]);
        if (getCurrentResult.rows.length > 0) {
          currentSettings = getCurrentResult.rows[0];
        }
      }

      // Define default settings
      const defaults = {
        session_size: 10,
        daily_new_limit: 20,
        daily_review_limit: 200,
        reminders_enabled: true,
        reminder_times: ['09:00', '14:00', '19:00'].map(formatTimeForDB),
        dnd_start: formatTimeForDB('22:00'),
        dnd_end: formatTimeForDB('07:00'),
        timezone: 'Europe/Stockholm',
        algorithm: 'sm2',
        locale: 'en',
      };

      // Build update settings based on preservation options
      const finalSettings = { ...defaults };

      if (context.preserve_session && currentSettings.session_size !== undefined) {
        finalSettings.session_size = currentSettings.session_size;
        finalSettings.daily_new_limit = currentSettings.daily_new_limit;
        finalSettings.daily_review_limit = currentSettings.daily_review_limit;
        preservedCategories.push('session');
      }

      if (context.preserve_reminders && currentSettings.reminders_enabled !== undefined) {
        finalSettings.reminders_enabled = currentSettings.reminders_enabled;
        finalSettings.reminder_times = currentSettings.reminder_times || defaults.reminder_times;
        finalSettings.dnd_start = currentSettings.dnd_start || defaults.dnd_start;
        finalSettings.dnd_end = currentSettings.dnd_end || defaults.dnd_end;
        finalSettings.timezone = currentSettings.timezone || defaults.timezone;
        preservedCategories.push('reminders');
      }

      if (context.preserve_algorithm && currentSettings.algorithm !== undefined) {
        finalSettings.algorithm = currentSettings.algorithm;
        finalSettings.locale = currentSettings.locale || defaults.locale;
        preservedCategories.push('algorithm');
      }

      // Update or insert settings
      const query = `
        INSERT INTO prefs (
          user_id, chat_id, session_size, daily_new_limit, daily_review_limit,
          reminders_enabled, reminder_times, dnd_start, dnd_end, timezone,
          algorithm, locale
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (user_id) DO UPDATE SET
          session_size = EXCLUDED.session_size,
          daily_new_limit = EXCLUDED.daily_new_limit,
          daily_review_limit = EXCLUDED.daily_review_limit,
          reminders_enabled = EXCLUDED.reminders_enabled,
          reminder_times = EXCLUDED.reminder_times,
          dnd_start = EXCLUDED.dnd_start,
          dnd_end = EXCLUDED.dnd_end,
          timezone = EXCLUDED.timezone,
          algorithm = EXCLUDED.algorithm,
          locale = EXCLUDED.locale,
          updated_at = now()
        RETURNING *
      `;

      logger?.info('📝 [ResetSettings] Executing reset with preserved categories:', preservedCategories);

      const result = await pool.query(query, [
        context.user_id,
        context.user_id,
        finalSettings.session_size,
        finalSettings.daily_new_limit,
        finalSettings.daily_review_limit,
        finalSettings.reminders_enabled,
        finalSettings.reminder_times,
        finalSettings.dnd_start,
        finalSettings.dnd_end,
        finalSettings.timezone,
        finalSettings.algorithm,
        finalSettings.locale,
      ]);

      const resetSettings = result.rows[0];

      logger?.info('✅ [ResetSettings] Successfully reset settings:', {
        user_id: context.user_id,
        preserved_categories: preservedCategories,
        session_size: resetSettings.session_size
      });

      return {
        success: true,
        reset_settings: {
          session_size: resetSettings.session_size,
          daily_new_limit: resetSettings.daily_new_limit,
          daily_review_limit: resetSettings.daily_review_limit,
          reminders_enabled: resetSettings.reminders_enabled,
          reminder_times: Array.isArray(resetSettings.reminder_times) 
            ? resetSettings.reminder_times.map((time: string) => formatTimeFromDB(time))
            : ['09:00', '14:00', '19:00'],
          dnd_start: formatTimeFromDB(resetSettings.dnd_start) || '22:00',
          dnd_end: formatTimeFromDB(resetSettings.dnd_end) || '07:00',
          timezone: resetSettings.timezone,
          algorithm: resetSettings.algorithm,
          locale: resetSettings.locale,
        },
        preserved_categories: preservedCategories,
        message: `Successfully reset settings to defaults${preservedCategories.length > 0 ? ` (preserved: ${preservedCategories.join(', ')})` : ''}`
      };
    } catch (error) {
      logger?.error('❌ [ResetSettings] Error resetting settings:', {
        error: error instanceof Error ? error.message : String(error),
        user_id: context.user_id
      });
      
      return {
        success: false,
        reset_settings: {
          session_size: 10,
          daily_new_limit: 20,
          daily_review_limit: 200,
          reminders_enabled: true,
          reminder_times: ['09:00', '14:00', '19:00'],
          dnd_start: '22:00',
          dnd_end: '07:00',
          timezone: 'Europe/Stockholm',
          algorithm: 'sm2',
          locale: 'en',
        },
        preserved_categories: [],
        message: `Error resetting settings: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
});