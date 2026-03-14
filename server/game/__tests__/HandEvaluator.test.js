'use strict';

/**
 * HandEvaluator.test.js
 *
 * Comprehensive tests for server/game/HandEvaluator.js
 * Covers all 9 hand ranks, edge cases, compareHands, and card-count variants.
 *
 * Task: QA-02
 */

const { evaluate, compareHands, HAND_RANKS, evaluateFive } = require('../HandEvaluator');

// ---------------------------------------------------------------------------
// Helper: verify the structural invariants every HandResult must satisfy
// ---------------------------------------------------------------------------
function assertHandResult(result) {
  expect(result).toBeDefined();
  expect(typeof result.rank).toBe('number');
  expect(typeof result.rankName).toBe('string');
  expect(Array.isArray(result.bestFive)).toBe(true);
  expect(result.bestFive).toHaveLength(5);
  // No duplicate cards in bestFive
  expect(new Set(result.bestFive).size).toBe(5);
  expect(typeof result.description).toBe('string');
  expect(result.description.length).toBeGreaterThan(0);
  expect(Array.isArray(result.kickers)).toBe(true);
}

// ---------------------------------------------------------------------------
// Helper: extract rank character from a card string
// ---------------------------------------------------------------------------
const cardRank = c => c[0];

// ---------------------------------------------------------------------------
// Suite 1: HAND_RANKS constants
// ---------------------------------------------------------------------------
describe('HAND_RANKS constants', () => {
  test('exports all 10 rank constants with correct numeric values', () => {
    expect(HAND_RANKS.HIGH_CARD).toBe(0);
    expect(HAND_RANKS.ONE_PAIR).toBe(1);
    expect(HAND_RANKS.TWO_PAIR).toBe(2);
    expect(HAND_RANKS.THREE_OF_A_KIND).toBe(3);
    expect(HAND_RANKS.STRAIGHT).toBe(4);
    expect(HAND_RANKS.FLUSH).toBe(5);
    expect(HAND_RANKS.FULL_HOUSE).toBe(6);
    expect(HAND_RANKS.FOUR_OF_A_KIND).toBe(7);
    expect(HAND_RANKS.STRAIGHT_FLUSH).toBe(8);
    expect(HAND_RANKS.ROYAL_FLUSH).toBe(9);
  });

  test('ROYAL_FLUSH is the highest rank', () => {
    const vals = Object.values(HAND_RANKS);
    expect(Math.max(...vals)).toBe(HAND_RANKS.ROYAL_FLUSH);
  });

  test('HIGH_CARD is the lowest rank', () => {
    const vals = Object.values(HAND_RANKS);
    expect(Math.min(...vals)).toBe(HAND_RANKS.HIGH_CARD);
  });
});

// ---------------------------------------------------------------------------
// Suite 2: Royal Flush
// ---------------------------------------------------------------------------
describe('Royal Flush', () => {
  const holeCards  = ['As', 'Ks'];
  const boardCards = ['Qs', 'Js', 'Ts', '2h', '3d'];

  let result;
  beforeAll(() => { result = evaluate(holeCards, boardCards); });

  test('rank = 9 (ROYAL_FLUSH)', () => {
    expect(result.rank).toBe(HAND_RANKS.ROYAL_FLUSH);
  });

  test('rankName = ROYAL_FLUSH', () => {
    expect(result.rankName).toBe('ROYAL_FLUSH');
  });

  test('bestFive has exactly 5 cards, no duplicates', () => {
    assertHandResult(result);
  });

  test('bestFive contains exactly the five royal cards (A K Q J T of spades)', () => {
    const royalRanks = new Set(['A', 'K', 'Q', 'J', 'T']);
    const resultRanks = new Set(result.bestFive.map(cardRank));
    expect(resultRanks).toEqual(royalRanks);
  });

  test('bestFive are all the same suit', () => {
    const suits = result.bestFive.map(c => c[1]);
    expect(new Set(suits).size).toBe(1);
  });

  test('description = "Royal Flush"', () => {
    expect(result.description).toBe('Royal Flush');
  });

  test('does not include 2h or 3d in bestFive', () => {
    expect(result.bestFive).not.toContain('2h');
    expect(result.bestFive).not.toContain('3d');
  });
});

// ---------------------------------------------------------------------------
// Suite 3: Straight Flush
// ---------------------------------------------------------------------------
describe('Straight Flush — Nine high', () => {
  const holeCards  = ['9s', '8s'];
  const boardCards = ['7s', '6s', '5s', '2h', '3d'];

  let result;
  beforeAll(() => { result = evaluate(holeCards, boardCards); });

  test('rank = 8 (STRAIGHT_FLUSH)', () => {
    expect(result.rank).toBe(HAND_RANKS.STRAIGHT_FLUSH);
  });

  test('rankName = STRAIGHT_FLUSH', () => {
    expect(result.rankName).toBe('STRAIGHT_FLUSH');
  });

  test('bestFive has exactly 5 cards, no duplicates', () => {
    assertHandResult(result);
  });

  test('description references Nine or 9', () => {
    const desc = result.description;
    expect(desc.includes('Nine') || desc.includes('9')).toBe(true);
  });

  test('bestFive cards are all spades', () => {
    const suits = result.bestFive.map(c => c[1]);
    expect(suits.every(s => s === 's')).toBe(true);
  });

  test('bestFive high card is 9 (not 2 or 3)', () => {
    // The 9 should be first in bestFive (sorted desc) or present
    const ranks = result.bestFive.map(cardRank);
    expect(ranks).toContain('9');
    expect(ranks).not.toContain('2');
    expect(ranks).not.toContain('3');
  });
});

