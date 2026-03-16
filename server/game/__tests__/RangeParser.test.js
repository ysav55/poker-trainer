'use strict';

const { parseRange, validateRange, pickFromRange, countCombos } = require('../RangeParser');

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Sort a card pair to a canonical key for set operations */
const pairKey = ([c1, c2]) => [c1, c2].sort().join(',');

/** Collect all unique card pairs as a Set of canonical keys */
const asSet = (combos) => new Set(combos.map(pairKey));

/** Check that every combo in result uses only cards with the expected suits */
function allSuited(combos) {
  return combos.every(([c1, c2]) => c1[1] === c2[1]);
}

function noneAreSuited(combos) {
  return combos.every(([c1, c2]) => c1[1] !== c2[1]);
}

// ─── parseRange: single tokens ───────────────────────────────────────────────

describe('parseRange — single pair', () => {
  test('AA produces 6 combos', () => {
    const result = parseRange('AA');
    expect(result).toHaveLength(6);
    // All pairs of aces
    result.forEach(([c1, c2]) => {
      expect(c1[0]).toBe('A');
      expect(c2[0]).toBe('A');
    });
  });

  test('22 produces 6 combos', () => {
    expect(parseRange('22')).toHaveLength(6);
  });

  test('KK produces 6 combos, all kings', () => {
    const result = parseRange('KK');
    expect(result).toHaveLength(6);
    result.forEach(([c1, c2]) => {
      expect(c1[0]).toBe('K');
      expect(c2[0]).toBe('K');
    });
  });
});

describe('parseRange — AKs / AKo / AK', () => {
  test('AKs produces 4 suited combos', () => {
    const result = parseRange('AKs');
    expect(result).toHaveLength(4);
    expect(allSuited(result)).toBe(true);
    result.forEach(([c1, c2]) => {
      expect(['A', 'K']).toContain(c1[0]);
      expect(['A', 'K']).toContain(c2[0]);
    });
  });

  test('AKo produces 12 offsuit combos', () => {
    const result = parseRange('AKo');
    expect(result).toHaveLength(12);
    expect(noneAreSuited(result)).toBe(true);
  });

  test('AK produces 16 combos (4 suited + 12 offsuit)', () => {
    const result = parseRange('AK');
    expect(result).toHaveLength(16);
  });

  test('72o produces 12 offsuit combos (worst hand)', () => {
    expect(parseRange('72o')).toHaveLength(12);
  });
});

// ─── parseRange: pair ranges ─────────────────────────────────────────────────

describe('parseRange — pair ranges', () => {
  test('AA-KK produces 12 combos (6+6)', () => {
    expect(parseRange('AA-KK')).toHaveLength(12);
  });

  test('AA-TT produces 6×5=30 combos', () => {
    // AA, KK, QQ, JJ, TT = 5 pairs × 6 combos each
    expect(parseRange('AA-TT')).toHaveLength(30);
  });

  test('reverse order KK-AA same as AA-KK', () => {
    const forward = asSet(parseRange('AA-KK'));
    const reverse = asSet(parseRange('KK-AA'));
    expect(forward).toEqual(reverse);
  });
});

// ─── parseRange: plus notation ───────────────────────────────────────────────

describe('parseRange — plus notation', () => {
  test('AQs+ produces 8 combos (AQs + AKs)', () => {
    const result = parseRange('AQs+');
    expect(result).toHaveLength(8);
    expect(allSuited(result)).toBe(true);
    const ranks = result.flatMap(([c1, c2]) => [c1[0], c2[0]]).filter(r => r !== 'A');
    const uniqueKickers = [...new Set(ranks)].sort();
    expect(uniqueKickers).toEqual(['K', 'Q']);
  });

  test('AJs+ produces 12 combos (AJs + AQs + AKs)', () => {
    expect(parseRange('AJs+')).toHaveLength(12);
  });

  test('KQo+ produces 12 combos (only KQo, no higher)', () => {
    // KQo+ means KQo (K is highest, so next would be KAs but that's AK which is different)
    // Actually KQo+ → KQo, KAs = AKo; wait…
    // With anchor K: kickers start at Q and go up to K-1 = Q. So only KQo. 12 combos.
    expect(parseRange('KQo+')).toHaveLength(12);
  });

  test('66+ produces all pairs from 66 to AA (9 pairs × 6 = 54 combos)', () => {
    // 66,77,88,99,TT,JJ,QQ,KK,AA = 9 pairs
    expect(parseRange('66+')).toHaveLength(54);
  });

  test('AA+ produces just AA (6 combos, nothing higher)', () => {
    expect(parseRange('AA+')).toHaveLength(6);
  });
});

