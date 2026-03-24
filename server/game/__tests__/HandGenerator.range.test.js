'use strict';

const { generateHand, flopSatisfiesTexture, validateBoardTexture } = require('../HandGenerator');

function makePlayers(ids) {
  return ids.map((id, i) => ({ id, seat: i, stack: 1000, name: `Player${i}` }));
}

// ─────────────────────────────────────────────
//  Range Assignment
// ─────────────────────────────────────────────

describe('Range assignment — hole_cards_range', () => {
  test('player gets a hand from AA range', () => {
    const players = makePlayers(['p1', 'p2']);
    const result = generateHand({
      mode: 'hybrid', hole_cards: {},
      hole_cards_range: { p1: 'AA' },
      board: [null, null, null, null, null],
    }, players);
    expect(result.error).toBeUndefined();
    const [c1, c2] = result.playerCards.p1;
    expect(c1[0]).toBe('A');
    expect(c2[0]).toBe('A');
  });

  test('AKs range produces suited cards', () => {
    const players = makePlayers(['p1']);
    const result = generateHand({
      mode: 'hybrid', hole_cards: {},
      hole_cards_range: { p1: 'AKs' },
      board: [null, null, null, null, null],
    }, players);
    expect(result.error).toBeUndefined();
    const [c1, c2] = result.playerCards.p1;
    expect(c1[1]).toBe(c2[1]);
    const ranks = [c1[0], c2[0]].sort();
    expect(ranks).toContain('A');
    expect(ranks).toContain('K');
  });

  test('specific hole_cards takes precedence over range', () => {
    const players = makePlayers(['p1']);
    const result = generateHand({
      mode: 'hybrid',
      hole_cards: { p1: ['Ah', 'Kh'] },
      hole_cards_range: { p1: 'QQ' },
      board: [null, null, null, null, null],
    }, players);
    expect(result.error).toBeUndefined();
    expect(result.playerCards.p1).toEqual(['Ah', 'Kh']);
  });

  test('two players from different ranges — no duplicate cards', () => {
    const players = makePlayers(['p1', 'p2']);
    const result = generateHand({
      mode: 'hybrid', hole_cards: {},
      hole_cards_range: { p1: 'AA-TT', p2: 'AKs' },
      board: [null, null, null, null, null],
    }, players);
    expect(result.error).toBeUndefined();
    const all = [...result.playerCards.p1, ...result.playerCards.p2];
    expect(new Set(all).size).toBe(4);
  });

  test('invalid range string returns error', () => {
    const result = generateHand({
      mode: 'hybrid', hole_cards: {},
      hole_cards_range: { p1: 'BADRANGE!!!' },
      board: [null, null, null, null, null],
    }, makePlayers(['p1']));
    expect(result.error).toMatch(/invalid range/i);
  });

  test('range blocked by pinned cards returns error', () => {
    // All 4 aces used — AA range impossible
    const result = generateHand({
      mode: 'hybrid',
      hole_cards: { p2: ['As', 'Ah'], p3: ['Ad', 'Ac'] },
      hole_cards_range: { p1: 'AA' },
      board: [null, null, null, null, null],
    }, makePlayers(['p1', 'p2', 'p3']));
    expect(result.error).toBeDefined();
    expect(result.error).toMatch(/valid combo/i);
  });

  test('range hand is included in overall no-duplicate invariant', () => {
    const players = makePlayers(['p1', 'p2', 'p3']);
    const result = generateHand({
      mode: 'hybrid', hole_cards: {},
      hole_cards_range: { p1: 'AK', p2: 'KQ' },
      board: [null, null, null, null, null],
    }, players);
    if (result.error) return; // extremely rare conflict — skip
    const all = Object.values(result.playerCards).flat().concat(result.board);
    expect(new Set(all).size).toBe(all.length);
  });
});

// ─────────────────────────────────────────────
//  flopSatisfiesTexture unit tests
// ─────────────────────────────────────────────

