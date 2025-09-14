import type { IMastraLogger } from "@mastra/core/logger";
import { buildToolExecCtx } from "./context.js";
import { addCardTool, editCardTool } from "./tools/vocabularyTools.js";
import { submitReviewTool } from "./tools/reviewTools.js";
import { importCSVTool, previewCSVTool } from "./tools/importExportTools.js";
import { commandRegistry } from "./commands/index.js";
import { formatCard } from "./commands/utils.js";
import { updateSessionSettingsTool } from "./tools/settingsTools.js";
import { updateReminderSettingsTool } from "./tools/reminderTools.js";
import { clearConversationState } from "./conversationStateStorage.js";

// ===============================
// Types and Interfaces
// ===============================

export interface ConversationState {
  mode?:
    | "add_card_guided"
    | "edit_card"
    | "review_session"
    | "import_csv"
    | "settings_menu"
    | "filter_cards";
  step?: number;
  data?: any;
  lastMessageTime?: number;
}

export interface CommandResponse {
  response: string;
  conversationState?: ConversationState;
  inline_keyboard?: any;
  reply_keyboard?: any;
  parse_mode?: "HTML" | "Markdown";
  edit_message_id?: string; // For editing previous message
  remove_keyboard?: boolean; // To remove keyboard after selection
}

export interface ParsedCommand {
  command: string;
  params: string[];
  rawParams?: string;
}

// ===============================
// Helper Functions
// ===============================

export function parseCommand(message: string): ParsedCommand | null {
  const trimmed = message.trim();

  // Check if it's a command (starts with /)
  if (!trimmed.startsWith("/")) {
    return null;
  }

  // Split command and parameters
  const parts = trimmed.split(/\s+/);
  let command = parts[0].toLowerCase();
  // Strip bot username if present (/start@botname)
  if (command.includes("@")) {
    command = command.split("@")[0];
  }
  const params = parts.slice(1);
  const rawParams = trimmed.substring(parts[0].length).trim();

  return {
    command,
    params,
    rawParams,
  };
}

// ===============================
// Conversation State Handlers
// ===============================

async function handleConversationState(
  message: string,
  userId: string,
  chatId: string,
  state: ConversationState,
  mastra?: any,
): Promise<CommandResponse> {
  const logger = mastra?.getLogger();

  // Handle different conversation modes
  switch (state.mode) {
    case "add_card_guided":
      return handleAddCardGuidedFlow(message, userId, state, mastra);

    case "review_session":
      return handleReviewSessionFlow(message, userId, state, mastra);

    case "edit_card":
      return handleEditCardFlow(message, userId, state, mastra);

    case "import_csv":
      return handleImportCSVFlow(message, userId, state, mastra);

    case "settings_menu":
      return handleSettingsMenuFlow(message, userId, state, mastra);

    default:
      // Clear unknown state
      return {
        response: "Session expired. Please start over with a command.",
        conversationState: undefined,
        parse_mode: "HTML",
      };
  }
}

