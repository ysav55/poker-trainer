/**
 * LeaderboardPage.test.jsx
 *
 * Tests for the /leaderboard route:
 *  - Renders header and table structure
 *  - Shows loading state
 *  - Displays players from API
 *  - Highlights current user row with YOU badge
 *  - Sorts by net chips descending
 *  - Period filter tabs render and toggle active state
 *  - Search filters by player name
 *  - Shows empty state when no players match
 *  - Net chips colored green/red/neutral
 *  - Back to lobby link
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../contexts/AuthContext.jsx', () => ({
  useAuth: () => ({
    user: { id: 'user-1', name: 'Alice', role: 'player' },
  }),
}));

const mockApiFetch = vi.fn();
vi.mock('../lib/api.js', () => ({
  apiFetch: (...args) => mockApiFetch(...args),
}));

import LeaderboardPage from '../pages/LeaderboardPage.jsx';

function renderPage() {
  return render(
    <MemoryRouter>
      <LeaderboardPage />
    </MemoryRouter>
  );
}

const PLAYERS = [
  { stable_id: 'user-1', display_name: 'Alice', total_hands: 50, total_wins: 20, total_net_chips: 1500, vpip_percent: 28, pfr_percent: 22 },
  { stable_id: 'user-2', display_name: 'Bob',   total_hands: 40, total_wins: 15, total_net_chips: -200, vpip_percent: 35, pfr_percent: 18 },
  { stable_id: 'user-3', display_name: 'Carol', total_hands: 60, total_wins: 30, total_net_chips: 800,  vpip_percent: 24, pfr_percent: 20 },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockApiFetch.mockResolvedValue({ players: PLAYERS });
});

// ── Header ─────────────────────────────────────────────────────────────────────

describe('LeaderboardPage header', () => {
  it('shows the Leaderboard title', async () => {
    renderPage();
    await waitFor(() => expect(screen.queryByText(/Loading/i)).toBeNull());
    const headings = screen.getAllByText(/Leaderboard/i);
    expect(headings.length).toBeGreaterThanOrEqual(1);
  });

  it('renders a back-to-lobby button that navigates', async () => {
    renderPage();
    await waitFor(() => expect(screen.queryByText(/Loading/i)).toBeNull());
    const back = screen.getByText(/← Lobby/i);
    fireEvent.click(back);
    expect(mockNavigate).toHaveBeenCalledWith('/lobby');
  });

  it('shows the current user name', async () => {
    renderPage();
    await waitFor(() => expect(screen.queryByText(/Loading/i)).toBeNull());
    expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(1);
  });
});

// ── Loading / fetching ─────────────────────────────────────────────────────────

describe('LeaderboardPage loading state', () => {
  it('shows loading indicator before data arrives', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {})); // never resolves
    renderPage();
    expect(screen.getByText(/Loading/i)).toBeTruthy();
  });

  it('hides loading after data arrives', async () => {
    renderPage();
    await waitFor(() => expect(screen.queryByText(/Loading…/i)).toBeNull());
  });

  it('shows error message when API fails', async () => {
    mockApiFetch.mockRejectedValue(new Error('Network error'));
    renderPage();
    await waitFor(() => expect(screen.queryByText(/Loading…/i)).toBeNull());
    expect(screen.getByText(/Network error/i)).toBeTruthy();
  });
});

// ── Player rows ────────────────────────────────────────────────────────────────

describe('LeaderboardPage player rows', () => {
  it('renders all players from API', async () => {
    renderPage();
    await waitFor(() => expect(screen.queryByText(/Loading…/i)).toBeNull());
    expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Bob')).toBeTruthy();
    expect(screen.getByText('Carol')).toBeTruthy();
  });

  it('marks current user row with data-testid and YOU badge', async () => {
    renderPage();
    await waitFor(() => expect(screen.queryByText(/Loading…/i)).toBeNull());
    expect(screen.getByTestId('current-user-row')).toBeTruthy();
    expect(screen.getByText('YOU')).toBeTruthy();
  });

  it('sorts players by net chips descending (Alice 1500 > Carol 800 > Bob -200)', async () => {
    renderPage();
    await waitFor(() => expect(screen.queryByText(/Loading…/i)).toBeNull());
    const rows = screen.getAllByRole('row').slice(1); // skip header
    const names = rows.map((r) => r.textContent);
    const aliceIdx = names.findIndex((t) => t.includes('Alice'));
    const carolIdx = names.findIndex((t) => t.includes('Carol'));
    const bobIdx   = names.findIndex((t) => t.includes('Bob'));
    expect(aliceIdx).toBeLessThan(carolIdx);
    expect(carolIdx).toBeLessThan(bobIdx);
  });

  it('shows medal emojis for top 3', async () => {
    renderPage();
    await waitFor(() => expect(screen.queryByText(/Loading…/i)).toBeNull());
    expect(screen.getByText('🥇')).toBeTruthy();
    expect(screen.getByText('🥈')).toBeTruthy();
    expect(screen.getByText('🥉')).toBeTruthy();
  });
});

// ── Empty state ────────────────────────────────────────────────────────────────

describe('LeaderboardPage empty state', () => {
  it('shows empty state when API returns no players', async () => {
    mockApiFetch.mockResolvedValue({ players: [] });
    renderPage();
    await waitFor(() => expect(screen.queryByText(/Loading…/i)).toBeNull());
    expect(screen.getByTestId('empty-state')).toBeTruthy();
  });
});

// ── Period tabs ────────────────────────────────────────────────────────────────

describe('LeaderboardPage period tabs', () => {
  it('renders All Time, 30 Days, 7 Days tabs', async () => {
    renderPage();
    await waitFor(() => expect(screen.queryByText(/Loading…/i)).toBeNull());
    expect(screen.getByTestId('period-all')).toBeTruthy();
    expect(screen.getByTestId('period-30d')).toBeTruthy();
    expect(screen.getByTestId('period-7d')).toBeTruthy();
  });

  it('clicking a period tab does not crash', async () => {
    renderPage();
    await waitFor(() => expect(screen.queryByText(/Loading…/i)).toBeNull());
    fireEvent.click(screen.getByTestId('period-7d'));
    // wait for re-fetch to complete before asserting
    await waitFor(() => expect(screen.queryByText(/Loading…/i)).toBeNull());
    expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(1);
  });
});

// ── Search ─────────────────────────────────────────────────────────────────────

describe('LeaderboardPage search', () => {
  it('filters list by player name', async () => {
    renderPage();
    await waitFor(() => expect(screen.queryByText(/Loading…/i)).toBeNull());
    fireEvent.change(screen.getByTestId('leaderboard-search'), { target: { value: 'Bob' } });
    expect(screen.getByText('Bob')).toBeTruthy();
    expect(screen.queryByText('Carol')).toBeNull();
  });

  it('shows empty state when search matches nothing', async () => {
    renderPage();
    await waitFor(() => expect(screen.queryByText(/Loading…/i)).toBeNull());
    fireEvent.change(screen.getByTestId('leaderboard-search'), { target: { value: 'zzznomatch' } });
    expect(screen.getByTestId('empty-state')).toBeTruthy();
  });

  it('shows player count label including search term', async () => {
    renderPage();
    await waitFor(() => expect(screen.queryByText(/Loading…/i)).toBeNull());
    fireEvent.change(screen.getByTestId('leaderboard-search'), { target: { value: 'Alice' } });
    expect(screen.getByText(/matching "Alice"/i)).toBeTruthy();
  });
});

// ── Net chips colors ───────────────────────────────────────────────────────────

describe('LeaderboardPage net chips formatting', () => {
  it('formats positive net chips with + sign', async () => {
    renderPage();
    await waitFor(() => expect(screen.queryByText(/Loading…/i)).toBeNull());
    expect(screen.getByText('+1,500')).toBeTruthy();
  });

  it('formats negative net chips without + sign', async () => {
    renderPage();
    await waitFor(() => expect(screen.queryByText(/Loading…/i)).toBeNull());
    expect(screen.getByText('-200')).toBeTruthy();
  });
});

// ── Filter query params ────────────────────────────────────────────────────────

describe('LeaderboardPage filter query params', () => {
  it('calls apiFetch with ?period=7d when 7 Days tab is clicked', async () => {
    renderPage();
    // Wait for initial load to finish
    await waitFor(() => expect(screen.queryByText(/Loading…/i)).toBeNull());

    // Reset mock so we can assert the next call cleanly
    vi.clearAllMocks();
    mockApiFetch.mockResolvedValue({ players: PLAYERS });

    fireEvent.click(screen.getByTestId('period-7d'));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/api/players?period=7d')
    );
  });

  it('calls apiFetch with ?period=30d when 30 Days tab is clicked', async () => {
    renderPage();
    await waitFor(() => expect(screen.queryByText(/Loading…/i)).toBeNull());

    vi.clearAllMocks();
    mockApiFetch.mockResolvedValue({ players: PLAYERS });

    fireEvent.click(screen.getByTestId('period-30d'));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/api/players?period=30d')
    );
  });

  it('calls apiFetch with no query params when All Time tab is clicked (default)', async () => {
    renderPage();
    await waitFor(() => expect(screen.queryByText(/Loading…/i)).toBeNull());

    // Switch to 7d first, then back to all — verifies the all-time path
    vi.clearAllMocks();
    mockApiFetch.mockResolvedValue({ players: PLAYERS });
    fireEvent.click(screen.getByTestId('period-7d'));
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());

    vi.clearAllMocks();
    mockApiFetch.mockResolvedValue({ players: PLAYERS });
    fireEvent.click(screen.getByTestId('period-all'));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/api/players')
    );
  });

  it('calls apiFetch with ?gameType=cash when Cash tab is clicked', async () => {
    renderPage();
    await waitFor(() => expect(screen.queryByText(/Loading…/i)).toBeNull());

    vi.clearAllMocks();
    mockApiFetch.mockResolvedValue({ players: PLAYERS });

    fireEvent.click(screen.getByText('Cash'));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/api/players?gameType=cash')
    );
  });

  it('calls apiFetch with ?gameType=tournament when Tournament tab is clicked', async () => {
    renderPage();
    await waitFor(() => expect(screen.queryByText(/Loading…/i)).toBeNull());

    vi.clearAllMocks();
    mockApiFetch.mockResolvedValue({ players: PLAYERS });

    fireEvent.click(screen.getByText('Tournament'));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/api/players?gameType=tournament')
    );
  });

  it('calls apiFetch with both params when period and gameType are both set', async () => {
    renderPage();
    await waitFor(() => expect(screen.queryByText(/Loading…/i)).toBeNull());

    // Set period first
    vi.clearAllMocks();
    mockApiFetch.mockResolvedValue({ players: PLAYERS });
    fireEvent.click(screen.getByTestId('period-7d'));
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());

    // Now set gameType
    vi.clearAllMocks();
    mockApiFetch.mockResolvedValue({ players: PLAYERS });
    fireEvent.click(screen.getByText('Cash'));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/api/players?period=7d&gameType=cash')
    );
  });
});
