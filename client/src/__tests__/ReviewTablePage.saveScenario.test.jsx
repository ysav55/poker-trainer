import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useNavigate:    () => mockNavigate,
    useSearchParams: () => [new URLSearchParams('handId=h-1')],
    useLocation:    () => ({ pathname: '/review', state: null }),
  };
});

let mockUser = { id: 'u-1', name: 'Coach', role: 'coach' };
vi.mock('../contexts/AuthContext.jsx', () => ({
  useAuth: () => ({ user: mockUser }),
}));

const mockApiFetch = vi.fn();
vi.mock('../lib/api.js', () => ({
  apiFetch: (...args) => mockApiFetch(...args),
}));

// socket.io-client — never actually connects in these tests.
vi.mock('socket.io-client', () => ({
  io: () => ({
    on: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
  }),
}));

// Silence heavy PokerTable (SVG / animation) rendering in jsdom.
vi.mock('../components/PokerTable.jsx', () => ({
  default: () => <div data-testid="poker-table-mock" />,
}));

import ReviewTablePage from '../pages/ReviewTablePage.jsx';

const HAND_DATA = {
  hand_id: 'h-1',
  board: ['Kh', '7s', '2d'],
  players: [{ seat: 0, player_id: 'p-hero', hole_cards: ['Ac', 'Kd'] }],
  actions: [],
  tags: ['3BET_POT'],
  hand_number: 42,
};

function installDefaults() {
  mockApiFetch.mockImplementation((path) => {
    if (path.startsWith('/api/hands/h-1/annotations')) return Promise.resolve({ annotations: [] });
    if (path.startsWith('/api/hands/h-1'))             return Promise.resolve(HAND_DATA);
    if (path === '/api/playlists')                     return Promise.resolve({ playlists: [{ playlist_id: 'pl-1', name: 'Default' }] });
    return Promise.resolve({});
  });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ReviewTablePage />
    </MemoryRouter>
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ReviewTablePage — Save as Scenario button', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installDefaults();
  });

  it('shows the Save as Scenario button for a coach once the hand loads', async () => {
    mockUser = { id: 'u-1', name: 'Coach', role: 'coach' };
    await act(async () => { renderPage(); });
    await waitFor(() => screen.getByTestId('save-as-scenario-btn'));
    expect(screen.getByTestId('save-as-scenario-btn')).toBeTruthy();
  });

  it('does NOT show the Save as Scenario button for a solo_student', async () => {
    mockUser = { id: 'u-2', name: 'Student', role: 'solo_student' };
    await act(async () => { renderPage(); });
    // Wait for something that proves the page rendered with data.
    await waitFor(() => screen.getByTestId('poker-table-mock'));
    expect(screen.queryByTestId('save-as-scenario-btn')).toBeNull();
  });

  it('does NOT show the button for coached_student', async () => {
    mockUser = { id: 'u-3', name: 'Student', role: 'coached_student' };
    await act(async () => { renderPage(); });
    await waitFor(() => screen.getByTestId('poker-table-mock'));
    expect(screen.queryByTestId('save-as-scenario-btn')).toBeNull();
  });

  it('shows the button for admin and superadmin', async () => {
    mockUser = { id: 'u-4', name: 'Admin', role: 'admin' };
    await act(async () => { renderPage(); });
    await waitFor(() => screen.getByTestId('save-as-scenario-btn'));
    expect(screen.getByTestId('save-as-scenario-btn')).toBeTruthy();

    mockUser = { id: 'u-5', name: 'Super', role: 'superadmin' };
    await act(async () => { renderPage(); });
    await waitFor(() => screen.getAllByTestId('save-as-scenario-btn'));
    expect(screen.getAllByTestId('save-as-scenario-btn').length).toBeGreaterThan(0);
  });

  it('clicking the button opens the modal', async () => {
    mockUser = { id: 'u-1', name: 'Coach', role: 'coach' };
    await act(async () => { renderPage(); });
    await waitFor(() => screen.getByTestId('save-as-scenario-btn'));

    await act(async () => {
      screen.getByTestId('save-as-scenario-btn').click();
    });
    await waitFor(() => screen.getByTestId('save-as-scenario-modal'));
    expect(screen.getByTestId('save-as-scenario-modal')).toBeTruthy();
  });
});
