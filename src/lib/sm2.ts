export interface SM2State {
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  lapses: number;
}

export interface SM2Result {
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  lapses: number;
}

/**
 * Apply the SM-2 spaced repetition algorithm to update scheduling state.
 * Ensures all returned values are finite and defaults sensibly on bad input.
 */
export function applySM2(grade: number, state: SM2State): SM2Result {
  let { easeFactor, intervalDays, repetitions, lapses } = state;

  // Defensive defaults for malformed state
  if (!Number.isFinite(easeFactor)) easeFactor = 2.5;
  if (!Number.isFinite(intervalDays)) intervalDays = 0;
  if (!Number.isFinite(repetitions)) repetitions = 0;
  if (!Number.isFinite(lapses)) lapses = 0;

  const q = Math.round(grade);

  // Ease factor update
  easeFactor = easeFactor - 0.8 + 0.28 * q - 0.02 * q * q;
  if (easeFactor < 1.3 || !Number.isFinite(easeFactor)) easeFactor = 1.3;

  let nextInterval: number;
  if (q < 3) {
    repetitions = 0;
    lapses += 1;
    nextInterval = 1;
  } else {
    if (repetitions === 0) {
      nextInterval = 1;
    } else if (repetitions === 1) {
      nextInterval = 6;
    } else {
      nextInterval = Math.round(intervalDays * easeFactor);
    }
    repetitions += 1;
  }

  if (!Number.isFinite(nextInterval) || nextInterval < 1) {
    nextInterval = 1;
  }

  if (!Number.isFinite(repetitions) || repetitions < 0) repetitions = 0;
  if (!Number.isFinite(lapses) || lapses < 0) lapses = 0;

  return {
    easeFactor,
    intervalDays: nextInterval,
    repetitions,
    lapses,
  };
}
