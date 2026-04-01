/**
 * MainLobbyPolish.test.jsx
 *
 * Tests for POK-30 lobby polish additions:
 *  - Trial banner shown for trial users, hidden for normal users
 *  - Navigation tiles rendered for all users (Leaderboard, Multi Table)
 *  - Admin-only tiles hidden from players
 *  - Admin-only tiles shown for admins
 *  - Leaderboard rank stat card shown for non-admin users when rank available
 *  - Leaderboard rank stat card hidden for admins
 *  - Nav tiles click navigates to correct routes
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

const mockHasPermission = vi.fn();
const mockUser = { id: 'user-1', name: 'Alice', role: 'player' };

vi.mock('../contexts/AuthContext.jsx', () => ({
  useAuth: () => ({
    user: mockUser,
    logout: vi.fn(),
    hasPermission: mockHasPermission,
  }),
}));

vi.mock('../contexts/LobbyContext.jsx', () => ({
  useLobby: () => ({
    activeTables: [],
    refreshTables: vi.fn(),
  }),
}));

const mockApiFetch = vi.fn();
vi.mock('../lib/api.js', () => ({
  apiFetch: (...args) => mockApiFetch(...args),
}));

import MainLobby from '../pages/MainLobby.jsx';

const PLAYERS = [
  { stable_id: 'user-2', display_name: 'Bob',   total_net_chips: 3000 },
  { stable_id: 'user-1', display_name: 'Alice', total_net_chips: 1500 },
  { stable_id: 'user-3', display_name: 'Carol', total_net_chips: 500  },
];

function renderLobby(role = 'player', isAdmin = false) {
  mockUser.role = role;
  mockHasPermission.mockImplementation((perm) => {
    if (perm === 'admin:access') return isAdmin;
    if (perm === 'table:create') return isAdmin;
    if (perm === 'playlist:manage') return isAdmin;
    return false;
  });

  return render(
    <MemoryRouter>
      <MainLobby />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUser.role = 'player';
  // Default: stats + hands + players + playlists responses
  mockApiFetch.mockImplementation((path) => {
    if (path.includes('/stats')) return Promise.resolve({ hands_played: 10, net_chips: 100, vpip: 25 });
    if (path.includes('/api/hands')) return Promise.resolve({ hands: [] });
    if (path === '/api/players') return Promise.resolve({ players: PLAYERS });
    if (path.includes('/api/players/') && path.includes('/stats')) return Promise.resolve({ hands_played: 10, net_chips: 100, vpip: 25 });
    if (path.includes('/api/playlists')) return Promise.resolve({ playlists: [] });
    return Promise.resolve({});
  });
});

// ── Trial Banner ───────────────────────────────────────────────────────────────

describe('MainLobby trial banner', () => {
  it('shows trial banner for trial role users', async () => {
    renderLobby('trial', false);
    await waitFor(() => expect(screen.queryByText(/Loading stats/i)).toBeNull());
    expect(screen.getByTestId('trial-banner')).toBeTruthy();
    expect(screen.getByText(/Trial Account/i)).toBeTruthy();
  });

  it('does not show trial banner for player role', async () => {
    renderLobby('player', false);
    await waitFor(() => expect(screen.queryByText(/Loading stats/i)).toBeNull());
    expect(screen.queryByTestId('trial-banner')).toBeNull();
  });

  it('does not show trial banner for admin/coach', async () => {
    renderLobby('coach', true);
    await waitFor(() => expect(screen.queryByText(/Loading stats/i)).toBeNull());
    expect(screen.queryByTestId('trial-banner')).toBeNull();
  });
});

// ── Navigation Tiles ───────────────────────────────────────────────────────────

describe('MainLobby navigation tiles', () => {
  it('renders nav tiles section', async () => {
    renderLobby('player', false);
    await waitFor(() => expect(screen.queryByText(/Loading stats/i)).toBeNull());
    expect(screen.getByTestId('nav-tiles')).toBeTruthy();
  });

  it('shows Leaderboard tile for all users', async () => {
    renderLobby('player', false);
    await waitFor(() => expect(screen.queryByText(/Loading stats/i)).toBeNull());
    expect(screen.getByTestId('nav-tile-leaderboard')).toBeTruthy();
  });

  it('shows Multi Table tile for all users', async () => {
    renderLobby('player', false);
    await waitFor(() => expect(screen.queryByText(/Loading stats/i)).toBeNull());
    expect(screen.getByTestId('nav-tile-multi-table')).toBeTruthy();
  });

  it('hides admin-only tiles for regular players', async () => {
    renderLobby('player', false);
    await waitFor(() => expect(screen.queryByText(/Loading stats/i)).toBeNull());
    expect(screen.queryByTestId('nav-tile-stable-/-crm')).toBeNull();
    expect(screen.queryByTestId('nav-tile-users')).toBeNull();
  });

  it('shows admin tiles for admin users', async () => {
    renderLobby('coach', true);
    await waitFor(() => expect(screen.queryByText(/Loading stats/i)).toBeNull());
    expect(screen.getByTestId('nav-tile-stable-/-crm')).toBeTruthy();
    expect(screen.getByTestId('nav-tile-users')).toBeTruthy();
    expect(screen.getByTestId('nav-tile-tournaments')).toBeTruthy();
  });

  it('Leaderboard tile navigates to /leaderboard', async () => {
    renderLobby('player', false);
    await waitFor(() => expect(screen.queryByText(/Loading stats/i)).toBeNull());
    fireEvent.click(screen.getByTestId('nav-tile-leaderboard'));
    expect(mockNavigate).toHaveBeenCalledWith('/leaderboard');
  });

  it('Multi Table tile navigates to /multi', async () => {
    renderLobby('player', false);
    await waitFor(() => expect(screen.queryByText(/Loading stats/i)).toBeNull());
    fireEvent.click(screen.getByTestId('nav-tile-multi-table'));
    expect(mockNavigate).toHaveBeenCalledWith('/multi');
  });

  it('Stable/CRM tile navigates to /admin/crm for admin', async () => {
    renderLobby('coach', true);
    await waitFor(() => expect(screen.queryByText(/Loading stats/i)).toBeNull());
    fireEvent.click(screen.getByTestId('nav-tile-stable-/-crm'));
    expect(mockNavigate).toHaveBeenCalledWith('/admin/crm');
  });
});

// ── Leaderboard Rank Stat Card ─────────────────────────────────────────────────

describe('MainLobby leaderboard rank', () => {
  it('shows rank stat card for non-admin users when rank is computed', async () => {
    renderLobby('player', false);
    // Alice is rank #2 in the sorted list (Bob 3000 > Alice 1500 > Carol 500)
    await waitFor(() => screen.queryByText('#2'));
    expect(screen.getByText('#2')).toBeTruthy();
    expect(screen.getByText('Leaderboard Rank')).toBeTruthy();
  });

  it('does not show rank stat card for admin users', async () => {
    renderLobby('coach', true);
    await waitFor(() => expect(screen.queryByText(/Loading stats/i)).toBeNull());
    // Admins skip the rank fetch
    expect(screen.queryByText('Leaderboard Rank')).toBeNull();
  });

  it('does not show rank card when players API fails', async () => {
    mockApiFetch.mockImplementation((path) => {
      if (path.includes('/stats')) return Promise.resolve({ hands_played: 5, net_chips: 0, vpip: 20 });
      if (path.includes('/api/hands')) return Promise.resolve({ hands: [] });
      if (path.includes('/api/players') && !path.includes('/stats')) return Promise.reject(new Error('fail'));
      return Promise.resolve({});
    });
    renderLobby('player', false);
    await waitFor(() => expect(screen.queryByText(/Loading stats/i)).toBeNull());
    expect(screen.queryByText('Leaderboard Rank')).toBeNull();
  });
});

// ── Header Leaderboard Link ────────────────────────────────────────────────────

describe('MainLobby header leaderboard nav', () => {
  it('renders leaderboard button in header', async () => {
    renderLobby('player', false);
    await waitFor(() => expect(screen.queryByText(/Loading stats/i)).toBeNull());
    const btn = screen.getByTestId('nav-leaderboard');
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(mockNavigate).toHaveBeenCalledWith('/leaderboard');
  });
});
