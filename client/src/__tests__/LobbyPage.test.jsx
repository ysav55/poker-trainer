/**
 * LobbyPage.test.jsx
 *
 * Covers:
 *  - Table creation modal submit → POST /api/tables → navigate to /table/:id
 *  - CreateTableModal opens and closes
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
  useAuth: () => ({
    user: { id: 'coach-1', role: 'coach' },
    hasPermission: () => true,
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

// WizardModal is a large component — stub it out
vi.mock('../pages/admin/TournamentSetup.jsx', () => ({
  WizardModal: () => null,
}));

import LobbyPage from '../pages/LobbyPage.jsx';

function renderPage() {
  return render(
    <MemoryRouter>
      <LobbyPage />
    </MemoryRouter>
  );
}

// Sensible defaults so LobbyPage data-fetching effects don't crash the render.
// alerts must be an array; the page does `d?.alerts ?? d ?? []` — if d is {}
// that resolves to {} which then blows up on .filter().
function defaultMock(path) {
  if (path === '/api/coach/alerts')    return Promise.resolve({ alerts: [] });
  if (path === '/api/hands')           return Promise.resolve({ hands: [] });
  if (path === '/api/hands?limit=10')  return Promise.resolve({ hands: [] });
  if (path === '/api/table-presets')   return Promise.resolve({ presets: [] });
  return Promise.resolve({});
}

beforeEach(() => {
  vi.clearAllMocks();
  mockApiFetch.mockImplementation(defaultMock);
});

// ── Table creation redirect ────────────────────────────────────────────────────

describe('LobbyPage — table creation redirect', () => {
  it('navigates to /table/:id immediately after POST returns table id', async () => {
    // POST /api/tables returns the table row with id directly (NOT wrapped)
    mockApiFetch.mockImplementation((path, opts) => {
      if (opts?.method === 'POST' && path === '/api/tables') {
        return Promise.resolve({ id: 'table-abc123', name: 'Test Table', mode: 'coached_cash' });
      }
      return defaultMock(path);
    });

    renderPage();

    // Open the create table modal — NewTableCard renders "New Table" text
    const newTableBtn = await waitFor(() => screen.getByText('New Table'));
    fireEvent.click(newTableBtn);

    // Fill in required name field
    const nameInput = await waitFor(() => screen.getByPlaceholderText(/e\.g\. Main Table/i));
    fireEvent.change(nameInput, { target: { value: 'Test Table' } });

    // Submit
    const createBtn = screen.getByText(/^Create$/i);
    fireEvent.click(createBtn);

    // Assert POST was called
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/api/tables', expect.objectContaining({ method: 'POST' }));
    });

    // Navigate must fire immediately with the id from the POST response
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/table/table-abc123');
    });
  });

  it('does NOT navigate if POST returns no id', async () => {
    mockApiFetch.mockImplementation((path, opts) => {
      if (opts?.method === 'POST' && path === '/api/tables') {
        return Promise.resolve({}); // no id field
      }
      return defaultMock(path);
    });

    renderPage();

    const newTableBtn = await waitFor(() => screen.getByText('New Table'));
    fireEvent.click(newTableBtn);

    const nameInput = await waitFor(() => screen.getByPlaceholderText(/e\.g\. Main Table/i));
    fireEvent.change(nameInput, { target: { value: 'Test Table' } });

    fireEvent.click(screen.getByText(/^Create$/i));

    // Assert POST was called (ensures we wait for the async operation)
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/api/tables', expect.objectContaining({ method: 'POST' }));
    });

    // Assert navigate was NOT called with a table path
    expect(mockNavigate).not.toHaveBeenCalledWith(expect.stringMatching(/^\/table\//));
  });
});
