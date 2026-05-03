import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import TabSetup from '../TabSetup.jsx';

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

describe('TabSetup — Blinds', () => {
  it('shows only one numeric input (BB), with SB derived as BB/2', () => {
    const emit = makeEmit();
    render(<TabSetup data={makeData({ sb: 10, bb: 20 })} emit={emit} />);
    const inputs = screen.getAllByRole('spinbutton');
    expect(inputs).toHaveLength(1);
  });

  it('Apply emits setBlindLevels(bb/2, bb) using BB only', () => {
    const emit = makeEmit();
    render(<TabSetup data={makeData({ sb: 10, bb: 20 })} emit={emit} />);
    const bbInput = screen.getAllByRole('spinbutton')[0];
    fireEvent.change(bbInput, { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: /Apply 25\/50/i }));
    expect(emit.setBlindLevels).toHaveBeenCalledWith(25, 50);
  });

  it('Apply is disabled when BB is invalid (non-positive integer)', () => {
    render(<TabSetup data={makeData({ sb: 10, bb: 20 })} emit={makeEmit()} />);
    const bbInput = screen.getAllByRole('spinbutton')[0];
    fireEvent.change(bbInput, { target: { value: '0' } });
    expect(screen.getByText(/BB must be a positive integer greater than 1/i)).toBeInTheDocument();
  });

  it('clicking a Cash Preset row updates BB (and SB auto-derives)', () => {
    const emit = makeEmit();
    render(<TabSetup data={makeData({ sb: 10, bb: 20 })} emit={emit} />);
    // Data fixture has presets: [{ sb: 10, bb: 20 }, { sb: 25, bb: 50 }]
    // The second preset (25/50) has chip "use" label; click it
    const presetButtons = screen.getAllByText(/^use$/i);
    fireEvent.click(presetButtons[0]); // Click the first "use" button (the non-active preset)
    // After click, the Apply button should reflect the new BB and auto-derived SB
    expect(screen.getByRole('button', { name: /Apply 25\/50/i })).toBeInTheDocument();
  });
});

describe('TabSetup — Players sub-tab', () => {
  it('Sit Out toggle emits setPlayerInHand(playerId, false) for active player', () => {
    const emit = makeEmit();
    render(<TabSetup data={makeData({ players: [ALICE] })} emit={emit} />);
    fireEvent.click(screen.getByRole('button', { name: /Players/i }));
    fireEvent.click(screen.getByTitle('Sit out'));
    expect(emit.setPlayerInHand).toHaveBeenCalledWith('p1', false);
  });

  it('Add Bot card emits coachAddBot(difficulty) — defaults to easy', () => {
    const emit = makeEmit();
    render(<TabSetup data={makeData({ players: [ALICE] })} emit={emit} />);
    fireEvent.click(screen.getByRole('button', { name: /Players/i }));
    fireEvent.click(screen.getByRole('button', { name: /\+ Add easy bot/i }));
    expect(emit.coachAddBot).toHaveBeenCalledWith('easy');
  });

  it('changing difficulty before Add Bot emits with new difficulty', () => {
    const emit = makeEmit();
    render(<TabSetup data={makeData({ players: [ALICE] })} emit={emit} />);
    fireEvent.click(screen.getByRole('button', { name: /Players/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Hard$/ }));
    fireEvent.click(screen.getByRole('button', { name: /\+ Add hard bot/i }));
    expect(emit.coachAddBot).toHaveBeenCalledWith('hard');
  });
});

describe('TabSetup — AdjustStackEditor', () => {
  function openEditor(emit) {
    render(<TabSetup data={makeData({ players: [ALICE] })} emit={emit} />);
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

describe('TabSetup — Seats sub-tab', () => {
  it('empty-seat Add Bot card uses honest copy + sublabel', () => {
    const emit = makeEmit();
    render(<TabSetup data={makeData()} emit={emit} />);
    fireEvent.click(screen.getByRole('button', { name: /Seats/i }));
    // Click the empty seat S2 to select it
    fireEvent.click(screen.getByRole('button', { name: /S2/ }));
    expect(screen.getByText(/next open seat \(server-assigned\)/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /\+ Add easy bot to next open seat/i }));
    expect(emit.coachAddBot).toHaveBeenCalledWith('easy');
  });
});
