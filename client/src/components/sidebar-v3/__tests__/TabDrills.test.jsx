import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TabDrills from '../TabDrills.jsx';

const activeDrillData = {
  playlists: [{ id: 'pl1', name: 'Bluff catching', count: 5, description: '' }],
  drillSession: {
    active: true,
    playlistId: 'pl1',
    scenarioName: 'AKo OOP',
    currentSpot: 'flop · 7s 7d 2c',
    handsDone: 2, handsTotal: 5,
    results: { correct: 1, mistake: 1, uncertain: 0 },
  },
};

function makeEmit(overrides = {}) {
  return {
    activatePlaylist: vi.fn(),
    deactivatePlaylist: vi.fn(),
    ...overrides,
  };
}

describe('TabDrills — stats tiles (removed)', () => {
  it('does not render Correct/Mistake/Unsure tiles in active session', () => {
    render(<TabDrills data={activeDrillData} emit={{ deactivatePlaylist: vi.fn() }} />);
    expect(screen.queryByText('Correct')).toBeNull();
    expect(screen.queryByText('Mistake')).toBeNull();
    expect(screen.queryByText('Unsure')).toBeNull();
  });
});

describe('TabDrills — 3-segment chassis (D.8b)', () => {
  it('exposes Playlists, Hands, and Session segments', () => {
    render(<TabDrills data={{ playlists: [], drillSession: { active: false } }} emit={makeEmit()} />);
    expect(screen.getByRole('button', { name: 'Playlists' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hands' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Session' })).toBeInTheDocument();
  });

  it('does NOT expose the legacy Library segment', () => {
    render(<TabDrills data={{ playlists: [], drillSession: { active: false } }} emit={makeEmit()} />);
    expect(screen.queryByRole('button', { name: 'Library' })).toBeNull();
  });

  it('default segment is Playlists', () => {
    render(<TabDrills data={{ playlists: [{ id: 'pl1', name: 'Test', count: 5, description: '' }], drillSession: { active: false } }} emit={makeEmit()} />);
    // The Test playlist should be visible (rendered in Playlists mode)
    expect(screen.getByText('Test')).toBeInTheDocument();
  });

  it('clicking Hands switches to Hands mode and renders the placeholder', () => {
    render(<TabDrills data={{ playlists: [], drillSession: { active: false } }} emit={makeEmit()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hands' }));
    // Hands placeholder text
    expect(screen.getByText(/hand library wires up in Phase D.9/i)).toBeInTheDocument();
  });
});

describe('TabDrills — LaunchPanel integration (D.8d)', () => {
  it('clicking ⚙ Configure button mounts LaunchPanel below the playlist list', () => {
    const data = {
      playlists: [{ id: 'pl1', name: 'Test', count: 5, description: '' }],
      drillSession: { active: false },
    };
    render(<TabDrills data={data} emit={makeEmit()} />);
    // Click Configure button (⚙)
    const configBtn = screen.getByRole('button', { name: 'Configure' });
    fireEvent.click(configBtn);
    // LaunchPanel renders the playlist name in its title
    expect(screen.getByText(/Launch.*Test/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Launch →/ })).toBeInTheDocument();
  });

  it('LaunchPanel onLaunch calls activatePlaylist with full config', () => {
    const emit = makeEmit();
    const data = {
      playlists: [{ id: 'pl1', name: 'Test', count: 5, description: '' }],
      drillSession: { active: false },
    };
    render(<TabDrills data={data} emit={emit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Configure' }));
    fireEvent.click(screen.getByRole('button', { name: /Launch →/ }));
    expect(emit.activatePlaylist).toHaveBeenCalledWith(
      expect.objectContaining({
        playlistId: 'pl1',
        heroMode: expect.any(String),
        order: expect.any(String),
        autoAdvance: expect.any(Boolean),
        allowZeroMatch: expect.any(Boolean),
      })
    );
  });

  it('LaunchPanel Cancel closes the panel', () => {
    const data = {
      playlists: [{ id: 'pl1', name: 'Test', count: 5, description: '' }],
      drillSession: { active: false },
    };
    render(<TabDrills data={data} emit={makeEmit()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Configure' }));
    expect(screen.getByRole('button', { name: /Launch →/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('button', { name: /Launch →/ })).toBeNull();
  });

  it('LaunchPanel clears selectedForLaunch after onLaunch fires', () => {
    const emit = makeEmit();
    const data = {
      playlists: [{ id: 'pl1', name: 'Test', count: 5, description: '' }],
      drillSession: { active: false },
    };
    render(<TabDrills data={data} emit={emit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Configure' }));
    fireEvent.click(screen.getByRole('button', { name: /Launch →/ }));
    // Panel should be gone after launch
    expect(screen.queryByRole('button', { name: /Launch →/ })).toBeNull();
  });

  it('Configure button is disabled for empty playlists', () => {
    const data = {
      playlists: [{ id: 'pl1', name: 'Empty', count: 0, description: '' }],
      drillSession: { active: false },
    };
    render(<TabDrills data={data} emit={makeEmit()} />);
    const configBtn = screen.getByRole('button', { name: 'Configure' });
    expect(configBtn).toBeDisabled();
  });

  it('Load button (quick-launch) still works and does not require LaunchPanel', () => {
    const emit = makeEmit();
    const data = {
      playlists: [{ id: 'pl1', name: 'Test', count: 5, description: '' }],
      drillSession: { active: false },
    };
    render(<TabDrills data={data} emit={emit} />);
    const loadBtn = screen.getByRole('button', { name: 'Load' });
    fireEvent.click(loadBtn);
    // Quick-launch should call activatePlaylist directly with just the ID
    expect(emit.activatePlaylist).toHaveBeenCalledWith('pl1');
    // LaunchPanel should not be mounted
    expect(screen.queryByRole('button', { name: /Launch →/ })).toBeNull();
  });
});
