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

  describe('Dynamic sorting by primary_metric', () => {
    it('should sort by net_chips (default) when leaderboardConfig.value.primary_metric is net_chips', async () => {
      const leaderboardConfig = {
        value: { primary_metric: 'net_chips', secondary_metric: 'win_rate' },
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
      // rows[0] is header, rows[1] is first player
      expect(rows[1]).toHaveTextContent('Alice');
      expect(rows[2]).toHaveTextContent('Bob');
      expect(rows[3]).toHaveTextContent('Charlie');
    });

    it('should sort by hands_played when primary_metric is hands_played', async () => {
      const leaderboardConfig = {
        value: { primary_metric: 'hands_played', secondary_metric: 'win_rate' },
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

    it('should sort by win_rate when primary_metric is win_rate', async () => {
      const players = [
        { id: 'p1', stable_id: 'p1', name: 'Alice', total_hands: 100, total_wins: 30, total_net_chips: 500 },
        { id: 'p2', stable_id: 'p2', name: 'Bob', total_hands: 80, total_wins: 20, total_net_chips: 400 },
        { id: 'p3', stable_id: 'p3', name: 'Charlie', total_hands: 60, total_wins: 18, total_net_chips: 300 },
      ];

      const leaderboardConfig = {
        value: { primary_metric: 'win_rate', secondary_metric: 'net_chips' },
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

      // Alice: 30/100=0.30, Bob: 20/80=0.25, Charlie: 18/60=0.30
      // Tie between Alice and Charlie, so order preserved: Alice, Charlie, Bob
      const rows = screen.getAllByRole('row');
      expect(rows[1]).toHaveTextContent('Alice'); // 30%
      expect(rows[2]).toHaveTextContent('Charlie'); // 30%, appears second
      expect(rows[3]).toHaveTextContent('Bob'); // 25%
    });

    it('should sort by bb_per_100 when primary_metric is bb_per_100', async () => {
      const players = [
        { id: 'p1', stable_id: 'p1', name: 'Alice', total_hands: 100, total_wins: 25, total_net_chips: 500 },
        { id: 'p2', stable_id: 'p2', name: 'Bob', total_hands: 100, total_wins: 20, total_net_chips: 400 },
        { id: 'p3', stable_id: 'p3', name: 'Charlie', total_hands: 100, total_wins: 18, total_net_chips: 300 },
      ];

      const leaderboardConfig = {
        value: { primary_metric: 'bb_per_100', secondary_metric: 'win_rate' },
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

      // Alice: 500/100*100=500, Bob: 400/100*100=400, Charlie: 300/100*100=300
      const rows = screen.getAllByRole('row');
      expect(rows[1]).toHaveTextContent('Alice');
      expect(rows[2]).toHaveTextContent('Bob');
      expect(rows[3]).toHaveTextContent('Charlie');
    });

    it('should fall back to net_chips when leaderboardConfig is null', async () => {
      apiLib.apiFetch.mockResolvedValueOnce({ players: mockPlayers, leaderboardConfig: null });

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

      // Default to net_chips: Alice (500), Bob (400), Charlie (300)
      const rows = screen.getAllByRole('row');
      expect(rows[1]).toHaveTextContent('Alice');
      expect(rows[2]).toHaveTextContent('Bob');
      expect(rows[3]).toHaveTextContent('Charlie');
    });
  });

  describe('Dynamic score display by secondary_metric', () => {
    it('should compute score as bb_per_100 when secondary_metric is bb_per_100', async () => {
      const players = [
        { id: 'p1', stable_id: 'p1', name: 'Alice', total_hands: 100, total_wins: 25, total_net_chips: 500 },
      ];

      const leaderboardConfig = {
        value: { primary_metric: 'net_chips', secondary_metric: 'bb_per_100' },
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

      // Alice: 500/100*100=500 (rounded to 500)
      const rows = screen.getAllByRole('row');
      const scoreCell = rows[1].querySelectorAll('td')[5]; // Score is the 6th column (0-indexed)
      expect(scoreCell.textContent).toMatch(/500/);
    });

    it('should compute score as win_rate% when secondary_metric is win_rate', async () => {
      const players = [
        { id: 'p1', stable_id: 'p1', name: 'Alice', total_hands: 100, total_wins: 25, total_net_chips: 500 },
      ];

      const leaderboardConfig = {
        value: { primary_metric: 'net_chips', secondary_metric: 'win_rate' },
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

      // Alice: 25/100*100=25%
      const rows = screen.getAllByRole('row');
      const scoreCell = rows[1].querySelectorAll('td')[5];
      expect(scoreCell.textContent).toMatch(/25%/);
    });

    it('should compute score as net_chips when secondary_metric is net_chips', async () => {
      const players = [
        { id: 'p1', stable_id: 'p1', name: 'Alice', total_hands: 100, total_wins: 25, total_net_chips: 500 },
      ];

      const leaderboardConfig = {
        value: { primary_metric: 'win_rate', secondary_metric: 'net_chips' },
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

      // Alice: 500 (net chips)
      const rows = screen.getAllByRole('row');
      const scoreCell = rows[1].querySelectorAll('td')[5];
      expect(scoreCell.textContent).toMatch(/\+500/);
    });

    it('should compute score as hands_played when secondary_metric is hands_played', async () => {
      const players = [
        { id: 'p1', stable_id: 'p1', name: 'Alice', total_hands: 100, total_wins: 25, total_net_chips: 500 },
      ];

      const leaderboardConfig = {
        value: { primary_metric: 'net_chips', secondary_metric: 'hands_played' },
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

      // Alice: 100 hands
      const rows = screen.getAllByRole('row');
      const scoreCell = rows[1].querySelectorAll('td')[5];
      expect(scoreCell.textContent).toMatch(/100/);
    });

    it('should update Score column header title based on secondary_metric', async () => {
      const leaderboardConfig = {
        value: { primary_metric: 'net_chips', secondary_metric: 'hands_played' },
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

      // When secondary_metric is 'hands_played', the dynamic score header should have the correct title
      const headers = screen.getAllByRole('columnheader');
      // Find the header with the dynamic title (only the score column has a title attribute)
      const dynamicHeaders = headers.filter(h => h.title && h.title.length > 0);
      expect(dynamicHeaders.length).toBeGreaterThan(0);
      const scoreHeader = dynamicHeaders[dynamicHeaders.length - 1];
      expect(scoreHeader.title).toMatch(/total hands played/i);
    });
  });

  describe('Search and filter integration', () => {
    it('should preserve sort order when searching', async () => {
      const user = userEvent.setup();
      const leaderboardConfig = {
        value: { primary_metric: 'net_chips', secondary_metric: 'bb_per_100' },
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

      // Verify initial sort
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
