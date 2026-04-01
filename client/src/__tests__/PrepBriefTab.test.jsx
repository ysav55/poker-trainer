/**
 * PrepBriefTab.test.jsx
 *
 * Tests for the Session Prep Brief tab surface (POK-42):
 *  - Renders the tab container
 *  - Shows generated-at timestamp
 *  - Renders top leaks section with 3 entries
 *  - Renders stats snapshot table
 *  - Renders 5 flagged hands
 *  - Renders coach notes
 *  - Renders recent sessions table
 *  - Renders active alerts
 *  - Refresh button is present and clickable
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

import PrepBriefTab from '../pages/admin/PrepBriefTab.jsx';

const mockPlayer = { id: 'p1', display_name: 'Alex Kim' };

function renderTab() {
  return render(
    <MemoryRouter>
      <PrepBriefTab player={mockPlayer} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Rendering ─────────────────────────────────────────────────────────────────

describe('PrepBriefTab rendering', () => {
  it('renders the tab container', () => {
    renderTab();
    expect(screen.getByTestId('prep-brief-tab')).toBeTruthy();
  });

  it('shows a generated timestamp', () => {
    renderTab();
    expect(screen.getByText(/Generated/i)).toBeTruthy();
  });

  it('renders the refresh button', () => {
    renderTab();
    expect(screen.getByTestId('refresh-prep-brief')).toBeTruthy();
  });

  it('renders active alerts', () => {
    renderTab();
    expect(screen.getAllByTestId('alert-row').length).toBeGreaterThan(0);
  });

  it('renders 3 leak rows', () => {
    renderTab();
    expect(screen.getByTestId('leak-row-0')).toBeTruthy();
    expect(screen.getByTestId('leak-row-1')).toBeTruthy();
    expect(screen.getByTestId('leak-row-2')).toBeTruthy();
  });

  it('renders leak tags EQUITY_FOLD, COLD_CALL_3BET, OPEN_LIMP', () => {
    renderTab();
    expect(screen.getAllByText('EQUITY_FOLD').length).toBeGreaterThan(0);
    expect(screen.getAllByText('COLD_CALL_3BET').length).toBeGreaterThan(0);
    expect(screen.getAllByText('OPEN_LIMP').length).toBeGreaterThan(0);
  });

  it('renders stats snapshot table rows', () => {
    renderTab();
    expect(screen.getByTestId('stat-row-VPIP')).toBeTruthy();
    expect(screen.getByTestId('stat-row-PFR')).toBeTruthy();
    expect(screen.getByTestId('stat-row-3bet%')).toBeTruthy();
  });

  it('renders 5 flagged hand rows', () => {
    renderTab();
    for (let i = 0; i < 5; i++) {
      expect(screen.getByTestId(`flagged-hand-${i}`)).toBeTruthy();
    }
  });

  it('renders 2 coach notes', () => {
    renderTab();
    expect(screen.getByTestId('coach-note-0')).toBeTruthy();
    expect(screen.getByTestId('coach-note-1')).toBeTruthy();
  });

  it('renders 5 recent session rows', () => {
    renderTab();
    for (let i = 0; i < 5; i++) {
      expect(screen.getByTestId(`session-row-${i}`)).toBeTruthy();
    }
  });
});

// ── Interactions ──────────────────────────────────────────────────────────────

describe('PrepBriefTab interactions', () => {
  it('refresh button shows loading state when clicked', () => {
    renderTab();
    const btn = screen.getByTestId('refresh-prep-brief');
    fireEvent.click(btn);
    expect(btn.textContent).toMatch(/Refreshing/i);
  });
});
