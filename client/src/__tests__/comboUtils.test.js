/**
 * comboUtils.test.js
 *
 * Unit tests for the four pure utility functions in comboUtils.js:
 *   - handGroupToCombos   — expand hand group string to [c1,c2] combo array
 *   - comboToHandGroup    — determine hand group string for a single combo
 *   - selectedHandGroupsToComboArray — expand a Set of hand groups to all combos
 *   - comboArrayToHandGroups         — collapse an array of combos to a Set of hand groups
 *
 * Edge cases covered:
 *   - Pocket pairs: 6 combos, all same rank, all different suits
 *   - Suited hands: 4 combos, each suit appears exactly once per card
 *   - Offsuit hands: 12 combos, suits always differ between the two cards
 *   - Round-trip: expand then collapse returns the original hand group
 *   - Invalid / edge input: empty string, one character, invalid ranks
 */

import { describe, it, expect } from 'vitest'
import {
  handGroupToCombos,
  comboToHandGroup,
  selectedHandGroupsToComboArray,
  comboArrayToHandGroups,
} from '../utils/comboUtils.js'

const SUITS = ['s', 'h', 'd', 'c']
const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2']

// ── handGroupToCombos — pocket pairs ─────────────────────────────────────────

describe('handGroupToCombos — pocket pairs', () => {
  it('AA returns exactly 6 combos', () => {
    expect(handGroupToCombos('AA')).toHaveLength(6)
  })

  it('KK returns exactly 6 combos', () => {
    expect(handGroupToCombos('KK')).toHaveLength(6)
  })

  it('22 returns exactly 6 combos', () => {
    expect(handGroupToCombos('22')).toHaveLength(6)
  })

  it('AA combos: both cards share the same rank', () => {
    const combos = handGroupToCombos('AA')
    for (const [c1, c2] of combos) {
      expect(c1[0]).toBe('A')
      expect(c2[0]).toBe('A')
    }
  })

  it('AA combos: no two cards in a combo share the same suit', () => {
    const combos = handGroupToCombos('AA')
    for (const [c1, c2] of combos) {
      expect(c1[1]).not.toBe(c2[1])
    }
  })

  it('AA combos: all 6 suit pairs are unique (no duplicates)', () => {
    const combos = handGroupToCombos('AA')
    const keys = combos.map(([c1, c2]) => [c1[1], c2[1]].sort().join(''))
    const unique = new Set(keys)
    expect(unique.size).toBe(6)
  })

  it('AA combos: uses all four suits across the 6 combos', () => {
    const combos = handGroupToCombos('AA')
    const suitsUsed = new Set(combos.flatMap(([c1, c2]) => [c1[1], c2[1]]))
    expect(suitsUsed.size).toBe(4)
    for (const s of SUITS) {
      expect(suitsUsed.has(s)).toBe(true)
    }
  })

  it('TT returns 6 combos all with rank T', () => {
    const combos = handGroupToCombos('TT')
    expect(combos).toHaveLength(6)
    for (const [c1, c2] of combos) {
      expect(c1[0]).toBe('T')
      expect(c2[0]).toBe('T')
    }
  })
})

// ── handGroupToCombos — suited hands ─────────────────────────────────────────

describe('handGroupToCombos — suited hands', () => {
  it('AKs returns exactly 4 combos', () => {
    expect(handGroupToCombos('AKs')).toHaveLength(4)
  })

  it('T9s returns exactly 4 combos', () => {
    expect(handGroupToCombos('T9s')).toHaveLength(4)
  })

  it('AKs combos: both cards always share the same suit', () => {
    const combos = handGroupToCombos('AKs')
    for (const [c1, c2] of combos) {
      expect(c1[1]).toBe(c2[1])
    }
  })

  it('AKs combos: exactly one combo per suit', () => {
    const combos = handGroupToCombos('AKs')
    const suitsUsed = combos.map(([c1]) => c1[1])
    expect(new Set(suitsUsed).size).toBe(4)
    for (const s of SUITS) {
      expect(suitsUsed).toContain(s)
    }
  })

  it('AKs combos: first card is always A, second is always K', () => {
    const combos = handGroupToCombos('AKs')
    for (const [c1, c2] of combos) {
      expect(c1[0]).toBe('A')
      expect(c2[0]).toBe('K')
    }
  })

  it('QJs returns 4 suited combos with correct ranks', () => {
    const combos = handGroupToCombos('QJs')
    expect(combos).toHaveLength(4)
    for (const [c1, c2] of combos) {
      expect(c1[0]).toBe('Q')
      expect(c2[0]).toBe('J')
      expect(c1[1]).toBe(c2[1])
    }
  })
})

