import { createTool } from "@mastra/core/tools";
import type { IMastraLogger } from "@mastra/core/logger";
import { z } from "zod";
import { getPool } from "../../db/client.js";
import type { PoolClient } from 'pg';

interface ReminderSettings {
  user_id: string;
  enabled: boolean;
  preferred_times: string[]; // Array of times in HH:MM format
  dnd_start: string; // Do Not Disturb start time (HH:MM)
  dnd_end: string; // Do Not Disturb end time (HH:MM)
  timezone: string;
  created_at: Date;
  updated_at: Date;
}

// Helper function to convert TIME format from DB (HH:MM:SS) to expected format (HH:MM)
function formatTimeFromDB(dbTime: string): string {
  if (!dbTime) return '00:00';
  // DB returns HH:MM:SS, we need HH:MM
  return dbTime.split(':').slice(0, 2).join(':');
}

// Helper function to get current time in HH:MM format for specified timezone
// Uses proper Intl.DateTimeFormat.formatToParts to avoid double timezone offset
function getCurrentTimeInTimezone(timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(new Date());
  
  const hour = parts.find(part => part.type === 'hour')?.value || '00';
  const minute = parts.find(part => part.type === 'minute')?.value || '00';
  return `${hour}:${minute}`;
}

// Helper function to check if current time is in Do Not Disturb period
function isInDNDPeriod(dndStart: string, dndEnd: string, timezone: string): boolean {
  const currentTime = getCurrentTimeInTimezone(timezone);
  
  // Normalize time formats (remove seconds if present)
  const normalizedDndStart = formatTimeFromDB(dndStart);
  const normalizedDndEnd = formatTimeFromDB(dndEnd);
  
  // Handle cases where DND spans midnight (e.g., 22:00 to 07:00)
  if (normalizedDndStart > normalizedDndEnd) {
    return currentTime >= normalizedDndStart || currentTime <= normalizedDndEnd;
  } else {
    return currentTime >= normalizedDndStart && currentTime <= normalizedDndEnd;
  }
}

// Helper function to check if current time is within 30 minutes of any preferred time
function isNearPreferredTime(preferredTimes: string[], timezone: string): { isNear: boolean; nearestTime?: string; minutesAway?: number } {
  if (!preferredTimes || preferredTimes.length === 0) {
    return { isNear: false };
  }

  const currentTime = getCurrentTimeInTimezone(timezone);
  const [currentHours, currentMinutes] = currentTime.split(':').map(Number);
  const currentTotalMinutes = currentHours * 60 + currentMinutes;
  
  let nearestTime: string | undefined;
  let minDistance = Infinity;
  
  for (const preferredTime of preferredTimes) {
    const normalizedTime = formatTimeFromDB(preferredTime);
    const [hours, minutes] = normalizedTime.split(':').map(Number);
    const preferredMinutes = hours * 60 + minutes;
    
    // Calculate distance in minutes, considering wrap-around at midnight
    let distance = Math.abs(currentTotalMinutes - preferredMinutes);
    if (distance > 720) { // 12 hours
      distance = 1440 - distance; // 24 hours - distance
    }
    
    if (distance < minDistance) {
      minDistance = distance;
      nearestTime = normalizedTime;
    }
  }
  
  const isWithin30Minutes = minDistance <= 30;
  return {
    isNear: isWithin30Minutes,
    nearestTime,
    minutesAway: Math.round(minDistance)
  };
}

