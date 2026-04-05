/**
 * RangeMatrix.test.jsx
 *
 * Tests for the RangeMatrix component (wrapper around @holdem-poker-tools/hand-matrix).
 *
 * The HandMatrix library is mocked so tests exercise RangeMatrix's own logic:
 *   - The comboStyle callback passed to HandMatrix
 *   - onSelect wiring (readOnly=false passes a handler; readOnly=true passes undefined)
 *   - colorMode='selected': selected cells get green, unselected get transparent+opacity
 *   - colorMode='frequency': cells get amber tinted by frequency / 10
 *   - colorMode='mistake': cells with mistake tags get red; clean cells get transparent
 *   - highlightHand: target hand group gets blue in both 'selected' and 'mistake' modes
 *   - onToggle is called with the correct hand group when a cell is clicked
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'

// ── Mock @holdem-poker-tools/hand-matrix ──────────────────────────────────────
//
// The mock captures the last comboStyle / onSelect props so individual tests
// can invoke comboStyle(combo) directly and inspect what RangeMatrix computed.

let capturedComboStyle = null
let capturedOnSelect = null

vi.mock('@holdem-poker-tools/hand-matrix', () => ({
  HandMatrix: ({ comboStyle, onSelect }) => {
    // Capture for use in assertions
    capturedComboStyle = comboStyle
    capturedOnSelect = onSelect

    // Render a handful of representative cells so click tests work
    const testCombos = ['AA', 'AKs', 'AKo', 'TT', 'QJs']
    return (
      <div data-testid="hand-matrix">
        {testCombos.map((combo) => (
          <button
            key={combo}
            data-testid={`cell-${combo}`}
            onClick={() => onSelect?.(combo)}
            style={comboStyle?.(combo) ?? {}}
          >
            {combo}
          </button>
        ))}
      </div>
    )
  },
}))

import { RangeMatrix } from '../components/RangeMatrix.jsx'

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderMatrix(props = {}) {
  const defaults = {
    selected: new Set(),
    onToggle: vi.fn(),
    readOnly: false,
    colorMode: 'selected',
    frequencies: new Map(),
    mistakeTags: new Map(),
    highlightHand: undefined,
  }
  return render(<RangeMatrix {...defaults} {...props} />)
}

beforeEach(() => {
  capturedComboStyle = null
  capturedOnSelect = null
})

// ── Basic render ──────────────────────────────────────────────────────────────

describe('RangeMatrix — basic render', () => {
  it('renders without crashing', () => {
    renderMatrix()
    expect(screen.getByTestId('hand-matrix')).toBeTruthy()
  })

  it('renders the HandMatrix mock', () => {
    renderMatrix()
    expect(screen.getByTestId('hand-matrix')).toBeTruthy()
  })

  it('wraps HandMatrix in a div with width 100%', () => {
    const { container } = renderMatrix()
    const wrapper = container.firstChild
    expect(wrapper.tagName).toBe('DIV')
    expect(wrapper.style.width).toBe('100%')
  })
})

// ── colorMode='selected' ──────────────────────────────────────────────────────

describe('RangeMatrix — colorMode=selected', () => {
  it('selected combo gets green background (#22c55e)', () => {
    renderMatrix({ selected: new Set(['AA']), colorMode: 'selected' })
    const style = capturedComboStyle('AA')
    expect(style.backgroundColor).toBe('#22c55e')
  })

  it('selected combo gets white text color', () => {
    renderMatrix({ selected: new Set(['AA']), colorMode: 'selected' })
    const style = capturedComboStyle('AA')
    expect(style.color).toBe('#fff')
  })

  it('selected combo has opacity=1', () => {
    renderMatrix({ selected: new Set(['AA']), colorMode: 'selected' })
    const style = capturedComboStyle('AA')
    expect(style.opacity).toBe(1)
  })

  it('unselected combo gets transparent background', () => {
    renderMatrix({ selected: new Set(), colorMode: 'selected' })
    const style = capturedComboStyle('AKs')
    expect(style.backgroundColor).toBe('transparent')
  })

  it('unselected combo has opacity=0.3', () => {
    renderMatrix({ selected: new Set(), colorMode: 'selected' })
    const style = capturedComboStyle('AKs')
    expect(style.opacity).toBe(0.3)
  })

  it('unselected combo has undefined color (no forced color)', () => {
    renderMatrix({ selected: new Set(), colorMode: 'selected' })
    const style = capturedComboStyle('AKs')
    expect(style.color).toBeUndefined()
  })

  it('when selected is undefined, combo is treated as not selected', () => {
    renderMatrix({ selected: undefined, colorMode: 'selected' })
    const style = capturedComboStyle('AA')
    expect(style.backgroundColor).toBe('transparent')
    expect(style.opacity).toBe(0.3)
  })
})

// ── colorMode='selected' + highlightHand ──────────────────────────────────────

describe('RangeMatrix — colorMode=selected + highlightHand', () => {
  it('highlightHand combo gets blue background (#3b82f6)', () => {
    renderMatrix({ selected: new Set(), colorMode: 'selected', highlightHand: 'AKs' })
    const style = capturedComboStyle('AKs')
    expect(style.backgroundColor).toBe('#3b82f6')
  })

  it('highlightHand combo gets white text', () => {
    renderMatrix({ selected: new Set(), colorMode: 'selected', highlightHand: 'AKs' })
    const style = capturedComboStyle('AKs')
    expect(style.color).toBe('#fff')
  })

  it('highlighted combo overrides selected styling (highlight takes priority)', () => {
    // AKs is both selected AND highlighted
    renderMatrix({ selected: new Set(['AKs']), colorMode: 'selected', highlightHand: 'AKs' })
    const style = capturedComboStyle('AKs')
    // Highlight check happens before selected check in the code
    expect(style.backgroundColor).toBe('#3b82f6')
  })

  it('non-highlighted combo is still styled normally', () => {
    renderMatrix({ selected: new Set(['AA']), colorMode: 'selected', highlightHand: 'AKs' })
    const style = capturedComboStyle('AA')
    expect(style.backgroundColor).toBe('#22c55e') // selected green, not blue
  })
})

// ── colorMode='frequency' ─────────────────────────────────────────────────────

describe('RangeMatrix — colorMode=frequency', () => {
  it('combo with no frequency entry gets rgba with intensity 0', () => {
    renderMatrix({ colorMode: 'frequency', frequencies: new Map() })
    const style = capturedComboStyle('AA')
    expect(style.backgroundColor).toBe('rgba(212,175,55,0.00)')
  })

  it('combo with frequency=10 gets full intensity (1.00)', () => {
    renderMatrix({ colorMode: 'frequency', frequencies: new Map([['AA', 10]]) })
    const style = capturedComboStyle('AA')
    expect(style.backgroundColor).toBe('rgba(212,175,55,1.00)')
  })

  it('combo with frequency=5 gets half intensity (0.50)', () => {
    renderMatrix({ colorMode: 'frequency', frequencies: new Map([['AA', 5]]) })
    const style = capturedComboStyle('AA')
    expect(style.backgroundColor).toBe('rgba(212,175,55,0.50)')
  })

  it('combo with frequency>10 is capped at 1.00 intensity', () => {
    renderMatrix({ colorMode: 'frequency', frequencies: new Map([['AA', 20]]) })
    const style = capturedComboStyle('AA')
    expect(style.backgroundColor).toBe('rgba(212,175,55,1.00)')
  })

  it('combo with frequency=1 gets 0.10 intensity', () => {
    renderMatrix({ colorMode: 'frequency', frequencies: new Map([['AA', 1]]) })
    const style = capturedComboStyle('AA')
    expect(style.backgroundColor).toBe('rgba(212,175,55,0.10)')
  })

  it('when frequencies is undefined, combo gets 0 intensity', () => {
    renderMatrix({ colorMode: 'frequency', frequencies: undefined })
    const style = capturedComboStyle('AA')
    expect(style.backgroundColor).toBe('rgba(212,175,55,0.00)')
  })
})

// ── colorMode='mistake' ───────────────────────────────────────────────────────

describe('RangeMatrix — colorMode=mistake', () => {
  it('combo with mistake tags gets red background (#ef4444)', () => {
    renderMatrix({
      colorMode: 'mistake',
      mistakeTags: new Map([['AA', ['OPEN_LIMP', 'MIN_RAISE']]]),
    })
    const style = capturedComboStyle('AA')
    expect(style.backgroundColor).toBe('#ef4444')
  })

  it('combo with mistake tags has opacity=1', () => {
    renderMatrix({
      colorMode: 'mistake',
      mistakeTags: new Map([['AA', ['OPEN_LIMP']]]),
    })
    const style = capturedComboStyle('AA')
    expect(style.opacity).toBe(1)
  })

  it('combo with no mistake tags gets transparent background', () => {
    renderMatrix({ colorMode: 'mistake', mistakeTags: new Map() })
    const style = capturedComboStyle('AKs')
    expect(style.backgroundColor).toBe('transparent')
  })

  it('combo with no mistake tags has opacity=0.2', () => {
    renderMatrix({ colorMode: 'mistake', mistakeTags: new Map() })
    const style = capturedComboStyle('AKs')
    expect(style.opacity).toBe(0.2)
  })

  it('combo with empty tags array is treated as clean (no mistakes)', () => {
    renderMatrix({ colorMode: 'mistake', mistakeTags: new Map([['AA', []]]) })
    const style = capturedComboStyle('AA')
    expect(style.backgroundColor).toBe('transparent')
    expect(style.opacity).toBe(0.2)
  })

  it('when mistakeTags is undefined, combo is treated as clean', () => {
    renderMatrix({ colorMode: 'mistake', mistakeTags: undefined })
    const style = capturedComboStyle('AA')
    expect(style.backgroundColor).toBe('transparent')
  })
})

// ── colorMode='mistake' + highlightHand ───────────────────────────────────────

describe('RangeMatrix — colorMode=mistake + highlightHand', () => {
  it('highlightHand combo gets blue (#3b82f6) even if it has mistake tags', () => {
    renderMatrix({
      colorMode: 'mistake',
      mistakeTags: new Map([['AKs', ['OPEN_LIMP']]]),
      highlightHand: 'AKs',
    })
    const style = capturedComboStyle('AKs')
    expect(style.backgroundColor).toBe('#3b82f6')
    expect(style.color).toBe('#fff')
  })

  it('non-highlighted combo with mistakes still gets red', () => {
    renderMatrix({
      colorMode: 'mistake',
      mistakeTags: new Map([['AA', ['OPEN_LIMP']]]),
      highlightHand: 'AKs',
    })
    const style = capturedComboStyle('AA')
    expect(style.backgroundColor).toBe('#ef4444')
  })
})

// ── readOnly prop ─────────────────────────────────────────────────────────────
//
// RangeMatrix uses pointer events (onPointerDown/Move/Up) for drag-select, so
// onSelect is always passed as undefined to HandMatrix regardless of readOnly.
// Interaction capability is controlled by whether the pointer handlers are wired.

describe('RangeMatrix — readOnly prop', () => {
  it('always passes undefined as onSelect to HandMatrix (pointer events used instead)', () => {
    renderMatrix({ readOnly: false, onToggle: vi.fn() })
    // onSelect is intentionally undefined — drag-select uses onPointerDown/Move
    expect(capturedOnSelect).toBeUndefined()
  })

  it('passes undefined as onSelect to HandMatrix when readOnly=true', () => {
    renderMatrix({ readOnly: true, onToggle: vi.fn() })
    expect(capturedOnSelect).toBeUndefined()
  })
})

// ── onToggle interaction ──────────────────────────────────────────────────────
//
// Drag-select relies on document.elementsFromPoint which jsdom does not
// implement. Tests mock it so pointerdown events trigger onToggle correctly.

describe('RangeMatrix — onToggle interaction', () => {
  // Helper: stub jsdom's missing pointer-capture API and elementsFromPoint,
  // then fire pointerdown on the RangeMatrix container div.
  function firePointerDownOverCell(cellTestId) {
    const cellEl = screen.getByTestId(cellTestId)
    document.elementsFromPoint = vi.fn(() => [cellEl])
    const container = screen.getByTestId('hand-matrix').parentElement
    // jsdom doesn't implement setPointerCapture — stub it so the handler runs
    container.setPointerCapture = vi.fn()
    fireEvent.pointerDown(container, { clientX: 10, clientY: 10, pointerId: 1 })
  }

  it('calls onToggle with the combo when pointerdown over a cell (readOnly=false)', () => {
    const onToggle = vi.fn()
    renderMatrix({ readOnly: false, onToggle, selected: new Set() })
    firePointerDownOverCell('cell-AA')
    expect(onToggle).toHaveBeenCalledWith('AA')
  })

  it('does not call onToggle when readOnly=true (pointer handlers not attached)', () => {
    const onToggle = vi.fn()
    renderMatrix({ readOnly: true, onToggle })
    firePointerDownOverCell('cell-AA')
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('calls onToggle with "AKs" when pointerdown over AKs cell (readOnly=false)', () => {
    const onToggle = vi.fn()
    renderMatrix({ readOnly: false, onToggle, selected: new Set() })
    firePointerDownOverCell('cell-AKs')
    expect(onToggle).toHaveBeenCalledWith('AKs')
  })

  it('does not throw when onToggle is undefined (optional chaining)', () => {
    renderMatrix({ readOnly: false, onToggle: undefined })
    expect(() => firePointerDownOverCell('cell-AA')).not.toThrow()
  })
})

// ── Unknown / fallback colorMode ──────────────────────────────────────────────

describe('RangeMatrix — unknown colorMode', () => {
  it('returns an empty style object for an unrecognised colorMode', () => {
    renderMatrix({ colorMode: 'unknown-mode' })
    const style = capturedComboStyle('AA')
    expect(style).toEqual({})
  })
})