describe('flopSatisfiesTexture', () => {
  test('no textures always returns true', () => {
    expect(flopSatisfiesTexture(['Ah', 'Kd', 'Qc'], [])).toBe(true);
    expect(flopSatisfiesTexture(['Ah', 'Kd', 'Qc'], null)).toBe(true);
  });

  describe('suit textures', () => {
    test('rainbow: 3 different suits', () => {
      expect(flopSatisfiesTexture(['Ah', 'Kd', 'Qc'], ['rainbow'])).toBe(true);
      expect(flopSatisfiesTexture(['Ah', 'Kh', 'Qc'], ['rainbow'])).toBe(false);
    });

    test('flush_draw: exactly 2 of same suit', () => {
      expect(flopSatisfiesTexture(['Ah', 'Kh', 'Qc'], ['flush_draw'])).toBe(true);
      expect(flopSatisfiesTexture(['Ah', 'Kh', 'Qh'], ['flush_draw'])).toBe(false);
      expect(flopSatisfiesTexture(['Ah', 'Kd', 'Qc'], ['flush_draw'])).toBe(false);
    });

    test('monotone: all same suit', () => {
      expect(flopSatisfiesTexture(['Ah', 'Kh', 'Qh'], ['monotone'])).toBe(true);
      expect(flopSatisfiesTexture(['Ah', 'Kh', 'Qc'], ['monotone'])).toBe(false);
    });
  });

  describe('pair textures', () => {
    test('unpaired: all different ranks', () => {
      expect(flopSatisfiesTexture(['Ah', 'Kd', 'Qc'], ['unpaired'])).toBe(true);
      expect(flopSatisfiesTexture(['Ah', 'Ad', 'Qc'], ['unpaired'])).toBe(false);
    });

    test('paired: exactly one pair', () => {
      expect(flopSatisfiesTexture(['Ah', 'Ad', 'Kc'], ['paired'])).toBe(true);
      expect(flopSatisfiesTexture(['Ah', 'Kd', 'Qc'], ['paired'])).toBe(false);
      expect(flopSatisfiesTexture(['Ah', 'Ad', 'Ac'], ['paired'])).toBe(false); // trips
    });

    test('trips: all same rank', () => {
      expect(flopSatisfiesTexture(['Ah', 'Ad', 'Ac'], ['trips'])).toBe(true);
      expect(flopSatisfiesTexture(['Ah', 'Ad', 'Kc'], ['trips'])).toBe(false);
    });
  });

  describe('connectedness textures', () => {
    test('connected: at least 2 cards within 1 rank', () => {
      expect(flopSatisfiesTexture(['Jh', 'Td', 'Qc'], ['connected'])).toBe(true);
      expect(flopSatisfiesTexture(['Ah', '2d', '7c'], ['connected'])).toBe(false);
    });

    test('disconnected: no two within 1 rank', () => {
      expect(flopSatisfiesTexture(['Ah', '5d', '2c'], ['disconnected'])).toBe(true);
      expect(flopSatisfiesTexture(['Jh', 'Td', 'Qc'], ['disconnected'])).toBe(false);
    });
  });

  describe('high card textures', () => {
    test('broadway: at least one T-A', () => {
      expect(flopSatisfiesTexture(['Ah', '2d', '7c'], ['broadway'])).toBe(true);
      expect(flopSatisfiesTexture(['Th', '2d', '7c'], ['broadway'])).toBe(true);
      expect(flopSatisfiesTexture(['9h', '2d', '7c'], ['broadway'])).toBe(false);
    });

    test('low: all 9 or lower', () => {
      expect(flopSatisfiesTexture(['2h', '5d', '8c'], ['low'])).toBe(true);
      expect(flopSatisfiesTexture(['2h', '5d', 'Tc'], ['low'])).toBe(false);
    });

    test('ace_high: at least one ace', () => {
      expect(flopSatisfiesTexture(['Ah', '5d', '8c'], ['ace_high'])).toBe(true);
      expect(flopSatisfiesTexture(['Kh', '5d', '8c'], ['ace_high'])).toBe(false);
    });
  });

  test('combined flush_draw + paired', () => {
    expect(flopSatisfiesTexture(['Ah', 'Ad', 'Kh'], ['flush_draw', 'paired'])).toBe(true);
    expect(flopSatisfiesTexture(['Ah', 'Kd', 'Qc'], ['flush_draw', 'paired'])).toBe(false);
  });
});

