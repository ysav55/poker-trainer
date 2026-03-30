/**
 * rangeParser.test.js
 * Tests for parseRange and validateRange in src/utils/rangeParser.js
 */
import { describe, it, expect } from 'vitest'
import { parseRange, validateRange, countCombos } from '../utils/rangeParser'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Sort a [card, card] pair so the lower card string comes first */
function sortPair(pair) {
  return [...pair].sort()
}

/** Canonical key for a combo — sorted, joined by comma */
function comboKey(pair) {
  return sortPair(pair).join(',')
}

/** Build a Set of canonical keys from the result of parseRange */
function keySet(combos) {
  return new Set(combos.map(comboKey))
}

// ── parseRange ────────────────────────────────────────────────────────────────

describe('parseRange — pocket pairs', () => {
  it('AA returns exactly 6 combos', () => {
    const result = parseRange('AA')
    expect(result).toHaveLength(6)
  })

  it('AA combos cover all 6 suit combinations', () => {
    const result = parseRange('AA')
    const keys = keySet(result)
    // All 6 AA combos: Ah/Ad, Ah/Ac, Ah/As, Ad/Ac, Ad/As, Ac/As
    expect(keys.has('Ac,Ah')).toBe(true)
    expect(keys.has('Ac,As')).toBe(true)
    expect(keys.has('Ac,Ad')).toBe(true)
    expect(keys.has('Ah,As')).toBe(true)
    expect(keys.has('Ad,Ah')).toBe(true)
    expect(keys.has('Ad,As')).toBe(true)
  })

  it('AA combos all contain two Aces', () => {
    const result = parseRange('AA')
    for (const [c1, c2] of result) {
      expect(c1[0]).toBe('A')
      expect(c2[0]).toBe('A')
    }
  })

  it('KK returns 6 combos', () => {
    expect(parseRange('KK')).toHaveLength(6)
  })

  it('22 returns 6 combos', () => {
    expect(parseRange('22')).toHaveLength(6)
  })
})

describe('parseRange — suited hands', () => {
  it('AKs returns exactly 4 combos', () => {
    const result = parseRange('AKs')
    expect(result).toHaveLength(4)
  })

  it('AKs combos are all suited (same suit)', () => {
    const result = parseRange('AKs')
    for (const [c1, c2] of result) {
      expect(c1[1]).toBe(c2[1])
    }
  })

  it('AKs combos all have an Ace and a King', () => {
    const result = parseRange('AKs')
    for (const [c1, c2] of result) {
      const ranks = [c1[0], c2[0]].sort()
      expect(ranks).toEqual(['A', 'K'])
    }
  })

  it('T9s returns 4 combos', () => {
    expect(parseRange('T9s')).toHaveLength(4)
  })
})

describe('parseRange — offsuit hands', () => {
  it('AKo returns exactly 12 combos', () => {
    const result = parseRange('AKo')
    expect(result).toHaveLength(12)
  })

  it('AKo combos are all offsuit (different suits)', () => {
    const result = parseRange('AKo')
    for (const [c1, c2] of result) {
      expect(c1[1]).not.toBe(c2[1])
    }
  })

  it('AKo combos all have an Ace and a King', () => {
    const result = parseRange('AKo')
    for (const [c1, c2] of result) {
      const ranks = [c1[0], c2[0]].sort()
      expect(ranks).toEqual(['A', 'K'])
    }
  })

  it('T9o returns 12 combos', () => {
    expect(parseRange('T9o')).toHaveLength(12)
  })
})

describe('parseRange — pair ranges (dash notation)', () => {
  it('AA-QQ returns 18 combos (AA + KK + QQ)', () => {
    expect(parseRange('AA-QQ')).toHaveLength(18)
  })

  it('AA-QQ contains AA, KK, and QQ combos', () => {
    const result = parseRange('AA-QQ')
    const keys = keySet(result)

    // Spot check: one AA combo
    expect(keys.has('Ac,Ah')).toBe(true)
    // Spot check: one KK combo
    expect(keys.has('Kc,Kh')).toBe(true)
    // Spot check: one QQ combo
    expect(keys.has('Qc,Qh')).toBe(true)
  })

  it('AA-22 returns 78 combos (13 pairs × 6)', () => {
    expect(parseRange('AA-22')).toHaveLength(78)
  })

  it('JJ-99 returns 18 combos (JJ + TT + 99)', () => {
    expect(parseRange('JJ-99')).toHaveLength(18)
  })

  it('dash range is order-independent: QQ-AA same as AA-QQ', () => {
    expect(parseRange('QQ-AA')).toHaveLength(18)
  })
})

describe('parseRange — plus notation', () => {
  it('QQ+ returns 18 combos (QQ, KK, AA)', () => {
    expect(parseRange('QQ+')).toHaveLength(18)
  })

  it('QQ+ covers QQ, KK, and AA', () => {
    const result = parseRange('QQ+')
    const keys = keySet(result)
    expect(keys.has('Ac,Ah')).toBe(true) // AA
    expect(keys.has('Kc,Kh')).toBe(true) // KK
    expect(keys.has('Qc,Qh')).toBe(true) // QQ
  })

  it('AA+ returns exactly 6 combos (only AA)', () => {
    expect(parseRange('AA+')).toHaveLength(6)
  })

  it('TT+ returns 30 combos (TT through AA = 5 pairs × 6)', () => {
    expect(parseRange('TT+')).toHaveLength(30)
  })
})

