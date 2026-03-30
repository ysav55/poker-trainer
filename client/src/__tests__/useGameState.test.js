/**
 * useGameState.test.js
 * Tests for socket event listeners, state transitions, and emit helpers.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useGameState } from '../hooks/useGameState'

// ── Helpers ─────────────────────────────────────────────────────────────────

function createMockSocket() {
  const handlers = {}
  return {
    on: vi.fn((event, cb) => { handlers[event] = cb }),
    off: vi.fn(),
    emit: vi.fn(),
    _trigger: (event, ...args) => handlers[event]?.(...args),
  }
}

function renderGameState(socket, overrides = {}) {
  const addError = vi.fn()
  const addNotification = vi.fn()
  const socketRef = { current: socket }
  const { result, unmount } = renderHook(() =>
    useGameState({ socketRef, addError, addNotification, ...overrides })
  )
  return { result, addError, addNotification, unmount }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useGameState — initial state', () => {
  it('initializes all state to null / false', () => {
    const socket = createMockSocket()
    const { result } = renderGameState(socket)
    expect(result.current.gameState).toBeNull()
    expect(result.current.myId).toBeNull()
    expect(result.current.isCoach).toBe(false)
    expect(result.current.isSpectator).toBe(false)
    expect(result.current.coachDisconnected).toBe(false)
    expect(result.current.actionTimer).toBeNull()
    expect(result.current.syncError).toBeNull()
    expect(result.current.sessionStats).toBeNull()
    expect(result.current.activeHandId).toBeNull()
    expect(result.current.handTagsSaved).toBeNull()
    expect(result.current.myPlayer).toBeNull()
    expect(result.current.tableMode).toBe('coached_cash')
  })
})

describe('useGameState — socket event listeners', () => {
  let socket

  beforeEach(() => {
    socket = createMockSocket()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('room_joined sets myId, isCoach, isSpectator', () => {
    const { result } = renderGameState(socket)
    act(() => {
      socket._trigger('room_joined', { playerId: 'p1', isCoach: true, isSpectator: false })
    })
    expect(result.current.myId).toBe('p1')
    expect(result.current.isCoach).toBe(true)
    expect(result.current.isSpectator).toBe(false)
  })

  it('room_joined with isSpectator=true sets isSpectator', () => {
    const { result } = renderGameState(socket)
    act(() => {
      socket._trigger('room_joined', { playerId: 'spec1', isCoach: false, isSpectator: true })
    })
    expect(result.current.isSpectator).toBe(true)
    expect(result.current.isCoach).toBe(false)
  })

  it('game_state updates gameState and clears syncError', () => {
    const { result } = renderGameState(socket)
    // First set a syncError
    act(() => { socket._trigger('sync_error', 'old error') })
    const state = { phase: 'preflop', players: [], pot: 100 }
    act(() => { socket._trigger('game_state', state) })
    expect(result.current.gameState).toEqual(state)
    expect(result.current.syncError).toBeNull()
  })

  it('game_state with phase=waiting clears activeHandId', () => {
    const { result } = renderGameState(socket)
    act(() => { socket._trigger('hand_started', { handId: 42 }) })
    expect(result.current.activeHandId).toBe(42)
    act(() => { socket._trigger('game_state', { phase: 'waiting', players: [] }) })
    expect(result.current.activeHandId).toBeNull()
  })

  it('game_state with non-waiting phase does NOT clear activeHandId', () => {
    const { result } = renderGameState(socket)
    act(() => { socket._trigger('hand_started', { handId: 42 }) })
    act(() => { socket._trigger('game_state', { phase: 'preflop', players: [] }) })
    expect(result.current.activeHandId).toBe(42)
  })

  it('game_state clears coachDisconnected when coach is present in players', () => {
    const { result } = renderGameState(socket)
    act(() => { socket._trigger('coach_disconnected', 'Coach left') })
    expect(result.current.coachDisconnected).toBe(true)
    act(() => {
      socket._trigger('game_state', {
        phase: 'waiting',
        players: [{ is_coach: true }],
      })
    })
    expect(result.current.coachDisconnected).toBe(false)
  })

  it('game_state does NOT clear coachDisconnected when no coach in players', () => {
    const { result } = renderGameState(socket)
    act(() => { socket._trigger('coach_disconnected', 'Coach left') })
    act(() => {
      socket._trigger('game_state', {
        phase: 'preflop',
        players: [{ is_coach: false }, { is_coach: false }],
      })
    })
    expect(result.current.coachDisconnected).toBe(true)
  })

  it('error event with string payload calls addError', () => {
    const { result, addError } = renderGameState(socket)
    act(() => { socket._trigger('error', 'Something broke') })
    expect(addError).toHaveBeenCalledWith('Something broke')
  })

  it('error event with object payload extracts message', () => {
    const { result, addError } = renderGameState(socket)
    act(() => { socket._trigger('error', { message: 'Detailed error' }) })
    expect(addError).toHaveBeenCalledWith('Detailed error')
  })

  it('error event with null falls back to "Unknown error"', () => {
    const { result, addError } = renderGameState(socket)
    act(() => { socket._trigger('error', null) })
    expect(addError).toHaveBeenCalledWith('Unknown error')
  })

  it('notification event with string calls addNotification', () => {
    const { result, addNotification } = renderGameState(socket)
    act(() => { socket._trigger('notification', 'Hello!') })
    expect(addNotification).toHaveBeenCalledWith('Hello!')
  })

  it('notification event with object payload extracts message', () => {
    const { result, addNotification } = renderGameState(socket)
    act(() => { socket._trigger('notification', { message: 'Object notification' }) })
    expect(addNotification).toHaveBeenCalledWith('Object notification')
  })

  it('notification event with empty string does NOT call addNotification', () => {
    const { result, addNotification } = renderGameState(socket)
    act(() => { socket._trigger('notification', '') })
    expect(addNotification).not.toHaveBeenCalled()
  })

  it('session_stats updates sessionStats', () => {
    const { result } = renderGameState(socket)
    const stats = { vpip: 0.3, pfr: 0.2, wtsd: 0.4 }
    act(() => { socket._trigger('session_stats', stats) })
    expect(result.current.sessionStats).toEqual(stats)
  })

  it('action_timer sets actionTimer', () => {
    const { result } = renderGameState(socket)
    const timer = { playerId: 'p1', duration: 30, startedAt: 1000 }
    act(() => { socket._trigger('action_timer', timer) })
    expect(result.current.actionTimer).toEqual(timer)
  })

  it('action_timer with null cancels the timer', () => {
    const { result } = renderGameState(socket)
    act(() => { socket._trigger('action_timer', { playerId: 'p1', duration: 30 }) })
    act(() => { socket._trigger('action_timer', null) })
    expect(result.current.actionTimer).toBeNull()
  })

  it('coach_disconnected sets coachDisconnected=true and calls addNotification', () => {
    const { result, addNotification } = renderGameState(socket)
    act(() => { socket._trigger('coach_disconnected', 'Coach disconnected') })
    expect(result.current.coachDisconnected).toBe(true)
    expect(addNotification).toHaveBeenCalledWith('Coach disconnected')
  })

  it('coach_disconnected with object payload extracts message', () => {
    const { result, addNotification } = renderGameState(socket)
    act(() => { socket._trigger('coach_disconnected', { message: 'Coach gone' }) })
    expect(addNotification).toHaveBeenCalledWith('Coach gone')
  })

  it('coach_disconnected with null/undefined falls back to default message', () => {
    const { result, addNotification } = renderGameState(socket)
    act(() => { socket._trigger('coach_disconnected', null) })
    expect(addNotification).toHaveBeenCalledWith('Coach disconnected')
  })

  it('sync_error sets syncError and calls addError', () => {
    const { result, addError } = renderGameState(socket)
    act(() => { socket._trigger('sync_error', { message: 'Invalid action' }) })
    expect(result.current.syncError).toEqual({ message: 'Invalid action' })
    expect(addError).toHaveBeenCalledWith('Invalid action')
  })

  it('sync_error with string payload sets syncError.message', () => {
    const { result, addError } = renderGameState(socket)
    act(() => { socket._trigger('sync_error', 'Action rejected') })
    expect(result.current.syncError).toEqual({ message: 'Action rejected' })
    expect(addError).toHaveBeenCalledWith('Action rejected')
  })

  it('hand_started sets activeHandId', () => {
    const { result } = renderGameState(socket)
    act(() => { socket._trigger('hand_started', { handId: 99 }) })
    expect(result.current.activeHandId).toBe(99)
  })

  it('hand_tags_saved sets handTagsSaved, then clears after 2000ms', () => {
    const { result } = renderGameState(socket)
    const payload = { saved: true, tags: ['C_BET'] }
    act(() => { socket._trigger('hand_tags_saved', payload) })
    expect(result.current.handTagsSaved).toEqual(payload)
    act(() => { vi.advanceTimersByTime(2000) })
    expect(result.current.handTagsSaved).toBeNull()
  })

  it('hand_tags_saved does NOT clear before 2000ms', () => {
    const { result } = renderGameState(socket)
    act(() => { socket._trigger('hand_tags_saved', { saved: true }) })
    act(() => { vi.advanceTimersByTime(1999) })
    expect(result.current.handTagsSaved).not.toBeNull()
  })

  it('table_config event updates tableMode', () => {
    const { result } = renderGameState(socket)
    act(() => { socket._trigger('table_config', { mode: 'tournament' }) })
    expect(result.current.tableMode).toBe('tournament')
  })

  it('registers socket.off cleanup handlers on unmount', () => {
    const { unmount } = renderGameState(socket)
    unmount()
    expect(socket.off).toHaveBeenCalledWith('room_joined')
    expect(socket.off).toHaveBeenCalledWith('game_state')
    expect(socket.off).toHaveBeenCalledWith('error')
    expect(socket.off).toHaveBeenCalledWith('notification')
    expect(socket.off).toHaveBeenCalledWith('session_stats')
    expect(socket.off).toHaveBeenCalledWith('action_timer')
    expect(socket.off).toHaveBeenCalledWith('coach_disconnected')
    expect(socket.off).toHaveBeenCalledWith('sync_error')
    expect(socket.off).toHaveBeenCalledWith('hand_started')
    expect(socket.off).toHaveBeenCalledWith('hand_tags_saved')
    expect(socket.off).toHaveBeenCalledWith('table_config')
  })
})

describe('useGameState — reset()', () => {
  it('clears all state back to defaults', () => {
    const socket = createMockSocket()
    const { result } = renderGameState(socket)

    act(() => {
      socket._trigger('room_joined', { playerId: 'p1', isCoach: true, isSpectator: false })
      socket._trigger('session_stats', { vpip: 0.5 })
      socket._trigger('hand_started', { handId: 10 })
      socket._trigger('coach_disconnected', 'Coach left')
      socket._trigger('action_timer', { playerId: 'p1', duration: 10 })
      socket._trigger('sync_error', { message: 'Oops' })
    })

    act(() => { result.current.reset() })

    expect(result.current.myId).toBeNull()
    expect(result.current.gameState).toBeNull()
    expect(result.current.isCoach).toBe(false)
    expect(result.current.isSpectator).toBe(false)
    expect(result.current.sessionStats).toBeNull()
    expect(result.current.coachDisconnected).toBe(false)
    expect(result.current.actionTimer).toBeNull()
    expect(result.current.syncError).toBeNull()
    expect(result.current.activeHandId).toBeNull()
    expect(result.current.handTagsSaved).toBeNull()
    expect(result.current.tableMode).toBe('coached_cash')
  })
})

describe('useGameState — derived state', () => {
  it('myPlayer is null when gameState is null', () => {
    const socket = createMockSocket()
    const { result } = renderGameState(socket)
    expect(result.current.myPlayer).toBeNull()
  })

  it('myPlayer resolves to the player matching myId', () => {
    const socket = createMockSocket()
    const { result } = renderGameState(socket)
    act(() => {
      socket._trigger('room_joined', { playerId: 'p1', isCoach: false, isSpectator: false })
      socket._trigger('game_state', {
        phase: 'preflop',
        players: [
          { id: 'p1', name: 'Alice' },
          { id: 'p2', name: 'Bob' },
        ],
      })
    })
    expect(result.current.myPlayer).toEqual({ id: 'p1', name: 'Alice' })
  })

  it('myPlayer is null when myId does not match any player', () => {
    const socket = createMockSocket()
    const { result } = renderGameState(socket)
    act(() => {
      socket._trigger('room_joined', { playerId: 'p99', isCoach: false, isSpectator: false })
      socket._trigger('game_state', { phase: 'preflop', players: [{ id: 'p1', name: 'Alice' }] })
    })
    expect(result.current.myPlayer).toBeNull()
  })
})

describe('useGameState — emit helpers', () => {
  let socket

  beforeEach(() => { socket = createMockSocket() })

  function setup() {
    return renderGameState(socket)
  }

  it('startGame emits start_game with mode', () => {
    const { result } = setup()
    act(() => { result.current.startGame('random') })
    expect(socket.emit).toHaveBeenCalledWith('start_game', { mode: 'random' })
  })

  it('placeBet emits place_bet with action and amount', () => {
    const { result } = setup()
    act(() => { result.current.placeBet('call', 100) })
    expect(socket.emit).toHaveBeenCalledWith('place_bet', { action: 'call', amount: 100 })
  })

  it('manualDealCard emits manual_deal_card', () => {
    const { result } = setup()
    act(() => { result.current.manualDealCard('player', 'p1', 0, 'Ah') })
    expect(socket.emit).toHaveBeenCalledWith('manual_deal_card', {
      targetType: 'player', targetId: 'p1', position: 0, card: 'Ah',
    })
  })

  it('undoAction emits undo_action', () => {
    const { result } = setup()
    act(() => { result.current.undoAction() })
    expect(socket.emit).toHaveBeenCalledWith('undo_action')
  })

  it('rollbackStreet emits rollback_street', () => {
    const { result } = setup()
    act(() => { result.current.rollbackStreet() })
    expect(socket.emit).toHaveBeenCalledWith('rollback_street')
  })

  it('togglePause emits toggle_pause', () => {
    const { result } = setup()
    act(() => { result.current.togglePause() })
    expect(socket.emit).toHaveBeenCalledWith('toggle_pause')
  })

  it('setMode emits set_mode with mode', () => {
    const { result } = setup()
    act(() => { result.current.setMode('replay') })
    expect(socket.emit).toHaveBeenCalledWith('set_mode', { mode: 'replay' })
  })

  it('forceNextStreet emits force_next_street', () => {
    const { result } = setup()
    act(() => { result.current.forceNextStreet() })
    expect(socket.emit).toHaveBeenCalledWith('force_next_street')
  })

  it('awardPot emits award_pot with winnerId', () => {
    const { result } = setup()
    act(() => { result.current.awardPot('p1') })
    expect(socket.emit).toHaveBeenCalledWith('award_pot', { winnerId: 'p1' })
  })

  it('resetHand emits reset_hand', () => {
    const { result } = setup()
    act(() => { result.current.resetHand() })
    expect(socket.emit).toHaveBeenCalledWith('reset_hand')
  })

  it('adjustStack emits adjust_stack with playerId and amount', () => {
    const { result } = setup()
    act(() => { result.current.adjustStack('p1', 500) })
    expect(socket.emit).toHaveBeenCalledWith('adjust_stack', { playerId: 'p1', amount: 500 })
  })

  it('openConfigPhase emits open_config_phase', () => {
    const { result } = setup()
    act(() => { result.current.openConfigPhase() })
    expect(socket.emit).toHaveBeenCalledWith('open_config_phase')
  })

  it('updateHandConfig emits update_hand_config with config', () => {
    const { result } = setup()
    const config = { players: [] }
    act(() => { result.current.updateHandConfig(config) })
    expect(socket.emit).toHaveBeenCalledWith('update_hand_config', { config })
  })

  it('startConfiguredHand emits start_configured_hand', () => {
    const { result } = setup()
    act(() => { result.current.startConfiguredHand() })
    expect(socket.emit).toHaveBeenCalledWith('start_configured_hand')
  })

  it('loadHandScenario emits load_hand_scenario with handId and stackMode', () => {
    const { result } = setup()
    act(() => { result.current.loadHandScenario(7, 'keep') })
    expect(socket.emit).toHaveBeenCalledWith('load_hand_scenario', { handId: 7, stackMode: 'keep' })
  })

  it('loadHandScenario defaults stackMode to "keep"', () => {
    const { result } = setup()
    act(() => { result.current.loadHandScenario(7) })
    expect(socket.emit).toHaveBeenCalledWith('load_hand_scenario', { handId: 7, stackMode: 'keep' })
  })

  it('updateHandTags emits update_hand_tags with handId and tags', () => {
    const { result } = setup()
    act(() => { result.current.updateHandTags(99, ['C_BET']) })
    expect(socket.emit).toHaveBeenCalledWith('update_hand_tags', { handId: 99, tags: ['C_BET'] })
  })

  it('setPlayerInHand emits set_player_in_hand', () => {
    const { result } = setup()
    act(() => { result.current.setPlayerInHand('p1', true) })
    expect(socket.emit).toHaveBeenCalledWith('set_player_in_hand', { playerId: 'p1', inHand: true })
  })

  it('setBlindLevels emits set_blind_levels with sb and bb', () => {
    const { result } = setup()
    act(() => { result.current.setBlindLevels(5, 10) })
    expect(socket.emit).toHaveBeenCalledWith('set_blind_levels', { sb: 5, bb: 10 })
  })
})