// ── handGroupToCombos — offsuit hands ────────────────────────────────────────

describe('handGroupToCombos — offsuit hands', () => {
  it('AKo returns exactly 12 combos', () => {
    expect(handGroupToCombos('AKo')).toHaveLength(12)
  })

  it('T9o returns exactly 12 combos', () => {
    expect(handGroupToCombos('T9o')).toHaveLength(12)
  })

  it('AKo combos: the two cards always have different suits', () => {
    const combos = handGroupToCombos('AKo')
    for (const [c1, c2] of combos) {
      expect(c1[1]).not.toBe(c2[1])
    }
  })

  it('AKo combos: first card is always A, second is always K', () => {
    const combos = handGroupToCombos('AKo')
    for (const [c1, c2] of combos) {
      expect(c1[0]).toBe('A')
      expect(c2[0]).toBe('K')
    }
  })

  it('AKo combos: all 12 pairs are unique', () => {
    const combos = handGroupToCombos('AKo')
    const keys = combos.map(([c1, c2]) => `${c1}-${c2}`)
    expect(new Set(keys).size).toBe(12)
  })

  it('AKo: a hand with qualifier=null (e.g. "AK") defaults to offsuit (12 combos)', () => {
    // No qualifier — falls through to offsuit branch
    const combos = handGroupToCombos('AK')
    expect(combos).toHaveLength(12)
  })
})

// ── handGroupToCombos — invalid / edge input ──────────────────────────────────

describe('handGroupToCombos — invalid input', () => {
  it('returns [] for empty string', () => {
    expect(handGroupToCombos('')).toEqual([])
  })

  it('returns [] for a single character', () => {
    expect(handGroupToCombos('A')).toEqual([])
  })

  it('returns [] for null', () => {
    expect(handGroupToCombos(null)).toEqual([])
  })

  it('returns [] for undefined', () => {
    expect(handGroupToCombos(undefined)).toEqual([])
  })

  it('returns [] when ranks contain invalid characters', () => {
    expect(handGroupToCombos('XYs')).toEqual([])
  })
})

// ── comboToHandGroup ──────────────────────────────────────────────────────────

describe('comboToHandGroup — suited combos', () => {
  it("['As','Ks'] → 'AKs'", () => {
    expect(comboToHandGroup(['As', 'Ks'])).toBe('AKs')
  })

  it("['Ah','Kh'] → 'AKs'", () => {
    expect(comboToHandGroup(['Ah', 'Kh'])).toBe('AKs')
  })

  it("['Ad','Kd'] → 'AKs'", () => {
    expect(comboToHandGroup(['Ad', 'Kd'])).toBe('AKs')
  })

  it("['Ac','Kc'] → 'AKs'", () => {
    expect(comboToHandGroup(['Ac', 'Kc'])).toBe('AKs')
  })

  it("['Ts','9s'] → 'T9s'", () => {
    expect(comboToHandGroup(['Ts', '9s'])).toBe('T9s')
  })
})

describe('comboToHandGroup — offsuit combos', () => {
  it("['As','Kh'] → 'AKo'", () => {
    expect(comboToHandGroup(['As', 'Kh'])).toBe('AKo')
  })

  it("['As','Kd'] → 'AKo'", () => {
    expect(comboToHandGroup(['As', 'Kd'])).toBe('AKo')
  })

  it("['Ah','Kd'] → 'AKo'", () => {
    expect(comboToHandGroup(['Ah', 'Kd'])).toBe('AKo')
  })

  it("['Ts','9h'] → 'T9o'", () => {
    expect(comboToHandGroup(['Ts', '9h'])).toBe('T9o')
  })
})

