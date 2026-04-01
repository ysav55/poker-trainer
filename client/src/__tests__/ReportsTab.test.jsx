/**
 * ReportsTab.test.jsx
 *
 * Tests for the Progress Reports tab surface (POK-42):
 *  - Renders the reports list with mock report cards
 *  - Each card shows period, grade, session/hands/net data
 *  - Clicking a card shows the report detail view
 *  - Report detail shows grade prominently
 *  - Report detail shows stat changes table
 *  - Report detail shows mistake trends
 *  - Report detail shows leak evolution
 *  - Report detail shows key hands
 *  - Back button returns to the list view
 *  - Share with Student button is present
 *  - Previous/Next week navigation buttons are present
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

import ReportsTab from '../pages/admin/ReportsTab.jsx';

const mockPlayer = { id: 'p1', display_name: 'Alex Kim' };

function renderTab() {
  return render(
    <MemoryRouter>
      <ReportsTab player={mockPlayer} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── List view ─────────────────────────────────────────────────────────────────

describe('ReportsTab list view', () => {
  it('renders the reports tab container', () => {
    renderTab();
    expect(screen.getByTestId('reports-tab')).toBeTruthy();
  });

  it('renders mock report cards', () => {
    renderTab();
    expect(screen.getByTestId('report-card-r1')).toBeTruthy();
    expect(screen.getByTestId('report-card-r2')).toBeTruthy();
  });

  it('report card shows period label', () => {
    renderTab();
    expect(screen.getAllByText('Week of Mar 24–30, 2026').length).toBeGreaterThan(0);
  });

  it('report card shows grade', () => {
    renderTab();
    expect(screen.getByText('72')).toBeTruthy();
  });

  it('renders Previous week button', () => {
    renderTab();
    expect(screen.getByTestId('prev-week')).toBeTruthy();
  });

  it('renders Next week button (disabled at offset 0)', () => {
    renderTab();
    const btn = screen.getByTestId('next-week');
    expect(btn).toBeTruthy();
    expect(btn.disabled).toBe(true);
  });

  it('renders Share with Student button', () => {
    renderTab();
    expect(screen.getByTestId('share-report')).toBeTruthy();
  });
});

// ── Detail view ───────────────────────────────────────────────────────────────

describe('ReportsTab detail view', () => {
  function openReport() {
    renderTab();
    fireEvent.click(screen.getByTestId('report-card-r1'));
  }

  it('clicking a card shows the report detail', () => {
    openReport();
    expect(screen.getByTestId('report-detail')).toBeTruthy();
  });

  it('detail shows grade prominently', () => {
    openReport();
    expect(screen.getByTestId('report-grade').textContent).toContain('72');
  });

  it('detail shows stat change rows', () => {
    openReport();
    expect(screen.getByTestId('stat-change-VPIP')).toBeTruthy();
    expect(screen.getByTestId('stat-change-PFR')).toBeTruthy();
    expect(screen.getByTestId('stat-change-Fold to CB')).toBeTruthy();
  });

  it('detail shows mistake trend rows', () => {
    openReport();
    expect(screen.getByTestId('mistake-trend-0')).toBeTruthy();
    expect(screen.getByTestId('mistake-trend-1')).toBeTruthy();
  });

  it('detail shows leak evolution rows', () => {
    openReport();
    expect(screen.getByTestId('leak-evolution-0')).toBeTruthy();
    expect(screen.getByTestId('leak-evolution-1')).toBeTruthy();
  });

  it('detail shows key hands', () => {
    openReport();
    expect(screen.getByTestId('key-hand-best-hand')).toBeTruthy();
    expect(screen.getByTestId('key-hand-worst-hand')).toBeTruthy();
    expect(screen.getByTestId('key-hand-most-instructive')).toBeTruthy();
  });

  it('back button returns to list view', () => {
    openReport();
    fireEvent.click(screen.getByTestId('report-back'));
    expect(screen.getByTestId('reports-tab')).toBeTruthy();
    expect(screen.queryByTestId('report-detail')).toBeNull();
  });
});
