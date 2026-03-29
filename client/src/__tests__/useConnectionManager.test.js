/**
 * useConnectionManager.test.js
 * Tests for socket lifecycle, joinRoom, auto-rejoin, and auth error handling.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useConnectionManager } from '../hooks/useConnectionManager'

// ── Mock socket.io-client ───────────────────────────────────────────────────

let mockSocket

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => mockSocket),
}))

function createMockSocket() {
  const handlers = {}
  return {
    on: vi.fn((event, cb) => { handlers[event] = cb }),
    off: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
    connect: vi.fn(),
    _trigger: (event, ...args) => handlers[event]?.(...args),
  }
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('useConnectionManager', () => {
  beforeEach(() => {
    mockSocket = createMockSocket()
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── Connection state ──────────────────────────────────────────────────────

  it('starts disconnected', () => {
    const { result } = renderHook(() => useConnectionManager())
    expect(result.current.connected).toBe(false)
  })

  it('sets connected=true when socket fires connect', () => {
    const { result } = renderHook(() => useConnectionManager())
    act(() => { mockSocket._trigger('connect') })
    expect(result.current.connected).toBe(true)
  })

  it('sets connected=false when socket fires disconnect', () => {
    const { result } = renderHook(() => useConnectionManager())
    act(() => { mockSocket._trigger('connect') })
    act(() => { mockSocket._trigger('disconnect') })
    expect(result.current.connected).toBe(false)
  })

  it('exposes socketRef, connected, joinRoom, clearJoinParams', () => {
    const { result } = renderHook(() => useConnectionManager())
    expect(result.current.socketRef).toBeDefined()
    expect(typeof result.current.connected).toBe('boolean')
    expect(typeof result.current.joinRoom).toBe('function')
    expect(typeof result.current.clearJoinParams).toBe('function')
  })

  // ── joinRoom ─────────────────────────────────────────────────────────────

  it('joinRoom emits join_room with correct payload for player role', () => {
    const { result } = renderHook(() => useConnectionManager())
    act(() => { result.current.joinRoom('Alice', 'player') })
    expect(mockSocket.emit).toHaveBeenCalledWith('join_room', {
      name: 'Alice',
      isCoach: false,
      isSpectator: false,
      stableId: null,
    })
  })

  it('joinRoom emits join_room with isCoach=true for coach role', () => {
    const { result } = renderHook(() => useConnectionManager())
    act(() => { result.current.joinRoom('Coach', 'coach') })
    expect(mockSocket.emit).toHaveBeenCalledWith('join_room', expect.objectContaining({
      name: 'Coach',
      isCoach: true,
      isSpectator: false,
    }))
  })

  it('joinRoom generates a stableId prefixed with "spectator_" for spectator role', () => {
    const { result } = renderHook(() => useConnectionManager())
    act(() => { result.current.joinRoom('Watcher', 'spectator') })
    const call = mockSocket.emit.mock.calls.find(c => c[0] === 'join_room')
    expect(call[1].isSpectator).toBe(true)
    expect(call[1].stableId).toMatch(/^spectator_\d+$/)
  })

  it('joinRoom defaults to player role when role is omitted', () => {
    const { result } = renderHook(() => useConnectionManager())
    act(() => { result.current.joinRoom('Bob') })
    expect(mockSocket.emit).toHaveBeenCalledWith('join_room', expect.objectContaining({
      isCoach: false,
      isSpectator: false,
      stableId: null,
    }))
  })

  // ── Auto-rejoin ───────────────────────────────────────────────────────────

  it('auto-rejoins on reconnect when joinParams are set', () => {
    const { result } = renderHook(() => useConnectionManager())
    // Join first
    act(() => { result.current.joinRoom('Alice', 'player') })
    mockSocket.emit.mockClear()
    // Simulate reconnect
    act(() => { mockSocket._trigger('connect') })
    expect(mockSocket.emit).toHaveBeenCalledWith('join_room', expect.objectContaining({ name: 'Alice' }))
  })

  it('does NOT auto-rejoin when no joinRoom was called yet', () => {
    const { result } = renderHook(() => useConnectionManager())
    act(() => { mockSocket._trigger('connect') })
    expect(mockSocket.emit).not.toHaveBeenCalledWith('join_room', expect.anything())
  })

  it('clearJoinParams prevents auto-rejoin on next connect', () => {
    const { result } = renderHook(() => useConnectionManager())
    act(() => { result.current.joinRoom('Alice', 'player') })
    act(() => { result.current.clearJoinParams() })
    mockSocket.emit.mockClear()
    act(() => { mockSocket._trigger('connect') })
    expect(mockSocket.emit).not.toHaveBeenCalledWith('join_room', expect.anything())
  })

  // ── Auth error handling ───────────────────────────────────────────────────

  it('clears localStorage on connect_error with "unauthorized" message', () => {
    localStorage.setItem('poker_trainer_jwt', 'token')
    localStorage.setItem('poker_trainer_player_id', 'pid')
    renderHook(() => useConnectionManager())
    act(() => { mockSocket._trigger('connect_error', { message: 'unauthorized' }) })
    expect(localStorage.getItem('poker_trainer_jwt')).toBeNull()
    expect(localStorage.getItem('poker_trainer_player_id')).toBeNull()
  })

  it('clears localStorage on connect_error with "auth" in message', () => {
    localStorage.setItem('poker_trainer_jwt', 'token')
    renderHook(() => useConnectionManager())
    act(() => { mockSocket._trigger('connect_error', { message: 'auth failure' }) })
    expect(localStorage.getItem('poker_trainer_jwt')).toBeNull()
  })

  it('clears localStorage on connect_error with "token" in message', () => {
    localStorage.setItem('poker_trainer_jwt', 'token')
    renderHook(() => useConnectionManager())
    act(() => { mockSocket._trigger('connect_error', { message: 'invalid token' }) })
    expect(localStorage.getItem('poker_trainer_jwt')).toBeNull()
  })

  it('does NOT clear localStorage on non-auth connect_error', () => {
    localStorage.setItem('poker_trainer_jwt', 'token')
    localStorage.setItem('poker_trainer_player_id', 'pid')
    renderHook(() => useConnectionManager())
    act(() => { mockSocket._trigger('connect_error', { message: 'timeout' }) })
    expect(localStorage.getItem('poker_trainer_jwt')).toBe('token')
    expect(localStorage.getItem('poker_trainer_player_id')).toBe('pid')
  })

  it('clears joinParams on auth-related connect_error to prevent auto-rejoin', () => {
    const { result } = renderHook(() => useConnectionManager())
    act(() => { result.current.joinRoom('Alice', 'player') })
    act(() => { mockSocket._trigger('connect_error', { message: 'unauthorized' }) })
    mockSocket.emit.mockClear()
    act(() => { mockSocket._trigger('connect') })
    expect(mockSocket.emit).not.toHaveBeenCalledWith('join_room', expect.anything())
  })

  // ── Cleanup ───────────────────────────────────────────────────────────────

  it('disconnects socket on unmount', () => {
    const { unmount } = renderHook(() => useConnectionManager())
    unmount()
    expect(mockSocket.disconnect).toHaveBeenCalled()
  })

  it('removes window error listeners on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useConnectionManager())
    unmount()
    expect(removeSpy).toHaveBeenCalledWith('error', expect.any(Function))
    expect(removeSpy).toHaveBeenCalledWith('unhandledrejection', expect.any(Function))
  })
})
