import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ScenarioLaunchPanel from '../components/sidebar/ScenarioLaunchPanel';

const baseProps = {
  playlists: [
    { playlist_id: 'p1', name: 'AK wet board', color: '#ff0' },
    { playlist_id: 'p2', name: 'BB defense',   color: '#0ff' },
  ],
  activePlayers: [
    { id: 'u1', name: 'Alice', seat: 1 },
    { id: 'u2', name: 'Bob',   seat: 5 },
  ],
  drill: {
    session: null, fitCount: null, resumable: null, log: [],
    launch: vi.fn(), pause: vi.fn(), resume: vi.fn(), restart: vi.fn(),
    advance: vi.fn(), cancel: vi.fn(), setHero: vi.fn(), setMode: vi.fn(),
  },
};

describe('ScenarioLaunchPanel idle state', () => {
  it('renders playlist + hero dropdowns', () => {
    render(<ScenarioLaunchPanel {...baseProps} />);
    expect(screen.getByLabelText('Playlist')).toBeInTheDocument();
    expect(screen.getByLabelText('Hero')).toBeInTheDocument();
  });

  it('disables Launch until playlist + hero picked', () => {
    render(<ScenarioLaunchPanel {...baseProps} />);
    const launchBtn = screen.getByRole('button', { name: /^Launch$/ });
    expect(launchBtn).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Playlist'), { target: { value: 'p1' } });
    fireEvent.change(screen.getByLabelText('Hero'),     { target: { value: 'u2' } });
    expect(launchBtn).toBeEnabled();
  });

  it('calls drill.launch with chosen fields on click', () => {
    render(<ScenarioLaunchPanel {...baseProps} />);
    fireEvent.change(screen.getByLabelText('Playlist'),   { target: { value: 'p1' } });
    fireEvent.change(screen.getByLabelText('Hero'),       { target: { value: 'u2' } });
    fireEvent.click(screen.getByLabelText('per_hand'));
    fireEvent.click(screen.getByRole('button', { name: /^Launch$/ }));
    expect(baseProps.drill.launch).toHaveBeenCalledWith(expect.objectContaining({
      playlistId: 'p1', heroPlayerId: 'u2', heroMode: 'per_hand',
    }));
  });

  it('shows zero-match warning when fitCount is 0', () => {
    const props = { ...baseProps, drill: { ...baseProps.drill, fitCount: 0 } };
    render(<ScenarioLaunchPanel {...props} />);
    expect(screen.getByText(/no scenarios fit/i)).toBeInTheDocument();
  });
});

describe('ScenarioLaunchPanel resume state', () => {
  it('renders Resume and Restart buttons when resumable is set', () => {
    const props = { ...baseProps, drill: { ...baseProps.drill, resumable: { priorPosition: 5, priorTotal: 10 } } };
    render(<ScenarioLaunchPanel {...props} />);
    expect(screen.getByRole('button', { name: /Resume from 5/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Restart/i })).toBeInTheDocument();
  });
});

describe('ScenarioLaunchPanel running state', () => {
  it('renders pause + advance + exit when a session is active', () => {
    const props = {
      ...baseProps,
      drill: { ...baseProps.drill, session: { id: 'ds1', status: 'active', current_position: 2, items_total: 10, hero_mode: 'sticky', auto_advance: false } },
    };
    render(<ScenarioLaunchPanel {...props} />);
    expect(screen.getByRole('button', { name: /Pause/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Advance/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Exit Drill/i })).toBeInTheDocument();
  });
});