describe('Straight Flush — Wheel (A-2-3-4-5 of spades)', () => {
  const holeCards  = ['As', '2s'];
  const boardCards = ['3s', '4s', '5s', 'Kh', 'Qd'];

  let result;
  beforeAll(() => { result = evaluate(holeCards, boardCards); });

  test('rank = 8 (STRAIGHT_FLUSH)', () => {
    expect(result.rank).toBe(HAND_RANKS.STRAIGHT_FLUSH);
  });

  test('rankName = STRAIGHT_FLUSH', () => {
    expect(result.rankName).toBe('STRAIGHT_FLUSH');
  });

  test('bestFive has exactly 5 cards, no duplicates', () => {
    assertHandResult(result);
  });

  test('high card of wheel straight is 5 (not Ace)', () => {
    // description should reference Five, not Ace
    expect(result.description).toContain('Five');
    expect(result.description).not.toMatch(/Ace high/i);
  });

  test('bestFive[0] is the 5-card (wheel ordering: 5-4-3-2-A)', () => {
    expect(cardRank(result.bestFive[0])).toBe('5');
  });

  test('bestFive last card is the Ace (ace low in wheel)', () => {
    expect(cardRank(result.bestFive[4])).toBe('A');
  });

  test('bestFive contains A,2,3,4,5 only', () => {
    const ranks = new Set(result.bestFive.map(cardRank));
    expect(ranks).toEqual(new Set(['A', '2', '3', '4', '5']));
  });

  test('wheel straight flush beats nothing of rank 9, loses to normal SF 6-high', () => {
    const sixHighSF = evaluate(['6s', '5s'], ['4s', '3s', '2s', 'Kh', 'Qd']);
    expect(compareHands(sixHighSF, result)).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 4: Four of a Kind
// ---------------------------------------------------------------------------
describe('Four of a Kind', () => {
  const holeCards  = ['As', 'Ah'];
  const boardCards = ['Ad', 'Ac', 'Kh', 'Qd', 'Jc'];

  let result;
  beforeAll(() => { result = evaluate(holeCards, boardCards); });

  test('rank = 7 (FOUR_OF_A_KIND)', () => {
    expect(result.rank).toBe(HAND_RANKS.FOUR_OF_A_KIND);
  });

  test('rankName = FOUR_OF_A_KIND', () => {
    expect(result.rankName).toBe('FOUR_OF_A_KIND');
  });

  test('bestFive has exactly 5 cards, no duplicates', () => {
    assertHandResult(result);
  });

  test('kicker is King (Kh — best kicker available)', () => {
    expect(result.kickers).toHaveLength(1);
    expect(cardRank(result.kickers[0])).toBe('K');
  });

  test('bestFive contains all four Aces and the King', () => {
    const ranks = result.bestFive.map(cardRank);
    const aces = ranks.filter(r => r === 'A');
    expect(aces).toHaveLength(4);
    expect(ranks).toContain('K');
  });

  test('description = "Four of a Kind, Aces"', () => {
    expect(result.description).toBe('Four of a Kind, Aces');
  });

  test('kicker tiebreak: King kicker beats Queen kicker', () => {
    // Player A: quads Aces, kicker King
    const playerA = evaluate(['As', 'Ah'], ['Ad', 'Ac', 'Kh', '2d', '3c']);
    // Player B: quads Aces, kicker Queen
    const playerB = evaluate(['As', 'Ah'], ['Ad', 'Ac', 'Qh', '2d', '3c']);
    expect(playerA.rank).toBe(HAND_RANKS.FOUR_OF_A_KIND);
    expect(playerB.rank).toBe(HAND_RANKS.FOUR_OF_A_KIND);
    expect(compareHands(playerA, playerB)).toBeGreaterThan(0);
  });

  test('kicker tiebreak: same quads, same kicker = tie (0)', () => {
    const playerA = evaluate(['As', 'Ah'], ['Ad', 'Ac', 'Kh', '2d', '3c']);
    const playerB = evaluate(['As', 'Ah'], ['Ad', 'Ac', 'Kd', '2d', '3c']);
    // Both have quads aces with K kicker — should tie
    expect(compareHands(playerA, playerB)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 5: Full House
// ---------------------------------------------------------------------------
describe('Full House', () => {
  const holeCards  = ['Ks', 'Kh'];
  const boardCards = ['Kd', 'Jh', 'Js', '2c', '3d'];

  let result;
  beforeAll(() => { result = evaluate(holeCards, boardCards); });

  test('rank = 6 (FULL_HOUSE)', () => {
    expect(result.rank).toBe(HAND_RANKS.FULL_HOUSE);
  });

  test('rankName = FULL_HOUSE', () => {
    expect(result.rankName).toBe('FULL_HOUSE');
  });

  test('bestFive has exactly 5 cards, no duplicates', () => {
    assertHandResult(result);
  });

  test('description = "Full House, Kings full of Jacks"', () => {
    expect(result.description).toBe('Full House, Kings full of Jacks');
  });

  test('bestFive contains 3 Kings and 2 Jacks', () => {
    const ranks = result.bestFive.map(cardRank);
    expect(ranks.filter(r => r === 'K')).toHaveLength(3);
    expect(ranks.filter(r => r === 'J')).toHaveLength(2);
  });

  test('does not include 2c or 3d in bestFive', () => {
    expect(result.bestFive).not.toContain('2c');
    expect(result.bestFive).not.toContain('3d');
  });
});

// ---------------------------------------------------------------------------
// Suite 6: Flush
// ---------------------------------------------------------------------------
describe('Flush', () => {
  const holeCards  = ['As', '9s'];
  const boardCards = ['7s', '4s', '2s', 'Kh', 'Qd'];

  let result;
  beforeAll(() => { result = evaluate(holeCards, boardCards); });

  test('rank = 5 (FLUSH)', () => {
    expect(result.rank).toBe(HAND_RANKS.FLUSH);
  });

  test('rankName = FLUSH', () => {
    expect(result.rankName).toBe('FLUSH');
  });

  test('bestFive has exactly 5 cards, no duplicates', () => {
    assertHandResult(result);
  });

  test('all 5 bestFive cards are the same suit (spades)', () => {
    const suits = result.bestFive.map(c => c[1]);
    expect(suits.every(s => s === 's')).toBe(true);
  });

  test('bestFive does not contain Kh or Qd (off-suit cards)', () => {
    expect(result.bestFive).not.toContain('Kh');
    expect(result.bestFive).not.toContain('Qd');
  });

  test('high card of flush is Ace', () => {
    expect(cardRank(result.bestFive[0])).toBe('A');
  });

  test('description references Ace high', () => {
    expect(result.description).toContain('Ace');
  });
});

// ---------------------------------------------------------------------------
// Suite 7: Straight
// ---------------------------------------------------------------------------
describe('Straight — King high', () => {
  const holeCards  = ['Kh', 'Qd'];
  const boardCards = ['Js', 'Tc', '9h', '2s', '3d'];

  let result;
  beforeAll(() => { result = evaluate(holeCards, boardCards); });

  test('rank = 4 (STRAIGHT)', () => {
    expect(result.rank).toBe(HAND_RANKS.STRAIGHT);
  });

  test('rankName = STRAIGHT', () => {
    expect(result.rankName).toBe('STRAIGHT');
  });

  test('bestFive has exactly 5 cards, no duplicates', () => {
    assertHandResult(result);
  });

  test('description includes King', () => {
    expect(result.description).toContain('King');
  });

  test('bestFive contains K, Q, J, T, 9', () => {
    const ranks = new Set(result.bestFive.map(cardRank));
    expect(ranks).toEqual(new Set(['K', 'Q', 'J', 'T', '9']));
  });

  test('does not include 2s or 3d in bestFive', () => {
    expect(result.bestFive).not.toContain('2s');
    expect(result.bestFive).not.toContain('3d');
  });
});

describe('Straight — A-low (wheel, A-2-3-4-5)', () => {
  const holeCards  = ['Ah', '2d'];
  const boardCards = ['3s', '4c', '5h', 'Kd', 'Qd'];

  let result;
  beforeAll(() => { result = evaluate(holeCards, boardCards); });

  test('rank = 4 (STRAIGHT)', () => {
    expect(result.rank).toBe(HAND_RANKS.STRAIGHT);
  });

  test('rankName = STRAIGHT', () => {
    expect(result.rankName).toBe('STRAIGHT');
  });

  test('bestFive has exactly 5 cards, no duplicates', () => {
    assertHandResult(result);
  });

  test('high card of A-low straight is 5 (not Ace)', () => {
    expect(result.description).toContain('Five');
    expect(result.description).not.toMatch(/Ace high/i);
  });

  test('bestFive[0] is 5 (wheel ordering puts 5 first)', () => {
    expect(cardRank(result.bestFive[0])).toBe('5');
  });

  test('bestFive contains A, 2, 3, 4, 5', () => {
    const ranks = new Set(result.bestFive.map(cardRank));
    expect(ranks).toEqual(new Set(['A', '2', '3', '4', '5']));
  });

  test('wheel straight loses to 6-high straight', () => {
    const sixHigh = evaluate(['6h', '5d'], ['4s', '3c', '2h', 'Kd', 'Qd']);
    expect(compareHands(sixHigh, result)).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 8: Three of a Kind
// ---------------------------------------------------------------------------
describe('Three of a Kind', () => {
  const holeCards  = ['7h', '7d'];
  const boardCards = ['7s', 'Ah', 'Ks', '2c', '3d'];

  let result;
  beforeAll(() => { result = evaluate(holeCards, boardCards); });

  test('rank = 3 (THREE_OF_A_KIND)', () => {
    expect(result.rank).toBe(HAND_RANKS.THREE_OF_A_KIND);
  });

  test('rankName = THREE_OF_A_KIND', () => {
    expect(result.rankName).toBe('THREE_OF_A_KIND');
  });

  test('bestFive has exactly 5 cards, no duplicates', () => {
    assertHandResult(result);
  });

  test('kickers include both Ace and King', () => {
    const kickerRanks = result.kickers.map(cardRank);
    expect(kickerRanks).toContain('A');
    expect(kickerRanks).toContain('K');
  });

  test('bestFive contains 3 Sevens, Ace, and King', () => {
    const ranks = result.bestFive.map(cardRank);
    expect(ranks.filter(r => r === '7')).toHaveLength(3);
    expect(ranks).toContain('A');
    expect(ranks).toContain('K');
  });

  test('low cards (2, 3) not in bestFive', () => {
    const ranks = result.bestFive.map(cardRank);
    expect(ranks).not.toContain('2');
    expect(ranks).not.toContain('3');
  });

  test('description contains Sevens', () => {
    expect(result.description).toContain('Sevens');
  });
});

// ---------------------------------------------------------------------------
// Suite 9: Two Pair
// ---------------------------------------------------------------------------
describe('Two Pair — Aces and Kings', () => {
  const holeCards  = ['Ah', 'Ad'];
  const boardCards = ['Kh', 'Kd', '2s', '3h', '4c'];

  let result;
  beforeAll(() => { result = evaluate(holeCards, boardCards); });

  test('rank = 2 (TWO_PAIR)', () => {
    expect(result.rank).toBe(HAND_RANKS.TWO_PAIR);
  });

  test('rankName = TWO_PAIR', () => {
    expect(result.rankName).toBe('TWO_PAIR');
  });

  test('bestFive has exactly 5 cards, no duplicates', () => {
    assertHandResult(result);
  });

  test('description = "Two Pair, Aces and Kings"', () => {
    expect(result.description).toBe('Two Pair, Aces and Kings');
  });

  test('bestFive contains 2 Aces and 2 Kings', () => {
    const ranks = result.bestFive.map(cardRank);
    expect(ranks.filter(r => r === 'A')).toHaveLength(2);
    expect(ranks.filter(r => r === 'K')).toHaveLength(2);
  });

  test('kicker is the best non-pair card (4 in this case)', () => {
    expect(result.kickers).toHaveLength(1);
    // Best kicker from 2, 3, 4 is 4
    expect(cardRank(result.kickers[0])).toBe('4');
  });
});

describe('Two Pair — kicker tiebreak', () => {
  // Both players have AA and KK on the board; differ only in 5th card kicker
  // Player A: hole Ah Ad, board Kh Kd Qh 8h 3c → kicker Q (no straight possible)
  // Player B: hole Ah Ad, board Kh Kd Qh 7h 2c → kicker Q still (Q is best of remaining)
  // Use different boards so we can clearly separate kickers
  const playerAHole  = ['Ah', 'Ad'];
  const playerABoard = ['Kh', 'Kd', 'Qh', '8h', '3c'];

  const playerBHole  = ['Ah', 'Ad'];
  const playerBBoard = ['Kh', 'Kd', 'Qh', '7h', '2c'];

  let resultA, resultB;
  beforeAll(() => {
    resultA = evaluate(playerAHole, playerABoard);
    resultB = evaluate(playerBHole, playerBBoard);
  });

  test('both are Two Pair', () => {
    expect(resultA.rank).toBe(HAND_RANKS.TWO_PAIR);
    expect(resultB.rank).toBe(HAND_RANKS.TWO_PAIR);
  });

  test('both pick Aces and Kings as the two pair', () => {
    expect(resultA.description).toBe('Two Pair, Aces and Kings');
    expect(resultB.description).toBe('Two Pair, Aces and Kings');
  });

  test('Player A kicker is Q, Player B kicker is also Q (best available non-pair)', () => {
    // Both boards contain Q, so both get Q as kicker
    expect(cardRank(resultA.kickers[0])).toBe('Q');
    expect(cardRank(resultB.kickers[0])).toBe('Q');
  });

  test('hands with same Two Pair and same kicker rank tie at 0', () => {
    expect(compareHands(resultA, resultB)).toBe(0);
  });

  test('different kickers: Q beats 2', () => {
    // Player C has Aces+Kings but kicker 2
    const playerCHole  = ['Ah', 'Ad'];
    const playerCBoard = ['Kh', 'Kd', '5h', '3h', '2c'];
    const resultC = evaluate(playerCHole, playerCBoard);
    expect(resultC.rank).toBe(HAND_RANKS.TWO_PAIR);
    // resultA kicker Q vs resultC kicker 5 → A wins
    expect(compareHands(resultA, resultC)).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 10: One Pair
// ---------------------------------------------------------------------------
describe('One Pair', () => {
  const holeCards  = ['Jh', 'Jd'];
  const boardCards = ['As', 'Ks', 'Qs', '2h', '3d'];

  let result;
  beforeAll(() => { result = evaluate(holeCards, boardCards); });

  test('rank = 1 (ONE_PAIR)', () => {
    expect(result.rank).toBe(HAND_RANKS.ONE_PAIR);
  });

  test('rankName = ONE_PAIR', () => {
    expect(result.rankName).toBe('ONE_PAIR');
  });

  test('bestFive has exactly 5 cards, no duplicates', () => {
    assertHandResult(result);
  });

  test('kickers include Ace, King, Queen (3 kickers)', () => {
    const kickerRanks = result.kickers.map(cardRank);
    expect(kickerRanks).toContain('A');
    expect(kickerRanks).toContain('K');
    expect(kickerRanks).toContain('Q');
  });

  test('kickers has exactly 3 cards', () => {
    expect(result.kickers).toHaveLength(3);
  });

  test('bestFive contains 2 Jacks', () => {
    const ranks = result.bestFive.map(cardRank);
    expect(ranks.filter(r => r === 'J')).toHaveLength(2);
  });

  test('low cards (2, 3) not in bestFive', () => {
    const ranks = result.bestFive.map(cardRank);
    expect(ranks).not.toContain('2');
    expect(ranks).not.toContain('3');
  });

  test('description contains Jacks', () => {
    expect(result.description).toContain('Jacks');
  });
});

// ---------------------------------------------------------------------------
// Suite 11: High Card
// ---------------------------------------------------------------------------
describe('High Card', () => {
  const holeCards  = ['Ah', 'Kd'];
  const boardCards = ['Qs', 'Jh', '9c', '7d', '2s'];

  let result;
  beforeAll(() => { result = evaluate(holeCards, boardCards); });

  test('rank = 0 (HIGH_CARD)', () => {
    expect(result.rank).toBe(HAND_RANKS.HIGH_CARD);
  });

  test('rankName = HIGH_CARD', () => {
    expect(result.rankName).toBe('HIGH_CARD');
  });

  test('bestFive has exactly 5 cards, no duplicates', () => {
    assertHandResult(result);
  });

  test('bestFive[0] is the Ace (Ah)', () => {
    expect(cardRank(result.bestFive[0])).toBe('A');
  });

  test('bestFive contains A, K, Q, J, 9 (best 5 from 7)', () => {
    const ranks = new Set(result.bestFive.map(cardRank));
    expect(ranks).toEqual(new Set(['A', 'K', 'Q', 'J', '9']));
  });

  test('low cards (7, 2) not in bestFive', () => {
    const ranks = result.bestFive.map(cardRank);
    expect(ranks).not.toContain('7');
    expect(ranks).not.toContain('2');
  });

  test('description contains Ace', () => {
    expect(result.description).toContain('Ace');
  });
});

// ---------------------------------------------------------------------------
// Suite 12: compareHands
// ---------------------------------------------------------------------------
describe('compareHands', () => {
  test('higher rank always beats lower rank', () => {
    const royalFlush    = evaluate(['As', 'Ks'], ['Qs', 'Js', 'Ts', '2h', '3d']);
    const straightFlush = evaluate(['9s', '8s'], ['7s', '6s', '5s', '2h', '3d']);
    const quads         = evaluate(['As', 'Ah'], ['Ad', 'Ac', 'Kh', 'Qd', 'Jc']);
    const fullHouse     = evaluate(['Ks', 'Kh'], ['Kd', 'Jh', 'Js', '2c', '3d']);
    const flush         = evaluate(['As', '9s'], ['7s', '4s', '2s', 'Kh', 'Qd']);
    const straight      = evaluate(['Kh', 'Qd'], ['Js', 'Tc', '9h', '2s', '3d']);
    const trips         = evaluate(['7h', '7d'], ['7s', 'Ah', 'Ks', '2c', '3d']);
    const twoPair       = evaluate(['Ah', 'Ad'], ['Kh', 'Kd', '2s', '3h', '4c']);
    const onePair       = evaluate(['Jh', 'Jd'], ['As', 'Ks', 'Qs', '2h', '3d']);
    const highCard      = evaluate(['Ah', 'Kd'], ['Qs', 'Jh', '9c', '7d', '2s']);

    const ordered = [highCard, onePair, twoPair, trips, straight, flush, fullHouse, quads, straightFlush, royalFlush];

    for (let i = 0; i < ordered.length - 1; i++) {
      expect(compareHands(ordered[i + 1], ordered[i])).toBeGreaterThan(0);
      expect(compareHands(ordered[i], ordered[i + 1])).toBeLessThan(0);
    }
  });

  test('Royal Flush always beats Straight Flush', () => {
    const royalFlush    = evaluate(['As', 'Ks'], ['Qs', 'Js', 'Ts', '2h', '3d']);
    const straightFlush = evaluate(['Ks', 'Qs'], ['Js', 'Ts', '9s', '2h', '3d']);
    expect(compareHands(royalFlush, straightFlush)).toBeGreaterThan(0);
  });

  test('same rank, better kicker wins', () => {
    // Both have pair of Jacks; A kicker beats K kicker
    const withAce  = evaluate(['Jh', 'Jd'], ['As', '2h', '3d', '4c', '5d']);
    const withKing = evaluate(['Jh', 'Jd'], ['Ks', '2h', '3d', '4c', '5d']);
    expect(compareHands(withAce, withKing)).toBeGreaterThan(0);
    expect(compareHands(withKing, withAce)).toBeLessThan(0);
  });

  test('equal hands returns 0', () => {
    // Two players, identical effective bestFive (same ranks, suit doesn't matter for comparison)
    const hand1 = evaluate(['Ah', 'Kh'], ['Qh', 'Jh', 'Th', '2d', '3c']); // royal flush
    const hand2 = evaluate(['As', 'Ks'], ['Qs', 'Js', 'Ts', '2d', '3c']); // royal flush
    expect(hand1.rank).toBe(HAND_RANKS.ROYAL_FLUSH);
    expect(hand2.rank).toBe(HAND_RANKS.ROYAL_FLUSH);
    expect(compareHands(hand1, hand2)).toBe(0);
  });

  test('high card tiebreak: Ace-high beats King-high', () => {
    const aceHigh  = evaluate(['Ah', '2d'], ['5s', '7c', '9h', 'Jd', '3c']);
    const kingHigh = evaluate(['Kh', '2d'], ['5s', '7c', '9h', 'Jd', '3c']);
    expect(aceHigh.rank).toBe(HAND_RANKS.HIGH_CARD);
    expect(kingHigh.rank).toBe(HAND_RANKS.HIGH_CARD);
    expect(compareHands(aceHigh, kingHigh)).toBeGreaterThan(0);
  });

  test('same two-pair, kicker breaks tie', () => {
    const handQ = evaluate(['Ah', 'Ad'], ['Kh', 'Kd', 'Qs', '2c', '3d']); // kicker Q
    const handJ = evaluate(['Ah', 'Ad'], ['Kh', 'Kd', 'Js', '2c', '3d']); // kicker J
    expect(compareHands(handQ, handJ)).toBeGreaterThan(0);
  });

  test('same flush, second card breaks tie', () => {
    // Nut flush A-K vs A-Q flush
    const nutFlush    = evaluate(['As', 'Ks'], ['9s', '4s', '2s', '7h', 'Jd']);
    const lowerFlush  = evaluate(['As', 'Qs'], ['9s', '4s', '2s', '7h', 'Jd']);
    expect(nutFlush.rank).toBe(HAND_RANKS.FLUSH);
    expect(lowerFlush.rank).toBe(HAND_RANKS.FLUSH);
    expect(compareHands(nutFlush, lowerFlush)).toBeGreaterThan(0);
  });

  test('same full house, trips rank decides', () => {
    // Aces full of Kings vs Kings full of Aces
    const acesFullKings = evaluate(['As', 'Ah'], ['Ad', 'Kh', 'Ks', '2c', '3d']);
    const kingsFullAces = evaluate(['Ks', 'Kh'], ['Kd', 'Ah', 'As', '2c', '3d']);
    expect(acesFullKings.rank).toBe(HAND_RANKS.FULL_HOUSE);
    expect(kingsFullAces.rank).toBe(HAND_RANKS.FULL_HOUSE);
    expect(compareHands(acesFullKings, kingsFullAces)).toBeGreaterThan(0);
  });

  test('returns positive number (not just 1) or negative number', () => {
    const higher = evaluate(['As', 'Ks'], ['Qs', 'Js', 'Ts', '2h', '3d']);
    const lower  = evaluate(['Ah', 'Kd'], ['Qs', 'Jh', '9c', '7d', '2s']);
    const cmp = compareHands(higher, lower);
    expect(typeof cmp).toBe('number');
    expect(cmp).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 13: Edge cases — card count variations
// ---------------------------------------------------------------------------
describe('Edge cases — card count', () => {
  test('exactly 5 cards total (2 hole + 3 board — flop only) works correctly', () => {
    const result = evaluate(['As', 'Ks'], ['Qs', 'Js', 'Ts']);
    assertHandResult(result);
    expect(result.rank).toBe(HAND_RANKS.ROYAL_FLUSH);
  });

  test('6 cards total (2 hole + 4 board — turn) finds best 5', () => {
    // Board has 4 cards; best 5 from 6 should be royal flush
    const result = evaluate(['As', 'Ks'], ['Qs', 'Js', 'Ts', '2h']);
    assertHandResult(result);
    expect(result.rank).toBe(HAND_RANKS.ROYAL_FLUSH);
  });

  test('7 cards total (2 hole + 5 board — river) finds best 5 from 21 combos', () => {
    // With 7 cards, C(7,5)=21 combinations are evaluated
    const result = evaluate(['As', 'Ks'], ['Qs', 'Js', 'Ts', '2h', '3d']);
    assertHandResult(result);
    expect(result.rank).toBe(HAND_RANKS.ROYAL_FLUSH);
    // Trash cards (2, 3) must be excluded
    expect(result.bestFive).not.toContain('2h');
    expect(result.bestFive).not.toContain('3d');
  });

  test('7-card hand picks best 5: pair should not beat flush', () => {
    // hole = 2s,2h (pair of twos); board = As,Ks,Qs,Js,9s (ace-high flush in spades)
    // Best hand is the flush — pair of 2s is inferior
    const result = evaluate(['2h', '2d'], ['As', 'Ks', 'Qs', 'Js', '9s']);
    assertHandResult(result);
    expect(result.rank).toBe(HAND_RANKS.FLUSH);
    // Should not use 2h or 2d
    const ranks = result.bestFive.map(cardRank);
    expect(ranks).not.toContain('2');
  });

  test('best hand uses only board cards (pocket 2s, board has A-K-Q-J-T suited) — player gets the straight flush', () => {
    // hole = 2c, 2h (pocket 2s, different suit from board)
    // board = As,Ks,Qs,Js,Ts (royal flush in spades)
    // Player best hand is the royal flush from the board
    const result = evaluate(['2c', '2h'], ['As', 'Ks', 'Qs', 'Js', 'Ts']);
    assertHandResult(result);
    expect(result.rank).toBe(HAND_RANKS.ROYAL_FLUSH);
    expect(result.rankName).toBe('ROYAL_FLUSH');
    // bestFive should be the 5 royal cards, not include 2c or 2h
    expect(result.bestFive).not.toContain('2c');
    expect(result.bestFive).not.toContain('2h');
  });

  test('board with 3 cards makes flush using both hole cards', () => {
    // hole = As, Ks; board = Qs, Js, 9s (only 3 board cards but 5 total with hole)
    const result = evaluate(['As', 'Ks'], ['Qs', 'Js', '9s']);
    assertHandResult(result);
    expect(result.rank).toBe(HAND_RANKS.FLUSH);
    const suits = result.bestFive.map(c => c[1]);
    expect(suits.every(s => s === 's')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Suite 14: evaluateFive — direct unit tests
// ---------------------------------------------------------------------------
describe('evaluateFive — direct 5-card evaluation', () => {
  test('throws for fewer than 5 cards', () => {
    expect(() => evaluateFive(['As', 'Ks', 'Qs', 'Js'])).toThrow();
  });

  test('throws for more than 5 cards', () => {
    expect(() => evaluateFive(['As', 'Ks', 'Qs', 'Js', 'Ts', '2h'])).toThrow();
  });

  test('evaluates royal flush correctly', () => {
    const result = evaluateFive(['As', 'Ks', 'Qs', 'Js', 'Ts']);
    expect(result.rank).toBe(HAND_RANKS.ROYAL_FLUSH);
    assertHandResult(result);
  });

  test('evaluates high card correctly with exactly 5 cards', () => {
    const result = evaluateFive(['Ah', 'Kd', 'Qs', 'Jh', '9c']);
    expect(result.rank).toBe(HAND_RANKS.HIGH_CARD);
    assertHandResult(result);
  });

  test('evaluates wheel straight flush', () => {
    const result = evaluateFive(['As', '2s', '3s', '4s', '5s']);
    expect(result.rank).toBe(HAND_RANKS.STRAIGHT_FLUSH);
    expect(result.description).toContain('Five');
    assertHandResult(result);
  });

  test('evaluates full house correctly', () => {
    const result = evaluateFive(['Ah', 'Ad', 'As', 'Kh', 'Kd']);
    expect(result.rank).toBe(HAND_RANKS.FULL_HOUSE);
    assertHandResult(result);
  });
});

// ---------------------------------------------------------------------------
// Suite 15: Hand rank ordering — cross-rank comparison sanity
// ---------------------------------------------------------------------------
describe('Hand rank ordering — all ranks in correct order', () => {
  let highCard, onePair, twoPair, trips, straight, flush, fullHouse, quads, straightFlush, royalFlush;

  beforeAll(() => {
    highCard      = evaluate(['Ah', 'Kd'], ['Qs', 'Jh', '9c', '7d', '2s']);
    onePair       = evaluate(['Jh', 'Jd'], ['As', 'Ks', 'Qs', '2h', '3d']);
    twoPair       = evaluate(['Ah', 'Ad'], ['Kh', 'Kd', '2s', '3h', '4c']);
    trips         = evaluate(['7h', '7d'], ['7s', 'Ah', 'Ks', '2c', '3d']);
    straight      = evaluate(['Kh', 'Qd'], ['Js', 'Tc', '9h', '2s', '3d']);
    flush         = evaluate(['As', '9s'], ['7s', '4s', '2s', 'Kh', 'Qd']);
    fullHouse     = evaluate(['Ks', 'Kh'], ['Kd', 'Jh', 'Js', '2c', '3d']);
    quads         = evaluate(['As', 'Ah'], ['Ad', 'Ac', 'Kh', 'Qd', 'Jc']);
    straightFlush = evaluate(['9s', '8s'], ['7s', '6s', '5s', '2h', '3d']);
    royalFlush    = evaluate(['As', 'Ks'], ['Qs', 'Js', 'Ts', '2h', '3d']);
  });

  test('each hand has the expected rank constant', () => {
    expect(highCard.rank).toBe(HAND_RANKS.HIGH_CARD);
    expect(onePair.rank).toBe(HAND_RANKS.ONE_PAIR);
    expect(twoPair.rank).toBe(HAND_RANKS.TWO_PAIR);
    expect(trips.rank).toBe(HAND_RANKS.THREE_OF_A_KIND);
    expect(straight.rank).toBe(HAND_RANKS.STRAIGHT);
    expect(flush.rank).toBe(HAND_RANKS.FLUSH);
    expect(fullHouse.rank).toBe(HAND_RANKS.FULL_HOUSE);
    expect(quads.rank).toBe(HAND_RANKS.FOUR_OF_A_KIND);
    expect(straightFlush.rank).toBe(HAND_RANKS.STRAIGHT_FLUSH);
    expect(royalFlush.rank).toBe(HAND_RANKS.ROYAL_FLUSH);
  });

  test('each hand has a valid rankName string matching HAND_RANKS', () => {
    [highCard, onePair, twoPair, trips, straight, flush, fullHouse, quads, straightFlush, royalFlush]
      .forEach(hand => {
        expect(typeof hand.rankName).toBe('string');
        expect(HAND_RANKS[hand.rankName]).toBe(hand.rank);
      });
  });

  test('higher-ranked hands beat lower-ranked hands in compareHands', () => {
    const ordered = [highCard, onePair, twoPair, trips, straight, flush, fullHouse, quads, straightFlush, royalFlush];
    for (let i = 0; i < ordered.length - 1; i++) {
      const lower  = ordered[i];
      const higher = ordered[i + 1];
      expect(compareHands(higher, lower)).toBeGreaterThan(0);
      expect(compareHands(lower, higher)).toBeLessThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Suite 16: Structural invariants on all hand types
// ---------------------------------------------------------------------------
describe('Structural invariants — all HandResult objects', () => {
  const testCases = [
    { name: 'Royal Flush',    hole: ['As', 'Ks'], board: ['Qs', 'Js', 'Ts', '2h', '3d'] },
    { name: 'Straight Flush', hole: ['9s', '8s'], board: ['7s', '6s', '5s', '2h', '3d'] },
    { name: 'Four of a Kind', hole: ['As', 'Ah'], board: ['Ad', 'Ac', 'Kh', 'Qd', 'Jc'] },
    { name: 'Full House',     hole: ['Ks', 'Kh'], board: ['Kd', 'Jh', 'Js', '2c', '3d'] },
    { name: 'Flush',          hole: ['As', '9s'], board: ['7s', '4s', '2s', 'Kh', 'Qd'] },
    { name: 'Straight',       hole: ['Kh', 'Qd'], board: ['Js', 'Tc', '9h', '2s', '3d'] },
    { name: 'Three of a Kind',hole: ['7h', '7d'], board: ['7s', 'Ah', 'Ks', '2c', '3d'] },
    { name: 'Two Pair',       hole: ['Ah', 'Ad'], board: ['Kh', 'Kd', '2s', '3h', '4c'] },
    { name: 'One Pair',       hole: ['Jh', 'Jd'], board: ['As', 'Ks', 'Qs', '2h', '3d'] },
    { name: 'High Card',      hole: ['Ah', 'Kd'], board: ['Qs', 'Jh', '9c', '7d', '2s'] },
  ];

  testCases.forEach(({ name, hole, board }) => {
    test(`${name}: result has all required fields`, () => {
      const result = evaluate(hole, board);
      assertHandResult(result);
    });

    test(`${name}: kickers is a subset of bestFive`, () => {
      const result = evaluate(hole, board);
      for (const kicker of result.kickers) {
        expect(result.bestFive).toContain(kicker);
      }
    });

    test(`${name}: bestFive cards all come from hole + board`, () => {
      const allCards = new Set([...hole, ...board]);
      const result = evaluate(hole, board);
      for (const card of result.bestFive) {
        expect(allCards.has(card)).toBe(true);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Suite 17: Description format checks
// ---------------------------------------------------------------------------
describe('Description format', () => {
  test('Royal Flush description is exactly "Royal Flush"', () => {
    const result = evaluate(['As', 'Ks'], ['Qs', 'Js', 'Ts', '2h', '3d']);
    expect(result.description).toBe('Royal Flush');
  });

  test('Full House description format: "Full House, X full of Y"', () => {
    const result = evaluate(['Ks', 'Kh'], ['Kd', 'Jh', 'Js', '2c', '3d']);
    expect(result.description).toMatch(/^Full House, \w+ full of \w+$/);
  });

  test('Four of a Kind description format: "Four of a Kind, X"', () => {
    const result = evaluate(['As', 'Ah'], ['Ad', 'Ac', 'Kh', 'Qd', 'Jc']);
    expect(result.description).toMatch(/^Four of a Kind, \w+$/);
  });

  test('Two Pair description format: "Two Pair, X and Y"', () => {
    const result = evaluate(['Ah', 'Ad'], ['Kh', 'Kd', '2s', '3h', '4c']);
    expect(result.description).toMatch(/^Two Pair, \w+ and \w+$/);
  });

  test('Three of a Kind description format: "Three of a Kind, X"', () => {
    const result = evaluate(['7h', '7d'], ['7s', 'Ah', 'Ks', '2c', '3d']);
    expect(result.description).toMatch(/^Three of a Kind, \w+$/);
  });

  test('One Pair description format: "One Pair, X"', () => {
    const result = evaluate(['Jh', 'Jd'], ['As', 'Ks', 'Qs', '2h', '3d']);
    expect(result.description).toMatch(/^One Pair, \w+$/);
  });
});
