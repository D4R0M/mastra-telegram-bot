import { createTool } from "@mastra/core/tools";
import type { IMastraLogger } from "@mastra/core/logger";
import { z } from "zod";
import { getPool } from "../../db/client";
import { getDueCardsStats, getRetentionStats, getStreakStats, getEaseHistogram } from "./statistics/helpers";

// ===============================
// Types for Statistics
// ===============================

interface DueCardsStats {
  total_cards: number;
  new_cards: number;
  due_cards: number;
  learning_cards: number;
  review_cards: number;
  overdue_cards: number;
  cards_due_today: number;
  cards_due_tomorrow: number;
  average_ease: number;
  total_reviews: number;
}

interface RetentionStats {
  total_reviews: number;
  successful_reviews: number; // Grade >= 3
  retention_rate: number;
  average_grade: number;
  reviews_last_7_days: number;
  reviews_last_30_days: number;
  success_rate_last_7_days: number;
  success_rate_last_30_days: number;
  mature_cards: number; // Cards with interval >= 21 days
  young_cards: number; // Cards with interval < 21 days
}

interface StreakStats {
  current_streak: number;
  longest_streak: number;
  total_study_days: number;
  days_since_last_review: number;
  reviews_today: number;
  average_daily_reviews: number;
  streak_start_date: string | null;
  last_review_date: string | null;
}

interface EaseHistogram {
  ease_ranges: Array<{
    range: string;
    count: number;
    percentage: number;
  }>;
  average_ease: number;
  median_ease: number;
  min_ease: number;
  max_ease: number;
  cards_below_default: number; // Cards with ease < 2.5
  cards_above_default: number; // Cards with ease > 2.5
}