async function handleAddCardGuidedFlow(
  message: string,
  userId: string,
  state: ConversationState,
  mastra?: any,
): Promise<CommandResponse> {
  const logger = mastra?.getLogger();

  if (!state.data) {
    state.data = {};
  }

  switch (state.step) {
    case 1: // Waiting for front side
      state.data.front = message.trim();
      return {
        response: `📝 Front: <b>${state.data.front}</b>\n\nNow enter the <b>back side</b> (translation/definition):`,
        conversationState: {
          mode: "add_card_guided",
          step: 2,
          data: state.data,
        },
        parse_mode: "HTML",
      };

    case 2: // Waiting for back side
      state.data.back = message.trim();
      return {
        response: `📝 Front: <b>${state.data.front}</b>\n📝 Back: <b>${state.data.back}</b>\n\nWould you like to add tags? (comma-separated, or type "skip"):`,
        conversationState: {
          mode: "add_card_guided",
          step: 3,
          data: state.data,
        },
        parse_mode: "HTML",
      };

    case 3: // Waiting for tags
      if (message.toLowerCase() !== "skip") {
        state.data.tags = message.trim();
      }
      return {
        response: `📝 Front: <b>${state.data.front}</b>\n📝 Back: <b>${state.data.back}</b>\n${state.data.tags ? `📝 Tags: <b>${state.data.tags}</b>` : ""}\n\nWould you like to add an example sentence? (or type "skip"):`,
        conversationState: {
          mode: "add_card_guided",
          step: 4,
          data: state.data,
        },
        parse_mode: "HTML",
      };

    case 4: // Waiting for example
      if (message.toLowerCase() !== "skip") {
        state.data.example = message.trim();
      }

      // Now create the card
      try {
        const { runtimeContext, tracingContext } = buildToolExecCtx(mastra, {
          requestId: userId,
        });
        const result = await addCardTool.execute({
          context: {
            owner_id: userId,
            front: state.data.front,
            back: state.data.back,
            tags: state.data.tags || "",
            example: state.data.example || undefined,
            lang_front: "sv",
            lang_back: "en",
          },
          runtimeContext,
          tracingContext,
          mastra,
        });

        if (result.success && result.card) {
          return {
            response: `✅ Card added successfully!\n\n${formatCard(result.card)}\n\nAdd another with /add or start practicing with /practice`,
            conversationState: undefined,
            parse_mode: "HTML",
          };
        } else {
          return {
            response: `❌ ${result.message}`,
            conversationState: undefined,
            parse_mode: "HTML",
          };
        }
      } catch (error) {
        logger?.error("❌ [CommandParser] Error in guided add:", error);
        return {
          response: "❌ Error adding card. Please try again with /add",
          conversationState: undefined,
          parse_mode: "HTML",
        };
      }

    default:
      return {
        response: "Session expired. Please start over with /add",
        conversationState: undefined,
        parse_mode: "HTML",
      };
  }
}

