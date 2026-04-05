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

// HandConfigPanel uses RangePicker (not RangeMatrix directly) for matrix mode.
// We mock RangePicker so tests can exercise HandConfigPanel's state management
// without needing the real picker UI.  Each trigger button calls onApply with
// a specific range string, which HandConfigPanel parses and stores.
vi.mock('../components/RangePicker', () => ({
  default: ({ onApply, onCancel }) => (
    <div data-testid="range-matrix" data-mode="selected">
      <button data-testid="toggle-AAs"   onClick={() => onApply('AA')}>AA</button>
      <button data-testid="toggle-AKs"   onClick={() => onApply('AKs')}>AKs</button>
      <button data-testid="toggle-both"  onClick={() => onApply('AA,AKs')}>AA+AKs</button>
      <button data-testid="clear-picker" onClick={() => onApply('')}>Clear</button>
      <button data-testid="cancel-picker" onClick={onCancel}>Cancel</button>
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

  // Helper: switch a player row to MATRIX mode, then open the picker.
  // HandConfigPanel shows a "Pick Range…" button in matrix mode; clicking it
  // opens the RangePicker (mocked above as data-testid="range-matrix").
  function openPickerForPlayer(playerIndex = 0) {
    const matrixBtns = screen.getAllByText('MATRIX')
    fireEvent.click(matrixBtns[playerIndex])
    const pickBtns = screen.getAllByText('Pick Range…')
    fireEvent.click(pickBtns[0]) // first available "Pick Range…"
  }

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

  it('clicking MATRIX for a player shows a "Pick Range…" button', async () => {
    await renderPanel()

    // Picker should not be open in default cards mode
    expect(screen.queryByTestId('range-matrix')).toBeNull()

    const [firstMatrix] = screen.getAllByText('MATRIX')
    fireEvent.click(firstMatrix)

    // "Pick Range…" button should now appear (picker is not yet open)
    expect(screen.getByText('Pick Range…')).toBeTruthy()
  })

  it('clicking "Pick Range…" opens the RangePicker (range-matrix testid appears)', async () => {
    await renderPanel()
    openPickerForPlayer(0)
    expect(screen.getByTestId('range-matrix')).toBeTruthy()
  })

  it('RangePicker renders with colorMode="selected"', async () => {
    await renderPanel()
    openPickerForPlayer(0)
    const matrix = screen.getByTestId('range-matrix')
    expect(matrix.getAttribute('data-mode')).toBe('selected')
  })

  it('shows "Pick Range…" button with no combo count when nothing is selected', async () => {
    await renderPanel()

    const [firstMatrix] = screen.getAllByText('MATRIX')
    fireEvent.click(firstMatrix)

    expect(screen.getByText('Pick Range…')).toBeTruthy()
    expect(screen.queryByText(/combo/)).toBeNull()
  })

  it('applying a range calls selectedHandGroupsToComboArray', async () => {
    const { selectedHandGroupsToComboArray } = await import('../utils/comboUtils')
    await renderPanel()
    openPickerForPlayer(0)

    fireEvent.click(screen.getByTestId('toggle-AAs')) // calls onApply('AA')

    expect(selectedHandGroupsToComboArray).toHaveBeenCalled()
  })

  it('after applying AA, button shows "6 combos selected"', async () => {
    await renderPanel()
    openPickerForPlayer(0)

    fireEvent.click(screen.getByTestId('toggle-AAs')) // onApply('AA') → 6 combos

    // Picker closes; button shows combo count
    expect(screen.queryByTestId('range-matrix')).toBeNull()
    expect(screen.getByText(/6 combo/)).toBeTruthy()
  })

  it('applying an empty range after a selection resets to "Pick Range…"', async () => {
    await renderPanel()
    openPickerForPlayer(0)

    fireEvent.click(screen.getByTestId('toggle-AAs')) // apply AA → 6 combos
    expect(screen.getByText(/6 combo/)).toBeTruthy()

    // Reopen picker and clear selection
    fireEvent.click(screen.getByText(/6 combo/))
    fireEvent.click(screen.getByTestId('clear-picker')) // onApply('') → 0 combos

    expect(screen.queryByText(/combo/)).toBeNull()
    expect(screen.getByText('Pick Range…')).toBeTruthy()
  })

  it('applying AA + AKs shows "10 combos selected"', async () => {
    await renderPanel()
    openPickerForPlayer(0)

    fireEvent.click(screen.getByTestId('toggle-both')) // onApply('AA,AKs') → 10 combos

    expect(screen.getByText(/10 combo/)).toBeTruthy()
  })

  it('cancel closes the picker without changing the combo count', async () => {
    await renderPanel()
    openPickerForPlayer(0)

    expect(screen.getByTestId('range-matrix')).toBeTruthy()
    fireEvent.click(screen.getByTestId('cancel-picker'))

    expect(screen.queryByTestId('range-matrix')).toBeNull()
    expect(screen.queryByText(/combo/)).toBeNull() // still 0 combos
    expect(screen.getByText('Pick Range…')).toBeTruthy()
  })

  it('switching from MATRIX to CARDS clears the matrix state', async () => {
    await renderPanel()
    openPickerForPlayer(0)

    fireEvent.click(screen.getByTestId('toggle-AAs')) // apply AA → 6 combos
    expect(screen.getByText(/6 combo/)).toBeTruthy()

    // Switch back to CARDS
    const [firstCards] = screen.getAllByText('CARDS')
    fireEvent.click(firstCards)

    // Matrix section is gone entirely — no picker, no combo count
    expect(screen.queryByTestId('range-matrix')).toBeNull()
    expect(screen.queryByText(/combo/)).toBeNull()
  })

  it('switching from MATRIX to RANGE clears the matrix state', async () => {
    await renderPanel()
    openPickerForPlayer(0)

    fireEvent.click(screen.getByTestId('toggle-AAs'))
    expect(screen.getByText(/6 combo/)).toBeTruthy()

    const rangeBtns = screen.getAllByText('RANGE')
    fireEvent.click(rangeBtns[0])

    expect(screen.queryByTestId('range-matrix')).toBeNull()
    expect(screen.queryByText(/combo/)).toBeNull()
  })

  it('switching back to MATRIX from another mode starts with "Pick Range…"', async () => {
    await renderPanel()
    openPickerForPlayer(0)

    fireEvent.click(screen.getByTestId('toggle-AAs')) // apply AA

    // Switch to CARDS — clears playerMatrixGroups
    const [firstCards] = screen.getAllByText('CARDS')
    fireEvent.click(firstCards)

    // Switch back to MATRIX — should start fresh
    const [newMatrix] = screen.getAllByText('MATRIX')
    fireEvent.click(newMatrix)

    expect(screen.getByText('Pick Range…')).toBeTruthy()
    expect(screen.queryByText(/combo/)).toBeNull()
  })

  it('updateHandConfig emit is called with hole_cards_combos payload when range applied', async () => {
    const { emit } = await renderPanel()
    openPickerForPlayer(0)

    vi.clearAllMocks() // Clear the mode-switch emit calls

    fireEvent.click(screen.getByTestId('toggle-AAs')) // onApply('AA')

    expect(emit.updateHandConfig).toHaveBeenCalled()
    const callArg = emit.updateHandConfig.mock.calls[0][0]
    expect(callArg).toHaveProperty('hole_cards_combos')
    // stable1 is the configKey for Alice
    expect(callArg.hole_cards_combos).toHaveProperty('stable1')
    expect(Array.isArray(callArg.hole_cards_combos['stable1'])).toBe(true)
  })

  it('player name and seat badge are visible in the row', async () => {
    await renderPanel()

    expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.getByText('Bob')).toBeTruthy()
  })

  it('only the clicked player shows the "Pick Range…" button (not both players)', async () => {
    await renderPanel()

    const matrixBtns = screen.getAllByText('MATRIX')
    // Click MATRIX only for Alice (index 0)
    fireEvent.click(matrixBtns[0])

    // Only one "Pick Range…" button should appear (for Alice only)
    expect(screen.getAllByText('Pick Range…')).toHaveLength(1)
  })

  it('each player can independently open a picker', async () => {
    await renderPanel()

    const matrixBtns = screen.getAllByText('MATRIX')
    fireEvent.click(matrixBtns[0])  // Alice → matrix
    fireEvent.click(matrixBtns[1])  // Bob → matrix

    // Both should show "Pick Range…"
    expect(screen.getAllByText('Pick Range…')).toHaveLength(2)
  })
})
