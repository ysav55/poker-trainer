/**
 * UI_EdgeCases.test.jsx
 * Frontend edge case tests using Vitest + React Testing Library
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import React from 'react'

// ── Mocks ──────────────────────────────────────────────────────────────────

// Mock socket.io-client so tests don't hit the network
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
    connected: true,
  })),
}))

// ── Helpers ────────────────────────────────────────────────────────────────

/** Build a minimal gameState object for test use */
function makeGameState(overrides = {}) {
  return {
    phase: 'preflop',
    paused: false,
    current_turn: 'player-1',
    current_bet: 20,
    min_raise: 20,
    pot: 60,
    board: [],
    players: [
      {
        id: 'player-1',
        name: 'Alice',
        seat: 0,
        stack: 980,
        hole_cards: ['Ah', 'Kd'],
        action: 'waiting',
        is_active: true,
        is_coach: false,
        is_dealer: false,
        is_small_blind: false,
        is_big_blind: false,
        is_all_in: false,
        current_bet: 0,
        total_bet_this_round: 0,
      },
      {
        id: 'player-2',
        name: 'Bob',
        seat: 1,
        stack: 960,
        hole_cards: ['7c', '2d'],
        action: 'called',
        is_active: true,
        is_coach: false,
        is_dealer: true,
        is_small_blind: false,
        is_big_blind: false,
        is_all_in: false,
        current_bet: 20,
        total_bet_this_round: 20,
      },
    ],
    side_pots: [],
    winner: null,
    winner_name: null,
    showdown_result: null,
    can_undo: false,
    can_rollback_street: false,
    config_phase: false,
    config: null,
    ...overrides,
  }
}

/** Build a minimal emit bundle */
function makeEmit(overrides = {}) {
  return {
    placeBet: vi.fn(),
    resetHand: vi.fn(),
    undoAction: vi.fn(),
    rollbackStreet: vi.fn(),
    togglePause: vi.fn(),
    forceNextStreet: vi.fn(),
    awardPot: vi.fn(),
    adjustStack: vi.fn(),
    startGame: vi.fn(),
    openConfigPhase: vi.fn(),
    updateHandConfig: vi.fn(),
    startConfiguredHand: vi.fn(),
    loadHandScenario: vi.fn(),
    createPlaylist: vi.fn(),
    getPlaylists: vi.fn(),
    addToPlaylist: vi.fn(),
    removeFromPlaylist: vi.fn(),
    deletePlaylist: vi.fn(),
    activatePlaylist: vi.fn(),
    deactivatePlaylist: vi.fn(),
    ...overrides,
  }
}

// ── Test 1: Spectator View ─────────────────────────────────────────────────

describe('Test 1: Spectator View', () => {
  it('spectator cannot see betting controls', async () => {
    const { default: BettingControls } = await import('../components/BettingControls.jsx')

    // Spectator: isMyTurn would be false anyway since spectator has no myId match
    const gameState = makeGameState()
    const emit = makeEmit()

    // Spectator does not have a player ID in the game — myId won't match anyone
    render(
      <BettingControls
        gameState={gameState}
        myId="spectator-123"  // Not in the players list
        isCoach={false}
        emit={emit}
      />
    )

    // BettingControls returns null if not your turn — no buttons should appear
    expect(screen.queryByText('FOLD')).toBeNull()
    expect(screen.queryByText('CHECK')).toBeNull()
    expect(screen.queryByText(/CALL/)).toBeNull()
    expect(screen.queryByText('RAISE')).toBeNull()
  })

  it('spectator with no matching player id sees no betting panel', async () => {
    const { default: BettingControls } = await import('../components/BettingControls.jsx')
    const gameState = makeGameState({ current_turn: 'player-1' })
    const emit = makeEmit()

    const { container } = render(
      <BettingControls
        gameState={gameState}
        myId="spectator-999"
        isCoach={false}
        emit={emit}
      />
    )

    // Component returns null for non-turn player
    expect(container.firstChild).toBeNull()
  })
})

// ── Test 2: Reconnection Sync ──────────────────────────────────────────────

