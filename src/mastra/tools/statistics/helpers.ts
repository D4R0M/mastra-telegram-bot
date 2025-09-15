import { getPool } from "../../../db/client";
import type { IMastraLogger } from "@mastra/core/logger";
import NodeCache from "node-cache";

// ===============================
// Statistics Helper Functions
// ===============================

// Helper function to format dates
function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

// In-memory cache for statistics with 1 minute TTL
const statsCache = new NodeCache({ stdTTL: 60 });

interface DueCardsStats {
  total_cards: number;
  new_cards: number;
  learning_cards: number;
  review_cards: number;
  due_cards: number;
  overdue_cards: number;
  cards_due_today: number;
  cards_due_tomorrow: number;
  average_ease: number;
  total_reviews: number;
}

interface RetentionStats {
  total_reviews: number;
  successful_reviews: number;
  retention_rate: number;
  average_grade: number;
  reviews_last_7_days: number;
  reviews_last_30_days: number;
  success_rate_last_7_days: number;
  success_rate_last_30_days: number;
  mature_cards: number;
  young_cards: number;
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
  ease_ranges: { range: string; count: number; percentage: number }[];
  average_ease: number;
  median_ease: number;
  min_ease: number;
  max_ease: number;
  cards_below_default: number;
  cards_above_default: number;
}

export async function getDueCardsStats(
  user_id: string,
  timezone: string = "Europe/Stockholm",
  logger?: IMastraLogger,
) {
  const cacheKey = `dueCards:${user_id}`;
  const cached = statsCache.get<DueCardsStats>(cacheKey);
  if (cached) {
    logger?.info("📝 [StatisticsHelper] Returning cached due cards statistics");
    return cached;
  }

  logger?.info("📝 [StatisticsHelper] Calculating due cards statistics");

  const pool = getPool();
  const today = new Date().toISOString().split("T")[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];

  const statsQuery = `
    SELECT
      COUNT(*) as total_cards,
      COUNT(CASE WHEN rs.queue = 'new' THEN 1 END) as new_cards,
      COUNT(CASE WHEN rs.queue = 'learning' THEN 1 END) as learning_cards,
      COUNT(CASE WHEN rs.queue = 'review' THEN 1 END) as review_cards,
      COUNT(CASE WHEN rs.due_date <= $2 THEN 1 END) as due_cards,
      COUNT(CASE WHEN rs.due_date < $2 THEN 1 END) as overdue_cards,
      COUNT(CASE WHEN rs.due_date = $2 THEN 1 END) as cards_due_today,
      COUNT(CASE WHEN rs.due_date = $3 THEN 1 END) as cards_due_tomorrow,
      COALESCE(AVG(rs.ease_factor), 2.5) as average_ease,
      COALESCE(SUM(rs.repetitions), 0) as total_reviews
    FROM review_state rs
    JOIN cards c ON rs.card_id = c.id
    WHERE rs.user_id = $1::bigint AND c.active = true
  `;

  const result = await pool.query(statsQuery, [user_id, today, tomorrow]);
  const stats = result.rows[0] || {};

  const formatted: DueCardsStats = {
    total_cards: parseInt(stats.total_cards) || 0,
    new_cards: parseInt(stats.new_cards) || 0,
    learning_cards: parseInt(stats.learning_cards) || 0,
    review_cards: parseInt(stats.review_cards) || 0,
    due_cards: parseInt(stats.due_cards) || 0,
    overdue_cards: parseInt(stats.overdue_cards) || 0,
    cards_due_today: parseInt(stats.cards_due_today) || 0,
    cards_due_tomorrow: parseInt(stats.cards_due_tomorrow) || 0,
    average_ease: parseFloat(stats.average_ease) || 2.5,
    total_reviews: parseInt(stats.total_reviews) || 0,
  };

  statsCache.set(cacheKey, formatted);
  return formatted;
}

