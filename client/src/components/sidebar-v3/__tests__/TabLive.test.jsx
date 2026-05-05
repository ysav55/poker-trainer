import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import TabLive from '../TabLive.jsx';
import NotesPanel from '../NotesPanel.jsx';

vi.mock('../../../hooks/useNotes.js', () => ({
  default: () => ({ notes: [{ id: 'n1', body: 'hello', author_name: 'Coach' }], loading: false, error: null, refresh: vi.fn(), add: vi.fn(), edit: vi.fn(), remove: vi.fn() }),
}));

function liveData(overrides = {}) {
  return {
    gameState: {
      phase: 'waiting',
      paused: false,
      hand_id: null,
      players: [],
      hand_history: [],
      hand_number: null,
      pot: 0,
      board: [],
      current_turn: null,
    },
    actionTimer: { playerId: null, duration: 0, remaining: 0 },
    equityData: { showToPlayers: false, equities: [], colors: {} },
    myId: 'me',
    myStableId: 'me',
    seatConfig: { maxSeats: 9, seats: Array.from({ length: 9 }, (_, i) => ({ seat: i, player: null })) },
    players: [],
    blindLevels: { current: { sb: 10, bb: 20 }, presets: [] },
    review: { loaded: false },
    actions_log: [],
    ...overrides,
  };
}

const noopEmit = {
  togglePause: vi.fn(), startConfiguredHand: vi.fn(),
  setPlayerInHand: vi.fn(), coachAddBot: vi.fn(),
  coachKickPlayer: vi.fn(), updateHandConfig: vi.fn(),
};

describe('TabLive — Action Log', () => {
  it('renders the section title "Action Log" (renamed from Action Feed)', () => {
    render(<TabLive data={liveData()} emit={noopEmit} />);
    expect(screen.getByText('Action Log')).toBeInTheDocument();
  });

  it('renders rows from actions_log', () => {
    const actions_log = [
      { street: 'flop', who: 'Alice', act: 'check', amt: null, pending: false },
      { street: 'preflop', who: 'Bob', act: 'raise', amt: 60, pending: false },
    ];
    render(<TabLive data={liveData({ actions_log })} emit={noopEmit} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText(/raise/i)).toBeInTheDocument();
    expect(screen.getByText('60')).toBeInTheDocument();
  });

  it('does NOT render the "phase 2" placeholder copy', () => {
    render(<TabLive data={liveData()} emit={noopEmit} />);
    expect(screen.queryByText(/Live action feed wires up in Phase 2/i)).toBeNull();
  });
});

describe('TabLive — seat-card buttons (Setup-only verbs removed)', () => {
  function withSeat(overrides = {}) {
    return liveData({
      seatConfig: {
        maxSeats: 9,
        seats: [
          { seat: 0, playerId: 'p1', player: 'Alice', stack: 1000, status: 'active', isHero: false, isBot: false },
          ...Array.from({ length: 8 }, (_, i) => ({ seat: i + 1, player: null })),
        ],
      },
      ...overrides,
    });
  }

  it('does NOT render the +Bot button on Live tab', () => {
    render(<TabLive data={withSeat()} emit={noopEmit} />);
    // The +Bot button's name is " Bot" after "+" is parsed
    expect(screen.queryByTitle(/Add a bot/i)).toBeNull();
  });

  it('does NOT render the per-seat Adjust (±) button', () => {
    render(<TabLive data={withSeat()} emit={noopEmit} />);
    expect(screen.queryByTitle(/Adjust stack/i)).toBeNull();
  });

  it('does NOT render the per-seat Kick (×) button', () => {
    render(<TabLive data={withSeat()} emit={noopEmit} />);
    expect(screen.queryByTitle(/Kick player/i)).toBeNull();
  });

  it('still renders the Sit-out / Sit-in toggle', () => {
    render(<TabLive data={withSeat()} emit={noopEmit} />);
    // The sit-out button uses glyph text (❚❚ or ▶), not readable name
    const sitoutBtn = screen.getByTitle(/Sit (in|out)/i);
    expect(sitoutBtn).toBeInTheDocument();
  });
});

describe('TabLive — Notes panel', () => {
  function withHand(overrides = {}) {
    const baseData = liveData({
      gameState: {
        phase: 'flop',
        paused: false,
        hand_id: 'h-current',
        players: [{ id: 'p1', name: 'Alice', stableId: 'stable1', stack: 1000 }],
        current_turn: 'p1',
        board: ['AS', 'KS', 'QS'],
      },
      ...overrides,
    });
    return baseData;
  }

  it('does not render Notes content when notesOpen is false', () => {
    render(<TabLive data={withHand()} emit={noopEmit} notesOpen={false} />);
    expect(screen.queryByText('hello')).toBeNull();
  });

  it('renders NotesPanel content when notesOpen is true', () => {
    render(<TabLive data={withHand()} emit={noopEmit} notesOpen={true} />);
    expect(screen.getByText('hello')).toBeInTheDocument();
  });
});

describe('TabLive — Equity toggles', () => {
  it('renders the EquityToggleRow inside the equity card', () => {
    const data = liveData({ equity_visibility: { coach: true, players: false } });
    render(<TabLive data={data} emit={noopEmit} />);
    expect(screen.getByRole('button', { name: /Show Coach/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Show Players/ })).toBeInTheDocument();
  });
});
