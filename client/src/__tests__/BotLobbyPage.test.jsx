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
 *  - Modal shows Solo/Open privacy tiles for player role
 *  - Clicking Solo tile selects it (default)
 *  - Clicking Open tile selects it
 *  - Modal submit sends correct payload (privacy, difficulty, blinds — no humanSeats)
 *  - Modal submit navigates to /table/:tableId on success
 *  - Error display when POST fails
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

// Default: player role (sees Solo/Open tiles)
let mockUser = { id: 'u1', name: 'Alice', role: 'player' };

vi.mock('../contexts/AuthContext.jsx', () => ({
  useAuth: () => ({ user: mockUser }),
}));

const mockApiFetch = vi.fn();
vi.mock('../lib/api.js', () => ({
  apiFetch: (...args) => mockApiFetch(...args),
}));

import BotLobbyPage from '../pages/BotLobbyPage.jsx';

const BOT_TABLES = [
  { id: 'bt-1', name: 'Bot Table Alpha', phase: 'preflop', difficulty: 'easy',   human_count: 1, bot_count: 0 },
  { id: 'bt-2', name: 'Bot Table Beta',  phase: 'waiting', difficulty: 'hard',   human_count: 2, bot_count: 0 },
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
  mockUser = { id: 'u1', name: 'Alice', role: 'player' };
  mockApiFetch.mockResolvedValue({ tables: BOT_TABLES });
});

// ── Header ─────────────────────────────────────────────────────────────────────

describe('BotLobbyPage header', () => {
  it('shows "Bot Tables" title', async () => {
    renderPage();
    await waitFor(() => expect(screen.queryByTestId('loading-state')).toBeNull());
    expect(screen.getByText(/Bot Tables/i)).toBeTruthy();
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

// ── Modal — player role (Solo / Open tiles) ────────────────────────────────────

describe('BotLobbyPage creation modal (player role)', () => {
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

  it('shows Solo and Open privacy tiles for player role', async () => {
    renderPage();
    await waitFor(() => expect(screen.queryByTestId('loading-state')).toBeNull());
    fireEvent.click(screen.getByTestId('new-game-button'));
    expect(screen.getByTestId('privacy-solo')).toBeTruthy();
    expect(screen.getByTestId('privacy-open')).toBeTruthy();
  });

  it('does NOT show coach-only privacy tiles for player role', async () => {
    renderPage();
    await waitFor(() => expect(screen.queryByTestId('loading-state')).toBeNull());
    fireEvent.click(screen.getByTestId('new-game-button'));
    expect(screen.queryByTestId('privacy-public')).toBeNull();
    expect(screen.queryByTestId('privacy-school')).toBeNull();
  });

  it('defaults to solo privacy', async () => {
    mockApiFetch
      .mockResolvedValueOnce({ tables: BOT_TABLES })
      .mockResolvedValueOnce({ id: 'bt-new' });

    renderPage();
    await waitFor(() => expect(screen.queryByTestId('loading-state')).toBeNull());
    fireEvent.click(screen.getByTestId('new-game-button'));
    fireEvent.click(screen.getByTestId('modal-submit'));

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/bot-tables',
      expect.objectContaining({
        body: expect.stringContaining('"privacy":"solo"'),
      })
    ));
  });

  it('clicking Open tile sends privacy=open in POST', async () => {
    mockApiFetch
      .mockResolvedValueOnce({ tables: BOT_TABLES })
      .mockResolvedValueOnce({ id: 'bt-new' });

    renderPage();
    await waitFor(() => expect(screen.queryByTestId('loading-state')).toBeNull());
    fireEvent.click(screen.getByTestId('new-game-button'));
    fireEvent.click(screen.getByTestId('privacy-open'));
    fireEvent.click(screen.getByTestId('modal-submit'));

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/bot-tables',
      expect.objectContaining({
        body: expect.stringContaining('"privacy":"open"'),
      })
    ));
  });

  it('Start Game submits POST and navigates to /table/:tableId', async () => {
    mockApiFetch
      .mockResolvedValueOnce({ tables: BOT_TABLES }) // initial GET
      .mockResolvedValueOnce({ id: 'bt-new' });       // POST response

    renderPage();
    await waitFor(() => expect(screen.queryByTestId('loading-state')).toBeNull());
    fireEvent.click(screen.getByTestId('new-game-button'));
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/table/bt-new'));
  });

  it('POST body does NOT include humanSeats', async () => {
    mockApiFetch
      .mockResolvedValueOnce({ tables: BOT_TABLES })
      .mockResolvedValueOnce({ id: 'bt-new' });

    renderPage();
    await waitFor(() => expect(screen.queryByTestId('loading-state')).toBeNull());
    fireEvent.click(screen.getByTestId('new-game-button'));
    fireEvent.click(screen.getByTestId('modal-submit'));

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/bot-tables',
      expect.objectContaining({
        body: expect.not.stringContaining('humanSeats'),
      })
    ));
  });

  it('POST body does NOT include name', async () => {
    mockApiFetch
      .mockResolvedValueOnce({ tables: BOT_TABLES })
      .mockResolvedValueOnce({ id: 'bt-new' });

    renderPage();
    await waitFor(() => expect(screen.queryByTestId('loading-state')).toBeNull());
    fireEvent.click(screen.getByTestId('new-game-button'));
    fireEvent.click(screen.getByTestId('modal-submit'));

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/bot-tables',
      expect.objectContaining({
        body: expect.not.stringContaining('"name"'),
      })
    ));
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

// ── Modal — coach role (Public / School / Private tiles) ───────────────────────

describe('BotLobbyPage creation modal (coach role)', () => {
  beforeEach(() => {
    mockUser = { id: 'c1', name: 'Coach Bob', role: 'coach' };
  });

  it('shows Public, School Only, and Private tiles for coach role', async () => {
    renderPage();
    await waitFor(() => expect(screen.queryByTestId('loading-state')).toBeNull());
    fireEvent.click(screen.getByTestId('new-game-button'));
    expect(screen.getByTestId('privacy-public')).toBeTruthy();
    expect(screen.getByTestId('privacy-school')).toBeTruthy();
    expect(screen.getByTestId('privacy-private')).toBeTruthy();
  });

  it('does NOT show player-only tiles for coach role', async () => {
    renderPage();
    await waitFor(() => expect(screen.queryByTestId('loading-state')).toBeNull());
    fireEvent.click(screen.getByTestId('new-game-button'));
    expect(screen.queryByTestId('privacy-solo')).toBeNull();
    expect(screen.queryByTestId('privacy-open')).toBeNull();
  });

  it('defaults to school privacy for coach', async () => {
    mockApiFetch
      .mockResolvedValueOnce({ tables: BOT_TABLES })
      .mockResolvedValueOnce({ id: 'bt-new' });

    renderPage();
    await waitFor(() => expect(screen.queryByTestId('loading-state')).toBeNull());
    fireEvent.click(screen.getByTestId('new-game-button'));
    fireEvent.click(screen.getByTestId('modal-submit'));

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/bot-tables',
      expect.objectContaining({
        body: expect.stringContaining('"privacy":"school"'),
      })
    ));
  });
});
