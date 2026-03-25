'use strict';

/**
 * RangeParser.silent.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests that RangeParser never throws on bad input and degrades gracefully.
 *
 * Covered cases:
 *   1.  null input → empty array (parseRange)
 *   2.  undefined input → empty array (parseRange)
 *   3.  empty string → empty array (parseRange)
 *   4.  whitespace-only string → empty array (parseRange)
 *   5.  purely nonsense string "XXXXXXXXX" → empty array
 *   6.  number input → empty array (not throws)
 *   7.  object input → empty array (not throws)
 *   8.  partially valid mix "AKo, INVALID, QQ" → only valid combos returned
 *   9.  range with junk separator tokens → valid tokens still parsed
 *  10.  validateRange: null → { valid: false }
 *  11.  validateRange: empty string → { valid: false }
 *  12.  validateRange: nonsense → { valid: false, error defined }
 *  13.  validateRange: "AKo" → { valid: true, comboCount: 12 }
 *  14.  pickFromRange: null → null (not throws)
 *  15.  pickFromRange: empty string → null (not throws)
 *  16.  pickFromRange: "XXXXXXXXX" → null
 *  17.  pickFromRange: valid range, empty usedCards → returns a 2-card array
 *  18.  pickFromRange: all combos blocked → returns null
 */

const { parseRange, validateRange, pickFromRange } = require('../RangeParser');

// ─────────────────────────────────────────────
//  parseRange — null / undefined / empty
// ─────────────────────────────────────────────

describe('parseRange — null and undefined input', () => {
  it('returns [] for null, does not throw', () => {
    let result;
    expect(() => { result = parseRange(null); }).not.toThrow();
    expect(result).toEqual([]);
  });

  it('returns [] for undefined, does not throw', () => {
    let result;
    expect(() => { result = parseRange(undefined); }).not.toThrow();
    expect(result).toEqual([]);
  });
});

describe('parseRange — empty / whitespace strings', () => {
  it('returns [] for empty string', () => {
    expect(parseRange('')).toEqual([]);
  });

  it('returns [] for whitespace-only string', () => {
    expect(parseRange('   ')).toEqual([]);
  });
});

// ─────────────────────────────────────────────
//  parseRange — nonsense input
// ─────────────────────────────────────────────

describe('parseRange — nonsense input', () => {
  it('returns [] for "XXXXXXXXX", does not throw', () => {
    let result;
    expect(() => { result = parseRange('XXXXXXXXX'); }).not.toThrow();
    expect(result).toEqual([]);
  });

  it('returns [] for single-char junk "Z"', () => {
    expect(parseRange('Z')).toEqual([]);
  });

  it('returns [] for numeric string "12345"', () => {
    expect(parseRange('12345')).toEqual([]);
  });

  it('returns [] for dash-only "-"', () => {
    expect(parseRange('-')).toEqual([]);
  });

  it('returns [] for "AA-ZZ" (invalid rank Z)', () => {
    expect(parseRange('AA-ZZ')).toEqual([]);
  });
});

// ─────────────────────────────────────────────
//  parseRange — non-string types
// ─────────────────────────────────────────────

describe('parseRange — non-string input types', () => {
  it('returns [] for number input, does not throw', () => {
    let result;
    // @ts-ignore — deliberate wrong type
    expect(() => { result = parseRange(42); }).not.toThrow();
    expect(result).toEqual([]);
  });

  it('returns [] for object input, does not throw', () => {
    let result;
    // @ts-ignore — deliberate wrong type
    expect(() => { result = parseRange({}); }).not.toThrow();
    expect(result).toEqual([]);
  });

  it('returns [] for array input, does not throw', () => {
    let result;
    // @ts-ignore — deliberate wrong type
    expect(() => { result = parseRange(['AKo']); }).not.toThrow();
    expect(result).toEqual([]);
  });
});

// ─────────────────────────────────────────────
//  parseRange — partially valid input
// ─────────────────────────────────────────────

describe('parseRange — partial validity', () => {
  it('"AKo, INVALID, QQ" returns only AKo and QQ combos', () => {
    const result = parseRange('AKo, INVALID, QQ');
    // AKo = 12 combos; QQ = 6 combos; INVALID = 0 combos
    expect(result.length).toBe(18);
    // Every returned item should be a 2-element array of strings
    for (const combo of result) {
      expect(combo).toHaveLength(2);
      expect(typeof combo[0]).toBe('string');
      expect(typeof combo[1]).toBe('string');
    }
  });

  it('"AA, XXXXXXXXX, KK" parses valid pairs and ignores junk', () => {
    const result = parseRange('AA, XXXXXXXXX, KK');
    // AA = 6, KK = 6, junk = 0
    expect(result.length).toBe(12);
  });

  it('"JUNK1, JUNK2, JUNK3" returns empty array', () => {
    expect(parseRange('JUNK1, JUNK2, JUNK3')).toEqual([]);
  });

  it('"AKs, , , QJs" handles empty tokens gracefully', () => {
    const result = parseRange('AKs, , , QJs');
    // AKs = 4, QJs = 4
    expect(result.length).toBe(8);
  });
});

