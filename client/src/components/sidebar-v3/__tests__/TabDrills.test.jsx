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
    manualAdvanceSpot: vi.fn(),
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

  it('clicking Hands switches to Hands mode and renders HandsLibrary search', () => {
    render(<TabDrills data={{ playlists: [], drillSession: { active: false } }} emit={makeEmit()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hands' }));
    // HandsLibrary should render the search input
    expect(screen.getByPlaceholderText(/Search by winner/)).toBeInTheDocument();
    // And stack mode toggles
    expect(screen.getByRole('button', { name: /Keep Stacks/ })).toBeInTheDocument();
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

describe('TabDrills — Advance Drill wiring (D.8f)', () => {
  function activeDrillData(overrides = {}) {
    return {
      playlists: [{ id: 'pl1', name: 'Test', count: 5, description: '' }],
      drillSession: {
        active: true,
        playlistId: 'pl1',
        scenarioName: 'AKo OOP',
        currentSpot: 'flop',
        handsDone: 1,
        handsTotal: 5,
        ...overrides,
      },
      gameState: { phase: 'waiting' },
      drill_event_log: [],
    };
  }

  it('Advance Drill button calls manualAdvanceSpot when conditions met', () => {
    const emit = makeEmit({ manualAdvanceSpot: vi.fn() });
    render(<TabDrills data={activeDrillData()} emit={emit} />);
    // Default mode is 'session' when drill is active, so no need to click
    fireEvent.click(screen.getByRole('button', { name: /Advance Drill →/ }));
    expect(emit.manualAdvanceSpot).toHaveBeenCalled();
  });

  it('Advance Drill is disabled when phase is not waiting', () => {
    const emit = makeEmit({ manualAdvanceSpot: vi.fn() });
    const data = { ...activeDrillData(), gameState: { phase: 'flop' } };
    render(<TabDrills data={data} emit={emit} />);
    expect(screen.getByRole('button', { name: /Advance Drill →/ })).toBeDisabled();
  });

  it('Advance Drill is disabled when manualAdvanceSpot emit not available', () => {
    const emit = { activatePlaylist: vi.fn(), deactivatePlaylist: vi.fn() };
    render(<TabDrills data={activeDrillData()} emit={emit} />);
    expect(screen.getByRole('button', { name: /Advance Drill →/ })).toBeDisabled();
  });

  it('Advance Drill is disabled when auto_advance is on', () => {
    const emit = makeEmit({ manualAdvanceSpot: vi.fn() });
    const data = {
      playlists: [{ id: 'pl1', name: 'Test', count: 5, description: '' }],
      drillSession: {
        active: true,
        playlistId: 'pl1',
        scenarioName: 'AKo OOP',
        currentSpot: 'flop',
        handsDone: 1,
        handsTotal: 5,
        auto_advance: true,
      },
      gameState: { phase: 'waiting' },
    };
    render(<TabDrills data={data} emit={emit} />);
    expect(screen.getByRole('button', { name: /Advance Drill →/ })).toBeDisabled();
  });
});