describe('comboToHandGroup — pocket pairs', () => {
  it("['As','Ac'] → 'AA'", () => {
    expect(comboToHandGroup(['As', 'Ac'])).toBe('AA')
  })

  it("['Ah','Ad'] → 'AA'", () => {
    expect(comboToHandGroup(['Ah', 'Ad'])).toBe('AA')
  })

  it("['Ks','Kh'] → 'KK'", () => {
    expect(comboToHandGroup(['Ks', 'Kh'])).toBe('KK')
  })

  it("['2s','2h'] → '22'", () => {
    expect(comboToHandGroup(['2s', '2h'])).toBe('22')
  })
})

describe('comboToHandGroup — rank ordering (lower card first in input)', () => {
  it("['Ks','As'] → 'AKs' (A is higher; result is always high-rank first)", () => {
    expect(comboToHandGroup(['Ks', 'As'])).toBe('AKs')
  })

  it("['9h','Th'] → 'T9s'", () => {
    expect(comboToHandGroup(['9h', 'Th'])).toBe('T9s')
  })

  it("['Kh','Ad'] → 'AKo'", () => {
    expect(comboToHandGroup(['Kh', 'Ad'])).toBe('AKo')
  })
})

describe('comboToHandGroup — invalid input', () => {
  it('returns empty string when first card is missing', () => {
    expect(comboToHandGroup([null, 'Ks'])).toBe('')
  })

  it('returns empty string when second card is missing', () => {
    expect(comboToHandGroup(['As', null])).toBe('')
  })
})

// ── selectedHandGroupsToComboArray ────────────────────────────────────────────

describe('selectedHandGroupsToComboArray', () => {
  it('expands a Set with one suited hand to 4 combos', () => {
    const result = selectedHandGroupsToComboArray(new Set(['AKs']))
    expect(result).toHaveLength(4)
  })

  it('expands a Set with one offsuit hand to 12 combos', () => {
    const result = selectedHandGroupsToComboArray(new Set(['AKo']))
    expect(result).toHaveLength(12)
  })

  it('expands a Set with one pocket pair to 6 combos', () => {
    const result = selectedHandGroupsToComboArray(new Set(['AA']))
    expect(result).toHaveLength(6)
  })

  it('expands a Set with multiple hand groups correctly (AKs + AA = 4 + 6 = 10)', () => {
    const result = selectedHandGroupsToComboArray(new Set(['AKs', 'AA']))
    expect(result).toHaveLength(10)
  })

  it('expands an empty Set to an empty array', () => {
    expect(selectedHandGroupsToComboArray(new Set())).toEqual([])
  })

  it('returns an array of [c1, c2] pairs', () => {
    const result = selectedHandGroupsToComboArray(new Set(['AKs']))
    for (const combo of result) {
      expect(Array.isArray(combo)).toBe(true)
      expect(combo).toHaveLength(2)
      expect(typeof combo[0]).toBe('string')
      expect(typeof combo[1]).toBe('string')
    }
  })
})

// ── comboArrayToHandGroups ────────────────────────────────────────────────────

