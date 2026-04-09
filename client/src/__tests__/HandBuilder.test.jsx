/**
 * HandBuilder.test.jsx
 *
 * Covers QuickSavePanel behaviour after a scenario is saved:
 *  1. Panel does NOT render before a scenario is saved
 *  2. Panel appears after ScenarioBuilder emits onSaved
 *  3. Save button is disabled when no playlist selected
 *  4. Selecting a playlist enables Save button
 *  5. Clicking Save calls POST /api/playlists/:id/items with correct body
 *  6. After save succeeds, QuickSavePanel disappears
 *  7. Clicking Skip dismisses panel without calling the endpoint
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('../contexts/AuthContext.jsx', () => ({
  useAuth: () => ({
    user: { id: 'coach-1', role: 'coach' },
    hasPermission: () => true,
  }),
}));

const mockApiFetch = vi.fn();
vi.mock('../lib/api.js', () => ({
  apiFetch: (...args) => mockApiFetch(...args),
}));

// Mock ScenarioBuilder — exposes a button to trigger onSaved
vi.mock('../components/ScenarioBuilder', () => ({
  default: ({ onSaved }) => (
    <button
      data-testid="mock-save-trigger"
      onClick={() => onSaved({ scenario_id: 'sc-1', name: 'Test Scenario' })}
    >
      Save Scenario
    </button>
  ),
}));

// Mock PlaylistEditor to prevent internal effects
vi.mock('../components/PlaylistEditor', () => ({
  default: () => <div data-testid="mock-playlist-editor" />,
}));

// Mock ScenarioPickerModal
vi.mock('../components/ScenarioPickerModal', () => ({
  default: () => null,
}));

import HandBuilder from '../pages/admin/HandBuilder.jsx';

// ── Fixtures ───────────────────────────────────────────────────────────────────

const PLAYLISTS = [
  { playlist_id: 'pl-1', name: 'Playlist One', hand_count: 3 },
  { playlist_id: 'pl-2', name: 'Playlist Two', hand_count: 1 },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <HandBuilder />
    </MemoryRouter>
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('HandBuilder — QuickSavePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default API responses
    mockApiFetch.mockImplementation((path) => {
      if (path === '/api/scenarios') return Promise.resolve([]);
      if (path === '/api/scenarios/folders') return Promise.resolve({ folders: [] });
      if (path === '/api/playlists') return Promise.resolve(PLAYLISTS);
      return Promise.resolve({});
    });
  });

  it('1. QuickSavePanel does NOT render before a scenario is saved', async () => {
    renderPage();
    // Trigger the new scenario flow by clicking "+ New Scenario" in the sidebar
    const newBtn = await screen.findByTestId('sidebar-new-btn');
    fireEvent.click(newBtn);
    expect(screen.queryByTestId('quick-save-panel')).toBeNull();
  });

  it('2. QuickSavePanel appears after ScenarioBuilder emits onSaved', async () => {
    renderPage();
    const newBtn = await screen.findByTestId('sidebar-new-btn');
    fireEvent.click(newBtn);
    // The mock ScenarioBuilder renders a trigger button
    const trigger = await screen.findByTestId('mock-save-trigger');
    fireEvent.click(trigger);
    expect(await screen.findByTestId('quick-save-panel')).toBeInTheDocument();
  });

  it('3. Save button is disabled when no playlist selected', async () => {
    renderPage();
    const newBtn = await screen.findByTestId('sidebar-new-btn');
    fireEvent.click(newBtn);
    const trigger = await screen.findByTestId('mock-save-trigger');
    fireEvent.click(trigger);
    const saveBtn = await screen.findByTestId('quick-save-btn');
    expect(saveBtn).toBeDisabled();
  });

  it('4. Selecting a playlist enables Save button', async () => {
    renderPage();
    const newBtn = await screen.findByTestId('sidebar-new-btn');
    fireEvent.click(newBtn);
    const trigger = await screen.findByTestId('mock-save-trigger');
    fireEvent.click(trigger);
    const select = await screen.findByTestId('quick-save-select');
    fireEvent.change(select, { target: { value: 'pl-1' } });
    const saveBtn = await screen.findByTestId('quick-save-btn');
    expect(saveBtn).not.toBeDisabled();
  });

  it('5. Clicking Save calls the playlist items endpoint with correct body', async () => {
    mockApiFetch.mockImplementation((path) => {
      if (path === '/api/scenarios') return Promise.resolve([]);
      if (path === '/api/scenarios/folders') return Promise.resolve({ folders: [] });
      if (path === '/api/playlists') return Promise.resolve(PLAYLISTS);
      if (path === '/api/playlists/pl-1/items') return Promise.resolve({ id: 'item-1' });
      return Promise.resolve({});
    });

    renderPage();
    const newBtn = await screen.findByTestId('sidebar-new-btn');
    fireEvent.click(newBtn);
    const trigger = await screen.findByTestId('mock-save-trigger');
    fireEvent.click(trigger);
    const select = await screen.findByTestId('quick-save-select');
    fireEvent.change(select, { target: { value: 'pl-1' } });
    const saveBtn = await screen.findByTestId('quick-save-btn');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/api/playlists/pl-1/items', {
        method: 'POST',
        body: JSON.stringify({ scenario_id: 'sc-1' }),
      });
    });
  });

  it('6. After save succeeds, QuickSavePanel disappears', async () => {
    mockApiFetch.mockImplementation((path) => {
      if (path === '/api/scenarios') return Promise.resolve([]);
      if (path === '/api/scenarios/folders') return Promise.resolve({ folders: [] });
      if (path === '/api/playlists') return Promise.resolve(PLAYLISTS);
      if (path === '/api/playlists/pl-1/items') return Promise.resolve({ id: 'item-1' });
      return Promise.resolve({});
    });

    renderPage();
    const newBtn = await screen.findByTestId('sidebar-new-btn');
    fireEvent.click(newBtn);
    const trigger = await screen.findByTestId('mock-save-trigger');
    fireEvent.click(trigger);
    const select = await screen.findByTestId('quick-save-select');
    fireEvent.change(select, { target: { value: 'pl-1' } });
    fireEvent.click(screen.getByTestId('quick-save-btn'));

    await waitFor(() => {
      expect(screen.queryByTestId('quick-save-panel')).toBeNull();
    });
  });

  it('7. Clicking Skip dismisses panel without calling the endpoint', async () => {
    renderPage();
    const newBtn = await screen.findByTestId('sidebar-new-btn');
    fireEvent.click(newBtn);
    const trigger = await screen.findByTestId('mock-save-trigger');
    fireEvent.click(trigger);
    await screen.findByTestId('quick-save-panel');
    fireEvent.click(screen.getByTestId('quick-save-skip'));
    expect(screen.queryByTestId('quick-save-panel')).toBeNull();
    // No POST to items endpoint
    expect(mockApiFetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/items'),
      expect.objectContaining({ method: 'POST' })
    );
  });
});
