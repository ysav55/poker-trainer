/**
 * useNotifications.test.js
 * Tests for the useNotifications hook: error/notification state and TTL timers.
 *
 * Note: useNotifications does NOT listen to socket events. Callers invoke
 * addError / addNotification directly. The hook ignores its socket argument.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useNotifications } from '../hooks/useNotifications'

// ── Constants (match the hook's internals) ────────────────────────────────────
const ERROR_TTL = 5000
const NOTIFICATION_TTL = 4000

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useNotifications — initial state', () => {
  it('initializes errors as empty array', () => {
    const { result } = renderHook(() => useNotifications())
    expect(result.current.errors).toEqual([])
  })

  it('initializes notifications as empty array', () => {
    const { result } = renderHook(() => useNotifications())
    expect(result.current.notifications).toEqual([])
  })

  it('exposes addError, addNotification, and reset functions', () => {
    const { result } = renderHook(() => useNotifications())
    expect(typeof result.current.addError).toBe('function')
    expect(typeof result.current.addNotification).toBe('function')
    expect(typeof result.current.reset).toBe('function')
  })
})

describe('useNotifications — addError', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('adds an error entry with message, id, and timestamp', () => {
    const { result } = renderHook(() => useNotifications())
    act(() => { result.current.addError('Something broke') })
    expect(result.current.errors).toHaveLength(1)
    expect(result.current.errors[0].message).toBe('Something broke')
    expect(result.current.errors[0].id).toMatch(/^err-/)
    expect(typeof result.current.errors[0].timestamp).toBe('number')
  })

  it('prepends new errors so newest is first', () => {
    const { result } = renderHook(() => useNotifications())
    act(() => { result.current.addError('First') })
    act(() => { result.current.addError('Second') })
    expect(result.current.errors[0].message).toBe('Second')
    expect(result.current.errors[1].message).toBe('First')
  })

  it('auto-dismisses error after ERROR_TTL', () => {
    const { result } = renderHook(() => useNotifications())
    act(() => { result.current.addError('Timed out') })
    expect(result.current.errors).toHaveLength(1)
    act(() => { vi.advanceTimersByTime(ERROR_TTL) })
    expect(result.current.errors).toHaveLength(0)
  })

  it('does NOT dismiss error before ERROR_TTL elapses', () => {
    const { result } = renderHook(() => useNotifications())
    act(() => { result.current.addError('Still here') })
    act(() => { vi.advanceTimersByTime(ERROR_TTL - 1) })
    expect(result.current.errors).toHaveLength(1)
  })

  it('caps errors at 5 entries (MAX_ERRORS)', () => {
    const { result } = renderHook(() => useNotifications())
    act(() => {
      for (let i = 0; i < 7; i++) {
        result.current.addError(`Error ${i}`)
      }
    })
    expect(result.current.errors).toHaveLength(5)
  })

  it('multiple errors coexist independently', () => {
    const { result } = renderHook(() => useNotifications())
    act(() => { result.current.addError('Error A') })
    act(() => { result.current.addError('Error B') })
    expect(result.current.errors).toHaveLength(2)
    const messages = result.current.errors.map((e) => e.message)
    expect(messages).toContain('Error A')
    expect(messages).toContain('Error B')
  })

  it('each error has a unique id', () => {
    const { result } = renderHook(() => useNotifications())
    act(() => {
      result.current.addError('Alpha')
      result.current.addError('Beta')
      result.current.addError('Gamma')
    })
    const ids = result.current.errors.map((e) => e.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })
})

describe('useNotifications — addNotification', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('adds a notification entry with message, id, and timestamp', () => {
    const { result } = renderHook(() => useNotifications())
    act(() => { result.current.addNotification('Hand saved') })
    expect(result.current.notifications).toHaveLength(1)
    expect(result.current.notifications[0].message).toBe('Hand saved')
    expect(result.current.notifications[0].id).toMatch(/^notif-/)
    expect(typeof result.current.notifications[0].timestamp).toBe('number')
  })

  it('prepends new notifications so newest is first', () => {
    const { result } = renderHook(() => useNotifications())
    act(() => { result.current.addNotification('First') })
    act(() => { result.current.addNotification('Second') })
    expect(result.current.notifications[0].message).toBe('Second')
    expect(result.current.notifications[1].message).toBe('First')
  })

  it('auto-dismisses notification after NOTIFICATION_TTL', () => {
    const { result } = renderHook(() => useNotifications())
    act(() => { result.current.addNotification('Flash message') })
    expect(result.current.notifications).toHaveLength(1)
    act(() => { vi.advanceTimersByTime(NOTIFICATION_TTL) })
    expect(result.current.notifications).toHaveLength(0)
  })

  it('does NOT dismiss notification before NOTIFICATION_TTL elapses', () => {
    const { result } = renderHook(() => useNotifications())
    act(() => { result.current.addNotification('Still visible') })
    act(() => { vi.advanceTimersByTime(NOTIFICATION_TTL - 1) })
    expect(result.current.notifications).toHaveLength(1)
  })

  it('caps notifications at 8 entries (MAX_NOTIFICATIONS)', () => {
    const { result } = renderHook(() => useNotifications())
    act(() => {
      for (let i = 0; i < 10; i++) {
        result.current.addNotification(`Notif ${i}`)
      }
    })
    expect(result.current.notifications).toHaveLength(8)
  })

  it('multiple notifications coexist independently', () => {
    const { result } = renderHook(() => useNotifications())
    act(() => { result.current.addNotification('Message A') })
    act(() => { result.current.addNotification('Message B') })
    expect(result.current.notifications).toHaveLength(2)
    const messages = result.current.notifications.map((n) => n.message)
    expect(messages).toContain('Message A')
    expect(messages).toContain('Message B')
  })

  it('each notification has a unique id', () => {
    const { result } = renderHook(() => useNotifications())
    act(() => {
      result.current.addNotification('Alpha')
      result.current.addNotification('Beta')
      result.current.addNotification('Gamma')
    })
    const ids = result.current.notifications.map((n) => n.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })
})

describe('useNotifications — TTL independence', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('notification TTL is shorter than error TTL', () => {
    expect(NOTIFICATION_TTL).toBeLessThan(ERROR_TTL)
  })

  it('notifications expire before errors when added simultaneously', () => {
    const { result } = renderHook(() => useNotifications())
    act(() => {
      result.current.addError('Persistent error')
      result.current.addNotification('Quick notice')
    })
    // Advance past notification TTL but not error TTL
    act(() => { vi.advanceTimersByTime(NOTIFICATION_TTL) })
    expect(result.current.notifications).toHaveLength(0)
    expect(result.current.errors).toHaveLength(1)
    // Now advance past error TTL too
    act(() => { vi.advanceTimersByTime(ERROR_TTL - NOTIFICATION_TTL) })
    expect(result.current.errors).toHaveLength(0)
  })
})

describe('useNotifications — reset()', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('clears all errors and notifications', () => {
    const { result } = renderHook(() => useNotifications())
    act(() => {
      result.current.addError('Error 1')
      result.current.addNotification('Notif 1')
    })
    act(() => { result.current.reset() })
    expect(result.current.errors).toEqual([])
    expect(result.current.notifications).toEqual([])
  })

  it('cancels pending timers so dismissed items do not reappear', () => {
    const { result } = renderHook(() => useNotifications())
    act(() => {
      result.current.addError('Error')
      result.current.addNotification('Notif')
    })
    act(() => { result.current.reset() })
    // Advance well past both TTLs — should have no side effects
    act(() => { vi.advanceTimersByTime(ERROR_TTL * 2) })
    expect(result.current.errors).toEqual([])
    expect(result.current.notifications).toEqual([])
  })
})

describe('useNotifications — socket argument ignored', () => {
  it('accepts a null socket without throwing', () => {
    expect(() => { renderHook(() => useNotifications(null)) }).not.toThrow()
  })

  it('accepts an undefined socket without throwing', () => {
    expect(() => { renderHook(() => useNotifications(undefined)) }).not.toThrow()
  })

  it('accepts a socket object without throwing', () => {
    const fakeSocket = { socketRef: { current: { on: vi.fn(), off: vi.fn(), emit: vi.fn() } } }
    expect(() => { renderHook(() => useNotifications(fakeSocket)) }).not.toThrow()
  })
})
