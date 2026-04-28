/**
 * HandLibrarySectionExtended.test.jsx
 * Extended coverage for HandLibrarySection — range filter and hand-group chips.
 * Does NOT duplicate tests already in SidebarSections.test.jsx.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'

// comboToHandGroup is used directly in HandLibrarySection via ../../utils/comboUtils
// The resolved module id from root is: client/src/utils/comboUtils
vi.mock('../utils/comboUtils', () => ({
  comboToHandGroup: vi.fn((hc) =>
    Array.isArray(hc) && hc.length >= 2 ? 'AKs' : ''
  ),
}))

vi.mock('../components/RangeMatrix', () => ({
  RangeMatrix: ({ selected, onToggle, colorMode }) => (
    <div data-testid="range-matrix">
      <button data-testid="toggle-AKs" onClick={() => onToggle('AKs')}>
        AKs
      </button>
      <button data-testid="toggle-QQ" onClick={() => onToggle('QQ')}>
        QQ
      </button>
    </div>
  ),
}))

function makeEmit(overrides = {}) {
  return {
    startGame: vi.fn(),
    resetHand: vi.fn(),
    togglePause: vi.fn(),
    loadHandScenario: vi.fn(),
    addToPlaylist: vi.fn(),
    ...overrides,
  }
}

function makeHand(overrides = {}) {
  return {
    hand_id: 'hand-1',
    winner_name: 'Alice',
    final_pot: 200,
    started_at: '2026-01-01T00:00:00Z',
    phase_ended: 'river',
    auto_tags: [],
    coach_tags: [],
    ...overrides,
  }
}

async function renderSection(props = {}) {
  const { default: HandLibrarySection } = await import(
    '../components/sidebar/HandLibrarySection.jsx'
  )
  const emit = makeEmit(props.emitOverrides)
  render(
    <HandLibrarySection
      hands={props.hands ?? []}
      playlists={props.playlists ?? []}
      emit={emit}
    />
  )
  // HAND LIBRARY is closed by default — open it
  fireEvent.click(screen.getByText('HAND LIBRARY'))
  return { emit }
}

// ── Range filter ──────────────────────────────────────────────────────────────

describe('HandLibrarySection — range filter', () => {
  it('"⬡ Filter by Range" button is rendered', async () => {
    await renderSection()
    expect(screen.getByText(/Filter by Range/)).toBeTruthy()
  })

  it('range matrix is NOT visible initially', async () => {
    await renderSection()
    expect(screen.queryByTestId('range-matrix')).toBeNull()
  })

  it('clicking the toggle button reveals the range matrix', async () => {
    await renderSection()
    fireEvent.click(screen.getByText(/Filter by Range/))
    expect(screen.getByTestId('range-matrix')).toBeTruthy()
  })

  it('clicking the toggle button again hides the matrix', async () => {
    await renderSection()
    fireEvent.click(screen.getByText(/Filter by Range/))
    expect(screen.getByTestId('range-matrix')).toBeTruthy()
    fireEvent.click(screen.getByText(/Filter by Range/))
    expect(screen.queryByTestId('range-matrix')).toBeNull()
  })

  it('after selecting a hand group the button shows a "(1)" count badge', async () => {
    await renderSection()
    fireEvent.click(screen.getByText(/Filter by Range/))
    fireEvent.click(screen.getByTestId('toggle-AKs'))
    // Button text should now contain "(1)"
    expect(screen.getByText(/Filter by Range \(1\)/)).toBeTruthy()
  })

  it('with an active range filter, matching hands are shown', async () => {
    // comboToHandGroup mock always returns 'AKs' for any 2-card array
    const hands = [
      makeHand({ hand_id: 'h1', winner_name: 'Alice', hero_hole_cards: ['As', 'Ks'] }),
    ]
    await renderSection({ hands })
    fireEvent.click(screen.getByText(/Filter by Range/))
    fireEvent.click(screen.getByTestId('toggle-AKs'))
    // Alice should still appear (comboToHandGroup returns 'AKs', filter has 'AKs')
    expect(screen.getByText(/Alice/)).toBeTruthy()
  })

  it('with an active range filter, non-matching hands are hidden', async () => {
    const hands = [
      makeHand({ hand_id: 'h1', winner_name: 'Alice', hero_hole_cards: ['As', 'Ks'] }),
    ]
    await renderSection({ hands })
    fireEvent.click(screen.getByText(/Filter by Range/))
    // Filter on QQ — comboToHandGroup always returns 'AKs', so Alice won't match
    fireEvent.click(screen.getByTestId('toggle-QQ'))
    expect(screen.queryByText(/Alice/)).toBeNull()
  })

  it('"Clear filter" button appears when a filter is active', async () => {
    await renderSection()
    fireEvent.click(screen.getByText(/Filter by Range/))
    fireEvent.click(screen.getByTestId('toggle-AKs'))
    expect(screen.getByText('Clear filter')).toBeTruthy()
  })

  it('"Clear filter" button resets the filter', async () => {
    const hands = [
      makeHand({ hand_id: 'h1', winner_name: 'Alice', hero_hole_cards: ['As', 'Ks'] }),
    ]
    await renderSection({ hands })
    fireEvent.click(screen.getByText(/Filter by Range/))
    // Filter to QQ so Alice is hidden
    fireEvent.click(screen.getByTestId('toggle-QQ'))
    expect(screen.queryByText(/Alice/)).toBeNull()
    // Clear
    fireEvent.click(screen.getByText('Clear filter'))
    // Alice should reappear
    expect(screen.getByText(/Alice/)).toBeTruthy()
    // Count badge should be gone
    expect(screen.queryByText(/Filter by Range \(\d+\)/)).toBeNull()
  })

  it('hands with no hero_hole_cards are excluded when filter is active', async () => {
    const hands = [
      makeHand({ hand_id: 'h1', winner_name: 'NoCards' }),
      // no hero_hole_cards property
    ]
    await renderSection({ hands })
    fireEvent.click(screen.getByText(/Filter by Range/))
    fireEvent.click(screen.getByTestId('toggle-AKs'))
    // NoCards has no hole cards — excluded
    expect(screen.queryByText(/NoCards/)).toBeNull()
  })

  it('shows "No hands match the current filter" when filter active and no hands match', async () => {
    const hands = [
      makeHand({ hand_id: 'h1', winner_name: 'Bob', hero_hole_cards: ['As', 'Ks'] }),
    ]
    await renderSection({ hands })
    fireEvent.click(screen.getByText(/Filter by Range/))
    // Filtering on QQ; comboToHandGroup always returns 'AKs' so Bob won't match
    fireEvent.click(screen.getByTestId('toggle-QQ'))
    expect(screen.getByText('No hands match the current filter')).toBeTruthy()
  })
})

// ── Hand-group chips ──────────────────────────────────────────────────────────

describe('HandLibrarySection — hand-group chips', () => {
  it('renders a chip with the hand group when hero_hole_cards is set', async () => {
    const hands = [
      makeHand({ hand_id: 'h1', winner_name: 'Alice', hero_hole_cards: ['As', 'Ks'] }),
    ]
    await renderSection({ hands })
    // comboToHandGroup mock returns 'AKs'
    expect(screen.getByText('AKs')).toBeTruthy()
  })

  it('chip has blue-ish background styling', async () => {
    const hands = [
      makeHand({ hand_id: 'h1', winner_name: 'Alice', hero_hole_cards: ['As', 'Ks'] }),
    ]
    await renderSection({ hands })
    const chip = screen.getByText('AKs')
    // background contains rgba(59,130,246,...) — check for the rgb values
    expect(chip.style.background).toContain('59')
    expect(chip.style.background).toContain('130')
    expect(chip.style.background).toContain('246')
  })

  it('no chip rendered when hand has no hole cards', async () => {
    const hands = [
      makeHand({ hand_id: 'h1', winner_name: 'Bob' }),
    ]
    await renderSection({ hands })
    // 'AKs' chip should not appear
    expect(screen.queryByText('AKs')).toBeNull()
  })
})