// ─── parseRange: suited connector ranges ─────────────────────────────────────

describe('parseRange — suited connector ranges', () => {
  test('JTs-87s produces 4 suited connector groups × 4 suits = 16 combos', () => {
    // JTs, T9s, 98s, 87s — each has 4 combos
    const result = parseRange('JTs-87s');
    expect(result).toHaveLength(16);
    expect(allSuited(result)).toBe(true);
  });

  test('JTs alone produces 4 combos', () => {
    expect(parseRange('JTs')).toHaveLength(4);
  });

  test('T9s-76s produces 4 groups × 4 = 16 combos', () => {
    expect(parseRange('T9s-76s')).toHaveLength(16);
  });
});

// ─── parseRange: comma lists ─────────────────────────────────────────────────

describe('parseRange — comma-separated lists', () => {
  test('AA, KK produces 12 combos', () => {
    expect(parseRange('AA, KK')).toHaveLength(12);
  });

  test('AA-TT, AKs, AQs+ deduplicates correctly', () => {
    // AA-TT = 30, AKs = 4 (no overlap with pairs), AQs+ = 8 (AQs + AKs; AKs already counted)
    // Deduplicated: 30 + 4 + 4 (AQs only, AKs already in) = 38
    const result = parseRange('AA-TT, AKs, AQs+');
    expect(result.length).toBe(38);
  });

  test('duplicate entries are deduplicated', () => {
    const result = parseRange('AA, AA');
    expect(result).toHaveLength(6);
  });

  test('case insensitive: aa-kk = AA-KK', () => {
    expect(parseRange('aa-kk')).toHaveLength(12);
  });
});

// ─── validateRange ───────────────────────────────────────────────────────────

describe('validateRange', () => {
  test('valid range returns { valid: true, comboCount }', () => {
    const result = validateRange('AA-KK');
    expect(result.valid).toBe(true);
    expect(result.comboCount).toBe(12);
  });

  test('empty string is invalid', () => {
    expect(validateRange('').valid).toBe(false);
    expect(validateRange(null).valid).toBe(false);
  });

  test('garbage string returns invalid', () => {
    expect(validateRange('XYZ!').valid).toBe(false);
  });

  test('valid complex range returns correct count', () => {
    const r = validateRange('AA-TT, AKs, AQo+');
    expect(r.valid).toBe(true);
    expect(r.comboCount).toBeGreaterThan(30);
  });
});

// ─── pickFromRange ───────────────────────────────────────────────────────────

describe('pickFromRange', () => {
  test('returns a 2-card array', () => {
    const result = pickFromRange('AA');
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
    expect(result[0][0]).toBe('A');
    expect(result[1][0]).toBe('A');
  });

  test('respects usedCards (blocks combos)', () => {
    // Block all spade aces and diamond aces — only hearts and clubs remain
    const used = new Set(['As', 'Ad', 'Ah', 'Ac']); // all aces blocked
    const result = pickFromRange('AA', used);
    expect(result).toBeNull();
  });

  test('returns null when all combos are blocked', () => {
    // Block every AK combo
    const allAK = parseRange('AK');
    const used = new Set(allAK.flat());
    const result = pickFromRange('AK', used);
    expect(result).toBeNull();
  });

  test('returns a valid combo not in usedCards', () => {
    const used = new Set(['Ah', 'Kh']); // block one AKs combo
    const result = pickFromRange('AKs', used);
    expect(result).not.toBeNull();
    expect(result.every(c => !used.has(c))).toBe(true);
  });

  test('empty range string returns null', () => {
    expect(pickFromRange('')).toBeNull();
    expect(pickFromRange(null)).toBeNull();
  });
});

// ─── countCombos ─────────────────────────────────────────────────────────────

describe('countCombos', () => {
  test('AA = 6', () => expect(countCombos('AA')).toBe(6));
  test('AKs = 4', () => expect(countCombos('AKs')).toBe(4));
  test('AKo = 12', () => expect(countCombos('AKo')).toBe(12));
  test('AK = 16', () => expect(countCombos('AK')).toBe(16));
  test('AA-TT = 30', () => expect(countCombos('AA-TT')).toBe(30));
  test('66+ = 54', () => expect(countCombos('66+')).toBe(54));
  test('empty = 0', () => expect(countCombos('')).toBe(0));
});