// Helper function to calculate date differences
function getDaysDifference(date1: Date, date2: Date): number {
  const diffTime = Math.abs(date2.getTime() - date1.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// Helper function to format dates
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

// ===============================
// Due Cards Statistics Tool
// ===============================

export const getDueCardsStatsTool = createTool({
  id: "get-due-cards-stats-tool",
  description: `Get comprehensive statistics about due cards, including counts by queue type, due dates, and review metrics`,
  inputSchema: z.object({
    owner_id: z.coerce.number().describe("User identifier to get statistics for"),
    timezone: z.string().default("Europe/Stockholm").describe("Timezone for date calculations"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    stats: z.object({
      total_cards: z.number(),
      new_cards: z.number(),
      due_cards: z.number(),
      learning_cards: z.number(),
      review_cards: z.number(),
      overdue_cards: z.number(),
      cards_due_today: z.number(),
      cards_due_tomorrow: z.number(),
      average_ease: z.number(),
      total_reviews: z.number(),
    }),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info('🔧 [GetDueCardsStats] Starting due cards statistics with params:', {
      owner_id: context.owner_id,
      timezone: context.timezone
    });

    try {
      const dueCardsStats = await getDueCardsStats(context.owner_id, context.timezone, logger);

      logger?.info('✅ [GetDueCardsStats] Successfully calculated due cards statistics:', {
        owner_id: context.owner_id,
        total_cards: dueCardsStats.total_cards,
        due_cards: dueCardsStats.due_cards,
        overdue_cards: dueCardsStats.overdue_cards,
        average_ease: dueCardsStats.average_ease
      });

      return {
        success: true,
        stats: dueCardsStats,
        message: `Successfully calculated due cards statistics for ${dueCardsStats.total_cards} cards`
      };
    } catch (error) {
      logger?.error('❌ [GetDueCardsStats] Error calculating due cards statistics:', {
        error: error instanceof Error ? error.message : String(error),
        owner_id: context.owner_id
      });
      
      return {
        success: false,
        stats: {
          total_cards: 0,
          new_cards: 0,
          due_cards: 0,
          learning_cards: 0,
          review_cards: 0,
          overdue_cards: 0,
          cards_due_today: 0,
          cards_due_tomorrow: 0,
          average_ease: 2.5,
          total_reviews: 0,
        },
        message: `Error calculating due cards statistics: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
});

// ===============================
// Retention Rate Statistics Tool
// ===============================

export const getRetentionStatsTool = createTool({
  id: "get-retention-stats-tool",
  description: `Calculate retention rates and learning progress based on review history and success rates`,
  inputSchema: z.object({
    owner_id: z.coerce.number().describe("User identifier to calculate retention for"),
    success_threshold: z.number().min(0).max(5).default(3).describe("Minimum grade considered successful (0-5)"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    stats: z.object({
      total_reviews: z.number(),
      successful_reviews: z.number(),
      retention_rate: z.number(),
      average_grade: z.number(),
      reviews_last_7_days: z.number(),
      reviews_last_30_days: z.number(),
      success_rate_last_7_days: z.number(),
      success_rate_last_30_days: z.number(),
      mature_cards: z.number(),
      young_cards: z.number(),
    }),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info('🔧 [GetRetentionStats] Starting retention statistics with params:', {
      owner_id: context.owner_id,
      success_threshold: context.success_threshold
    });

    try {
      const retentionStats = await getRetentionStats(context.owner_id, context.success_threshold, logger);

      logger?.info('✅ [GetRetentionStats] Successfully calculated retention statistics:', {
        owner_id: context.owner_id,
        total_reviews: retentionStats.total_reviews,
        retention_rate: retentionStats.retention_rate.toFixed(1) + '%',
        average_grade: retentionStats.average_grade.toFixed(2),
        mature_cards: retentionStats.mature_cards
      });

      return {
        success: true,
        stats: retentionStats,
        message: `Successfully calculated retention statistics from ${retentionStats.total_reviews} reviews`
      };
    } catch (error) {
      logger?.error('❌ [GetRetentionStats] Error calculating retention statistics:', {
        error: error instanceof Error ? error.message : String(error),
        owner_id: context.owner_id
      });
      
      return {
        success: false,
        stats: {
          total_reviews: 0,
          successful_reviews: 0,
          retention_rate: 0,
          average_grade: 0,
          reviews_last_7_days: 0,
          reviews_last_30_days: 0,
          success_rate_last_7_days: 0,
          success_rate_last_30_days: 0,
          mature_cards: 0,
          young_cards: 0,
        },
        message: `Error calculating retention statistics: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
});

// ===============================
// Study Streaks Statistics Tool
// ===============================

export const getStreakStatsTool = createTool({
  id: "get-streak-stats-tool", 
  description: `Calculate study streaks, consistency metrics, and daily review patterns`,
  inputSchema: z.object({
    owner_id: z.coerce.number().describe("User identifier to calculate streaks for"),
    timezone: z.string().default("Europe/Stockholm").describe("Timezone for date calculations"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    stats: z.object({
      current_streak: z.number(),
      longest_streak: z.number(),
      total_study_days: z.number(),
      days_since_last_review: z.number(),
      reviews_today: z.number(),
      average_daily_reviews: z.number(),
      streak_start_date: z.string().nullable(),
      last_review_date: z.string().nullable(),
    }),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info('🔧 [GetStreakStats] Starting streak statistics with params:', {
      owner_id: context.owner_id,
      timezone: context.timezone
    });

    try {
      const pool = getPool();
      const today = new Date().toISOString().split('T')[0];

      // Get review dates and counts
      const reviewDatesQuery = `
        SELECT 
          DATE(rl.reviewed_at) as review_date,
          COUNT(*) as reviews_count
        FROM review_log rl
        JOIN cards c ON rl.card_id = c.id
        WHERE c.owner_id = $1 AND c.active = true
        GROUP BY DATE(rl.reviewed_at)
        ORDER BY review_date DESC
      `;

      // Get overall statistics
      const overallStatsQuery = `
        SELECT 
          COUNT(DISTINCT DATE(rl.reviewed_at)) as total_study_days,
          COUNT(CASE WHEN DATE(rl.reviewed_at) = $2 THEN 1 END) as reviews_today,
          MAX(rl.reviewed_at) as last_review_date,
          AVG(daily_counts.daily_reviews) as average_daily_reviews
        FROM review_log rl
        JOIN cards c ON rl.card_id = c.id
        JOIN (
          SELECT DATE(reviewed_at) as date, COUNT(*) as daily_reviews
          FROM review_log rl2
          JOIN cards c2 ON rl2.card_id = c2.id
          WHERE c2.owner_id = $1 AND c2.active = true
          GROUP BY DATE(reviewed_at)
        ) daily_counts ON DATE(rl.reviewed_at) = daily_counts.date
        WHERE c.owner_id = $1 AND c.active = true
      `;

      logger?.info('📝 [GetStreakStats] Executing streak statistics queries');
      
      const [reviewDatesResult, overallStatsResult] = await Promise.all([
        pool.query(reviewDatesQuery, [context.owner_id]),
        pool.query(overallStatsQuery, [context.owner_id, today])
      ]);

      const reviewDates = reviewDatesResult.rows.map(row => ({
        date: row.review_date,
        count: parseInt(row.reviews_count)
      }));

      const overallStats = overallStatsResult.rows[0] || {};

      // Calculate streaks
      let currentStreak = 0;
      let longestStreak = 0;
      let currentStreakLength = 0;
      let streakStartDate: string | null = null;

      if (reviewDates.length > 0) {
        const todayDate = new Date(today);
        
        // Check if user reviewed today or yesterday (to maintain streak)
        const mostRecentDate = new Date(reviewDates[0].date);
        const daysSinceLastReview = Math.floor((todayDate.getTime() - mostRecentDate.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysSinceLastReview <= 1) {
          // Current streak is active
          currentStreakLength = 1;
          streakStartDate = reviewDates[0].date;
          
          // Count consecutive days backwards
          for (let i = 1; i < reviewDates.length; i++) {
            const currentDate = new Date(reviewDates[i-1].date);
            const previousDate = new Date(reviewDates[i].date);
            const daysDiff = Math.floor((currentDate.getTime() - previousDate.getTime()) / (1000 * 60 * 60 * 24));
            
            if (daysDiff === 1) {
              currentStreakLength++;
              streakStartDate = reviewDates[i].date;
            } else {
              break;
            }
          }
          currentStreak = currentStreakLength;
        }

        // Calculate longest streak
        let tempStreak = 1;
        for (let i = 1; i < reviewDates.length; i++) {
          const currentDate = new Date(reviewDates[i-1].date);
          const previousDate = new Date(reviewDates[i].date);
          const daysDiff = Math.floor((currentDate.getTime() - previousDate.getTime()) / (1000 * 60 * 60 * 24));
          
          if (daysDiff === 1) {
            tempStreak++;
          } else {
            longestStreak = Math.max(longestStreak, tempStreak);
            tempStreak = 1;
          }
        }
        longestStreak = Math.max(longestStreak, tempStreak, currentStreak);
      }

      const streakStats: StreakStats = {
        current_streak: currentStreak,
        longest_streak: longestStreak,
        total_study_days: parseInt(overallStats.total_study_days) || 0,
        days_since_last_review: reviewDates.length > 0 ? 
          Math.floor((new Date(today).getTime() - new Date(reviewDates[0].date).getTime()) / (1000 * 60 * 60 * 24)) : 0,
        reviews_today: parseInt(overallStats.reviews_today) || 0,
        average_daily_reviews: parseFloat(overallStats.average_daily_reviews) || 0,
        streak_start_date: streakStartDate,
        last_review_date: overallStats.last_review_date ? 
          new Date(overallStats.last_review_date).toISOString().split('T')[0] : null,
      };

      logger?.info('✅ [GetStreakStats] Successfully calculated streak statistics:', {
        owner_id: context.owner_id,
        current_streak: streakStats.current_streak,
        longest_streak: streakStats.longest_streak,
        total_study_days: streakStats.total_study_days,
        reviews_today: streakStats.reviews_today
      });

      return {
        success: true,
        stats: streakStats,
        message: `Successfully calculated streak statistics with ${streakStats.current_streak} day current streak`
      };
    } catch (error) {
      logger?.error('❌ [GetStreakStats] Error calculating streak statistics:', {
        error: error instanceof Error ? error.message : String(error),
        owner_id: context.owner_id
      });
      
      return {
        success: false,
        stats: {
          current_streak: 0,
          longest_streak: 0,
          total_study_days: 0,
          days_since_last_review: 0,
          reviews_today: 0,
          average_daily_reviews: 0,
          streak_start_date: null,
          last_review_date: null,
        },
        message: `Error calculating streak statistics: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
});

// ===============================
// Ease Factor Histogram Tool
// ===============================

export const getEaseHistogramTool = createTool({
  id: "get-ease-histogram-tool",
  description: `Generate ease factor distribution histogram to analyze card difficulty patterns and learning progress`,
  inputSchema: z.object({
    owner_id: z.coerce.number().describe("User identifier to analyze ease factors for"),
    bin_size: z.number().min(0.1).max(1.0).default(0.2).describe("Size of ease factor bins for histogram (0.1-1.0)"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    stats: z.object({
      ease_ranges: z.array(z.object({
        range: z.string(),
        count: z.number(),
        percentage: z.number(),
      })),
      average_ease: z.number(),
      median_ease: z.number(),
      min_ease: z.number(),
      max_ease: z.number(),
      cards_below_default: z.number(),
      cards_above_default: z.number(),
    }),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info('🔧 [GetEaseHistogram] Starting ease histogram analysis with params:', {
      owner_id: context.owner_id,
      bin_size: context.bin_size
    });

    try {
      const pool = getPool();

      // Get all ease factors
      const easeQuery = `
        SELECT rs.ease_factor
        FROM review_state rs
        JOIN cards c ON rs.card_id = c.id
        WHERE c.owner_id = $1 AND c.active = true
        ORDER BY rs.ease_factor
      `;

      logger?.info('📝 [GetEaseHistogram] Retrieving ease factors');
      const result = await pool.query(easeQuery, [context.owner_id]);

      if (result.rows.length === 0) {
        return {
          success: true,
          stats: {
            ease_ranges: [],
            average_ease: 2.5,
            median_ease: 2.5,
            min_ease: 2.5,
            max_ease: 2.5,
            cards_below_default: 0,
            cards_above_default: 0,
          },
          message: "No cards with ease factors found for this user"
        };
      }

      const easeFactors = result.rows.map(row => parseFloat(row.ease_factor));
      const totalCards = easeFactors.length;

      // Calculate basic statistics
      const averageEase = easeFactors.reduce((sum, ease) => sum + ease, 0) / totalCards;
      const minEase = Math.min(...easeFactors);
      const maxEase = Math.max(...easeFactors);
      const medianEase = easeFactors[Math.floor(totalCards / 2)];
      
      const cardsBelowDefault = easeFactors.filter(ease => ease < 2.5).length;
      const cardsAboveDefault = easeFactors.filter(ease => ease > 2.5).length;

      // Create histogram bins
      const binSize = context.bin_size;
      const minBin = Math.floor(minEase / binSize) * binSize;
      const maxBin = Math.ceil(maxEase / binSize) * binSize;
      const bins: { [key: string]: number } = {};

      // Initialize bins
      for (let bin = minBin; bin <= maxBin; bin += binSize) {
        const binKey = `${bin.toFixed(1)}-${(bin + binSize).toFixed(1)}`;
        bins[binKey] = 0;
      }

      // Fill bins
      easeFactors.forEach(ease => {
        const binStart = Math.floor(ease / binSize) * binSize;
        const binKey = `${binStart.toFixed(1)}-${(binStart + binSize).toFixed(1)}`;
        if (bins[binKey] !== undefined) {
          bins[binKey]++;
        }
      });

      // Convert to histogram format
      const easeRanges = Object.entries(bins).map(([range, count]) => ({
        range,
        count,
        percentage: (count / totalCards) * 100,
      })).filter(item => item.count > 0);

      const easeHistogram: EaseHistogram = {
        ease_ranges: easeRanges,
        average_ease: averageEase,
        median_ease: medianEase,
        min_ease: minEase,
        max_ease: maxEase,
        cards_below_default: cardsBelowDefault,
        cards_above_default: cardsAboveDefault,
      };

      logger?.info('✅ [GetEaseHistogram] Successfully generated ease histogram:', {
        owner_id: context.owner_id,
        total_cards: totalCards,
        average_ease: averageEase.toFixed(2),
        histogram_bins: easeRanges.length,
        cards_below_default: cardsBelowDefault,
        cards_above_default: cardsAboveDefault
      });

      return {
        success: true,
        stats: easeHistogram,
        message: `Successfully generated ease histogram for ${totalCards} cards with ${easeRanges.length} bins`
      };
    } catch (error) {
      logger?.error('❌ [GetEaseHistogram] Error generating ease histogram:', {
        error: error instanceof Error ? error.message : String(error),
        owner_id: context.owner_id
      });
      
      return {
        success: false,
        stats: {
          ease_ranges: [],
          average_ease: 2.5,
          median_ease: 2.5,
          min_ease: 2.5,
          max_ease: 2.5,
          cards_below_default: 0,
          cards_above_default: 0,
        },
        message: `Error generating ease histogram: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
});

// ===============================
// Comprehensive Statistics Tool
// ===============================

export const getComprehensiveStatsTool = createTool({
  id: "get-comprehensive-stats-tool",
  description: `Get a comprehensive overview of all statistics including due cards, retention, streaks, and ease distribution`,
  inputSchema: z.object({
    owner_id: z.coerce.number().describe("User identifier to get comprehensive statistics for"),
    timezone: z.string().default("Europe/Stockholm").describe("Timezone for date calculations"),
    success_threshold: z.number().min(0).max(5).default(3).describe("Minimum grade considered successful (0-5)"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    stats: z.object({
      due_cards: z.object({
        total_cards: z.number(),
        new_cards: z.number(),
        due_cards: z.number(),
        learning_cards: z.number(),
        review_cards: z.number(),
        overdue_cards: z.number(),
        cards_due_today: z.number(),
        cards_due_tomorrow: z.number(),
        average_ease: z.number(),
        total_reviews: z.number(),
      }),
      retention: z.object({
        total_reviews: z.number(),
        successful_reviews: z.number(),
        retention_rate: z.number(),
        average_grade: z.number(),
        reviews_last_7_days: z.number(),
        reviews_last_30_days: z.number(),
        success_rate_last_7_days: z.number(),
        success_rate_last_30_days: z.number(),
        mature_cards: z.number(),
        young_cards: z.number(),
      }),
      streaks: z.object({
        current_streak: z.number(),
        longest_streak: z.number(),
        total_study_days: z.number(),
        days_since_last_review: z.number(),
        reviews_today: z.number(),
        average_daily_reviews: z.number(),
        streak_start_date: z.string().nullable(),
        last_review_date: z.string().nullable(),
      }),
      ease_summary: z.object({
        average_ease: z.number(),
        median_ease: z.number(),
        cards_below_default: z.number(),
        cards_above_default: z.number(),
      }),
    }),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info('🔧 [GetComprehensiveStats] Starting comprehensive statistics with params:', context);

    try {
      // Use the helper functions to get comprehensive data  
      const [dueCardsStats, retentionStats, streakStats, easeStats] = await Promise.all([
        getDueCardsStats(context.owner_id, context.timezone, logger),
        getRetentionStats(context.owner_id, context.success_threshold, logger),
        getStreakStats(context.owner_id, context.timezone, logger),
        getEaseHistogram(context.owner_id, 0.2, logger)
      ]);

      logger?.info('✅ [GetComprehensiveStats] Successfully compiled comprehensive statistics:', {
        owner_id: context.owner_id,
        total_cards: dueCardsStats.total_cards,
        retention_rate: retentionStats.retention_rate.toFixed(1) + '%',
        current_streak: streakStats.current_streak,
        average_ease: easeStats.average_ease.toFixed(2)
      });

      return {
        success: true,
        stats: {
          due_cards: dueCardsStats,
          retention: retentionStats,
          streaks: streakStats,
          ease_summary: {
            average_ease: easeStats.average_ease,
            median_ease: easeStats.median_ease,
            cards_below_default: easeStats.cards_below_default,
            cards_above_default: easeStats.cards_above_default,
          },
        },
        message: `Successfully compiled comprehensive statistics for user with ${dueCardsStats.total_cards} total cards`
      };
    } catch (error) {
      logger?.error('❌ [GetComprehensiveStats] Error compiling comprehensive statistics:', {
        error: error instanceof Error ? error.message : String(error),
        owner_id: context.owner_id
      });
      
      // Return default stats structure
      return {
        success: false,
        stats: {
          due_cards: {
            total_cards: 0, new_cards: 0, due_cards: 0, learning_cards: 0, review_cards: 0,
            overdue_cards: 0, cards_due_today: 0, cards_due_tomorrow: 0, average_ease: 2.5, total_reviews: 0,
          },
          retention: {
            total_reviews: 0, successful_reviews: 0, retention_rate: 0, average_grade: 0,
            reviews_last_7_days: 0, reviews_last_30_days: 0, success_rate_last_7_days: 0,
            success_rate_last_30_days: 0, mature_cards: 0, young_cards: 0,
          },
          streaks: {
            current_streak: 0, longest_streak: 0, total_study_days: 0, days_since_last_review: 0,
            reviews_today: 0, average_daily_reviews: 0, streak_start_date: null, last_review_date: null,
          },
          ease_summary: {
            average_ease: 2.5, median_ease: 2.5, cards_below_default: 0, cards_above_default: 0,
          },
        },
        message: `Error compiling comprehensive statistics: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
});