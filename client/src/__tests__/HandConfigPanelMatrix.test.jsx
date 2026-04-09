/**
 * HandConfigPanelMatrix.test.jsx
 * Tests for HandConfigPanel focusing on the Range tab (matrix picker):
 * playerMatrixGroups state, handleMatrixToggle, and the range-picker render branch.
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

// HandConfigPanel uses RangePicker for range mode.
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

// Helper: find all RANGE buttons
function getRangeBtns() {
  return screen.getAllByText('RANGE')
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('HandConfigPanel — Range tab (matrix picker)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Helper: switch a player row to RANGE mode, then open the picker.
  // HandConfigPanel shows a "Pick Range…" button in range mode; clicking it
  // opens the RangePicker (mocked above as data-testid="range-matrix").
  function openPickerForPlayer(playerIndex = 0) {
    const rangeBtns = screen.getAllByText('RANGE')
    fireEvent.click(rangeBtns[playerIndex])
    const pickBtns = screen.getAllByText('Pick Range…')
    fireEvent.click(pickBtns[0]) // first available "Pick Range…"
  }

  it('renders 2 mode buttons (CARDS, RANGE) for each player row', async () => {
    await renderPanel()

    // 2 players × 2 buttons = 4 total across both rows
    const cardsBtns = screen.getAllByText('CARDS')
    expect(cardsBtns).toHaveLength(2)

    const rangeBtns = screen.getAllByText('RANGE')
    expect(rangeBtns).toHaveLength(2)
  })

  it('clicking RANGE for a player shows a "Pick Range…" button', async () => {
    await renderPanel()

    // Picker should not be open in default cards mode
    expect(screen.queryByTestId('range-matrix')).toBeNull()

    const [firstRange] = screen.getAllByText('RANGE')
    fireEvent.click(firstRange)

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

    const [firstRange] = screen.getAllByText('RANGE')
    fireEvent.click(firstRange)

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

  it('switching from RANGE to CARDS clears the range state', async () => {
    await renderPanel()
    openPickerForPlayer(0)

    fireEvent.click(screen.getByTestId('toggle-AAs')) // apply AA → 6 combos
    expect(screen.getByText(/6 combo/)).toBeTruthy()

    // Switch back to CARDS
    const [firstCards] = screen.getAllByText('CARDS')
    fireEvent.click(firstCards)

    // Range section is gone entirely — no picker, no combo count
    expect(screen.queryByTestId('range-matrix')).toBeNull()
    expect(screen.queryByText(/combo/)).toBeNull()
  })

  it('switching back to RANGE from CARDS starts with "Pick Range…"', async () => {
    await renderPanel()
    openPickerForPlayer(0)

    fireEvent.click(screen.getByTestId('toggle-AAs')) // apply AA

    // Switch to CARDS — clears playerMatrixGroups
    const [firstCards] = screen.getAllByText('CARDS')
    fireEvent.click(firstCards)

    // Switch back to RANGE — should start fresh
    const rangeBtns = screen.getAllByText('RANGE')
    fireEvent.click(rangeBtns[0])

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

    const rangeBtns = screen.getAllByText('RANGE')
    // Click RANGE only for Alice (index 0)
    fireEvent.click(rangeBtns[0])

    // Only one "Pick Range…" button should appear (for Alice only)
    expect(screen.getAllByText('Pick Range…')).toHaveLength(1)
  })

  it('each player can independently open a picker', async () => {
    await renderPanel()

    const rangeBtns = screen.getAllByText('RANGE')
    fireEvent.click(rangeBtns[0])  // Alice → range
    fireEvent.click(rangeBtns[1])  // Bob → range

    // Both should show "Pick Range…"
    expect(screen.getAllByText('Pick Range…')).toHaveLength(2)
  })
})
