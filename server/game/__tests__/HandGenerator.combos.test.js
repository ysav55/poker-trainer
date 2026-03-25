'use strict';

/**
 * HandGenerator.combos.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests for the hole_cards_combos (holeCardsCombos) feature in HandGenerator.
 *
 * hole_cards_combos lets a caller pre-resolve a set of candidate card pairs
 * for a player. The generator picks a random available pair from the list,
 * excluding cards already committed to other players or the board.
 *
 * Covered cases:
 *   1.  A combo from the list is always selected (happy path)
 *   2.  The selected combo is always valid (both cards are real cards)
 *   3.  The selected combo never conflicts with other player hole cards
 *   4.  The selected combo never conflicts with pinned board cards
 *   5.  When all combos in the list conflict, an error is returned (not throw)
 *   6.  snake_case field (hole_cards_combos) is accepted
 *   7.  camelCase field (holeCardsCombos) is accepted
 *   8.  Single-combo list always produces that combo (deterministic when only
 *       one choice is available)
 *   9.  hole_cards_combos is ignored for a player who already has pinned hole_cards
 *  10.  hole_cards_combos coexists with hole_cards_range for other players
 */

const { generateHand } = require('../HandGenerator');
const { isValidCard }  = require('../Deck');

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makePlayers(...ids) {
  return ids.map((id, i) => ({ id, seat: i, stack: 1000, name: `Player${i}` }));
}

// ── Test 1: happy path — a combo is selected from the list ───────────────────

describe('hole_cards_combos — happy path', () => {
  it('selects a pair from the combos list for the specified player', () => {
    const players = makePlayers('p1', 'p2');
    const combos = [
      ['As', 'Ks'],
      ['Ah', 'Kh'],
      ['Ad', 'Kd'],
      ['Ac', 'Kc'],
    ];
    const config = { hole_cards_combos: { p1: combos } };

    const result = generateHand(config, players);

    expect(result.error).toBeUndefined();
    expect(result.playerCards['p1']).toHaveLength(2);

    const [c1, c2] = result.playerCards['p1'];
    const matchesACombo = combos.some(([a, b]) => a === c1 && b === c2);
    expect(matchesACombo).toBe(true);
  });
});

// ── Test 2: selected cards are always valid ───────────────────────────────────

describe('hole_cards_combos — card validity', () => {
  it('both cards in the selected combo pass isValidCard', () => {
    const players = makePlayers('p1');
    const combos  = [['Qh', 'Jd'], ['Tc', '9s']];
    const config  = { hole_cards_combos: { p1: combos } };

    const result = generateHand(config, players);

    expect(result.error).toBeUndefined();
    const [c1, c2] = result.playerCards['p1'];
    expect(isValidCard(c1)).toBe(true);
    expect(isValidCard(c2)).toBe(true);
  });
});

// ── Test 3: no conflict with other player hole cards ─────────────────────────

describe('hole_cards_combos — no card conflicts between players', () => {
  it('combo selection for p1 never overlaps with p2 fixed hole cards', () => {
    const players = makePlayers('p1', 'p2');
    // p2 gets As and Ks fixed; combos for p1 include those cards plus safe ones
    const combos = [
      ['As', 'Ks'],  // conflict — both taken by p2
      ['Qd', 'Jd'],  // safe
    ];
    const config = {
      hole_cards: { p2: ['As', 'Ks'] },
      hole_cards_combos: { p1: combos },
    };

    // Run multiple times to confirm the conflicting combo is never picked
    for (let i = 0; i < 20; i++) {
      const result = generateHand(config, players);
      expect(result.error).toBeUndefined();
      const p1Cards = result.playerCards['p1'];
      expect(p1Cards).not.toContain('As');
      expect(p1Cards).not.toContain('Ks');
    }
  });
});

// ── Test 4: no conflict with pinned board cards ───────────────────────────────

describe('hole_cards_combos — no conflict with board', () => {
  it('combo selection for p1 never overlaps with pinned board cards', () => {
    const players = makePlayers('p1');
    // Board pins Ah on index 0; combo includes Ah (conflict) and Kd/Qd (safe)
    const combos = [
      ['Ah', '2d'],  // conflict — Ah is on the board
      ['Kd', 'Qd'],  // safe
    ];
    const config = {
      board: ['Ah', null, null, null, null],
      hole_cards_combos: { p1: combos },
    };

    for (let i = 0; i < 20; i++) {
      const result = generateHand(config, players);
      expect(result.error).toBeUndefined();
      expect(result.playerCards['p1']).not.toContain('Ah');
    }
  });
});