// Get or create reminder settings for a user
export const getReminderSettingsTool = createTool({
  id: "get-reminder-settings-tool",
  description: `Get the current reminder settings for a user, including timezone preferences, Do Not Disturb periods, and preferred reminder times.`,
  inputSchema: z.object({
    user_id: z.string().describe("User ID to get reminder settings for"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    settings: z.object({
      user_id: z.string(),
      enabled: z.boolean(),
      preferred_times: z.array(z.string()),
      dnd_start: z.string(),
      dnd_end: z.string(),
      timezone: z.string(),
    }).optional(),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info('🔧 [GetReminderSettings] Starting reminder settings retrieval with params:', context);

    try {
      const pool = getPool();
      
      // First try to get existing settings
      let result = await pool.query(`
        SELECT * FROM prefs WHERE user_id = $1
      `, [context.user_id]);

      let settings: ReminderSettings;

      if (result.rows.length === 0) {
        // Create default settings for new user
        logger?.info('📝 [GetReminderSettings] Creating default reminder settings for new user');
        
        const defaultTimezone = 'Europe/Stockholm';
        const defaultSettings = {
          user_id: context.user_id,
          enabled: true,
          preferred_times: ['09:00', '14:00', '19:00'], // Morning, afternoon, evening
          dnd_start: '22:00', // 10 PM
          dnd_end: '07:00', // 7 AM
          timezone: defaultTimezone,
        };

        result = await pool.query(`
          INSERT INTO prefs (
            user_id, chat_id, reminders_enabled, reminder_times, dnd_start, dnd_end, timezone
          ) 
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *
        `, [
          defaultSettings.user_id,
          defaultSettings.user_id, // Use user_id as chat_id for now
          defaultSettings.enabled,
          defaultSettings.preferred_times, // PostgreSQL TIME[] array
          defaultSettings.dnd_start,
          defaultSettings.dnd_end,
          defaultSettings.timezone,
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
          enabled: row.reminders_enabled,
          preferred_times: Array.isArray(row.reminder_times) 
            ? row.reminder_times.map((time: string) => formatTimeFromDB(time))
            : ['09:00', '14:00', '19:00'],
          dnd_start: formatTimeFromDB(row.dnd_start) || '22:00',
          dnd_end: formatTimeFromDB(row.dnd_end) || '07:00',
          timezone: row.timezone || 'Europe/Stockholm',
          created_at: row.created_at,
          updated_at: row.updated_at,
        };
      }

      logger?.info('✅ [GetReminderSettings] Successfully retrieved reminder settings:', { 
        enabled: settings.enabled,
        timezone: settings.timezone,
        dnd_period: `${settings.dnd_start} - ${settings.dnd_end}`
      });

      return {
        success: true,
        settings: {
          user_id: settings.user_id,
          enabled: settings.enabled,
          preferred_times: settings.preferred_times,
          dnd_start: settings.dnd_start,
          dnd_end: settings.dnd_end,
          timezone: settings.timezone,
        },
        message: `Reminder settings loaded. Timezone: ${settings.timezone}, DND: ${settings.dnd_start}-${settings.dnd_end}`
      };

    } catch (error) {
      logger?.error('❌ [GetReminderSettings] Error retrieving reminder settings:', error);
      return {
        success: false,
        message: `Error retrieving reminder settings: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  },
});

// Update reminder settings
export const updateReminderSettingsTool = createTool({
  id: "update-reminder-settings-tool",
  description: `Update reminder settings including preferred times, Do Not Disturb periods, and reminder frequency.`,
  inputSchema: z.object({
    user_id: z.string().describe("User ID to update settings for"),
    enabled: z.boolean().optional().describe("Whether reminders are enabled"),
    preferred_times: z.array(z.string()).optional().describe("Preferred reminder times in HH:MM format (e.g., ['09:00', '14:00', '19:00'])"),
    dnd_start: z.string().optional().describe("Do Not Disturb start time in HH:MM format (e.g., '22:00')"),
    dnd_end: z.string().optional().describe("Do Not Disturb end time in HH:MM format (e.g., '07:00')"),
    timezone: z.string().optional().describe("User timezone (e.g., 'Europe/Stockholm', 'America/New_York')"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    updated_settings: z.object({
      enabled: z.boolean(),
      preferred_times: z.array(z.string()),
      dnd_start: z.string(),
      dnd_end: z.string(),
      timezone: z.string(),
    }).optional(),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info('🔧 [UpdateReminderSettings] Starting settings update with params:', context);

    try {
      const pool = getPool();
      
      // Build update query dynamically
      const updates: string[] = [];
      const values: unknown[] = [context.user_id];
      let paramIndex = 2;

      if (context.enabled !== undefined) {
        updates.push(`reminders_enabled = $${paramIndex}`);
        values.push(context.enabled);
        paramIndex++;
      }

      if (context.preferred_times !== undefined) {
        // Validate time format
        for (const time of context.preferred_times) {
          if (!/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time)) {
            return {
              success: false,
              message: `Invalid time format: ${time}. Use HH:MM format (e.g., '09:00', '14:30')`
            };
          }
        }
        updates.push(`reminder_times = $${paramIndex}`);
        values.push(context.preferred_times); // PostgreSQL TIME[] array
        paramIndex++;
      }

      if (context.dnd_start !== undefined) {
        if (!/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(context.dnd_start)) {
          return {
            success: false,
            message: `Invalid DND start time format: ${context.dnd_start}. Use HH:MM format`
          };
        }
        updates.push(`dnd_start = $${paramIndex}`);
        values.push(context.dnd_start);
        paramIndex++;
      }

      if (context.dnd_end !== undefined) {
        if (!/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(context.dnd_end)) {
          return {
            success: false,
            message: `Invalid DND end time format: ${context.dnd_end}. Use HH:MM format`
          };
        }
        updates.push(`dnd_end = $${paramIndex}`);
        values.push(context.dnd_end);
        paramIndex++;
      }

      if (context.timezone !== undefined) {
        // Basic timezone validation - check if it's a reasonable timezone string
        try {
          Intl.DateTimeFormat(undefined, { timeZone: context.timezone });
        } catch {
          return {
            success: false,
            message: `Invalid timezone: ${context.timezone}. Use standard timezone names like 'Europe/Stockholm'`
          };
        }
        updates.push(`timezone = $${paramIndex}`);
        values.push(context.timezone);
        paramIndex++;
      }

      if (updates.length === 0) {
        return {
          success: false,
          message: "No settings provided to update"
        };
      }

      // Add updated_at timestamp
      updates.push(`updated_at = CURRENT_TIMESTAMP`);

      const query = `
        UPDATE prefs 
        SET ${updates.join(', ')}
        WHERE user_id = $1
        RETURNING *
      `;

      const result = await pool.query(query, values);

      if (result.rows.length === 0) {
        return {
          success: false,
          message: "User preferences not found. Please get settings first to create them."
        };
      }

      const row = result.rows[0];
      const updatedSettings = {
        enabled: row.reminders_enabled,
        preferred_times: Array.isArray(row.reminder_times) 
          ? row.reminder_times.map((time: string) => formatTimeFromDB(time))
          : ['09:00', '14:00', '19:00'],
        dnd_start: formatTimeFromDB(row.dnd_start),
        dnd_end: formatTimeFromDB(row.dnd_end),
        timezone: row.timezone || 'Europe/Stockholm',
      };

      logger?.info('✅ [UpdateReminderSettings] Settings updated successfully:', updatedSettings);

      return {
        success: true,
        updated_settings: updatedSettings,
        message: `Reminder settings updated successfully. Timezone: ${updatedSettings.timezone}, DND period: ${updatedSettings.dnd_start}-${updatedSettings.dnd_end}`
      };

    } catch (error) {
      logger?.error('❌ [UpdateReminderSettings] Error updating settings:', error);
      return {
        success: false,
        message: `Error updating reminder settings: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  },
});

// Check if it's appropriate to send a reminder now
export const checkReminderTimeTool = createTool({
  id: "check-reminder-time-tool",
  description: `Check if the current time is appropriate for sending a reminder based on user's timezone, Do Not Disturb settings, and reminder frequency limits.`,
  inputSchema: z.object({
    user_id: z.string().describe("User ID to check reminder timing for"),
    force_check: z.boolean().default(false).describe("Override interval checks (for testing)"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    should_send_reminder: z.boolean(),
    current_time_user_timezone: z.string(),
    reason: z.string(),
    next_opportunity: z.string().optional(),
    settings_summary: z.object({
      enabled: z.boolean(),
      in_dnd_period: z.boolean(),
      dnd_period: z.string(),
      preferred_times: z.array(z.string()),
    }).optional(),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info('🔧 [CheckReminderTime] Starting reminder time check with params:', context);

    try {
      // Get user settings directly from database
      const pool = getPool();
      const result = await pool.query(`
        SELECT * FROM prefs WHERE user_id = $1
      `, [context.user_id]);

      let settings;
      if (result.rows.length === 0) {
        // Create default settings if user not found
        const defaultTimezone = 'Europe/Stockholm';
        const defaultResult = await pool.query(`
          INSERT INTO prefs (user_id, chat_id, reminders_enabled, reminder_times, dnd_start, dnd_end, timezone) 
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *
        `, [context.user_id, context.user_id, true, ['09:00', '14:00', '19:00'], '22:00', '07:00', defaultTimezone]);
        
        const row = defaultResult.rows[0];
        settings = {
          enabled: row.reminders_enabled,
          preferred_times: row.reminder_times ? row.reminder_times.map((time: string) => formatTimeFromDB(time)) : ['09:00', '14:00', '19:00'],
          dnd_start: formatTimeFromDB(row.dnd_start) || '22:00',
          dnd_end: formatTimeFromDB(row.dnd_end) || '07:00',
          timezone: row.timezone || defaultTimezone,
        };
      } else {
        const row = result.rows[0];
        settings = {
          enabled: row.reminders_enabled,
          preferred_times: row.reminder_times ? row.reminder_times.map((time: string) => formatTimeFromDB(time)) : ['09:00', '14:00', '19:00'],
          dnd_start: formatTimeFromDB(row.dnd_start) || '22:00',
          dnd_end: formatTimeFromDB(row.dnd_end) || '07:00',
          timezone: row.timezone || 'Europe/Stockholm',
        };
      }

      const currentTimeStr = getCurrentTimeInTimezone(settings.timezone);
      
      logger?.info('📝 [CheckReminderTime] Checking reminder conditions:', {
        current_time: currentTimeStr,
        enabled: settings.enabled,
        dnd_period: `${settings.dnd_start} - ${settings.dnd_end}`
      });

      // Check if reminders are enabled
      if (!settings.enabled) {
        return {
          success: true,
          should_send_reminder: false,
          current_time_user_timezone: currentTimeStr,
          reason: "Reminders are disabled for this user",
          settings_summary: {
            enabled: settings.enabled,
            in_dnd_period: false,
            dnd_period: `${settings.dnd_start} - ${settings.dnd_end}`,
            preferred_times: settings.preferred_times,
          },
          message: "Reminders are currently disabled"
        };
      }

      // Check Do Not Disturb period
      const inDNDPeriod = isInDNDPeriod(settings.dnd_start, settings.dnd_end, settings.timezone);
      if (inDNDPeriod) {
        return {
          success: true,
          should_send_reminder: false,
          current_time_user_timezone: currentTimeStr,
          reason: `Currently in Do Not Disturb period (${settings.dnd_start} - ${settings.dnd_end})`,
          next_opportunity: settings.dnd_end,
          settings_summary: {
            enabled: settings.enabled,
            in_dnd_period: inDNDPeriod,
            dnd_period: `${settings.dnd_start} - ${settings.dnd_end}`,
            preferred_times: settings.preferred_times,
          },
          message: `In Do Not Disturb period until ${settings.dnd_end}`
        };
      }

      // Check if current time is near any preferred time (within 30 minutes)
      // Skip this check if force_check is enabled
      const preferredTimeCheck = isNearPreferredTime(settings.preferred_times, settings.timezone);
      if (!context.force_check && !preferredTimeCheck.isNear) {
        return {
          success: true,
          should_send_reminder: false,
          current_time_user_timezone: currentTimeStr,
          reason: `Not within 30 minutes of any preferred time. Nearest: ${preferredTimeCheck.nearestTime} (${preferredTimeCheck.minutesAway} minutes away)`,
          next_opportunity: preferredTimeCheck.nearestTime,
          settings_summary: {
            enabled: settings.enabled,
            in_dnd_period: inDNDPeriod,
            dnd_period: `${settings.dnd_start} - ${settings.dnd_end}`,
            preferred_times: settings.preferred_times,
          },
          message: `Outside preferred reminder window. Next opportunity: ${preferredTimeCheck.nearestTime}`
        };
      }

      // All checks passed - appropriate time for reminder
      const reasonMessage = context.force_check 
        ? "Force check enabled - bypassing preferred time restrictions"
        : `All timing conditions met - within ${preferredTimeCheck.minutesAway} minutes of preferred time ${preferredTimeCheck.nearestTime}`;

      logger?.info('✅ [CheckReminderTime] Reminder timing is appropriate:', { 
        current_time: currentTimeStr,
        not_in_dnd: !inDNDPeriod,
        force_check: context.force_check,
        near_preferred_time: preferredTimeCheck.isNear,
        nearest_time: preferredTimeCheck.nearestTime,
        minutes_away: preferredTimeCheck.minutesAway
      });

      return {
        success: true,
        should_send_reminder: true,
        current_time_user_timezone: currentTimeStr,
        reason: reasonMessage,
        settings_summary: {
          enabled: settings.enabled,
          in_dnd_period: inDNDPeriod,
          dnd_period: `${settings.dnd_start} - ${settings.dnd_end}`,
          preferred_times: settings.preferred_times,
        },
        message: context.force_check 
          ? `Force check enabled - sending reminder at ${currentTimeStr}`
          : `Perfect time for a reminder! Current time: ${currentTimeStr}, near preferred time: ${preferredTimeCheck.nearestTime}`
      };

    } catch (error) {
      logger?.error('❌ [CheckReminderTime] Error checking reminder time:', error);
      return {
        success: false,
        should_send_reminder: false,
        current_time_user_timezone: getCurrentTimeInTimezone('Europe/Stockholm'),
        reason: "Error occurred while checking timing",
        message: `Error checking reminder timing: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  },
});

// Record that a reminder was sent (update last reminder timestamp)
export const recordReminderSentTool = createTool({
  id: "record-reminder-sent-tool",  
  description: `Record that a reminder was sent to update the last reminder timestamp for rate limiting.`,
  inputSchema: z.object({
    user_id: z.string().describe("User ID who received the reminder"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    timestamp: z.string().optional(),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info('🔧 [RecordReminderSent] Recording reminder sent with params:', context);

    try {
      const pool = getPool();
      const now = new Date();
      
      const result = await pool.query(`
        UPDATE prefs 
        SET updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $1
        RETURNING updated_at
      `, [context.user_id]);

      if (result.rows.length === 0) {
        return {
          success: false,
          message: "User preferences not found"
        };
      }

      const utcTime = now.toISOString();
      logger?.info('✅ [RecordReminderSent] Reminder timestamp recorded:', { 
        user_id: context.user_id,
        timestamp: utcTime 
      });

      return {
        success: true,
        timestamp: utcTime,
        message: `Reminder timestamp recorded at ${utcTime} UTC`
      };

    } catch (error) {
      logger?.error('❌ [RecordReminderSent] Error recording reminder:', error);
      return {
        success: false,
        message: `Error recording reminder: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  },
});