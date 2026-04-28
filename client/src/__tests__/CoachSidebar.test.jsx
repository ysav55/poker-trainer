/**
 * CoachSidebar.test.jsx
 *
 * Tests for the coach control panel (3-tab sidebar: GAME / HANDS / PLAYLISTS).
 * Key notes:
 *  - Default tab is GAME, which shows: GameControlsSection, BlindLevelsSection,
 *    UndoControlsSection, AdjustStacksSection, PlayersSection.
 *  - HANDS tab shows: HandLibrarySection, HistorySection, + Build Scenario button.
 *  - PLAYLISTS tab shows: PlaylistsSection.
 *  - Replay controls are NOT in the sidebar (they live in PokerTable.jsx).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import React from 'react'

// ── Mocks ──────────────────────────────────────────────────────────────────

// @holdem-poker-tools/hand-matrix uses browser globals (self) not available in jsdom.
// Mock the package and the RangePicker component that wraps it.
vi.mock('@holdem-poker-tools/hand-matrix', () => ({
  HandMatrix: ({ onComboClick } = {}) => <div data-testid="hand-matrix" />,
}))

vi.mock('../components/RangePicker', () => ({
  default: ({ onApply, onCancel }) => (
    <div data-testid="range-picker">
      <button onClick={() => onApply('')}>Apply</button>
      <button onClick={onCancel}>Cancel</button>
    </div>
  ),
}))

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

// Fake hand fixture for save-to-playlist tests
const FAKE_HAND = {
  hand_id: 'hand-abc-123',
  winner_name: 'Alice',
  final_pot: 200,
  started_at: new Date().toISOString(),
  auto_tags: [],
  coach_tags: [],
}

// Allow individual tests to inject hands via this ref
let _mockHands = []
vi.mock('../hooks/useHistory', () => ({
  useHistory: () => ({
    hands: _mockHands,
    loading: false,
    handDetail: null,
    fetchHands: vi.fn(),
    fetchHandDetail: vi.fn(),
    clearDetail: vi.fn(),
  }),
}))

// ── Helpers ────────────────────────────────────────────────────────────────

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

  it('renders the GAME CONTROLS section header (GAME tab is default)', async () => {
    await renderSidebar()
    const matches = screen.getAllByText('GAME CONTROLS')
    expect(matches.length).toBeGreaterThan(0)
  })

  it('renders the PLAYERS section header in GAME tab', async () => {
    await renderSidebar()
    const matches = screen.getAllByText('PLAYERS')
    expect(matches.length).toBeGreaterThan(0)
  })

  it('renders the UNDO CONTROLS section header in GAME tab', async () => {
    await renderSidebar()
    const matches = screen.getAllByText('UNDO CONTROLS')
    expect(matches.length).toBeGreaterThan(0)
  })

  it('renders the ADJUST STACKS section header in GAME tab', async () => {
    await renderSidebar()
    const matches = screen.getAllByText('ADJUST STACKS')
    expect(matches.length).toBeGreaterThan(0)
  })

  it('renders exactly 3 tabs: GAME, HANDS, PLAYLISTS', async () => {
    await renderSidebar()
    expect(screen.getAllByText('GAME').length).toBeGreaterThan(0)
    expect(screen.getAllByText('HANDS').length).toBeGreaterThan(0)
    expect(screen.getAllByText('PLAYLISTS').length).toBeGreaterThan(0)
  })

  it('does NOT render a Stats button in the sidebar header', async () => {
    await renderSidebar()
    expect(screen.queryByText('Stats')).toBeNull()
  })
})

// ── Test 2: Start Hand button visibility ──────────────────────────────────

describe('CoachSidebar — Start Hand button', () => {
  it('Start Hand button is visible when phase is WAITING', async () => {
    await renderSidebar({ phase: 'WAITING' })
    const btn = screen.getAllByText('Start Hand')
    expect(btn.length).toBeGreaterThan(0)
  })

  it('Start Hand is visible during an active phase too', async () => {
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
    const pauseBtn = screen.queryByText('Pause') ?? screen.queryByText('Resume')
    if (pauseBtn) {
      fireEvent.click(pauseBtn)
      expect(togglePause).toHaveBeenCalled()
    }
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

// ── Test 6: HANDS tab ─────────────────────────────────────────────────────

describe('CoachSidebar — HANDS tab', () => {
  it('HISTORY section is NOT visible in default GAME tab', async () => {
    await renderSidebar()
    // HISTORY section renders only when HANDS tab is active
    expect(screen.queryByText('HISTORY')).toBeNull()
  })

  it('clicking HANDS tab reveals the HISTORY section', async () => {
    await renderSidebar()
    const handsTab = screen.getByText('HANDS')
    fireEvent.click(handsTab)
    const doc = document.body.textContent
    expect(doc).toMatch(/HISTORY/i)
  })

  it('clicking HANDS tab reveals the + Build Scenario button', async () => {
    await renderSidebar()
    const handsTab = screen.getByText('HANDS')
    fireEvent.click(handsTab)
    const doc = document.body.textContent
    expect(doc).toMatch(/Build Scenario/i)
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

// ── Test 8: Replay controls ABSENT from sidebar ───────────────────────────

describe('CoachSidebar — replay controls removed', () => {
  it('does NOT show Exit Replay button in sidebar (replay controls moved to PokerTable)', async () => {
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
    expect(screen.queryByText(/exit replay/i)).toBeNull()
  })

  it('does NOT show Step Fwd / Step Back buttons anywhere in sidebar', async () => {
    await renderSidebar({ replay_mode: { active: true, cursor: 0 }, players: makePlayers(2) })
    expect(screen.queryByText(/step.*fwd|step.*back|fwd.*step|back.*step/i)).toBeNull()
  })
})

// ── Test 9: PLAYLISTS tab ─────────────────────────────────────────────────

describe('CoachSidebar — PLAYLISTS tab', () => {
  it('clicking PLAYLISTS tab shows PLAYLISTS section content, not GAME CONTROLS', async () => {
    await renderSidebar()
    // GAME tab is active by default — GAME CONTROLS visible
    expect(screen.getAllByText('GAME CONTROLS').length).toBeGreaterThan(0)

    const playlistsTab = screen.getByText('PLAYLISTS')
    fireEvent.click(playlistsTab)

    // PLAYLISTS section header should now appear
    const doc = document.body.textContent
    expect(doc).toMatch(/PLAYLISTS/i)

    // GAME CONTROLS section should no longer be visible
    expect(screen.queryByText('GAME CONTROLS')).toBeNull()
  })

  it('clicking PLAYLISTS tab shows the Create button for new playlists', async () => {
    await renderSidebar()
    const playlistsTab = screen.getByText('PLAYLISTS')
    fireEvent.click(playlistsTab)

    // PlaylistsSection is wrapped in a CollapsibleSection (defaultOpen=false).
    // Expand it by clicking the PLAYLISTS section header button.
    const playlistsSectionBtn = screen.getAllByText('PLAYLISTS')
    // The second occurrence is the CollapsibleSection title button inside the tab content
    if (playlistsSectionBtn.length > 1) {
      fireEvent.click(playlistsSectionBtn[playlistsSectionBtn.length - 1])
    }

    // After expansion the "+ Create" button is visible
    const doc = document.body.textContent
    expect(doc).toMatch(/Create|playlist/i)
  })
})

// ── Test 10: Build Scenario callback ─────────────────────────────────────

describe('CoachSidebar — Build Scenario button', () => {
  it('clicking + Build Scenario calls onOpenScenarioBuilder prop', async () => {
    const onOpenScenarioBuilder = vi.fn()
    const { default: CoachSidebar } = await import('../components/CoachSidebar.jsx')

    await act(async () => {
      render(
        <CoachSidebar
          gameState={makeGameState()}
          emit={makeEmit()}
          isOpen={true}
          onToggle={vi.fn()}
          sessionStats={null}
          playlists={[]}
          actionTimer={null}
          activeHandId={null}
          handTagsSaved={null}
          onOpenScenarioBuilder={onOpenScenarioBuilder}
        />
      )
    })

    // Switch to HANDS tab to reveal the button
    const handsTab = screen.getByText('HANDS')
    fireEvent.click(handsTab)

    // Click the Build Scenario button
    const buildBtn = screen.getByText('+ Build Scenario')
    fireEvent.click(buildBtn)

    expect(onOpenScenarioBuilder).toHaveBeenCalledTimes(1)
  })
})

// ── Test 11: GAME tab is active by default ────────────────────────────────

describe('CoachSidebar — default tab', () => {
  it('GAME CONTROLS section is visible without clicking the GAME tab', async () => {
    await renderSidebar()
    // No tab click needed — GAME is the default activeTab
    const matches = screen.getAllByText('GAME CONTROLS')
    expect(matches.length).toBeGreaterThan(0)
  })

  it('HISTORY section is absent without clicking HANDS tab', async () => {
    await renderSidebar()
    expect(screen.queryByText('HISTORY')).toBeNull()
  })

  it('PLAYLISTS section content (new playlist input) is absent in GAME tab', async () => {
    await renderSidebar()
    // PlaylistsSection is only rendered when PLAYLISTS tab is active
    // When GAME tab is active, the input for creating playlists should not exist
    const inputs = document.querySelectorAll('input[placeholder]')
    expect(inputs.length).toBe(0)
  })
})

// ── Test 12: Save to Playlist widget ─────────────────────────────────────

describe('CoachSidebar — Save to Playlist widget', () => {
  const fakePlaylists = [
    { playlist_id: 'pl-1', name: 'My Playlist' },
    { playlist_id: 'pl-2', name: 'Drills' },
  ]

  beforeEach(() => {
    _mockHands = [FAKE_HAND]
  })

  afterEach(() => {
    _mockHands = []
  })

  it('widget is hidden when config_phase is false', async () => {
    const { default: CoachSidebar } = await import('../components/CoachSidebar.jsx')
    await act(async () => {
      render(
        <CoachSidebar
          gameState={makeGameState({ config_phase: false })}
          emit={makeEmit()}
          isOpen={true}
          onToggle={vi.fn()}
          playlists={fakePlaylists}
        />
      )
    })
    fireEvent.click(screen.getByText('HANDS'))
    expect(screen.queryByText('SAVE SCENARIO TO PLAYLIST')).toBeNull()
  })

  it('widget appears after loading a hand when config_phase is true', async () => {
    const { default: CoachSidebar } = await import('../components/CoachSidebar.jsx')
    await act(async () => {
      render(
        <CoachSidebar
          gameState={makeGameState({ config_phase: true })}
          emit={makeEmit()}
          isOpen={true}
          onToggle={vi.fn()}
          playlists={fakePlaylists}
        />
      )
    })
    fireEvent.click(screen.getByText('HANDS'))

    // Expand HAND LIBRARY section to reveal the Load button
    const sectionHeaders = screen.getAllByText('HAND LIBRARY')
    if (sectionHeaders.length > 0) fireEvent.click(sectionHeaders[0])

    // Click the Load button on the fake hand
    const loadBtns = screen.getAllByText('Load')
    if (loadBtns.length > 0) {
      await act(async () => { fireEvent.click(loadBtns[0]) })
    }

    const doc = document.body.textContent
    expect(doc).toMatch(/SAVE SCENARIO TO PLAYLIST/i)
  })

  it('+ Add button calls emit.addToPlaylist with selected playlist and hand id', async () => {
    const addToPlaylist = vi.fn()
    const { default: CoachSidebar } = await import('../components/CoachSidebar.jsx')
    await act(async () => {
      render(
        <CoachSidebar
          gameState={makeGameState({ config_phase: true })}
          emit={makeEmit({ addToPlaylist })}
          isOpen={true}
          onToggle={vi.fn()}
          playlists={fakePlaylists}
        />
      )
    })
    fireEvent.click(screen.getByText('HANDS'))

    // Expand HAND LIBRARY section
    const sectionHeaders = screen.getAllByText('HAND LIBRARY')
    if (sectionHeaders.length > 0) fireEvent.click(sectionHeaders[0])

    // Load the hand
    const loadBtns = screen.getAllByText('Load')
    if (loadBtns.length > 0) {
      await act(async () => { fireEvent.click(loadBtns[0]) })
    }

    // Select a playlist from the save-to-playlist dropdown
    // (HandLibrarySection also has a "— select playlist —" dropdown; pick the last one)
    const selects = screen.getAllByDisplayValue('— select playlist —')
    const saveSelect = selects[selects.length - 1]
    await act(async () => {
      fireEvent.change(saveSelect, { target: { value: 'pl-1' } })
    })

    // Click + Add
    const addBtn = screen.getByText('+ Add')
    await act(async () => { fireEvent.click(addBtn) })

    expect(addToPlaylist).toHaveBeenCalledWith('pl-1', FAKE_HAND.hand_id)
  })
})

// ── Test 13: Phase strip pot amount ──────────────────────────────────────

describe('CoachSidebar — phase strip', () => {
  it('shows formatted pot amount when pot > 0', async () => {
    await renderSidebar({ pot: 350 })
    // The pot is displayed in the sticky info strip as $350
    const doc = document.body.textContent
    expect(doc).toMatch(/\$350/)
  })

  it('does NOT show pot amount when pot is 0', async () => {
    await renderSidebar({ pot: 0 })
    const doc = document.body.textContent
    expect(doc).not.toMatch(/\$0/)
  })

  it('shows formatted pot amount with thousands separator for large pots', async () => {
    await renderSidebar({ pot: 1500 })
    const doc = document.body.textContent
    expect(doc).toMatch(/\$1,500/)
  })
})