async function handleReviewSessionFlow(
  message: string,
  userId: string,
  state: ConversationState,
  mastra?: any,
): Promise<CommandResponse> {
  const logger = mastra?.getLogger();

  if (!state.data || !state.data.current_card) {
    return {
      response: "Review session expired. Start a new session with /practice",
      conversationState: undefined,
      parse_mode: "HTML",
    };
  }

  // Initialize tracking stats if missing
  if (state.data.correct_count === undefined) {
    state.data.correct_count = 0;
  }
  if (state.data.incorrect_count === undefined) {
    state.data.incorrect_count = 0;
  }
  if (state.data.session_start === undefined) {
    state.data.session_start = Date.now();
  }

  const normalized = message.toLowerCase().trim();

  // Check for exit commands
  if (normalized === "exit" || normalized === "quit" || normalized === "stop") {
    const total =
      (state.data.correct_count || 0) + (state.data.incorrect_count || 0);
    const accuracy =
      total > 0 ? Math.round((state.data.correct_count / total) * 100) : 0;
    const durationMs = Date.now() - (state.data.session_start || Date.now());
    const minutes = Math.floor(durationMs / 60000);
    const seconds = Math.floor((durationMs % 60000) / 1000);
    const durationStr = `${minutes}m ${seconds}s`;

    return {
      response: `👋 Review session ended. Great work!\n\n✅ Correct: ${state.data.correct_count}\n❌ Incorrect: ${state.data.incorrect_count}\nAccuracy: ${accuracy}%\n⏱️ Duration: ${durationStr}`,
      conversationState: undefined,
      parse_mode: "HTML",
    };
  }

  switch (state.step) {
    case 1: // Waiting for user attempt or "show"
      if (
        normalized === "show" ||
        normalized === "reveal" ||
        normalized === "s"
      ) {
        // Show the answer with inline keyboard buttons
        const card = state.data.current_card;
        const inline_keyboard = {
          inline_keyboard: [
            [
              {
                text: "❌ 0 Forgot",
                callback_data: `grade:0:${card.card_id || card.id}`,
              },
              {
                text: "😔 1 Wrong",
                callback_data: `grade:1:${card.card_id || card.id}`,
              },
            ],
            [
              {
                text: "😕 2 Hard",
                callback_data: `grade:2:${card.card_id || card.id}`,
              },
              {
                text: "🤔 3 Difficult",
                callback_data: `grade:3:${card.card_id || card.id}`,
              },
            ],
            [
              {
                text: "😊 4 Good",
                callback_data: `grade:4:${card.card_id || card.id}`,
              },
              {
                text: "😎 5 Easy",
                callback_data: `grade:5:${card.card_id || card.id}`,
              },
            ],
          ],
        };

        const newStateData = structuredClone(state.data);
        return {
          response: `💡 <b>Answer:</b> ${card.back}\n\n${card.example ? `<i>Example: ${card.example}</i>\n\n` : ""}How well did you recall this?`,
          conversationState: {
            mode: "review_session",
            step: 2,
            data: newStateData,
          },
          inline_keyboard,
          parse_mode: "HTML",
        };
      } else {
        // User attempted an answer, show the correct answer
        const card = state.data.current_card;
        const userAnswer = message.trim();
        const cardBack = card.back || "";
        const isCorrect = userAnswer.toLowerCase() === cardBack.toLowerCase();

        const inline_keyboard = {
          inline_keyboard: [
            [
              {
                text: "❌ 0 Forgot",
                callback_data: `grade:0:${card.card_id || card.id}`,
              },
              {
                text: "😔 1 Wrong",
                callback_data: `grade:1:${card.card_id || card.id}`,
              },
            ],
            [
              {
                text: "😕 2 Hard",
                callback_data: `grade:2:${card.card_id || card.id}`,
              },
              {
                text: "🤔 3 Difficult",
                callback_data: `grade:3:${card.card_id || card.id}`,
              },
            ],
            [
              {
                text: "😊 4 Good",
                callback_data: `grade:4:${card.card_id || card.id}`,
              },
              {
                text: "😎 5 Easy",
                callback_data: `grade:5:${card.card_id || card.id}`,
              },
            ],
          ],
        };

        const newStateData = structuredClone(state.data);
        return {
          response: `Your answer: <b>${userAnswer}</b>\nCorrect answer: <b>${cardBack}</b>\n\n${isCorrect ? "✅ Correct!" : "❌ Not quite."}\n\n${card.example ? `<i>Example: ${card.example}</i>\n\n` : ""}Rate your recall:`,
          conversationState: {
            mode: "review_session",
            step: 2,
            data: newStateData,
          },
          inline_keyboard,
          parse_mode: "HTML",
        };
      }

    case 2: // Waiting for grade
      const grade = parseInt(message.trim());

      if (isNaN(grade) || grade < 0 || grade > 5) {
        return {
          response: "❓ Please enter a grade between 0 and 5",
          conversationState: state,
          parse_mode: "HTML",
        };
      }

      // Submit the review
      try {
        const { runtimeContext, tracingContext } = buildToolExecCtx(mastra, {
          requestId: userId,
        });
        const result = await submitReviewTool.execute({
          context: {
            owner_id: userId,
            card_id:
              state.data.current_card.card_id || state.data.current_card.id,
            start_time: state.data.start_time || Date.now() - 10000,
            grade: grade,
            session_id: state.data.session_id,
          },
          runtimeContext,
          tracingContext,
          mastra,
        });

        if (result.success) {
          const wasCorrect = grade >= 3;
          const updatedCorrect =
            (state.data.correct_count || 0) + (wasCorrect ? 1 : 0);
          const updatedIncorrect =
            (state.data.incorrect_count || 0) + (wasCorrect ? 0 : 1);

          // Check if there are more cards in the session
          const nextIndex = (state.data.current_index || 1) + 1;
          const hasMoreCards =
            state.data.all_cards && nextIndex <= state.data.all_cards.length;

          if (hasMoreCards) {
            const nextCard = state.data.all_cards[nextIndex - 1];
            return {
              response: `${grade >= 3 ? "✅" : "📝"} Recorded (Grade: ${grade})\n\n<b>Card ${nextIndex}/${state.data.total_cards}</b>\n\n❓ <b>${nextCard.front}</b>\n\n<i>Try to recall the answer, then type your response or type \"show\" to reveal.</i>`,
              conversationState: {
                mode: "review_session",
                step: 1,
                data: {
                  session_id: state.data.session_id,
                  current_card: nextCard,
                  current_index: nextIndex,
                  total_cards: state.data.total_cards,
                  all_cards: state.data.all_cards,
                  start_time: Date.now(),
                  correct_count: updatedCorrect,
                  incorrect_count: updatedIncorrect,
                  session_start: state.data.session_start,
                },
              },
              parse_mode: "HTML",
            };
          } else {
            // Session complete
            const totalAnswered = updatedCorrect + updatedIncorrect;
            const accuracy =
              totalAnswered > 0
                ? Math.round((updatedCorrect / totalAnswered) * 100)
                : 0;
            const durationMs =
              Date.now() - (state.data.session_start || Date.now());
            const minutes = Math.floor(durationMs / 60000);
            const seconds = Math.floor((durationMs % 60000) / 1000);
            const durationStr = `${minutes}m ${seconds}s`;

            let summary = `🎉 <b>Session Complete!</b>\n\n${result.message}\n\n✅ Correct: ${updatedCorrect}\n❌ Incorrect: ${updatedIncorrect}\nAccuracy: ${accuracy}%\n⏱️ Duration: ${durationStr}`;

            try {
              const { getComprehensiveStatsTool } = await import(
                "./tools/statisticsTools.js"
              );
              const { runtimeContext, tracingContext } = buildToolExecCtx(
                mastra,
                { requestId: userId },
              );
              const stats = await getComprehensiveStatsTool.execute({
                context: {
                  owner_id: userId,
                  timezone: "Europe/Stockholm",
                  success_threshold: 3,
                },
                runtimeContext,
                tracingContext,
                mastra,
              });
              if (stats.success && stats.stats) {
                summary += `\n🔥 Current streak: ${
                  stats.stats.streaks?.current_streak || 0
                } days`;
              }
            } catch (err) {
              logger?.error("❌ [CommandParser] Error fetching stats:", err);
            }

            summary +=
              "\n\nGreat work! Come back tomorrow for more practice.\n\nUse /stats to see your progress.";

            return {
              response: summary,
              conversationState: undefined,
              parse_mode: "HTML",
            };
          }
        } else {
          return {
            response: `❌ ${result.message}`,
            conversationState: undefined,
            parse_mode: "HTML",
          };
        }
      } catch (error) {
        logger?.error("❌ [CommandParser] Error submitting review:", error);
        return {
          response: "❌ Error submitting review. Session ended.",
          conversationState: undefined,
          parse_mode: "HTML",
        };
      }

    default:
      return {
        response: "Review session error. Please start over with /practice",
        conversationState: undefined,
        parse_mode: "HTML",
      };
  }
}

