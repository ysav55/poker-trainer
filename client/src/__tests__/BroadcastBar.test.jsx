/**
 * BroadcastBar.test.jsx
 *
 * Tests for BroadcastBar — the coach-only broadcast control bar
 * shown at the top of the multi-table view.
 *
 * Real component behaviour:
 *   - Returns null when hasPermission('table:manage') is false
 *   - Renders "Broadcast" label + 4 action buttons when permission is held
 *   - Each button calls emitAll(event) which calls ref.current.emit(event)
 *     on every socketRef in the tableRefs array
 *
 * useAuth is mocked to control hasPermission.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'

// ── Mock AuthContext ───────────────────────────────────────────────────────────

vi.mock('../contexts/AuthContext', () => ({
  AuthProvider: ({ children }) => children,
  useAuth: vi.fn(),
}))

import { useAuth } from '../contexts/AuthContext'
import BroadcastBar from '../components/BroadcastBar.jsx'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFakeRef(emitFn = vi.fn()) {
  return { current: { emit: emitFn } }
}

function renderBar(hasManage = true, tableRefs = []) {
  useAuth.mockReturnValue({
    hasPermission: (perm) => perm === 'table:manage' ? hasManage : false,
  })
  return render(<BroadcastBar tableRefs={tableRefs} />)
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ── Visibility guard ──────────────────────────────────────────────────────────

describe('BroadcastBar — visibility guard', () => {
  it('renders nothing when user lacks table:manage permission', () => {
    const { container } = renderBar(false)
    expect(container.firstChild).toBeNull()
  })

  it('renders the bar when user has table:manage permission', () => {
    renderBar(true)
    expect(screen.getByText('Broadcast')).toBeTruthy()
  })
})

// ── Button rendering ──────────────────────────────────────────────────────────

describe('BroadcastBar — buttons', () => {
  it('renders "Start All" button', () => {
    renderBar(true)
    expect(screen.getByText('Start All')).toBeTruthy()
  })

  it('renders "Reset All" button', () => {
    renderBar(true)
    expect(screen.getByText('Reset All')).toBeTruthy()
  })

  it('renders "Pause All" button', () => {
    renderBar(true)
    expect(screen.getByText('Pause All')).toBeTruthy()
  })

  it('renders "Advance All" button', () => {
    renderBar(true)
    expect(screen.getByText('Advance All')).toBeTruthy()
  })
})

// ── Button emit behaviour ─────────────────────────────────────────────────────

describe('BroadcastBar — emit calls', () => {
  it('"Start All" emits start_game on each ref', () => {
    const emit1 = vi.fn()
    const emit2 = vi.fn()
    renderBar(true, [makeFakeRef(emit1), makeFakeRef(emit2)])
    fireEvent.click(screen.getByText('Start All'))
    expect(emit1).toHaveBeenCalledWith('start_game')
    expect(emit2).toHaveBeenCalledWith('start_game')
  })

  it('"Reset All" emits reset_hand on each ref', () => {
    const emit1 = vi.fn()
    renderBar(true, [makeFakeRef(emit1)])
    fireEvent.click(screen.getByText('Reset All'))
    expect(emit1).toHaveBeenCalledWith('reset_hand')
  })

  it('"Pause All" emits toggle_pause on each ref', () => {
    const emit1 = vi.fn()
    renderBar(true, [makeFakeRef(emit1)])
    fireEvent.click(screen.getByText('Pause All'))
    expect(emit1).toHaveBeenCalledWith('toggle_pause')
  })

  it('"Advance All" emits force_next_street on each ref', () => {
    const emit1 = vi.fn()
    renderBar(true, [makeFakeRef(emit1)])
    fireEvent.click(screen.getByText('Advance All'))
    expect(emit1).toHaveBeenCalledWith('force_next_street')
  })

  it('emits to all refs, not just the first', () => {
    const emits = [vi.fn(), vi.fn(), vi.fn()]
    const refs = emits.map((fn) => makeFakeRef(fn))
    renderBar(true, refs)
    fireEvent.click(screen.getByText('Pause All'))
    emits.forEach((fn) => {
      expect(fn).toHaveBeenCalledWith('toggle_pause')
    })
  })
})

// ── Empty / null tableRefs ────────────────────────────────────────────────────

describe('BroadcastBar — no tableRefs', () => {
  it('renders without crashing when tableRefs is empty', () => {
    expect(() => renderBar(true, [])).not.toThrow()
    expect(screen.getByText('Broadcast')).toBeTruthy()
  })

  it('clicking a button with no refs does not throw', () => {
    renderBar(true, [])
    expect(() => fireEvent.click(screen.getByText('Start All'))).not.toThrow()
  })

  it('does not crash when a ref has no current (null socket)', () => {
    // ref.current is null — emitAll guards against this via optional chaining
    const nullRef = { current: null }
    renderBar(true, [nullRef])
    expect(() => fireEvent.click(screen.getByText('Start All'))).not.toThrow()
  })
})
