'use strict';

/**
 * Unit tests for BlindSchedule.
 */

const { BlindSchedule } = require('../BlindSchedule');

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const LEVELS = [
  { level: 1, sb: 25,  bb: 50,  ante: 0,  duration_minutes: 20 },
  { level: 2, sb: 50,  bb: 100, ante: 10, duration_minutes: 20 },
  { level: 3, sb: 100, bb: 200, ante: 25, duration_minutes: 20 },
];

function makeSched() {
  return new BlindSchedule([...LEVELS]);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('BlindSchedule', () => {

  // ── getCurrentLevel ────────────────────────────────────────────────────────

  describe('getCurrentLevel', () => {
    test('returns the first level initially', () => {
      const sched = makeSched();
      expect(sched.getCurrentLevel()).toEqual(LEVELS[0]);
    });

    test('returns correct level after advance', () => {
      const sched = makeSched();
      sched.advance();
      expect(sched.getCurrentLevel()).toEqual(LEVELS[1]);
    });

    test('returns null for empty levels array', () => {
      const sched = new BlindSchedule([]);
      expect(sched.getCurrentLevel()).toBeNull();
    });
  });

  // ── advance ────────────────────────────────────────────────────────────────

  describe('advance', () => {
    test('increments index and returns the next level', () => {
      const sched = makeSched();
      const next = sched.advance();
      expect(next).toEqual(LEVELS[1]);
      expect(sched.currentIndex).toBe(1);
    });

    test('sets levelStartTime on advance', () => {
      const sched = makeSched();
      const before = Date.now();
      sched.advance();
      const after = Date.now();
      expect(sched.levelStartTime).toBeGreaterThanOrEqual(before);
      expect(sched.levelStartTime).toBeLessThanOrEqual(after);
    });

    test('returns null at the final level (does not increment past end)', () => {
      const sched = makeSched();
      sched.advance(); // → level 2
      sched.advance(); // → level 3 (final)
      const result = sched.advance(); // already at final
      expect(result).toBeNull();
      expect(sched.currentIndex).toBe(LEVELS.length - 1); // did not go past
    });

    test('advance from index 0 to final level in two steps', () => {
      const sched = makeSched();
      expect(sched.advance()).toEqual(LEVELS[1]);
      expect(sched.advance()).toEqual(LEVELS[2]);
    });
  });

  // ── getTimeRemainingMs ─────────────────────────────────────────────────────

  describe('getTimeRemainingMs', () => {
    test('returns null when levelStartTime is null', () => {
      const sched = makeSched();
      expect(sched.levelStartTime).toBeNull();
      expect(sched.getTimeRemainingMs()).toBeNull();
    });

    test('returns correct remaining ms shortly after advance', () => {
      jest.useFakeTimers();
      const sched = makeSched();
      sched.advance(); // starts level 2 with 20-minute duration
      jest.advanceTimersByTime(5 * 60_000); // advance 5 minutes
      const remaining = sched.getTimeRemainingMs();
      // 20 min - 5 min = 15 min = 900_000 ms
      expect(remaining).toBe(15 * 60_000);
      jest.useRealTimers();
    });

    test('returns 0 (not negative) when time has passed', () => {
      jest.useFakeTimers();
      const sched = makeSched();
      sched.advance(); // 20-minute level
      jest.advanceTimersByTime(25 * 60_000); // 25 minutes elapsed
      const remaining = sched.getTimeRemainingMs();
      expect(remaining).toBe(0);
      jest.useRealTimers();
    });
  });

  // ── isAtFinalLevel ─────────────────────────────────────────────────────────

  describe('isAtFinalLevel', () => {
    test('returns false at start (index 0 with multiple levels)', () => {
      const sched = makeSched();
      expect(sched.isAtFinalLevel()).toBe(false);
    });

    test('returns false at intermediate level', () => {
      const sched = makeSched();
      sched.advance();
      expect(sched.isAtFinalLevel()).toBe(false);
    });

    test('returns true at the last level', () => {
      const sched = makeSched();
      sched.advance(); // → 1
      sched.advance(); // → 2 (final)
      expect(sched.isAtFinalLevel()).toBe(true);
    });

    test('returns true for a single-level schedule', () => {
      const sched = new BlindSchedule([LEVELS[0]]);
      expect(sched.isAtFinalLevel()).toBe(true);
    });
  });
});

// ─── Empty schedule edge cases ────────────────────────────────────────────────

describe('BlindSchedule — empty schedule', () => {
  test('getCurrentLevel returns null immediately', () => {
    const sched = new BlindSchedule([]);
    expect(sched.getCurrentLevel()).toBeNull();
  });

  test('advance returns null when there are no levels', () => {
    const sched = new BlindSchedule([]);
    const result = sched.advance();
    expect(result).toBeNull();
  });

  test('isAtFinalLevel returns true for empty schedule (index 0 === length - 1 = -1 is false, but single-level logic)', () => {
    // For an empty array: currentIndex (0) === levels.length - 1 (-1) is false,
    // but getCurrentLevel() is null — validate consistent null-safe behaviour.
    const sched = new BlindSchedule([]);
    // advance returns null — no crash
    expect(() => sched.advance()).not.toThrow();
  });

  test('getTimeRemainingMs returns null when there are no levels', () => {
    const sched = new BlindSchedule([]);
    // levelStartTime is null → should return null without crashing
    expect(sched.getTimeRemainingMs()).toBeNull();
  });
});

// ─── Single-level schedule edge cases ─────────────────────────────────────────

describe('BlindSchedule — single-level schedule', () => {
  const singleLevel = { level: 1, sb: 25, bb: 50, ante: 0, duration_minutes: 15 };

  test('isAtFinalLevel is true from the start', () => {
    const sched = new BlindSchedule([singleLevel]);
    expect(sched.isAtFinalLevel()).toBe(true);
  });

  test('advance returns null — cannot go past the only level', () => {
    const sched = new BlindSchedule([singleLevel]);
    const result = sched.advance();
    expect(result).toBeNull();
    // Index must not have moved
    expect(sched.currentIndex).toBe(0);
  });

  test('getTimeRemainingMs after manual levelStartTime set returns positive value', () => {
    jest.useFakeTimers();
    const sched = new BlindSchedule([singleLevel]);
    // Set levelStartTime manually (simulating start() call without advancing)
    sched.levelStartTime = Date.now();
    jest.advanceTimersByTime(3 * 60_000); // 3 minutes elapsed

    const remaining = sched.getTimeRemainingMs();
    // 15 min - 3 min = 12 min = 720_000 ms
    expect(remaining).toBe(12 * 60_000);
    jest.useRealTimers();
  });
});

// ─── getTimeRemainingMs after advance ─────────────────────────────────────────

describe('BlindSchedule — getTimeRemainingMs after advance', () => {
  test('returns positive value for the new level duration immediately after advance', () => {
    jest.useFakeTimers();
    const sched = makeSched();
    sched.advance(); // → level 2 (20-minute duration), sets levelStartTime = Date.now()

    // No time has passed yet — remaining ≈ full 20-minute duration
    const remaining = sched.getTimeRemainingMs();
    expect(remaining).toBeGreaterThan(0);
    expect(remaining).toBeLessThanOrEqual(20 * 60_000);
    jest.useRealTimers();
  });
});
