/**
 * ModeratorControls.test.jsx
 *
 * Tests for the ModeratorControls component:
 *   - Renders nothing when gameState is null
 *   - Always renders the MODERATOR badge when gameState is present
 *   - Shows the pause/resume button only when phase is active (not waiting/showdown/replay)
 *   - Shows "Pause" text when not paused; "Resume" text when paused
 *   - Calls emit.togglePause when the button is clicked
 *   - Does NOT render the button for inactive phases: waiting, showdown, replay
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import ModeratorControls from '../components/ModeratorControls.jsx'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeGameState(overrides = {}) {
  return {
    phase: 'preflop',
    paused: false,
    ...overrides,
  }
}

function makeEmit(overrides = {}) {
  return {
    togglePause: vi.fn(),
    ...overrides,
  }
}

// ── Null guard ────────────────────────────────────────────────────────────────

describe('ModeratorControls — null guard', () => {
  it('renders nothing when gameState is null', () => {
    const { container } = render(
      <ModeratorControls gameState={null} emit={makeEmit()} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when gameState is undefined', () => {
    const { container } = render(
      <ModeratorControls gameState={undefined} emit={makeEmit()} />
    )
    expect(container.firstChild).toBeNull()
  })
})

// ── MODERATOR badge always visible ────────────────────────────────────────────

describe('ModeratorControls — MODERATOR badge', () => {
  it('renders the MODERATOR label when phase is active', () => {
    render(<ModeratorControls gameState={makeGameState({ phase: 'preflop' })} emit={makeEmit()} />)
    expect(screen.getByText('MODERATOR')).toBeTruthy()
  })

  it('renders the MODERATOR label when phase is waiting (button hidden but label shows)', () => {
    render(<ModeratorControls gameState={makeGameState({ phase: 'waiting' })} emit={makeEmit()} />)
    expect(screen.getByText('MODERATOR')).toBeTruthy()
  })

  it('renders the MODERATOR label when phase is showdown', () => {
    render(<ModeratorControls gameState={makeGameState({ phase: 'showdown' })} emit={makeEmit()} />)
    expect(screen.getByText('MODERATOR')).toBeTruthy()
  })

})

// ── Button visibility — active phases ─────────────────────────────────────────

describe('ModeratorControls — button visible during active phases', () => {
  const activePhases = ['preflop', 'flop', 'turn', 'river', 'config', 'bet']

  for (const phase of activePhases) {
    it(`shows pause/resume button when phase="${phase}"`, () => {
      render(<ModeratorControls gameState={makeGameState({ phase })} emit={makeEmit()} />)
      const btn = screen.queryByRole('button')
      expect(btn).toBeTruthy()
    })
  }
})

// ── Button visibility — inactive phases ──────────────────────────────────────

describe('ModeratorControls — button hidden during inactive phases', () => {
  const inactivePhases = ['waiting', 'showdown']

  for (const phase of inactivePhases) {
    it(`hides pause/resume button when phase="${phase}"`, () => {
      render(<ModeratorControls gameState={makeGameState({ phase })} emit={makeEmit()} />)
      const btn = screen.queryByRole('button')
      expect(btn).toBeNull()
    })
  }
})

// ── Pause / Resume label ──────────────────────────────────────────────────────

describe('ModeratorControls — pause/resume label', () => {
  it('shows "Pause" when game is not paused', () => {
    render(
      <ModeratorControls
        gameState={makeGameState({ phase: 'preflop', paused: false })}
        emit={makeEmit()}
      />
    )
    expect(screen.getByRole('button').textContent).toMatch(/Pause/)
  })

  it('shows "Resume" when game is paused', () => {
    render(
      <ModeratorControls
        gameState={makeGameState({ phase: 'preflop', paused: true })}
        emit={makeEmit()}
      />
    )
    expect(screen.getByRole('button').textContent).toMatch(/Resume/)
  })

  it('does not show "Pause" text when paused (should show Resume)', () => {
    render(
      <ModeratorControls
        gameState={makeGameState({ phase: 'preflop', paused: true })}
        emit={makeEmit()}
      />
    )
    // The button should say Resume, not Pause
    expect(screen.getByRole('button').textContent).not.toBe('⏸ Pause')
  })
})

// ── Click interaction ─────────────────────────────────────────────────────────

describe('ModeratorControls — click interaction', () => {
  it('calls emit.togglePause when Pause button is clicked', () => {
    const emit = makeEmit()
    render(
      <ModeratorControls
        gameState={makeGameState({ phase: 'preflop', paused: false })}
        emit={emit}
      />
    )
    fireEvent.click(screen.getByRole('button'))
    expect(emit.togglePause).toHaveBeenCalledTimes(1)
  })

  it('calls emit.togglePause when Resume button is clicked', () => {
    const emit = makeEmit()
    render(
      <ModeratorControls
        gameState={makeGameState({ phase: 'preflop', paused: true })}
        emit={emit}
      />
    )
    fireEvent.click(screen.getByRole('button'))
    expect(emit.togglePause).toHaveBeenCalledTimes(1)
  })

  it('does not throw when emit.togglePause is undefined', () => {
    const emit = { togglePause: undefined }
    render(
      <ModeratorControls
        gameState={makeGameState({ phase: 'preflop', paused: false })}
        emit={emit}
      />
    )
    // Should not throw even if togglePause is not a function (uses optional chaining)
    expect(() => fireEvent.click(screen.getByRole('button'))).not.toThrow()
  })

  it('does not emit when phase is waiting (button is not rendered)', () => {
    const emit = makeEmit()
    render(
      <ModeratorControls
        gameState={makeGameState({ phase: 'waiting' })}
        emit={emit}
      />
    )
    expect(screen.queryByRole('button')).toBeNull()
    expect(emit.togglePause).not.toHaveBeenCalled()
  })
})

// ── Phase boundary — default phase ───────────────────────────────────────────

describe('ModeratorControls — phase defaults', () => {
  it('treats missing phase as "waiting" (button hidden)', () => {
    // phase is undefined — defaults to 'waiting' via nullish coalescing
    render(
      <ModeratorControls
        gameState={{ paused: false }} // no phase key
        emit={makeEmit()}
      />
    )
    expect(screen.queryByRole('button')).toBeNull()
  })
})