describe('parseRange — comma-separated lists', () => {
  it('AKs,AKo returns 16 combos (4 suited + 12 offsuit)', () => {
    expect(parseRange('AKs,AKo')).toHaveLength(16)
  })

  it('AA,KK returns 12 combos', () => {
    expect(parseRange('AA,KK')).toHaveLength(12)
  })

  it('AKs,AKo has no duplicate combos', () => {
    const result = parseRange('AKs,AKo')
    const keys = keySet(result)
    // Set size should equal array length — no dupes
    expect(keys.size).toBe(result.length)
  })

  it('AA,AA deduplicates — returns 6, not 12', () => {
    expect(parseRange('AA,AA')).toHaveLength(6)
  })

  it('QQ+,AKs returns suited AK plus QQ/KK/AA', () => {
    const result = parseRange('QQ+,AKs')
    // QQ+(18) + AKs(4) = 22
    expect(result).toHaveLength(22)
  })
})

describe('parseRange — edge cases', () => {
  it('empty string returns []', () => {
    expect(parseRange('')).toEqual([])
  })

  it('null returns []', () => {
    expect(parseRange(null)).toEqual([])
  })

  it('undefined returns []', () => {
    expect(parseRange(undefined)).toEqual([])
  })

  it('non-string number returns []', () => {
    expect(parseRange(42)).toEqual([])
  })

  it('completely invalid string returns []', () => {
    expect(parseRange('NOTARANGE')).toEqual([])
  })

  it('invalid token in comma list is silently skipped', () => {
    // 'AA' is valid, 'ZZ' is not
    const result = parseRange('AA,ZZ')
    expect(result).toHaveLength(6) // only AA combos
  })

  it('whitespace-only string returns []', () => {
    expect(parseRange('   ')).toEqual([])
  })

  it('is case-insensitive (lowercase ak)', () => {
    const upper = parseRange('AKs')
    const lower = parseRange('aks')
    expect(lower).toHaveLength(upper.length)
  })

  it('result has no duplicate combos from a valid single token', () => {
    const result = parseRange('AA')
    const keys = keySet(result)
    expect(keys.size).toBe(result.length)
  })
})

describe('parseRange — return shape', () => {
  it('returns an array', () => {
    expect(Array.isArray(parseRange('AA'))).toBe(true)
  })

  it('each combo is an array of two strings', () => {
    const result = parseRange('AKs')
    for (const combo of result) {
      expect(Array.isArray(combo)).toBe(true)
      expect(combo).toHaveLength(2)
      expect(typeof combo[0]).toBe('string')
      expect(typeof combo[1]).toBe('string')
    }
  })

  it('card strings are 2 characters (rank + suit)', () => {
    const result = parseRange('AKs')
    for (const [c1, c2] of result) {
      expect(c1).toHaveLength(2)
      expect(c2).toHaveLength(2)
    }
  })
})

// ── validateRange ─────────────────────────────────────────────────────────────

describe('validateRange — valid inputs', () => {
  it('valid range returns { valid: true }', () => {
    const result = validateRange('AA')
    expect(result.valid).toBe(true)
  })

  it('valid range includes comboCount', () => {
    const result = validateRange('AA')
    expect(result.comboCount).toBe(6)
  })

  it('AKs is valid', () => {
    expect(validateRange('AKs').valid).toBe(true)
  })

  it('AKo is valid', () => {
    expect(validateRange('AKo').valid).toBe(true)
  })

  it('QQ+ is valid', () => {
    expect(validateRange('QQ+').valid).toBe(true)
  })

  it('AA-QQ is valid', () => {
    expect(validateRange('AA-QQ').valid).toBe(true)
  })

  it('AKs,AKo is valid', () => {
    expect(validateRange('AKs,AKo').valid).toBe(true)
  })

  it('comboCount for QQ+ is 18', () => {
    expect(validateRange('QQ+').comboCount).toBe(18)
  })

  it('comboCount for AKs,AKo is 16', () => {
    expect(validateRange('AKs,AKo').comboCount).toBe(16)
  })
})

describe('validateRange — invalid inputs', () => {
  it('empty string returns { valid: false }', () => {
    const result = validateRange('')
    expect(result.valid).toBe(false)
  })

  it('null returns { valid: false }', () => {
    const result = validateRange(null)
    expect(result.valid).toBe(false)
  })

  it('undefined returns { valid: false }', () => {
    const result = validateRange(undefined)
    expect(result.valid).toBe(false)
  })

  it('whitespace-only string returns { valid: false }', () => {
    expect(validateRange('   ').valid).toBe(false)
  })

  it('invalid token returns { valid: false }', () => {
    expect(validateRange('NOTVALID').valid).toBe(false)
  })

  it('invalid range includes an error string', () => {
    const result = validateRange('NOTVALID')
    expect(typeof result.error).toBe('string')
    expect(result.error.length).toBeGreaterThan(0)
  })

  it('empty string error mentions "empty"', () => {
    const result = validateRange('')
    expect(result.error.toLowerCase()).toContain('empty')
  })
})

// ── countCombos (bonus coverage for the export) ──────────────────────────────

describe('countCombos', () => {
  it('countCombos("AA") === 6', () => {
    expect(countCombos('AA')).toBe(6)
  })

  it('countCombos("AKs") === 4', () => {
    expect(countCombos('AKs')).toBe(4)
  })

  it('countCombos("AKo") === 12', () => {
    expect(countCombos('AKo')).toBe(12)
  })

  it('countCombos("") === 0', () => {
    expect(countCombos('')).toBe(0)
  })
})
