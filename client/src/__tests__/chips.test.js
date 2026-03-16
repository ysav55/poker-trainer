/**
 * chips.test.js — fmtChips utility
 *
 * Covers:
 *  1. bbView=false  — plain toLocaleString output
 *  2. bbView=true   — BB unit formatting
 *  3. Integer vs decimal BB values
 *  4. Zero, negative, and large inputs
 *  5. bigBlind=0 guard (avoid division by zero)
 */

import { describe, it, expect } from 'vitest'
import { fmtChips } from '../utils/chips'

// ── Suite 1: bbView=false (chip mode) ────────────────────────────────────────

describe('fmtChips — chip mode (bbView=false)', () => {
  it('returns toLocaleString of the amount', () => {
    expect(fmtChips(1000, 10, false)).toBe((1000).toLocaleString())
  })

  it('formats zero chips', () => {
    expect(fmtChips(0, 10, false)).toBe((0).toLocaleString())
  })

  it('formats large amounts', () => {
    expect(fmtChips(1_000_000, 10, false)).toBe((1_000_000).toLocaleString())
  })

  it('formats negative amounts (edge: stack debt)', () => {
    // toLocaleString is called — result is locale-dependent but should not throw
    expect(() => fmtChips(-50, 10, false)).not.toThrow()
    expect(fmtChips(-50, 10, false)).toBe((-50).toLocaleString())
  })

  it('bbView=false ignores bigBlind value entirely', () => {
    expect(fmtChips(500, 0, false)).toBe((500).toLocaleString())
    expect(fmtChips(500, 1000, false)).toBe((500).toLocaleString())
  })
})

// ── Suite 2: bbView=true (BB mode) ───────────────────────────────────────────

describe('fmtChips — BB mode (bbView=true)', () => {
  it('returns integer BB when amount divides evenly', () => {
    expect(fmtChips(1000, 10, true)).toBe('100bb')
  })

  it('returns 1-decimal BB when not evenly divisible', () => {
    expect(fmtChips(150, 10, true)).toBe('15bb')
    expect(fmtChips(175, 10, true)).toBe('17.5bb')
  })

  it('rounds to 1 decimal place (toFixed(1) + parseFloat strips trailing zeros)', () => {
    // 125 / 10 = 12.5 → "12.5bb"
    expect(fmtChips(125, 10, true)).toBe('12.5bb')
    // 120 / 10 = 12.0 → integer → "12bb"
    expect(fmtChips(120, 10, true)).toBe('12bb')
  })

  it('formats zero stack as "0bb"', () => {
    expect(fmtChips(0, 10, true)).toBe('0bb')
  })

  it('works with BB=20 (old default)', () => {
    expect(fmtChips(1000, 20, true)).toBe('50bb')
    expect(fmtChips(2000, 20, true)).toBe('100bb')
    expect(fmtChips(50, 20, true)).toBe('2.5bb')
  })

  it('works with BB=50', () => {
    expect(fmtChips(5000, 50, true)).toBe('100bb')
    expect(fmtChips(75, 50, true)).toBe('1.5bb')
  })

  it('very large stack in BB mode', () => {
    expect(fmtChips(100_000, 10, true)).toBe('10000bb')
  })

  it('1-chip stack gives fractional BB', () => {
    // 1 / 10 = 0.1 → "0.1bb"
    expect(fmtChips(1, 10, true)).toBe('0.1bb')
  })
})

// ── Suite 3: bigBlind=0 guard ─────────────────────────────────────────────────

describe('fmtChips — bigBlind=0 guard', () => {
  it('falls back to chip mode when bigBlind=0 even if bbView=true', () => {
    // Division by zero protection: bigBlind > 0 check in the implementation
    expect(fmtChips(1000, 0, true)).toBe((1000).toLocaleString())
  })

  it('falls back to chip mode when bigBlind is negative', () => {
    // bigBlind <= 0 → bbView branch skipped
    expect(fmtChips(1000, -10, true)).toBe((1000).toLocaleString())
  })
})
