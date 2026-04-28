/**
 * StableOverviewPage.test.jsx
 *
 * Tests for the Stable Overview page:
 *  - Renders page header with title and week label
 *  - Renders stable averages panel (avg grade, active students)
 *  - Renders top performers section with 3 students
 *  - Renders needs-attention section with 3+ students
 *  - Student rows are clickable and navigate to CRM
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

// Mock apiFetch
vi.mock('../lib/api.js', () => ({
  apiFetch: vi.fn(),
}));

import StableOverviewPage from '../pages/admin/StableOverviewPage.jsx';
import { apiFetch } from '../lib/api.js';

// Test data matching the API response shape
const MOCK_API_DATA = {
  students: [
    { player_id: '1', display_name: 'Sam Patel', overall_grade: 84, period_start: '2026-03-24', period_end: '2026-03-30', created_at: '2026-03-30T00:00:00Z' },
    { player_id: '2', display_name: 'Taylor Wong', overall_grade: 79, period_start: '2026-03-24', period_end: '2026-03-30', created_at: '2026-03-30T00:00:00Z' },
    { player_id: '3', display_name: 'Riley Chen', overall_grade: 75, period_start: '2026-03-24', period_end: '2026-03-30', created_at: '2026-03-30T00:00:00Z' },
    { player_id: '4', display_name: 'Marcus Torres', overall_grade: 61, period_start: '2026-03-24', period_end: '2026-03-30', created_at: '2026-03-30T00:00:00Z' },
    { player_id: '5', display_name: 'Alex Kim', overall_grade: 54, period_start: '2026-03-24', period_end: '2026-03-30', created_at: '2026-03-30T00:00:00Z' },
    { player_id: '6', display_name: 'Jordan Lee', overall_grade: null, period_start: '2026-03-24', period_end: '2026-03-30', created_at: '2026-03-30T00:00:00Z' },
    { player_id: '7', display_name: 'Jamie Davis', overall_grade: 71, period_start: '2026-03-24', period_end: '2026-03-30', created_at: '2026-03-30T00:00:00Z' },
    { player_id: '8', display_name: 'Morgan Silva', overall_grade: 68, period_start: '2026-03-24', period_end: '2026-03-30', created_at: '2026-03-30T00:00:00Z' },
    { player_id: '9', display_name: 'Casey Brown', overall_grade: 73, period_start: '2026-03-24', period_end: '2026-03-30', created_at: '2026-03-30T00:00:00Z' },
    { player_id: '10', display_name: 'Drew Martinez', overall_grade: 66, period_start: '2026-03-24', period_end: '2026-03-30', created_at: '2026-03-30T00:00:00Z' },
    { player_id: '11', display_name: 'Quinn Johnson', overall_grade: 77, period_start: '2026-03-24', period_end: '2026-03-30', created_at: '2026-03-30T00:00:00Z' },
    { player_id: '12', display_name: 'Avery Williams', overall_grade: 58, period_start: '2026-03-24', period_end: '2026-03-30', created_at: '2026-03-30T00:00:00Z' },
    { player_id: '13', display_name: 'Bailey Fischer', overall_grade: 70, period_start: '2026-03-24', period_end: '2026-03-30', created_at: '2026-03-30T00:00:00Z' },
    { player_id: '14', display_name: 'Casey Green', overall_grade: 69, period_start: '2026-03-24', period_end: '2026-03-30', created_at: '2026-03-30T00:00:00Z' },
    { player_id: '15', display_name: 'Dana Hall', overall_grade: 72, period_start: '2026-03-24', period_end: '2026-03-30', created_at: '2026-03-30T00:00:00Z' },
    { player_id: '16', display_name: 'Ellis Jackson', overall_grade: 65, period_start: '2026-03-24', period_end: '2026-03-30', created_at: '2026-03-30T00:00:00Z' },
    { player_id: '17', display_name: 'Finley King', overall_grade: 76, period_start: '2026-03-24', period_end: '2026-03-30', created_at: '2026-03-30T00:00:00Z' },
    { player_id: '18', display_name: 'Gray Lee', overall_grade: 62, period_start: '2026-03-24', period_end: '2026-03-30', created_at: '2026-03-30T00:00:00Z' },
    { player_id: '19', display_name: 'Harper Miller', overall_grade: 74, period_start: '2026-03-24', period_end: '2026-03-30', created_at: '2026-03-30T00:00:00Z' },
    { player_id: '20', display_name: 'Iris Nelson', overall_grade: 67, period_start: '2026-03-24', period_end: '2026-03-30', created_at: '2026-03-30T00:00:00Z' },
    { player_id: '21', display_name: 'Jazz Owen', overall_grade: 80, period_start: '2026-03-24', period_end: '2026-03-30', created_at: '2026-03-30T00:00:00Z' },
    { player_id: '22', display_name: 'Kay Parker', overall_grade: 64, period_start: '2026-03-24', period_end: '2026-03-30', created_at: '2026-03-30T00:00:00Z' },
    { player_id: '23', display_name: 'Leigh Quinn', overall_grade: 78, period_start: '2026-03-24', period_end: '2026-03-30', created_at: '2026-03-30T00:00:00Z' },
    { player_id: '24', display_name: 'Morgan Ross', overall_grade: 63, period_start: '2026-03-24', period_end: '2026-03-30', created_at: '2026-03-30T00:00:00Z' },
    { player_id: '25', display_name: 'Nolan Smith', overall_grade: 75, period_start: '2026-03-24', period_end: '2026-03-30', created_at: '2026-03-30T00:00:00Z' },
    { player_id: '26', display_name: 'Owen Taylor', overall_grade: 81, period_start: '2026-03-24', period_end: '2026-03-30', created_at: '2026-03-30T00:00:00Z' },
    { player_id: '27', display_name: 'Parker Underwood', overall_grade: 60, period_start: '2026-03-24', period_end: '2026-03-30', created_at: '2026-03-30T00:00:00Z' },
    { player_id: '28', display_name: 'Quinn Vance', overall_grade: 76, period_start: '2026-03-24', period_end: '2026-03-30', created_at: '2026-03-30T00:00:00Z' },
  ],
  avg_grade: 71,
  top_performers: [
    { player_id: '1', display_name: 'Sam Patel', overall_grade: 84, period_start: '2026-03-24', period_end: '2026-03-30', created_at: '2026-03-30T00:00:00Z' },
    { player_id: '2', display_name: 'Taylor Wong', overall_grade: 79, period_start: '2026-03-24', period_end: '2026-03-30', created_at: '2026-03-30T00:00:00Z' },
    { player_id: '11', display_name: 'Quinn Johnson', overall_grade: 77, period_start: '2026-03-24', period_end: '2026-03-30', created_at: '2026-03-30T00:00:00Z' },
  ],
  concerns: [
    { player_id: '5', display_name: 'Alex Kim', overall_grade: 54, period_start: '2026-03-24', period_end: '2026-03-30', created_at: '2026-03-30T00:00:00Z' },
    { player_id: '12', display_name: 'Avery Williams', overall_grade: 58, period_start: '2026-03-24', period_end: '2026-03-30', created_at: '2026-03-30T00:00:00Z' },
    { player_id: '4', display_name: 'Marcus Torres', overall_grade: 61, period_start: '2026-03-24', period_end: '2026-03-30', created_at: '2026-03-30T00:00:00Z' },
  ],
};

function renderPage() {
  return render(
    <MemoryRouter>
      <StableOverviewPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  apiFetch.mockResolvedValue(MOCK_API_DATA);
});

// ── Rendering ─────────────────────────────────────────────────────────────

describe('StableOverviewPage rendering', () => {
  it('renders the Stable Overview title', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Stable Overview')).toBeTruthy();
    });
  });

  it('renders the week label derived from period dates', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Week of Mar 24/)).toBeTruthy();
    });
  });

  it('renders the stable averages panel', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('stable-averages')).toBeTruthy();
    });
  });

  it('renders avg grade value', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('avg-avg-grade')).toBeTruthy();
      expect(screen.getByTestId('avg-avg-grade').textContent).toContain('71');
    });
  });

  it('renders active students stat', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('avg-active-students').textContent).toContain('28');
    });
  });

  it('renders top performers section', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('top-improvers')).toBeTruthy();
    });
  });

  it('renders top 3 performers by name', async () => {
    renderPage();
    await waitFor(() => {
      // From top_performers: Sam Patel (84), Taylor Wong (79), Quinn Johnson (77)
      expect(screen.getByTestId('mini-row-sam-patel')).toBeTruthy();
      expect(screen.getByTestId('mini-row-taylor-wong')).toBeTruthy();
      expect(screen.getByTestId('mini-row-quinn-johnson')).toBeTruthy();
    });
  });

  it('renders needs attention section', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('needs-attention')).toBeTruthy();
    });
  });

  it('renders needs attention students from concerns', async () => {
    renderPage();
    await waitFor(() => {
      // From concerns: Alex Kim (54), Avery Williams (58), Marcus Torres (61)
      expect(screen.getByTestId('mini-row-alex-kim')).toBeTruthy();
      expect(screen.getByTestId('mini-row-avery-williams')).toBeTruthy();
      expect(screen.getByTestId('mini-row-marcus-torres')).toBeTruthy();
    });
  });

  it('Jordan Lee is in all-students table', async () => {
    renderPage();
    await waitFor(() => {
      // Jordan Lee IS in the all-students table (id=6)
      expect(screen.getByTestId('student-row-6')).toBeTruthy();
    });
  });

  it('shows grade values for top performers', async () => {
    renderPage();
    await waitFor(() => {
      // Sam Patel has grade 84 — appears in both mini-row and all-students table
      expect(screen.getByTestId('mini-row-sam-patel').textContent).toContain('84');
    });
  });

  it('renders the all-students table', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('all-students-table')).toBeTruthy();
    });
  });

  it('renders the group breakdown table', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('group-breakdown-table')).toBeTruthy();
    });
  });
});

// ── Interactions ──────────────────────────────────────────────────────────

describe('StableOverviewPage interactions', () => {
  it('clicking a top-performer student row navigates to /admin/crm', async () => {
    renderPage();
    await waitFor(() => {
      fireEvent.click(screen.getByTestId('mini-row-sam-patel'));
    });
    expect(mockNavigate).toHaveBeenCalledWith('/admin/crm');
  });

  it('clicking a needs-attention student row navigates to /admin/crm', async () => {
    renderPage();
    await waitFor(() => {
      fireEvent.click(screen.getByTestId('mini-row-alex-kim'));
    });
    expect(mockNavigate).toHaveBeenCalledWith('/admin/crm');
  });
});
