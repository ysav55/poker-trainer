/**
 * SidebarSections.test.jsx
 * Tests for GameControlsSection, PlaylistsSection, PlayersSection,
 * and HandLibrarySection sidebar components.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import React from 'react'

// ── Mock HandConfigPanel (only needed in GameControlsSection MANUAL mode) ───
vi.mock('../components/HandConfigPanel', () => ({
  default: () => <div data-testid="hand-config-panel">HandConfigPanel</div>,
}))

// ── Mock Card component to avoid complex rendering ───────────────────────────
vi.mock('../components/Card', () => ({
  default: ({ card, hidden }) => (
    <span data-testid="card">{hidden ? '[hidden]' : card}</span>
  ),
}))

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeEmit(overrides = {}) {
  return {
    startGame: vi.fn(),
    resetHand: vi.fn(),
    togglePause: vi.fn(),
    setMode: vi.fn(),
    openConfigPhase: vi.fn(),
    createPlaylist: vi.fn(),
    getPlaylists: vi.fn(),
    activatePlaylist: vi.fn(),
    deactivatePlaylist: vi.fn(),
    deletePlaylist: vi.fn(),
    setPlayerInHand: vi.fn(),
    loadHandScenario: vi.fn(),
    loadReplay: vi.fn(),
    addToPlaylist: vi.fn(),
    startConfiguredHand: vi.fn(),
    ...overrides,
  }
}

function makePlayer(overrides = {}) {
  return {
    id: 'p1',
    name: 'Alice',
    seat: 0,
    stack: 1000,
    is_active: true,
    is_coach: false,
    is_dealer: false,
    action: null,
    hole_cards: [],
    current_bet: 0,
    in_hand: true,
    ...overrides,
  }
}

// ── GameControlsSection ──────────────────────────────────────────────────────

describe('GameControlsSection', () => {
  async function renderSection(props = {}) {
    const { default: GameControlsSection } = await import('../components/sidebar/GameControlsSection.jsx')
    const emit = makeEmit(props.emit)
    render(
      <GameControlsSection
        gameState={null}
        emit={emit}
        is_paused={false}
        phase="WAITING"
        {...props}
        emit={emit}
      />
    )
    return { emit }
  }

  it('renders RNG MODE and MANUAL MODE toggle buttons', async () => {
    await renderSection()
    expect(screen.getByText('RNG MODE')).toBeTruthy()
    expect(screen.getByText('MANUAL MODE')).toBeTruthy()
  })

  it('shows Start Hand and Reset buttons in RNG mode (default)', async () => {
    await renderSection()
    expect(screen.getByText('Start Hand')).toBeTruthy()
    expect(screen.getByText('Reset')).toBeTruthy()
  })

  it('Start Hand click calls emit.startGame with "rng"', async () => {
    const { emit } = await renderSection()
    fireEvent.click(screen.getByText('Start Hand'))
    expect(emit.startGame).toHaveBeenCalledWith('rng')
  })

  it('Reset click calls emit.resetHand', async () => {
    const { emit } = await renderSection()
    fireEvent.click(screen.getByText('Reset'))
    expect(emit.resetHand).toHaveBeenCalled()
  })

  it('shows Pause Game button when not paused', async () => {
    await renderSection({ is_paused: false })
    expect(screen.getByText('Pause Game')).toBeTruthy()
  })

  it('shows Resume Game button when paused', async () => {
    await renderSection({ is_paused: true })
    expect(screen.getByText('Resume Game')).toBeTruthy()
  })

  it('Pause/Resume click calls emit.togglePause', async () => {
    const { emit } = await renderSection({ is_paused: false })
    fireEvent.click(screen.getByText('Pause Game'))
    expect(emit.togglePause).toHaveBeenCalled()
  })

  it('switching to MANUAL MODE calls emit.setMode("manual")', async () => {
    const { emit } = await renderSection({ phase: 'WAITING' })
    fireEvent.click(screen.getByText('MANUAL MODE'))
    expect(emit.setMode).toHaveBeenCalledWith('manual')
  })

  it('MANUAL MODE renders HandConfigPanel', async () => {
    await renderSection()
    fireEvent.click(screen.getByText('MANUAL MODE'))
    expect(screen.getByTestId('hand-config-panel')).toBeTruthy()
  })

  it('switching back to RNG MODE hides HandConfigPanel', async () => {
    await renderSection()
    fireEvent.click(screen.getByText('MANUAL MODE'))
    expect(screen.getByTestId('hand-config-panel')).toBeTruthy()
    fireEvent.click(screen.getByText('RNG MODE'))
    expect(screen.queryByTestId('hand-config-panel')).toBeNull()
    expect(screen.getByText('Start Hand')).toBeTruthy()
  })

  it('switching to MANUAL MODE in WAITING phase also calls emit.openConfigPhase', async () => {
    const { emit } = await renderSection({ phase: 'WAITING' })
    fireEvent.click(screen.getByText('MANUAL MODE'))
    expect(emit.openConfigPhase).toHaveBeenCalled()
  })

  it('section title is "GAME CONTROLS"', async () => {
    await renderSection()
    expect(screen.getByText('GAME CONTROLS')).toBeTruthy()
  })
})

// ── PlaylistsSection ─────────────────────────────────────────────────────────

describe('PlaylistsSection', () => {
  async function renderSection(props = {}) {
    const { default: PlaylistsSection } = await import('../components/sidebar/PlaylistsSection.jsx')
    const emit = makeEmit(props.emitOverrides)
    render(
      <PlaylistsSection
        playlists={[]}
        gameState={null}
        myId="p1"
        emit={emit}
        {...props}
        emit={emit}
      />
    )
    return { emit }
  }

  it('renders section title "PLAYLISTS"', async () => {
    await renderSection()
    expect(screen.getByText('PLAYLISTS')).toBeTruthy()
  })

  it('shows "No playlists yet" when playlists is empty', async () => {
    // CollapsibleSection defaults to closed for PLAYLISTS (defaultOpen=false)
    // Need to open it first by clicking the title
    const { default: PlaylistsSection } = await import('../components/sidebar/PlaylistsSection.jsx')
    const emit = makeEmit()
    render(
      <PlaylistsSection playlists={[]} gameState={null} myId="p1" emit={emit} />
    )
    // Open section
    fireEvent.click(screen.getByText('PLAYLISTS'))
    expect(screen.getByText('No playlists yet')).toBeTruthy()
  })

  it('shows playlist names when playlists are provided', async () => {
    const { default: PlaylistsSection } = await import('../components/sidebar/PlaylistsSection.jsx')
    const emit = makeEmit()
    const playlists = [
      { playlist_id: 'pl1', name: 'Beginner Hands', hand_count: 5 },
      { playlist_id: 'pl2', name: 'Bluff Spots', hand_count: 3 },
    ]
    render(
      <PlaylistsSection playlists={playlists} gameState={null} myId="p1" emit={emit} />
    )
    fireEvent.click(screen.getByText('PLAYLISTS'))
    expect(screen.getByText('Beginner Hands')).toBeTruthy()
    expect(screen.getByText('Bluff Spots')).toBeTruthy()
  })

  it('Play button calls emit.activatePlaylist with playlist id', async () => {
    const { default: PlaylistsSection } = await import('../components/sidebar/PlaylistsSection.jsx')
    const emit = makeEmit()
    const playlists = [{ playlist_id: 'pl1', name: 'Test Playlist', hand_count: 2 }]
    // gameState must be non-null so the component can safely read gameState.playlist_mode
    // after activePlaylistId is set (line 118 of PlaylistsSection.jsx)
    render(
      <PlaylistsSection
        playlists={playlists}
        gameState={{ playlist_mode: null, config_phase: false }}
        myId="p1"
        emit={emit}
      />
    )
    fireEvent.click(screen.getByText('PLAYLISTS'))
    fireEvent.click(screen.getByText('Play'))
    expect(emit.activatePlaylist).toHaveBeenCalledWith('pl1')
  })

  it('Delete button calls emit.deletePlaylist with playlist id', async () => {
    const { default: PlaylistsSection } = await import('../components/sidebar/PlaylistsSection.jsx')
    const emit = makeEmit()
    const playlists = [{ playlist_id: 'pl1', name: 'Test Playlist', hand_count: 2 }]
    render(
      <PlaylistsSection playlists={playlists} gameState={null} myId="p1" emit={emit} />
    )
    fireEvent.click(screen.getByText('PLAYLISTS'))
    fireEvent.click(screen.getByText('✕'))
    expect(emit.deletePlaylist).toHaveBeenCalledWith('pl1')
  })

  it('create playlist input and button are rendered', async () => {
    const { default: PlaylistsSection } = await import('../components/sidebar/PlaylistsSection.jsx')
    const emit = makeEmit()
    render(
      <PlaylistsSection playlists={[]} gameState={null} myId="p1" emit={emit} />
    )
    fireEvent.click(screen.getByText('PLAYLISTS'))
    expect(screen.getByPlaceholderText('New playlist name...')).toBeTruthy()
    expect(screen.getByText('+ Create')).toBeTruthy()
  })

  it('typing a name and clicking Create calls emit.createPlaylist', async () => {
    const { default: PlaylistsSection } = await import('../components/sidebar/PlaylistsSection.jsx')
    const emit = makeEmit()
    render(
      <PlaylistsSection playlists={[]} gameState={null} myId="p1" emit={emit} />
    )
    fireEvent.click(screen.getByText('PLAYLISTS'))
    const input = screen.getByPlaceholderText('New playlist name...')
    fireEvent.change(input, { target: { value: 'My New Playlist' } })
    fireEvent.click(screen.getByText('+ Create'))
    expect(emit.createPlaylist).toHaveBeenCalledWith('My New Playlist')
  })

  it('pressing Enter in the name input creates the playlist', async () => {
    const { default: PlaylistsSection } = await import('../components/sidebar/PlaylistsSection.jsx')
    const emit = makeEmit()
    render(
      <PlaylistsSection playlists={[]} gameState={null} myId="p1" emit={emit} />
    )
    fireEvent.click(screen.getByText('PLAYLISTS'))
    const input = screen.getByPlaceholderText('New playlist name...')
    fireEvent.change(input, { target: { value: 'Enter Playlist' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(emit.createPlaylist).toHaveBeenCalledWith('Enter Playlist')
  })

  it('Create button is disabled when input is empty', async () => {
    const { default: PlaylistsSection } = await import('../components/sidebar/PlaylistsSection.jsx')
    const emit = makeEmit()
    render(
      <PlaylistsSection playlists={[]} gameState={null} myId="p1" emit={emit} />
    )
    fireEvent.click(screen.getByText('PLAYLISTS'))
    expect(screen.getByText('+ Create')).toBeDisabled()
  })

  it('Stop button shows and calls deactivatePlaylist for active playlist', async () => {
    const { default: PlaylistsSection } = await import('../components/sidebar/PlaylistsSection.jsx')
    const emit = makeEmit()
    const playlists = [{ playlist_id: 'pl1', name: 'Active Playlist', hand_count: 3 }]
    // gameState must be non-null — component reads gameState.playlist_mode after activate
    render(
      <PlaylistsSection
        playlists={playlists}
        gameState={{ playlist_mode: null, config_phase: false }}
        myId="p1"
        emit={emit}
      />
    )
    fireEvent.click(screen.getByText('PLAYLISTS'))
    // Activate first
    fireEvent.click(screen.getByText('Play'))
    // Now Stop should be shown
    fireEvent.click(screen.getByText('Stop'))
    expect(emit.deactivatePlaylist).toHaveBeenCalled()
  })
})

// ── PlayersSection ───────────────────────────────────────────────────────────

describe('PlayersSection', () => {
  async function renderSection(seatedPlayers = [], phase = 'PREFLOP', emit = makeEmit()) {
    const { default: PlayersSection } = await import('../components/sidebar/PlayersSection.jsx')
    render(<PlayersSection seatedPlayers={seatedPlayers} phase={phase} emit={emit} />)
    return { emit }
  }

  it('renders section title "PLAYERS"', async () => {
    await renderSection()
    expect(screen.getByText('PLAYERS')).toBeTruthy()
  })

  it('shows "No players seated" when list is empty', async () => {
    await renderSection([])
    expect(screen.getByText('No players seated')).toBeTruthy()
  })

  it('renders player names', async () => {
    const players = [
      makePlayer({ id: 'p1', name: 'Alice', seat: 0 }),
      makePlayer({ id: 'p2', name: 'Bob', seat: 1 }),
    ]
    await renderSection(players)
    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.getByText('Bob')).toBeTruthy()
  })

  it('renders player stack amounts', async () => {
    const players = [makePlayer({ id: 'p1', name: 'Alice', stack: 1500 })]
    await renderSection(players)
    expect(screen.getByText('$1,500')).toBeTruthy()
  })

  it('renders dealer badge for dealer player', async () => {
    const players = [makePlayer({ id: 'p1', name: 'Alice', is_dealer: true })]
    await renderSection(players)
    expect(screen.getByTitle('Dealer')).toBeTruthy()
  })

  it('shows include/exclude toggle buttons in WAITING phase', async () => {
    const players = [makePlayer({ id: 'p1', name: 'Alice' })]
    await renderSection(players, 'WAITING')
    // The toggle button has a title
    const btn = screen.getByTitle('Click to exclude from next hand')
    expect(btn).toBeTruthy()
  })

  it('does NOT show include/exclude toggle in non-WAITING phase', async () => {
    const players = [makePlayer({ id: 'p1', name: 'Alice' })]
    await renderSection(players, 'PREFLOP')
    expect(screen.queryByTitle('Click to exclude from next hand')).toBeNull()
    expect(screen.queryByTitle('Click to include in next hand')).toBeNull()
  })

  it('clicking in_hand toggle calls emit.setPlayerInHand', async () => {
    const emit = makeEmit()
    const players = [makePlayer({ id: 'p1', name: 'Alice', in_hand: true })]
    const { default: PlayersSection } = await import('../components/sidebar/PlayersSection.jsx')
    render(<PlayersSection seatedPlayers={players} phase="WAITING" emit={emit} />)
    fireEvent.click(screen.getByTitle('Click to exclude from next hand'))
    expect(emit.setPlayerInHand).toHaveBeenCalledWith('p1', false)
  })

  it('shows FOLD action badge for folded player', async () => {
    const players = [makePlayer({ id: 'p1', name: 'Alice', action: 'fold' })]
    await renderSection(players)
    expect(screen.getByText('FOLD')).toBeTruthy()
  })

  it('shows RAISE action badge for raising player', async () => {
    const players = [makePlayer({ id: 'p1', name: 'Alice', action: 'raise' })]
    await renderSection(players)
    expect(screen.getByText('RAISE')).toBeTruthy()
  })

  it('shows current bet amount next to stack when player has bet', async () => {
    const players = [makePlayer({ id: 'p1', name: 'Alice', stack: 980, current_bet: 20 })]
    await renderSection(players)
    expect(screen.getByText('+$20')).toBeTruthy()
  })

  it('shows hidden cards as [hidden] for HIDDEN hole cards', async () => {
    const players = [makePlayer({ id: 'p1', name: 'Alice', hole_cards: ['HIDDEN', 'HIDDEN'] })]
    await renderSection(players)
    const cards = screen.getAllByTestId('card')
    expect(cards.length).toBe(2)
    expect(cards[0].textContent).toBe('[hidden]')
  })

  it('shows face-up cards for known hole cards', async () => {
    const players = [makePlayer({ id: 'p1', name: 'Alice', hole_cards: ['Ah', 'Kd'] })]
    await renderSection(players)
    expect(screen.getByText('Ah')).toBeTruthy()
    expect(screen.getByText('Kd')).toBeTruthy()
  })
})

// ── HandLibrarySection ───────────────────────────────────────────────────────

describe('HandLibrarySection', () => {
  async function renderSection(props = {}) {
    const { default: HandLibrarySection } = await import('../components/sidebar/HandLibrarySection.jsx')
    const emit = makeEmit(props.emitOverrides)
    render(
      <HandLibrarySection
        hands={[]}
        playlists={[]}
        emit={emit}
        {...props}
        emit={emit}
      />
    )
    return { emit }
  }

  function makeHand(overrides = {}) {
    return {
      hand_id: 'hand-1',
      winner_name: 'Alice',
      final_pot: 200,
      started_at: '2026-01-01T00:00:00Z',
      phase_ended: 'river',
      auto_tags: ['C_BET'],
      coach_tags: [],
      ...overrides,
    }
  }

  it('renders section title "HAND LIBRARY"', async () => {
    await renderSection()
    expect(screen.getByText('HAND LIBRARY')).toBeTruthy()
  })

  it('shows "No completed hands yet" when hands list is empty', async () => {
    const { default: HandLibrarySection } = await import('../components/sidebar/HandLibrarySection.jsx')
    const emit = makeEmit()
    render(<HandLibrarySection hands={[]} playlists={[]} emit={emit} />)
    // HAND LIBRARY opens by default (defaultOpen=false) — need to open
    fireEvent.click(screen.getByText('HAND LIBRARY'))
    expect(screen.getByText('No completed hands yet')).toBeTruthy()
  })

  it('renders hand entries with winner name and pot', async () => {
    const { default: HandLibrarySection } = await import('../components/sidebar/HandLibrarySection.jsx')
    const emit = makeEmit()
    const hands = [makeHand({ winner_name: 'Alice', final_pot: 350 })]
    render(<HandLibrarySection hands={hands} playlists={[]} emit={emit} />)
    fireEvent.click(screen.getByText('HAND LIBRARY'))
    expect(screen.getByText(/Alice — \$350/)).toBeTruthy()
  })

  it('renders auto_tags as tag pills', async () => {
    const { default: HandLibrarySection } = await import('../components/sidebar/HandLibrarySection.jsx')
    const emit = makeEmit()
    const hands = [makeHand({ auto_tags: ['C_BET', 'CHECK_RAISE'] })]
    render(<HandLibrarySection hands={hands} playlists={[]} emit={emit} />)
    fireEvent.click(screen.getByText('HAND LIBRARY'))
    expect(screen.getByText('C_BET')).toBeTruthy()
    expect(screen.getByText('CHECK_RAISE')).toBeTruthy()
  })

  it('Load button calls emit.loadHandScenario with hand_id and stack mode', async () => {
    const { default: HandLibrarySection } = await import('../components/sidebar/HandLibrarySection.jsx')
    const emit = makeEmit()
    const hands = [makeHand({ hand_id: 'hand-42' })]
    render(<HandLibrarySection hands={hands} playlists={[]} emit={emit} />)
    fireEvent.click(screen.getByText('HAND LIBRARY'))
    fireEvent.click(screen.getByText('Load'))
    expect(emit.loadHandScenario).toHaveBeenCalledWith('hand-42', 'keep')
  })

  it('Replay button calls emit.loadReplay with hand_id', async () => {
    const { default: HandLibrarySection } = await import('../components/sidebar/HandLibrarySection.jsx')
    const emit = makeEmit()
    const hands = [makeHand({ hand_id: 'hand-99' })]
    render(<HandLibrarySection hands={hands} playlists={[]} emit={emit} />)
    fireEvent.click(screen.getByText('HAND LIBRARY'))
    fireEvent.click(screen.getByText('Replay'))
    expect(emit.loadReplay).toHaveBeenCalledWith('hand-99')
  })

  it('switching to "Hist. Stacks" changes loadHandScenario stack mode', async () => {
    const { default: HandLibrarySection } = await import('../components/sidebar/HandLibrarySection.jsx')
    const emit = makeEmit()
    const hands = [makeHand({ hand_id: 'hand-7' })]
    render(<HandLibrarySection hands={hands} playlists={[]} emit={emit} />)
    fireEvent.click(screen.getByText('HAND LIBRARY'))
    fireEvent.click(screen.getByText('Hist. Stacks'))
    fireEvent.click(screen.getByText('Load'))
    expect(emit.loadHandScenario).toHaveBeenCalledWith('hand-7', 'historical')
  })

  it('search filter hides non-matching hands', async () => {
    const { default: HandLibrarySection } = await import('../components/sidebar/HandLibrarySection.jsx')
    const emit = makeEmit()
    const hands = [
      makeHand({ hand_id: 'h1', winner_name: 'Alice', auto_tags: [] }),
      makeHand({ hand_id: 'h2', winner_name: 'Bob', auto_tags: [] }),
    ]
    render(<HandLibrarySection hands={hands} playlists={[]} emit={emit} />)
    fireEvent.click(screen.getByText('HAND LIBRARY'))
    fireEvent.change(screen.getByPlaceholderText('Search hands...'), { target: { value: 'Bob' } })
    expect(screen.queryByText(/Alice/)).toBeNull()
    expect(screen.getByText(/Bob/)).toBeTruthy()
  })

  it('shows "Add to:" selector when playlists are present', async () => {
    const { default: HandLibrarySection } = await import('../components/sidebar/HandLibrarySection.jsx')
    const emit = makeEmit()
    const playlists = [{ playlist_id: 'pl1', name: 'My Playlist' }]
    render(<HandLibrarySection hands={[]} playlists={playlists} emit={emit} />)
    fireEvent.click(screen.getByText('HAND LIBRARY'))
    expect(screen.getByText('Add to:')).toBeTruthy()
    expect(screen.getByText('My Playlist')).toBeTruthy()
  })

  it('Keep Stacks / Hist. Stacks toggle buttons are rendered', async () => {
    const { default: HandLibrarySection } = await import('../components/sidebar/HandLibrarySection.jsx')
    const emit = makeEmit()
    render(<HandLibrarySection hands={[]} playlists={[]} emit={emit} />)
    fireEvent.click(screen.getByText('HAND LIBRARY'))
    expect(screen.getByText('Keep Stacks')).toBeTruthy()
    expect(screen.getByText('Hist. Stacks')).toBeTruthy()
  })
})
