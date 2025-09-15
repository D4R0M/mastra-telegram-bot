import { z } from "zod";
import { createStep } from "../../steps/core/createStep.js";
import { processCommand } from "../../mastra/commandParser.js";
import {
  getConversationState,
  saveConversationState,
} from "../../mastra/conversationStateStorage.js";

export const useCommandParserStep = createStep({
  id: "use-command-parser",
  description: "Process message using deterministic command parser",
  inputSchema: z.object({
    message: z.string().describe("The user's message content"),
    threadId: z.string().describe("Unique thread identifier for conversation context"),
    owner_id: z.string().describe("User ID for personalization and data access"),
    chatId: z.string().describe("Telegram chat ID to pass through to next step"),
    messageId: z
      .string()
      .optional()
      .describe("Original message ID to pass through to next step"),
  }),
  outputSchema: z.object({
    response: z.string().describe("The parser's response to send back to user"),
    chatId: z.string().describe("Telegram chat ID to pass through to next step"),
    messageId: z
      .string()
      .optional()
      .describe("Original message ID to pass through to next step"),
    inline_keyboard: z.any().optional().describe("Inline keyboard markup for Telegram"),
    reply_keyboard: z.any().optional().describe("Reply keyboard markup for Telegram"),
    parse_mode: z.string().optional().describe("Parse mode for Telegram message"),
    remove_keyboard: z
      .boolean()
      .optional()
      .describe("Flag to remove custom keyboard"),
  }),

  execute: async ({ inputData, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info("🤖 [UseCommandParserStep] Starting command parser step", {
      message: inputData.message,
      threadId: inputData.threadId,
      owner_id: inputData.owner_id,
    });

    try {
      const { state: existingState, expired } = await getConversationState(
        inputData.owner_id,
      );

      const result = await processCommand(
        inputData.message,
        inputData.owner_id,
        inputData.chatId,
        existingState,
        mastra,
        expired,
      );

      if (result.conversationState !== existingState) {
        await saveConversationState(
          inputData.owner_id,
          result.conversationState,
        );
      }

      return {
        response: result.response,
        chatId: inputData.chatId,
        messageId: inputData.messageId,
        inline_keyboard: result.inline_keyboard,
        reply_keyboard: result.reply_keyboard,
        parse_mode: result.parse_mode || "HTML",
        remove_keyboard: result.remove_keyboard,
      };
    } catch (error) {
      logger?.error("❌ [UseCommandParserStep] Error processing command:", {
        error: error instanceof Error ? error.message : String(error),
        threadId: inputData.threadId,
        owner_id: inputData.owner_id,
      });

      return {
        response:
          "❌ Error processing your command. Please try again or use /help for available commands.",
        chatId: inputData.chatId,
        messageId: inputData.messageId,
        parse_mode: "HTML",
      };
    }
  },
});