async function handleEditCardFlow(
  message: string,
  userId: string,
  state: ConversationState,
  mastra?: any,
): Promise<CommandResponse> {
  const logger = mastra?.getLogger();

  if (!state.data || !state.data.card_id) {
    return {
      response: "Edit session expired. Please start over with /edit [card_id]",
      conversationState: undefined,
      parse_mode: "HTML",
    };
  }

  const normalized = message.toLowerCase().trim();

  // Parse edit commands
  let field = "";
  let value = "";

  if (normalized.startsWith("front:")) {
    field = "front";
    value = message.substring(6).trim();
  } else if (normalized.startsWith("back:")) {
    field = "back";
    value = message.substring(5).trim();
  } else if (normalized.startsWith("tags:")) {
    field = "tags";
    value = message.substring(5).trim();
  } else if (normalized.startsWith("example:")) {
    field = "example";
    value = message.substring(8).trim();
  } else if (["1", "2", "3", "4"].includes(normalized)) {
    // Number selection
    const fields = ["front", "back", "tags", "example"];
    field = fields[parseInt(normalized) - 1];
    return {
      response: `Enter the new value for <b>${field}</b>:`,
      conversationState: {
        mode: "edit_card",
        step: 2,
        data: {
          card_id: state.data.card_id,
          field: field,
        },
      },
      parse_mode: "HTML",
    };
  } else if (state.step === 2 && state.data.field) {
    // We're waiting for a value for a specific field
    field = state.data.field;
    value = message.trim();
  } else {
    return {
      response:
        "Please specify what to edit:\n<code>front: new text</code>\n<code>back: new text</code>\n<code>tags: tag1, tag2</code>\n<code>example: new example</code>\n\nOr reply with 1-4 to select a field.",
      conversationState: state,
      parse_mode: "HTML",
    };
  }

  // Execute the edit
  if (field && value) {
    try {
      const updateData: any = {};

      if (field === "tags") {
        updateData.tags = value
          .split(",")
          .map((t) => t.trim())
          .filter((t) => t);
      } else {
        updateData[field] = value;
      }

      const { runtimeContext, tracingContext } = buildToolExecCtx(mastra, {
        requestId: userId,
      });
      const result = await editCardTool.execute({
        context: {
          owner_id: userId,
          card_id: state.data.card_id,
          ...updateData,
        },
        runtimeContext,
        tracingContext,
        mastra,
      });

      if (result.success && result.card) {
        return {
          response: `✅ Card updated successfully!\n\n${formatCard(result.card)}\n\nUse /list to see all cards.`,
          conversationState: undefined,
          parse_mode: "HTML",
        };
      } else {
        return {
          response: `❌ ${result.message}`,
          conversationState: undefined,
          parse_mode: "HTML",
        };
      }
    } catch (error) {
      logger?.error("❌ [CommandParser] Error editing card:", error);
      return {
        response: "❌ Error editing card. Please try again.",
        conversationState: undefined,
        parse_mode: "HTML",
      };
    }
  }

  return {
    response: "Edit cancelled. Use /edit [card_id] to try again.",
    conversationState: undefined,
    parse_mode: "HTML",
  };
}

