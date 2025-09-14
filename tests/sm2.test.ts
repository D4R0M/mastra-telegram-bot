import { describe, it, expect } from 'vitest';
import { calculateSM2, initializeSM2 } from '../src/db/sm2.ts';

// Helper to extract interval
function runSequence(grades: number[]) {
  let data = initializeSM2();
  const intervals: number[] = [];
  grades.forEach((g) => {
    data = calculateSM2(data, g);
    intervals.push(data.interval_days);
  });
  return { data, intervals };
}

describe('SM-2 algorithm', () => {
  it('follows golden path intervals for strong performance', () => {
    const { intervals } = runSequence([4, 5, 5, 5]);
    expect(intervals).toEqual([1, 6, 16, 43]);
  });

  it('resets scheduling after a failed review', () => {
    let data = initializeSM2();
    data = calculateSM2(data, 5);
    data = calculateSM2(data, 5);
    // Failing grade
    data = calculateSM2(data, 2);
    expect(data.repetitions).toBe(0);
    expect(data.interval_days).toBe(1);
    expect(data.lapses).toBe(1);
  });

  it('clamps ease factor to a minimum of 1.3', () => {
    let data = initializeSM2();
    for (let i = 0; i < 10; i++) {
      data = calculateSM2(data, 0);
    }
    expect(data.ease_factor).toBeGreaterThanOrEqual(1.3);
  });
});
