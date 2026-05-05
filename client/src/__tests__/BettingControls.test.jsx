/**
 * BettingControls.test.jsx
 * Tests for bet panel rendering, action buttons, raise panel, and pendingBet reset.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import React from 'react'

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Build a minimal gameState with player-1 as the acting player */
function makeGameState(overrides = {}) {
  return {
    phase: 'preflop',
    paused: false,
    current_turn: 'player-1',
    current_bet: 20,
    min_raise: 20,
    pot: 200,

    players: [
      {
        id: 'player-1',
        name: 'Alice',
        seat: 0,
        stack: 980,
        is_active: true,
        is_coach: false,
        is_shadow: false,
        current_bet: 0,
        total_bet_this_round: 0,
      },
      {
        id: 'player-2',
        name: 'Bob',
        seat: 1,
        stack: 960,
        is_active: true,
        is_coach: false,
        is_shadow: false,
        current_bet: 20,
        total_bet_this_round: 20,
      },
    ],
    ...overrides,
  }
}

function makeEmit(overrides = {}) {
  return {
    placeBet: vi.fn(),
    ...overrides,
  }
}

// ── Guard: not player turn → returns null ────────────────────────────────────

describe('BettingControls — guard: not our turn', () => {
  it('renders nothing when gameState is null', async () => {
    const { default: BettingControls } = await import('../components/BettingControls.jsx')
    const { container } = render(
      <BettingControls gameState={null} myId="player-1" isCoach={false} emit={makeEmit()} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when phase is "waiting" (not an active phase)', async () => {
    const { default: BettingControls } = await import('../components/BettingControls.jsx')
    const { container } = render(
      <BettingControls
        gameState={makeGameState({ phase: 'waiting' })}
        myId="player-1"
        isCoach={false}
        emit={makeEmit()}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when game is paused', async () => {
    const { default: BettingControls } = await import('../components/BettingControls.jsx')
    const { container } = render(
      <BettingControls
        gameState={makeGameState({ paused: true })}
        myId="player-1"
        isCoach={false}
        emit={makeEmit()}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when it is not this player turn', async () => {
    const { default: BettingControls } = await import('../components/BettingControls.jsx')
    const { container } = render(
      <BettingControls
        gameState={makeGameState({ current_turn: 'player-2' })}
        myId="player-1"
        isCoach={false}
        emit={makeEmit()}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when myId does not match any player', async () => {
    const { default: BettingControls } = await import('../components/BettingControls.jsx')
    const { container } = render(
      <BettingControls
        gameState={makeGameState({ current_turn: 'spectator-99' })}
        myId="spectator-99"
        isCoach={false}
        emit={makeEmit()}
      />
    )
    expect(container.firstChild).toBeNull()
  })
})

// ── Action buttons ───────────────────────────────────────────────────────────

describe('BettingControls — action buttons', () => {
  it('shows FOLD, CALL, and RAISE when it is the player turn with a bet to call', async () => {
    const { default: BettingControls } = await import('../components/BettingControls.jsx')
    render(
      <BettingControls
        gameState={makeGameState({ current_bet: 20 })}
        myId="player-1"
        isCoach={false}
        emit={makeEmit()}
      />
    )
    expect(screen.getByText('FOLD')).toBeTruthy()
    expect(screen.getByText(/CALL/)).toBeTruthy()
    expect(screen.getByText('RAISE')).toBeTruthy()
  })

  it('shows CHECK instead of CALL when no bet to call (current_bet=0)', async () => {
    const { default: BettingControls } = await import('../components/BettingControls.jsx')
    render(
      <BettingControls
        gameState={makeGameState({ current_bet: 0, min_raise: 20 })}
        myId="player-1"
        isCoach={false}
        emit={makeEmit()}
      />
    )
    expect(screen.getByText('CHECK')).toBeTruthy()
    expect(screen.queryByText(/CALL/)).toBeNull()
  })

  it('shows CHECK when player has already matched the current bet', async () => {
    const { default: BettingControls } = await import('../components/BettingControls.jsx')
    const gameState = makeGameState({
      current_bet: 20,
      players: [
        {
          id: 'player-1', name: 'Alice', seat: 0, stack: 980,
          is_active: true, is_coach: false, is_shadow: false,
          current_bet: 20, total_bet_this_round: 20, // already called
        },
        {
          id: 'player-2', name: 'Bob', seat: 1, stack: 960,
          is_active: true, is_coach: false, is_shadow: false,
          current_bet: 20, total_bet_this_round: 20,
        },
      ],
    })
    render(
      <BettingControls gameState={gameState} myId="player-1" isCoach={false} emit={makeEmit()} />
    )
    expect(screen.getByText('CHECK')).toBeTruthy()
  })

  it('FOLD click calls emit.placeBet("fold")', async () => {
    const { default: BettingControls } = await import('../components/BettingControls.jsx')
    const emit = makeEmit()
    render(
      <BettingControls
        gameState={makeGameState()}
        myId="player-1"
        isCoach={false}
        emit={emit}
      />
    )
    fireEvent.click(screen.getByText('FOLD'))
    expect(emit.placeBet).toHaveBeenCalledWith('fold')
  })

  it('CHECK click calls emit.placeBet("check")', async () => {
    const { default: BettingControls } = await import('../components/BettingControls.jsx')
    const emit = makeEmit()
    render(
      <BettingControls
        gameState={makeGameState({ current_bet: 0 })}
        myId="player-1"
        isCoach={false}
        emit={emit}
      />
    )
    fireEvent.click(screen.getByText('CHECK'))
    expect(emit.placeBet).toHaveBeenCalledWith('check')
  })

  it('CALL click calls emit.placeBet("call")', async () => {
    const { default: BettingControls } = await import('../components/BettingControls.jsx')
    const emit = makeEmit()
    render(
      <BettingControls
        gameState={makeGameState({ current_bet: 20 })}
        myId="player-1"
        isCoach={false}
        emit={emit}
      />
    )
    fireEvent.click(screen.getByText(/CALL/))
    expect(emit.placeBet).toHaveBeenCalledWith('call')
  })

  it('shows "YOUR TURN" label on active turn', async () => {
    const { default: BettingControls } = await import('../components/BettingControls.jsx')
    render(
      <BettingControls
        gameState={makeGameState()}
        myId="player-1"
        isCoach={false}
        emit={makeEmit()}
      />
    )
    expect(screen.getByText('YOUR TURN')).toBeTruthy()
  })

  it('shows stack and pot info bars', async () => {
    const { default: BettingControls } = await import('../components/BettingControls.jsx')
    render(
      <BettingControls
        gameState={makeGameState({ pot: 200 })}
        myId="player-1"
        isCoach={false}
        emit={makeEmit()}
      />
    )
    // Stack and pot labels are present
    expect(screen.getByText('Stack')).toBeTruthy()
    expect(screen.getByText('Pot')).toBeTruthy()
  })
})

// ── Raise panel ──────────────────────────────────────────────────────────────

describe('BettingControls — raise panel', () => {
  it('first RAISE click opens the raise panel (does not emit)', async () => {
    const { default: BettingControls } = await import('../components/BettingControls.jsx')
    const emit = makeEmit()
    render(
      <BettingControls
        gameState={makeGameState()}
        myId="player-1"
        isCoach={false}
        emit={emit}
      />
    )
    fireEvent.click(screen.getByText('RAISE'))
    // emit.placeBet should NOT have been called yet
    expect(emit.placeBet).not.toHaveBeenCalled()
    // Raise panel now open — slider should be present
    expect(document.querySelector('input[type="range"]')).toBeTruthy()
  })

  it('second RAISE click (with panel open) submits the raise', async () => {
    const { default: BettingControls } = await import('../components/BettingControls.jsx')
    const emit = makeEmit()
    render(
      <BettingControls
        gameState={makeGameState({ current_bet: 20, min_raise: 20, pot: 200 })}
        myId="player-1"
        isCoach={false}
        emit={emit}
      />
    )
    // Open raise panel
    fireEvent.click(screen.getByText('RAISE'))
    // Click raise again to submit
    fireEvent.click(screen.getByText(/RAISE/))
    expect(emit.placeBet).toHaveBeenCalledWith('raise', expect.any(Number))
  })

  it('All-In quick raise button is shown in raise panel', async () => {
    const { default: BettingControls } = await import('../components/BettingControls.jsx')
    render(
      <BettingControls
        gameState={makeGameState()}
        myId="player-1"
        isCoach={false}
        emit={makeEmit()}
      />
    )
    fireEvent.click(screen.getByText('RAISE'))
    expect(screen.getByText('All-In')).toBeTruthy()
  })

  it('raise panel shows Min and Max labels', async () => {
    const { default: BettingControls } = await import('../components/BettingControls.jsx')
    render(
      <BettingControls gameState={makeGameState()} myId="player-1" isCoach={false} emit={makeEmit()} />
    )
    fireEvent.click(screen.getByText('RAISE'))
    expect(screen.getByText(/Min:/)).toBeTruthy()
    expect(screen.getByText(/Max:/)).toBeTruthy()
  })
})

// ── pendingBet ISS-88 dual-reset ─────────────────────────────────────────────

describe('BettingControls — pendingBet reset (ISS-88)', () => {
  it('buttons are disabled after an action is submitted (pendingBet=true)', async () => {
    const { default: BettingControls } = await import('../components/BettingControls.jsx')
    const emit = makeEmit()
    render(
      <BettingControls gameState={makeGameState()} myId="player-1" isCoach={false} emit={emit} />
    )
    fireEvent.click(screen.getByText('FOLD'))
    expect(screen.getByText('FOLD')).toBeDisabled()
  })

  it('pendingBet resets when a fresh gameState object arrives (ISS-60 path)', async () => {
    const { default: BettingControls } = await import('../components/BettingControls.jsx')
    const emit = makeEmit()
    const gs1 = makeGameState()
    const { rerender } = render(
      <BettingControls gameState={gs1} myId="player-1" isCoach={false} emit={emit} />
    )

    // Click FOLD → pendingBet = true → button disabled
    fireEvent.click(screen.getByText('FOLD'))
    expect(screen.getByText('FOLD')).toBeDisabled()

    // New gameState object arrives (same turn, fresh ref)
    const gs2 = { ...gs1 }
    rerender(
      <BettingControls gameState={gs2} myId="player-1" isCoach={false} emit={emit} />
    )

    // pendingBet should be reset → button enabled again
    expect(screen.getByText('FOLD')).not.toBeDisabled()
  })

  it('pendingBet resets and panel hides when isMyTurn becomes false then true again', async () => {
    const { default: BettingControls } = await import('../components/BettingControls.jsx')
    const emit = makeEmit()
    const gs = makeGameState()
    const { rerender } = render(
      <BettingControls gameState={gs} myId="player-1" isCoach={false} emit={emit} />
    )

    // Submit a fold → pendingBet = true
    fireEvent.click(screen.getByText('FOLD'))
    expect(screen.getByText('FOLD')).toBeDisabled()

    // Server processes: current_turn moves to player-2 → component returns null
    rerender(
      <BettingControls
        gameState={{ ...gs, current_turn: 'player-2' }}
        myId="player-1"
        isCoach={false}
        emit={emit}
      />
    )
    expect(screen.queryByText('FOLD')).toBeNull()

    // Player 1's turn again (new hand / action)
    rerender(
      <BettingControls
        gameState={{ ...gs, current_turn: 'player-1' }}
        myId="player-1"
        isCoach={false}
        emit={emit}
      />
    )

    // pendingBet should be cleared — FOLD should be enabled
    expect(screen.getByText('FOLD')).not.toBeDisabled()
  })
})

// ── bbView formatting ────────────────────────────────────────────────────────

describe('BettingControls — bbView formatting', () => {
  it('displays "To Call" amount in chips by default', async () => {
    const { default: BettingControls } = await import('../components/BettingControls.jsx')
    render(
      <BettingControls
        gameState={makeGameState({ current_bet: 20, pot: 60 })}
        myId="player-1"
        isCoach={false}
        emit={makeEmit()}
        bbView={false}
        bigBlind={10}
      />
    )
    expect(screen.getByText('To Call')).toBeTruthy()
    // "20" chip amount should appear
    expect(screen.getByText('20')).toBeTruthy()
  })
})
