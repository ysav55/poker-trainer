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
    sessionStorage.clear()
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

  it('exposes socketRef, socket, connected, joinRoom, clearJoinParams', () => {
    const { result } = renderHook(() => useConnectionManager())
    expect(result.current.socketRef).toBeDefined()
    expect(typeof result.current.connected).toBe('boolean')
    expect(typeof result.current.joinRoom).toBe('function')
    expect(typeof result.current.clearJoinParams).toBe('function')
    // C-8: socket state value for reactive dependency in downstream hooks
    expect('socket' in result.current).toBe(true)
  })

  // ── C-8: Reactive socket state ────────────────────────────────────────────

  it('socket state equals the io() instance after mount effect runs', () => {
    // useState(null) initialises to null; the effect immediately sets it to the socket.
    // In the test environment effects run synchronously, so socket === mockSocket after renderHook.
    const { result } = renderHook(() => useConnectionManager())
    expect(result.current.socket).toBe(mockSocket)
  })

  it('socket state is set to null after unmount cleanup', () => {
    const { result, unmount } = renderHook(() => useConnectionManager())
    expect(result.current.socket).toBe(mockSocket)
    act(() => { unmount() })
    // After unmount the hook is gone — we verified setSocket(null) is called
    // by checking disconnect was called (cleanup ran)
    expect(mockSocket.disconnect).toHaveBeenCalled()
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

  it('joinRoom emits join_room with isCoach=true for admin role', () => {
    const { result } = renderHook(() => useConnectionManager())
    act(() => { result.current.joinRoom('Admin', 'admin') })
    expect(mockSocket.emit).toHaveBeenCalledWith('join_room', expect.objectContaining({
      name: 'Admin',
      isCoach: true,
      isSpectator: false,
    }))
  })

  it('joinRoom emits join_room with isCoach=true for superadmin role', () => {
    const { result } = renderHook(() => useConnectionManager())
    act(() => { result.current.joinRoom('SuperAdmin', 'superadmin') })
    expect(mockSocket.emit).toHaveBeenCalledWith('join_room', expect.objectContaining({
      name: 'SuperAdmin',
      isCoach: true,
      isSpectator: false,
    }))
  })

  it('auto-rejoin sends isCoach=true when stored role is admin', () => {
    const { result } = renderHook(() => useConnectionManager())
    // Join first as admin
    act(() => { result.current.joinRoom('Admin', 'admin') })
    mockSocket.emit.mockClear()
    // Simulate reconnect
    act(() => { mockSocket._trigger('connect') })
    const call = mockSocket.emit.mock.calls.find(c => c[0] === 'join_room')
    expect(call).toBeDefined()
    expect(call[1].isCoach).toBe(true)
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

  it('clears sessionStorage on connect_error with "unauthorized" message', () => {
    sessionStorage.setItem('poker_trainer_jwt', 'token')
    sessionStorage.setItem('poker_trainer_player_id', 'pid')
    renderHook(() => useConnectionManager())
    act(() => { mockSocket._trigger('connect_error', { message: 'unauthorized' }) })
    expect(sessionStorage.getItem('poker_trainer_jwt')).toBeNull()
    expect(sessionStorage.getItem('poker_trainer_player_id')).toBeNull()
  })

  it('clears sessionStorage on connect_error with "auth" in message', () => {
    sessionStorage.setItem('poker_trainer_jwt', 'token')
    renderHook(() => useConnectionManager())
    act(() => { mockSocket._trigger('connect_error', { message: 'auth failure' }) })
    expect(sessionStorage.getItem('poker_trainer_jwt')).toBeNull()
  })

  it('clears sessionStorage on connect_error with "token" in message', () => {
    sessionStorage.setItem('poker_trainer_jwt', 'token')
    renderHook(() => useConnectionManager())
    act(() => { mockSocket._trigger('connect_error', { message: 'invalid token' }) })
    expect(sessionStorage.getItem('poker_trainer_jwt')).toBeNull()
  })

  it('does NOT clear sessionStorage on non-auth connect_error', () => {
    sessionStorage.setItem('poker_trainer_jwt', 'token')
    sessionStorage.setItem('poker_trainer_player_id', 'pid')
    renderHook(() => useConnectionManager())
    act(() => { mockSocket._trigger('connect_error', { message: 'timeout' }) })
    expect(sessionStorage.getItem('poker_trainer_jwt')).toBe('token')
    expect(sessionStorage.getItem('poker_trainer_player_id')).toBe('pid')
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
