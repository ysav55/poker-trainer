/**
 * usePreferences.test.js
 * Tests for the usePreferences hook: bbView localStorage persistence.
 *
 * Key details from the implementation:
 * - localStorage key: 'poker_trainer_bb_view'
 * - Stored values: '1' (true) or '0' (false)
 * - Exposed: { bbView, toggleBBView }
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePreferences } from '../hooks/usePreferences'

const LS_KEY = 'poker_trainer_bb_view'

// Use the real localStorage and clear it before each test
beforeEach(() => {
  localStorage.clear()
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('usePreferences — initial state', () => {
  it('defaults bbView to false when localStorage is empty', () => {
    const { result } = renderHook(() => usePreferences())
    expect(result.current.bbView).toBe(false)
  })

  it('reads initial value of true from localStorage when key is "1"', () => {
    localStorage.setItem(LS_KEY, '1')
    const { result } = renderHook(() => usePreferences())
    expect(result.current.bbView).toBe(true)
  })

  it('reads initial value of false from localStorage when key is "0"', () => {
    localStorage.setItem(LS_KEY, '0')
    const { result } = renderHook(() => usePreferences())
    expect(result.current.bbView).toBe(false)
  })

  it('reads initial value of false when localStorage has an unrecognized value', () => {
    localStorage.setItem(LS_KEY, 'true')
    const { result } = renderHook(() => usePreferences())
    // Only '1' is truthy — anything else is false
    expect(result.current.bbView).toBe(false)
  })

  it('exposes a toggleBBView function', () => {
    const { result } = renderHook(() => usePreferences())
    expect(typeof result.current.toggleBBView).toBe('function')
  })
})

describe('usePreferences — toggleBBView', () => {
  it('switches bbView from false to true', () => {
    const { result } = renderHook(() => usePreferences())
    expect(result.current.bbView).toBe(false)
    act(() => { result.current.toggleBBView() })
    expect(result.current.bbView).toBe(true)
  })

  it('switches bbView from true to false', () => {
    localStorage.setItem(LS_KEY, '1')
    const { result } = renderHook(() => usePreferences())
    expect(result.current.bbView).toBe(true)
    act(() => { result.current.toggleBBView() })
    expect(result.current.bbView).toBe(false)
  })

  it('toggles back and forth correctly', () => {
    const { result } = renderHook(() => usePreferences())
    act(() => { result.current.toggleBBView() }) // false → true
    expect(result.current.bbView).toBe(true)
    act(() => { result.current.toggleBBView() }) // true → false
    expect(result.current.bbView).toBe(false)
    act(() => { result.current.toggleBBView() }) // false → true
    expect(result.current.bbView).toBe(true)
  })

  it('persists "1" to localStorage when toggled to true', () => {
    const { result } = renderHook(() => usePreferences())
    act(() => { result.current.toggleBBView() })
    expect(localStorage.getItem(LS_KEY)).toBe('1')
  })

  it('persists "0" to localStorage when toggled to false', () => {
    localStorage.setItem(LS_KEY, '1')
    const { result } = renderHook(() => usePreferences())
    act(() => { result.current.toggleBBView() })
    expect(localStorage.getItem(LS_KEY)).toBe('0')
  })
})

describe('usePreferences — localStorage key consistency', () => {
  it('uses the same key for reads and writes', () => {
    const { result } = renderHook(() => usePreferences())
    act(() => { result.current.toggleBBView() })
    // The key written must be the same key read on next render
    const { result: result2 } = renderHook(() => usePreferences())
    expect(result2.current.bbView).toBe(true)
  })

  it('two hook instances share the same localStorage state', () => {
    const { result: r1 } = renderHook(() => usePreferences())
    const { result: r2 } = renderHook(() => usePreferences())

    // Both start false
    expect(r1.current.bbView).toBe(false)
    expect(r2.current.bbView).toBe(false)

    // Toggle via r1 — r2's React state hasn't re-rendered, but LS is updated
    act(() => { r1.current.toggleBBView() })
    expect(r1.current.bbView).toBe(true)
    expect(localStorage.getItem(LS_KEY)).toBe('1')

    // A fresh render picks up the persisted value
    const { result: r3 } = renderHook(() => usePreferences())
    expect(r3.current.bbView).toBe(true)
  })
})
