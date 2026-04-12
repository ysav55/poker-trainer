/**
 * PlayerRangePanel.test.jsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

vi.mock('../components/RangeMatrix', () => ({
  RangeMatrix: vi.fn(({ selected, colorMode, readOnly }) => (
    <div
      data-testid="range-matrix"
      data-mode={colorMode}
      data-readonly={String(readOnly)}
      data-selected={selected ? [...selected].join(',') : ''}
    />
  )),
}))

// comboArrayToHandGroups returns a Set of hand group strings from combo arrays
vi.mock('../utils/comboUtils', () => ({
  comboToHandGroup: vi.fn(([c1, c2]) => c1[0] + c2[0] + 'o'),
  comboArrayToHandGroups: vi.fn((combos) => {
    if (!combos || combos.length === 0) return new Set()
    return new Set(combos.map(([c1, c2]) => c1[0] + c2[0] + 'o'))
  }),
}))

import { PlayerRangePanel } from '../components/PlayerRangePanel'
import { comboArrayToHandGroups } from '../utils/comboUtils'

beforeEach(() => {
  vi.clearAllMocks()
  // Re-establish default implementations (clearAllMocks does NOT clear them,
  // but resetAllMocks would — so we restore explicitly here for safety)
  comboArrayToHandGroups.mockImplementation((combos) => {
    if (!combos || combos.length === 0) return new Set()
    return new Set(combos.map(([c1, c2]) => c1[0] + c2[0] + 'o'))
  })
})

const MY_ID = 'player-uuid-123'

function makeGameState({ configPhase = true, combos = undefined } = {}) {
  return {
    config_phase: configPhase,
    config: {
      hole_cards_combos: combos !== undefined
        ? { [MY_ID]: combos }
        : {},
    },
  }
}

describe('PlayerRangePanel', () => {
  it('returns null when equitySettings.showRangesToPlayers is false', () => {
    const { container } = render(
      <PlayerRangePanel
        gameState={makeGameState({ combos: [['As', 'Ks']] })}
        myId={MY_ID}
        equitySettings={{ showRangesToPlayers: false }}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('returns null when gameState.config_phase is false', () => {
    const { container } = render(
      <PlayerRangePanel
        gameState={makeGameState({ configPhase: false, combos: [['As', 'Ks']] })}
        myId={MY_ID}
        equitySettings={{ showRangesToPlayers: true }}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('returns null when both are true but no combos for myId', () => {
    const { container } = render(
      <PlayerRangePanel
        gameState={makeGameState({ configPhase: true })}
        myId={MY_ID}
        equitySettings={{ showRangesToPlayers: true }}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('returns null when combos array is empty', () => {
    // The component checks combos.length === 0 before calling comboArrayToHandGroups,
    // so no mock override needed — the default implementation handles this.
    const { container } = render(
      <PlayerRangePanel
        gameState={makeGameState({ configPhase: true, combos: [] })}
        myId={MY_ID}
        equitySettings={{ showRangesToPlayers: true }}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('returns null when equitySettings is null/undefined', () => {
    const { container } = render(
      <PlayerRangePanel
        gameState={makeGameState({ combos: [['As', 'Ks']] })}
        myId={MY_ID}
        equitySettings={null}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders RangeMatrix when showRangesToPlayers=true AND config_phase=true AND combos exist', () => {
    // Default mock: [['As','Ks']] → 'AKo' (a non-empty Set → renders matrix)
    const combos = [['As', 'Ks']]
    render(
      <PlayerRangePanel
        gameState={makeGameState({ configPhase: true, combos })}
        myId={MY_ID}
        equitySettings={{ showRangesToPlayers: true }}
      />
    )
    expect(screen.getByTestId('range-matrix')).toBeTruthy()
  })

  it('shows "Your Range" label', () => {
    const combos = [['As', 'Ks']]
    render(
      <PlayerRangePanel
        gameState={makeGameState({ configPhase: true, combos })}
        myId={MY_ID}
        equitySettings={{ showRangesToPlayers: true }}
      />
    )
    expect(screen.getByText('Your Range')).toBeTruthy()
  })

  it('shows combo count (plural)', () => {
    const combos = [['As', 'Ks'], ['Ah', 'Kh']]
    render(
      <PlayerRangePanel
        gameState={makeGameState({ configPhase: true, combos })}
        myId={MY_ID}
        equitySettings={{ showRangesToPlayers: true }}
      />
    )
    expect(screen.getByText('2 combos')).toBeTruthy()
  })

  it('shows "1 combo" (singular)', () => {
    const combos = [['As', 'Ks']]
    render(
      <PlayerRangePanel
        gameState={makeGameState({ configPhase: true, combos })}
        myId={MY_ID}
        equitySettings={{ showRangesToPlayers: true }}
      />
    )
    expect(screen.getByText('1 combo')).toBeTruthy()
  })

  it('passes correct hand groups to RangeMatrix', () => {
    // Default mock: [['As','Ks']] → Set(['AKo'])
    const combos = [['As', 'Ks']]
    render(
      <PlayerRangePanel
        gameState={makeGameState({ configPhase: true, combos })}
        myId={MY_ID}
        equitySettings={{ showRangesToPlayers: true }}
      />
    )
    const matrix = screen.getByTestId('range-matrix')
    // Mock produces 'AKo' from ['As','Ks']
    expect(matrix.getAttribute('data-selected')).toBe('AKo')
  })

  it('RangeMatrix receives colorMode="selected"', () => {
    const combos = [['As', 'Ks']]
    render(
      <PlayerRangePanel
        gameState={makeGameState({ configPhase: true, combos })}
        myId={MY_ID}
        equitySettings={{ showRangesToPlayers: true }}
      />
    )
    expect(screen.getByTestId('range-matrix').getAttribute('data-mode')).toBe('selected')
  })

  it('RangeMatrix receives readOnly={true}', () => {
    const combos = [['As', 'Ks']]
    render(
      <PlayerRangePanel
        gameState={makeGameState({ configPhase: true, combos })}
        myId={MY_ID}
        equitySettings={{ showRangesToPlayers: true }}
      />
    )
    expect(screen.getByTestId('range-matrix').getAttribute('data-readonly')).toBe('true')
  })
})
