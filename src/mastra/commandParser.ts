import type { IMastraLogger } from "@mastra/core/logger";
import type {
  CommandResponse,
  ConversationState,
  CommandContext,
} from "./commandTypes.js";
import { buildToolExecCtx } from "./context.js";
import { addCardTool, editCardTool } from "./tools/vocabularyTools.js";
import { startReviewTool, submitReviewTool } from "./tools/reviewTools.js";
import { importCSVTool, previewCSVTool } from "./tools/importExportTools.js";
import { commandRegistry } from "./commands/index.js";
import { isAdmin } from "./authorization.js";
import { formatCard } from "./commands/utils.js";
import {
  updateSessionSettingsTool,
  getUserSettingsTool,
  updateAlgorithmSettingsTool,
} from "./tools/settingsTools.js";
import { updateReminderSettingsTool } from "./tools/reminderTools.js";
import { parseReminderTimesInput } from "./utils/reminderTime.js";
import { clearConversationState } from "./conversationStateStorage.js";
import { logReviewEvent } from "../lib/mlLogger.js";

export type { CommandResponse, ConversationState, CommandContext } from "./commandTypes.js";

export interface ParsedCommand {
  command: string;
  params: string[];
  rawParams?: string;
}

const ADMIN_COMMANDS = new Set([
  "/users",
  "/allow",
  "/deny",
  "/invite",
  "/export_users",
  "/promote",
  "/demote",
  "/adminhelp",
]);

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

// Utility functions for fuzzy matching and normalization
function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function levenshtein(a: string, b: string): number {
  const matrix = Array.from({ length: a.length + 1 }, (_, i) =>
    Array(b.length + 1).fill(0),
  );
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[a.length][b.length];
}

function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

