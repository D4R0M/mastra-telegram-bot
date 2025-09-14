import { describe, it, expect } from 'vitest';
import { applySM2, SM2State } from '../src/lib/sm2.ts';

const newState: SM2State = {
  easeFactor: 2.5,
  intervalDays: 0,
  repetitions: 0,
  lapses: 0,
};

describe('applySM2', () => {
  it('handles failure on new card', () => {
    const result = applySM2(2, { ...newState });
    expect(result.intervalDays).toBe(1);
    expect(result.repetitions).toBe(0);
    expect(result.lapses).toBe(1);
  });

  it('handles success on new card', () => {
    const result = applySM2(4, { ...newState });
    expect(result.intervalDays).toBe(1);
    expect(result.repetitions).toBe(1);
  });

  it('schedules second success at six days', () => {
    const first = applySM2(4, { ...newState });
    const second = applySM2(4, first);
    expect(second.intervalDays).toBe(6);
  });

  it('grows interval using ease factor', () => {
    let state = applySM2(4, { ...newState }); // 1 day
    state = applySM2(4, state); // 6 days
    const third = applySM2(4, state); // should grow by EF (≈2.5)
    expect(third.intervalDays).toBe(Math.round(6 * third.easeFactor));
  });

  it('never returns NaN interval', () => {
    const bad: SM2State = {
      easeFactor: NaN,
      intervalDays: NaN,
      repetitions: NaN,
      lapses: NaN,
    };
    const result = applySM2(5, bad);
    expect(Number.isFinite(result.intervalDays)).toBe(true);
  });
});
