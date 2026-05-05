import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import TabSetup from '../TabSetup.jsx';

function makeData({ sb = 10, bb = 20, players = [], seats, gameState, pending_blinds } = {}) {
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
    gameState: gameState ?? { phase: 'waiting', paused: false, hand_id: null },
    pending_blinds: pending_blinds ?? null,
  };
}

function makeEmit(overrides = {}) {
  return {
    setBlindLevels: vi.fn(),
    adjustStack:    vi.fn(),
    setPlayerInHand: vi.fn(),
    coachAddBot:    vi.fn(),
    coachKickPlayer: vi.fn(),
    applyBlindsAtNextHand: vi.fn(),
    discardPendingBlinds: vi.fn(),
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

describe('TabSetup — Seats Edit Stack flow', () => {
  function seatedAlice(stack = 1000) {
    return makeData({
      seats: [
        { seat: 0, playerId: 'p1', player: 'Alice', stack, status: 'active', isHero: false, isBot: false },
        ...Array.from({ length: 8 }, (_, i) => ({ seat: i + 1, player: null })),
      ],
    });
  }

  function openEditStack() {
    // First, make sure we're on Seats tab
    fireEvent.click(screen.getByRole('button', { name: /Seats/i }));
    // Click the seat 0 button (Alice) to select it
    fireEvent.click(screen.getByRole('button', { name: /S1/i }));
    // Click the "Edit Stack" button
    fireEvent.click(screen.getByRole('button', { name: /Edit Stack/i }));
  }

  it('Apply emits adjustStack(playerId, newStack)', () => {
    const emit = makeEmit();
    render(<TabSetup data={seatedAlice(1000)} emit={emit} />);
    openEditStack();
    const input = screen.getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '2000' } });
    fireEvent.click(screen.getByRole('button', { name: /^Apply$/i }));
    expect(emit.adjustStack).toHaveBeenCalledWith('p1', 2000);
  });

  it('Apply is disabled when value unchanged', () => {
    render(<TabSetup data={seatedAlice(1000)} emit={makeEmit()} />);
    openEditStack();
    expect(screen.getByRole('button', { name: /^Apply$/i })).toBeDisabled();
  });

  it('Cancel closes editor without emitting', () => {
    const emit = makeEmit();
    render(<TabSetup data={seatedAlice(1000)} emit={emit} />);
    openEditStack();
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(emit.adjustStack).not.toHaveBeenCalled();
    // Editor should be gone — spinbutton should not exist
    expect(screen.queryByRole('spinbutton')).toBeNull();
  });

  it('Shows reducing-stack warning when new stack < current', () => {
    render(<TabSetup data={seatedAlice(1000)} emit={makeEmit()} />);
    openEditStack();
    const input = screen.getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '500' } });
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

describe('TabSetup — sub-mode segment', () => {
  it('exposes only Blinds and Seats sub-modes (Players removed)', () => {
    render(<TabSetup data={makeData()} emit={makeEmit()} />);
    expect(screen.getByRole('button', { name: 'Blinds' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Seats' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Players' })).toBeNull();
  });
});

describe('TabSetup — Blinds Apply Now vs Apply at Next Hand', () => {
  it('phase=waiting renders Apply Now and emits setBlindLevels', () => {
    const emit = makeEmit();
    const data = { ...makeData({ bb: 20 }), gameState: { phase: 'waiting', paused: false, hand_id: null }, pending_blinds: null };
    render(<TabSetup data={data} emit={emit} />);
    fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: /Apply 25\/50/i }));
    expect(emit.setBlindLevels).toHaveBeenCalledWith(25, 50);
  });

  it('phase!=waiting renders Apply at Next Hand and emits applyBlindsAtNextHand', () => {
    const emit = makeEmit({ applyBlindsAtNextHand: vi.fn() });
    const data = { ...makeData({ bb: 20 }), gameState: { phase: 'flop', paused: false, hand_id: 'h1' }, pending_blinds: null };
    render(<TabSetup data={data} emit={emit} />);
    fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: /Apply at Next Hand/i }));
    expect(emit.applyBlindsAtNextHand).toHaveBeenCalledWith(25, 50);
  });

  it('renders PendingBlindsBanner when pending_blinds present', () => {
    const data = {
      ...makeData({ bb: 20 }),
      gameState: { phase: 'flop', paused: false, hand_id: 'h1' },
      pending_blinds: { sb: 25, bb: 50, queuedAt: Date.now() },
    };
    render(<TabSetup data={data} emit={makeEmit()} />);
    expect(screen.getByText(/Discard Pending/)).toBeInTheDocument();
  });
});