async function handleImportCSVFlow(
  message: string,
  userId: string,
  state: ConversationState,
  mastra?: any,
): Promise<CommandResponse> {
  const logger = mastra?.getLogger();

  // Check if message contains CSV data
  if (!message.includes(",") && !message.includes("\n")) {
    return {
      response:
        "Please paste your CSV data or send a CSV file. Format:\n<code>front,back,tags,example</code>",
      conversationState: state,
      parse_mode: "HTML",
    };
  }

  try {
    // First preview the CSV
    const { runtimeContext, tracingContext } = buildToolExecCtx(mastra, {
      requestId: userId,
    });
    const previewResult = await previewCSVTool.execute({
      context: {
        csv_data: message.trim(),
        has_headers: true,
        sample_size: 5,
      },
      runtimeContext,
      tracingContext,
      mastra,
    });

    if (!previewResult.success) {
      return {
        response: `❌ Invalid CSV format: ${previewResult.message}`,
        conversationState: undefined,
        parse_mode: "HTML",
      };
    }

    // Import the CSV
    const {
      runtimeContext: importRuntimeContext,
      tracingContext: importTracingContext,
    } = buildToolExecCtx(mastra, { requestId: userId });
    const importResult = await importCSVTool.execute({
      context: {
        owner_id: userId,
        csv_data: message.trim(),
        has_headers: true,
        default_lang_front: "sv",
        default_lang_back: "en",
        skip_duplicates: true,
      },
      runtimeContext: importRuntimeContext,
      tracingContext: importTracingContext,
      mastra,
    });

    if (importResult.success) {
      return {
        response: `✅ Import successful!\n\nImported: ${importResult.imported_count} cards\nSkipped: ${importResult.skipped_count} duplicates\n${importResult.errors && importResult.errors.length > 0 ? `\nErrors: ${importResult.errors.length}` : ""}\n\nUse /list to see your cards.`,
        conversationState: undefined,
        parse_mode: "HTML",
      };
    } else {
      return {
        response: `❌ Import failed: ${importResult.message}`,
        conversationState: undefined,
        parse_mode: "HTML",
      };
    }
  } catch (error) {
    logger?.error("❌ [CommandParser] Error importing CSV:", error);
    return {
      response:
        "❌ Error importing CSV. Please check the format and try again.",
      conversationState: undefined,
      parse_mode: "HTML",
    };
  }
}

