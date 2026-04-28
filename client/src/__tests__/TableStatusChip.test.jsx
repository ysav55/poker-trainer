/**
 * TableStatusChip.test.jsx
 *
 * Tests for the TableStatusChip component.
 *
 * Component renders:
 *   - Table name + phase badge (PhaseBadge)
 *   - Player count + street subtitle
 *   - Pot (when > 0)
 *   - Acting player name (when currentPlayer is found)
 *
 * Phase colour map tested:
 *   waiting  → #6e7681
 *   preflop  → #58a6ff
 *   flop     → #3fb950
 *   turn     → #e3b341
 *   river    → #f85149
 *   showdown → #bc8cff
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import TableStatusChip from '../components/TableStatusChip.jsx'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeGameState(overrides = {}) {
  return {
    phase: 'waiting',
    players: [],
    pot: 0,
    current_player: null,
    ...overrides,
  }
}

function renderChip(gameState = null, tableId = 'tbl-1', tableName = 'Test Table') {
  return render(
    <TableStatusChip gameState={gameState} tableId={tableId} tableName={tableName} />
  )
}

// ── Table name ────────────────────────────────────────────────────────────────

describe('TableStatusChip — table name', () => {
  it('renders the tableName prop', () => {
    renderChip(makeGameState(), 'tbl-1', 'Main Table')
    expect(screen.getByText('Main Table')).toBeTruthy()
  })

  it('falls back to tableId when tableName is null', () => {
    render(<TableStatusChip gameState={makeGameState()} tableId="tbl-99" tableName={null} />)
    expect(screen.getByText('tbl-99')).toBeTruthy()
  })

  it('falls back to "Table" when both tableName and tableId are null', () => {
    render(<TableStatusChip gameState={makeGameState()} tableId={null} tableName={null} />)
    expect(screen.getByText('Table')).toBeTruthy()
  })
})

// ── Phase badge ───────────────────────────────────────────────────────────────

describe('TableStatusChip — phase badge labels', () => {
  const phases = ['waiting', 'preflop', 'flop', 'turn', 'river', 'showdown']

  phases.forEach((phase) => {
    it(`renders "${phase.toUpperCase()}" badge for phase="${phase}"`, () => {
      renderChip(makeGameState({ phase }))
      // PhaseBadge renders phase.toUpperCase() — there will be one in the badge
      const badges = screen.getAllByText(phase.toUpperCase())
      expect(badges.length).toBeGreaterThan(0)
    })
  })
})

// ── Phase badge colours ────────────────────────────────────────────────────────
//
// jsdom normalises inline hex colours to rgb() format (e.g. "#6e7681" →
// "rgb(110, 118, 129)").  We locate the PhaseBadge <span> by its rendered
// text (the uppercase phase name) and assert the rgb() value that jsdom
// produces for each colour in the PHASE_COLORS map.
//
// The PHASE_COLORS map in TableStatusChip.jsx:
//   waiting  → #6e7681   preflop  → #58a6ff   flop     → #3fb950
//   turn     → #e3b341   river    → #f85149   showdown → #bc8cff

function getBadgeSpan(container, phaseUpper) {
  const spans = Array.from(container.querySelectorAll('span'))
  return spans.find((s) => s.textContent.trim() === phaseUpper) ?? null
}

describe('TableStatusChip — phase badge colours', () => {
  // jsdom converts hex → rgb; map each phase to its expected rgb() string
  const PHASE_RGB_MAP = {
    waiting:  'rgb(110, 118, 129)',   // #6e7681
    preflop:  'rgb(88, 166, 255)',    // #58a6ff
    flop:     'rgb(63, 185, 80)',     // #3fb950
    turn:     'rgb(227, 179, 65)',    // #e3b341
    river:    'rgb(248, 81, 73)',     // #f85149
    showdown: 'rgb(188, 140, 255)',   // #bc8cff
  }

  Object.entries(PHASE_RGB_MAP).forEach(([phase, expectedRgb]) => {
    it(`${phase} badge renders with the correct colour (${expectedRgb})`, () => {
      const { container } = renderChip(makeGameState({ phase }))
      const badge = getBadgeSpan(container, phase.toUpperCase())
      expect(badge).not.toBeNull()
      expect(badge.style.color).toBe(expectedRgb)
    })
  })
})

// ── Player count subtitle ─────────────────────────────────────────────────────

describe('TableStatusChip — player count', () => {
  it('shows "0 players" when no players are seated', () => {
    renderChip(makeGameState({ players: [] }))
    expect(screen.getByText('0 players')).toBeTruthy()
  })

  it('shows "1 player" (singular) when one player is seated', () => {
    const players = [{ id: 'p1', name: 'Alice', seat: 0 }]
    renderChip(makeGameState({ players }))
    expect(screen.getByText('1 player')).toBeTruthy()
  })

  it('shows "3 players" (plural) for three seated players', () => {
    const players = [
      { id: 'p1', name: 'Alice', seat: 0 },
      { id: 'p2', name: 'Bob',   seat: 1 },
      { id: 'p3', name: 'Carol', seat: 2 },
    ]
    renderChip(makeGameState({ players }))
    expect(screen.getByText('3 players')).toBeTruthy()
  })

  it('only counts players with a defined seat (not null/undefined)', () => {
    const players = [
      { id: 'p1', name: 'Alice', seat: 0 },
      { id: 'p2', name: 'Bob',   seat: undefined },
      { id: 'p3', name: 'Carol', seat: null },
    ]
    renderChip(makeGameState({ players }))
    expect(screen.getByText('1 player')).toBeTruthy()
  })

  it('includes street label in subtitle for non-waiting phase', () => {
    renderChip(makeGameState({ phase: 'flop', players: [{ id: 'p1', name: 'Alice', seat: 0 }] }))
    // subtitle = "1 player · FLOP"
    expect(screen.getByText(/1 player.*FLOP/)).toBeTruthy()
  })

  it('does NOT include street label in subtitle for waiting phase', () => {
    renderChip(makeGameState({ phase: 'waiting', players: [] }))
    // subtitle = "0 players" (no "· WAITING")
    expect(screen.getByText('0 players')).toBeTruthy()
    expect(screen.queryByText(/0 players.*WAITING/)).toBeNull()
  })
})

// ── Pot display ───────────────────────────────────────────────────────────────

describe('TableStatusChip — pot', () => {
  it('shows pot when pot > 0', () => {
    renderChip(makeGameState({ pot: 1500 }))
    expect(screen.getByText(/Pot:.*1,500/)).toBeTruthy()
  })

  it('does NOT show pot when pot = 0', () => {
    renderChip(makeGameState({ pot: 0 }))
    expect(screen.queryByText(/Pot:/)).toBeNull()
  })

  it('does NOT show pot when pot is absent', () => {
    renderChip(makeGameState({ pot: undefined }))
    expect(screen.queryByText(/Pot:/)).toBeNull()
  })
})

// ── Acting player ─────────────────────────────────────────────────────────────

describe('TableStatusChip — acting player', () => {
  it('shows "Acting: <name>" when a current player is matched', () => {
    const players = [
      { id: 'p1', name: 'Alice', seat: 0 },
      { id: 'p2', name: 'Bob',   seat: 1 },
    ]
    renderChip(makeGameState({ players, current_player: 'p2' }))
    expect(screen.getByText('Acting: Bob')).toBeTruthy()
  })

  it('does NOT show Acting line when current_player is null', () => {
    const players = [{ id: 'p1', name: 'Alice', seat: 0 }]
    renderChip(makeGameState({ players, current_player: null }))
    expect(screen.queryByText(/Acting:/)).toBeNull()
  })

  it('resolves current_turn as a fallback for current_player', () => {
    const players = [
      { id: 'p1', name: 'Alice', seat: 0 },
      { id: 'p2', name: 'Bob',   seat: 1 },
    ]
    renderChip(makeGameState({ players, current_turn: 'p1', current_player: undefined }))
    expect(screen.getByText('Acting: Alice')).toBeTruthy()
  })
})

// ── Graceful null handling ────────────────────────────────────────────────────

describe('TableStatusChip — null / undefined gameState', () => {
  it('renders without crashing when gameState is null', () => {
    expect(() => renderChip(null)).not.toThrow()
  })

  it('renders without crashing when gameState is undefined', () => {
    expect(() => renderChip(undefined)).not.toThrow()
  })

  it('defaults to "waiting" phase when gameState is null', () => {
    renderChip(null)
    expect(screen.getByText('WAITING')).toBeTruthy()
  })
})
