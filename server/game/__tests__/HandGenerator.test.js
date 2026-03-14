'use strict';

/**
 * HandGenerator.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Comprehensive tests for server/game/HandGenerator.js
 *
 * Test cases:
 *   1.  Full null config, 2 players → 4 unique hole cards + 5 board, 9 total unique, all valid
 *   2.  Full null config, 9 players → 18 + 5 = 23 unique cards, no collision, remaining deck = 29
 *   3.  Partial manual: player1 gets ['As','Kd'], board[0]='Qh', rest null → pinned cards appear exactly
 *   4.  Full manual (all 9 specified, no nulls) → deck draw = 0, remaining deck = 43
 *   5.  Duplicate card in hole_cards → returns { error } /appears more than once/i
 *   6.  Duplicate between hole_cards and board → returns { error }
 *   7.  Invalid card string → returns { error } /not a valid card/i
 *   8.  52-card exhaustion: 9 players + 5 board = 23 cards, verify sum = 52
 *   9.  mode='rng' with specified cards → all slots filled (specified cards treated same as config; mode field is ignored by HandGenerator)
 *  10.  Empty players array → only board filled (5 cards), playerCards = {}
 *  11.  Partial manual with one null hole card slot → both cards assigned, null slot filled
 *  12.  Invalid card in board → returns { error } /not a valid card/i
 *  13.  Invalid card with wrong length → returns { error } /not a valid card/i
 *  14.  Full null config, 3 players → allCards valid, no duplicates
 */

const { generateHand } = require('../HandGenerator');
const { isValidCard }  = require('../Deck');

// ── Fixtures ─────────────────────────────────────────────────────────────────

/** Helper: build a minimal player object array from an array of ids */
function makePlayers(ids) {
  return ids.map((id, i) => ({ id, seat: i, stack: 1000, name: `Player${i}` }));
}

/** Helper: return all dealt cards in a flat array (hole cards + board) */
function allCards(result, players) {
  const cards = [];
  for (const p of players) {
    cards.push(...result.playerCards[p.id]);
  }
  cards.push(...result.board);
  return cards;
}

/** Helper: assert no duplicates in an array — throws if any found */
function assertNoDuplicates(cards) {
  const seen = new Set();
  for (const c of cards) {
    if (seen.has(c)) {
      throw new Error(`Duplicate card detected: ${c}`);
    }
    seen.add(c);
  }
}

// ── Test 1: Full null config, 2 players ──────────────────────────────────────

describe('full null config — 2 players', () => {
  let result, players;

  beforeEach(() => {
    players = makePlayers(['p1', 'p2']);
    result = generateHand(null, players);
  });

  test('returns playerCards, board, and deck properties', () => {
    expect(result).toHaveProperty('playerCards');
    expect(result).toHaveProperty('board');
    expect(result).toHaveProperty('deck');
  });

  test('each player receives exactly 2 valid cards', () => {
    for (const p of players) {
      expect(result.playerCards[p.id]).toHaveLength(2);
      for (const card of result.playerCards[p.id]) {
        expect(isValidCard(card)).toBe(true);
      }
    }
  });

  test('board has exactly 5 valid cards', () => {
    expect(result.board).toHaveLength(5);
    for (const card of result.board) {
      expect(isValidCard(card)).toBe(true);
    }
  });

  test('total used cards = 9 (4 hole + 5 board), all unique', () => {
    const all = allCards(result, players);
    expect(all).toHaveLength(9);
    expect(new Set(all).size).toBe(9); // all unique
    assertNoDuplicates(all);
  });

  test('used cards + remaining deck = 52', () => {
    const all = allCards(result, players);
    expect(all.length + result.deck.length).toBe(52);
  });

  test('remaining deck = 43 cards', () => {
    expect(result.deck).toHaveLength(43);
  });
});

// ── Test 2: Full null config, 9 players ──────────────────────────────────────

