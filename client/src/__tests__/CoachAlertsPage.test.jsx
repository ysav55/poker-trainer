/**
 * CoachAlertsPage.test.jsx
 *
 * Tests for the Coach Alerts surface:
 *  - Renders alert list with mock data (apiFetch fails → falls back to MOCK_ALERTS)
 *  - Renders all three non-milestone alert cards
 *  - Renders milestones section
 *  - Dismiss button removes an alert from the active feed
 *  - Review button navigates to /admin/crm
 *  - Shows "no active alerts" message when all alerts dismissed
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

function renderPage() {
  return render(
    <MemoryRouter>
      <CoachAlertsPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // Reject GET calls (coach/alerts, players) so component falls back to MOCK_ALERTS
  // Resolve PATCH calls (dismiss) so the optimistic update is not reverted
  mockApiFetch.mockImplementation((url, opts) => {
    if (opts?.method === 'PATCH') return Promise.resolve({ ok: true });
    return Promise.reject(new Error('no network'));
  });
});

// ── Rendering ─────────────────────────────────────────────────────────────────

describe('CoachAlertsPage rendering', () => {
  it('renders the alerts list container', async () => {
    renderPage();
    await waitFor(() => expect(screen.queryByText(/Loading alerts/i)).toBeNull());
    expect(screen.getByTestId('alerts-list')).toBeTruthy();
  });

  it('renders all three non-milestone alert cards', async () => {
    renderPage();
    await waitFor(() => expect(screen.queryByText(/Loading alerts/i)).toBeNull());
    expect(screen.getByTestId('alert-card-mock-1')).toBeTruthy();
    expect(screen.getByTestId('alert-card-mock-2')).toBeTruthy();
    expect(screen.getByTestId('alert-card-mock-3')).toBeTruthy();
  });

  it('renders student names in alerts', async () => {
    renderPage();
    await waitFor(() => expect(screen.queryByText(/Loading alerts/i)).toBeNull());
    expect(screen.getByText('Alex Kim')).toBeTruthy();
    expect(screen.getByText('Jordan Lee')).toBeTruthy();
    expect(screen.getByText('Marcus Torres')).toBeTruthy();
  });

  it('renders milestones section', async () => {
    renderPage();
    await waitFor(() => expect(screen.queryByText(/Loading alerts/i)).toBeNull());
    expect(screen.getByTestId('milestones-list')).toBeTruthy();
    expect(screen.getByText(/Milestones/i)).toBeTruthy();
  });

  it('renders milestone card for Sam Patel', async () => {
    renderPage();
    await waitFor(() => expect(screen.queryByText(/Loading alerts/i)).toBeNull());
    expect(screen.getByTestId('alert-card-mock-4')).toBeTruthy();
    expect(screen.getByText('Sam Patel')).toBeTruthy();
  });

  it('renders Review and Dismiss buttons for alert mock-1', async () => {
    renderPage();
    await waitFor(() => expect(screen.queryByText(/Loading alerts/i)).toBeNull());
    expect(screen.getByTestId('alert-review-mock-1')).toBeTruthy();
    expect(screen.getByTestId('alert-dismiss-mock-1')).toBeTruthy();
  });
});

// ── Interactions ──────────────────────────────────────────────────────────────

describe('CoachAlertsPage interactions', () => {
  it('dismissing alert mock-1 removes it from the active feed', async () => {
    renderPage();
    await waitFor(() => expect(screen.queryByText(/Loading alerts/i)).toBeNull());
    expect(screen.getByTestId('alert-card-mock-1')).toBeTruthy();
    fireEvent.click(screen.getByTestId('alert-dismiss-mock-1'));
    await waitFor(() => expect(screen.queryByTestId('alert-card-mock-1')).toBeNull());
  });

  it('active tab button shows count of 3 initially', async () => {
    renderPage();
    await waitFor(() => expect(screen.queryByText(/Loading alerts/i)).toBeNull());
    const activeTab = screen.getByTestId('tab-active');
    expect(activeTab.textContent).toContain('3');
  });

  it('shows no-active-alerts message when all alerts are dismissed', async () => {
    renderPage();
    await waitFor(() => expect(screen.queryByText(/Loading alerts/i)).toBeNull());
    // Dismiss all three non-milestone alerts one by one, waiting for each removal
    fireEvent.click(screen.getByTestId('alert-dismiss-mock-1'));
    await waitFor(() => expect(screen.queryByTestId('alert-card-mock-1')).toBeNull());
    fireEvent.click(screen.getByTestId('alert-dismiss-mock-2'));
    await waitFor(() => expect(screen.queryByTestId('alert-card-mock-2')).toBeNull());
    fireEvent.click(screen.getByTestId('alert-dismiss-mock-3'));
    await waitFor(() => expect(screen.getByText(/No active alerts/i)).toBeTruthy());
  });

  it('clicking Review navigates to /admin/crm', async () => {
    renderPage();
    await waitFor(() => expect(screen.queryByText(/Loading alerts/i)).toBeNull());
    fireEvent.click(screen.getByTestId('alert-review-mock-1'));
    expect(mockNavigate).toHaveBeenCalledWith('/admin/crm');
  });
});