// ===============================
// Settings Menu Flow
// ===============================

async function handleSettingsMenuFlow(
  message: string,
  userId: string,
  state: ConversationState,
  mastra?: any,
): Promise<CommandResponse> {
  const logger = mastra?.getLogger();

  const action = state.data?.action;
  const input = message.trim();

  if (state.step === 2 && action === "timezone") {
    // Validate timezone
    try {
      Intl.DateTimeFormat(undefined, { timeZone: input });
    } catch {
      return {
        response:
          "❌ Invalid timezone. Please provide a valid timezone like 'Europe/Stockholm'",
        conversationState: state,
        parse_mode: "HTML",
      };
    }

    try {
      const { runtimeContext, tracingContext } = buildToolExecCtx(mastra, {
        requestId: userId,
      });
      const result = await updateReminderSettingsTool.execute({
        context: {
          user_id: userId,
          timezone: input,
        },
        runtimeContext,
        tracingContext,
        mastra,
      });

      if (result.success) {
        return {
          response: `✅ Timezone updated to <b>${input}</b>`,
          conversationState: undefined,
          parse_mode: "HTML",
        };
      } else {
        return {
          response: `❌ ${result.message}`,
          conversationState: undefined,
          parse_mode: "HTML",
        };
      }
    } catch (error) {
      logger?.error("❌ [CommandParser] Error updating timezone:", error);
      return {
        response: "❌ Error updating timezone. Please try again.",
        conversationState: undefined,
        parse_mode: "HTML",
      };
    }
  }

  if (state.step === 2 && action === "session_size") {
    const size = parseInt(input, 10);
    if (isNaN(size) || size <= 0) {
      return {
        response: "❌ Please enter a valid number for session size",
        conversationState: state,
        parse_mode: "HTML",
      };
    }

    try {
      const { runtimeContext, tracingContext } = buildToolExecCtx(mastra, {
        requestId: userId,
      });
      const result = await updateSessionSettingsTool.execute({
        context: {
          user_id: userId,
          session_size: size,
        },
        runtimeContext,
        tracingContext,
        mastra,
      });

      if (result.success) {
        return {
          response: `✅ Session size updated to <b>${size}</b> cards`,
          conversationState: undefined,
          parse_mode: "HTML",
        };
      } else {
        return {
          response: `❌ ${result.message}`,
          conversationState: undefined,
          parse_mode: "HTML",
        };
      }
    } catch (error) {
      logger?.error("❌ [CommandParser] Error updating session size:", error);
      return {
        response: "❌ Error updating session size. Please try again.",
        conversationState: undefined,
        parse_mode: "HTML",
      };
    }
  }

  return {
    response: "Settings menu expired. Use /settings to open it again.",
    conversationState: undefined,
    parse_mode: "HTML",
  };
}

// ===============================
// Callback Handlers
// ===============================

