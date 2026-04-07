/**
 * CoachAlertsPage.test.jsx
 *
 * Tests for the Coach Alerts surface using real API-shaped data.
 * MOCK_ALERTS fallback has been removed — the component now shows a real
 * error state when the API fails instead of fabricated data.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockApiFetch = vi.fn();
vi.mock('../lib/api.js', () => ({
  apiFetch: (...args) => mockApiFetch(...args),
}));

import CoachAlertsPage from '../pages/admin/CoachAlertsPage.jsx';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PLAYERS = [
  { id: 'uuid-001', name: 'Alex Kim' },
  { id: 'uuid-002', name: 'Jordan Lee' },
  { id: 'uuid-003', name: 'Marcus Torres' },
  { id: 'uuid-004', name: 'Sam Patel' },
];

const ALERTS_RESPONSE = {
  alerts: [
    {
      id: 'alert-1',
      player_id: 'uuid-001',
      alert_type: 'mistake_spike',
      severity: 0.87,
      status: 'active',
      created_at: '2024-03-29T06:00:00Z',
      data: { spikes: [{ tag: 'EQUITY_FOLD', ratio: 2.6 }] },
    },
    {
      id: 'alert-2',
      player_id: 'uuid-002',
      alert_type: 'inactivity',
      severity: 0.71,
      status: 'active',
      created_at: '2024-03-29T06:00:00Z',
      data: { last_played: 'Mar 22', days_inactive: 7, threshold_days: 5 },
    },
    {
      id: 'alert-3',
      player_id: 'uuid-003',
      alert_type: 'losing_streak',
      severity: 0.54,
      status: 'active',
      created_at: '2024-03-28T22:15:00Z',
      data: { streak_sessions: 4, total_loss: 12400 },
    },
    {
      id: 'alert-4',
      player_id: 'uuid-004',
      alert_type: 'positive_milestone',
      severity: 0,
      status: 'active',
      created_at: '2024-03-30T06:00:00Z',
      data: { milestones: [{ detail: 'First profitable week' }] },
    },
  ],
};

function setupSuccess() {
  mockApiFetch.mockImplementation((url, opts) => {
    if (opts?.method === 'PATCH') return Promise.resolve({ ok: true });
    if (url.includes('/api/coach/alerts')) return Promise.resolve(ALERTS_RESPONSE);
    if (url.includes('/api/players')) return Promise.resolve({ players: PLAYERS });
    return Promise.reject(new Error('unexpected url: ' + url));
  });
}

function setupFailure() {
  mockApiFetch.mockImplementation((url, opts) => {
    if (opts?.method === 'PATCH') return Promise.resolve({ ok: true });
    return Promise.reject(new Error('network error'));
  });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <CoachAlertsPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Loading state ─────────────────────────────────────────────────────────────

describe('loading state', () => {
  it('shows loading indicator initially', () => {
    setupSuccess();
    renderPage();
    expect(screen.getByText(/Loading alerts/i)).toBeTruthy();
  });

  it('hides loading indicator after fetch completes', async () => {
    setupSuccess();
    renderPage();
    await waitFor(() => expect(screen.queryByText(/Loading alerts/i)).toBeNull());
  });
});

// ── Success rendering ─────────────────────────────────────────────────────────

describe('CoachAlertsPage rendering (API success)', () => {
  it('renders the alerts list container', async () => {
    setupSuccess();
    renderPage();
    await waitFor(() => expect(screen.queryByText(/Loading alerts/i)).toBeNull());
    expect(screen.getByTestId('alerts-list')).toBeTruthy();
  });

  it('renders all three non-milestone alert cards', async () => {
    setupSuccess();
    renderPage();
    await waitFor(() => expect(screen.queryByText(/Loading alerts/i)).toBeNull());
    expect(screen.getByTestId('alert-card-alert-1')).toBeTruthy();
    expect(screen.getByTestId('alert-card-alert-2')).toBeTruthy();
    expect(screen.getByTestId('alert-card-alert-3')).toBeTruthy();
  });

  it('renders student names in alerts', async () => {
    setupSuccess();
    renderPage();
    await waitFor(() => expect(screen.queryByText(/Loading alerts/i)).toBeNull());
    expect(screen.getByText('Alex Kim')).toBeTruthy();
    expect(screen.getByText('Jordan Lee')).toBeTruthy();
    expect(screen.getByText('Marcus Torres')).toBeTruthy();
  });

  it('renders milestones section', async () => {
    setupSuccess();
    renderPage();
    await waitFor(() => expect(screen.queryByText(/Loading alerts/i)).toBeNull());
    expect(screen.getByTestId('milestones-list')).toBeTruthy();
    expect(screen.getByText(/Milestones/i)).toBeTruthy();
  });

  it('renders milestone card for Sam Patel', async () => {
    setupSuccess();
    renderPage();
    await waitFor(() => expect(screen.queryByText(/Loading alerts/i)).toBeNull());
    expect(screen.getByTestId('alert-card-alert-4')).toBeTruthy();
    expect(screen.getByText('Sam Patel')).toBeTruthy();
  });

  it('renders Review and Dismiss buttons for alert-1', async () => {
    setupSuccess();
    renderPage();
    await waitFor(() => expect(screen.queryByText(/Loading alerts/i)).toBeNull());
    expect(screen.getByTestId('alert-review-alert-1')).toBeTruthy();
    expect(screen.getByTestId('alert-dismiss-alert-1')).toBeTruthy();
  });
});

// ── Error state ───────────────────────────────────────────────────────────────

describe('CoachAlertsPage error state', () => {
  it('shows error message when API fails', async () => {
    setupFailure();
    renderPage();
    await waitFor(() => expect(screen.queryByText(/Loading alerts/i)).toBeNull());
    expect(screen.getByTestId('alerts-error')).toBeTruthy();
    expect(screen.getByText(/network error/i)).toBeTruthy();
  });

  it('does not render alerts list when API fails', async () => {
    setupFailure();
    renderPage();
    await waitFor(() => expect(screen.queryByText(/Loading alerts/i)).toBeNull());
    expect(screen.queryByTestId('alerts-list')).toBeNull();
  });
});

// ── Interactions ──────────────────────────────────────────────────────────────

describe('CoachAlertsPage interactions', () => {
  it('dismissing alert-1 removes it from the active feed', async () => {
    setupSuccess();
    renderPage();
    await waitFor(() => expect(screen.queryByText(/Loading alerts/i)).toBeNull());
    expect(screen.getByTestId('alert-card-alert-1')).toBeTruthy();
    fireEvent.click(screen.getByTestId('alert-dismiss-alert-1'));
    await waitFor(() => expect(screen.queryByTestId('alert-card-alert-1')).toBeNull());
  });

  it('active tab button shows count of 3 initially', async () => {
    setupSuccess();
    renderPage();
    await waitFor(() => expect(screen.queryByText(/Loading alerts/i)).toBeNull());
    const activeTab = screen.getByTestId('tab-active');
    expect(activeTab.textContent).toContain('3');
  });

  it('shows no-active-alerts message when all alerts are dismissed', async () => {
    setupSuccess();
    renderPage();
    await waitFor(() => expect(screen.queryByText(/Loading alerts/i)).toBeNull());
    fireEvent.click(screen.getByTestId('alert-dismiss-alert-1'));
    await waitFor(() => expect(screen.queryByTestId('alert-card-alert-1')).toBeNull());
    fireEvent.click(screen.getByTestId('alert-dismiss-alert-2'));
    await waitFor(() => expect(screen.queryByTestId('alert-card-alert-2')).toBeNull());
    fireEvent.click(screen.getByTestId('alert-dismiss-alert-3'));
    await waitFor(() => expect(screen.getByText(/No active alerts/i)).toBeTruthy());
  });

  it('clicking Review navigates to /admin/crm', async () => {
    setupSuccess();
    renderPage();
    await waitFor(() => expect(screen.queryByText(/Loading alerts/i)).toBeNull());
    fireEvent.click(screen.getByTestId('alert-review-alert-1'));
    expect(mockNavigate).toHaveBeenCalledWith('/admin/crm');
  });
});