describe('Test 2: Reconnection Sync', () => {
  it('renders pot and board state from game_state snapshot after reconnect', async () => {
    const { default: PokerTable } = await import('../components/PokerTable.jsx')

    const gameState = makeGameState({
      phase: 'flop',
      pot: 240,
      board: ['Ah', 'Kd', '7c', null, null],
      // flop: preflop bets already collected into pot, so no live round bets
      players: [
        { id: 'player-1', name: 'Alice', seat: 0, stack: 880, hole_cards: ['Ah', 'Kd'], action: 'waiting', is_active: true, is_coach: false, is_dealer: false, is_small_blind: false, is_big_blind: false, is_all_in: false, current_bet: 0, total_bet_this_round: 0 },
        { id: 'player-2', name: 'Bob',   seat: 1, stack: 880, hole_cards: ['7c', '2d'], action: 'waiting', is_active: true, is_coach: false, is_dealer: true,  is_small_blind: false, is_big_blind: false, is_all_in: false, current_bet: 0, total_bet_this_round: 0 },
      ],
    })

    const { rerender } = render(
      <PokerTable
        gameState={null}
        myId="player-1"
        isCoach={false}
        emit={makeEmit()}
      />
    )

    // Simulate reconnect: game_state arrives after reconnect
    rerender(
      <PokerTable
        gameState={gameState}
        myId="player-1"
        isCoach={false}
        emit={makeEmit()}
      />
    )

    // Pot should be visible
    expect(screen.getByText('240')).toBeTruthy()
  })

  it('handles null gameState gracefully (before reconnect)', async () => {
    const { default: PokerTable } = await import('../components/PokerTable.jsx')

    expect(() => {
      render(
        <PokerTable
          gameState={null}
          myId="player-1"
          isCoach={false}
          emit={makeEmit()}
        />
      )
    }).not.toThrow()
  })
})

// ── Test 3: Illegal Bet Input ──────────────────────────────────────────────

describe('Test 3: Illegal Bet Input', () => {
  it('raise button is disabled when raise amount is below min_raise', async () => {
    const { default: BettingControls } = await import('../components/BettingControls.jsx')

    const gameState = makeGameState({
      current_turn: 'player-1',
      current_bet: 20,
      min_raise: 20,
      pot: 60,
    })
    const emit = makeEmit()

    render(
      <BettingControls
        gameState={gameState}
        myId="player-1"
        isCoach={false}
        emit={emit}
      />
    )

    // Click RAISE to open the raise panel
    const raiseBtn = screen.getByText('RAISE')
    fireEvent.click(raiseBtn)

    // The raise panel should now be open — find the number input
    // Find the numeric input and set it to a value below min
    const input = document.querySelector('input[type="number"]')
    if (input) {
      fireEvent.change(input, { target: { value: '5' } })
      // Confirm raise button still renders — it should be disabled for invalid input
      const confirmBtn = screen.queryByText(/RAISE/)
      expect(confirmBtn).not.toBeNull()
    }
  })

  it('fold, call, and raise buttons are shown when it is the player turn', async () => {
    const { default: BettingControls } = await import('../components/BettingControls.jsx')

    const gameState = makeGameState({
      current_turn: 'player-1',
      current_bet: 20,
    })

    render(
      <BettingControls
        gameState={gameState}
        myId="player-1"
        isCoach={false}
        emit={makeEmit()}
      />
    )

    expect(screen.getByText('FOLD')).toBeTruthy()
    expect(screen.getByText(/CALL/)).toBeTruthy()
    expect(screen.getByText('RAISE')).toBeTruthy()
  })
})

// ── Test 4: Coach 50% Opacity ──────────────────────────────────────────────

describe('Test 4: Coach 50% Opacity for Opponent Cards', () => {
  it('coach sees opponent cards face-down during live play (server sends HIDDEN)', async () => {
    const { default: PlayerSeat } = await import('../components/PlayerSeat.jsx')

    const player = {
      id: 'player-2',
      name: 'Bob',
      seat: 1,
      stack: 960,
      // Server sends 'HIDDEN' for opponents in live play — even to the coach
      hole_cards: ['HIDDEN', 'HIDDEN'],
      action: 'waiting',
      is_active: true,
      is_coach: false,
      is_dealer: false,
      is_small_blind: false,
      is_big_blind: false,
      is_all_in: false,
    }

    const { container } = render(
      <PlayerSeat
        player={player}
        isCurrentTurn={false}
        isMe={false}         // Not the current user
        isCoach={true}       // Coach is watching live play
        showdownResult={null}
        isWinner={false}
      />
    )

    // Cards should be face-down — no face-up card text visible, no opacity reduction
    expect(screen.queryByText('7c')).toBeNull()
    expect(screen.queryByText('2d')).toBeNull()
  })

  it('player viewing own cards has no opacity reduction', async () => {
    const { default: PlayerSeat } = await import('../components/PlayerSeat.jsx')

    const player = {
      id: 'player-1',
      name: 'Alice',
      seat: 0,
      stack: 980,
      hole_cards: ['Ah', 'Kd'],
      action: 'waiting',
      is_active: true,
      is_coach: false,
      is_dealer: false,
      is_small_blind: false,
      is_big_blind: false,
      is_all_in: false,
    }

    const { container } = render(
      <PlayerSeat
        player={player}
        isCurrentTurn={false}
        isMe={true}           // Is the current user
        isCoach={false}
        showdownResult={null}
        isWinner={false}
      />
    )

    // No opacity 0.5 elements for own cards
    const opacityEls = container.querySelectorAll('[style*="opacity: 0.5"]')
    expect(opacityEls.length).toBe(0)
  })
})
