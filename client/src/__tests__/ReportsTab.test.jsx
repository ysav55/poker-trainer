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
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockApiFetch = vi.fn();
vi.mock('../lib/api.js', () => ({
  apiFetch: (...args) => mockApiFetch(...args),
}));

const MOCK_REPORTS = [
  {
    id: 'r1',
    period: 'Week of Mar 24–30, 2026',
    reportType: 'weekly',
    grade: 72,
    overview: { sessions: 4, hands: 287, netChips: 1200, qualityAvg: 74, qualityPrev: 71 },
    statChanges: [
      { stat: 'VPIP', thisWeek: 23, lastWeek: 25, direction: 'improved', change: 2 },
      { stat: 'PFR', thisWeek: 18, lastWeek: 16, direction: 'regressed', change: 2 },
      { stat: 'Fold to CB', thisWeek: 45, lastWeek: 48, direction: 'improved', change: 3 },
    ],
    mistakeTrends: [
      { tag: 'OPEN_LIMP', lastWeek: 8, thisWeek: 5, direction: 'improved' },
      { tag: 'COLD_CALL_3BET', lastWeek: 3, thisWeek: 4, direction: 'worsened' },
    ],
    leakEvolution: [
      { tag: 'EQUITY_FOLD', startRate: 12, endRate: 8, change: 'improved' },
      { tag: 'OPEN_LIMP', startRate: 9, endRate: 6, change: 'improved' },
    ],
    topHands: {
      best: { chips: 4200, date: '2026-03-28', tags: ['VALUE_BET'] },
      worst: { chips: -1800, date: '2026-03-26', tags: ['OPEN_LIMP'] },
      mostInstructive: { chips: 800, date: '2026-03-27', tags: ['C_BET'] },
    },
  },
  {
    id: 'r2',
    period: 'Week of Mar 17–23, 2026',
    reportType: 'weekly',
    grade: 68,
    overview: { sessions: 3, hands: 201, netChips: -400, qualityAvg: 69, qualityPrev: 72 },
    statChanges: [],
    mistakeTrends: [],
    leakEvolution: [],
    topHands: null,
  },
];

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
  mockApiFetch.mockResolvedValue({ reports: MOCK_REPORTS });
});

// ── List view ─────────────────────────────────────────────────────────────────

describe('ReportsTab list view', () => {
  it('renders the reports tab container', async () => {
    renderTab();
    await waitFor(() => expect(screen.getByTestId('reports-tab')).toBeTruthy());
  });

  it('renders mock report cards', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByTestId('report-card-r1')).toBeTruthy();
      expect(screen.getByTestId('report-card-r2')).toBeTruthy();
    });
  });

  it('report card shows period label', async () => {
    renderTab();
    await waitFor(() =>
      expect(screen.getAllByText('Week of Mar 24–30, 2026').length).toBeGreaterThan(0)
    );
  });

  it('report card shows grade', async () => {
    renderTab();
    await waitFor(() => expect(screen.getByText('72')).toBeTruthy());
  });

  it('renders Previous week button', async () => {
    renderTab();
    await waitFor(() => expect(screen.getByTestId('prev-week')).toBeTruthy());
  });

  it('renders Next week button (disabled at offset 0)', async () => {
    renderTab();
    await waitFor(() => {
      const btn = screen.getByTestId('next-week');
      expect(btn).toBeTruthy();
      expect(btn.disabled).toBe(true);
    });
  });

  it('renders Share with Student button', async () => {
    renderTab();
    await waitFor(() => expect(screen.getByTestId('share-report')).toBeTruthy());
  });
});

// ── Detail view ───────────────────────────────────────────────────────────────

describe('ReportsTab detail view', () => {
  async function openReport() {
    renderTab();
    await waitFor(() => screen.getByTestId('report-card-r1'));
    fireEvent.click(screen.getByTestId('report-card-r1'));
  }

  it('clicking a card shows the report detail', async () => {
    await openReport();
    expect(screen.getByTestId('report-detail')).toBeTruthy();
  });

  it('detail shows grade prominently', async () => {
    await openReport();
    expect(screen.getByTestId('report-grade').textContent).toContain('72');
  });

  it('detail shows stat change rows', async () => {
    await openReport();
    expect(screen.getByTestId('stat-change-VPIP')).toBeTruthy();
    expect(screen.getByTestId('stat-change-PFR')).toBeTruthy();
    expect(screen.getByTestId('stat-change-Fold to CB')).toBeTruthy();
  });

  it('detail shows mistake trend rows', async () => {
    await openReport();
    expect(screen.getByTestId('mistake-trend-0')).toBeTruthy();
    expect(screen.getByTestId('mistake-trend-1')).toBeTruthy();
  });

  it('detail shows leak evolution rows', async () => {
    await openReport();
    expect(screen.getByTestId('leak-evolution-0')).toBeTruthy();
    expect(screen.getByTestId('leak-evolution-1')).toBeTruthy();
  });

  it('detail shows key hands', async () => {
    await openReport();
    expect(screen.getByTestId('key-hand-best-hand')).toBeTruthy();
    expect(screen.getByTestId('key-hand-worst-hand')).toBeTruthy();
    expect(screen.getByTestId('key-hand-most-instructive')).toBeTruthy();
  });

  it('back button returns to list view', async () => {
    await openReport();
    fireEvent.click(screen.getByTestId('report-back'));
    expect(screen.getByTestId('reports-tab')).toBeTruthy();
    expect(screen.queryByTestId('report-detail')).toBeNull();
  });
});
