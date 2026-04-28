import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import TabSettings from '../TabSettings.jsx';

function makeData({ sb = 10, bb = 20, players = [], seats } = {}) {
  return {
    blindLevels: { current: { sb, bb, ante: 0 }, presets: [
      { sb: 10, bb: 20 }, { sb: 25, bb: 50 },
    ]},
    seatConfig: {
      maxSeats: 9,
      seats: seats ?? [
        { seat: 0, playerId: 'p1', player: 'Alice', stack: 1000, status: 'active', isHero: false, isBot: false },
        ...Array.from({ length: 8 }, (_, i) => ({ seat: i + 1, player: null })),
      ],
    },
    players,
    drillSession: { active: false },
  };
}

function makeEmit(overrides = {}) {
  return {
    setBlindLevels: vi.fn(),
    adjustStack:    vi.fn(),
    setPlayerInHand: vi.fn(),
    coachAddBot:    vi.fn(),
    coachKickPlayer: vi.fn(),
    ...overrides,
  };
}

const ALICE = { seat: 0, playerId: 'p1', stableId: 's1', name: 'Alice', stack: 1000, isHero: false, isBot: false, status: 'active', hands: 5 };

describe('TabSettings — Blinds', () => {
  it('Apply emits setBlindLevels(sb, bb) with the typed values', () => {
    const emit = makeEmit();
    render(<TabSettings data={makeData({ sb: 10, bb: 20 })} emit={emit} />);
    const inputs = screen.getAllByRole('spinbutton');
    fireEvent.change(inputs[0], { target: { value: '25' } });
    fireEvent.change(inputs[1], { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: /Apply 25\/50/i }));
    expect(emit.setBlindLevels).toHaveBeenCalledWith(25, 50);
  });

  it('Apply is disabled when not dirty', () => {
    render(<TabSettings data={makeData({ sb: 10, bb: 20 })} emit={makeEmit()} />);
    expect(screen.getByRole('button', { name: /Already current/i })).toBeDisabled();
  });

  it('Apply is disabled when bb <= sb (invalid)', () => {
    render(<TabSettings data={makeData({ sb: 10, bb: 20 })} emit={makeEmit()} />);
    const inputs = screen.getAllByRole('spinbutton');
    fireEvent.change(inputs[0], { target: { value: '50' } });
    fireEvent.change(inputs[1], { target: { value: '40' } });
    expect(screen.getByText(/BB must be a positive integer greater than SB/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Apply 50\/40/i })).toBeDisabled();
  });

  it('clicking a preset row populates sb/bb', () => {
    render(<TabSettings data={makeData({ sb: 10, bb: 20 })} emit={makeEmit()} />);
    fireEvent.click(screen.getByText(/Level 2/i));
    const inputs = screen.getAllByRole('spinbutton');
    expect(inputs[0]).toHaveValue(25);
    expect(inputs[1]).toHaveValue(50);
  });
});

describe('TabSettings — Players sub-tab', () => {
  it('Sit Out toggle emits setPlayerInHand(playerId, false) for active player', () => {
    const emit = makeEmit();
    render(<TabSettings data={makeData({ players: [ALICE] })} emit={emit} />);
    fireEvent.click(screen.getByRole('button', { name: /Players/i }));
    fireEvent.click(screen.getByTitle('Sit out'));
    expect(emit.setPlayerInHand).toHaveBeenCalledWith('p1', false);
  });

  it('Add Bot card emits coachAddBot(difficulty) — defaults to easy', () => {
    const emit = makeEmit();
    render(<TabSettings data={makeData({ players: [ALICE] })} emit={emit} />);
    fireEvent.click(screen.getByRole('button', { name: /Players/i }));
    fireEvent.click(screen.getByRole('button', { name: /\+ Add easy bot/i }));
    expect(emit.coachAddBot).toHaveBeenCalledWith('easy');
  });

  it('changing difficulty before Add Bot emits with new difficulty', () => {
    const emit = makeEmit();
    render(<TabSettings data={makeData({ players: [ALICE] })} emit={emit} />);
    fireEvent.click(screen.getByRole('button', { name: /Players/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Hard$/ }));
    fireEvent.click(screen.getByRole('button', { name: /\+ Add hard bot/i }));
    expect(emit.coachAddBot).toHaveBeenCalledWith('hard');
  });
});

describe('TabSettings — AdjustStackEditor', () => {
  function openEditor(emit) {
    render(<TabSettings data={makeData({ players: [ALICE] })} emit={emit} />);
    fireEvent.click(screen.getByRole('button', { name: /Players/i }));
    fireEvent.click(screen.getByTitle('Edit stack'));
  }

  it('Apply emits adjustStack(playerId, parsedInt) for changed value', () => {
    const emit = makeEmit();
    openEditor(emit);
    const stackInput = screen.getByDisplayValue('1000');
    fireEvent.change(stackInput, { target: { value: '1500' } });
    fireEvent.click(screen.getByRole('button', { name: /^Apply$/ }));
    expect(emit.adjustStack).toHaveBeenCalledWith('p1', 1500);
  });

  it('Apply is disabled when value equals current stack', () => {
    const emit = makeEmit();
    openEditor(emit);
    expect(screen.getByRole('button', { name: /^Apply$/ })).toBeDisabled();
  });

  it('Cancel closes editor without emitting', () => {
    const emit = makeEmit();
    openEditor(emit);
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(emit.adjustStack).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /^Apply$/ })).not.toBeInTheDocument();
  });

  it('warning appears when reducing below current stack', () => {
    const emit = makeEmit();
    openEditor(emit);
    fireEvent.change(screen.getByDisplayValue('1000'), { target: { value: '500' } });
    expect(screen.getByText(/Reducing stack mid-hand is rejected/i)).toBeInTheDocument();
  });
});

describe('TabSettings — Seats sub-tab', () => {
  it('empty-seat Add Bot card uses honest copy + sublabel', () => {
    const emit = makeEmit();
    render(<TabSettings data={makeData()} emit={emit} />);
    fireEvent.click(screen.getByRole('button', { name: /Seats/i }));
    // Click the empty seat S2 to select it
    fireEvent.click(screen.getByRole('button', { name: /S2/ }));
    expect(screen.getByText(/next open seat \(server-assigned\)/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /\+ Add easy bot to next open seat/i }));
    expect(emit.coachAddBot).toHaveBeenCalledWith('easy');
  });
});
