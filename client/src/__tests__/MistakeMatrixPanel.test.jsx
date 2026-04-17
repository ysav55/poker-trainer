/**
 * MistakeMatrixPanel.test.jsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'

vi.mock('../components/RangeMatrix', () => ({
  RangeMatrix: vi.fn(({ colorMode, mistakeTags, readOnly }) => (
    <div
      data-testid="range-matrix"
      data-mode={colorMode}
      data-readonly={String(readOnly)}
      data-mistake-size={mistakeTags ? mistakeTags.size : 0}
    />
  )),
}))

vi.mock('../utils/comboUtils', () => ({
  comboToHandGroup: vi.fn(([c1, c2]) => {
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

import { MistakeMatrixPanel } from '../components/MistakeMatrixPanel'
import { apiFetch } from '../lib/api'
import { RangeMatrix } from '../components/RangeMatrix'

beforeEach(() => {
  vi.clearAllMocks()
})

// All valid mistake tags from MISTAKE_TAG_NAMES in the source
const MISTAKE_TAGS = ['OPEN_LIMP', 'OVERLIMP', 'LIMP_RERAISE', 'COLD_CALL_3BET', 'FOLD_TO_PROBE', 'MIN_RAISE', 'UNDO_USED', 'DREW_THIN', 'EQUITY_FOLD']
// Non-mistake (auto) tags
const AUTO_TAGS = ['C_BET', 'CHECK_RAISE', 'BLUFF_CATCH', 'DONK_BET', 'RIVER_RAISE', 'VALUE_BACKED', 'SAW_FLOP', '3BET_POT']

describe('MistakeMatrixPanel', () => {
  it('returns null when visible=false', () => {
    const { container } = render(
      <MistakeMatrixPanel stableId="player-1" visible={false} />
    )
    expect(container.firstChild).toBeNull()
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('shows loading text while fetching', async () => {
    apiFetch.mockReturnValue(new Promise(() => {}))
    render(<MistakeMatrixPanel stableId="player-1" visible={true} />)
    expect(screen.getByText(/Loading hands/)).toBeTruthy()
  })

  it('shows "No hand history yet" when fetch returns empty array', async () => {
    apiFetch.mockResolvedValue([])
    render(<MistakeMatrixPanel stableId="player-1" visible={true} />)
    await waitFor(() => {
      expect(screen.getByText('No hand history yet')).toBeTruthy()
    })
  })

  it('shows "No hand history yet" when fetch errors', async () => {
    apiFetch.mockRejectedValue(new Error('Network error'))
    render(<MistakeMatrixPanel stableId="player-1" visible={true} />)
    await waitFor(() => {
      expect(screen.getByText('No hand history yet')).toBeTruthy()
    })
  })

  it('renders RangeMatrix with colorMode="mistake" when hands available', async () => {
    const hands = [
      { hero_hole_cards: ['As', 'Ks'], auto_tags: ['OPEN_LIMP'], coach_tags: [] },
    ]
    apiFetch.mockResolvedValue(hands)
    render(<MistakeMatrixPanel stableId="player-1" visible={true} />)
    await waitFor(() => {
      expect(screen.getByTestId('range-matrix')).toBeTruthy()
    })
    expect(screen.getByTestId('range-matrix').getAttribute('data-mode')).toBe('mistake')
  })

  it('only includes MISTAKE tags — not auto tags like C_BET or VALUE_BACKED', async () => {
    // Hand has both mistake and non-mistake tags
    const hands = [
      {
        hero_hole_cards: ['As', 'Ks'],
        auto_tags: ['OPEN_LIMP', 'C_BET', 'SAW_FLOP'],
        coach_tags: ['VALUE_BACKED'],
      },
    ]
    apiFetch.mockResolvedValue(hands)

    let capturedMistakeTags = null
    RangeMatrix.mockImplementation(({ mistakeTags }) => {
      capturedMistakeTags = mistakeTags
      return <div data-testid="range-matrix" />
    })

    render(<MistakeMatrixPanel stableId="player-1" visible={true} />)
    await waitFor(() => {
      expect(screen.getByTestId('range-matrix')).toBeTruthy()
    })

    expect(capturedMistakeTags).toBeTruthy()
    // AKs group has OPEN_LIMP → present
    const groupTags = capturedMistakeTags.get('AKs')
    expect(groupTags).toBeDefined()
    expect(groupTags).toContain('OPEN_LIMP')
    // Non-mistake tags must NOT appear
    expect(groupTags).not.toContain('C_BET')
    expect(groupTags).not.toContain('SAW_FLOP')
    expect(groupTags).not.toContain('VALUE_BACKED')
  })

  it('does not include any non-mistake auto tags in mistakeTags map', async () => {
    const hands = AUTO_TAGS.map(tag => ({
      hero_hole_cards: ['Qh', 'Jh'],
      auto_tags: [tag],
      coach_tags: [],
    }))
    apiFetch.mockResolvedValue(hands)

    let capturedMistakeTags = null
    RangeMatrix.mockImplementation(({ mistakeTags }) => {
      capturedMistakeTags = mistakeTags
      return <div data-testid="range-matrix" />
    })

    render(<MistakeMatrixPanel stableId="player-1" visible={true} />)
    await waitFor(() => {
      expect(screen.getByTestId('range-matrix')).toBeTruthy()
    })

    // QJs (suited) group should have no mistake tags → not in map
    // All hands only have non-mistake tags
    expect(capturedMistakeTags.size).toBe(0)
  })

  it('aggregates mistakes across multiple hands for same hand group', async () => {
    const hands = [
      { hero_hole_cards: ['As', 'Ks'], auto_tags: ['OPEN_LIMP'], coach_tags: [] },
      { hero_hole_cards: ['Ah', 'Kd'], auto_tags: ['MIN_RAISE'], coach_tags: [] },
    ]
    // Both ['As','Ks'] and ['Ah','Kd'] are AKs and AKo respectively via mock
    apiFetch.mockResolvedValue(hands)

    let capturedMistakeTags = null
    RangeMatrix.mockImplementation(({ mistakeTags }) => {
      capturedMistakeTags = mistakeTags
      return <div data-testid="range-matrix" />
    })

    render(<MistakeMatrixPanel stableId="player-1" visible={true} />)
    await waitFor(() => {
      expect(screen.getByTestId('range-matrix')).toBeTruthy()
    })

    expect(capturedMistakeTags).toBeTruthy()
    // AKs group: OPEN_LIMP
    const aksGroup = capturedMistakeTags.get('AKs')
    expect(aksGroup).toContain('OPEN_LIMP')
    // AKo group: MIN_RAISE
    const akoGroup = capturedMistakeTags.get('AKo')
    expect(akoGroup).toContain('MIN_RAISE')
  })

  it('deduplicates same tag for same hand group across multiple hands', async () => {
    const hands = [
      { hero_hole_cards: ['As', 'Ks'], auto_tags: ['OPEN_LIMP'], coach_tags: [] },
      { hero_hole_cards: ['Ah', 'Kh'], auto_tags: ['OPEN_LIMP'], coach_tags: [] },
      { hero_hole_cards: ['Ad', 'Kd'], auto_tags: ['OPEN_LIMP'], coach_tags: [] },
    ]
    // All three are AKs by mock
    apiFetch.mockResolvedValue(hands)

    let capturedMistakeTags = null
    RangeMatrix.mockImplementation(({ mistakeTags }) => {
      capturedMistakeTags = mistakeTags
      return <div data-testid="range-matrix" />
    })

    render(<MistakeMatrixPanel stableId="player-1" visible={true} />)
    await waitFor(() => {
      expect(screen.getByTestId('range-matrix')).toBeTruthy()
    })

    expect(capturedMistakeTags).toBeTruthy()
    const aksGroup = capturedMistakeTags.get('AKs')
    expect(aksGroup).toBeDefined()
    // OPEN_LIMP appears only once despite 3 hands
    const openLimpCount = aksGroup.filter(t => t === 'OPEN_LIMP').length
    expect(openLimpCount).toBe(1)
  })

  it('shows "N hand groups with mistakes" count', async () => {
    const hands = [
      { hero_hole_cards: ['As', 'Ks'], auto_tags: ['OPEN_LIMP'], coach_tags: [] },
      { hero_hole_cards: ['Qh', 'Jd'], auto_tags: ['MIN_RAISE'], coach_tags: [] },
    ]
    apiFetch.mockResolvedValue(hands)
    render(<MistakeMatrixPanel stableId="player-1" visible={true} />)
    await waitFor(() => {
      // 2 distinct hand groups (AKs and QJo) with mistakes
      expect(screen.getByText(/hand group.*with mistakes/)).toBeTruthy()
    })
  })

  it('shows "0 hand groups with mistakes" when hands exist but none have mistake tags', async () => {
    const hands = [
      { hero_hole_cards: ['As', 'Ks'], auto_tags: ['C_BET', 'SAW_FLOP'], coach_tags: [] },
    ]
    apiFetch.mockResolvedValue(hands)
    render(<MistakeMatrixPanel stableId="player-1" visible={true} />)
    await waitFor(() => {
      expect(screen.getByText('0 hand groups with mistakes')).toBeTruthy()
    })
  })

  it('hands with no mistake tags do NOT appear in mistakeTags', async () => {
    const hands = [
      { hero_hole_cards: ['As', 'Ks'], auto_tags: ['C_BET', 'CHECK_RAISE'], coach_tags: [] },
      { hero_hole_cards: ['Qh', 'Jd'], auto_tags: ['BLUFF_CATCH'], coach_tags: [] },
    ]
    apiFetch.mockResolvedValue(hands)

    let capturedMistakeTags = null
    RangeMatrix.mockImplementation(({ mistakeTags }) => {
      capturedMistakeTags = mistakeTags
      return <div data-testid="range-matrix" />
    })

    render(<MistakeMatrixPanel stableId="player-1" visible={true} />)
    await waitFor(() => {
      expect(screen.getByTestId('range-matrix')).toBeTruthy()
    })

    expect(capturedMistakeTags.size).toBe(0)
  })

  it('reads hero_hole_cards preferentially over hole_cards', async () => {
    const hands = [
      {
        hero_hole_cards: ['As', 'Ks'],
        hole_cards: ['Qh', 'Jd'],  // should be ignored
        auto_tags: ['OPEN_LIMP'],
        coach_tags: [],
      },
    ]
    apiFetch.mockResolvedValue(hands)

    let capturedMistakeTags = null
    RangeMatrix.mockImplementation(({ mistakeTags }) => {
      capturedMistakeTags = mistakeTags
      return <div data-testid="range-matrix" />
    })

    render(<MistakeMatrixPanel stableId="player-1" visible={true} />)
    await waitFor(() => {
      expect(screen.getByTestId('range-matrix')).toBeTruthy()
    })

    // Should have AKs (from hero_hole_cards), not QJo
    expect(capturedMistakeTags.has('AKs')).toBe(true)
    expect(capturedMistakeTags.has('QJo')).toBe(false)
  })

  it('all defined MISTAKE_TAG_NAMES are recognized as mistake tags', async () => {
    const hands = MISTAKE_TAGS.map((tag, i) => ({
      // Each hand needs distinct hole cards so they map to different groups
      hero_hole_cards: ['As', 'Ks'],
      auto_tags: [tag],
      coach_tags: [],
    }))
    apiFetch.mockResolvedValue(hands)

    let capturedMistakeTags = null
    RangeMatrix.mockImplementation(({ mistakeTags }) => {
      capturedMistakeTags = mistakeTags
      return <div data-testid="range-matrix" />
    })

    render(<MistakeMatrixPanel stableId="player-1" visible={true} />)
    await waitFor(() => {
      expect(screen.getByTestId('range-matrix')).toBeTruthy()
    })

    // All MISTAKE_TAGS should appear in AKs group (deduped but all present)
    const aksGroup = capturedMistakeTags.get('AKs')
    expect(aksGroup).toBeDefined()
    for (const tag of MISTAKE_TAGS) {
      expect(aksGroup).toContain(tag)
    }
  })

  it('fetches the correct endpoint for given stableId', async () => {
    apiFetch.mockResolvedValue([])
    render(<MistakeMatrixPanel stableId="xyz-789" visible={true} />)
    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith('/api/players/xyz-789/hands')
    })
  })

  it('uses mistake_tags bucket in addition to auto_tags', async () => {
    const hands = [
      {
        hero_hole_cards: ['As', 'Ks'],
        auto_tags: [],
        mistake_tags: ['OPEN_LIMP'],  // mistake from analyzer
        coach_tags: [],
      },
    ]
    apiFetch.mockResolvedValue(hands)

    let capturedMistakeTags = null
    RangeMatrix.mockImplementation(({ mistakeTags }) => {
      capturedMistakeTags = mistakeTags
      return <div data-testid="range-matrix" />
    })

    render(<MistakeMatrixPanel stableId="player-1" visible={true} />)
    await waitFor(() => {
      expect(screen.getByTestId('range-matrix')).toBeTruthy()
    })

    // AKs group should appear in the heatmap since it has a mistake
    expect(capturedMistakeTags).toBeTruthy()
    const aksGroup = capturedMistakeTags.get('AKs')
    expect(aksGroup).toBeDefined()
    expect(aksGroup).toContain('OPEN_LIMP')
  })
})
