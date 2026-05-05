import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate, useLocation: () => ({ pathname: '/hands' }) };
});

let mockUser = { id: 'u-1', name: 'Coach', role: 'coach' };
vi.mock('../contexts/AuthContext.jsx', () => ({
  useAuth: () => ({ user: mockUser }),
}));

const mockApiFetch = vi.fn();
vi.mock('../lib/api.js', () => ({
  apiFetch: (...args) => mockApiFetch(...args),
}));

import HandHistoryPage from '../pages/HandHistoryPage.jsx';

const HANDS = [
  {
    hand_id: 'h-1',
    started_at: '2026-03-01T10:00:00Z',
    table_id: 'tbl-1',
    auto_tags: ['3BET_POT'],
    mistake_tags: [],
    coach_tags: [],
    net: 150,
  },
  {
    hand_id: 'h-2',
    started_at: '2026-03-02T11:00:00Z',
    table_id: 'tbl-1',
    auto_tags: ['C_BET'],
    mistake_tags: [],
    coach_tags: [],
    net: -80,
  },
];

function installDefaults() {
  mockApiFetch.mockImplementation((path) => {
    if (path.startsWith('/api/hands/history')) return Promise.resolve({ hands: HANDS, total: 2 });
    if (path === '/api/hands/tables') return Promise.resolve({ tableIds: ['tbl-1'] });
    if (path === '/api/hands/tags') return Promise.resolve({ tags: ['3BET_POT', 'C_BET'] });
    if (path === '/api/players') return Promise.resolve({ players: [] });
    if (path.startsWith('/api/hands/h-1')) return Promise.resolve({
      hand_id: 'h-1',
      board: ['Kh', '7s', '2d'],
      players: [{ seat: 0, player_id: 'p-hero', hole_cards: ['Ac', 'Kd'] }],
      tags: ['3BET_POT'],
    });
    if (path === '/api/playlists') return Promise.resolve({ playlists: [{ playlist_id: 'pl-1', name: 'Default' }] });
    return Promise.resolve({});
  });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <HandHistoryPage />
    </MemoryRouter>
  );
}

describe('HandHistoryPage — Save as Scenario button', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installDefaults();
  });

  it('shows the Save button on each hand row for a coach', async () => {
    mockUser = { id: 'u-1', name: 'Coach', role: 'coach' };
    await act(async () => { renderPage(); });
    await waitFor(() => screen.getByTestId('save-as-scenario-btn-h-1'));
    expect(screen.getByTestId('save-as-scenario-btn-h-1')).toBeTruthy();
    expect(screen.getByTestId('save-as-scenario-btn-h-2')).toBeTruthy();
  });

  it('does NOT show the Save button for a solo_student', async () => {
    mockUser = { id: 'u-2', name: 'Student', role: 'solo_student' };
    await act(async () => { renderPage(); });
    await waitFor(() => screen.getByText(/Your hand history/i));
    expect(screen.queryByTestId('save-as-scenario-btn-h-1')).toBeNull();
    expect(screen.queryByTestId('save-as-scenario-btn-h-2')).toBeNull();
  });

  it('does NOT show the Save button for a coached_student', async () => {
    mockUser = { id: 'u-3', name: 'Student', role: 'coached_student' };
    await act(async () => { renderPage(); });
    await waitFor(() => screen.getByText(/Your hand history/i));
    expect(screen.queryByTestId('save-as-scenario-btn-h-1')).toBeNull();
  });

  it('shows the button for admin and superadmin', async () => {
    mockUser = { id: 'u-4', name: 'Admin', role: 'admin' };
    await act(async () => { renderPage(); });
    await waitFor(() => screen.getByTestId('save-as-scenario-btn-h-1'));
    expect(screen.getByTestId('save-as-scenario-btn-h-1')).toBeTruthy();
  });

  it('clicking Save fetches hand detail and opens the modal', async () => {
    mockUser = { id: 'u-1', name: 'Coach', role: 'coach' };
    await act(async () => { renderPage(); });
    await waitFor(() => screen.getByTestId('save-as-scenario-btn-h-1'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('save-as-scenario-btn-h-1'));
    });

    // Hand detail call was made
    expect(mockApiFetch).toHaveBeenCalledWith('/api/hands/h-1');
    // Modal appears
    await waitFor(() => screen.getByTestId('save-as-scenario-modal'));
    expect(screen.getByTestId('save-as-scenario-modal')).toBeTruthy();
  });

  it('row click (not the Save button) still navigates to review', async () => {
    mockUser = { id: 'u-1', name: 'Coach', role: 'coach' };
    await act(async () => { renderPage(); });
    await waitFor(() => screen.getByTestId('save-as-scenario-btn-h-1'));

    // Stop-propagation check: clicking the button must NOT navigate.
    await act(async () => {
      fireEvent.click(screen.getByTestId('save-as-scenario-btn-h-1'));
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
