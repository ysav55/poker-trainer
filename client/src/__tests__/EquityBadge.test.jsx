/**
 * EquityBadge.test.jsx
 *
 * Tests for the EquityBadge component:
 *   - Renders nothing when visible=false or equity is null/undefined
 *   - Renders the equity percentage when visible=true
 *   - Applies the correct color for the three thresholds:
 *       equity > 55  → green  (#22c55e)
 *       equity 40-55 → amber  (#f59e0b)
 *       equity < 40  → red    (#ef4444)
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { EquityBadge } from '../components/EquityBadge.jsx'

// ── Visibility guards ─────────────────────────────────────────────────────────

describe('EquityBadge — visibility guards', () => {
  it('renders nothing when visible is false', () => {
    const { container } = render(<EquityBadge equity={60} visible={false} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when equity is null', () => {
    const { container } = render(<EquityBadge equity={null} visible={true} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when equity is undefined', () => {
    const { container } = render(<EquityBadge equity={undefined} visible={true} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when both visible=false and equity=null', () => {
    const { container } = render(<EquityBadge equity={null} visible={false} />)
    expect(container.firstChild).toBeNull()
  })
})

// ── Renders the equity percentage ─────────────────────────────────────────────

describe('EquityBadge — renders percentage text', () => {
  it('renders "60%" when equity=60 and visible=true', () => {
    render(<EquityBadge equity={60} visible={true} />)
    expect(screen.getByText('60%')).toBeTruthy()
  })

  it('renders "45%" when equity=45 and visible=true', () => {
    render(<EquityBadge equity={45} visible={true} />)
    expect(screen.getByText('45%')).toBeTruthy()
  })

  it('renders "30%" when equity=30 and visible=true', () => {
    render(<EquityBadge equity={30} visible={true} />)
    expect(screen.getByText('30%')).toBeTruthy()
  })

  it('renders "0%" when equity=0', () => {
    render(<EquityBadge equity={0} visible={true} />)
    expect(screen.getByText('0%')).toBeTruthy()
  })

  it('renders "100%" when equity=100', () => {
    render(<EquityBadge equity={100} visible={true} />)
    expect(screen.getByText('100%')).toBeTruthy()
  })
})

// ── Color thresholds ──────────────────────────────────────────────────────────

describe('EquityBadge — color thresholds', () => {
  // Helper: get the color style from the rendered span
  function getSpanColor(container) {
    const span = container.querySelector('span')
    return span?.style?.color ?? ''
  }

  it('uses green (#22c55e) when equity > 55 (equity=56)', () => {
    const { container } = render(<EquityBadge equity={56} visible={true} />)
    expect(getSpanColor(container)).toBe('rgb(34, 197, 94)')
  })

  it('uses green (#22c55e) when equity = 100', () => {
    const { container } = render(<EquityBadge equity={100} visible={true} />)
    expect(getSpanColor(container)).toBe('rgb(34, 197, 94)')
  })

  it('uses green (#22c55e) at the boundary equity=56', () => {
    const { container } = render(<EquityBadge equity={56} visible={true} />)
    expect(getSpanColor(container)).toBe('rgb(34, 197, 94)')
  })

  it('uses amber (#f59e0b) when equity = 55 (boundary — not > 55)', () => {
    const { container } = render(<EquityBadge equity={55} visible={true} />)
    expect(getSpanColor(container)).toBe('rgb(245, 158, 11)')
  })

  it('uses amber (#f59e0b) when equity = 45 (mid-range)', () => {
    const { container } = render(<EquityBadge equity={45} visible={true} />)
    expect(getSpanColor(container)).toBe('rgb(245, 158, 11)')
  })

  it('uses amber (#f59e0b) when equity = 41 (just above lower bound)', () => {
    const { container } = render(<EquityBadge equity={41} visible={true} />)
    expect(getSpanColor(container)).toBe('rgb(245, 158, 11)')
  })

  it('uses red (#ef4444) when equity = 40 (boundary — not > 40)', () => {
    const { container } = render(<EquityBadge equity={40} visible={true} />)
    expect(getSpanColor(container)).toBe('rgb(239, 68, 68)')
  })

  it('uses red (#ef4444) when equity = 20', () => {
    const { container } = render(<EquityBadge equity={20} visible={true} />)
    expect(getSpanColor(container)).toBe('rgb(239, 68, 68)')
  })

  it('uses red (#ef4444) when equity = 0', () => {
    const { container } = render(<EquityBadge equity={0} visible={true} />)
    expect(getSpanColor(container)).toBe('rgb(239, 68, 68)')
  })

  it('uses red (#ef4444) when equity = 1', () => {
    const { container } = render(<EquityBadge equity={1} visible={true} />)
    expect(getSpanColor(container)).toBe('rgb(239, 68, 68)')
  })
})

// ── DOM structure ─────────────────────────────────────────────────────────────

describe('EquityBadge — DOM structure', () => {
  it('renders an outer div with position absolute', () => {
    const { container } = render(<EquityBadge equity={60} visible={true} />)
    const div = container.firstChild
    expect(div.tagName).toBe('DIV')
    expect(div.style.position).toBe('absolute')
  })

  it('renders a span with monospace font inside the outer div', () => {
    const { container } = render(<EquityBadge equity={60} visible={true} />)
    const span = container.querySelector('span')
    expect(span).toBeTruthy()
    expect(span.style.fontFamily).toBe('monospace')
  })

  it('has pointerEvents none (badge should not intercept clicks)', () => {
    const { container } = render(<EquityBadge equity={60} visible={true} />)
    const div = container.firstChild
    expect(div.style.pointerEvents).toBe('none')
  })
})
