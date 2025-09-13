/**
 * SM-2 Spaced Repetition Algorithm Implementation
 * Based on the original SM-2 algorithm with exact logic as specified
 */

export interface SM2Data {
  repetitions: number;
  interval_days: number;
  ease_factor: number;
  due_date: string; // ISO date string (YYYY-MM-DD)
  last_grade?: number;
  lapses: number;
}

export interface SM2Result {
  repetitions: number;
  interval_days: number;
  ease_factor: number;
  due_date: string;
  lapses: number;
}

/**
 * Calculate the next review date and update SM-2 parameters
 * Implements the exact SM-2 algorithm as specified in the requirements
 * 
 * @param currentData Current SM-2 state
 * @param grade Grade given (0-5)
 * @returns Updated SM-2 state
 */
export function calculateSM2(currentData: SM2Data, grade: number): SM2Result {
  if (grade < 0 || grade > 5) {
    throw new Error('Grade must be between 0 and 5');
  }

  let { repetitions, interval_days, ease_factor, lapses } = currentData;
  
  // SM-2 Algorithm Implementation (verbatim from specification)
  if (grade < 3) {
    // Lapse: reset repetitions and set short interval
    repetitions = 0;
    interval_days = 1;
    lapses += 1;
  } else {
    // Successful recall: update ease factor and calculate new interval
    ease_factor = Math.max(1.3, ease_factor + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)));
    
    if (repetitions === 0) {
      interval_days = 1;
    } else if (repetitions === 1) {
      interval_days = 6;
    } else {
      interval_days = Math.round(interval_days * ease_factor);
    }
    
    repetitions += 1;
  }
  
  // Calculate due date
  const today = new Date();
  const dueDate = new Date(today);
  dueDate.setDate(today.getDate() + interval_days);
  
  return {
    repetitions,
    interval_days,
    ease_factor,
    due_date: dueDate.toISOString().split('T')[0], // YYYY-MM-DD format
    lapses
  };
}

/**
 * Initialize SM-2 data for a new card
 */
export function initializeSM2(): SM2Data {
  const today = new Date().toISOString().split('T')[0];
  
  return {
    repetitions: 0,
    interval_days: 0,
    ease_factor: 2.5,
    due_date: today,
    lapses: 0
  };
}

/**
 * Check if a card is due for review
 */
export function isCardDue(sm2Data: SM2Data): boolean {
  const today = new Date().toISOString().split('T')[0];
  return sm2Data.due_date <= today;
}

/**
 * Get the queue type based on SM-2 state
 */
export function getQueueType(sm2Data: SM2Data): 'new' | 'learning' | 'review' {
  if (sm2Data.repetitions === 0) {
    return 'new';
  } else if (sm2Data.repetitions <= 2) {
    return 'learning';
  } else {
    return 'review';
  }
}

/**
 * Calculate retention statistics based on review history
 */
export function calculateRetention(grades: number[]): number {
  if (grades.length === 0) return 0;
  
  const successful = grades.filter(grade => grade >= 3).length;
  return (successful / grades.length) * 100;
}

/**
 * Generate ease factor histogram buckets for statistics
 */
export function getEaseHistogram(easeFactors: number[]): { [bucket: string]: number } {
  const buckets = {
    '1.3-1.5': 0,
    '1.5-1.8': 0,
    '1.8-2.2': 0,
    '2.2-2.5': 0,
    '2.5-3.0': 0,
    '3.0+': 0
  };
  
  easeFactors.forEach(ef => {
    if (ef < 1.5) buckets['1.3-1.5']++;
    else if (ef < 1.8) buckets['1.5-1.8']++;
    else if (ef < 2.2) buckets['1.8-2.2']++;
    else if (ef < 2.5) buckets['2.2-2.5']++;
    else if (ef < 3.0) buckets['2.5-3.0']++;
    else buckets['3.0+']++;
  });
  
  return buckets;
}