'use strict';

const { generateFlop, dealFromRange, buildDealConfig, availableDeck } = require('../BoardGenerator');

const ALL_SUITS = ['s', 'h', 'd', 'c'];
const ALL_RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const FULL_DECK = ALL_SUITS.flatMap(s => ALL_RANKS.map(r => `${r}${s}`));

// ─── availableDeck ────────────────────────────────────────────────────────────

describe('availableDeck', () => {
  it('returns 52 cards when no exclusions', () => {
    expect(availableDeck()).toHaveLength(52);
  });

  it('excludes specified cards', () => {
    const deck = availableDeck(['As', 'Kh']);
    expect(deck).toHaveLength(50);
    expect(deck).not.toContain('As');
    expect(deck).not.toContain('Kh');
  });
});

// ─── generateFlop — all 7 textures ───────────────────────────────────────────

function runGenerateFlop(texture, excludedCards = [], runs = 20) {
  const results = [];
  for (let i = 0; i < runs; i++) {
    results.push(generateFlop(texture, excludedCards));
  }
  return results;
}

describe('generateFlop', () => {
  it('returns 3 cards for every texture', () => {
    const textures = ['monotone', 'two_tone', 'rainbow', 'paired', 'connected', 'dry', 'wet'];
    for (const t of textures) {
      const flop = generateFlop(t);
      expect(flop).toHaveLength(3);
      flop.forEach(c => expect(FULL_DECK).toContain(c));
    }
  });

  it('monotone: all 3 cards same suit', () => {
    runGenerateFlop('monotone', [], 30).forEach(flop => {
      const suits = flop.map(c => c[c.length - 1]);
      expect(new Set(suits).size).toBe(1);
    });
  });

  it('two_tone: exactly 2 suits used', () => {
    runGenerateFlop('two_tone', [], 30).forEach(flop => {
      const suits = flop.map(c => c[c.length - 1]);
      expect(new Set(suits).size).toBe(2);
    });
  });

  it('rainbow: 3 different suits', () => {
    runGenerateFlop('rainbow', [], 30).forEach(flop => {
      const suits = flop.map(c => c[c.length - 1]);
      expect(new Set(suits).size).toBe(3);
    });
  });

  it('paired: at least two cards share a rank', () => {
    runGenerateFlop('paired', [], 30).forEach(flop => {
      const ranks = flop.map(c => c[0]);
      const hasPair = ranks.some((r, i) => ranks.indexOf(r) !== i);
      expect(hasPair).toBe(true);
    });
  });

  it('connected: three consecutive ranks', () => {
    runGenerateFlop('connected', [], 30).forEach(flop => {
      const rankOrder = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
      const indices = flop.map(c => rankOrder.indexOf(c[0])).sort((a, b) => a - b);
      expect(indices[1] - indices[0]).toBe(1);
      expect(indices[2] - indices[1]).toBe(1);
    });
  });

  it('dry: no pair, rainbow, no straight draw', () => {
    runGenerateFlop('dry', [], 50).forEach(flop => {
      const ranks  = flop.map(c => c[0]);
      const suits  = flop.map(c => c[c.length - 1]);
      const rankOrder = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
      const indices = ranks.map(r => rankOrder.indexOf(r)).sort((a, b) => a - b);
      expect(new Set(ranks).size).toBe(3);     // no pair
      expect(new Set(suits).size).toBe(3);     // rainbow
      // No two ranks consecutive within 3 steps
      const noStDraw = (indices[1] - indices[0] > 3) && (indices[2] - indices[1] > 3);
      expect(noStDraw).toBe(true);
    });
  });

  it('wet: at least 2 wet factors', () => {
    runGenerateFlop('wet', [], 30).forEach(flop => {
      const ranks  = flop.map(c => c[0]);
      const suits  = flop.map(c => c[c.length - 1]);
      const rankOrder = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
      const indices = ranks.map(r => rankOrder.indexOf(r)).sort((a, b) => a - b);
      const hasFlushdraw  = new Set(suits).size < 3;
      const isPaired      = new Set(ranks).size < 3;
      const hasStraightDraw = (indices[1] - indices[0] <= 3) || (indices[2] - indices[1] <= 3);
      const score = (hasFlushdraw ? 1 : 0) + (isPaired ? 1 : 0) + (hasStraightDraw ? 1 : 0);
      expect(score).toBeGreaterThanOrEqual(2);
    });
  });

  it('does not return excluded cards', () => {
    // Exclude all spades — should still return 3 cards (from other suits)
    const excluded = ALL_RANKS.map(r => `${r}s`);
    const flop = generateFlop('monotone', excluded);
    expect(flop).toHaveLength(3);
    flop.forEach(c => expect(c).not.toMatch(/s$/));
  });

  it('falls back to 3 random cards for unknown texture', () => {
    const flop = generateFlop('unknown_texture');
    expect(flop).toHaveLength(3);
  });
});

