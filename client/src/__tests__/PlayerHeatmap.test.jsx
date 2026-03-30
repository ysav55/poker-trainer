/**
 * PlayerHeatmap.test.jsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import React from 'react'

vi.mock('../components/RangeMatrix', () => ({
  RangeMatrix: vi.fn(({ colorMode, frequencies, readOnly }) => (
    <div
      data-testid="range-matrix"
      data-mode={colorMode}
      data-readonly={String(readOnly)}
      data-freq-size={frequencies ? frequencies.size : 0}
    />
  )),
}))

vi.mock('../utils/comboUtils', () => ({
  comboToHandGroup: vi.fn(([c1, c2]) => {
    // Realistic: sort by rank then suit
    const ranks = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2']
    const r1 = c1[0], r2 = c2[0], s1 = c1[1], s2 = c2[1]
    const i1 = ranks.indexOf(r1), i2 = ranks.indexOf(r2)
    const [hi, lo, hs, ls] = i1 <= i2 ? [r1, r2, s1, s2] : [r2, r1, s2, s1]
    if (hi === lo) return `${hi}${lo}`
    return `${hi}${lo}${hs === ls ? 's' : 'o'}`
  }),
  comboArrayToHandGroups: vi.fn((combos) => new Set(['AKo'])),
}))

vi.mock('../lib/api', () => ({
  apiFetch: vi.fn(),
}))

import { PlayerHeatmap } from '../components/PlayerHeatmap'
import { apiFetch } from '../lib/api'
import { RangeMatrix } from '../components/RangeMatrix'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PlayerHeatmap', () => {
  it('returns null when visible=false', () => {
    const { container } = render(
      <PlayerHeatmap stableId="player-1" visible={false} />
    )
    expect(container.firstChild).toBeNull()
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('shows loading text while fetching', async () => {
    // Never resolve so we stay in loading state
    apiFetch.mockReturnValue(new Promise(() => {}))
    render(<PlayerHeatmap stableId="player-1" visible={true} />)
    expect(screen.getByText(/Loading hands/)).toBeTruthy()
  })

  it('shows "No hand history yet" when fetch returns empty array', async () => {
    apiFetch.mockResolvedValue([])
    render(<PlayerHeatmap stableId="player-1" visible={true} />)
    await waitFor(() => {
      expect(screen.getByText('No hand history yet')).toBeTruthy()
    })
  })

  it('shows "No hand history yet" when fetch errors', async () => {
    apiFetch.mockRejectedValue(new Error('Network error'))
    render(<PlayerHeatmap stableId="player-1" visible={true} />)
    await waitFor(() => {
      expect(screen.getByText('No hand history yet')).toBeTruthy()
    })
  })

  it('renders RangeMatrix with colorMode="frequency" when hands are available', async () => {
    const hands = [
      { hole_cards: ['As', 'Ks'] },
      { hole_cards: ['Ah', 'Kd'] },
    ]
    apiFetch.mockResolvedValue(hands)
    render(<PlayerHeatmap stableId="player-1" visible={true} />)
    await waitFor(() => {
      expect(screen.getByTestId('range-matrix')).toBeTruthy()
    })
    expect(screen.getByTestId('range-matrix').getAttribute('data-mode')).toBe('frequency')
  })

  it('RangeMatrix receives readOnly={true}', async () => {
    apiFetch.mockResolvedValue([{ hole_cards: ['As', 'Ks'] }])
    render(<PlayerHeatmap stableId="player-1" visible={true} />)
    await waitFor(() => {
      expect(screen.getByTestId('range-matrix')).toBeTruthy()
    })
    expect(screen.getByTestId('range-matrix').getAttribute('data-readonly')).toBe('true')
  })

  it('passes correct frequencies Map — "AKs" appears 3 times → frequency 3', async () => {
    // comboToHandGroup will return 'AKs' for these (all same suit)
    const hands = [
      { hole_cards: ['As', 'Ks'] },
      { hole_cards: ['Ah', 'Kh'] },
      { hole_cards: ['Ad', 'Kd'] },
    ]
    apiFetch.mockResolvedValue(hands)

    let capturedFrequencies = null
    RangeMatrix.mockImplementation(({ frequencies }) => {
      capturedFrequencies = frequencies
      return <div data-testid="range-matrix" />
    })

    render(<PlayerHeatmap stableId="player-1" visible={true} />)
    await waitFor(() => {
      expect(screen.getByTestId('range-matrix')).toBeTruthy()
    })

    expect(capturedFrequencies).toBeTruthy()
    // The mock comboToHandGroup converts ['As','Ks'] → 'AKs'
    expect(capturedFrequencies.get('AKs')).toBe(3)
  })

  it('shows hand count below matrix — "5 hands in history"', async () => {
    const hands = Array.from({ length: 5 }, (_, i) => ({
      hole_cards: ['As', 'Ks'],
    }))
    apiFetch.mockResolvedValue(hands)
    render(<PlayerHeatmap stableId="player-1" visible={true} />)
    await waitFor(() => {
      expect(screen.getByText('5 hands in history')).toBeTruthy()
    })
  })

  it('shows "1 hand" (singular) when exactly 1 hand', async () => {
    apiFetch.mockResolvedValue([{ hole_cards: ['As', 'Ks'] }])
    render(<PlayerHeatmap stableId="player-1" visible={true} />)
    await waitFor(() => {
      expect(screen.getByText('1 hand in history')).toBeTruthy()
    })
  })

  it('does not re-fetch when stableId unchanged and visible stays true', async () => {
    apiFetch.mockResolvedValue([{ hole_cards: ['As', 'Ks'] }])
    const { rerender } = render(<PlayerHeatmap stableId="player-1" visible={true} />)
    await waitFor(() => {
      expect(screen.getByTestId('range-matrix')).toBeTruthy()
    })

    // Re-render with same props
    rerender(<PlayerHeatmap stableId="player-1" visible={true} />)
    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledTimes(1)
    })
  })

  it('re-fetches when stableId changes', async () => {
    apiFetch.mockResolvedValue([{ hole_cards: ['As', 'Ks'] }])
    const { rerender } = render(<PlayerHeatmap stableId="player-1" visible={true} />)
    await waitFor(() => {
      expect(screen.getByTestId('range-matrix')).toBeTruthy()
    })

    apiFetch.mockResolvedValue([{ hole_cards: ['Qh', 'Jd'] }])
    rerender(<PlayerHeatmap stableId="player-2" visible={true} />)
    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledTimes(2)
    })
    expect(apiFetch).toHaveBeenLastCalledWith('/api/players/player-2/hands')
  })

  it('fetches the correct endpoint for given stableId', async () => {
    apiFetch.mockResolvedValue([])
    render(<PlayerHeatmap stableId="abc-123" visible={true} />)
    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith('/api/players/abc-123/hands')
    })
  })
})
