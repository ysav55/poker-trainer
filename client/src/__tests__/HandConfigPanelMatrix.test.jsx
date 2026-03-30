/**
 * HandConfigPanelMatrix.test.jsx
 * Tests for HandConfigPanel focusing on the Matrix tab:
 * playerMatrixGroups state, handleMatrixToggle, and the matrix render branch.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../components/Card', () => ({
  default: ({ card }) => <span>{card}</span>,
}))

vi.mock('../components/CardPicker', () => ({
  default: ({ onSelect, onClose }) => (
    <div data-testid="card-picker">
      <button onClick={() => onSelect('As')}>As</button>
      <button onClick={onClose}>Close</button>
    </div>
  ),
}))

vi.mock('../components/RangeMatrix', () => ({
  RangeMatrix: ({ selected, onToggle, colorMode }) => (
    <div data-testid="range-matrix" data-mode={colorMode}>
      <button data-testid="toggle-AAs" onClick={() => onToggle('AA')}>AA</button>
      <button data-testid="toggle-AKs" onClick={() => onToggle('AKs')}>AKs</button>
      <button data-testid="toggle-AKo" onClick={() => onToggle('AKo')}>AKo</button>
      <span data-testid="selected-count">{selected.size}</span>
    </div>
  ),
}))

vi.mock('../utils/comboUtils', () => ({
  selectedHandGroupsToComboArray: vi.fn((groups) =>
    [...groups].flatMap((g) =>
      g === 'AA'
        ? [['As', 'Ac'], ['As', 'Ad'], ['As', 'Ah'], ['Ac', 'Ad'], ['Ac', 'Ah'], ['Ad', 'Ah']]
        : [['As', 'Ks'], ['Ah', 'Kh'], ['Ad', 'Kd'], ['Ac', 'Kc']]
    )
  ),
  comboArrayToHandGroups: vi.fn((_combos) => new Set()),
}))

// ── Test fixtures ─────────────────────────────────────────────────────────────

const gameState = {
  players: [
    { id: 'p1', stableId: 'stable1', name: 'Alice', seat: 0, stack: 1000 },
    { id: 'p2', stableId: 'stable2', name: 'Bob', seat: 1, stack: 1000 },
  ],
  phase: 'config',
  config_phase: true,
}

const twoPlayerGameState = gameState

function makeEmit(overrides = {}) {
  return {
    updateHandConfig: vi.fn(),
    startConfiguredHand: vi.fn(),
    ...overrides,
  }
}

async function renderPanel(props = {}) {
  const { default: HandConfigPanel } = await import('../components/HandConfigPanel')
  const emit = makeEmit(props.emit)
  render(
    <HandConfigPanel
      gameState={twoPlayerGameState}
      emit={emit}
      {...props}
      emit={emit}
    />
  )
  return { emit }
}

// Helper: find the MATRIX button for a given player name
function getMatrixBtn(playerName) {
  // PlayerModeToggle renders 3 buttons per player; MATRIX is the 3rd
  // We find by text MATRIX nearest to the player's name
  const allMatrixBtns = screen.getAllByText('MATRIX')
  // Return all — callers can index
  return allMatrixBtns
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('HandConfigPanel — Matrix tab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders 3 mode buttons (CARDS, RANGE, MATRIX) for each player row', async () => {
    await renderPanel()

    // 2 players × 3 buttons = 6 total across both rows
    const cardsBtns = screen.getAllByText('CARDS')
    expect(cardsBtns).toHaveLength(2)

    // RANGE button text may include ▲/▼ suffix when active, so check base text
    // In default 'cards' mode, range is inactive so label is plain 'RANGE'
    const rangeBtns = screen.getAllByText('RANGE')
    expect(rangeBtns).toHaveLength(2)

    const matrixBtns = screen.getAllByText('MATRIX')
    expect(matrixBtns).toHaveLength(2)
  })

  it('clicking MATRIX for a player switches to matrix mode', async () => {
    await renderPanel()

    // RangeMatrix should not be visible in default cards mode
    expect(screen.queryByTestId('range-matrix')).toBeNull()

    // Click MATRIX for first player (Alice)
    const [firstMatrix] = screen.getAllByText('MATRIX')
    fireEvent.click(firstMatrix)

    // RangeMatrix should now be rendered
    expect(screen.getByTestId('range-matrix')).toBeTruthy()
  })

  it('RangeMatrix renders with colorMode="selected" in matrix mode', async () => {
    await renderPanel()

    const [firstMatrix] = screen.getAllByText('MATRIX')
    fireEvent.click(firstMatrix)

    const matrix = screen.getByTestId('range-matrix')
    expect(matrix.getAttribute('data-mode')).toBe('selected')
  })

  it('shows "Click cells to select hands" hint when no cells are selected', async () => {
    await renderPanel()

    const [firstMatrix] = screen.getAllByText('MATRIX')
    fireEvent.click(firstMatrix)

    expect(screen.getByText('Click cells to select hands')).toBeTruthy()
  })

  it('clicking a cell in matrix mode calls selectedHandGroupsToComboArray', async () => {
    const { selectedHandGroupsToComboArray } = await import('../utils/comboUtils')
    await renderPanel()

    const [firstMatrix] = screen.getAllByText('MATRIX')
    fireEvent.click(firstMatrix)

    fireEvent.click(screen.getByTestId('toggle-AAs'))

    expect(selectedHandGroupsToComboArray).toHaveBeenCalled()
  })

  it('after clicking AA cell, shows "6 combos"', async () => {
    await renderPanel()

    const [firstMatrix] = screen.getAllByText('MATRIX')
    fireEvent.click(firstMatrix)

    fireEvent.click(screen.getByTestId('toggle-AAs'))

    // Mock returns 6 combos for AA
    expect(screen.getByText(/6 combo/)).toBeTruthy()
  })

  it('clicking the same cell again removes it from selection (toggle off)', async () => {
    await renderPanel()

    const [firstMatrix] = screen.getAllByText('MATRIX')
    fireEvent.click(firstMatrix)

    // Toggle on
    fireEvent.click(screen.getByTestId('toggle-AAs'))
    expect(screen.getByText(/6 combo/)).toBeTruthy()

    // Toggle off — AA removed, count back to 0
    fireEvent.click(screen.getByTestId('toggle-AAs'))
    expect(screen.queryByText(/combo/)).toBeNull()
    expect(screen.getByText('Click cells to select hands')).toBeTruthy()
  })

  it('multiple cells can be selected (AA + AKs = 10 combos)', async () => {
    await renderPanel()

    const [firstMatrix] = screen.getAllByText('MATRIX')
    fireEvent.click(firstMatrix)

    fireEvent.click(screen.getByTestId('toggle-AAs'))   // AA: 6 combos
    fireEvent.click(screen.getByTestId('toggle-AKs'))   // AKs: 4 combos

    // Mock: AA(6) + AKs(4) = 10 combos
    expect(screen.getByText(/10 combo/)).toBeTruthy()
  })

  it('selected-count in the mock reflects Set size accurately', async () => {
    await renderPanel()

    const [firstMatrix] = screen.getAllByText('MATRIX')
    fireEvent.click(firstMatrix)

    // Initially 0
    expect(screen.getByTestId('selected-count').textContent).toBe('0')

    fireEvent.click(screen.getByTestId('toggle-AAs'))
    expect(screen.getByTestId('selected-count').textContent).toBe('1')

    fireEvent.click(screen.getByTestId('toggle-AKs'))
    expect(screen.getByTestId('selected-count').textContent).toBe('2')
  })

  it('switching from MATRIX to CARDS clears the matrix state', async () => {
    await renderPanel()

    const [firstMatrix] = screen.getAllByText('MATRIX')
    fireEvent.click(firstMatrix)

    fireEvent.click(screen.getByTestId('toggle-AAs'))
    expect(screen.getByText(/6 combo/)).toBeTruthy()

    // Switch back to CARDS
    const [firstCards] = screen.getAllByText('CARDS')
    fireEvent.click(firstCards)

    // RangeMatrix should be gone
    expect(screen.queryByTestId('range-matrix')).toBeNull()
    // Combo count hint should be gone
    expect(screen.queryByText(/combo/)).toBeNull()
    expect(screen.queryByText('Click cells to select hands')).toBeNull()
  })

  it('switching from MATRIX to RANGE clears the matrix state', async () => {
    await renderPanel()

    const [firstMatrix] = screen.getAllByText('MATRIX')
    fireEvent.click(firstMatrix)

    fireEvent.click(screen.getByTestId('toggle-AAs'))
    expect(screen.getByText(/6 combo/)).toBeTruthy()

    // Switch to RANGE — find the RANGE button for first player
    const rangeBtns = screen.getAllByText('RANGE')
    fireEvent.click(rangeBtns[0])

    // RangeMatrix should be gone
    expect(screen.queryByTestId('range-matrix')).toBeNull()
  })

  it('switching back to MATRIX from another mode initializes with empty set', async () => {
    await renderPanel()

    // Go to MATRIX first
    const [firstMatrix] = screen.getAllByText('MATRIX')
    fireEvent.click(firstMatrix)
    fireEvent.click(screen.getByTestId('toggle-AAs'))

    // Switch to CARDS
    const [firstCards] = screen.getAllByText('CARDS')
    fireEvent.click(firstCards)

    // Switch back to MATRIX — should start fresh (empty set)
    const [newMatrix] = screen.getAllByText('MATRIX')
    fireEvent.click(newMatrix)

    expect(screen.getByTestId('range-matrix')).toBeTruthy()
    // Empty set: hint should be showing, no combos
    expect(screen.getByText('Click cells to select hands')).toBeTruthy()
    expect(screen.getByTestId('selected-count').textContent).toBe('0')
  })

  it('updateHandConfig emit is called with hole_cards_combos payload when cell toggled', async () => {
    const { emit } = await renderPanel()

    const [firstMatrix] = screen.getAllByText('MATRIX')
    fireEvent.click(firstMatrix)

    vi.clearAllMocks() // Clear the mode-switch emit calls

    fireEvent.click(screen.getByTestId('toggle-AAs'))

    // emit.updateHandConfig should have been called with hole_cards_combos
    expect(emit.updateHandConfig).toHaveBeenCalled()
    const callArg = emit.updateHandConfig.mock.calls[0][0]
    expect(callArg).toHaveProperty('hole_cards_combos')
    // stable1 is the configKey for Alice
    expect(callArg.hole_cards_combos).toHaveProperty('stable1')
    expect(Array.isArray(callArg.hole_cards_combos['stable1'])).toBe(true)
  })

  it('player name and seat badge are visible in the row', async () => {
    await renderPanel()

    // Seat badges (numbers in circle) — use getAllByText since digits may appear elsewhere
    expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(1)

    // Player names
    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.getByText('Bob')).toBeTruthy()
  })

  it('only the clicked player shows the matrix (not both players)', async () => {
    await renderPanel()

    const matrixBtns = screen.getAllByText('MATRIX')
    // Click MATRIX only for Alice (index 0)
    fireEvent.click(matrixBtns[0])

    // Only one RangeMatrix should be present
    expect(screen.getAllByTestId('range-matrix')).toHaveLength(1)
  })

  it('each player can independently be in matrix mode', async () => {
    await renderPanel()

    const matrixBtns = screen.getAllByText('MATRIX')
    fireEvent.click(matrixBtns[0])  // Alice → matrix
    fireEvent.click(matrixBtns[1])  // Bob → matrix

    // Both should show a RangeMatrix
    expect(screen.getAllByTestId('range-matrix')).toHaveLength(2)
  })
})