// ─────────────────────────────────────────────
//  validateBoardTexture
// ─────────────────────────────────────────────

describe('validateBoardTexture', () => {
  test('empty array is valid', () => {
    expect(validateBoardTexture([]).valid).toBe(true);
    expect(validateBoardTexture(null).valid).toBe(true);
  });

  test('single constraints are valid', () => {
    for (const t of ['rainbow', 'flush_draw', 'monotone', 'unpaired', 'paired',
                     'trips', 'connected', 'disconnected', 'broadway', 'low', 'ace_high']) {
      expect(validateBoardTexture([t]).valid).toBe(true);
    }
  });

  test('rainbow + monotone incompatible', () => {
    expect(validateBoardTexture(['rainbow', 'monotone']).valid).toBe(false);
  });

  test('unpaired + paired incompatible', () => {
    expect(validateBoardTexture(['unpaired', 'paired']).valid).toBe(false);
  });

  test('connected + disconnected incompatible', () => {
    expect(validateBoardTexture(['connected', 'disconnected']).valid).toBe(false);
  });

  test('broadway + low incompatible', () => {
    expect(validateBoardTexture(['broadway', 'low']).valid).toBe(false);
  });

  test('flush_draw + broadway compatible', () => {
    expect(validateBoardTexture(['flush_draw', 'broadway']).valid).toBe(true);
  });
});

// ─────────────────────────────────────────────
//  Board Texture in generateHand integration
// ─────────────────────────────────────────────

describe('generateHand with board_texture', () => {
  test('rainbow texture: all 3 flop suits different (5 runs)', () => {
    for (let i = 0; i < 5; i++) {
      const r = generateHand({
        mode: 'hybrid', hole_cards: {},
        board: [null, null, null, null, null],
        board_texture: ['rainbow'],
      }, makePlayers(['p1', 'p2']));
      expect(r.error).toBeUndefined();
      const suits = [r.board[0][1], r.board[1][1], r.board[2][1]];
      expect(new Set(suits).size).toBe(3);
    }
  });

  test('paired texture: flop has exactly one pair (5 runs)', () => {
    for (let i = 0; i < 5; i++) {
      const r = generateHand({
        mode: 'hybrid', hole_cards: {},
        board: [null, null, null, null, null],
        board_texture: ['paired'],
      }, makePlayers(['p1', 'p2']));
      expect(r.error).toBeUndefined();
      const ranks = [r.board[0][0], r.board[1][0], r.board[2][0]];
      expect(new Set(ranks).size).toBe(2);
    }
  });

  test('incompatible texture returns error without dealing', () => {
    const r = generateHand({
      mode: 'hybrid', hole_cards: {},
      board: [null, null, null, null, null],
      board_texture: ['rainbow', 'monotone'],
    }, makePlayers(['p1']));
    expect(r.error).toMatch(/incompatible/i);
    expect(r.playerCards).toBeUndefined();
  });

  test('result board still has 5 cards with texture applied', () => {
    const r = generateHand({
      mode: 'hybrid', hole_cards: {},
      board: [null, null, null, null, null],
      board_texture: ['broadway'],
    }, makePlayers(['p1']));
    expect(r.error).toBeUndefined();
    expect(r.board).toHaveLength(5);
    r.board.forEach(c => expect(c).toBeTruthy());
  });

  test('no duplicate cards when range + texture combined', () => {
    const r = generateHand({
      mode: 'hybrid', hole_cards: {},
      hole_cards_range: { p1: 'AA-KK' },
      board: [null, null, null, null, null],
      board_texture: ['flush_draw'],
    }, makePlayers(['p1', 'p2']));
    if (r.error) return; // rare conflict — acceptable
    const all = Object.values(r.playerCards).flat().concat(r.board);
    expect(new Set(all).size).toBe(all.length);
  });
});

