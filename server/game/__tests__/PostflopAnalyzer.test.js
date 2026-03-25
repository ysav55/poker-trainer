'use strict';

const PostflopAnalyzer = require('../tagAnalyzers/postflop');

function analyze(ctx) {
  return PostflopAnalyzer.analyze(ctx);
}

describe('PostflopAnalyzer', () => {

  // ── C_BET ─────────────────────────────────────────────────────────────────

  it('tags C_BET when last preflop raiser bets first on the flop', () => {
    const ctx = {
      hand: { board: ['Ah', 'Kd', '2c'], phase_ended: 'flop' },
      byStreet: {
        preflop: [
          { player_id: 'p1', action: 'raise', amount: 25 },
          { player_id: 'p2', action: 'call',  amount: 25 },
        ],
        flop: [
          { player_id: 'p2', action: 'check', amount: 0  },
          { player_id: 'p1', action: 'bet',   amount: 30 },
          { player_id: 'p2', action: 'call',  amount: 30 },
        ],
      },
    };
    const tags = analyze(ctx).map(t => t.tag);
    expect(tags).toContain('C_BET');
  });

  it('does NOT tag C_BET when a different player bets first on the flop', () => {
    const ctx = {
      hand: { board: ['Ah', 'Kd', '2c'], phase_ended: 'flop' },
      byStreet: {
        preflop: [
          { player_id: 'p1', action: 'raise', amount: 25 },
          { player_id: 'p2', action: 'call',  amount: 25 },
        ],
        flop: [
          { player_id: 'p2', action: 'bet',   amount: 30 },  // non-raiser leads
          { player_id: 'p1', action: 'call',  amount: 30 },
        ],
      },
    };
    const tags = analyze(ctx).map(t => t.tag);
    expect(tags).not.toContain('C_BET');
  });

  it('does NOT tag C_BET when last preflop raiser checks the flop', () => {
    const ctx = {
      hand: { board: ['Ah', 'Kd', '2c'], phase_ended: 'flop' },
      byStreet: {
        preflop: [
          { player_id: 'p1', action: 'raise', amount: 25 },
          { player_id: 'p2', action: 'call',  amount: 25 },
        ],
        flop: [
          { player_id: 'p1', action: 'check', amount: 0  },
          { player_id: 'p2', action: 'check', amount: 0  },
        ],
      },
    };
    const tags = analyze(ctx).map(t => t.tag);
    expect(tags).not.toContain('C_BET');
  });

  // ── CHECK_RAISE ───────────────────────────────────────────────────────────

  it('tags CHECK_RAISE when a player checks then raises on the same street', () => {
    const ctx = {
      hand: { board: ['Ah', 'Kd', '2c'], phase_ended: 'flop' },
      byStreet: {
        preflop: [
          { player_id: 'p1', action: 'raise', amount: 25 },
          { player_id: 'p2', action: 'call',  amount: 25 },
        ],
        flop: [
          { player_id: 'p2', action: 'check', amount: 0  },
          { player_id: 'p1', action: 'bet',   amount: 30 },
          { player_id: 'p2', action: 'raise', amount: 90 },  // check-raise
        ],
      },
    };
    const tags = analyze(ctx).map(t => t.tag);
    expect(tags).toContain('CHECK_RAISE');
  });

  it('does NOT tag CHECK_RAISE when the raiser never checked on that street', () => {
    const ctx = {
      hand: { board: ['Ah', 'Kd', '2c'], phase_ended: 'flop' },
      byStreet: {
        preflop: [
          { player_id: 'p1', action: 'raise', amount: 25 },
          { player_id: 'p2', action: 'call',  amount: 25 },
        ],
        flop: [
          { player_id: 'p1', action: 'bet',   amount: 30 },
          { player_id: 'p2', action: 'raise', amount: 90 },  // no prior check from p2
        ],
      },
    };
    const tags = analyze(ctx).map(t => t.tag);
    expect(tags).not.toContain('CHECK_RAISE');
  });

  it('detects CHECK_RAISE on the turn street', () => {
    const ctx = {
      hand: { board: ['Ah', 'Kd', '2c', '7s'], phase_ended: 'turn' },
      byStreet: {
        preflop: [
          { player_id: 'p1', action: 'raise', amount: 25 },
          { player_id: 'p2', action: 'call',  amount: 25 },
        ],
        flop: [
          { player_id: 'p1', action: 'bet',  amount: 30 },
          { player_id: 'p2', action: 'call', amount: 30 },
        ],
        turn: [
          { player_id: 'p2', action: 'check', amount: 0  },
          { player_id: 'p1', action: 'bet',   amount: 60 },
          { player_id: 'p2', action: 'raise', amount: 180 },
        ],
      },
    };
    const tags = analyze(ctx).map(t => t.tag);
    expect(tags).toContain('CHECK_RAISE');
  });

  // ── BLUFF_CATCH ───────────────────────────────────────────────────────────

  it('tags BLUFF_CATCH when the hand winner calls the last river bet at showdown', () => {
    const ctx = {
      hand: { board: ['Ah', 'Kd', '2c', '7s', 'Jh'], phase_ended: 'showdown', winner_id: 'p2' },
      byStreet: {
        preflop: [],
        river: [
          { player_id: 'p1', action: 'bet',  amount: 100 },
          { player_id: 'p2', action: 'call', amount: 100 },  // caller wins → bluff catch
        ],
      },
    };
    const tags = analyze(ctx).map(t => t.tag);
    expect(tags).toContain('BLUFF_CATCH');
  });

  it('does NOT tag BLUFF_CATCH when phase_ended is not showdown', () => {
    const ctx = {
      hand: { board: ['Ah', 'Kd', '2c', '7s', 'Jh'], phase_ended: 'river', winner_id: 'p2' },
      byStreet: {
        preflop: [],
        river: [
          { player_id: 'p1', action: 'bet',  amount: 100 },
          { player_id: 'p2', action: 'call', amount: 100 },
        ],
      },
    };
    const tags = analyze(ctx).map(t => t.tag);
    expect(tags).not.toContain('BLUFF_CATCH');
  });

  it('does NOT tag BLUFF_CATCH when the bettor (not the caller) wins', () => {
    const ctx = {
      hand: { board: ['Ah', 'Kd', '2c', '7s', 'Jh'], phase_ended: 'showdown', winner_id: 'p1' },
      byStreet: {
        preflop: [],
        river: [
          { player_id: 'p1', action: 'bet',  amount: 100 },
          { player_id: 'p2', action: 'call', amount: 100 },
        ],
      },
    };
    const tags = analyze(ctx).map(t => t.tag);
    expect(tags).not.toContain('BLUFF_CATCH');
  });

  // ── DONK_BET ─────────────────────────────────────────────────────────────

  it('tags DONK_BET when a non-preflop-raiser leads the bet on the flop', () => {
    const ctx = {
      hand: { board: ['Ah', 'Kd', '2c'], phase_ended: 'flop' },
      byStreet: {
        preflop: [
          { player_id: 'p1', action: 'raise', amount: 25 },
          { player_id: 'p2', action: 'call',  amount: 25 },
        ],
        flop: [
          { player_id: 'p2', action: 'bet',  amount: 30 },  // p2 was the caller, not raiser
          { player_id: 'p1', action: 'call', amount: 30 },
        ],
      },
    };
    const tags = analyze(ctx).map(t => t.tag);
    expect(tags).toContain('DONK_BET');
  });

  it('does NOT tag DONK_BET when the preflop raiser bets first on the flop', () => {
    const ctx = {
      hand: { board: ['Ah', 'Kd', '2c'], phase_ended: 'flop' },
      byStreet: {
        preflop: [
          { player_id: 'p1', action: 'raise', amount: 25 },
          { player_id: 'p2', action: 'call',  amount: 25 },
        ],
        flop: [
          { player_id: 'p1', action: 'bet',  amount: 30 },
          { player_id: 'p2', action: 'fold', amount: 0  },
        ],
      },
    };
    const tags = analyze(ctx).map(t => t.tag);
    expect(tags).not.toContain('DONK_BET');
  });

  // ── RIVER_RAISE ───────────────────────────────────────────────────────────

  it('tags RIVER_RAISE when any river action is a raise', () => {
    const ctx = {
      hand: { board: ['Ah', 'Kd', '2c', '7s', 'Jh'], phase_ended: 'river' },
      byStreet: {
        preflop: [],
        river: [
          { player_id: 'p1', action: 'bet',   amount: 100 },
          { player_id: 'p2', action: 'raise', amount: 300 },
          { player_id: 'p1', action: 'fold',  amount: 0   },
        ],
      },
    };
    const tags = analyze(ctx).map(t => t.tag);
    expect(tags).toContain('RIVER_RAISE');
  });

  it('does NOT tag RIVER_RAISE when no raise occurs on the river', () => {
    const ctx = {
      hand: { board: ['Ah', 'Kd', '2c', '7s', 'Jh'], phase_ended: 'river' },
      byStreet: {
        preflop: [],
        river: [
          { player_id: 'p1', action: 'bet',  amount: 100 },
          { player_id: 'p2', action: 'call', amount: 100 },
        ],
      },
    };
    const tags = analyze(ctx).map(t => t.tag);
    expect(tags).not.toContain('RIVER_RAISE');
  });

});