export async function handleListCallback(
  action: string,
  cardId: string,
  userId: string,
  mastra?: any,
): Promise<CommandResponse> {
  const logger = mastra?.getLogger();

  if (action === "noop") {
    return { response: "", parse_mode: "HTML" };
  }

  if (action === "edit") {
    const state: ConversationState = {
      mode: "edit_card",
      step: 1,
      data: { card_id: cardId },
    };
    return handleEditCardFlow("", userId, state, mastra);
  }

  if (action === "delete") {
    const deleteHandler = commandRegistry["/delete"];
    if (deleteHandler) {
      return deleteHandler([cardId], cardId, userId, undefined, mastra);
    }
    return {
      response: "❌ Delete command not available",
      parse_mode: "HTML",
    };
  }

  if (action === "menu") {
    const inline_keyboard = {
      inline_keyboard: [
        [{ text: "✏️ Edit Word", callback_data: `list:edit:${cardId}` }],
        [{ text: "🗑 Delete", callback_data: `list:delete:${cardId}` }],
        [{ text: "📌 Add/Remove Tag", callback_data: `list:tag:${cardId}` }],
      ],
    };
    return {
      response: "Manage this card:",
      parse_mode: "HTML",
      inline_keyboard,
    };
  }

  if (action === "page" || action === "sort") {
    const [param, sort] = cardId.split(":");
    const offset =
      action === "page" ? parseInt(param) || 0 : parseInt(sort) || 0;
    const chosenSort = action === "page" ? sort || "date" : param;
    const listHandler = commandRegistry["/list"];
    if (listHandler) {
      const state: ConversationState = {
        mode: "list_view",
        step: 0,
        data: { offset, sort: chosenSort },
      };
      return listHandler([], "", userId, state, mastra);
    }
  }

  if (action === "tag") {
    return {
      response: "Tag management coming soon.",
      parse_mode: "HTML",
    };
  }

  if (action === "filter_tag" || action === "filter_search") {
    return {
      response: "Filtering coming soon.",
      parse_mode: "HTML",
    };
  }

  logger?.warn("Unknown list callback action", { action, cardId });
  return {
    response: "❌ Unknown action",
    parse_mode: "HTML",
  };
}

