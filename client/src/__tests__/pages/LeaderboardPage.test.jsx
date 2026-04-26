import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter as Router } from 'react-router-dom';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import LeaderboardPage from '../../pages/LeaderboardPage.jsx';
import { AuthContext } from '../../contexts/AuthContext.jsx';
import * as apiLib from '../../lib/api.js';

// Mock the API
vi.mock('../../lib/api.js');

const mockAuthContext = {
  user: { id: 'user-1', role: 'solo_student' },
  login: vi.fn(),
  logout: vi.fn(),
  register: vi.fn(),
};

const mockPlayers = [
  { id: 'p1', stable_id: 'p1', name: 'Alice', total_hands: 100, total_wins: 25, total_net_chips: 500 },
  { id: 'p2', stable_id: 'p2', name: 'Bob', total_hands: 80, total_wins: 20, total_net_chips: 400 },
  { id: 'p3', stable_id: 'p3', name: 'Charlie', total_hands: 60, total_wins: 18, total_net_chips: 300 },
];

describe('LeaderboardPage — Dynamic Metric Sorting & Scoring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Dynamic sorting by sort_by', () => {
    it('should sort by net_chips when sort_by is net_chips', async () => {
      const leaderboardConfig = {
        value: { columns: ['hands_played', 'net_chips', 'vpip', 'pfr'], sort_by: 'net_chips' },
        source: 'hardcoded',
      };

      apiLib.apiFetch.mockResolvedValueOnce({ players: mockPlayers, leaderboardConfig });

      render(
        <Router>
          <AuthContext.Provider value={mockAuthContext}>
            <LeaderboardPage />
          </AuthContext.Provider>
        </Router>
      );

      await waitFor(() => {
        expect(screen.getByText('Alice')).toBeInTheDocument();
      });

      // Players should be sorted by total_net_chips DESC: Alice (500), Bob (400), Charlie (300)
      const rows = screen.getAllByRole('row');
      expect(rows[1]).toHaveTextContent('Alice');
      expect(rows[2]).toHaveTextContent('Bob');
      expect(rows[3]).toHaveTextContent('Charlie');
    });

    it('should sort by hands_played when sort_by is hands_played', async () => {
      const leaderboardConfig = {
        value: { columns: ['hands_played', 'bb_per_100', 'vpip', 'pfr'], sort_by: 'hands_played' },
        source: 'school',
      };

      apiLib.apiFetch.mockResolvedValueOnce({ players: mockPlayers, leaderboardConfig });

      render(
        <Router>
          <AuthContext.Provider value={mockAuthContext}>
            <LeaderboardPage />
          </AuthContext.Provider>
        </Router>
      );

      await waitFor(() => {
        expect(screen.getByText('Alice')).toBeInTheDocument();
      });

      // Players should be sorted by total_hands DESC: Alice (100), Bob (80), Charlie (60)
      const rows = screen.getAllByRole('row');
      expect(rows[1]).toHaveTextContent('Alice');
      expect(rows[2]).toHaveTextContent('Bob');
      expect(rows[3]).toHaveTextContent('Charlie');
    });

    it('should sort by win_rate when sort_by is win_rate', async () => {
      const players = [
        { id: 'p1', stable_id: 'p1', name: 'Alice', total_hands: 100, total_wins: 30, total_net_chips: 500 },
        { id: 'p2', stable_id: 'p2', name: 'Bob', total_hands: 80, total_wins: 20, total_net_chips: 400 },
        { id: 'p3', stable_id: 'p3', name: 'Charlie', total_hands: 60, total_wins: 18, total_net_chips: 300 },
      ];

      const leaderboardConfig = {
        value: { columns: ['hands_played', 'win_rate', 'vpip', 'pfr'], sort_by: 'win_rate' },
        source: 'org',
      };

      apiLib.apiFetch.mockResolvedValueOnce({ players, leaderboardConfig });

      render(
        <Router>
          <AuthContext.Provider value={mockAuthContext}>
            <LeaderboardPage />
          </AuthContext.Provider>
        </Router>
      );

      await waitFor(() => {
        expect(screen.getByText('Alice')).toBeInTheDocument();
      });

      // Alice: 30/100=30%, Bob: 20/80=25%, Charlie: 18/60=30%
      // Stable sort desc: Alice(30%), Charlie(30%), Bob(25%)
      const rows = screen.getAllByRole('row');
      expect(rows[1]).toHaveTextContent('Alice'); // 30%
      expect(rows[2]).toHaveTextContent('Charlie'); // 30%, stable after Alice
      expect(rows[3]).toHaveTextContent('Bob'); // 25%
    });

    it('should sort by bb_per_100 when sort_by is bb_per_100', async () => {
      const players = [
        { id: 'p1', stable_id: 'p1', name: 'Alice',   total_hands: 100, total_wins: 25, total_net_chips: 500, bb_per_100: 10 },
        { id: 'p2', stable_id: 'p2', name: 'Bob',     total_hands: 100, total_wins: 20, total_net_chips: 400, bb_per_100: 5  },
        { id: 'p3', stable_id: 'p3', name: 'Charlie', total_hands: 100, total_wins: 18, total_net_chips: 300, bb_per_100: 2  },
      ];

      const leaderboardConfig = {
        value: { columns: ['hands_played', 'bb_per_100', 'vpip', 'pfr'], sort_by: 'bb_per_100' },
        source: 'school',
      };

      apiLib.apiFetch.mockResolvedValueOnce({ players, leaderboardConfig });

      render(
        <Router>
          <AuthContext.Provider value={mockAuthContext}>
            <LeaderboardPage />
          </AuthContext.Provider>
        </Router>
      );

      await waitFor(() => {
        expect(screen.getByText('Alice')).toBeInTheDocument();
      });

      // Alice(10) > Bob(5) > Charlie(2)
      const rows = screen.getAllByRole('row');
      expect(rows[1]).toHaveTextContent('Alice');
      expect(rows[2]).toHaveTextContent('Bob');
      expect(rows[3]).toHaveTextContent('Charlie');
    });

    it('should fall back to bb_per_100 when leaderboardConfig is null', async () => {
      const playersWithBb = mockPlayers.map((p, i) => ({ ...p, bb_per_100: [10, 5, 2][i] }));
      apiLib.apiFetch.mockResolvedValueOnce({ players: playersWithBb, leaderboardConfig: null });

      render(
        <Router>
          <AuthContext.Provider value={mockAuthContext}>
            <LeaderboardPage />
          </AuthContext.Provider>
        </Router>
      );

      await waitFor(() => {
        expect(screen.getByText('Alice')).toBeInTheDocument();
      });

      // Default sort_by = bb_per_100: Alice(10) > Bob(5) > Charlie(2)
      const rows = screen.getAllByRole('row');
      expect(rows[1]).toHaveTextContent('Alice');
      expect(rows[2]).toHaveTextContent('Bob');
      expect(rows[3]).toHaveTextContent('Charlie');
    });
  });

  describe('Column display by columns config', () => {
    it('should show bb_per_100 column value when columns includes bb_per_100', async () => {
      const players = [
        { id: 'p1', stable_id: 'p1', name: 'Alice', total_hands: 100, total_wins: 25, total_net_chips: 500, bb_per_100: 5 },
      ];

      const leaderboardConfig = {
        value: { columns: ['hands_played', 'bb_per_100', 'vpip', 'pfr'], sort_by: 'bb_per_100' },
        source: 'hardcoded',
      };

      apiLib.apiFetch.mockResolvedValueOnce({ players, leaderboardConfig });

      render(
        <Router>
          <AuthContext.Provider value={mockAuthContext}>
            <LeaderboardPage />
          </AuthContext.Provider>
        </Router>
      );

      await waitFor(() => {
        expect(screen.getByText('Alice')).toBeInTheDocument();
      });

      // bb_per_100 = 5 → formatted as +5 (signed_number)
      const rows = screen.getAllByRole('row');
      const bbCell = rows[1].querySelectorAll('td')[3]; // rank, name, hands, bb_per_100
      expect(bbCell.textContent).toMatch(/\+5/);
    });

    it('should show win_rate column value when columns includes win_rate', async () => {
      const players = [
        { id: 'p1', stable_id: 'p1', name: 'Alice', total_hands: 100, total_wins: 25, total_net_chips: 500 },
      ];

      const leaderboardConfig = {
        value: { columns: ['hands_played', 'win_rate', 'vpip', 'pfr'], sort_by: 'win_rate' },
        source: 'org',
      };

      apiLib.apiFetch.mockResolvedValueOnce({ players, leaderboardConfig });

      render(
        <Router>
          <AuthContext.Provider value={mockAuthContext}>
            <LeaderboardPage />
          </AuthContext.Provider>
        </Router>
      );

      await waitFor(() => {
        expect(screen.getByText('Alice')).toBeInTheDocument();
      });

      // win_rate = 25/100 = 25%
      const rows = screen.getAllByRole('row');
      const cell = rows[1].querySelectorAll('td')[3]; // rank, name, hands, win_rate
      expect(cell.textContent).toMatch(/25%/);
    });

    it('should show net_chips column value when columns includes net_chips', async () => {
      const players = [
        { id: 'p1', stable_id: 'p1', name: 'Alice', total_hands: 100, total_wins: 25, total_net_chips: 500 },
      ];

      const leaderboardConfig = {
        value: { columns: ['hands_played', 'net_chips', 'vpip', 'pfr'], sort_by: 'net_chips' },
        source: 'school',
      };

      apiLib.apiFetch.mockResolvedValueOnce({ players, leaderboardConfig });

      render(
        <Router>
          <AuthContext.Provider value={mockAuthContext}>
            <LeaderboardPage />
          </AuthContext.Provider>
        </Router>
      );

      await waitFor(() => {
        expect(screen.getByText('Alice')).toBeInTheDocument();
      });

      // net_chips = 500 → formatted as +500 (signed_number)
      const rows = screen.getAllByRole('row');
      const cell = rows[1].querySelectorAll('td')[3]; // rank, name, hands, net_chips
      expect(cell.textContent).toMatch(/\+500/);
    });

    it('should show hands_played column value', async () => {
      const players = [
        { id: 'p1', stable_id: 'p1', name: 'Alice', total_hands: 100, total_wins: 25, total_net_chips: 500 },
      ];

      const leaderboardConfig = {
        value: { columns: ['hands_played', 'bb_per_100', 'vpip', 'pfr'], sort_by: 'hands_played' },
        source: 'hardcoded',
      };

      apiLib.apiFetch.mockResolvedValueOnce({ players, leaderboardConfig });

      render(
        <Router>
          <AuthContext.Provider value={mockAuthContext}>
            <LeaderboardPage />
          </AuthContext.Provider>
        </Router>
      );

      await waitFor(() => {
        expect(screen.getByText('Alice')).toBeInTheDocument();
      });

      // hands_played = 100
      const rows = screen.getAllByRole('row');
      const cell = rows[1].querySelectorAll('td')[2]; // rank, name, hands
      expect(cell.textContent).toMatch(/100/);
    });

    it('should render column headers matching STAT_CATALOG labels', async () => {
      const leaderboardConfig = {
        value: { columns: ['hands_played', 'bb_per_100', 'vpip', 'pfr'], sort_by: 'bb_per_100' },
        source: 'hardcoded',
      };

      apiLib.apiFetch.mockResolvedValueOnce({ players: mockPlayers, leaderboardConfig });

      render(
        <Router>
          <AuthContext.Provider value={mockAuthContext}>
            <LeaderboardPage />
          </AuthContext.Provider>
        </Router>
      );

      await waitFor(() => {
        expect(screen.getByText('Alice')).toBeInTheDocument();
      });

      const headers = screen.getAllByRole('columnheader');
      // Find the header with the dynamic title (only the score column has a title attribute)
      const headerText = headers.map(h => h.textContent.trim());
      expect(headerText.some(t => t.includes('Hands'))).toBe(true);
      expect(headerText.some(t => t.includes('BB/100'))).toBe(true);
      expect(headerText.some(t => /VPIP/i.test(t))).toBe(true);
      expect(headerText.some(t => /PFR/i.test(t))).toBe(true);
    });
  });

  describe('Search and filter integration', () => {
    it('should preserve sort order when searching', async () => {
      const user = userEvent.setup();
      const leaderboardConfig = {
        value: { columns: ['hands_played', 'net_chips', 'vpip', 'pfr'], sort_by: 'net_chips' },
        source: 'hardcoded',
      };

      apiLib.apiFetch.mockResolvedValueOnce({ players: mockPlayers, leaderboardConfig });

      render(
        <Router>
          <AuthContext.Provider value={mockAuthContext}>
            <LeaderboardPage />
          </AuthContext.Provider>
        </Router>
      );

      await waitFor(() => {
        expect(screen.getByText('Alice')).toBeInTheDocument();
      });

      // Verify initial sort (Alice 500 > Bob 400 > Charlie 300)
      let rows = screen.getAllByRole('row');
      expect(rows[1]).toHaveTextContent('Alice');

      // Search for Bob
      const searchInput = screen.getByTestId('leaderboard-search');
      await user.type(searchInput, 'Bob');

      // Only Bob should be visible, still in first position
      await waitFor(() => {
        rows = screen.getAllByRole('row');
        expect(rows[1]).toHaveTextContent('Bob');
      });
    });
  });
});