export async function getRetentionStats(
  user_id: string,
  success_threshold: number = 3,
  logger?: IMastraLogger,
) {
  const cacheKey = `retention:${user_id}`;
  const cached = statsCache.get<RetentionStats>(cacheKey);
  if (cached) {
    logger?.info("📝 [StatisticsHelper] Returning cached retention statistics");
    return cached;
  }

  logger?.info("📝 [StatisticsHelper] Calculating retention statistics");

  const pool = getPool();
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

  const retentionQuery = `
    WITH review_stats AS (
      SELECT 
        COUNT(*) as total_reviews,
        COUNT(CASE WHEN rl.grade >= $2 THEN 1 END) as successful_reviews,
        AVG(rl.grade::float) as average_grade,
        COUNT(CASE WHEN rl.reviewed_at >= $3 THEN 1 END) as reviews_last_7_days,
        COUNT(CASE WHEN rl.reviewed_at >= $4 THEN 1 END) as reviews_last_30_days,
        COUNT(CASE WHEN rl.reviewed_at >= $3 AND rl.grade >= $2 THEN 1 END) as successful_last_7_days,
        COUNT(CASE WHEN rl.reviewed_at >= $4 AND rl.grade >= $2 THEN 1 END) as successful_last_30_days
      FROM review_log rl
      JOIN cards c ON rl.card_id = c.id
      WHERE rl.user_id = $1::bigint AND c.active = true
    ),
    card_maturity AS (
      SELECT 
        COUNT(CASE WHEN rs.interval_days >= 21 THEN 1 END) as mature_cards,
        COUNT(CASE WHEN rs.interval_days < 21 AND rs.interval_days > 0 THEN 1 END) as young_cards
      FROM review_state rs
      JOIN cards c ON rs.card_id = c.id
      WHERE rs.user_id = $1::bigint AND c.active = true
    )
    SELECT 
      rs.*,
      cm.mature_cards,
      cm.young_cards
    FROM review_stats rs, card_maturity cm
  `;

  const result = await pool.query(retentionQuery, [
    user_id,
    success_threshold,
    sevenDaysAgo,
    thirtyDaysAgo,
  ]);

  const stats = result.rows[0] || {};

  const formatted: RetentionStats = {
    total_reviews: parseInt(stats.total_reviews) || 0,
    successful_reviews: parseInt(stats.successful_reviews) || 0,
    retention_rate:
      stats.total_reviews > 0
        ? (parseInt(stats.successful_reviews) / parseInt(stats.total_reviews)) *
          100
        : 0,
    average_grade: parseFloat(stats.average_grade) || 0,
    reviews_last_7_days: parseInt(stats.reviews_last_7_days) || 0,
    reviews_last_30_days: parseInt(stats.reviews_last_30_days) || 0,
    success_rate_last_7_days:
      stats.reviews_last_7_days > 0
        ? (parseInt(stats.successful_last_7_days) /
            parseInt(stats.reviews_last_7_days)) *
          100
        : 0,
    success_rate_last_30_days:
      stats.reviews_last_30_days > 0
        ? (parseInt(stats.successful_last_30_days) /
            parseInt(stats.reviews_last_30_days)) *
          100
        : 0,
    mature_cards: parseInt(stats.mature_cards) || 0,
    young_cards: parseInt(stats.young_cards) || 0,
  };

  statsCache.set(cacheKey, formatted);
  return formatted;
}

