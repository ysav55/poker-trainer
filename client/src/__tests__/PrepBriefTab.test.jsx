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
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockApiFetch = vi.fn();
vi.mock('../lib/api.js', () => ({
  apiFetch: (...args) => mockApiFetch(...args),
}));

const MOCK_BRIEF = {
  generatedAt: '2026-03-30T06:00:00Z',
  activeAlerts: [
    { detail: 'EQUITY_FOLD spike detected', severity: 0.87 },
    { detail: 'Inactivity: 7 days', severity: 0.71 },
    { detail: 'Losing streak: 4 sessions', severity: 0.54 },
  ],
  leaks: [
    { tag: 'EQUITY_FOLD', trend: 'worsening', studentRate: 12, schoolAvg: 4, delta: 8.0 },
    { tag: 'COLD_CALL_3BET', trend: 'stable', studentRate: 7, schoolAvg: 3, delta: 4.0 },
    { tag: 'OPEN_LIMP', trend: 'improving', studentRate: 5, schoolAvg: 2, delta: 3.0 },
  ],
  statsSnapshot: [
    { stat: 'VPIP', current: 23, previous: 25, delta: 2, direction: 'down' },
    { stat: 'PFR', current: 18, previous: 16, delta: 2, direction: 'up' },
    { stat: '3bet%', current: 8, previous: 7, delta: 1, direction: 'up' },
  ],
  flaggedHands: [
    { handId: 'h1', tags: ['EQUITY_FOLD'], date: '2026-03-29', netResult: -1200, reviewScore: 45 },
    { handId: 'h2', tags: ['COLD_CALL_3BET'], date: '2026-03-28', netResult: -800, reviewScore: 51 },
    { handId: 'h3', tags: ['OPEN_LIMP'], date: '2026-03-27', netResult: -600, reviewScore: 48 },
    { handId: 'h4', tags: ['EQUITY_FOLD'], date: '2026-03-26', netResult: -400, reviewScore: 52 },
    { handId: 'h5', tags: ['COLD_CALL_3BET'], date: '2026-03-25', netResult: -200, reviewScore: 55 },
  ],
  coachNotes: [
    { type: 'general', date: '2026-03-28', body: 'Work on river sizing' },
    { type: 'goal', date: '2026-03-25', body: 'Improve 3bet% to 10%' },
  ],
  sessionHistory: [
    { date: '2026-03-29', hands: 120, netChips: 1200, qualityScore: 74 },
    { date: '2026-03-28', hands: 98, netChips: -400, qualityScore: 68 },
    { date: '2026-03-27', hands: 80, netChips: 800, qualityScore: 75 },
    { date: '2026-03-26', hands: 110, netChips: -200, qualityScore: 71 },
    { date: '2026-03-25', hands: 95, netChips: 600, qualityScore: 72 },
  ],
};

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
  mockApiFetch.mockResolvedValue(MOCK_BRIEF);
});

// ── Rendering ─────────────────────────────────────────────────────────────────

describe('PrepBriefTab rendering', () => {
  it('renders the tab container', async () => {
    renderTab();
    await waitFor(() => expect(screen.getByTestId('prep-brief-tab')).toBeTruthy());
  });

  it('shows a generated timestamp', async () => {
    renderTab();
    await waitFor(() => expect(screen.getByText(/Generated/i)).toBeTruthy());
  });

  it('renders the refresh button', async () => {
    renderTab();
    await waitFor(() => expect(screen.getByTestId('refresh-prep-brief')).toBeTruthy());
  });

  it('renders active alerts', async () => {
    renderTab();
    await waitFor(() => expect(screen.getAllByTestId('alert-row').length).toBeGreaterThan(0));
  });

  it('renders 3 leak rows', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByTestId('leak-row-0')).toBeTruthy();
      expect(screen.getByTestId('leak-row-1')).toBeTruthy();
      expect(screen.getByTestId('leak-row-2')).toBeTruthy();
    });
  });

  it('renders leak tags EQUITY_FOLD, COLD_CALL_3BET, OPEN_LIMP', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getAllByText('EQUITY_FOLD').length).toBeGreaterThan(0);
      expect(screen.getAllByText('COLD_CALL_3BET').length).toBeGreaterThan(0);
      expect(screen.getAllByText('OPEN_LIMP').length).toBeGreaterThan(0);
    });
  });

  it('renders stats snapshot table rows', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByTestId('stat-row-VPIP')).toBeTruthy();
      expect(screen.getByTestId('stat-row-PFR')).toBeTruthy();
      expect(screen.getByTestId('stat-row-3bet%')).toBeTruthy();
    });
  });

  it('renders 5 flagged hand rows', async () => {
    renderTab();
    await waitFor(() => {
      for (let i = 0; i < 5; i++) {
        expect(screen.getByTestId(`flagged-hand-${i}`)).toBeTruthy();
      }
    });
  });

  it('renders 2 coach notes', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByTestId('coach-note-0')).toBeTruthy();
      expect(screen.getByTestId('coach-note-1')).toBeTruthy();
    });
  });

  it('renders 5 recent session rows', async () => {
    renderTab();
    await waitFor(() => {
      for (let i = 0; i < 5; i++) {
        expect(screen.getByTestId(`session-row-${i}`)).toBeTruthy();
      }
    });
  });
});

// ── Interactions ──────────────────────────────────────────────────────────────

describe('PrepBriefTab interactions', () => {
  it('refresh button shows loading state when clicked', async () => {
    mockApiFetch.mockImplementation((url, opts) => {
      if (opts?.method === 'POST') return new Promise(resolve => setTimeout(() => resolve(MOCK_BRIEF), 100));
      return Promise.resolve(MOCK_BRIEF);
    });
    renderTab();
    await waitFor(() => screen.getByTestId('refresh-prep-brief'));
    const btn = screen.getByTestId('refresh-prep-brief');
    fireEvent.click(btn);
    expect(btn.textContent).toMatch(/Refreshing/i);
  });
});
