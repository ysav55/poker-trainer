/**
 * AnalysisPage.test.jsx
 *
 * Tests for the /analysis route:
 *  - Renders header with AI Hand Analysis title and back button
 *  - Filter bar renders player selector, date inputs
 *  - Shows summary bar after data loads (requires Run Analysis click)
 *  - Renders tag distribution chart
 *  - Shows empty state when no tags
 *  - Mistake breakdown chart renders
 *  - Flagged hands panel appears after run
 *  - Compare Players button visible for coach, hidden for player
 *  - Back to lobby navigates to /lobby
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});

// Default auth: coach role
let mockUser = { id: 'user-1', name: 'Coach Alice', role: 'coach' };
vi.mock('../contexts/AuthContext.jsx', () => ({
  useAuth: () => ({ user: mockUser }),
}));

const mockApiFetch = vi.fn();
vi.mock('../lib/api.js', () => ({
  apiFetch: (...args) => mockApiFetch(...args),
}));

// Mock recharts to avoid SVG rendering complexity in jsdom
vi.mock('recharts', () => ({
  BarChart:          ({ children }) => <div data-testid="bar-chart">{children}</div>,
  Bar:               () => null,
  XAxis:             () => null,
  YAxis:             () => null,
  CartesianGrid:     () => null,
  Tooltip:           () => null,
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  Cell:              () => null,
}));

import AnalysisPage from '../pages/AnalysisPage.jsx';

// ── Fixtures ───────────────────────────────────────────────────────────────────

const PLAYERS = [
  { stableId: 'p1', name: 'Alice' },
  { stableId: 'p2', name: 'Bob'   },
];

const TAG_DATA = {
  totalHands: 25,
  tags: [
    { tag: 'C_BET',       tag_type: 'auto',    count: 15, pct: 60 },
    { tag: 'OPEN_LIMP',   tag_type: 'mistake',  count: 8,  pct: 32 },
    { tag: 'MIN_RAISE',   tag_type: 'mistake',  count: 5,  pct: 20 },
    { tag: 'FOLD_TO_PROBE', tag_type: 'mistake', count: 3, pct: 12 },
    { tag: 'PROBE_BET',   tag_type: 'sizing',   count: 6,  pct: 24 },
    { tag: 'HALF_POT_BET', tag_type: 'sizing',  count: 4,  pct: 16 },
  ],
};

const HANDS_FOR_TAG = {
  hands: [
    { hand_id: 'h1', started_at: '2026-03-01T10:00:00Z', winner_name: 'Alice', final_pot: 200, table_id: 'tbl-1', board: [], tags: ['OPEN_LIMP'] },
    { hand_id: 'h2', started_at: '2026-03-02T11:00:00Z', winner_name: 'Bob',   final_pot: 150, table_id: 'tbl-1', board: [], tags: ['OPEN_LIMP'] },
  ],
};

function renderPage() {
  return render(
    <MemoryRouter>
      <AnalysisPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUser = { id: 'user-1', name: 'Coach Alice', role: 'coach' };
  mockApiFetch.mockImplementation((url) => {
    if (url.includes('/api/players'))               return Promise.resolve({ players: PLAYERS });
    if (url.includes('/api/analysis/tags'))         return Promise.resolve(TAG_DATA);
    if (url.includes('/api/analysis/hands-by-tag')) return Promise.resolve(HANDS_FOR_TAG);
    return Promise.resolve({});
  });
});

// ── Helper: run analysis ───────────────────────────────────────────────────────

async function runAnalysis() {
  renderPage();
  await waitFor(() => screen.getByTestId('run-analysis-btn'));
  await act(async () => {
    fireEvent.click(screen.getByTestId('run-analysis-btn'));
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('AnalysisPage', () => {
  it('renders the AI Hand Analysis header', async () => {
    await act(async () => { renderPage(); });
    expect(screen.getByText('AI Hand Analysis')).toBeTruthy();
  });

  it('renders back to lobby button that navigates', async () => {
    await act(async () => { renderPage(); });
    const btn = screen.getByTestId('back-to-lobby');
    fireEvent.click(btn);
    expect(mockNavigate).toHaveBeenCalledWith('/lobby');
  });

  it('renders filter bar with player selector and date inputs', async () => {
    await act(async () => { renderPage(); });
    expect(screen.getByTestId('filter-player')).toBeTruthy();
    expect(screen.getByTestId('filter-date-from')).toBeTruthy();
    expect(screen.getByTestId('filter-date-to')).toBeTruthy();
  });

  it('populates player dropdown from API', async () => {
    await act(async () => { renderPage(); });
    await waitFor(() => {
      const select = screen.getByTestId('filter-player');
      expect(select.innerHTML).toContain('Alice');
      expect(select.innerHTML).toContain('Bob');
    });
  });

  it('shows summary bar with hand count after running analysis', async () => {
    await runAnalysis();
    await waitFor(() => {
      expect(screen.getByTestId('summary-bar')).toBeTruthy();
      expect(screen.getByTestId('summary-bar').textContent).toContain('25');
    });
  });

  it('renders tag distribution chart after running analysis', async () => {
    await runAnalysis();
    await waitFor(() => {
      expect(screen.getByTestId('tag-distribution-chart')).toBeTruthy();
    });
  });

  it('shows empty tag state when no tags returned', async () => {
    mockApiFetch.mockImplementation((url) => {
      if (url.includes('/api/players'))       return Promise.resolve({ players: [] });
      if (url.includes('/api/analysis/tags')) return Promise.resolve({ totalHands: 0, tags: [] });
      return Promise.resolve({});
    });
    await runAnalysis();
    await waitFor(() => {
      expect(screen.getByTestId('tag-dist-empty')).toBeTruthy();
    });
  });

  it('renders mistake breakdown chart after running analysis', async () => {
    await runAnalysis();
    await waitFor(() => {
      expect(screen.getByTestId('mistake-breakdown-chart')).toBeTruthy();
    });
  });

  it('shows empty mistake chart when no mistake tags', async () => {
    mockApiFetch.mockImplementation((url) => {
      if (url.includes('/api/players'))       return Promise.resolve({ players: PLAYERS });
      if (url.includes('/api/analysis/tags')) return Promise.resolve({
        totalHands: 10,
        tags: [{ tag: 'C_BET', tag_type: 'auto', count: 5, pct: 50 }],
      });
      return Promise.resolve({});
    });
    await runAnalysis();
    await waitFor(() => {
      expect(screen.getByTestId('mistake-chart-empty')).toBeTruthy();
    });
  });

  it('shows flagged hands panel after running analysis', async () => {
    await runAnalysis();
    await waitFor(() => {
      expect(screen.getByTestId('flagged-hands')).toBeTruthy();
    });
  });

  it('hand breakdown fetches hands-by-tag API after running analysis', async () => {
    await runAnalysis();
    await waitFor(() => {
      const calls = mockApiFetch.mock.calls.map(c => c[0]);
      expect(calls.some(u => u.includes('hands-by-tag'))).toBe(true);
    });
  });

  it('shows Compare Players button for coach role', async () => {
    await act(async () => { renderPage(); });
    expect(screen.getByTestId('toggle-compare')).toBeTruthy();
  });

  it('hides Compare Players button for player role', async () => {
    mockUser = { id: 'user-2', name: 'Bob', role: 'player' };
    // player role → AnalysisPage redirects to /lobby via <Navigate>, so component renders nothing
    // We should not see toggle-compare
    await act(async () => { renderPage(); });
    expect(screen.queryByTestId('toggle-compare')).toBeNull();
  });

  it('selecting a player refetches with playerId param after run', async () => {
    renderPage();
    await waitFor(() => screen.getByTestId('filter-player'));

    await act(async () => {
      fireEvent.change(screen.getByTestId('filter-player'), { target: { value: 'p1' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('run-analysis-btn'));
    });

    await waitFor(() => {
      const calls = mockApiFetch.mock.calls.map(c => c[0]);
      expect(calls.some(u => u.includes('/api/analysis/tags') && u.includes('playerId=p1'))).toBe(true);
    });
  });

  it('displays player name in header when player is selected', async () => {
    renderPage();
    await waitFor(() => screen.getByTestId('filter-player'));

    await act(async () => {
      fireEvent.change(screen.getByTestId('filter-player'), { target: { value: 'p1' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('run-analysis-btn'));
    });

    await waitFor(() => {
      expect(screen.getAllByText(/Alice/).length).toBeGreaterThan(0);
    });
  });
});

// ── Period quick-picks ─────────────────────────────────────────────────────────

describe('AnalysisPage period quick-picks', () => {
  const FAKE_NOW = new Date('2026-04-09T12:00:00Z');

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(FAKE_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders All time, 7d, 30d period pills', async () => {
    await act(async () => { renderPage(); });
    expect(screen.getByTestId('period-all')).toBeTruthy();
    expect(screen.getByTestId('period-7d')).toBeTruthy();
    expect(screen.getByTestId('period-30d')).toBeTruthy();
  });

  it('clicking 7d sets dateFrom to 7 days ago when Run Analysis is clicked', async () => {
    renderPage();
    await waitFor(() => screen.getByTestId('period-7d'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('period-7d'));
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('run-analysis-btn'));
    });

    await waitFor(() => {
      const calls = mockApiFetch.mock.calls.map(c => c[0]);
      const tagsCall = calls.find(u => u.includes('/api/analysis/tags'));
      expect(tagsCall).toBeTruthy();
      // dateFrom should be 2026-04-02 (7 days before 2026-04-09)
      expect(tagsCall).toMatch(/dateFrom=2026-04-02/);
      // dateTo should be today
      expect(tagsCall).toMatch(/dateTo=2026-04-09/);
    });
  });

  it('clicking 30d sets dateFrom to 30 days ago when Run Analysis is clicked', async () => {
    renderPage();
    await waitFor(() => screen.getByTestId('period-30d'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('period-30d'));
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('run-analysis-btn'));
    });

    await waitFor(() => {
      const calls = mockApiFetch.mock.calls.map(c => c[0]);
      const tagsCall = calls.find(u => u.includes('/api/analysis/tags'));
      expect(tagsCall).toBeTruthy();
      // dateFrom should be 2026-03-10 (30 days before 2026-04-09)
      expect(tagsCall).toMatch(/dateFrom=2026-03-10/);
      expect(tagsCall).toMatch(/dateTo=2026-04-09/);
    });
  });

  it('clicking All time clears dateFrom and dateTo from the query string', async () => {
    renderPage();
    await waitFor(() => screen.getByTestId('period-7d'));

    // Set 7d first
    await act(async () => { fireEvent.click(screen.getByTestId('period-7d')); });
    // Then switch to All time
    await act(async () => { fireEvent.click(screen.getByTestId('period-all')); });

    await act(async () => {
      fireEvent.click(screen.getByTestId('run-analysis-btn'));
    });

    await waitFor(() => {
      const calls = mockApiFetch.mock.calls.map(c => c[0]);
      const tagsCall = calls.find(u => u.includes('/api/analysis/tags'));
      expect(tagsCall).toBeTruthy();
      expect(tagsCall).not.toMatch(/dateFrom=/);
      expect(tagsCall).not.toMatch(/dateTo=/);
    });
  });
});

// ── Game type pills ────────────────────────────────────────────────────────────

describe('AnalysisPage gameType pills', () => {
  it('renders All, Cash, Tournament game type pills', async () => {
    await act(async () => { renderPage(); });
    expect(screen.getByTestId('game-all')).toBeTruthy();
    expect(screen.getByTestId('game-cash')).toBeTruthy();
    expect(screen.getByTestId('game-tournament')).toBeTruthy();
  });

  it('clicking Cash pill includes gameType=cash in the API call', async () => {
    renderPage();
    await waitFor(() => screen.getByTestId('game-cash'));

    await act(async () => { fireEvent.click(screen.getByTestId('game-cash')); });
    await act(async () => { fireEvent.click(screen.getByTestId('run-analysis-btn')); });

    await waitFor(() => {
      const calls = mockApiFetch.mock.calls.map(c => c[0]);
      const tagsCall = calls.find(u => u.includes('/api/analysis/tags'));
      expect(tagsCall).toMatch(/gameType=cash/);
    });
  });

  it('clicking Tournament pill includes gameType=tournament in the API call', async () => {
    renderPage();
    await waitFor(() => screen.getByTestId('game-tournament'));

    await act(async () => { fireEvent.click(screen.getByTestId('game-tournament')); });
    await act(async () => { fireEvent.click(screen.getByTestId('run-analysis-btn')); });

    await waitFor(() => {
      const calls = mockApiFetch.mock.calls.map(c => c[0]);
      const tagsCall = calls.find(u => u.includes('/api/analysis/tags'));
      expect(tagsCall).toMatch(/gameType=tournament/);
    });
  });

  it('clicking All game type omits gameType from query string', async () => {
    renderPage();
    await waitFor(() => screen.getByTestId('game-cash'));

    // Set cash first, then back to All
    await act(async () => { fireEvent.click(screen.getByTestId('game-cash')); });
    await act(async () => { fireEvent.click(screen.getByTestId('game-all')); });
    await act(async () => { fireEvent.click(screen.getByTestId('run-analysis-btn')); });

    await waitFor(() => {
      const calls = mockApiFetch.mock.calls.map(c => c[0]);
      const tagsCall = calls.find(u => u.includes('/api/analysis/tags'));
      expect(tagsCall).not.toMatch(/gameType=/);
    });
  });
});

// ── Tag type pills ─────────────────────────────────────────────────────────────

describe('AnalysisPage tagType pills', () => {
  it('renders All, Mistakes, Auto, Sizing, Coach tag type pills', async () => {
    await act(async () => { renderPage(); });
    expect(screen.getByTestId('tagtype-all')).toBeTruthy();
    expect(screen.getByTestId('tagtype-mistake')).toBeTruthy();
    expect(screen.getByTestId('tagtype-auto')).toBeTruthy();
    expect(screen.getByTestId('tagtype-sizing')).toBeTruthy();
    expect(screen.getByTestId('tagtype-coach')).toBeTruthy();
  });

  it('clicking Mistakes pill includes tagType=mistake in the API call', async () => {
    renderPage();
    await waitFor(() => screen.getByTestId('tagtype-mistake'));

    await act(async () => { fireEvent.click(screen.getByTestId('tagtype-mistake')); });
    await act(async () => { fireEvent.click(screen.getByTestId('run-analysis-btn')); });

    await waitFor(() => {
      const calls = mockApiFetch.mock.calls.map(c => c[0]);
      const tagsCall = calls.find(u => u.includes('/api/analysis/tags'));
      expect(tagsCall).toMatch(/tagType=mistake/);
    });
  });

  it('clicking Coach tag type pill includes tagType=coach in the API call', async () => {
    renderPage();
    await waitFor(() => screen.getByTestId('tagtype-coach'));

    await act(async () => { fireEvent.click(screen.getByTestId('tagtype-coach')); });
    await act(async () => { fireEvent.click(screen.getByTestId('run-analysis-btn')); });

    await waitFor(() => {
      const calls = mockApiFetch.mock.calls.map(c => c[0]);
      const tagsCall = calls.find(u => u.includes('/api/analysis/tags'));
      expect(tagsCall).toMatch(/tagType=coach/);
    });
  });
});

// ── Combined filter test ───────────────────────────────────────────────────────

describe('AnalysisPage combined filters', () => {
  const FAKE_NOW = new Date('2026-04-09T12:00:00Z');

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(FAKE_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('7d + Cash + Mistakes → all three params appear in the API call', async () => {
    renderPage();
    await waitFor(() => screen.getByTestId('period-7d'));

    await act(async () => { fireEvent.click(screen.getByTestId('period-7d')); });
    await act(async () => { fireEvent.click(screen.getByTestId('game-cash')); });
    await act(async () => { fireEvent.click(screen.getByTestId('tagtype-mistake')); });
    await act(async () => { fireEvent.click(screen.getByTestId('run-analysis-btn')); });

    await waitFor(() => {
      const calls = mockApiFetch.mock.calls.map(c => c[0]);
      const tagsCall = calls.find(u => u.includes('/api/analysis/tags'));
      expect(tagsCall).toBeTruthy();
      expect(tagsCall).toMatch(/dateFrom=2026-04-02/);
      expect(tagsCall).toMatch(/gameType=cash/);
      expect(tagsCall).toMatch(/tagType=mistake/);
    });
  });
});
