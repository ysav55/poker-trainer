'use strict';

const PositionalAnalyzer = require('../tagAnalyzers/positional');

function analyze(ctx) {
  return PositionalAnalyzer.analyze(ctx);
}

// isInPosition(seated, dealerSeat, A, B) returns true if A acts later postflop
// than B (lower offset from dealer = acts later = in position).
// Seated order: [seat0, seat1, seat2]. dealerSeat=2 → BTN is at index 2.
// offset = (idx - dealerIdx + n) % n
//   seat2 (dealer/BTN): offset 0 → acts last → IP
//   seat0:              offset 1 → acts 2nd
//   seat1:              offset 2 → acts 1st → OOP
// So BTN (seat2) is IP vs seat0 or seat1.

const SEATED_3 = [
  { player_id: 'utg', seat: 0, stack_start: 1000 },
  { player_id: 'sb',  seat: 1, stack_start: 1000 },
  { player_id: 'btn', seat: 2, stack_start: 1000 },
];
const DEALER_SEAT = 2;

describe('PositionalAnalyzer', () => {

  // ── C_BET_IP ──────────────────────────────────────────────────────────────

  it('tags C_BET_IP when the preflop raiser c-bets and is in position relative to opponent', () => {
    // btn (seat2, offset=0) c-bets against utg (seat0, offset=1): btn is IP
    const ctx = {
      hand: { board: ['Ah', 'Kd', '2c'], phase_ended: 'flop', dealer_seat: DEALER_SEAT },
      byStreet: {
        preflop: [
          { player_id: 'utg', action: 'call',  amount: 10 },
          { player_id: 'btn', action: 'raise', amount: 25 },
          { player_id: 'utg', action: 'call',  amount: 25 },
        ],
        flop: [
          { player_id: 'utg', action: 'check', amount: 0  },
          { player_id: 'btn', action: 'bet',   amount: 30 },
          { player_id: 'utg', action: 'call',  amount: 30 },
        ],
      },
      seated: SEATED_3,
      positions: { utg: 'UTG', sb: 'SB', btn: 'BTN' },
    };
    const tags = analyze(ctx);
    expect(tags.map(t => t.tag)).toContain('C_BET_IP');
    expect(tags.find(t => t.tag === 'C_BET_IP')?.player_id).toBe('btn');
    expect(tags.map(t => t.tag)).not.toContain('C_BET_OOP');
  });

  // ── C_BET_OOP ─────────────────────────────────────────────────────────────

  it('tags C_BET_OOP when the preflop raiser c-bets and is out of position', () => {
    // utg (seat0, offset=1) raised preflop; btn (seat2, offset=0) called.
    // utg bets first on the flop but utg is OOP relative to btn.
    const ctx = {
      hand: { board: ['Ah', 'Kd', '2c'], phase_ended: 'flop', dealer_seat: DEALER_SEAT },
      byStreet: {
        preflop: [
          { player_id: 'utg', action: 'raise', amount: 25 },
          { player_id: 'btn', action: 'call',  amount: 25 },
        ],
        flop: [
          { player_id: 'utg', action: 'bet',  amount: 30 },
          { player_id: 'btn', action: 'call', amount: 30 },
        ],
      },
      seated: SEATED_3,
      positions: { utg: 'UTG', sb: 'SB', btn: 'BTN' },
    };
    const tags = analyze(ctx);
    expect(tags.map(t => t.tag)).toContain('C_BET_OOP');
    expect(tags.find(t => t.tag === 'C_BET_OOP')?.player_id).toBe('utg');
    expect(tags.map(t => t.tag)).not.toContain('C_BET_IP');
  });

  it('tags neither C_BET_IP nor C_BET_OOP when there are no flop actions', () => {
    const ctx = {
      hand: { board: [], phase_ended: 'preflop', dealer_seat: DEALER_SEAT },
      byStreet: {
        preflop: [
          { player_id: 'btn', action: 'raise', amount: 25 },
          { player_id: 'utg', action: 'fold',  amount: 0  },
        ],
        flop: [],
      },
      seated: SEATED_3,
      positions: { utg: 'UTG', sb: 'SB', btn: 'BTN' },
    };
    const tags = analyze(ctx).map(t => t.tag);
    expect(tags).not.toContain('C_BET_IP');
    expect(tags).not.toContain('C_BET_OOP');
  });

  // ── DONK_BET_BB ───────────────────────────────────────────────────────────

  it('tags DONK_BET_BB when the BB leads into the preflop raiser on the flop', () => {
    const seated = [
      { player_id: 'btn', seat: 0, stack_start: 1000 },
      { player_id: 'sb',  seat: 1, stack_start: 1000 },
      { player_id: 'bb',  seat: 2, stack_start: 1000 },
    ];
    const ctx = {
      hand: { board: ['Ah', 'Kd', '2c'], phase_ended: 'flop', dealer_seat: 0 },
      byStreet: {
        preflop: [
          { player_id: 'btn', action: 'raise', amount: 25 },
          { player_id: 'sb',  action: 'fold',  amount: 0  },
          { player_id: 'bb',  action: 'call',  amount: 25 },
        ],
        flop: [
          { player_id: 'bb',  action: 'bet',  amount: 30 },  // BB donk-bets
          { player_id: 'btn', action: 'call', amount: 30 },
        ],
      },
      seated,
      positions: { btn: 'BTN', sb: 'SB', bb: 'BB' },
    };
    const tags = analyze(ctx);
    expect(tags.map(t => t.tag)).toContain('DONK_BET_BB');
    expect(tags.find(t => t.tag === 'DONK_BET_BB')?.player_id).toBe('bb');
  });

  it('does NOT tag DONK_BET_BB when the donk-bettor is not in BB position', () => {
    const ctx = {
      hand: { board: ['Ah', 'Kd', '2c'], phase_ended: 'flop', dealer_seat: DEALER_SEAT },
      byStreet: {
        preflop: [
          { player_id: 'btn', action: 'raise', amount: 25 },
          { player_id: 'utg', action: 'call',  amount: 25 },
        ],
        flop: [
          { player_id: 'utg', action: 'bet',  amount: 30 },  // UTG donks, not BB
          { player_id: 'btn', action: 'call', amount: 30 },
        ],
      },
      seated: SEATED_3,
      positions: { utg: 'UTG', sb: 'SB', btn: 'BTN' },
    };
    const tags = analyze(ctx).map(t => t.tag);
    expect(tags).not.toContain('DONK_BET_BB');
  });

  // ── 3BET_BTN ─────────────────────────────────────────────────────────────

  it('tags 3BET_BTN when the BTN is the second raiser preflop', () => {
    const ctx = {
      hand: { board: [], phase_ended: 'preflop', dealer_seat: DEALER_SEAT },
      byStreet: {
        preflop: [
          { player_id: 'utg', action: 'raise', amount: 10 },  // 1st raise
          { player_id: 'btn', action: 'raise', amount: 30 },  // 2nd raise (3-bet from BTN)
          { player_id: 'utg', action: 'fold',  amount: 0  },
        ],
        flop: [],
      },
      seated: SEATED_3,
      positions: { utg: 'UTG', sb: 'SB', btn: 'BTN' },
    };
    const tags = analyze(ctx);
    expect(tags.map(t => t.tag)).toContain('3BET_BTN');
    expect(tags.find(t => t.tag === '3BET_BTN')?.player_id).toBe('btn');
    expect(tags.map(t => t.tag)).not.toContain('3BET_SB');
  });

  // ── 3BET_SB ──────────────────────────────────────────────────────────────

  it('tags 3BET_SB when the SB is the second raiser preflop', () => {
    const ctx = {
      hand: { board: [], phase_ended: 'preflop', dealer_seat: DEALER_SEAT },
      byStreet: {
        preflop: [
          { player_id: 'utg', action: 'raise', amount: 10 },  // 1st raise
          { player_id: 'sb',  action: 'raise', amount: 30 },  // 2nd raise (3-bet from SB)
          { player_id: 'utg', action: 'fold',  amount: 0  },
        ],
        flop: [],
      },
      seated: SEATED_3,
      positions: { utg: 'UTG', sb: 'SB', btn: 'BTN' },
    };
    const tags = analyze(ctx);
    expect(tags.map(t => t.tag)).toContain('3BET_SB');
    expect(tags.find(t => t.tag === '3BET_SB')?.player_id).toBe('sb');
    expect(tags.map(t => t.tag)).not.toContain('3BET_BTN');
  });

  it('does NOT tag 3BET_BTN or 3BET_SB when UTG makes the 3-bet', () => {
    const ctx = {
      hand: { board: [], phase_ended: 'preflop', dealer_seat: DEALER_SEAT },
      byStreet: {
        preflop: [
          { player_id: 'btn', action: 'raise', amount: 10 },
          { player_id: 'utg', action: 'raise', amount: 30 },  // UTG 3-bets
          { player_id: 'btn', action: 'fold',  amount: 0  },
        ],
        flop: [],
      },
      seated: SEATED_3,
      positions: { utg: 'UTG', sb: 'SB', btn: 'BTN' },
    };
    const tags = analyze(ctx).map(t => t.tag);
    expect(tags).not.toContain('3BET_BTN');
    expect(tags).not.toContain('3BET_SB');
  });

  // ── SQUEEZE_CO ────────────────────────────────────────────────────────────

  it('tags SQUEEZE_CO when the CO squeezes after a raise and a flat caller', () => {
    const ctx = {
      hand: { board: [], phase_ended: 'preflop', dealer_seat: DEALER_SEAT },
      byStreet: {
        preflop: [
          { player_id: 'utg', action: 'raise', amount: 10 },   // open
          { player_id: 'btn', action: 'call',  amount: 10 },   // flat call
          { player_id: 'co',  action: 'raise', amount: 35 },   // CO squeezes
          { player_id: 'utg', action: 'fold',  amount: 0  },
          { player_id: 'btn', action: 'fold',  amount: 0  },
        ],
        flop: [],
      },
      seated: SEATED_3,
      positions: { utg: 'UTG', sb: 'SB', btn: 'BTN', co: 'CO' },
    };
    const tags = analyze(ctx);
    expect(tags.map(t => t.tag)).toContain('SQUEEZE_CO');
    expect(tags.find(t => t.tag === 'SQUEEZE_CO')?.player_id).toBe('co');
  });

  it('does NOT tag SQUEEZE_CO when the squeezer is not in CO position', () => {
    const ctx = {
      hand: { board: [], phase_ended: 'preflop', dealer_seat: DEALER_SEAT },
      byStreet: {
        preflop: [
          { player_id: 'utg', action: 'raise', amount: 10 },
          { player_id: 'btn', action: 'call',  amount: 10 },
          { player_id: 'sb',  action: 'raise', amount: 35 },   // SB squeezes, not CO
        ],
        flop: [],
      },
      seated: SEATED_3,
      positions: { utg: 'UTG', sb: 'SB', btn: 'BTN' },
    };
    const tags = analyze(ctx).map(t => t.tag);
    expect(tags).not.toContain('SQUEEZE_CO');
  });

});