function tokenOverlap(a: string, b: string): number {
  const aTokens = a.split(/\s+/).filter(Boolean);
  const bTokens = b.split(/\s+/).filter(Boolean);
  if (!aTokens.length) return 0;
  const bSet = new Set(bTokens);
  let match = 0;
  for (const t of aTokens) {
    if (bSet.has(t)) match++;
  }
  return match / aTokens.length;
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

    case "filter_cards":
      return handleFilterCardsFlow(message, userId, state, mastra);

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
        const sessionIdForLogging =
          typeof state.data.session_id === "string"
            ? state.data.session_id
            : `session_${userId}`;
        const now = Date.now();
        state.data.ml_hints = (state.data.ml_hints ?? 0) + 1;
        const hintCount = state.data.ml_hints ?? 0;
        const hintLatency = now - (state.data.start_time ?? now);

        await logReviewEvent({
          mode: "telegram_inline",
          action: "hint_shown",
          session_id: sessionIdForLogging,
          attempt: state.data.ml_attempts ?? 0,
          hint_count: hintCount,
          latency_ms: hintLatency,
          userId,
          card_id: card.card_id || card.id,
          sm2_before: state.data.ml_sm2_before ?? null,
          client: "telegram",
          source: state.data.ml_source ?? "practice_inline",
          logger,
        });

        const progressLine = `Card ${state.data.current_index}/${state.data.total_cards}`;
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
          response: `${progressLine}\nFront: <b>${card.front}</b>\n\n💡 <b>Answer:</b> ${card.back}\n\n${card.example ? `<i>Example: ${card.example}</i>\n\n` : ""}How well did you recall this?`,
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
        const sessionIdForLogging =
          typeof state.data.session_id === "string"
            ? state.data.session_id
            : `session_${userId}`;
        const userAnswer = message.trim();
        state.data.ml_attempts = (state.data.ml_attempts ?? 0) + 1;
        const attemptCount = state.data.ml_attempts ?? 0;
        const hintCount = state.data.ml_hints ?? 0;
        const answerLatency = Date.now() - (state.data.start_time ?? Date.now());
        state.data.ml_answer_text = userAnswer;

        if (!state.data.ml_answer_logged) {
          const normalizedUserForLog = normalizeText(userAnswer);
          const normalizedBackForLog = normalizeText(card.back || "");
          const isExactForLog = normalizedUserForLog === normalizedBackForLog;
          const levForLog = levenshtein(normalizedUserForLog, normalizedBackForLog);
          const overlapForLog = tokenOverlap(normalizedUserForLog, normalizedBackForLog);
          await logReviewEvent({
            mode: "telegram_inline",
            action: "answered",
            session_id: sessionIdForLogging,
            attempt: attemptCount,
            hint_count: hintCount,
            latency_ms: answerLatency,
            userId,
            card_id: card.card_id || card.id,
            answer_text: userAnswer,
            is_correct: isExactForLog ? true : overlapForLog >= 0.5 ? null : false,
            sm2_before: state.data.ml_sm2_before ?? null,
            client: "telegram",
            source: state.data.ml_source ?? "practice_inline",
            logger,
          });
          state.data.ml_answer_logged = true;
        }

        const cardBack = card.back || "";
        const normalizedUser = normalizeText(userAnswer);
        const normalizedBack = normalizeText(cardBack);
        const isExact = normalizedUser === normalizedBack;
        const lev = levenshtein(normalizedUser, normalizedBack);
        const overlap = tokenOverlap(normalizedUser, normalizedBack);
        let feedback = "";
        if (isExact) {
          feedback = "✅ Correct!";
        } else if (lev <= 2) {
          feedback = "💡 Close! Just a small typo.";
        } else if (overlap >= 0.5) {
          feedback = "➡️ Partial meaning match — you decide the grade.";
        } else {
          feedback = "❌ Not quite.";
        }
        const progressLine = `Card ${state.data.current_index}/${state.data.total_cards}`;

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
          response: `${progressLine}\nFront: <b>${card.front}</b>\nYour answer: <b>${userAnswer}</b>\nCorrect: <b>${cardBack}</b>\n\n${feedback}\n\n${card.example ? `<i>Example: ${card.example}</i>\n\n` : ""}Select a grade:`,
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
      const sessionIdForLogging = state.data.session_id ?? `session_${userId}`;
      const mlSource = state.data.ml_source ?? "practice_inline";
      const hintCount = state.data.ml_hints ?? 0;
      const attemptForSubmit = Math.max(state.data.ml_attempts ?? 0, 1);

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
            grade,
            session_id: state.data.session_id,
            position_in_session: state.data.current_index,
            mode: "telegram_inline",
            client: "telegram",
            source: mlSource,
            attempt: attemptForSubmit,
            hint_count: hintCount,
            answer_text: state.data.ml_answer_text ?? undefined,
            log_answer_event: false,
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
          const newStreak = wasCorrect
            ? (state.data.correct_streak || 0) + 1
            : 0;

          // Check if there are more cards in the session
          const nextIndex = (state.data.current_index || 1) + 1;
          const hasMoreCards =
            state.data.all_cards && nextIndex <= state.data.all_cards.length;

          if (hasMoreCards) {
            const nextCardRef = state.data.all_cards[nextIndex - 1];
            const nextCardId =
              nextCardRef.card_id || nextCardRef.id;
            let nextCardDetails: any = nextCardRef;
            let nextStartTime = Date.now();
            let nextSm2 = null;

            try {
              const {
                runtimeContext: nextRuntimeContext,
                tracingContext: nextTracingContext,
              } = buildToolExecCtx(mastra, { requestId: userId });
              const startNext = await startReviewTool.execute({
                context: {
                  owner_id: userId,
                  card_id: nextCardId,
                  session_id: state.data.session_id,
                  position_in_session: nextIndex,
                },
                runtimeContext: nextRuntimeContext,
                tracingContext: nextTracingContext,
                mastra,
              });

              if (startNext.success && startNext.card) {
                nextCardDetails = {
                  ...startNext.card,
                  back: startNext.card.back ?? nextCardRef.back,
                };
                nextStartTime = startNext.start_time;
                nextSm2 = startNext.sm2 ?? null;

                await logReviewEvent({
                  mode: "telegram_inline",
                  action: "presented",
                  session_id: sessionIdForLogging,
                  attempt: 0,
                  hint_count: 0,
                  latency_ms: 0,
                  userId,
                  card_id: nextCardDetails.id ?? nextCardId,
                  sm2_before: nextSm2,
                  client: "telegram",
                  source: mlSource,
                  logger,
                });
              }
            } catch (error) {
              logger?.warn?.("inline_present_next_failed", {
                error: error instanceof Error ? error.message : String(error),
              });
              nextCardDetails = {
                ...nextCardRef,
                id: nextCardRef.card_id || nextCardRef.id,
              };
            }

            const progressLine = `Card ${nextIndex}/${state.data.total_cards}`;
            const streakLine =
              newStreak > 0 ? ` | Correct streak: ${newStreak}` : "";
            const motivationLine =
              newStreak >= 3 ? "\nKeep it up!" : "";

            return {
              response: `Recorded: Grade ${grade} (${grade >= 3 ? "correct" : "incorrect"})

${progressLine}${streakLine}${motivationLine}

<b>${nextCardDetails.front}</b>

<i>Try to recall the answer, then type your response or type "show" to reveal.</i>`,
              conversationState: {
                mode: "review_session",
                step: 1,
                data: {
                  session_id: state.data.session_id,
                  current_card: nextCardDetails,
                  current_index: nextIndex,
                  total_cards: state.data.total_cards,
                  all_cards: state.data.all_cards,
                  start_time: nextStartTime,
                  correct_count: updatedCorrect,
                  incorrect_count: updatedIncorrect,
                  session_start: state.data.session_start,
                  correct_streak: newStreak,
                  ml_attempts: 0,
                  ml_hints: 0,
                  ml_answer_text: null,
                  ml_answer_logged: false,
                  ml_sm2_before: nextSm2,
                  ml_source: mlSource,
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

            let summary = `${grade >= 3 ? "✅" : "📝"} Recorded: Grade ${grade}\n\n🎉 <b>Session Complete!</b>\n\n${result.message}\n\n✅ Correct: ${updatedCorrect}\n❌ Incorrect: ${updatedIncorrect}\nAccuracy: ${accuracy}%\n⏱️ Duration: ${durationStr}`;

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

async function reopenSettingsMenu(
  userId: string,
  mastra: any,
  successMessage: string,
  logger?: IMastraLogger | null,
): Promise<CommandResponse> {
  const settingsHandler = commandRegistry["/settings"];

  if (!settingsHandler) {
    logger?.warn(
      "⚠️ [CommandParser] Settings handler unavailable when refreshing menu",
    );
    return {
      response: successMessage,
      parse_mode: "HTML",
    };
  }

  try {
    const menuResponse = await settingsHandler([], "", userId, undefined, mastra);
    const menuText = menuResponse.response ?? "";
    const combinedResponse =
      successMessage && menuText
        ? `${successMessage}\n\n${menuText}`
        : successMessage || menuText;

    return {
      ...menuResponse,
      response: combinedResponse,
    };
  } catch (error) {
    logger?.error("❌ [CommandParser] Failed to refresh settings menu", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      response: successMessage,
      parse_mode: "HTML",
    };
  }
}

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
        return reopenSettingsMenu(
          userId,
          mastra,
          `✅ Timezone updated to <b>${input}</b>`,
          logger,
        );
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

  if (state.step === 2 && action === "language") {
    const lang = input.toLowerCase();
    if (!/^[a-z]{2}$/.test(lang)) {
      return {
        response: "❌ Please enter a valid language code (e.g., en, sv)",
        conversationState: state,
        parse_mode: "HTML",
      };
    }

    try {
      const { runtimeContext, tracingContext } = buildToolExecCtx(mastra, {
        requestId: userId,
      });
      const result = await updateAlgorithmSettingsTool.execute({
        context: {
          user_id: userId,
          locale: lang,
        },
        runtimeContext,
        tracingContext,
        mastra,
      });

      if (result.success) {
        return reopenSettingsMenu(
          userId,
          mastra,
          `✅ Language updated to <b>${lang}</b>`,
          logger,
        );
      } else {
        return {
          response: `❌ ${result.message}`,
          conversationState: undefined,
          parse_mode: "HTML",
        };
      }
    } catch (error) {
      logger?.error("❌ [CommandParser] Error updating language:", error);
      return {
        response: "❌ Error updating language. Please try again.",
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
        return reopenSettingsMenu(
          userId,
          mastra,
          `✅ Session size updated to <b>${size}</b> cards`,
          logger,
        );
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

  if (state.step === 2 && action === "new_cards") {
    const count = parseInt(input, 10);
    if (isNaN(count) || count < 0) {
      return {
        response: "❌ Please enter a valid number for new cards",
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
          daily_new_limit: count,
        },
        runtimeContext,
        tracingContext,
        mastra,
      });

      if (result.success) {
        return reopenSettingsMenu(
          userId,
          mastra,
          `✅ Daily new cards updated to <b>${count}</b>`,
          logger,
        );
      } else {
        return {
          response: `❌ ${result.message}`,
          conversationState: undefined,
          parse_mode: "HTML",
        };
      }
    } catch (error) {
      logger?.error("❌ [CommandParser] Error updating new cards:", error);
      return {
        response: "❌ Error updating new cards. Please try again.",
        conversationState: undefined,
        parse_mode: "HTML",
      };
    }
  }

  if (state.step === 2 && action === "daily_reviews") {
    const count = parseInt(input, 10);
    if (isNaN(count) || count < 0) {
      return {
        response: "❌ Please enter a valid number for daily reviews",
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
          daily_review_limit: count,
        },
        runtimeContext,
        tracingContext,
        mastra,
      });

      if (result.success) {
        return reopenSettingsMenu(
          userId,
          mastra,
          `✅ Daily reviews updated to <b>${count}</b>`,
          logger,
        );
      } else {
        return {
          response: `❌ ${result.message}`,
          conversationState: undefined,
          parse_mode: "HTML",
        };
      }
    } catch (error) {
      logger?.error("❌ [CommandParser] Error updating daily reviews:", error);
      return {
        response: "❌ Error updating daily reviews. Please try again.",
        conversationState: undefined,
        parse_mode: "HTML",
      };
    }
  }

  if (state.step === 2 && action === "reminder_times") {
    const parsedTimes = parseReminderTimesInput(input);

    if (!parsedTimes.success) {
      return {
        response: `❌ ${parsedTimes.error}`,
        conversationState: state,
        parse_mode: "HTML",
      };
    }

    const times = parsedTimes.times;

    try {
      const { runtimeContext, tracingContext } = buildToolExecCtx(mastra, {
        requestId: userId,
      });
      const result = await updateReminderSettingsTool.execute({
        context: {
          user_id: userId,
          preferred_times: times,
        },
        runtimeContext,
        tracingContext,
        mastra,
      });

      if (result.success) {
        return reopenSettingsMenu(
          userId,
          mastra,
          `✅ Reminder times updated to <b>${times.join(", ")}</b>`,
          logger,
        );
      } else {
        return {
          response: `❌ ${result.message}`,
          conversationState: undefined,
          parse_mode: "HTML",
        };
      }
    } catch (error) {
      logger?.error("❌ [CommandParser] Error updating reminder times:", error);
      return {
        response: "❌ Error updating reminder times. Please try again.",
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

async function handleFilterCardsFlow(
  message: string,
  userId: string,
  state: ConversationState,
  mastra?: any,
): Promise<CommandResponse> {
  const logger = mastra?.getLogger();

  const trimmed = message.trim();
  const normalized = trimmed.toLowerCase();
  const currentSort =
    typeof state.data?.sort === "string" && state.data.sort.length > 0
      ? state.data.sort
      : "date";

  if (normalized === "cancel" || normalized === "exit" || normalized === "stop") {
    return {
      response: "❌ Tag filtering cancelled.",
      conversationState: undefined,
      parse_mode: "HTML",
    };
  }

  const listHandler = commandRegistry["/list"];

  if (normalized === "clear" || normalized === "none" || normalized === "all") {
    if (listHandler) {
      const result = await listHandler(
        [],
        "",
        userId,
        {
          mode: "list_view",
          step: 0,
          data: { offset: 0, sort: currentSort },
        },
        mastra,
      );
      return { ...result, conversationState: undefined };
    }
    return {
      response: "✅ Tag filter cleared.",
      conversationState: undefined,
      parse_mode: "HTML",
    };
  }

  const tags = trimmed
    .split(/[,;]+/)
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);

  if (tags.length === 0) {
    return {
      response:
        '❌ Please provide at least one tag (comma-separated). Type "clear" to remove the filter or "cancel" to exit.',
      conversationState: {
        mode: "filter_cards",
        step: 1,
        data: { ...state.data, sort: currentSort },
      },
      parse_mode: "HTML",
    };
  }

  if (!listHandler) {
    logger?.error("❌ [CommandParser] List handler unavailable for filtering");
    return {
      response: "❌ List command not available right now.",
      conversationState: undefined,
      parse_mode: "HTML",
    };
  }

  const listState: ConversationState = {
    mode: "list_view",
    step: 0,
    data: { offset: 0, sort: currentSort, tags },
  };

  const result = await listHandler([], "", userId, listState, mastra);
  return { ...result, conversationState: undefined };
}

// ===============================
// Callback Handlers
// ===============================

function parseListCallbackData(
  action: string,
  payload: string,
): { offset: number; sort: string; tags?: string[] } {
  let offset = 0;
  let sort = "date";
  let tags: string[] | undefined;

  if (!payload) {
    return { offset, sort, tags };
  }

  const rawParts = payload.split(":");
  const parts = rawParts.filter((part) => part.length > 0);
  let index = 0;

  const parseOffset = (value: string | undefined): number => {
    if (!value) return 0;
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  if (action === "page") {
    offset = parseOffset(parts[index++]);
    sort = parts[index++] || "date";
  } else if (action === "sort") {
    sort = parts[index++] || "date";
    offset = parseOffset(parts[index++]);
  } else if (action === "filter_tag" || action === "clear_filter") {
    sort = parts[index++] || "date";
  }

  for (; index < parts.length; index++) {
    const part = parts[index];
    if (part.startsWith("tags=")) {
      const decoded = decodeURIComponent(part.slice(5));
      if (!decoded) {
        tags = [];
      } else {
        tags = decoded
          .split(",")
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0);
      }
    }
  }

  return { offset, sort, tags };
}

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
    const { offset, sort: chosenSort, tags } = parseListCallbackData(
      action,
      cardId,
    );
    const listHandler = commandRegistry["/list"];
    if (listHandler) {
      const data: Record<string, unknown> = { offset, sort: chosenSort };
      if (tags !== undefined) {
        data.tags = tags;
      }
      const state: ConversationState = {
        mode: "list_view",
        step: 0,
        data,
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

  if (action === "filter_tag") {
    const { sort, tags } = parseListCallbackData(action, cardId);
    const currentFilterText =
      tags && tags.length > 0
        ? `\nCurrently filtered by: <b>${tags.join(", ")}</b>`
        : "";
    const prompt =
      `🏷 <b>Filter by Tag</b>${currentFilterText}` +
      "\n\nSend the tag name(s) you want to filter by. Separate multiple tags with commas." +
      "\n\nType <code>clear</code> to remove the current filter or <code>cancel</code> to exit.";
    const data: Record<string, unknown> = { sort };
    if (tags !== undefined) {
      data.tags = tags;
    }
    return {
      response: prompt,
      conversationState: {
        mode: "filter_cards",
        step: 1,
        data,
      },
      parse_mode: "HTML",
    };
  }

  if (action === "clear_filter") {
    const { sort } = parseListCallbackData(action, cardId);
    const listHandler = commandRegistry["/list"];
    if (listHandler) {
      const state: ConversationState = {
        mode: "list_view",
        step: 0,
        data: { offset: 0, sort },
      };
      return listHandler([], "", userId, state, mastra);
    }
    return {
      response: "❌ List command not available right now.",
      parse_mode: "HTML",
    };
  }

  if (action === "filter_search") {
    return {
      response: "Search filtering coming soon.",
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
    const { runtimeContext, tracingContext } = buildToolExecCtx(mastra, {
      requestId: userId,
    });

    if (action === "toggle_reminders") {
      const { getReminderSettingsTool } = await import(
        "./tools/reminderTools.js"
      );
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
      const current = await getUserSettingsTool.execute({
        context: { user_id: userId },
        runtimeContext,
        tracingContext,
        mastra,
      });
      const tz =
        current.success && current.settings ? current.settings.timezone : "";
      return {
        response: `🌍 Enter new timezone (Current: ${tz})`,
        conversationState: {
          mode: "settings_menu",
          step: 2,
          data: { action: "timezone" },
        },
        parse_mode: "HTML",
      };
    }

    if (action === "change_language") {
      const current = await getUserSettingsTool.execute({
        context: { user_id: userId },
        runtimeContext,
        tracingContext,
        mastra,
      });
      const lang =
        current.success && current.settings ? current.settings.locale : "";
      return {
        response: `🌐 Enter language code (Current: ${lang})`,
        conversationState: {
          mode: "settings_menu",
          step: 2,
          data: { action: "language" },
        },
        parse_mode: "HTML",
      };
    }

    if (
      action === "new_cards" ||
      action === "daily_reviews" ||
      action === "session_size"
    ) {
      const current = await getUserSettingsTool.execute({
        context: { user_id: userId },
        runtimeContext,
        tracingContext,
        mastra,
      });
      let currentVal = "";
      let prompt = "";
      if (current.success && current.settings) {
        if (action === "new_cards")
          currentVal = String(current.settings.daily_new_limit);
        if (action === "daily_reviews")
          currentVal = String(current.settings.daily_review_limit);
        if (action === "session_size")
          currentVal = String(current.settings.session_size);
      }
      if (action === "new_cards") prompt = "How many new cards per day?";
      else if (action === "daily_reviews") prompt = "Max reviews per day?";
      else prompt = "Number of cards per session?";
      return {
        response: `${prompt} (Current: ${currentVal})`,
        conversationState: {
          mode: "settings_menu",
          step: 2,
          data: { action },
        },
        parse_mode: "HTML",
      };
    }

    if (action === "reminder_times") {
      const current = await getUserSettingsTool.execute({
        context: { user_id: userId },
        runtimeContext,
        tracingContext,
        mastra,
      });
      const times =
        current.success && current.settings
          ? current.settings.reminder_times.join(", ")
          : "";
      return {
        response: `⏰ Enter reminder hours (HH or HH:MM, comma-separated). Current: ${times}`,
        conversationState: {
          mode: "settings_menu",
          step: 2,
          data: { action: "reminder_times" },
        },
        parse_mode: "HTML",
      };
    }

    if (action === "advanced") {
      const current = await getUserSettingsTool.execute({
        context: { user_id: userId },
        runtimeContext,
        tracingContext,
        mastra,
      });
      const alg =
        current.success && current.settings
          ? current.settings.algorithm.toUpperCase()
          : "SM2";
      return {
        response: [
          `<b>⚡ Advanced Settings</b>`,
          `🧠 Algorithm: ${alg}`,
          `📂 Backup: use /export_cards`,
          `🔄 Auto-sync: not available`,
        ].join("\n"),
        parse_mode: "HTML",
        inline_keyboard: {
          inline_keyboard: [
            [{ text: "⬅ Back", callback_data: "settings:back" }],
          ],
        },
      };
    }

    if (action === "back") {
      const startHandler = commandRegistry["/start"];
      if (startHandler) {
        return startHandler([], "", userId, undefined, mastra);
      }
      return { response: "", parse_mode: "HTML" };
    }

    if (action === "export") {
      const exportHandler = commandRegistry["/export_cards"];
      if (exportHandler) {
        return exportHandler([], "", userId, undefined, mastra);
      }
      return { response: "❌ Export not available", parse_mode: "HTML" };
    }

    if (action === "reset") {
      const resetHandler = commandRegistry["/reset"];
      if (resetHandler) {
        return resetHandler([], "", userId, undefined, mastra);
      }
      return { response: "❌ Reset not available", parse_mode: "HTML" };
    }

    if (action === "close") {
      return {
        response: "Settings closed.",
        parse_mode: "HTML",
        remove_keyboard: true,
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
  username?: string,
  commandContext?: CommandContext,
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

  if (parsed && ADMIN_COMMANDS.has(parsed.command)) {
    if (!(await isAdmin(userId))) {
      logger?.warn("unauthorized_admin_command", {
        command: parsed.command,
        userId,
        username,
      });
      return { response: "Not authorized.", parse_mode: "HTML" };
    }
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
    return handler(
      params,
      rawParams,
      userId,
      conversationState,
      mastra,
      commandContext,
    );
  }

  return {
    response: `❓ Unknown command: ${command}\n\nUse /help to see available commands.`,
    parse_mode: "HTML",
  };
}
