import type { ContentfulStatusCode } from "hono/utils/http-status";

import { registerApiRoute } from "../mastra/inngest";
import { Mastra } from "@mastra/core";

// Validation function for Telegram token - moved from import time to initialization time
function validateTelegramToken(logger?: any): boolean {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    if (process.env.NODE_ENV === 'production') {
      logger?.error("❌ TELEGRAM_BOT_TOKEN is required in production");
      return false;
    } else {
      logger?.warn("⚠️  TELEGRAM_BOT_TOKEN not set - Telegram integration will not work");
      return false;
    }
  }
  return true;
}

export type TriggerInfoTelegramOnNewMessage = {
  type: "telegram/message";
  params: {
    userName: string;
    message: string;
  };
  payload: any;
};

export function registerTelegramTrigger({
  triggerType,
  handler,
}: {
  triggerType: string;
  handler: (
    mastra: Mastra,
    triggerInfo: TriggerInfoTelegramOnNewMessage,
  ) => Promise<void>;
}) {
  // Only register webhook routes if not in polling mode
  if (process.env.USE_POLLING === 'true') {
    console.log('🔄 [Telegram] USE_POLLING=true, skipping webhook registration');
    return [];
  }

  return [
    registerApiRoute("/webhooks/telegram/action", {
      method: "POST",
      handler: async (c) => {
        const mastra = c.get("mastra");
        const logger = mastra.getLogger();
        
        // Validate token at request time, not import time
        if (!validateTelegramToken(logger)) {
          logger?.error("❌ [Telegram] Invalid configuration - missing TELEGRAM_BOT_TOKEN");
          return c.text("Configuration Error", 500);
        }

        try {
          const payload = await c.req.json();

          logger?.info("📝 [Telegram] payload", payload);

          await handler(mastra, {
            type: triggerType,
            params: {
              userName: payload.message.from.username,
              message: payload.message.text,
            },
            payload,
          } as TriggerInfoTelegramOnNewMessage);

          return c.text("OK", 200);
        } catch (error) {
          logger?.error("Error handling Telegram webhook:", error);
          return c.text("Internal Server Error", 500);
        }
      },
    }),
  ];
}
