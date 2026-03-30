/**
 * SharedRangeOverlay.test.jsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
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

import { SharedRangeOverlay } from '../components/SharedRangeOverlay'
import { RangeMatrix } from '../components/RangeMatrix'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('SharedRangeOverlay', () => {
  it('returns null when sharedRange is null', () => {
    const { container } = render(
      <SharedRangeOverlay sharedRange={null} gamePhase="preflop" />
    )
    expect(container.firstChild).toBeNull()
  })

  it('returns null when dismissed by clicking ✕', () => {
    const range = { handGroups: ['AKs', 'QQ'], label: 'UTG Open', sharedBy: 'Coach' }
    const { container } = render(
      <SharedRangeOverlay sharedRange={range} gamePhase="preflop" />
    )
    expect(screen.getByTestId('range-matrix')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Dismiss shared range'))
    expect(container.firstChild).toBeNull()
  })

  it('re-shows when sharedRange changes (new reference) after dismiss', () => {
    const range1 = { handGroups: ['AKs'], label: 'Range 1' }
    const { container, rerender } = render(
      <SharedRangeOverlay sharedRange={range1} gamePhase="preflop" />
    )
    // Dismiss
    fireEvent.click(screen.getByLabelText('Dismiss shared range'))
    expect(container.firstChild).toBeNull()

    // New range reference → should re-show
    const range2 = { handGroups: ['QQ'], label: 'Range 2' }
    rerender(<SharedRangeOverlay sharedRange={range2} gamePhase="preflop" />)
    expect(screen.getByTestId('range-matrix')).toBeTruthy()
  })

  it('shows label from sharedRange.label', () => {
    const range = { handGroups: ['AKs'], label: 'Squeeze Range' }
    render(<SharedRangeOverlay sharedRange={range} gamePhase="preflop" />)
    expect(screen.getByText('Squeeze Range')).toBeTruthy()
  })

  it('shows "Shared by [name]" when sharedRange.sharedBy is set', () => {
    const range = { handGroups: ['AA'], label: 'My Range', sharedBy: 'Alice' }
    render(<SharedRangeOverlay sharedRange={range} gamePhase="flop" />)
    expect(screen.getByText('Shared by Alice')).toBeTruthy()
  })

  it('does NOT show "Shared by" text when sharedBy is absent', () => {
    const range = { handGroups: ['AA'], label: 'My Range' }
    render(<SharedRangeOverlay sharedRange={range} gamePhase="flop" />)
    expect(screen.queryByText(/Shared by/)).toBeNull()
  })

  it('shows "Warmup" badge when gamePhase === "waiting"', () => {
    const range = { handGroups: ['AA'], label: 'Warmup Range' }
    render(<SharedRangeOverlay sharedRange={range} gamePhase="waiting" />)
    expect(screen.getByText('Warmup')).toBeTruthy()
  })

  it('does NOT show "Warmup" badge when gamePhase is not "waiting"', () => {
    const range = { handGroups: ['AA'], label: 'Range' }
    render(<SharedRangeOverlay sharedRange={range} gamePhase="preflop" />)
    expect(screen.queryByText('Warmup')).toBeNull()
  })

  it('does NOT show "Warmup" badge when gamePhase is "flop"', () => {
    const range = { handGroups: ['AKs'], label: 'Range' }
    render(<SharedRangeOverlay sharedRange={range} gamePhase="flop" />)
    expect(screen.queryByText('Warmup')).toBeNull()
  })

  it('passes selected={Set(handGroups)} as a Set to RangeMatrix', () => {
    const range = { handGroups: ['AKs', 'QQ', 'JJ'], label: 'Test' }
    render(<SharedRangeOverlay sharedRange={range} gamePhase="preflop" />)
    const matrix = screen.getByTestId('range-matrix')
    const selectedAttr = matrix.getAttribute('data-selected')
    const items = selectedAttr.split(',')
    expect(items).toContain('AKs')
    expect(items).toContain('QQ')
    expect(items).toContain('JJ')
    expect(items.length).toBe(3)
  })

  it('shows hand group count below matrix — "3 hand groups" (plural)', () => {
    const range = { handGroups: ['AKs', 'QQ', 'JJ'], label: 'Test' }
    render(<SharedRangeOverlay sharedRange={range} gamePhase="preflop" />)
    expect(screen.getByText('3 hand groups')).toBeTruthy()
  })

  it('shows "1 hand group" (singular) when exactly 1', () => {
    const range = { handGroups: ['AA'], label: 'Single' }
    render(<SharedRangeOverlay sharedRange={range} gamePhase="preflop" />)
    expect(screen.getByText('1 hand group')).toBeTruthy()
  })

  it('shows "0 hand groups" when handGroups is empty', () => {
    const range = { handGroups: [], label: 'Empty' }
    render(<SharedRangeOverlay sharedRange={range} gamePhase="preflop" />)
    expect(screen.getByText('0 hand groups')).toBeTruthy()
  })

  it('RangeMatrix receives colorMode="selected"', () => {
    const range = { handGroups: ['AA'], label: 'Test' }
    render(<SharedRangeOverlay sharedRange={range} gamePhase="preflop" />)
    const matrix = screen.getByTestId('range-matrix')
    expect(matrix.getAttribute('data-mode')).toBe('selected')
  })

  it('RangeMatrix receives readOnly={true}', () => {
    const range = { handGroups: ['AA'], label: 'Test' }
    render(<SharedRangeOverlay sharedRange={range} gamePhase="preflop" />)
    const matrix = screen.getByTestId('range-matrix')
    expect(matrix.getAttribute('data-readonly')).toBe('true')
  })
})
