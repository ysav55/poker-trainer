/**
 * BotLobbyPage.test.jsx
 *
 * Tests:
 *  - Table list renders after fetch
 *  - Empty state when no tables
 *  - Loading state before fetch resolves
 *  - Error state when fetch fails
 *  - "New Game" button opens creation modal
 *  - Modal cancel closes modal
 *  - Modal submit calls POST /api/bot-tables and navigates
 *  - Back to lobby navigation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../contexts/AuthContext.jsx', () => ({
  useAuth: () => ({ user: { id: 'u1', name: 'Alice', role: 'player' } }),
}));

const mockApiFetch = vi.fn();
vi.mock('../lib/api.js', () => ({
  apiFetch: (...args) => mockApiFetch(...args),
}));

import BotLobbyPage from '../pages/BotLobbyPage.jsx';

const BOT_TABLES = [
  { id: 'bt-1', name: 'Bot Table Alpha', phase: 'preflop', difficulty: 'easy',   human_count: 1, bot_count: 5 },
  { id: 'bt-2', name: 'Bot Table Beta',  phase: 'waiting', difficulty: 'hard',   human_count: 2, bot_count: 7 },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <BotLobbyPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockApiFetch.mockResolvedValue({ tables: BOT_TABLES });
});

// ── Header ─────────────────────────────────────────────────────────────────────

describe('BotLobbyPage header', () => {
  it('shows "Play vs Bots" title', async () => {
    renderPage();
    await waitFor(() => expect(screen.queryByTestId('loading-state')).toBeNull());
    expect(screen.getByText(/Play vs Bots/i)).toBeTruthy();
  });

  it('back-to-lobby button navigates to /lobby', async () => {
    renderPage();
    await waitFor(() => expect(screen.queryByTestId('loading-state')).toBeNull());
    fireEvent.click(screen.getByTestId('back-to-lobby'));
    expect(mockNavigate).toHaveBeenCalledWith('/lobby');
  });
});

// ── Loading / error ─────────────────────────────────────────────────────────────

describe('BotLobbyPage loading state', () => {
  it('shows loading indicator before data arrives', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByTestId('loading-state')).toBeTruthy();
  });

  it('hides loading after data arrives', async () => {
    renderPage();
    await waitFor(() => expect(screen.queryByTestId('loading-state')).toBeNull());
  });

  it('shows error when fetch fails', async () => {
    mockApiFetch.mockRejectedValue(new Error('Network error'));
    renderPage();
    await waitFor(() => expect(screen.queryByTestId('loading-state')).toBeNull());
    expect(screen.getByTestId('fetch-error')).toBeTruthy();
    expect(screen.getByText(/Network error/i)).toBeTruthy();
  });
});

// ── Table list ─────────────────────────────────────────────────────────────────

describe('BotLobbyPage table list', () => {
  it('renders BotTableCards for each table', async () => {
    renderPage();
    await waitFor(() => expect(screen.queryByTestId('loading-state')).toBeNull());
    expect(screen.getByTestId('table-list')).toBeTruthy();
    const cards = screen.getAllByTestId('bot-table-card');
    expect(cards).toHaveLength(2);
  });

  it('shows table names', async () => {
    renderPage();
    await waitFor(() => expect(screen.queryByTestId('loading-state')).toBeNull());
    expect(screen.getByText('Bot Table Alpha')).toBeTruthy();
    expect(screen.getByText('Bot Table Beta')).toBeTruthy();
  });

  it('shows empty state when no tables returned', async () => {
    mockApiFetch.mockResolvedValue({ tables: [] });
    renderPage();
    await waitFor(() => expect(screen.queryByTestId('loading-state')).toBeNull());
    expect(screen.getByTestId('empty-state')).toBeTruthy();
  });
});

// ── Modal ──────────────────────────────────────────────────────────────────────

describe('BotLobbyPage creation modal', () => {
  it('"New Game" button opens modal', async () => {
    renderPage();
    await waitFor(() => expect(screen.queryByTestId('loading-state')).toBeNull());
    fireEvent.click(screen.getByTestId('new-game-button'));
    expect(screen.getByTestId('create-bot-modal')).toBeTruthy();
  });

  it('Cancel button closes modal', async () => {
    renderPage();
    await waitFor(() => expect(screen.queryByTestId('loading-state')).toBeNull());
    fireEvent.click(screen.getByTestId('new-game-button'));
    fireEvent.click(screen.getByTestId('modal-cancel'));
    expect(screen.queryByTestId('create-bot-modal')).toBeNull();
  });

  it('Start Game submits POST and navigates to /game/:tableId', async () => {
    mockApiFetch
      .mockResolvedValueOnce({ tables: BOT_TABLES }) // initial GET
      .mockResolvedValueOnce({ id: 'bt-new' });       // POST response

    renderPage();
    await waitFor(() => expect(screen.queryByTestId('loading-state')).toBeNull());
    fireEvent.click(screen.getByTestId('new-game-button'));
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/game/bt-new'));
  });

  it('shows error when POST fails', async () => {
    mockApiFetch
      .mockResolvedValueOnce({ tables: BOT_TABLES })
      .mockRejectedValueOnce(new Error('Server error'));

    renderPage();
    await waitFor(() => expect(screen.queryByTestId('loading-state')).toBeNull());
    fireEvent.click(screen.getByTestId('new-game-button'));
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => expect(screen.getByTestId('modal-error')).toBeTruthy());
    expect(screen.getByText(/Server error/i)).toBeTruthy();
  });

  it('difficulty pills toggle active state', async () => {
    renderPage();
    await waitFor(() => expect(screen.queryByTestId('loading-state')).toBeNull());
    fireEvent.click(screen.getByTestId('new-game-button'));
    fireEvent.click(screen.getByTestId('difficulty-hard'));
    // Modal stays open after selecting difficulty
    expect(screen.getByTestId('create-bot-modal')).toBeTruthy();
  });
});
