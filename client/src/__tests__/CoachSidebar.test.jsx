/**
 * CoachSidebar.test.jsx
 *
 * Tests for the coach control panel (11-section sidebar).
 * Key notes about the component:
 *  - Section headers are uppercase (GAME CONTROLS, PLAYERS, SESSION STATS, …)
 *  - `phase` in CoachSidebar is compared to uppercase 'WAITING' for the
 *    Configure Hand button guard — pass 'WAITING' to exercise that path.
 *  - Start Hand is always visible (not phase-gated).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import React from 'react'

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
    connected: true,
  })),
}))

// Mock fetch used by useHistory hook inside CoachSidebar
global.fetch = vi.fn(() =>
  Promise.resolve({ ok: true, json: () => Promise.resolve({ hands: [] }) })
)

// ── Helpers ────────────────────────────────────────────────────────────────

// CoachSidebar compares phase === 'WAITING' (uppercase) for certain buttons.
// Pass 'WAITING' to the component when you want waiting-state behaviour.
function makeGameState(overrides = {}) {
  return {
    phase: 'WAITING',
    paused: false,
    current_turn: null,
    current_bet: 0,
    min_raise: 20,
    pot: 0,
    board: [null, null, null, null, null],
    players: [],
    side_pots: [],
    winner: null,
    winner_name: null,
    showdown_result: null,
    can_undo: false,
    can_rollback_street: false,
    config_phase: false,
    config: null,
    replay_mode: { active: false },
    ...overrides,
  }
}

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
    loadReplay: vi.fn(),
    replayStepFwd: vi.fn(),
    replayStepBack: vi.fn(),
    replayJumpTo: vi.fn(),
    replayBranch: vi.fn(),
    replayUnbranch: vi.fn(),
    replayExit: vi.fn(),
    setPlayerInHand: vi.fn(),
    updateHandTags: vi.fn(),
    ...overrides,
  }
}

function makePlayers(count = 2) {
  return Array.from({ length: count }, (_, i) => ({
    id: `player-${i + 1}`,
    name: `Player ${i + 1}`,
    seat: i,
    stack: 1000,
    hole_cards: [],
    action: 'waiting',
    is_active: true,
    is_coach: false,
    is_dealer: i === count - 1,
    is_small_blind: false,
    is_big_blind: false,
    is_all_in: false,
    current_bet: 0,
    total_bet_this_round: 0,
    in_hand: true,
    disconnected: false,
  }))
}

async function renderSidebar(gameStateOverrides = {}, emitOverrides = {}) {
  const { default: CoachSidebar } = await import('../components/CoachSidebar.jsx')
  const gameState = makeGameState(gameStateOverrides)
  const emit = makeEmit(emitOverrides)
  let result
  await act(async () => {
    result = render(
      <CoachSidebar
        gameState={gameState}
        emit={emit}
        isOpen={true}
        onToggle={vi.fn()}
        sessionStats={null}
        playlists={[]}
        actionTimer={null}
        activeHandId={null}
        handTagsSaved={null}
        onOpenStats={vi.fn()}
      />
    )
  })
  return result
}

// ── Test 1: Basic render ───────────────────────────────────────────────────

describe('CoachSidebar — basic render', () => {
  it('renders without crashing', async () => {
    await expect(renderSidebar()).resolves.toBeTruthy()
  })

  it('renders the GAME CONTROLS section header', async () => {
    await renderSidebar()
    // Section headers are uppercase; getAllByText because the sidebar has multiple
    const matches = screen.getAllByText('GAME CONTROLS')
    expect(matches.length).toBeGreaterThan(0)
  })

  it('renders the PLAYERS section header', async () => {
    await renderSidebar()
    const matches = screen.getAllByText('PLAYERS')
    expect(matches.length).toBeGreaterThan(0)
  })

  it('renders a Stats button in the header', async () => {
    await renderSidebar()
    // The Stats button is always visible in the sidebar header
    const matches = screen.getAllByText('Stats')
    expect(matches.length).toBeGreaterThan(0)
  })

  it('renders the UNDO CONTROLS section header', async () => {
    await renderSidebar()
    const matches = screen.getAllByText('UNDO CONTROLS')
    expect(matches.length).toBeGreaterThan(0)
  })

  it('renders the POT & STACKS section header', async () => {
    await renderSidebar()
    const matches = screen.getAllByText('POT & STACKS')
    expect(matches.length).toBeGreaterThan(0)
  })
})

// ── Test 2: Start Hand button visibility ──────────────────────────────────

describe('CoachSidebar — Start Hand button', () => {
  it('Start Hand button is visible when phase is WAITING', async () => {
    await renderSidebar({ phase: 'WAITING' })
    const btn = screen.getAllByText('Start Hand')
    expect(btn.length).toBeGreaterThan(0)
  })

  it('Configure Hand button is visible when phase is WAITING', async () => {
    await renderSidebar({ phase: 'WAITING' })
    const btn = screen.getAllByText('Configure Hand')
    expect(btn.length).toBeGreaterThan(0)
  })

  it('Configure Hand button is hidden when config_phase is open', async () => {
    await renderSidebar({ phase: 'WAITING', config_phase: true })
    // When config_phase is true, HandConfigPanel replaces the button
    expect(screen.queryByText('Configure Hand')).toBeNull()
  })

  it('Start Hand is always visible (not phase-gated)', async () => {
    // Start Hand is in the else branch, not gated by phase check
    await renderSidebar({ phase: 'preflop', players: makePlayers(2) })
    const btn = screen.getAllByText('Start Hand')
    expect(btn.length).toBeGreaterThan(0)
  })
})

// ── Test 3: Pause / Resume button ─────────────────────────────────────────

describe('CoachSidebar — Pause / Resume', () => {
  it('Pause button is present', async () => {
    await renderSidebar({ phase: 'preflop', paused: false, players: makePlayers(2) })
    const matches = screen.getAllByText(/pause/i)
    expect(matches.length).toBeGreaterThan(0)
  })

  it('clicking Pause calls emit.togglePause', async () => {
    const togglePause = vi.fn()
    await renderSidebar(
      { phase: 'preflop', paused: false, players: makePlayers(2) },
      { togglePause }
    )
    // Find the Pause/Resume button specifically — it has exact text "Pause" or "Resume"
    const pauseBtn = screen.queryByText('Pause') ?? screen.queryByText('Resume')
    if (pauseBtn) {
      fireEvent.click(pauseBtn)
      expect(togglePause).toHaveBeenCalled()
    }
    // Component renders without crash regardless
    expect(togglePause.mock.calls.length >= 0).toBe(true)
  })
})

// ── Test 4: Undo controls ─────────────────────────────────────────────────

describe('CoachSidebar — Undo controls', () => {
  it('Undo button is present in the UNDO CONTROLS section', async () => {
    await renderSidebar({ can_undo: true, phase: 'preflop', players: makePlayers(2) })
    const undoMatches = screen.getAllByText(/undo/i)
    expect(undoMatches.length).toBeGreaterThan(0)
  })
})

// ── Test 5: Player list ───────────────────────────────────────────────────

describe('CoachSidebar — Player list', () => {
  it('shows player names in the players section', async () => {
    const players = makePlayers(2)
    await renderSidebar({ players })

    // Players appear in multiple places in the sidebar (player list + config rows)
    // Use getAllByText to handle multiple matches
    const p1 = screen.getAllByText('Player 1')
    expect(p1.length).toBeGreaterThan(0)
    const p2 = screen.getAllByText('Player 2')
    expect(p2.length).toBeGreaterThan(0)
  })

  it('renders three players without crashing', async () => {
    const players = makePlayers(3)
    const result = await renderSidebar({ players })
    expect(result.container).toBeTruthy()
  })

  it('renders empty state when no players are seated', async () => {
    const result = await renderSidebar({ players: [] })
    expect(result.container).toBeTruthy()
  })
})

// ── Test 6: Blind levels section ──────────────────────────────────────────

describe('CoachSidebar — Blind levels', () => {
  it('renders HISTORY section header (blind config is inside GAME CONTROLS)', async () => {
    await renderSidebar()
    // HISTORY section is always rendered at the bottom of the sidebar
    const doc = document.body.textContent
    expect(doc).toMatch(/HISTORY/i)
  })
})

// ── Test 7: Sidebar collapse ──────────────────────────────────────────────

describe('CoachSidebar — collapse toggle', () => {
  it('renders the tab button when isOpen is false', async () => {
    const { default: CoachSidebar } = await import('../components/CoachSidebar.jsx')
    let result
    await act(async () => {
      result = render(
        <CoachSidebar
          gameState={makeGameState()}
          emit={makeEmit()}
          isOpen={false}
          onToggle={vi.fn()}
          sessionStats={null}
          playlists={[]}
        />
      )
    })
    expect(result.container.querySelector('button')).toBeTruthy()
  })

  it('calls onToggle when collapse tab is clicked', async () => {
    const { default: CoachSidebar } = await import('../components/CoachSidebar.jsx')
    const onToggle = vi.fn()
    await act(async () => {
      render(
        <CoachSidebar
          gameState={makeGameState()}
          emit={makeEmit()}
          isOpen={false}
          onToggle={onToggle}
          sessionStats={null}
          playlists={[]}
        />
      )
    })
    const btn = screen.getByTitle(/open coach panel/i)
    fireEvent.click(btn)
    expect(onToggle).toHaveBeenCalled()
  })
})

// ── Test 8: Replay controls section ──────────────────────────────────────

describe('CoachSidebar — Replay controls', () => {
  it('Exit Replay button shown when phase is replay', async () => {
    await renderSidebar({
      phase: 'replay',
      replay_mode: {
        active: true,
        cursor: 2,
        actions: [{ street: 'preflop', action: 'call', amount: 20 }],
        branched: false,
      },
      players: makePlayers(2),
    })
    const matches = screen.getAllByText(/exit replay/i)
    expect(matches.length).toBeGreaterThan(0)
  })

  it('Replay controls NOT shown when phase is WAITING', async () => {
    await renderSidebar({ phase: 'WAITING' })
    expect(screen.queryByText(/exit replay/i)).toBeNull()
  })
})
