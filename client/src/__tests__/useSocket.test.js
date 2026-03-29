/**
 * useSocket.test.js
 * Tests for the composition layer: return shape, leaveRoom cross-hook behavior.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSocket } from '../hooks/useSocket'

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

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useSocket — return shape', () => {
  beforeEach(() => {
    mockSocket = createMockSocket()
    localStorage.clear()
  })

  it('exposes all connection fields', () => {
    const { result } = renderHook(() => useSocket())
    expect(typeof result.current.connected).toBe('boolean')
    expect(typeof result.current.joinRoom).toBe('function')
    expect(typeof result.current.leaveRoom).toBe('function')
  })

  it('exposes all game state fields', () => {
    const { result } = renderHook(() => useSocket())
    const r = result.current
    expect('gameState' in r).toBe(true)
    expect('myId' in r).toBe(true)
    expect('isCoach' in r).toBe(true)
    expect('isSpectator' in r).toBe(true)
    expect('coachDisconnected' in r).toBe(true)
    expect('actionTimer' in r).toBe(true)
    expect('syncError' in r).toBe(true)
    expect('sessionStats' in r).toBe(true)
    expect('activeHandId' in r).toBe(true)
    expect('handTagsSaved' in r).toBe(true)
    expect('myPlayer' in r).toBe(true)
  })

  it('exposes all notification fields', () => {
    const { result } = renderHook(() => useSocket())
    expect(Array.isArray(result.current.errors)).toBe(true)
    expect(Array.isArray(result.current.notifications)).toBe(true)
  })

  it('exposes playlist fields', () => {
    const { result } = renderHook(() => useSocket())
    expect(Array.isArray(result.current.playlists)).toBe(true)
    expect(typeof result.current.createPlaylist).toBe('function')
    expect(typeof result.current.getPlaylists).toBe('function')
    expect(typeof result.current.activatePlaylist).toBe('function')
    expect(typeof result.current.deactivatePlaylist).toBe('function')
  })

  it('exposes preference fields', () => {
    const { result } = renderHook(() => useSocket())
    expect(typeof result.current.bbView).toBe('boolean')
    expect(typeof result.current.toggleBBView).toBe('function')
  })

  it('exposes game emit helpers', () => {
    const { result } = renderHook(() => useSocket())
    const helpers = [
      'startGame', 'placeBet', 'manualDealCard', 'undoAction', 'rollbackStreet',
      'togglePause', 'setMode', 'forceNextStreet', 'awardPot', 'resetHand',
      'adjustStack', 'openConfigPhase', 'updateHandConfig', 'startConfiguredHand',
      'loadHandScenario', 'updateHandTags', 'setPlayerInHand', 'setBlindLevels',
    ]
    for (const fn of helpers) {
      expect(typeof result.current[fn], fn).toBe('function')
    }
  })

  it('exposes replay emit helpers', () => {
    const { result } = renderHook(() => useSocket())
    const helpers = [
      'loadReplay', 'replayStepFwd', 'replayStepBack',
      'replayJumpTo', 'replayBranch', 'replayUnbranch', 'replayExit',
    ]
    for (const fn of helpers) {
      expect(typeof result.current[fn], fn).toBe('function')
    }
  })
})

describe('useSocket — connection state', () => {
  beforeEach(() => {
    mockSocket = createMockSocket()
    localStorage.clear()
  })

  it('connected starts as false', () => {
    const { result } = renderHook(() => useSocket())
    expect(result.current.connected).toBe(false)
  })

  it('connected becomes true after socket connect event', () => {
    const { result } = renderHook(() => useSocket())
    act(() => { mockSocket._trigger('connect') })
    expect(result.current.connected).toBe(true)
  })

  it('connected goes back to false after disconnect event', () => {
    const { result } = renderHook(() => useSocket())
    act(() => { mockSocket._trigger('connect') })
    act(() => { mockSocket._trigger('disconnect') })
    expect(result.current.connected).toBe(false)
  })
})

describe('useSocket — leaveRoom', () => {
  beforeEach(() => {
    mockSocket = createMockSocket()
    localStorage.clear()
  })

  it('clears poker_trainer_jwt from localStorage', () => {
    localStorage.setItem('poker_trainer_jwt', 'my-token')
    const { result } = renderHook(() => useSocket())
    act(() => { result.current.leaveRoom() })
    expect(localStorage.getItem('poker_trainer_jwt')).toBeNull()
  })

  it('clears poker_trainer_player_id from localStorage', () => {
    localStorage.setItem('poker_trainer_player_id', 'uuid-123')
    const { result } = renderHook(() => useSocket())
    act(() => { result.current.leaveRoom() })
    expect(localStorage.getItem('poker_trainer_player_id')).toBeNull()
  })

  it('calls socket.disconnect()', () => {
    const { result } = renderHook(() => useSocket())
    act(() => { result.current.leaveRoom() })
    expect(mockSocket.disconnect).toHaveBeenCalled()
  })

  it('calls socket.connect() to bounce the socket', () => {
    const { result } = renderHook(() => useSocket())
    act(() => { result.current.leaveRoom() })
    expect(mockSocket.connect).toHaveBeenCalled()
  })

  it('prevents auto-rejoin after leaveRoom (clearJoinParams)', () => {
    const { result } = renderHook(() => useSocket())
    // Join first so joinParams are stored
    act(() => { result.current.joinRoom('Alice', 'player') })
    act(() => { result.current.leaveRoom() })
    mockSocket.emit.mockClear()
    // Simulate reconnect — should not auto-rejoin
    act(() => { mockSocket._trigger('connect') })
    expect(mockSocket.emit).not.toHaveBeenCalledWith('join_room', expect.anything())
  })

  it('resets game state after leaveRoom (gameState becomes null)', () => {
    const { result } = renderHook(() => useSocket())
    // Simulate some game state arriving
    act(() => {
      mockSocket._trigger('room_joined', { playerId: 'p1', isCoach: false, isSpectator: false })
    })
    expect(result.current.myId).toBe('p1')
    act(() => { result.current.leaveRoom() })
    expect(result.current.myId).toBeNull()
    expect(result.current.gameState).toBeNull()
  })
})
