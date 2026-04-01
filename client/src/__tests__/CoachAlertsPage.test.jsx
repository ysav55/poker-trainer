/**
 * CoachAlertsPage.test.jsx
 *
 * Tests for the Coach Alerts surface (POK-42):
 *  - Renders alert feed header with correct count
 *  - Renders all mock alert rows
 *  - Renders milestones section
 *  - Dismiss button removes an alert from the feed
 *  - Review button navigates to /admin/crm
 *  - Shows "no active alerts" message when all dismissed
 *  - Back button navigates to /lobby
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});

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
});

// ── Rendering ─────────────────────────────────────────────────────────────────

describe('CoachAlertsPage rendering', () => {
  it('renders the alerts header with count', () => {
    renderPage();
    const header = screen.getByTestId('alerts-header');
    expect(header.textContent).toMatch(/NEEDS ATTENTION/i);
    expect(header.textContent).toMatch(/3/);
  });

  it('renders all three mock alert rows', () => {
    renderPage();
    expect(screen.getByTestId('alert-row-a1')).toBeTruthy();
    expect(screen.getByTestId('alert-row-a2')).toBeTruthy();
    expect(screen.getByTestId('alert-row-a3')).toBeTruthy();
  });

  it('renders student names in alerts', () => {
    renderPage();
    expect(screen.getByText('Alex K.')).toBeTruthy();
    expect(screen.getByText('Jordan L.')).toBeTruthy();
    expect(screen.getByText('Marcus T.')).toBeTruthy();
  });

  it('renders milestones section header', () => {
    renderPage();
    expect(screen.getByTestId('milestones-header').textContent).toMatch(/MILESTONES/i);
  });

  it('renders milestone student names', () => {
    renderPage();
    expect(screen.getByTestId('milestone-row-m1')).toBeTruthy();
    expect(screen.getByTestId('milestone-row-m2')).toBeTruthy();
    expect(screen.getByText('Sam P.')).toBeTruthy();
    expect(screen.getByText('Taylor W.')).toBeTruthy();
  });

  it('renders Review and Dismiss buttons for each alert', () => {
    renderPage();
    expect(screen.getByTestId('alert-review-a1')).toBeTruthy();
    expect(screen.getByTestId('alert-dismiss-a1')).toBeTruthy();
  });
});

// ── Interactions ──────────────────────────────────────────────────────────────

describe('CoachAlertsPage interactions', () => {
  it('dismissing an alert removes it from the feed', () => {
    renderPage();
    expect(screen.getByTestId('alert-row-a1')).toBeTruthy();
    fireEvent.click(screen.getByTestId('alert-dismiss-a1'));
    expect(screen.queryByTestId('alert-row-a1')).toBeNull();
  });

  it('dismissing updates the count in the header', () => {
    renderPage();
    expect(screen.getByTestId('alerts-header').textContent).toMatch(/3/);
    fireEvent.click(screen.getByTestId('alert-dismiss-a1'));
    expect(screen.getByTestId('alerts-header').textContent).toMatch(/2/);
  });

  it('shows no-alerts message when all alerts are dismissed', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('alert-dismiss-a1'));
    fireEvent.click(screen.getByTestId('alert-dismiss-a2'));
    fireEvent.click(screen.getByTestId('alert-dismiss-a3'));
    expect(screen.getByTestId('no-alerts')).toBeTruthy();
  });

  it('clicking Review navigates to /admin/crm', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('alert-review-a1'));
    expect(mockNavigate).toHaveBeenCalledWith('/admin/crm');
  });

  it('clicking back button navigates to /lobby', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('back-to-lobby'));
    expect(mockNavigate).toHaveBeenCalledWith('/lobby');
  });
});
