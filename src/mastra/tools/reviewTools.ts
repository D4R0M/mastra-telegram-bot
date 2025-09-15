import { createTool } from "@mastra/core/tools";
import type { IMastraLogger } from "@mastra/core/logger";
import { z } from "zod";
import {
  getDueCards,
  createReviewState,
  updateReviewState,
  createReviewLog,
  getReviewState,
  getReviewStates,
  logReview,
  logReviewEvent,
} from "../../db/reviews.js";
import { getCardById } from "../../db/cards.js";
import { applySM2 } from "../../lib/sm2.js";
import { withTransaction } from "../../db/client.js";
import { createHash } from "crypto";
import type {
  CreateReviewLogData,
  UpdateReviewStateData,
  ReviewEvent,
} from "../../db/reviews.js";

function getTimeOfDayBucket(date: Date): string {
  const hour = date.getHours();
  if (hour < 6) return "night";
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

// Get due cards for review
export const getDueCardsTool = createTool({
  id: "get-due-cards-tool",
  description: `Get vocabulary cards that are due for review today, ordered by priority (oldest due date first).`,
  inputSchema: z.object({
    owner_id: z.string().describe("User ID who owns the cards"),
    limit: z
      .number()
      .default(10)
      .describe("Maximum number of cards to return for the session"),
    include_new: z
      .boolean()
      .default(true)
      .describe("Whether to include new cards that haven't been reviewed yet"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    cards: z.array(
      z.object({
        card_id: z.string(),
        front: z.string(),
        back: z.string(),
        tags: z.array(z.string()),
        example: z.string().optional(),
        lang_front: z.string(),
        lang_back: z.string(),
        queue: z.string(),
        due_date: z.string(),
        repetitions: z.number(),
        ease_factor: z.number(),
        lapses: z.number(),
      }),
    ),
    total_due: z.number(),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info(
      "🔧 [GetDueCards] Starting due cards retrieval with params:",
      context,
    );

    try {
      // Get due cards that already have review states
      logger?.info("📝 [GetDueCards] Fetching due cards from database...");
      const dueCardsData = await getDueCards(context.owner_id, context.limit);

      const dueCards = dueCardsData.map((item) => ({
        card_id: item.card.id,
        front: item.card.front,
        back: item.card.back,
        tags: item.card.tags || [],
        example: item.card.example,
        lang_front: item.card.lang_front,
        lang_back: item.card.lang_back,
        queue: item.review_state.queue,
        due_date: item.review_state.due_date,
        repetitions: item.review_state.repetitions,
        ease_factor: item.review_state.ease_factor,
        lapses: item.review_state.lapses,
      }));

      // If we need more cards and include_new is true, get new cards without review states
      let newCards: any[] = [];
      if (context.include_new && dueCards.length < context.limit) {
        logger?.info(
          "📝 [GetDueCards] Need more cards, fetching new cards without review states...",
        );

        const remaining = context.limit - dueCards.length;
        const { getCardsByOwner } = await import("../../db/cards.js");

        // Get candidate cards and fetch existing review states in batch
        const allCards = await getCardsByOwner(context.owner_id, {
          limit: remaining * 2,
        }); // Get extra to filter
        const existingStates = await getReviewStates(
          allCards.map((card) => card.id),
        );
        const existingMap = new Map(
          existingStates.map((state) => [state.card_id, state]),
        );

        const cardsWithoutState = allCards
          .filter((card) => !existingMap.has(card.id))
          .slice(0, remaining);

        logger?.info(
          "📝 [GetDueCards] Creating review states for new cards...",
          { count: cardsWithoutState.length },
        );

        const createdStates = await Promise.all(
          cardsWithoutState.map((card) =>
            createReviewState({
              card_id: card.id,
              user_id: context.owner_id,
              interval_days: 0,
              repetitions: 0,
              ease_factor: 2.5,
              due_date: new Date().toISOString().split("T")[0], // Due today
              queue: "new",
            }),
          ),
        );

        newCards = cardsWithoutState.map((card, idx) => ({
          card_id: card.id,
          front: card.front,
          back: card.back,
          tags: card.tags || [],
          example: card.example,
          lang_front: card.lang_front,
          lang_back: card.lang_back,
          queue: createdStates[idx].queue,
          due_date: createdStates[idx].due_date,
          repetitions: createdStates[idx].repetitions,
          ease_factor: createdStates[idx].ease_factor,
          lapses: createdStates[idx].lapses,
        }));

        logger?.info("📝 [GetDueCards] Added new cards:", {
          count: newCards.length,
        });
      }

      const allCards = [...dueCards, ...newCards];
      const totalDue = allCards.length;

      const message =
        totalDue === 0
          ? "No cards are due for review right now. Great job keeping up with your studies!"
          : `Found ${totalDue} card${totalDue === 1 ? "" : "s"} ready for review.`;

      logger?.info("✅ [GetDueCards] Successfully retrieved due cards:", {
        count: totalDue,
      });
      return {
        success: true,
        cards: allCards,
        total_due: totalDue,
        message,
      };
    } catch (error) {
      logger?.error("❌ [GetDueCards] Error retrieving due cards:", error);
      return {
        success: false,
        cards: [],
        total_due: 0,
        message: `Error retrieving due cards: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
});

// Start a review session for a specific card
export const startReviewTool = createTool({
  id: "start-review-tool",
  description: `Start reviewing a specific card by showing the front side. This begins the active recall process and starts timing.`,
  inputSchema: z.object({
    owner_id: z.string().describe("User ID who owns the card"),
    card_id: z.string().describe("ID of the card to review"),
    session_id: z
      .string()
      .optional()
      .describe("Session ID for tracking review sessions"),
    position_in_session: z
      .number()
      .optional()
      .describe("Position of the card within the session"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    card: z
      .object({
        id: z.string(),
        front: z.string(),
        back: z.string(),
        tags: z.array(z.string()),
        example: z.string().optional(),
        lang_front: z.string(),
        lang_back: z.string(),
        queue: z.string(),
        repetitions: z.number(),
        ease_factor: z.number(),
        lapses: z.number(),
      })
      .optional(),
    start_time: z
      .coerce.number()
      .describe("Timestamp when review started (for measuring latency)"),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info("🔧 [StartReview] Starting card review with params:", context);

    try {
      // Get the card details
      const card = await getCardById(context.card_id, context.owner_id);
      if (!card) {
        return {
          success: false,
          start_time: Date.now(),
          message: "Card not found or you don't have permission to review it.",
        };
      }

      // Get or create review state
      let reviewState = await getReviewState(context.card_id);
      if (!reviewState) {
        logger?.info("📝 [StartReview] Creating new review state for card");
        reviewState = await createReviewState({
          card_id: context.card_id,
          user_id: context.owner_id,
        });
      }

      const startTime = Date.now();

      logger?.info("✅ [StartReview] Review session started:", {
        card_id: context.card_id,
        front: card.front,
        queue: reviewState.queue,
      });

      return {
        success: true,
        card: {
          id: card.id,
          front: card.front,
          back: card.back,
          tags: card.tags,
          example: card.example,
          lang_front: card.lang_front,
          lang_back: card.lang_back,
          queue: reviewState.queue,
          repetitions: reviewState.repetitions,
          ease_factor: reviewState.ease_factor,
          lapses: reviewState.lapses,
        },
        start_time: startTime,
        message: `Review started! Try to recall: "${card.front}"`,
      };
    } catch (error) {
      logger?.error("❌ [StartReview] Error starting review:", error);
      return {
        success: false,
        start_time: Date.now(),
        message: `Error starting review: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
});

// Submit a review with grade and update SM-2 scheduling
export const submitReviewTool = createTool({
  id: "submit-review-tool",
  description: `Submit a review grade (0-5) for a card and update the SM-2 spaced repetition schedule. Shows the correct answer after grading.`,
  inputSchema: z.object({
    owner_id: z.string().describe("User ID who owns the card"),
    card_id: z.string().describe("ID of the card being reviewed"),
    grade: z
      .number()
      .min(0)
      .max(5)
      .describe(
        "Grade: 0=total blackout, 1=incorrect but remembered, 2=incorrect but easy, 3=correct but difficult, 4=correct with hesitation, 5=perfect recall",
      ),
    start_time: z
      .coerce.number()
      .describe("Timestamp when review started (for measuring latency)"),
    session_id: z
      .string()
      .optional()
      .describe("Session ID for tracking review sessions"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    card: z
      .object({
        id: z.string(),
        front: z.string(),
        back: z.string(),
        tags: z.array(z.string()),
        example: z.string().optional(),
        lang_front: z.string(),
        lang_back: z.string(),
      })
      .optional(),
    review_result: z
      .object({
        grade: z.number(),
        previous_ease: z.number(),
        new_ease: z.number(),
        previous_interval: z.number(),
        new_interval: z.number(),
        previous_repetitions: z.number(),
        new_repetitions: z.number(),
        due_date: z.string(),
        latency_ms: z.number(),
      })
      .optional(),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info(
      "🔧 [SubmitReview] Starting review submission with params:",
      context,
    );

    try {
      // Validate grade
      if (context.grade < 0 || context.grade > 5) {
        return {
          success: false,
          message:
            "Grade must be between 0 and 5. Please provide a valid grade.",
        };
      }

      // Get the card details
      const card = await getCardById(context.card_id, context.owner_id);
      if (!card) {
        return {
          success: false,
          message: "Card not found or you don't have permission to review it.",
        };
      }

      // Get current review state
      const currentReviewState = await getReviewState(context.card_id);
      if (!currentReviewState) {
        return {
          success: false,
          message:
            "No review state found for this card. Please start a review first.",
        };
      }

      // Calculate timing
      // Ensure start_time is a valid number to avoid invalid timestamp errors
      const startTimeMs =
        typeof context.start_time === "string"
          ? Number(context.start_time)
          : context.start_time;
      const tsAnswered = new Date();
      const safeStartTime = Number.isFinite(startTimeMs)
        ? startTimeMs
        : tsAnswered.getTime();
      const latencyMs = tsAnswered.getTime() - safeStartTime;

      // Apply SM-2 algorithm
      logger?.info("📝 [SubmitReview] Applying SM-2 algorithm:", {
        grade: context.grade,
        current_ease: currentReviewState.ease_factor,
        current_interval: currentReviewState.interval_days,
        current_repetitions: currentReviewState.repetitions,
      });

      const sm2Result = applySM2(context.grade, {
        easeFactor: currentReviewState.ease_factor,
        intervalDays: currentReviewState.interval_days,
        repetitions: currentReviewState.repetitions,
        lapses: currentReviewState.lapses,
      });

      // Defensive defaults
      let {
        intervalDays: nextIntervalDays,
        easeFactor: nextEase,
        repetitions: nextReps,
        lapses: nextLapses,
      } = sm2Result;

      const isFiniteNumber = (n: number) => Number.isFinite(n);
      if (!isFiniteNumber(nextIntervalDays) || nextIntervalDays <= 0) {
        logger?.error("⚠️ [SubmitReview] Non-finite interval detected", {
          interval: nextIntervalDays,
        });
        nextIntervalDays = 1;
      }
      if (!isFiniteNumber(nextEase)) {
        logger?.error("⚠️ [SubmitReview] Non-finite ease detected", {
          ease: nextEase,
        });
        nextEase = 1.3;
      }
      if (!isFiniteNumber(nextReps) || nextReps < 0) {
        logger?.error("⚠️ [SubmitReview] Non-finite repetitions detected", {
          repetitions: nextReps,
        });
        nextReps = 0;
      }
      if (!isFiniteNumber(nextLapses) || nextLapses < 0) {
        logger?.error("⚠️ [SubmitReview] Non-finite lapses detected", {
          lapses: nextLapses,
        });
        nextLapses = 0;
      }

      const tsShown = new Date(safeStartTime);
      const scheduledAt = new Date(
        tsAnswered.getTime() + nextIntervalDays * 86_400_000,
      );
      if (isNaN(scheduledAt.getTime())) {
        throw new Error("Computed scheduledAt is invalid");
      }
      const dueDate = scheduledAt.toISOString().split("T")[0];

      const wasOverdue =
        tsShown > new Date(`${currentReviewState.due_date}T00:00:00Z`);
      const isNew = currentReviewState.repetitions === 0;

      logger?.info("📝 [SubmitReview] Computed scheduling", {
        intervalDays: nextIntervalDays,
        scheduledAt: scheduledAt.toISOString(),
        isNew,
        wasOverdue,
      });

      // Determine new queue status
      let newQueue: "new" | "learning" | "review" = "review";
      if (nextReps === 0) {
        newQueue = "learning";
      } else if (nextReps === 1) {
        newQueue = "learning";
      }

      // Update review state and log in a single transaction
      const userHash = createHash("sha256")
        .update(context.owner_id)
        .digest("hex");

      const updateData: UpdateReviewStateData = {
        interval_days: nextIntervalDays,
        repetitions: nextReps,
        ease_factor: nextEase,
        due_date: dueDate,
        last_reviewed_at: new Date(),
        last_grade: context.grade,
        lapses: nextLapses,
        queue: newQueue,
      };

      const reviewLogData: CreateReviewLogData = {
        card_id: context.card_id,
        user_id: context.owner_id,
        grade: context.grade,
        prev_ease: currentReviewState.ease_factor,
        new_ease: nextEase,
        prev_interval: currentReviewState.interval_days,
        new_interval: nextIntervalDays,
        prev_repetitions: currentReviewState.repetitions,
        new_repetitions: nextReps,
        prev_due: currentReviewState.due_date,
        new_due: dueDate,
        latency_ms: latencyMs,
        session_id: context.session_id,
        direction: "front_to_back",
      };

      const reviewEventLogData = {
        user_id: context.owner_id,
        user_hash: userHash,
        session_id: context.session_id,
        card_id: context.card_id,
        grade: context.grade,
        latency_ms: latencyMs,
        was_overdue: wasOverdue,
        prev_ease: currentReviewState.ease_factor,
        new_ease: nextEase,
        prev_interval_days: currentReviewState.interval_days,
        new_interval_days: nextIntervalDays,
        prev_repetitions: currentReviewState.repetitions,
        new_repetitions: nextReps,
      };

      const reviewEvent: ReviewEvent = {
        user_id: context.owner_id,
        card_id: context.card_id,
        ts_shown: tsShown,
        ts_answered: tsAnswered,
        grade: context.grade,
        scheduled_at: scheduledAt,
        prev_review_at: currentReviewState.last_reviewed_at,
        prev_interval_days: currentReviewState.interval_days,
        due_interval_days: nextIntervalDays,
        was_overdue: wasOverdue,
        ease_factor: nextEase,
        repetition: nextReps,
        lapses: nextLapses,
        is_new: isNew,
        answer_latency_ms: latencyMs,
        session_id: context.session_id,
        position_in_session: context.position_in_session,
        time_of_day_bucket: getTimeOfDayBucket(tsAnswered),
        weekday: tsAnswered.getDay(),
      };

      await withTransaction(async (client) => {
        await updateReviewState(context.card_id, updateData, client);
        await createReviewLog(reviewLogData, client);
        await logReviewEvent(reviewEventLogData, client);
        await logReview(reviewEvent, client);
      });

      // Prepare response messages based on grade
      const gradeMessages = {
        0: "Total blackout - don't worry, this happens! The card will be reviewed again soon.",
        1: "You remembered something, but got it wrong. Keep practicing!",
        2: "Incorrect, but you knew it was easy. You'll see this again soon.",
        3: "Correct, but it was difficult. Good job working through it!",
        4: "Correct with some hesitation. You're getting there!",
        5: "Perfect recall! Excellent work!",
      };

        const nextReviewMessage =
          nextIntervalDays === 1
            ? "You'll review this again tomorrow."
            : `You'll review this again in ${nextIntervalDays} days (${dueDate}).`;

        logger?.info("✅ [SubmitReview] Review completed successfully:", {
          card_id: context.card_id,
          grade: context.grade,
          new_due_date: dueDate,
          new_interval: nextIntervalDays,
        });

      return {
        success: true,
        card: {
          id: card.id,
          front: card.front,
          back: card.back,
          tags: card.tags,
          example: card.example,
          lang_front: card.lang_front,
          lang_back: card.lang_back,
        },
        review_result: {
          grade: context.grade,
            previous_ease: currentReviewState.ease_factor,
            new_ease: nextEase,
            previous_interval: currentReviewState.interval_days,
            new_interval: nextIntervalDays,
            previous_repetitions: currentReviewState.repetitions,
            new_repetitions: nextReps,
            due_date: dueDate,
            latency_ms: latencyMs,
        },
        message: `${gradeMessages[context.grade as keyof typeof gradeMessages]} The answer was: "${card.back}". ${nextReviewMessage}`,
      };
    } catch (error) {
      logger?.error("❌ [SubmitReview] Error submitting review:", error);
      return {
        success: false,
        message: `Error submitting review: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
});
