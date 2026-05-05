import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import PlaylistTree from '../components/scenarios/PlaylistTree.jsx';

const PLAYLISTS = [
  { playlist_id: 'pl-1', name: 'Dry Flop Spots' },
  { playlist_id: 'pl-2', name: 'Wet Flop Spots' },
];

const SCENARIOS = [
  { id: 'sc-1', name: 'AA on 762r',   primary_playlist_id: 'pl-1' },
  { id: 'sc-2', name: 'KK on 884r',   primary_playlist_id: 'pl-1' },
  { id: 'sc-3', name: 'JJ draw',      primary_playlist_id: 'pl-2' },
  { id: 'sc-4', name: 'Unsorted',     primary_playlist_id: null   },
];

function setup(overrides = {}) {
  const handlers = {
    onSearchChange:   vi.fn(),
    onSelectPlaylist: vi.fn(),
    onSelectScenario: vi.fn(),
  };
  render(
    <PlaylistTree
      playlists={overrides.playlists ?? PLAYLISTS}
      scenarios={overrides.scenarios ?? SCENARIOS}
      search={overrides.search ?? ''}
      selectedPlaylistId={overrides.selectedPlaylistId ?? null}
      selectedScenarioId={overrides.selectedScenarioId ?? null}
      {...handlers}
    />
  );
  return handlers;
}

describe('PlaylistTree', () => {
  it('renders every playlist as a node', () => {
    setup();
    expect(screen.getByTestId('playlist-node-pl-1')).toBeTruthy();
    expect(screen.getByTestId('playlist-node-pl-2')).toBeTruthy();
  });

  it('renders Unassigned section for scenarios without primary_playlist_id', () => {
    setup();
    expect(screen.getByTestId('unassigned-section')).toBeTruthy();
    expect(screen.getByText('Unassigned')).toBeTruthy();
    expect(screen.getByText('Unsorted')).toBeTruthy();
  });

  it('collapses scenarios by default — playlist children not visible', () => {
    setup();
    expect(screen.queryByText('AA on 762r')).toBeNull();
  });

  it('expands playlist on click and shows its scenarios', () => {
    setup();
    fireEvent.click(screen.getByText('Dry Flop Spots'));
    expect(screen.getByText('AA on 762r')).toBeTruthy();
    expect(screen.getByText('KK on 884r')).toBeTruthy();
  });

  it('search filters both playlists and scenarios', () => {
    setup({ search: 'wet' });
    expect(screen.getByTestId('playlist-node-pl-2')).toBeTruthy();
    expect(screen.queryByTestId('playlist-node-pl-1')).toBeNull();
    // Unassigned "Unsorted" does not match "wet"
    expect(screen.queryByTestId('unassigned-section')).toBeNull();
  });

  it('search matching a scenario name auto-expands its parent playlist', () => {
    setup({ search: 'KK' });
    expect(screen.getByText('KK on 884r')).toBeTruthy();
  });

  it('emits onSelectScenario when a scenario is clicked', () => {
    const h = setup();
    fireEvent.click(screen.getByText('Dry Flop Spots')); // expand pl-1
    fireEvent.click(screen.getByText('AA on 762r'));
    expect(h.onSelectScenario).toHaveBeenCalledWith(SCENARIOS[0]);
  });

  it('shows empty state when no playlists and no unassigned scenarios', () => {
    setup({ playlists: [], scenarios: [] });
    expect(screen.getByText('No playlists yet.')).toBeTruthy();
  });
});