// ─── dealFromRange ────────────────────────────────────────────────────────────

describe('dealFromRange', () => {
  it('returns 2 cards for a valid range', () => {
    const result = dealFromRange('AA,KK,QQ');
    expect(result).toHaveLength(2);
  });

  it('returned cards are from the specified range', () => {
    const result = dealFromRange('AA');
    expect(result).toHaveLength(2);
    expect(result[0][0]).toBe('A');
    expect(result[1][0]).toBe('A');
  });

  it('excludes already-used cards', () => {
    // Exclude all aces — AA range should return null
    const allAces = ALL_SUITS.flatMap(s => [`A${s}`]);
    const result = dealFromRange('AA', allAces);
    expect(result).toBeNull();
  });

  it('returns null for empty range string', () => {
    const result = dealFromRange('');
    expect(result).toBeNull();
  });
});

// ─── buildDealConfig ──────────────────────────────────────────────────────────

describe('buildDealConfig', () => {
  it('assigns fixed cards to seats', () => {
    const scenario = {
      seat_configs: [
        { seat: 0, cards: ['As', 'Kh'] },
        { seat: 1, cards: ['Qd', 'Jc'] },
      ],
      stack_configs: [],
      board_mode: 'none',
    };
    const { holeCards } = buildDealConfig(scenario);
    expect(holeCards[0]).toEqual(['As', 'Kh']);
    expect(holeCards[1]).toEqual(['Qd', 'Jc']);
  });

  it('deals from range for range seats', () => {
    const scenario = {
      seat_configs: [{ seat: 0, range: 'AA,KK,QQ' }],
      stack_configs: [],
      board_mode: 'none',
    };
    const { holeCards } = buildDealConfig(scenario);
    expect(holeCards[0]).toHaveLength(2);
  });

  it('returns 5 board cards for board_mode=none', () => {
    const scenario = {
      seat_configs: [],
      stack_configs: [],
      board_mode: 'none',
    };
    const { flop, turn, river } = buildDealConfig(scenario);
    expect(flop).toHaveLength(3);
    expect(turn).toBeTruthy();
    expect(river).toBeTruthy();
  });

  it('returns specific board for board_mode=specific', () => {
    const scenario = {
      seat_configs: [],
      stack_configs: [],
      board_mode:  'specific',
      board_flop:  '3s5hTd',
      board_turn:  'Ac',
      board_river: '7h',
    };
    const { flop, turn, river } = buildDealConfig(scenario);
    expect(flop).toEqual(['3s', '5h', 'Td']);
    expect(turn).toBe('Ac');
    expect(river).toBe('7h');
  });

  it('generates texture flop for board_mode=texture', () => {
    const scenario = {
      seat_configs: [],
      stack_configs: [],
      board_mode:    'texture',
      board_texture: 'monotone',
    };
    const { flop } = buildDealConfig(scenario);
    const suits = flop.map(c => c[c.length - 1]);
    expect(new Set(suits).size).toBe(1);
  });

  it('does not reuse hole cards in board', () => {
    const scenario = {
      seat_configs: [
        { seat: 0, cards: ['As', 'Kh'] },
        { seat: 1, cards: ['Qd', 'Jc'] },
      ],
      stack_configs: [],
      board_mode: 'none',
    };
    for (let i = 0; i < 10; i++) {
      const { flop, turn, river } = buildDealConfig(scenario);
      const board = [...flop, turn, river].filter(Boolean);
      expect(board).not.toContain('As');
      expect(board).not.toContain('Kh');
      expect(board).not.toContain('Qd');
      expect(board).not.toContain('Jc');
    }
  });

  it('throws when range has no eligible combos', () => {
    // Two fixed seats consume all 4 aces; third seat's AA range has 0 eligible combos
    const scenario = {
      seat_configs: [
        { seat: 0, cards: ['As', 'Ah'] }, // consumes 2 aces
        { seat: 1, cards: ['Ad', 'Ac'] }, // consumes remaining 2 aces
        { seat: 2, range: 'AA' },          // no aces left → should throw
      ],
      stack_configs: [],
      board_mode: 'none',
    };
    expect(() => buildDealConfig(scenario)).toThrow();
  });
});
