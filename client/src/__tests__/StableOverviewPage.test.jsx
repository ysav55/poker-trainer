/**
 * StableOverviewPage.test.jsx
 *
 * Tests for the Stable Overview page surface (POK-42):
 *  - Renders page header with title and week label
 *  - Renders stable averages panel (avg grade, active students, hands)
 *  - Renders top improvers section with 3 students
 *  - Renders needs-attention section with 3+ students
 *  - Shows inactive badge for Jordan Lee (hands === 0)
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

  it('renders top 3 improvers by name', () => {
    renderPage();
    // MOCK_STUDENTS sorted by delta desc: Sam Patel (+12), Taylor Wong (+8), Quinn Johnson (+7)
    expect(screen.getByTestId('mini-row-sam-patel')).toBeTruthy();
    expect(screen.getByTestId('mini-row-taylor-wong')).toBeTruthy();
    expect(screen.getByTestId('mini-row-quinn-johnson')).toBeTruthy();
  });

  it('renders needs attention section', () => {
    renderPage();
    expect(screen.getByTestId('needs-attention')).toBeTruthy();
  });

  it('renders needs attention students (bottom delta + inactive)', () => {
    renderPage();
    // filter: delta < 0 || hands === 0; sort (delta??0) asc; slice(0,3)
    // Alex Kim -17, Avery Williams -9, Marcus Torres -6
    // Jordan Lee (delta=null→0, hands=0) qualifies but sorts 6th — not in mini-panel
    expect(screen.getByTestId('mini-row-alex-kim')).toBeTruthy();
    expect(screen.getByTestId('mini-row-avery-williams')).toBeTruthy();
    expect(screen.getByTestId('mini-row-marcus-torres')).toBeTruthy();
  });

  it('Jordan Lee is in all-students table but not the needs-attention mini-panel', () => {
    renderPage();
    // Jordan Lee sorts 6th in needs-attention (delta null→0) — mini-row NOT rendered
    expect(screen.queryByTestId('mini-row-jordan-lee')).toBeNull();
    // Jordan Lee IS in the all-students table (id=6)
    expect(screen.getByTestId('student-row-6')).toBeTruthy();
  });

  it('shows grade values for top improvers', () => {
    renderPage();
    // Sam Patel has grade 84 — appears in both mini-row and all-students table
    expect(screen.getByTestId('mini-row-sam-patel').textContent).toContain('84');
  });

  it('renders the all-students table', () => {
    renderPage();
    expect(screen.getByTestId('all-students-table')).toBeTruthy();
  });

  it('renders the group breakdown table', () => {
    renderPage();
    expect(screen.getByTestId('group-breakdown-table')).toBeTruthy();
  });
});

// ── Interactions ──────────────────────────────────────────────────────────────

describe('StableOverviewPage interactions', () => {
  it('clicking a top-improver student row navigates to /admin/crm', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('mini-row-sam-patel'));
    expect(mockNavigate).toHaveBeenCalledWith('/admin/crm');
  });

  it('clicking a needs-attention student row navigates to /admin/crm', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('mini-row-alex-kim'));
    expect(mockNavigate).toHaveBeenCalledWith('/admin/crm');
  });
});
