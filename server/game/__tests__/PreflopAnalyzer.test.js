'use strict';

const PreflopAnalyzer = require('../tagAnalyzers/preflop');

// Minimal base hand used across tests; individual tests override what they need.
const BASE_HAND = { board: [], phase_ended: 'preflop', dealer_seat: -1 };
const BASE_SEATED = [
  { player_id: 'p1', seat: 0, stack_start: 1000 },
  { player_id: 'p2', seat: 1, stack_start: 1000 },
  { player_id: 'p3', seat: 2, stack_start: 1000 },
];

function analyze(ctx) {
  return PreflopAnalyzer.analyze(ctx);
}

describe('PreflopAnalyzer', () => {

  // ── 3BET_POT ──────────────────────────────────────────────────────────────

  it('tags 3BET_POT when there are exactly 2 raises preflop', () => {
    const ctx = {
      hand: BASE_HAND,
      byStreet: {
        preflop: [
          { player_id: 'p1', action: 'raise', amount: 10 },
          { player_id: 'p2', action: 'raise', amount: 30 },
          { player_id: 'p1', action: 'call',  amount: 30 },
        ],
      },
      seated: BASE_SEATED,
      bbPlayerId: null,
    };
    const tags = analyze(ctx).map(t => t.tag);
    expect(tags).toContain('3BET_POT');
    expect(tags).not.toContain('FOUR_BET_POT');
  });

  it('does NOT tag 3BET_POT when there is only 1 raise preflop', () => {
    const ctx = {
      hand: BASE_HAND,
      byStreet: {
        preflop: [
          { player_id: 'p1', action: 'raise', amount: 10 },
          { player_id: 'p2', action: 'call',  amount: 10 },
        ],
      },
      seated: BASE_SEATED,
      bbPlayerId: null,
    };
    const tags = analyze(ctx).map(t => t.tag);
    expect(tags).not.toContain('3BET_POT');
  });

  // ── FOUR_BET_POT ──────────────────────────────────────────────────────────

  it('tags both 3BET_POT and FOUR_BET_POT when there are 3+ raises preflop', () => {
    const ctx = {
      hand: BASE_HAND,
      byStreet: {
        preflop: [
          { player_id: 'p1', action: 'raise', amount: 10 },
          { player_id: 'p2', action: 'raise', amount: 30 },
          { player_id: 'p1', action: 'raise', amount: 90 },
          { player_id: 'p2', action: 'call',  amount: 90 },
        ],
      },
      seated: BASE_SEATED,
      bbPlayerId: null,
    };
    const tags = analyze(ctx).map(t => t.tag);
    expect(tags).toContain('3BET_POT');
    expect(tags).toContain('FOUR_BET_POT');
  });

  // ── SQUEEZE_POT ───────────────────────────────────────────────────────────

  it('tags SQUEEZE_POT when a raise follows a (raise → call) sequence', () => {
    const ctx = {
      hand: BASE_HAND,
      byStreet: {
        preflop: [
          { player_id: 'p1', action: 'raise', amount: 10 },   // open
          { player_id: 'p2', action: 'call',  amount: 10 },   // flat call
          { player_id: 'p3', action: 'raise', amount: 35 },   // squeeze
        ],
      },
      seated: BASE_SEATED,
      bbPlayerId: null,
    };
    const tags = analyze(ctx).map(t => t.tag);
    expect(tags).toContain('SQUEEZE_POT');
  });

  it('does NOT tag SQUEEZE_POT when there is no caller before the 3-bet', () => {
    // open → 3-bet (no flat caller in between)
    const ctx = {
      hand: BASE_HAND,
      byStreet: {
        preflop: [
          { player_id: 'p1', action: 'raise', amount: 10 },
          { player_id: 'p2', action: 'raise', amount: 30 },
        ],
      },
      seated: BASE_SEATED,
      bbPlayerId: null,
    };
    const tags = analyze(ctx).map(t => t.tag);
    expect(tags).not.toContain('SQUEEZE_POT');
  });

  // ── ALL_IN_PREFLOP ────────────────────────────────────────────────────────

  it('tags ALL_IN_PREFLOP when any preflop action is all-in', () => {
    const ctx = {
      hand: BASE_HAND,
      byStreet: {
        preflop: [
          { player_id: 'p1', action: 'raise',  amount: 10 },
          { player_id: 'p2', action: 'all-in', amount: 1000 },
          { player_id: 'p1', action: 'call',   amount: 1000 },
        ],
      },
      seated: BASE_SEATED,
      bbPlayerId: null,
    };
    const tags = analyze(ctx).map(t => t.tag);
    expect(tags).toContain('ALL_IN_PREFLOP');
  });

  it('does NOT tag ALL_IN_PREFLOP when no preflop all-in action', () => {
    const ctx = {
      hand: BASE_HAND,
      byStreet: {
        preflop: [
          { player_id: 'p1', action: 'raise', amount: 10 },
          { player_id: 'p2', action: 'call',  amount: 10 },
        ],
      },
      seated: BASE_SEATED,
      bbPlayerId: null,
    };
    const tags = analyze(ctx).map(t => t.tag);
    expect(tags).not.toContain('ALL_IN_PREFLOP');
  });

  // ── LIMPED_POT ────────────────────────────────────────────────────────────

  it('tags LIMPED_POT when there are voluntary calls but no raise', () => {
    const ctx = {
      hand: BASE_HAND,
      byStreet: {
        preflop: [
          { player_id: 'p1', action: 'call',  amount: 10 },
          { player_id: 'p2', action: 'call',  amount: 10 },
          { player_id: 'p3', action: 'check', amount: 0  },
        ],
      },
      seated: BASE_SEATED,
      bbPlayerId: null,
    };
    const tags = analyze(ctx).map(t => t.tag);
    expect(tags).toContain('LIMPED_POT');
  });

  it('does NOT tag LIMPED_POT when there is a raise', () => {
    const ctx = {
      hand: BASE_HAND,
      byStreet: {
        preflop: [
          { player_id: 'p1', action: 'raise', amount: 10 },
          { player_id: 'p2', action: 'call',  amount: 10 },
        ],
      },
      seated: BASE_SEATED,
      bbPlayerId: null,
    };
    const tags = analyze(ctx).map(t => t.tag);
    expect(tags).not.toContain('LIMPED_POT');
  });

  // ── BTN_OPEN ──────────────────────────────────────────────────────────────

  it('tags BTN_OPEN when the player on the dealer seat is the first preflop raiser', () => {
    const seated = [
      { player_id: 'p1', seat: 0, stack_start: 1000 },
      { player_id: 'p2', seat: 1, stack_start: 1000 },
      { player_id: 'btn', seat: 2, stack_start: 1000 },  // dealer/button seat
    ];
    const ctx = {
      hand: { ...BASE_HAND, dealer_seat: 2 },
      byStreet: {
        preflop: [
          { player_id: 'p1', action: 'fold',  amount: 0  },
          { player_id: 'p2', action: 'fold',  amount: 0  },
          { player_id: 'btn', action: 'raise', amount: 25 },
        ],
      },
      seated,
      bbPlayerId: null,
    };
    const tags = analyze(ctx).map(t => t.tag);
    expect(tags).toContain('BTN_OPEN');
  });

  it('does NOT tag BTN_OPEN when a non-button player opens first', () => {
    const seated = [
      { player_id: 'p1', seat: 0, stack_start: 1000 },
      { player_id: 'p2', seat: 1, stack_start: 1000 },
      { player_id: 'btn', seat: 2, stack_start: 1000 },
    ];
    const ctx = {
      hand: { ...BASE_HAND, dealer_seat: 2 },
      byStreet: {
        preflop: [
          { player_id: 'p1', action: 'raise', amount: 25 },  // UTG opens, not BTN
          { player_id: 'btn', action: 'call',  amount: 25 },
        ],
      },
      seated,
      bbPlayerId: null,
    };
    const tags = analyze(ctx).map(t => t.tag);
    expect(tags).not.toContain('BTN_OPEN');
  });

  // ── BLIND_DEFENSE ─────────────────────────────────────────────────────────

  it('tags BLIND_DEFENSE when BB calls a raise', () => {
    const ctx = {
      hand: BASE_HAND,
      byStreet: {
        preflop: [
          { player_id: 'p1', action: 'raise', amount: 25 },
          { player_id: 'p2', action: 'fold',  amount: 0  },
          { player_id: 'bb', action: 'call',  amount: 25 },  // BB defends
        ],
      },
      seated: BASE_SEATED,
      bbPlayerId: 'bb',
    };
    const tags = analyze(ctx).map(t => t.tag);
    expect(tags).toContain('BLIND_DEFENSE');
  });

  it('tags BLIND_DEFENSE when BB re-raises a steal', () => {
    const ctx = {
      hand: BASE_HAND,
      byStreet: {
        preflop: [
          { player_id: 'p1', action: 'raise', amount: 25 },
          { player_id: 'bb', action: 'raise', amount: 75 },  // BB 3-bets
        ],
      },
      seated: BASE_SEATED,
      bbPlayerId: 'bb',
    };
    const tags = analyze(ctx).map(t => t.tag);
    expect(tags).toContain('BLIND_DEFENSE');
  });

  it('does NOT tag BLIND_DEFENSE when BB folds to the raise', () => {
    const ctx = {
      hand: BASE_HAND,
      byStreet: {
        preflop: [
          { player_id: 'p1', action: 'raise', amount: 25 },
          { player_id: 'bb', action: 'fold',  amount: 0  },
        ],
      },
      seated: BASE_SEATED,
      bbPlayerId: 'bb',
    };
    const tags = analyze(ctx).map(t => t.tag);
    expect(tags).not.toContain('BLIND_DEFENSE');
  });

});
