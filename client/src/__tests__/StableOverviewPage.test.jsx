/**
 * StableOverviewPage.test.jsx
 *
 * Tests for the Stable Overview page surface (POK-42):
 *  - Renders page header with title and week label
 *  - Renders stable averages panel (avg grade, active students, hands)
 *  - Renders top improvers section with 3 students
 *  - Renders needs-attention section with 3 students
 *  - Shows inactive badge for Jordan L.
 *  - Student rows are clickable and navigate to CRM
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

import StableOverviewPage from '../pages/admin/StableOverviewPage.jsx';

function renderPage() {
  return render(
    <MemoryRouter>
      <StableOverviewPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Rendering ─────────────────────────────────────────────────────────────────

describe('StableOverviewPage rendering', () => {
  it('renders the Stable Overview title', () => {
    renderPage();
    expect(screen.getByText('Stable Overview')).toBeTruthy();
  });

  it('renders the week label', () => {
    renderPage();
    expect(screen.getByText('Week of Mar 24–30')).toBeTruthy();
  });

  it('renders the stable averages panel', () => {
    renderPage();
    expect(screen.getByTestId('stable-averages')).toBeTruthy();
  });

  it('renders avg grade value', () => {
    renderPage();
    expect(screen.getByTestId('avg-avg-grade')).toBeTruthy();
    expect(screen.getByTestId('avg-avg-grade').textContent).toContain('71');
  });

  it('renders active students stat', () => {
    renderPage();
    expect(screen.getByTestId('avg-active-students').textContent).toContain('28');
  });

  it('renders total hands stat', () => {
    renderPage();
    expect(screen.getByTestId('avg-total-hands').textContent).toContain('8,247');
  });

  it('renders top improvers section', () => {
    renderPage();
    expect(screen.getByTestId('top-improvers')).toBeTruthy();
  });

  it('renders top improvers students', () => {
    renderPage();
    expect(screen.getByTestId('student-row-sam-p.')).toBeTruthy();
    expect(screen.getByTestId('student-row-taylor-w.')).toBeTruthy();
    expect(screen.getByTestId('student-row-riley-c.')).toBeTruthy();
  });

  it('renders needs attention section', () => {
    renderPage();
    expect(screen.getByTestId('needs-attention')).toBeTruthy();
  });

  it('renders needs attention students', () => {
    renderPage();
    expect(screen.getByTestId('student-row-alex-k.')).toBeTruthy();
    expect(screen.getByTestId('student-row-jordan-l.')).toBeTruthy();
    expect(screen.getByTestId('student-row-marcus-t.')).toBeTruthy();
  });

  it('shows inactive badge for Jordan L.', () => {
    renderPage();
    expect(screen.getByText('inactive')).toBeTruthy();
  });

  it('shows grade values for top improvers', () => {
    renderPage();
    // Sam P. has grade 84
    expect(screen.getByText('84')).toBeTruthy();
  });
});

// ── Interactions ──────────────────────────────────────────────────────────────

describe('StableOverviewPage interactions', () => {
  it('clicking a student row navigates to /admin/crm', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('student-row-sam-p.'));
    expect(mockNavigate).toHaveBeenCalledWith('/admin/crm');
  });

  it('clicking back button navigates to /lobby', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('back-to-lobby'));
    expect(mockNavigate).toHaveBeenCalledWith('/lobby');
  });
});