// ─────────────────────────────────────────────
//  validateRange
// ─────────────────────────────────────────────

describe('validateRange — invalid inputs return { valid: false }', () => {
  it('null → { valid: false }', () => {
    const r = validateRange(null);
    expect(r.valid).toBe(false);
    expect(r.error).toBeDefined();
  });

  it('empty string → { valid: false }', () => {
    const r = validateRange('');
    expect(r.valid).toBe(false);
    expect(r.error).toBeDefined();
  });

  it('"XXXXXXXXX" → { valid: false } with an error string', () => {
    const r = validateRange('XXXXXXXXX');
    expect(r.valid).toBe(false);
    expect(typeof r.error).toBe('string');
  });

  it('whitespace-only string → { valid: false }', () => {
    const r = validateRange('   ');
    expect(r.valid).toBe(false);
  });
});

describe('validateRange — valid inputs return { valid: true, comboCount }', () => {
  it('"AKo" → { valid: true, comboCount: 12 }', () => {
    const r = validateRange('AKo');
    expect(r.valid).toBe(true);
    expect(r.comboCount).toBe(12);
  });

  it('"AA" → { valid: true, comboCount: 6 }', () => {
    const r = validateRange('AA');
    expect(r.valid).toBe(true);
    expect(r.comboCount).toBe(6);
  });

  it('"AKs, QQ" → { valid: true, comboCount: 10 }', () => {
    const r = validateRange('AKs, QQ');
    expect(r.valid).toBe(true);
    expect(r.comboCount).toBe(10);
  });
});

// ─────────────────────────────────────────────
//  pickFromRange
// ─────────────────────────────────────────────

describe('pickFromRange — null / empty / invalid range', () => {
  it('returns null for null input, does not throw', () => {
    let result;
    expect(() => { result = pickFromRange(null); }).not.toThrow();
    expect(result).toBeNull();
  });

  it('returns null for empty string, does not throw', () => {
    let result;
    expect(() => { result = pickFromRange(''); }).not.toThrow();
    expect(result).toBeNull();
  });

  it('returns null for "XXXXXXXXX", does not throw', () => {
    let result;
    expect(() => { result = pickFromRange('XXXXXXXXX'); }).not.toThrow();
    expect(result).toBeNull();
  });
});

describe('pickFromRange — valid range', () => {
  it('returns a 2-element array when usedCards is empty', () => {
    const result = pickFromRange('AA');
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
    expect(typeof result[0]).toBe('string');
    expect(typeof result[1]).toBe('string');
  });

  it('returned cards are both aces for range "AA"', () => {
    // Run multiple times given randomness
    for (let i = 0; i < 10; i++) {
      const result = pickFromRange('AA');
      expect(result[0][0]).toBe('A');
      expect(result[1][0]).toBe('A');
    }
  });

  it('returns null when all combos are blocked by usedCards', () => {
    // AA has exactly 6 combos — block all 4 aces
    const used = new Set(['Ah', 'Ad', 'Ac', 'As']);
    const result = pickFromRange('AA', used);
    expect(result).toBeNull();
  });

  it('respects usedCards and never returns a blocked card', () => {
    // Block 3 of 4 aces — only Ac remains available
    const used = new Set(['Ah', 'Ad', 'As']);
    for (let i = 0; i < 10; i++) {
      const result = pickFromRange('AA', used);
      // With only Ac available, no valid pair of aces can be formed
      // (Ac needs a partner ace, but all others are used)
      expect(result).toBeNull();
    }
  });

  it('returns a card not in usedCards when alternatives exist', () => {
    // QQ has 6 combos; block Qh+Qd (1 combo blocked), but 5 remain
    const used = new Set(['Qh', 'Qd']);
    const result = pickFromRange('QQ', used);
    // Must not be null and neither card may appear in usedCards
    expect(result).not.toBeNull();
    expect(used.has(result[0])).toBe(false);
    expect(used.has(result[1])).toBe(false);
  });
});