// ─────────────────────────────────────────────
//  hole_cards_combos — pre-resolved preset combos
// ─────────────────────────────────────────────

// Build a small helper: suited connectors combos (JTs, T9s, 98s, 87s, 76s, 65s)
const SUITS = ['h','d','c','s'];
function suitedConnectorCombos() {
  const RANKS = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
  const combos = [];
  for (let i = 1; i < RANKS.length; i++) {
    for (const s of SUITS) {
      combos.push([`${RANKS[i]}${s}`, `${RANKS[i-1]}${s}`]);
    }
  }
  return combos;
}

function pairCombos(rank) {
  const cards = SUITS.map(s => `${rank}${s}`);
  const res = [];
  for (let i = 0; i < cards.length; i++)
    for (let j = i+1; j < cards.length; j++)
      res.push([cards[i], cards[j]]);
  return res;
}

describe('hole_cards_combos — pre-resolved preset combos', () => {
  test('player gets a suited connector from combos list', () => {
    const combos = suitedConnectorCombos();
    const result = generateHand({
      mode: 'hybrid', hole_cards: {},
      hole_cards_combos: { p1: combos },
      board: [null,null,null,null,null],
    }, makePlayers(['p1','p2']));
    expect(result.error).toBeUndefined();
    const [c1, c2] = result.playerCards.p1;
    expect(c1[1]).toBe(c2[1]); // same suit
    const ranks = '23456789TJQKA'; // A at index 12, K at 11 → abs diff = 1 for AK
    const ri1 = ranks.indexOf(c1[0]);
    const ri2 = ranks.indexOf(c2[0]);
    expect(Math.abs(ri1 - ri2)).toBe(1); // adjacent ranks
  });

  test('player gets a pocket pair from combos list', () => {
    const combos = [...pairCombos('A'), ...pairCombos('K'), ...pairCombos('Q')];
    const result = generateHand({
      mode: 'hybrid', hole_cards: {},
      hole_cards_combos: { p1: combos },
      board: [null,null,null,null,null],
    }, makePlayers(['p1']));
    expect(result.error).toBeUndefined();
    const [c1, c2] = result.playerCards.p1;
    expect(c1[0]).toBe(c2[0]); // same rank
    expect(['A','K','Q']).toContain(c1[0]);
  });

  test('pinned hole_cards takes precedence over hole_cards_combos', () => {
    const combos = suitedConnectorCombos();
    const result = generateHand({
      mode: 'hybrid',
      hole_cards: { p1: ['Ah','Kh'] },
      hole_cards_combos: { p1: combos },
      board: [null,null,null,null,null],
    }, makePlayers(['p1']));
    expect(result.error).toBeUndefined();
    expect(result.playerCards.p1).toEqual(['Ah','Kh']);
  });

  test('two players from different combo lists — no duplicate cards', () => {
    const suitedCombos = suitedConnectorCombos();
    const pairsCombos  = [...pairCombos('A'),...pairCombos('K'),...pairCombos('Q'),...pairCombos('J'),...pairCombos('T')];
    const result = generateHand({
      mode: 'hybrid', hole_cards: {},
      hole_cards_combos: { p1: suitedCombos, p2: pairsCombos },
      board: [null,null,null,null,null],
    }, makePlayers(['p1','p2']));
    expect(result.error).toBeUndefined();
    const all = [...result.playerCards.p1, ...result.playerCards.p2];
    expect(new Set(all).size).toBe(4);
  });

  test('all combos blocked by pinned cards returns error', () => {
    // Block all AA combos
    const result = generateHand({
      mode: 'hybrid',
      hole_cards: { p2: ['As','Ah'], p3: ['Ad','Ac'] },
      hole_cards_combos: { p1: pairCombos('A') },
      board: [null,null,null,null,null],
    }, makePlayers(['p1','p2','p3']));
    expect(result.error).toBeDefined();
    expect(result.error).toMatch(/conflict/i);
  });

  test('empty combos list falls through to RNG — no error', () => {
    const result = generateHand({
      mode: 'hybrid', hole_cards: {},
      hole_cards_combos: { p1: [] }, // empty = incompatible intersection
      board: [null,null,null,null,null],
    }, makePlayers(['p1','p2']));
    expect(result.error).toBeUndefined(); // falls back to rng fill
    expect(result.playerCards.p1).toHaveLength(2);
  });

  test('hole_cards_range takes priority over hole_cards_combos for same player', () => {
    // p1 has both: range (AA) should win
    const result = generateHand({
      mode: 'hybrid', hole_cards: {},
      hole_cards_range:  { p1: 'AA' },
      hole_cards_combos: { p1: suitedConnectorCombos() },
      board: [null,null,null,null,null],
    }, makePlayers(['p1']));
    expect(result.error).toBeUndefined();
    const [c1, c2] = result.playerCards.p1;
    expect(c1[0]).toBe('A');
    expect(c2[0]).toBe('A');
  });

  test('combo list + board texture — no duplicate cards in full deal', () => {
    const combos = [...pairCombos('A'),...pairCombos('K'),...pairCombos('Q')];
    const r = generateHand({
      mode: 'hybrid', hole_cards: {},
      hole_cards_combos: { p1: combos },
      board: [null,null,null,null,null],
      board_texture: ['flush_draw'],
    }, makePlayers(['p1','p2']));
    if (r.error) return; // rare conflict — acceptable
    const all = Object.values(r.playerCards).flat().concat(r.board);
    expect(new Set(all).size).toBe(all.length);
  });

  test('three players with different combo lists — all get valid distinct cards', () => {
    const sCombos = suitedConnectorCombos();
    const pCombos = [...pairCombos('K'),...pairCombos('Q'),...pairCombos('J')];
    // p3 gets ace-high offsuit: AKo, AQo, AJo
    const aceHighCombos = [];
    for (const k of ['K','Q','J']) for (const s1 of SUITS) for (const s2 of SUITS) {
      if (s1 !== s2) aceHighCombos.push([`A${s1}`,`${k}${s2}`]);
    }
    const result = generateHand({
      mode: 'hybrid', hole_cards: {},
      hole_cards_combos: { p1: sCombos, p2: pCombos, p3: aceHighCombos },
      board: [null,null,null,null,null],
    }, makePlayers(['p1','p2','p3']));
    if (result.error) return; // rare conflict
    const all = Object.values(result.playerCards).flat().concat(result.board);
    expect(new Set(all).size).toBe(all.length);
  });

  test('stableId lookup works for hole_cards_combos', () => {
    const combos = pairCombos('A');
    const players = [
      { id: 'sock-1', stableId: 'stable-uuid-1', seat: 0, stack: 1000, name: 'P1' },
      { id: 'sock-2', stableId: 'stable-uuid-2', seat: 1, stack: 1000, name: 'P2' },
    ];
    const result = generateHand({
      mode: 'hybrid', hole_cards: {},
      hole_cards_combos: { 'stable-uuid-1': combos },
      board: [null,null,null,null,null],
    }, players);
    expect(result.error).toBeUndefined();
    const [c1, c2] = result.playerCards['stable-uuid-1'];
    expect(c1[0]).toBe('A');
    expect(c2[0]).toBe('A');
  });
});
