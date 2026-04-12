import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import PlaylistNode from '../components/scenarios/PlaylistNode.jsx';

const PL = { playlist_id: 'pl-1', name: 'Dry Flop Spots' };
const SCENARIOS = [
  { id: 'sc-1', name: 'AA on 762r' },
  { id: 'sc-2', name: 'KK on 884r' },
];

function setup(overrides = {}) {
  const handlers = {
    onToggle: vi.fn(),
    onSelectPlaylist: vi.fn(),
    onSelectScenario: vi.fn(),
  };
  render(
    <PlaylistNode
      playlist={PL}
      color="#f97316"
      scenarios={SCENARIOS}
      expanded={overrides.expanded ?? false}
      selectedPlaylistId={overrides.selectedPlaylistId ?? null}
      selectedScenarioId={overrides.selectedScenarioId ?? null}
      {...handlers}
    />
  );
  return handlers;
}

describe('PlaylistNode', () => {
  it('renders name and scenario count', () => {
    setup();
    expect(screen.getByText('Dry Flop Spots')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('does NOT render children when collapsed', () => {
    setup({ expanded: false });
    expect(screen.queryByText('AA on 762r')).toBeNull();
  });

  it('renders children when expanded', () => {
    setup({ expanded: true });
    expect(screen.getByText('AA on 762r')).toBeTruthy();
    expect(screen.getByText('KK on 884r')).toBeTruthy();
  });

  it('clicking header fires select + toggle', () => {
    const h = setup();
    fireEvent.click(screen.getByText('Dry Flop Spots'));
    expect(h.onSelectPlaylist).toHaveBeenCalledWith(PL);
    expect(h.onToggle).toHaveBeenCalledWith('pl-1');
  });

  it('clicking a child scenario fires onSelectScenario', () => {
    const h = setup({ expanded: true });
    fireEvent.click(screen.getByText('KK on 884r'));
    expect(h.onSelectScenario).toHaveBeenCalledWith(SCENARIOS[1]);
  });
});
