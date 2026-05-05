/**
 * TableTile.test.jsx
 *
 * Tests for the TableTile component used in the multi-table grid.
 *
 * TableTile has two rendering modes:
 *   focused=false  — compact tile: shows TableStatusChip, clickable
 *   focused=true   — full tile: shows PokerTable + optional CoachSidebar
 *
 * Dependencies mocked:
 *   - TableContext (useTable)     — game state, socket, tableId
 *   - AuthContext  (useAuth)      — user.role
 *   - usePreferences              — bbView
 *   - PokerTable, CoachSidebar   — heavy components avoided in unit tests
 *   - TableStatusChip            — mocked to a simple sentinel
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../contexts/TableContext', () => ({
  useTable: vi.fn(),
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('../hooks/usePreferences', () => ({
  usePreferences: vi.fn(() => ({ bbView: false })),
}))

vi.mock('../components/PokerTable', () => ({
  default: () => <div data-testid="poker-table">PokerTable</div>,
}))

vi.mock('../components/CoachSidebar', () => ({
  default: () => <div data-testid="coach-sidebar">CoachSidebar</div>,
}))

// TableStatusChip is the key output of the unfocused tile — use a transparent mock
// that exposes its props via data-testid so we can assert they were passed.
vi.mock('../components/TableStatusChip', () => ({
  default: ({ gameState, tableId, tableName }) => (
    <div
      data-testid="table-status-chip"
      data-phase={gameState?.phase ?? 'waiting'}
      data-tableid={tableId}
      data-tablename={tableName}
    >
      StatusChip
    </div>
  ),
}))

import { useTable } from '../contexts/TableContext'
import { useAuth } from '../contexts/AuthContext'
import { usePreferences } from '../hooks/usePreferences'
import TableTile from '../components/TableTile.jsx'

// ── Default mock values ───────────────────────────────────────────────────────

function makeSocket(overrides = {}) {
  return {
    emit: vi.fn(),
    socketRef: { current: null },
    ...overrides,
  }
}

function makeGameState(overrides = {}) {
  return {
    phase: 'waiting',
    players: [],
    pot: 0,
    table_name: 'Table 1',
    table_mode: 'coached_cash',
    myId: 'player-1',
    ...overrides,
  }
}

function setupMocks({ gameState = makeGameState(), role = 'player', focused = false } = {}) {
  // Component destructures useTable().gameState as "hookState", then reads hookState.gameState
  // for the raw server state. Nest accordingly.
  useTable.mockReturnValue({
    gameState: {
      gameState,
      actionTimer: gameState?.actionTimer ?? null,
      myId: 'player-1',
      tableMode: gameState?.table_mode ?? 'coached_cash',
    },
    tableId: 'tbl-1',
    socket: makeSocket(),
    playlist: { playlists: [] },
    replay: {},
  })
  useAuth.mockReturnValue({ user: { id: 'player-1', name: 'Alice', role } })
  usePreferences.mockReturnValue({ bbView: false })
}

beforeEach(() => {
  vi.clearAllMocks()
  setupMocks()
})

// ── Unfocused tile ────────────────────────────────────────────────────────────

describe('TableTile — unfocused tile', () => {
  it('renders without crashing', () => {
    expect(() => render(<MemoryRouter><TableTile focused={false} onFocus={vi.fn()} /></MemoryRouter>)).not.toThrow()
  })

  it('renders TableStatusChip in unfocused mode', () => {
    render(<MemoryRouter><TableTile focused={false} onFocus={vi.fn()} /></MemoryRouter>)
    expect(screen.getByTestId('table-status-chip')).toBeTruthy()
  })

  it('passes tableId to TableStatusChip', () => {
    render(<MemoryRouter><TableTile focused={false} onFocus={vi.fn()} /></MemoryRouter>)
    const chip = screen.getByTestId('table-status-chip')
    expect(chip.getAttribute('data-tableid')).toBe('tbl-1')
  })

  it('passes tableName from gameState to TableStatusChip', () => {
    setupMocks({ gameState: makeGameState({ table_name: 'VIP Table' }) })
    render(<MemoryRouter><TableTile focused={false} onFocus={vi.fn()} /></MemoryRouter>)
    const chip = screen.getByTestId('table-status-chip')
    expect(chip.getAttribute('data-tablename')).toBe('VIP Table')
  })

  it('passes gameState phase to TableStatusChip', () => {
    setupMocks({ gameState: makeGameState({ phase: 'flop' }) })
    render(<MemoryRouter><TableTile focused={false} onFocus={vi.fn()} /></MemoryRouter>)
    expect(screen.getByTestId('table-status-chip').getAttribute('data-phase')).toBe('flop')
  })

  it('does NOT render PokerTable in unfocused mode', () => {
    render(<MemoryRouter><TableTile focused={false} onFocus={vi.fn()} /></MemoryRouter>)
    expect(screen.queryByTestId('poker-table')).toBeNull()
  })

  it('does NOT render CoachSidebar in unfocused mode', () => {
    render(<MemoryRouter><TableTile focused={false} onFocus={vi.fn()} /></MemoryRouter>)
    expect(screen.queryByTestId('coach-sidebar')).toBeNull()
  })

  it('calls onFocus when the unfocused tile is clicked', () => {
    const onFocus = vi.fn()
    render(<MemoryRouter><TableTile focused={false} onFocus={onFocus} /></MemoryRouter>)
    // The outer tile div is clickable
    const chip = screen.getByTestId('table-status-chip')
    fireEvent.click(chip)
    expect(onFocus).toHaveBeenCalled()
  })

  it('applies pulse-gold class when action timer is urgent (< 15 s)', () => {
    const urgentTimer = { remainingMs: 10000 }
    setupMocks({ gameState: makeGameState({ actionTimer: urgentTimer }) })
    const { container } = render(<MemoryRouter><TableTile focused={false} onFocus={vi.fn()} /></MemoryRouter>)
    const tile = container.firstChild
    expect(tile.className).toContain('pulse-gold')
  })

  it('does NOT apply pulse-gold class when action timer is not urgent', () => {
    const safeTimer = { remainingMs: 30000 }
    setupMocks({ gameState: makeGameState({ actionTimer: safeTimer }) })
    const { container } = render(<MemoryRouter><TableTile focused={false} onFocus={vi.fn()} /></MemoryRouter>)
    const tile = container.firstChild
    expect(tile.className).not.toContain('pulse-gold')
  })
})

// ── Focused tile ──────────────────────────────────────────────────────────────

describe('TableTile — focused tile', () => {
  it('renders PokerTable in focused mode', () => {
    render(<MemoryRouter><TableTile focused={true} onFocus={vi.fn()} /></MemoryRouter>)
    expect(screen.getByTestId('poker-table')).toBeTruthy()
  })

  it('does NOT render TableStatusChip in focused mode', () => {
    render(<MemoryRouter><TableTile focused={true} onFocus={vi.fn()} /></MemoryRouter>)
    expect(screen.queryByTestId('table-status-chip')).toBeNull()
  })

  it('renders CoachSidebar for coach role in coached_cash mode', () => {
    setupMocks({
      gameState: makeGameState({ table_mode: 'coached_cash' }),
      role: 'coach',
    })
    render(<MemoryRouter><TableTile focused={true} onFocus={vi.fn()} /></MemoryRouter>)
    expect(screen.getByTestId('coach-sidebar')).toBeTruthy()
  })

  it('does NOT render CoachSidebar for player role', () => {
    setupMocks({
      gameState: makeGameState({ table_mode: 'coached_cash' }),
      role: 'player',
    })
    render(<MemoryRouter><TableTile focused={true} onFocus={vi.fn()} /></MemoryRouter>)
    expect(screen.queryByTestId('coach-sidebar')).toBeNull()
  })

  it('does NOT render CoachSidebar for coach in tournament mode', () => {
    setupMocks({
      gameState: makeGameState({ table_mode: 'tournament' }),
      role: 'coach',
    })
    render(<MemoryRouter><TableTile focused={true} onFocus={vi.fn()} /></MemoryRouter>)
    expect(screen.queryByTestId('coach-sidebar')).toBeNull()
  })
})

// ── Null / missing gameState ───────────────────────────────────────────────────

describe('TableTile — null gameState', () => {
  it('renders without crashing when gameState is null', () => {
    useTable.mockReturnValue({
      gameState: null,
      tableId: 'tbl-1',
      socket: makeSocket(),
      playlist: { playlists: [] },
      replay: {},
    })
    expect(() => render(<MemoryRouter><TableTile focused={false} onFocus={vi.fn()} /></MemoryRouter>)).not.toThrow()
  })

  it('renders TableStatusChip even when gameState is null', () => {
    useTable.mockReturnValue({
      gameState: null,
      tableId: 'tbl-1',
      socket: makeSocket(),
      playlist: { playlists: [] },
      replay: {},
    })
    render(<MemoryRouter><TableTile focused={false} onFocus={vi.fn()} /></MemoryRouter>)
    expect(screen.getByTestId('table-status-chip')).toBeTruthy()
  })
})