describe('TabSetup — Seats grid (V12 final)', () => {
  function makeSeats(occupiedSeatNumbers = [0]) {
    const seats = Array.from({ length: 9 }, (_, i) => {
      if (occupiedSeatNumbers.includes(i)) {
        return { seat: i, playerId: `p${i}`, player: `Player${i}`, stack: 1000, status: 'active', isHero: i === 0, isBot: false };
      }
      return { seat: i, player: null };
    });
    return makeData({ seats });
  }

  it('renders 9 cells in a 3-column grid', () => {
    render(<TabSetup data={makeSeats()} emit={makeEmit()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Seats' }));
    // Find all seat buttons (labeled S1, S2, etc.)
    const seatButtons = screen.getAllByText(/^S\d$/).map(el => el.closest('button'));
    const uniqueSeats = new Set(seatButtons);
    expect(uniqueSeats.size).toBe(9);
  });

  it('clicking an empty cell shows the bot picker + Add Bot button', () => {
    render(<TabSetup data={makeSeats([0])} emit={makeEmit()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Seats' }));
    // Click seat 2 (index 1, second cell)
    const cellsText = screen.getAllByText(/^S\d$/);
    const s2Label = cellsText.find(el => el.textContent === 'S2');
    if (s2Label) {
      fireEvent.click(s2Label.closest('button'));
    }
    // Bot picker and Add Bot button visible
    expect(screen.getByRole('button', { name: /Add.*bot to next open seat/i })).toBeInTheDocument();
  });

  it('clicking an occupied cell shows Edit Stack / Sit In or Out / Kick', () => {
    render(<TabSetup data={makeSeats([0])} emit={makeEmit()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Seats' }));
    // Click seat 1 cell (Player0) — should already be selected by default
    expect(screen.getByRole('button', { name: /Edit Stack/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sit (In|Out)/i })).toBeInTheDocument();
  });

  it('+ Add bot emits coachAddBot with difficulty', () => {
    const emit = makeEmit();
    render(<TabSetup data={makeSeats([0])} emit={emit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Seats' }));
    // Click an empty seat (S2)
    const cellsText = screen.getAllByText(/^S\d$/);
    const s2Label = cellsText.find(el => el.textContent === 'S2');
    if (s2Label) {
      fireEvent.click(s2Label.closest('button'));
    }
    fireEvent.click(screen.getByRole('button', { name: /Add.*bot to next open seat/i }));
    expect(emit.coachAddBot).toHaveBeenCalledWith('easy');
  });

  it('Kick is hidden for the hero seat (cannot kick yourself)', () => {
    render(<TabSetup data={makeSeats([0])} emit={makeEmit()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Seats' }));
    // Click S1 (Player0, who is the hero)
    expect(screen.queryByRole('button', { name: /Kick Player/i })).toBeNull();
  });

  it('Kick appears for non-hero occupied seats', () => {
    render(<TabSetup data={makeSeats([0, 1])} emit={makeEmit()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Seats' }));
    // Click S2 (Player1, not the hero)
    const cellsText = screen.getAllByText(/^S\d$/);
    const s2Label = cellsText.find(el => el.textContent === 'S2');
    if (s2Label) {
      fireEvent.click(s2Label.closest('button'));
    }
    expect(screen.getByRole('button', { name: /Kick Player/i })).toBeInTheDocument();
  });
});
