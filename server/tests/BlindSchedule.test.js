'use strict';

/**
 * BlindSchedule unit tests.
 * No DB dependencies — pure class tests.
 */

const { BlindSchedule } = require('../game/controllers/BlindSchedule');

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
    test('returns first level on construction', () => {
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
    test('returns next level and updates currentIndex', () => {
      const sched = makeSched();
      const next = sched.advance();
      expect(next).toEqual(LEVELS[1]);
      expect(sched.currentIndex).toBe(1);
    });

    test('returns null when already at last level', () => {
      const sched = makeSched();
      sched.advance(); // → level 2
      sched.advance(); // → level 3 (final)
      const result = sched.advance(); // already at final
      expect(result).toBeNull();
      expect(sched.currentIndex).toBe(LEVELS.length - 1);
    });

    test('sets levelStartTime on advance', () => {
      const sched = makeSched();
      const before = Date.now();
      sched.advance();
      const after = Date.now();
      expect(sched.levelStartTime).toBeGreaterThanOrEqual(before);
      expect(sched.levelStartTime).toBeLessThanOrEqual(after);
    });
  });

  // ── getTimeRemainingMs ─────────────────────────────────────────────────────

  describe('getTimeRemainingMs', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    test('returns positive number after advance with fake timers', () => {
      jest.useFakeTimers();
      const sched = makeSched();
      sched.advance(); // starts level 2, 20-minute duration
      jest.advanceTimersByTime(5 * 60_000); // 5 minutes elapsed
      const remaining = sched.getTimeRemainingMs();
      // 20 min - 5 min = 15 min = 900_000 ms
      expect(remaining).toBe(15 * 60_000);
      expect(remaining).toBeGreaterThan(0);
    });

    test('returns null when levelStartTime is null (before any advance)', () => {
      const sched = makeSched();
      expect(sched.levelStartTime).toBeNull();
      expect(sched.getTimeRemainingMs()).toBeNull();
    });

    test('returns 0 (not negative) when time has fully elapsed', () => {
      jest.useFakeTimers();
      const sched = makeSched();
      sched.advance(); // 20-minute level
      jest.advanceTimersByTime(25 * 60_000); // 25 minutes elapsed
      expect(sched.getTimeRemainingMs()).toBe(0);
    });
  });

  // ── isAtFinalLevel ─────────────────────────────────────────────────────────

  describe('isAtFinalLevel', () => {
    test('returns false on initial construction (index 0) with multiple levels', () => {
      const sched = makeSched();
      expect(sched.isAtFinalLevel()).toBe(false);
    });

    test('returns false at intermediate level', () => {
      const sched = makeSched();
      sched.advance(); // → level 2 (not final)
      expect(sched.isAtFinalLevel()).toBe(false);
    });

    test('returns true on last level', () => {
      const sched = makeSched();
      sched.advance(); // → level 2
      sched.advance(); // → level 3 (final)
      expect(sched.isAtFinalLevel()).toBe(true);
    });

    test('returns true for a single-level schedule', () => {
      const sched = new BlindSchedule([LEVELS[0]]);
      expect(sched.isAtFinalLevel()).toBe(true);
    });
  });
});