describe('comboArrayToHandGroups', () => {
  it('converts suited combos to a Set containing only the suited hand group', () => {
    const combos = [['As', 'Ks'], ['Ah', 'Kh'], ['Ad', 'Kd'], ['Ac', 'Kc']]
    const result = comboArrayToHandGroups(combos)
    expect(result).toBeInstanceOf(Set)
    expect(result.size).toBe(1)
    expect(result.has('AKs')).toBe(true)
  })

  it('converts offsuit combos to a Set containing only the offsuit hand group', () => {
    const combos = handGroupToCombos('AKo')
    const result = comboArrayToHandGroups(combos)
    expect(result.size).toBe(1)
    expect(result.has('AKo')).toBe(true)
  })

  it('converts pair combos to a Set containing only the pair hand group', () => {
    const combos = handGroupToCombos('AA')
    const result = comboArrayToHandGroups(combos)
    expect(result.size).toBe(1)
    expect(result.has('AA')).toBe(true)
  })

  it('collapses mixed combos to their respective hand groups', () => {
    const combos = [
      ...handGroupToCombos('AKs'),
      ...handGroupToCombos('AA'),
    ]
    const result = comboArrayToHandGroups(combos)
    expect(result.has('AKs')).toBe(true)
    expect(result.has('AA')).toBe(true)
    expect(result.size).toBe(2)
  })

  it('returns an empty Set for an empty array', () => {
    const result = comboArrayToHandGroups([])
    expect(result).toBeInstanceOf(Set)
    expect(result.size).toBe(0)
  })
})

// ── Round-trip tests ──────────────────────────────────────────────────────────

describe('Round-trip: handGroupToCombos → comboArrayToHandGroups', () => {
  it("AKs: expand then collapse returns Set containing 'AKs'", () => {
    const combos = handGroupToCombos('AKs')
    const result = comboArrayToHandGroups(combos)
    expect(result.has('AKs')).toBe(true)
    expect(result.size).toBe(1)
  })

  it("AKo: expand then collapse returns Set containing 'AKo'", () => {
    const combos = handGroupToCombos('AKo')
    const result = comboArrayToHandGroups(combos)
    expect(result.has('AKo')).toBe(true)
    expect(result.size).toBe(1)
  })

  it("AA: expand then collapse returns Set containing 'AA'", () => {
    const combos = handGroupToCombos('AA')
    const result = comboArrayToHandGroups(combos)
    expect(result.has('AA')).toBe(true)
    expect(result.size).toBe(1)
  })

  it("T9s: expand then collapse returns Set containing 'T9s'", () => {
    const combos = handGroupToCombos('T9s')
    const result = comboArrayToHandGroups(combos)
    expect(result.has('T9s')).toBe(true)
    expect(result.size).toBe(1)
  })

  it("KK: round-trip produces exactly 1 hand group", () => {
    const result = comboArrayToHandGroups(handGroupToCombos('KK'))
    expect(result.size).toBe(1)
    expect(result.has('KK')).toBe(true)
  })

  it('round-trip preserves combo count across selectedHandGroupsToComboArray', () => {
    const original = new Set(['QQ', 'AKs', 'AKo'])
    const combos = selectedHandGroupsToComboArray(original)
    // QQ=6, AKs=4, AKo=12 → 22 total
    expect(combos).toHaveLength(22)
    const recovered = comboArrayToHandGroups(combos)
    expect(recovered.has('QQ')).toBe(true)
    expect(recovered.has('AKs')).toBe(true)
    expect(recovered.has('AKo')).toBe(true)
    expect(recovered.size).toBe(3)
  })
})

// ── comboToHandGroup then handGroupToCombos ───────────────────────────────────

describe('Round-trip: comboToHandGroup → handGroupToCombos', () => {
  it("comboToHandGroup(['As','Ks']) → 'AKs' → 4 combos including ['As','Ks']", () => {
    const group = comboToHandGroup(['As', 'Ks'])
    const combos = handGroupToCombos(group)
    expect(combos).toHaveLength(4)
    // All combos should be AKs
    for (const [c1, c2] of combos) {
      expect(c1[0]).toBe('A')
      expect(c2[0]).toBe('K')
      expect(c1[1]).toBe(c2[1])
    }
  })

  it("comboToHandGroup(['As','Kh']) → 'AKo' → 12 combos", () => {
    const group = comboToHandGroup(['As', 'Kh'])
    const combos = handGroupToCombos(group)
    expect(combos).toHaveLength(12)
  })

  it("comboToHandGroup(['As','Ac']) → 'AA' → 6 combos", () => {
    const group = comboToHandGroup(['As', 'Ac'])
    const combos = handGroupToCombos(group)
    expect(combos).toHaveLength(6)
  })
})