// ── Test 5: all combos conflict → error, not throw ───────────────────────────

describe('hole_cards_combos — all combos blocked', () => {
  it('returns an error object (not throws) when every combo conflicts', () => {
    const players = makePlayers('p1', 'p2');
    // p2 holds As+Ks; only combo for p1 uses both of those cards
    const combos = [['As', 'Ks']];
    const config = {
      hole_cards: { p2: ['As', 'Ks'] },
      hole_cards_combos: { p1: combos },
    };

    let result;
    expect(() => { result = generateHand(config, players); }).not.toThrow();
    expect(result.error).toBeDefined();
    expect(typeof result.error).toBe('string');
  });
});

// ── Test 6: snake_case field accepted ────────────────────────────────────────

describe('hole_cards_combos — snake_case field name', () => {
  it('hole_cards_combos (snake_case) is recognised by the generator', () => {
    const players = makePlayers('p1');
    const config  = { hole_cards_combos: { p1: [['Th', 'Ts']] } };

    const result = generateHand(config, players);
    expect(result.error).toBeUndefined();
    const cards = result.playerCards['p1'];
    expect(cards).toEqual(['Th', 'Ts']);
  });
});

// ── Test 7: camelCase field accepted ─────────────────────────────────────────

describe('hole_cards_combos — camelCase field name', () => {
  it('holeCardsCombos (camelCase) is recognised by the generator', () => {
    const players = makePlayers('p1');
    const config  = { holeCardsCombos: { p1: [['7c', '2h']] } };

    const result = generateHand(config, players);
    expect(result.error).toBeUndefined();
    const cards = result.playerCards['p1'];
    expect(cards).toEqual(['7c', '2h']);
  });
});

// ── Test 8: single-combo list is deterministic ────────────────────────────────

describe('hole_cards_combos — single combo is always selected', () => {
  it('when only one valid combo exists, that exact combo is always used', () => {
    const players  = makePlayers('p1', 'p2');
    const expected = ['Jd', '9s'];
    const config   = { hole_cards_combos: { p1: [expected] } };

    for (let i = 0; i < 10; i++) {
      const result = generateHand(config, players);
      expect(result.error).toBeUndefined();
      expect(result.playerCards['p1']).toEqual(expected);
    }
  });
});

// ── Test 9: pinned hole_cards takes precedence over combos ───────────────────

describe('hole_cards_combos — ignored when hole_cards already pinned', () => {
  it('a player with explicit hole_cards is not overridden by combos', () => {
    const players = makePlayers('p1');
    // Pinned cards and a combo list that suggests different cards
    const config = {
      hole_cards:       { p1: ['2c', '7d'] },
      hole_cards_combos: { p1: [['As', 'Ks'], ['Ah', 'Kh']] },
    };

    const result = generateHand(config, players);
    expect(result.error).toBeUndefined();
    // The pinned cards must win — combos should be ignored
    expect(result.playerCards['p1']).toEqual(['2c', '7d']);
  });
});

// ── Test 10: combos for one player, range for another ────────────────────────

describe('hole_cards_combos — coexists with hole_cards_range', () => {
  it('p1 gets a combo from the list, p2 gets a pair drawn from a range', () => {
    const players = makePlayers('p1', 'p2');
    const config  = {
      hole_cards_combos: { p1: [['Qc', 'Qd'], ['Qh', 'Qs']] },
      hole_cards_range:  { p2: 'AA' },
    };

    const result = generateHand(config, players);
    expect(result.error).toBeUndefined();

    // p1 must hold a queen-pair combo
    const p1 = result.playerCards['p1'];
    expect(['Qc', 'Qd', 'Qh', 'Qs']).toContain(p1[0]);
    expect(['Qc', 'Qd', 'Qh', 'Qs']).toContain(p1[1]);

    // p2 must hold a pair of aces
    const p2 = result.playerCards['p2'];
    expect(p2[0][0]).toBe('A');
    expect(p2[1][0]).toBe('A');
  });
});
