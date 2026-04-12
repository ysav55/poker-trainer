/**
 * StableManagement.test.jsx
 *
 * Tests for the Stable Overview integrated into PlayerCRM:
 *  - Stable roster renders when no player is selected (default state)
 *  - Players are fetched and shown as rows
 *  - VPIP/PFR stats merged from /api/players
 *  - Search filter narrows the list
 *  - Sort by name, last active, hands
 *  - "View CRM →" button selects the player
 *  - After selecting, PlayerDetail is shown with "← Stable" back button
 *  - Clicking back returns to the roster
 *  - Empty state when no players
 *  - Sidebar header shows "STABLE / CRM"
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => vi.fn() };
});

const mockApiFetch = vi.fn();
vi.mock('../lib/api', () => ({
  apiFetch: (...args) => mockApiFetch(...args),
}));

// Mock recharts
vi.mock('recharts', () => ({
  LineChart:        ({ children }) => <div>{children}</div>,
  Line:             () => null,
  BarChart:         ({ children }) => <div>{children}</div>,
  Bar:              () => null,
  XAxis:            () => null,
  YAxis:            () => null,
  CartesianGrid:    () => null,
  Tooltip:          () => null,
  Legend:           () => null,
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
}));

import PlayerCRM from '../pages/admin/PlayerCRM.jsx';

// ── Fixtures ───────────────────────────────────────────────────────────────────

const ADMIN_PLAYERS = [
  {
    id: 'player-1',
    display_name: 'Alice',
    role: 'player',
    status: 'active',
    last_seen: '2026-03-20T10:00:00Z',
    player_roles: [{ roles: { name: 'player' } }],
  },
  {
    id: 'player-2',
    display_name: 'Bob',
    role: 'coach',
    status: 'active',
    last_seen: '2026-03-18T10:00:00Z',
    player_roles: [{ roles: { name: 'coach' } }],
  },
  {
    id: 'player-3',
    display_name: 'Carol',
    role: 'player',
    status: 'active',
    last_seen: '2026-03-15T10:00:00Z',
    player_roles: [{ roles: { name: 'player' } }],
  },
];

const PUBLIC_PLAYERS = {
  players: [
    { stableId: 'player-1', name: 'Alice', total_hands: 50,  vpip_percent: 28, pfr_percent: 22, last_hand_at: '2026-03-20T10:00:00Z' },
    { stableId: 'player-2', name: 'Bob',   total_hands: 80,  vpip_percent: 32, pfr_percent: 25, last_hand_at: '2026-03-18T10:00:00Z' },
    { stableId: 'player-3', name: 'Carol', total_hands: 30,  vpip_percent: 24, pfr_percent: 18, last_hand_at: '2026-03-15T10:00:00Z' },
  ],
};

const CRM_DATA = {
  stats: { total_hands: 50, vpip_percent: 28, pfr_percent: 22 },
  tags: [],
  upcoming_sessions: [],
  notes_summary: [],
};

function renderCRM() {
  return render(
    <MemoryRouter>
      <PlayerCRM />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockApiFetch.mockImplementation((url) => {
    if (url === '/api/admin/players')          return Promise.resolve(ADMIN_PLAYERS);
    if (url === '/api/players')               return Promise.resolve(PUBLIC_PLAYERS);
    if (url.includes('/crm'))                 return Promise.resolve(CRM_DATA);
    if (url.includes('/notes'))               return Promise.resolve([]);
    if (url.includes('/schedule'))            return Promise.resolve([]);
    if (url.includes('/hands'))               return Promise.resolve({ hands: [] });
    if (url.includes('/tags'))                return Promise.resolve([]);
    return Promise.resolve({});
  });
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('StableManagement tab in PlayerCRM', () => {
  it('shows sidebar header with "STABLE / CRM"', async () => {
    await act(async () => { renderCRM(); });
    expect(screen.getByText('STABLE / CRM')).toBeTruthy();
  });

  it('renders stable roster grid by default (no player selected)', async () => {
    await act(async () => { renderCRM(); });
    await waitFor(() => {
      expect(screen.getByTestId('stable-roster')).toBeTruthy();
    });
  });

  it('shows all players in the roster', async () => {
    await act(async () => { renderCRM(); });
    await waitFor(() => {
      expect(screen.getByTestId('stable-row-player-1')).toBeTruthy();
      expect(screen.getByTestId('stable-row-player-2')).toBeTruthy();
      expect(screen.getByTestId('stable-row-player-3')).toBeTruthy();
    });
  });

  it('displays VPIP and PFR merged from /api/players', async () => {
    await act(async () => { renderCRM(); });
    await waitFor(() => {
      const row = screen.getByTestId('stable-row-player-1');
      expect(row.textContent).toContain('28%'); // VPIP
      expect(row.textContent).toContain('22%'); // PFR
    });
  });

  it('search filter narrows player list', async () => {
    await act(async () => { renderCRM(); });
    await waitFor(() => screen.getByTestId('stable-search'));

    await act(async () => {
      fireEvent.change(screen.getByTestId('stable-search'), { target: { value: 'bob' } });
    });

    await waitFor(() => {
      expect(screen.queryByTestId('stable-row-player-1')).toBeNull();
      expect(screen.getByTestId('stable-row-player-2')).toBeTruthy();
    });
  });

  it('sort by hands orders players correctly', async () => {
    await act(async () => { renderCRM(); });
    await waitFor(() => screen.getByTestId('stable-sort'));

    await act(async () => {
      fireEvent.change(screen.getByTestId('stable-sort'), { target: { value: 'hands' } });
    });

    await waitFor(() => {
      const rows = screen.getAllByTestId(/stable-row-/);
      // Bob has 80 hands, Alice 50, Carol 30 — Bob should be first
      expect(rows[0].getAttribute('data-testid')).toBe('stable-row-player-2');
    });
  });

  it('clicking View CRM selects the player and shows PlayerDetail with back button', async () => {
    await act(async () => { renderCRM(); });
    await waitFor(() => screen.getByTestId('stable-view-crm-player-1'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('stable-view-crm-player-1'));
    });

    // PlayerDetail is shown (stable-roster is gone, back button appears)
    await waitFor(() => {
      expect(screen.queryByTestId('stable-roster')).toBeNull();
      expect(screen.getByTestId('stable-back')).toBeTruthy();
    });
  });

  it('shows "← Stable" back button in PlayerDetail', async () => {
    await act(async () => { renderCRM(); });
    await waitFor(() => screen.getByTestId('stable-view-crm-player-1'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('stable-view-crm-player-1'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('stable-back')).toBeTruthy();
    });
  });

  it('clicking back returns to stable roster', async () => {
    await act(async () => { renderCRM(); });
    await waitFor(() => screen.getByTestId('stable-view-crm-player-1'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('stable-view-crm-player-1'));
    });
    await waitFor(() => screen.getByTestId('stable-back'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('stable-back'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('stable-roster')).toBeTruthy();
    });
  });

  it('shows empty state when no players found after search', async () => {
    await act(async () => { renderCRM(); });
    await waitFor(() => screen.getByTestId('stable-search'));

    await act(async () => {
      fireEvent.change(screen.getByTestId('stable-search'), { target: { value: 'zzz-no-match' } });
    });

    await waitFor(() => {
      expect(screen.getByTestId('stable-empty')).toBeTruthy();
    });
  });

  it('shows hand count for players with recorded hands', async () => {
    await act(async () => { renderCRM(); });
    await waitFor(() => {
      const row = screen.getByTestId('stable-row-player-2');
      expect(row.textContent).toContain('80'); // Bob's hand count
    });
  });
});