export async function getStreakStats(
  user_id: string,
  timezone: string = "Europe/Stockholm",
  logger?: IMastraLogger,
) {
  const cacheKey = `streak:${user_id}`;
  const cached = statsCache.get<StreakStats>(cacheKey);
  if (cached) {
    logger?.info("📝 [StatisticsHelper] Returning cached streak statistics");
    return cached;
  }

  logger?.info("📝 [StatisticsHelper] Calculating streak statistics");

  const pool = getPool();
  const today = new Date().toISOString().split("T")[0];

  // Get review dates and counts
  const reviewDatesQuery = `
    SELECT
      DATE(rl.reviewed_at) as review_date,
      COUNT(*) as reviews_count
    FROM review_log rl
    WHERE rl.user_id = $1::bigint
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
    JOIN (
      SELECT DATE(reviewed_at) as date, COUNT(*) as daily_reviews
      FROM review_log rl2
      WHERE rl2.user_id = $1::bigint
      GROUP BY DATE(reviewed_at)
    ) daily_counts ON DATE(rl.reviewed_at) = daily_counts.date
    WHERE rl.user_id = $1::bigint
  `;

  const [reviewDatesResult, overallStatsResult] = await Promise.all([
    pool.query(reviewDatesQuery, [user_id]),
    pool.query(overallStatsQuery, [user_id, today]),
  ]);

  const reviewDates = reviewDatesResult.rows.map((row) => ({
    date: row.review_date,
    count: parseInt(row.reviews_count),
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
    const daysSinceLastReview = Math.floor(
      (todayDate.getTime() - mostRecentDate.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (daysSinceLastReview <= 1) {
      // Current streak is active
      currentStreakLength = 1;
      streakStartDate = reviewDates[0].date;

      // Count consecutive days backwards
      for (let i = 1; i < reviewDates.length; i++) {
        const currentDate = new Date(reviewDates[i - 1].date);
        const previousDate = new Date(reviewDates[i].date);
        const daysDiff = Math.floor(
          (currentDate.getTime() - previousDate.getTime()) /
            (1000 * 60 * 60 * 24),
        );

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
      const currentDate = new Date(reviewDates[i - 1].date);
      const previousDate = new Date(reviewDates[i].date);
      const daysDiff = Math.floor(
        (currentDate.getTime() - previousDate.getTime()) /
          (1000 * 60 * 60 * 24),
      );

      if (daysDiff === 1) {
        tempStreak++;
      } else {
        longestStreak = Math.max(longestStreak, tempStreak);
        tempStreak = 1;
      }
    }
    longestStreak = Math.max(longestStreak, tempStreak, currentStreak);
  }

  const formatted: StreakStats = {
    current_streak: currentStreak,
    longest_streak: longestStreak,
    total_study_days: parseInt(overallStats.total_study_days) || 0,
    days_since_last_review:
      reviewDates.length > 0
        ? Math.floor(
            (new Date(today).getTime() -
              new Date(reviewDates[0].date).getTime()) /
              (1000 * 60 * 60 * 24),
          )
        : 0,
    reviews_today: parseInt(overallStats.reviews_today) || 0,
    average_daily_reviews: parseFloat(overallStats.average_daily_reviews) || 0,
    streak_start_date: streakStartDate,
    last_review_date: overallStats.last_review_date
      ? new Date(overallStats.last_review_date).toISOString().split("T")[0]
      : null,
  };

  statsCache.set(cacheKey, formatted);
  return formatted;
}

export async function getEaseHistogram(
  user_id: string,
  bin_size: number = 0.2,
  logger?: IMastraLogger,
) {
  const cacheKey = `easeHistogram:${user_id}`;
  const cached = statsCache.get<EaseHistogram>(cacheKey);
  if (cached) {
    logger?.info("📝 [StatisticsHelper] Returning cached ease histogram");
    return cached;
  }

  logger?.info("📝 [StatisticsHelper] Generating ease histogram");

  const pool = getPool();

  // Get all ease factors
  const easeQuery = `
    SELECT rs.ease_factor
    FROM review_state rs
    JOIN cards c ON rs.card_id = c.id
    WHERE rs.user_id = $1::bigint AND c.active = true
    ORDER BY rs.ease_factor
  `;

  const result = await pool.query(easeQuery, [user_id]);

  if (result.rows.length === 0) {
    const empty: EaseHistogram = {
      ease_ranges: [],
      average_ease: 2.5,
      median_ease: 2.5,
      min_ease: 2.5,
      max_ease: 2.5,
      cards_below_default: 0,
      cards_above_default: 0,
    };
    statsCache.set(cacheKey, empty);
    return empty;
  }

  const easeFactors = result.rows.map((row) => parseFloat(row.ease_factor));
  const totalCards = easeFactors.length;

  // Calculate basic statistics
  const averageEase =
    easeFactors.reduce((sum, ease) => sum + ease, 0) / totalCards;
  const minEase = Math.min(...easeFactors);
  const maxEase = Math.max(...easeFactors);

  // Calculate proper median for sorted array
  let medianEase: number;
  if (totalCards % 2 === 0) {
    // Even number: average of two middle values
    medianEase =
      (easeFactors[totalCards / 2 - 1] + easeFactors[totalCards / 2]) / 2;
  } else {
    // Odd number: middle value
    medianEase = easeFactors[Math.floor(totalCards / 2)];
  }

  const cardsBelowDefault = easeFactors.filter((ease) => ease < 2.5).length;
  const cardsAboveDefault = easeFactors.filter((ease) => ease > 2.5).length;

  // Create histogram bins
  const minBin = Math.floor(minEase / bin_size) * bin_size;
  const maxBin = Math.ceil(maxEase / bin_size) * bin_size;
  const bins: { [key: string]: number } = {};

  // Initialize bins
  for (let bin = minBin; bin <= maxBin; bin += bin_size) {
    const binKey = `${bin.toFixed(1)}-${(bin + bin_size).toFixed(1)}`;
    bins[binKey] = 0;
  }

  // Fill bins
  easeFactors.forEach((ease) => {
    const binStart = Math.floor(ease / bin_size) * bin_size;
    const binKey = `${binStart.toFixed(1)}-${(binStart + bin_size).toFixed(1)}`;
    if (bins[binKey] !== undefined) {
      bins[binKey]++;
    }
  });

  // Convert to histogram format
  const easeRanges = Object.entries(bins)
    .map(([range, count]) => ({
      range,
      count,
      percentage: (count / totalCards) * 100,
    }))
    .filter((item) => item.count > 0);

  const formatted: EaseHistogram = {
    ease_ranges: easeRanges,
    average_ease: averageEase,
    median_ease: medianEase,
    min_ease: minEase,
    max_ease: maxEase,
    cards_below_default: cardsBelowDefault,
    cards_above_default: cardsAboveDefault,
  };

  statsCache.set(cacheKey, formatted);
  return formatted;
}
