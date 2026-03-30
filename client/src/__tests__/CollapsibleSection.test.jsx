/**
 * CollapsibleSection.test.jsx
 *
 * Tests for the CollapsibleSection accordion wrapper component.
 *
 * Component API:
 *   title        — string displayed in the header button
 *   defaultOpen  — bool (default: true); controls initial open state
 *   children     — content rendered when open
 *   headerExtra  — optional node rendered alongside the title button
 *   onToggle     — optional callback(isOpen: bool)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import CollapsibleSection from '../components/CollapsibleSection.jsx'

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderSection(props = {}) {
  const defaults = {
    title: 'TEST SECTION',
    defaultOpen: true,
    children: <div data-testid="section-content">Section content</div>,
  }
  return render(<CollapsibleSection {...defaults} {...props} />)
}

// ── Rendering ─────────────────────────────────────────────────────────────────

describe('CollapsibleSection — rendering', () => {
  it('renders the title', () => {
    renderSection({ title: 'MY SECTION' })
    expect(screen.getByText('MY SECTION')).toBeTruthy()
  })

  it('renders children when defaultOpen=true', () => {
    renderSection({ defaultOpen: true })
    expect(screen.getByTestId('section-content')).toBeTruthy()
  })

  it('does NOT render children when defaultOpen=false', () => {
    renderSection({ defaultOpen: false })
    expect(screen.queryByTestId('section-content')).toBeNull()
  })

  it('renders children text when open', () => {
    renderSection({ defaultOpen: true, children: <span>Hello world</span> })
    expect(screen.getByText('Hello world')).toBeTruthy()
  })
})

// ── Toggle behaviour ──────────────────────────────────────────────────────────

describe('CollapsibleSection — toggle behaviour', () => {
  it('clicking the header when open hides the content', () => {
    renderSection({ defaultOpen: true })
    expect(screen.getByTestId('section-content')).toBeTruthy()
    fireEvent.click(screen.getByText('TEST SECTION'))
    expect(screen.queryByTestId('section-content')).toBeNull()
  })

  it('clicking the header when closed shows the content', () => {
    renderSection({ defaultOpen: false })
    expect(screen.queryByTestId('section-content')).toBeNull()
    fireEvent.click(screen.getByText('TEST SECTION'))
    expect(screen.getByTestId('section-content')).toBeTruthy()
  })

  it('clicking the header twice returns to the original state (open -> closed -> open)', () => {
    renderSection({ defaultOpen: true })
    fireEvent.click(screen.getByText('TEST SECTION'))
    expect(screen.queryByTestId('section-content')).toBeNull()
    fireEvent.click(screen.getByText('TEST SECTION'))
    expect(screen.getByTestId('section-content')).toBeTruthy()
  })

  it('clicking the header twice returns to the original state (closed -> open -> closed)', () => {
    renderSection({ defaultOpen: false })
    fireEvent.click(screen.getByText('TEST SECTION'))
    expect(screen.getByTestId('section-content')).toBeTruthy()
    fireEvent.click(screen.getByText('TEST SECTION'))
    expect(screen.queryByTestId('section-content')).toBeNull()
  })
})

// ── onToggle callback ─────────────────────────────────────────────────────────

describe('CollapsibleSection — onToggle callback', () => {
  it('calls onToggle(false) when closing', () => {
    const onToggle = vi.fn()
    renderSection({ defaultOpen: true, onToggle })
    fireEvent.click(screen.getByText('TEST SECTION'))
    expect(onToggle).toHaveBeenCalledWith(false)
  })

  it('calls onToggle(true) when opening', () => {
    const onToggle = vi.fn()
    renderSection({ defaultOpen: false, onToggle })
    fireEvent.click(screen.getByText('TEST SECTION'))
    expect(onToggle).toHaveBeenCalledWith(true)
  })

  it('does not throw when onToggle is not provided', () => {
    expect(() => {
      renderSection({ onToggle: undefined })
      fireEvent.click(screen.getByText('TEST SECTION'))
    }).not.toThrow()
  })
})

// ── headerExtra ───────────────────────────────────────────────────────────────

describe('CollapsibleSection — headerExtra', () => {
  it('renders headerExtra alongside the title', () => {
    renderSection({
      headerExtra: <button data-testid="extra-btn">Extra</button>,
    })
    expect(screen.getByTestId('extra-btn')).toBeTruthy()
  })
})

// ── Multiple independent instances ────────────────────────────────────────────

describe('CollapsibleSection — independent instances', () => {
  it('two sections toggle independently', () => {
    render(
      <>
        <CollapsibleSection title="SECTION A" defaultOpen={true}>
          <div data-testid="content-a">Content A</div>
        </CollapsibleSection>
        <CollapsibleSection title="SECTION B" defaultOpen={true}>
          <div data-testid="content-b">Content B</div>
        </CollapsibleSection>
      </>
    )

    // Both visible initially
    expect(screen.getByTestId('content-a')).toBeTruthy()
    expect(screen.getByTestId('content-b')).toBeTruthy()

    // Close section A
    fireEvent.click(screen.getByText('SECTION A'))
    expect(screen.queryByTestId('content-a')).toBeNull()
    // Section B still open
    expect(screen.getByTestId('content-b')).toBeTruthy()

    // Close section B
    fireEvent.click(screen.getByText('SECTION B'))
    expect(screen.queryByTestId('content-b')).toBeNull()
    // Section A still closed
    expect(screen.queryByTestId('content-a')).toBeNull()

    // Reopen section A
    fireEvent.click(screen.getByText('SECTION A'))
    expect(screen.getByTestId('content-a')).toBeTruthy()
    // Section B still closed
    expect(screen.queryByTestId('content-b')).toBeNull()
  })

  it('a closed section does not affect an open section', () => {
    render(
      <>
        <CollapsibleSection title="OPEN SECTION" defaultOpen={true}>
          <div data-testid="open-content">Open</div>
        </CollapsibleSection>
        <CollapsibleSection title="CLOSED SECTION" defaultOpen={false}>
          <div data-testid="closed-content">Closed</div>
        </CollapsibleSection>
      </>
    )

    expect(screen.getByTestId('open-content')).toBeTruthy()
    expect(screen.queryByTestId('closed-content')).toBeNull()
  })
})
