import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import HandBuilderHeader from '../components/scenarios/HandBuilderHeader.jsx';

const PLAYLISTS = [
  { playlist_id: 'pl-1', name: 'Dry Flop Spots' },
  { playlist_id: 'pl-2', name: 'Wet Flop Spots' },
];

function setup(overrides = {}) {
  const props = {
    playlistCount: 2,
    scenarioCount: 5,
    selectedScenario: null,
    playlists: PLAYLISTS,
    colorMap: { 'pl-1': '#f97316', 'pl-2': '#3b82f6' },
    onAlsoAddTo: vi.fn(),
    onNewPlaylist: vi.fn(),
    ...overrides,
  };
  render(<HandBuilderHeader {...props} />);
  return props;
}

describe('HandBuilderHeader', () => {
  it('renders title and pluralized counts', () => {
    setup();
    expect(screen.getByText('Scenarios')).toBeTruthy();
    expect(screen.getByTestId('header-subtitle').textContent).toMatch(/2 playlists.*5 scenarios/);
  });

  it('renders singular counts when exactly 1', () => {
    setup({ playlistCount: 1, scenarioCount: 1 });
    expect(screen.getByTestId('header-subtitle').textContent).toMatch(/1 playlist.*1 scenario/);
  });

  it('does NOT show "Also Add to…" when nothing is selected', () => {
    setup({ selectedScenario: null });
    expect(screen.queryByTestId('also-add-to-btn')).toBeNull();
  });

  it('does NOT show "Also Add to…" when selectedScenario is "new"', () => {
    setup({ selectedScenario: 'new' });
    expect(screen.queryByTestId('also-add-to-btn')).toBeNull();
  });

  it('shows "Also Add to…" when a scenario is selected', () => {
    setup({ selectedScenario: { id: 'sc-1', name: 'AA' } });
    expect(screen.getByTestId('also-add-to-btn')).toBeTruthy();
  });

  it('toggle opens the menu with all playlists as color-dotted entries', () => {
    setup({ selectedScenario: { id: 'sc-1', name: 'AA' } });
    fireEvent.click(screen.getByTestId('also-add-to-btn'));
    expect(screen.getByTestId('also-add-menu')).toBeTruthy();
    expect(screen.getByTestId('also-add-target-pl-1')).toBeTruthy();
    expect(screen.getByTestId('also-add-target-pl-2')).toBeTruthy();
  });

  it('picking a target fires onAlsoAddTo with (playlist, scenario)', () => {
    const scenario = { id: 'sc-1', name: 'AA' };
    const props = setup({ selectedScenario: scenario });
    fireEvent.click(screen.getByTestId('also-add-to-btn'));
    fireEvent.click(screen.getByTestId('also-add-target-pl-2'));
    expect(props.onAlsoAddTo).toHaveBeenCalledWith(PLAYLISTS[1], scenario);
  });

  it('New Playlist CTA fires onNewPlaylist', () => {
    const props = setup();
    fireEvent.click(screen.getByTestId('new-playlist-btn'));
    expect(props.onNewPlaylist).toHaveBeenCalledTimes(1);
  });
});
