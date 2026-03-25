'use strict';

const HandStrengthAnalyzer = require('../tagAnalyzers/handStrength');

// HAND_RANKS values confirmed from HandEvaluator.test.js:
//   HIGH_CARD=0, ONE_PAIR=1, TWO_PAIR=2, THREE_OF_A_KIND=3, STRAIGHT=4,
//   FLUSH=5, FULL_HOUSE=6, FOUR_OF_A_KIND=7, STRAIGHT_FLUSH=8, ROYAL_FLUSH=9

function makeAction(overrides) {
  return {
    id: 1,
    player_id: 'p1',
    action: 'check',
    amount: 0,
    street: 'river',
    is_reverted: false,
    pot_at_action: 100,
    sizingRatio: null,
    position: null,
    ...overrides,
  };
}

function analyze(ctx) {
  return HandStrengthAnalyzer.analyze(ctx);
}

// Base seated list used in most tests.
const SEATED = [
  { player_id: 'p1', seat: 0, stack_start: 1000 },
  { player_id: 'p2', seat: 1, stack_start: 1000 },
];

describe('HandStrengthAnalyzer', () => {

  // ── SLOWPLAY ──────────────────────────────────────────────────────────────

  it('tags SLOWPLAY on the flop when a player has a monster (rank >= 3) and only checks/calls', () => {
    const ctx = {
      hand: { board: ['Ah', 'Kd', '2c'], phase_ended: 'flop' },
      byStreet: {
        flop: [
          makeAction({ id: 1, player_id: 'p1', action: 'check', street: 'flop' }),
          makeAction({ id: 2, player_id: 'p2', action: 'bet',   street: 'flop', amount: 50 }),
          makeAction({ id: 3, player_id: 'p1', action: 'call',  street: 'flop', amount: 50 }),
        ],
        turn:  [],
        river: [],
      },
      seated: SEATED,
      evaluateAt: (playerId, street) => {
        if (playerId === 'p1' && street === 'flop') return { rank: 3, rankName: 'THREE_OF_A_KIND' };
        return null;
      },
    };
    const tags = analyze(ctx);
    expect(tags.map(t => t.tag)).toContain('SLOWPLAY');
    expect(tags.find(t => t.tag === 'SLOWPLAY')?.player_id).toBe('p1');
  });

  it('does NOT tag SLOWPLAY when the monster-hand player bets the flop', () => {
    const ctx = {
      hand: { board: ['Ah', 'Kd', '2c'], phase_ended: 'flop' },
      byStreet: {
        flop: [
          makeAction({ id: 1, player_id: 'p1', action: 'bet',  street: 'flop', amount: 50 }),
          makeAction({ id: 2, player_id: 'p2', action: 'call', street: 'flop', amount: 50 }),
        ],
        turn:  [],
        river: [],
      },
      seated: SEATED,
      evaluateAt: (playerId, street) => {
        if (playerId === 'p1') return { rank: 6, rankName: 'FULL_HOUSE' };
        return null;
      },
    };
    const tags = analyze(ctx).map(t => t.tag);
    expect(tags).not.toContain('SLOWPLAY');
  });

  it('does NOT tag SLOWPLAY on the river street (only flop and turn are checked)', () => {
    const ctx = {
      hand: { board: ['Ah', 'Kd', '2c', '7s', 'Jh'], phase_ended: 'river' },
      byStreet: {
        flop:  [],
        turn:  [],
        river: [
          makeAction({ id: 1, player_id: 'p1', action: 'check', street: 'river' }),
          makeAction({ id: 2, player_id: 'p2', action: 'check', street: 'river' }),
        ],
      },
      seated: SEATED,
      evaluateAt: () => ({ rank: 9, rankName: 'ROYAL_FLUSH' }),
    };
    const tags = analyze(ctx).map(t => t.tag);
    expect(tags).not.toContain('SLOWPLAY');
  });

  it('does NOT tag SLOWPLAY when evaluateAt returns null (no hole cards)', () => {
    const ctx = {
      hand: { board: ['Ah', 'Kd', '2c'], phase_ended: 'flop' },
      byStreet: {
        flop: [
          makeAction({ id: 1, player_id: 'p1', action: 'check', street: 'flop' }),
        ],
        turn:  [],
        river: [],
      },
      seated: SEATED,
      evaluateAt: () => null,
    };
    const tags = analyze(ctx).map(t => t.tag);
    expect(tags).not.toContain('SLOWPLAY');
  });

  // ── HERO_CALL ─────────────────────────────────────────────────────────────

  it('tags HERO_CALL when a caller has ONE_PAIR or worse on the river at showdown', () => {
    const ctx = {
      hand: { board: ['Ah', 'Kd', '2c', '7s', 'Jh'], phase_ended: 'showdown' },
      byStreet: {
        flop:  [],
        turn:  [],
        river: [
          makeAction({ id: 10, player_id: 'p2', action: 'bet',  street: 'river', amount: 100 }),
          makeAction({ id: 11, player_id: 'p1', action: 'call', street: 'river', amount: 100 }),
        ],
      },
      seated: SEATED,
      evaluateAt: (playerId, street) => {
        if (playerId === 'p1' && street === 'river') return { rank: 1, rankName: 'ONE_PAIR' };
        return null;
      },
    };
    const tags = analyze(ctx);
    expect(tags.map(t => t.tag)).toContain('HERO_CALL');
    expect(tags.find(t => t.tag === 'HERO_CALL')?.player_id).toBe('p1');
    expect(tags.find(t => t.tag === 'HERO_CALL')?.action_id).toBe(11);
  });

  it('tags HERO_CALL when the caller has HIGH_CARD (rank 0) on the river', () => {
    const ctx = {
      hand: { board: ['Ah', 'Kd', '2c', '7s', 'Jh'], phase_ended: 'showdown' },
      byStreet: {
        flop:  [],
        turn:  [],
        river: [
          makeAction({ id: 20, player_id: 'p2', action: 'bet',  street: 'river', amount: 100 }),
          makeAction({ id: 21, player_id: 'p1', action: 'call', street: 'river', amount: 100 }),
        ],
      },
      seated: SEATED,
      evaluateAt: (playerId) => (playerId === 'p1' ? { rank: 0, rankName: 'HIGH_CARD' } : null),
    };
    const tags = analyze(ctx).map(t => t.tag);
    expect(tags).toContain('HERO_CALL');
  });

  it('does NOT tag HERO_CALL when phase_ended is not showdown', () => {
    const ctx = {
      hand: { board: ['Ah', 'Kd', '2c', '7s', 'Jh'], phase_ended: 'river' },
      byStreet: {
        flop:  [],
        turn:  [],
        river: [
          makeAction({ id: 30, player_id: 'p2', action: 'bet',  street: 'river', amount: 100 }),
          makeAction({ id: 31, player_id: 'p1', action: 'call', street: 'river', amount: 100 }),
        ],
      },
      seated: SEATED,
      evaluateAt: () => ({ rank: 1, rankName: 'ONE_PAIR' }),
    };
    const tags = analyze(ctx).map(t => t.tag);
    expect(tags).not.toContain('HERO_CALL');
  });

  it('does NOT tag HERO_CALL when caller has TWO_PAIR (rank 2) or better', () => {
    const ctx = {
      hand: { board: ['Ah', 'Kd', '2c', '7s', 'Jh'], phase_ended: 'showdown' },
      byStreet: {
        flop:  [],
        turn:  [],
        river: [
          makeAction({ id: 40, player_id: 'p2', action: 'bet',  street: 'river', amount: 100 }),
          makeAction({ id: 41, player_id: 'p1', action: 'call', street: 'river', amount: 100 }),
        ],
      },
      seated: SEATED,
      evaluateAt: () => ({ rank: 2, rankName: 'TWO_PAIR' }),
    };
    const tags = analyze(ctx).map(t => t.tag);
    expect(tags).not.toContain('HERO_CALL');
  });

  // ── VALUE_MISSED ──────────────────────────────────────────────────────────

  it('tags VALUE_MISSED when a player has TWO_PAIR+ on every postflop street and never bets/raises', () => {
    // Player p1 has two pair on all streets, but only checks/calls throughout.
    const ctx = {
      hand: { board: ['Ah', 'Kd', '2c', '7s', 'Jh'], phase_ended: 'showdown' },
      byStreet: {
        flop: [
          makeAction({ id: 50, player_id: 'p1', action: 'check', street: 'flop' }),
          makeAction({ id: 51, player_id: 'p2', action: 'check', street: 'flop' }),
        ],
        turn: [
          makeAction({ id: 52, player_id: 'p1', action: 'check', street: 'turn' }),
          makeAction({ id: 53, player_id: 'p2', action: 'check', street: 'turn' }),
        ],
        river: [
          makeAction({ id: 54, player_id: 'p1', action: 'check', street: 'river' }),
          makeAction({ id: 55, player_id: 'p2', action: 'check', street: 'river' }),
        ],
      },
      seated: SEATED,
      evaluateAt: (playerId) => (playerId === 'p1' ? { rank: 2, rankName: 'TWO_PAIR' } : null),
    };
    const tags = analyze(ctx);
    expect(tags.map(t => t.tag)).toContain('VALUE_MISSED');
    expect(tags.find(t => t.tag === 'VALUE_MISSED')?.player_id).toBe('p1');
  });

  it('does NOT tag VALUE_MISSED when the strong-hand player bets at least once postflop', () => {
    // p1 bets the flop — VALUE_MISSED should not fire for p1.
    // evaluateAt returns null for p2 so p2 is not considered.
    const ctx = {
      hand: { board: ['Ah', 'Kd', '2c', '7s', 'Jh'], phase_ended: 'showdown' },
      byStreet: {
        flop: [
          makeAction({ id: 60, player_id: 'p1', action: 'bet',  street: 'flop', amount: 40 }),
          makeAction({ id: 61, player_id: 'p2', action: 'call', street: 'flop', amount: 40 }),
        ],
        turn:  [],
        river: [],
      },
      seated: SEATED,
      evaluateAt: (playerId) => (playerId === 'p1' ? { rank: 2, rankName: 'TWO_PAIR' } : null),
    };
    const tags = analyze(ctx);
    expect(tags.find(t => t.tag === 'VALUE_MISSED' && t.player_id === 'p1')).toBeUndefined();
  });

  it('does NOT tag VALUE_MISSED when player has only ONE_PAIR on one of the streets', () => {
    const ctx = {
      hand: { board: ['Ah', 'Kd', '2c', '7s', 'Jh'], phase_ended: 'showdown' },
      byStreet: {
        flop: [
          makeAction({ id: 70, player_id: 'p1', action: 'check', street: 'flop' }),
        ],
        turn: [
          makeAction({ id: 71, player_id: 'p1', action: 'check', street: 'turn' }),
        ],
        river: [
          makeAction({ id: 72, player_id: 'p1', action: 'check', street: 'river' }),
        ],
      },
      seated: SEATED,
      evaluateAt: (playerId, street) => {
        // TWO_PAIR on flop, ONE_PAIR on turn → not strong every street
        if (street === 'flop')  return { rank: 2, rankName: 'TWO_PAIR' };
        if (street === 'turn')  return { rank: 1, rankName: 'ONE_PAIR' };
        if (street === 'river') return { rank: 2, rankName: 'TWO_PAIR' };
        return null;
      },
    };
    const tags = analyze(ctx).map(t => t.tag);
    expect(tags).not.toContain('VALUE_MISSED');
  });

  // ── THIN_VALUE_RAISE ──────────────────────────────────────────────────────

  it('tags THIN_VALUE_RAISE when a player raises the river with exactly ONE_PAIR', () => {
    const ctx = {
      hand: { board: ['Ah', 'Kd', '2c', '7s', 'Jh'], phase_ended: 'showdown' },
      byStreet: {
        flop:  [],
        turn:  [],
        river: [
          makeAction({ id: 80, player_id: 'p2', action: 'bet',   street: 'river', amount: 50 }),
          makeAction({ id: 81, player_id: 'p1', action: 'raise', street: 'river', amount: 150 }),
        ],
      },
      seated: SEATED,
      evaluateAt: (playerId, street) => {
        if (playerId === 'p1' && street === 'river') return { rank: 1, rankName: 'ONE_PAIR' };
        return null;
      },
    };
    const tags = analyze(ctx);
    expect(tags.map(t => t.tag)).toContain('THIN_VALUE_RAISE');
    expect(tags.find(t => t.tag === 'THIN_VALUE_RAISE')?.player_id).toBe('p1');
    expect(tags.find(t => t.tag === 'THIN_VALUE_RAISE')?.action_id).toBe(81);
  });

  it('does NOT tag THIN_VALUE_RAISE when river raiser has TWO_PAIR (rank 2)', () => {
    const ctx = {
      hand: { board: ['Ah', 'Kd', '2c', '7s', 'Jh'], phase_ended: 'showdown' },
      byStreet: {
        flop:  [],
        turn:  [],
        river: [
          makeAction({ id: 90, player_id: 'p2', action: 'bet',   street: 'river', amount: 50 }),
          makeAction({ id: 91, player_id: 'p1', action: 'raise', street: 'river', amount: 150 }),
        ],
      },
      seated: SEATED,
      evaluateAt: () => ({ rank: 2, rankName: 'TWO_PAIR' }),
    };
    const tags = analyze(ctx).map(t => t.tag);
    expect(tags).not.toContain('THIN_VALUE_RAISE');
  });

  it('does NOT tag THIN_VALUE_RAISE when river raiser has HIGH_CARD (rank 0)', () => {
    const ctx = {
      hand: { board: ['Ah', 'Kd', '2c', '7s', 'Jh'], phase_ended: 'showdown' },
      byStreet: {
        flop:  [],
        turn:  [],
        river: [
          makeAction({ id: 100, player_id: 'p1', action: 'raise', street: 'river', amount: 150 }),
        ],
      },
      seated: SEATED,
      evaluateAt: () => ({ rank: 0, rankName: 'HIGH_CARD' }),
    };
    const tags = analyze(ctx).map(t => t.tag);
    expect(tags).not.toContain('THIN_VALUE_RAISE');
  });

});