describe('full null config — 9 players', () => {
  let result, players;

  beforeEach(() => {
    players = makePlayers(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9']);
    result = generateHand(null, players);
  });

  test('each player receives exactly 2 valid cards', () => {
    for (const p of players) {
      expect(result.playerCards[p.id]).toHaveLength(2);
      for (const card of result.playerCards[p.id]) {
        expect(isValidCard(card)).toBe(true);
      }
    }
  });

  test('board has exactly 5 valid cards', () => {
    expect(result.board).toHaveLength(5);
  });

  test('total used cards = 23 (18 hole + 5 board), no collisions', () => {
    const all = allCards(result, players);
    expect(all).toHaveLength(23);
    expect(new Set(all).size).toBe(23);
    assertNoDuplicates(all);
  });

  test('remaining deck = 29 (52 - 23)', () => {
    expect(result.deck).toHaveLength(29);
  });

  test('no card from the remaining deck appears in the used cards', () => {
    const usedSet = new Set(allCards(result, players));
    for (const card of result.deck) {
      expect(usedSet.has(card)).toBe(false);
    }
  });
});

// ── Test 3: Partial manual — pinned player cards and board[0] ─────────────────

describe('partial manual config — pinned cards preserved, null slots filled', () => {
  let result, players;

  beforeEach(() => {
    players = makePlayers(['p1', 'p2']);
    const config = {
      holeCards: {
        p1: ['As', 'Kd'],     // fully pinned
        p2: [null, null],     // both random
      },
      board: ['Qh', null, null, null, null], // board[0] pinned
    };
    result = generateHand(config, players);
  });

  test('player1 receives exactly the pinned cards', () => {
    expect(result.playerCards['p1'][0]).toBe('As');
    expect(result.playerCards['p1'][1]).toBe('Kd');
  });

  test('board[0] is the pinned card', () => {
    expect(result.board[0]).toBe('Qh');
  });

  test('null hole card slots for player2 are filled with valid cards', () => {
    expect(isValidCard(result.playerCards['p2'][0])).toBe(true);
    expect(isValidCard(result.playerCards['p2'][1])).toBe(true);
  });

  test('null board slots are filled with valid cards', () => {
    for (let i = 1; i < 5; i++) {
      expect(isValidCard(result.board[i])).toBe(true);
    }
  });

  test('no duplicates across all 9 dealt cards', () => {
    assertNoDuplicates(allCards(result, players));
  });

  test('pinned cards do not appear in the remaining deck', () => {
    const pinnedSet = new Set(['As', 'Kd', 'Qh']);
    for (const card of result.deck) {
      expect(pinnedSet.has(card)).toBe(false);
    }
  });
});

// ── Test 4: Full manual (all slots specified, no nulls) ───────────────────────

describe('full manual config — 2 players, all 9 cards specified', () => {
  let result, players, config;

  beforeEach(() => {
    players = makePlayers(['p1', 'p2']);
    config = {
      holeCards: {
        p1: ['As', 'Ks'],
        p2: ['Qs', 'Js'],
      },
      board: ['Ts', '9s', '8s', '7s', '6s'],
    };
    result = generateHand(config, players);
  });

  test('player1 gets exactly the specified cards', () => {
    expect(result.playerCards['p1']).toEqual(['As', 'Ks']);
  });

  test('player2 gets exactly the specified cards', () => {
    expect(result.playerCards['p2']).toEqual(['Qs', 'Js']);
  });

  test('board is exactly the specified 5 cards', () => {
    expect(result.board).toEqual(['Ts', '9s', '8s', '7s', '6s']);
  });

  test('remaining deck = 43 (no cards drawn from deck)', () => {
    expect(result.deck).toHaveLength(43);
  });

  test('none of the specified cards appear in the remaining deck', () => {
    const specifiedSet = new Set(['As', 'Ks', 'Qs', 'Js', 'Ts', '9s', '8s', '7s', '6s']);
    for (const card of result.deck) {
      expect(specifiedSet.has(card)).toBe(false);
    }
  });

  test('no duplicates among all dealt cards', () => {
    assertNoDuplicates(allCards(result, players));
  });
});

// ── Test 5: Duplicate card in hole_cards → returns error ──────────────────────

describe('duplicate card validation', () => {
  test('duplicate card in hole_cards returns error /appears more than once/i', () => {
    const players = makePlayers(['p1', 'p2']);
    const config = {
      holeCards: {
        p1: ['Ah', 'Kh'],
        p2: ['Ah', 'Qd'],  // 'Ah' appears twice
      },
      board: [null, null, null, null, null],
    };
    const r = generateHand(config, players);
    expect(r.error).toMatch(/appears more than once/i);
  });

  test('duplicate card within one player\'s own hole cards returns error', () => {
    const players = makePlayers(['p1']);
    const config = {
      holeCards: {
        p1: ['Ah', 'Ah'],  // same card twice for same player
      },
      board: [null, null, null, null, null],
    };
    const r = generateHand(config, players);
    expect(r.error).toMatch(/appears more than once/i);
  });
});

// ── Test 6: Duplicate between hole_cards and board → returns error ────────────

describe('duplicate between hole_cards and board', () => {
  test('card in hole_cards also in board returns duplicate error', () => {
    const players = makePlayers(['p1']);
    const config = {
      holeCards: {
        p1: ['Ah', 'Kd'],
      },
      board: ['Ah', null, null, null, null], // 'Ah' duplicated
    };
    const r = generateHand(config, players);
    expect(r.error).toMatch(/appears more than once/i);
  });

  test('card in board[2] also in another player\'s hole cards returns error', () => {
    const players = makePlayers(['p1', 'p2']);
    const config = {
      holeCards: {
        p1: ['2h', '3d'],
        p2: ['Ac', null],
      },
      board: [null, null, 'Ac', null, null], // 'Ac' duplicated
    };
    const r = generateHand(config, players);
    expect(r.error).toMatch(/appears more than once/i);
  });
});

// ── Test 7: Invalid card string → returns error ───────────────────────────────

describe('invalid card string validation', () => {
  test('invalid card "ZZ" returns error /not a valid card/i', () => {
    const players = makePlayers(['p1']);
    const config = {
      holeCards: { p1: ['Ah', 'ZZ'] },
      board: [null, null, null, null, null],
    };
    const r = generateHand(config, players);
    expect(r.error).toMatch(/not a valid card/i);
  });

  test('invalid card with wrong length "AceOfSpades" returns error /not a valid card/i', () => {
    const players = makePlayers(['p1']);
    const config = {
      holeCards: { p1: ['AceOfSpades', null] },
      board: [null, null, null, null, null],
    };
    const r = generateHand(config, players);
    expect(r.error).toMatch(/not a valid card/i);
  });

  test('invalid card in board returns error /not a valid card/i', () => {
    const players = makePlayers(['p1', 'p2']);
    const config = {
      holeCards: { p1: [null, null], p2: [null, null] },
      board: ['Ah', 'INVALID', null, null, null],
    };
    const r = generateHand(config, players);
    expect(r.error).toMatch(/not a valid card/i);
  });

  test('card with valid rank but invalid suit returns error', () => {
    const players = makePlayers(['p1']);
    const config = {
      holeCards: { p1: ['Ax', null] }, // 'x' is not a valid suit
      board: [null, null, null, null, null],
    };
    const r = generateHand(config, players);
    expect(r.error).toMatch(/not a valid card/i);
  });

  test('card with invalid rank but valid suit returns error', () => {
    const players = makePlayers(['p1']);
    const config = {
      holeCards: { p1: ['1h', null] }, // '1' is not a valid rank
      board: [null, null, null, null, null],
    };
    const r = generateHand(config, players);
    expect(r.error).toMatch(/not a valid card/i);
  });
});

// ── Test 8: 52-card exhaustion ────────────────────────────────────────────────

describe('52-card exhaustion invariant', () => {
  test('9 players + 5 board: used (23) + remaining deck = 52', () => {
    const players = makePlayers(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9']);
    const result = generateHand(null, players);
    const usedCount = allCards(result, players).length;
    expect(usedCount).toBe(23);
    expect(usedCount + result.deck.length).toBe(52);
  });

  test('2 players + 5 board: used (9) + remaining deck (43) = 52', () => {
    const players = makePlayers(['p1', 'p2']);
    const result = generateHand(null, players);
    expect(allCards(result, players).length + result.deck.length).toBe(52);
  });

  test('partial manual config: used + remaining deck always = 52', () => {
    const players = makePlayers(['p1', 'p2', 'p3']);
    const config = {
      holeCards: {
        p1: ['As', null],
        p2: [null, null],
        p3: ['Kh', '2d'],
      },
      board: ['Qc', null, null, 'Jd', null],
    };
    const result = generateHand(config, players);
    expect(allCards(result, players).length + result.deck.length).toBe(52);
  });
});

// ── Test 9: mode='rng' with specified cards ───────────────────────────────────
// NOTE: HandGenerator does not read the `mode` field from the config object.
// It is a pure Fill-the-Gaps function: specified (non-null) cards are always pinned.
// The GameManager is responsible for bypassing generateHand entirely when mode='rng'.
// This test verifies that HandGenerator's own behaviour with a `mode` field present
// is to still honour the specified cards (i.e., mode field is ignored at this layer).

describe('config with mode field present', () => {
  test('config with mode="rng" still pins specified non-null cards', () => {
    const players = makePlayers(['p1', 'p2']);
    const config = {
      mode: 'rng',                   // HandGenerator ignores this field
      holeCards: { p1: ['As', 'Kd'] },
      board: ['Qh', null, null, null, null],
    };
    const result = generateHand(config, players);
    // Specified cards should still be pinned
    expect(result.playerCards['p1']).toEqual(['As', 'Kd']);
    expect(result.board[0]).toBe('Qh');
    // All cards are valid and unique
    assertNoDuplicates(allCards(result, players));
  });

  test('config with mode="hybrid" works identically to no mode', () => {
    const players = makePlayers(['p1', 'p2']);
    const config = {
      mode: 'hybrid',
      holeCards: { p1: ['As', 'Kd'], p2: [null, null] },
      board: [null, null, null, null, null],
    };
    const result = generateHand(config, players);
    expect(result.playerCards['p1']).toEqual(['As', 'Kd']);
    expect(result.playerCards['p2']).toHaveLength(2);
    for (const card of result.playerCards['p2']) {
      expect(isValidCard(card)).toBe(true);
    }
    assertNoDuplicates(allCards(result, players));
  });
});

// ── Test 10: Empty players array ──────────────────────────────────────────────

describe('empty players array', () => {
  test('only board is filled, playerCards is empty object', () => {
    const result = generateHand(null, []);
    expect(Object.keys(result.playerCards)).toHaveLength(0);
    expect(result.board).toHaveLength(5);
  });

  test('all 5 board cards are valid', () => {
    const result = generateHand(null, []);
    for (const card of result.board) {
      expect(isValidCard(card)).toBe(true);
    }
  });

  test('remaining deck = 47 (52 - 5 board)', () => {
    const result = generateHand(null, []);
    expect(result.deck).toHaveLength(47);
  });

  test('used (5) + remaining deck (47) = 52', () => {
    const result = generateHand(null, []);
    expect(result.board.length + result.deck.length).toBe(52);
  });

  test('empty players with full manual board config works correctly', () => {
    const config = {
      holeCards: {},
      board: ['As', 'Kd', 'Qh', 'Jc', 'Ts'],
    };
    const result = generateHand(config, []);
    expect(result.board).toEqual(['As', 'Kd', 'Qh', 'Jc', 'Ts']);
    expect(result.deck).toHaveLength(47);
  });
});

// ── Additional edge case tests ────────────────────────────────────────────────

describe('edge cases', () => {
  test('config=undefined treated same as config=null (full rng)', () => {
    const players = makePlayers(['p1', 'p2']);
    const result = generateHand(undefined, players);
    expect(result.board).toHaveLength(5);
    for (const p of players) {
      expect(result.playerCards[p.id]).toHaveLength(2);
    }
    assertNoDuplicates(allCards(result, players));
  });

  test('partial board config: only specified board slots appear exactly', () => {
    const players = makePlayers(['p1', 'p2']);
    const config = {
      holeCards: {},
      board: [null, 'Ah', null, 'Kd', null],
    };
    const result = generateHand(config, players);
    expect(result.board[1]).toBe('Ah');
    expect(result.board[3]).toBe('Kd');
    expect(isValidCard(result.board[0])).toBe(true);
    expect(isValidCard(result.board[2])).toBe(true);
    expect(isValidCard(result.board[4])).toBe(true);
    assertNoDuplicates(allCards(result, players));
  });

  test('player with no config entry gets 2 random cards', () => {
    const players = makePlayers(['p1', 'p2']);
    const config = {
      holeCards: {
        p1: ['As', 'Kd'],
        // p2 not in config at all
      },
      board: [null, null, null, null, null],
    };
    const result = generateHand(config, players);
    expect(result.playerCards['p1']).toEqual(['As', 'Kd']);
    expect(result.playerCards['p2']).toHaveLength(2);
    for (const card of result.playerCards['p2']) {
      expect(isValidCard(card)).toBe(true);
    }
    assertNoDuplicates(allCards(result, players));
  });

  test('returned deck cards are all valid cards', () => {
    const players = makePlayers(['p1', 'p2', 'p3']);
    const result = generateHand(null, players);
    for (const card of result.deck) {
      expect(isValidCard(card)).toBe(true);
    }
  });

  test('no card from result.deck appears in dealt cards', () => {
    const players = makePlayers(['p1', 'p2']);
    const result = generateHand(null, players);
    const dealtSet = new Set(allCards(result, players));
    for (const card of result.deck) {
      expect(dealtSet.has(card)).toBe(false);
    }
  });
});