export async function handleSettingsCallback(
  action: string,
  userId: string,
  mastra?: any,
): Promise<CommandResponse> {
  const logger = mastra?.getLogger();

  try {
    if (action === "toggle_reminders") {
      const { getReminderSettingsTool } = await import(
        "./tools/reminderTools.js"
      );
      const { runtimeContext, tracingContext } = buildToolExecCtx(mastra, {
        requestId: userId,
      });
      const current = await getReminderSettingsTool.execute({
        context: { user_id: userId },
        runtimeContext,
        tracingContext,
        mastra,
      });
      if (current.success && current.settings) {
        const { updateReminderSettingsTool } = await import(
          "./tools/reminderTools.js"
        );
        const toggled = !current.settings.enabled;
        await updateReminderSettingsTool.execute({
          context: { user_id: userId, enabled: toggled },
          runtimeContext,
          tracingContext,
          mastra,
        });
        const settingsHandler = commandRegistry["/settings"];
        if (settingsHandler) {
          return settingsHandler([], "", userId, undefined, mastra);
        }
        return {
          response: toggled ? "✅ Reminders enabled" : "🔕 Reminders disabled",
          parse_mode: "HTML",
        };
      }
      return {
        response: `❌ ${current.message}`,
        parse_mode: "HTML",
      };
    }

    if (action === "change_timezone") {
      return {
        response: "🌍 Please enter your timezone (e.g., Europe/Stockholm)",
        conversationState: {
          mode: "settings_menu",
          step: 2,
          data: { action: "timezone" },
        },
        parse_mode: "HTML",
      };
    }

    if (action === "session_size") {
      return {
        response: "📚 Enter new session size (number of cards per session)",
        conversationState: {
          mode: "settings_menu",
          step: 2,
          data: { action: "session_size" },
        },
        parse_mode: "HTML",
      };
    }

    logger?.warn("Unknown settings callback action", { action });
    return { response: "❌ Unknown action", parse_mode: "HTML" };
  } catch (error) {
    logger?.error("settings_callback_error", {
      action,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      response: "❌ Error processing settings action",
      parse_mode: "HTML",
    };
  }
}

// ===============================
// Main Export Function
// ===============================

export async function processCommand(
  message: string,
  userId: string,
  chatId: string,
  conversationState?: ConversationState,
  mastra?: any,
  stateExpired: boolean = false,
): Promise<CommandResponse> {
  const logger = mastra?.getLogger();
  logger?.info("🔧 [CommandParser] Processing message:", {
    message: message.substring(0, 100),
    userId,
    hasState: !!conversationState,
  });

  if (stateExpired) {
    await clearConversationState(userId);
    return {
      response: "Session timed out—please start again with /add or /practice",
      conversationState: undefined,
      parse_mode: "HTML",
      remove_keyboard: true,
    };
  }

  // Handle special internal messages
  if (
    message === "__next_card__" &&
    conversationState?.mode === "review_session" &&
    conversationState.data?.current_card
  ) {
    const card = conversationState.data.current_card;
    const currentIndex = conversationState.data.current_index || 1;
    const totalCards = conversationState.data.all_cards?.length || 0;

    return {
      response: `📚 <b>Card ${currentIndex}/${totalCards}</b>\n\n<b>Front:</b> ${card.front}\n\n<i>Type your attempt, or reply "show" to reveal the answer</i>`,
      conversationState: conversationState,
      parse_mode: "HTML",
    };
  }

  if (message === "__session_complete__") {
    // Get stats from the database if possible
    try {
      const { getComprehensiveStatsTool } = await import(
        "./tools/statisticsTools.js"
      );
      const { runtimeContext, tracingContext } = buildToolExecCtx(mastra, {
        requestId: userId,
      });
      const stats = await getComprehensiveStatsTool.execute({
        context: {
          owner_id: userId,
          timezone: "Europe/Stockholm",
          success_threshold: 3,
        },
        runtimeContext,
        tracingContext,
        mastra,
      });

      return {
        response: `🎉 <b>Practice session complete!</b>\n\n${stats.success && stats.stats ? `🔥 Current streak: ${stats.stats.streaks?.current_streak || 0} days` : "Great job! Use /practice to review more cards."}`,
        conversationState: undefined,
        parse_mode: "HTML",
      };
    } catch (error) {
      return {
        response:
          "🎉 <b>Practice session complete!</b>\n\nGreat job! Use /practice to review more cards.",
        conversationState: undefined,
        parse_mode: "HTML",
      };
    }
  }

  // Parse the command early so slash commands override conversations
  const parsed = parseCommand(message);

  // Check if we're in the middle of a conversation flow
  if (conversationState && conversationState.mode && !parsed) {
    // Check for timeout (5 minutes)
    if (conversationState.lastMessageTime) {
      const timeDiff = Date.now() - conversationState.lastMessageTime;
      if (timeDiff > 5 * 60 * 1000) {
        logger?.info("📝 [CommandParser] Conversation state expired");
        conversationState = undefined;
      }
    }

    // If still valid, handle the conversation state
    if (conversationState) {
      return handleConversationState(
        message,
        userId,
        chatId,
        conversationState,
        mastra,
      );
    }
  } else if (parsed && conversationState) {
    // Clear conversation state when a new command is issued
    conversationState = undefined;
  }

  // If not a command and no active conversation, show help
  if (!parsed) {
    // Check for common non-command inputs
    const normalized = message.toLowerCase().trim();

    if (
      normalized === "help" ||
      normalized === "start" ||
      normalized === "hi" ||
      normalized === "hello"
    ) {
      const helpHandler = commandRegistry["/help"];
      if (helpHandler) {
        return helpHandler([], "", userId, undefined, mastra);
      }
    }

    // Check for quick-add patterns even without /add command
    if (message.includes("|") || message.includes("::")) {
      const addHandler = commandRegistry["/add"];
      if (addHandler) {
        return addHandler([], message, userId, undefined, mastra);
      }
    }

    return {
      response:
        "❓ I didn't understand that. Use /help to see available commands.\n\nTip: To add a card quickly, use:\n<code>/add word | translation</code>",
      parse_mode: "HTML",
    };
  }

  // Route to appropriate handler based on command
  const command = parsed.command;
  const params = parsed.params;
  const rawParams = parsed.rawParams || "";

  logger?.info("📝 [CommandParser] Parsed command:", { command, params });

  const handler = commandRegistry[command];
  if (handler) {
    return handler(params, rawParams, userId, conversationState, mastra);
  }

  return {
    response: `❓ Unknown command: ${command}\n\nUse /help to see available commands.`,
    parse_mode: "HTML",
  };
}
