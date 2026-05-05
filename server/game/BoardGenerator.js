'use strict';

/**
 * BoardGenerator.js
 *
 * Pure functions for generating scenario board cards and dealing from ranges.
 * No side effects, no DB calls — fully unit-testable.
 *
 * Spec reference: §2 Board Generation Engine
 */

const { parseRange, pickFromRange } = require('./RangeParser');

const ALL_RANKS  = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const ALL_SUITS  = ['s', 'h', 'd', 'c'];
const RANK_INDEX = Object.fromEntries(ALL_RANKS.map((r, i) => [r, i]));

// Full 52-card deck
const FULL_DECK = ALL_SUITS.flatMap(s => ALL_RANKS.map(r => `${r}${s}`));

/** Build the available deck minus excluded cards. */
function availableDeck(excludedCards = []) {
  const excluded = new Set(excludedCards);
  return FULL_DECK.filter(c => !excluded.has(c));
}

/** Pick N random cards from an array (Fisher-Yates partial shuffle). */
function pickN(pool, n) {
  if (pool.length < n) return null; // not enough cards
  const a = [...pool];
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(Math.random() * (a.length - i));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

// ─────────────────────────────────────────────────────────────────────────────
// Texture generators — each returns [card, card, card] or null on failure
// ─────────────────────────────────────────────────────────────────────────────

function monotone(deck) {
  // All three cards same suit
  const bySuit = {};
  for (const s of ALL_SUITS) {
    bySuit[s] = deck.filter(c => c[c.length - 1] === s);
  }
  const validSuits = ALL_SUITS.filter(s => bySuit[s].length >= 3);
  if (validSuits.length === 0) return null;
  const suit = validSuits[Math.floor(Math.random() * validSuits.length)];
  return pickN(bySuit[suit], 3);
}

function twoTone(deck) {
  // Two cards of one suit, one of another
  const bySuit = {};
  for (const s of ALL_SUITS) bySuit[s] = deck.filter(c => c[c.length - 1] === s);
  const suitsWithTwo = ALL_SUITS.filter(s => bySuit[s].length >= 2);
  const suitsWithOne = ALL_SUITS.filter(s => bySuit[s].length >= 1);
  if (suitsWithTwo.length === 0 || suitsWithOne.length < 2) return null;
  const suitA = suitsWithTwo[Math.floor(Math.random() * suitsWithTwo.length)];
  const otherSuits = suitsWithOne.filter(s => s !== suitA);
  if (otherSuits.length === 0) return null;
  const suitB = otherSuits[Math.floor(Math.random() * otherSuits.length)];
  const twoCards = pickN(bySuit[suitA], 2);
  const oneCard  = pickN(bySuit[suitB], 1);
  return twoCards && oneCard ? [...twoCards, ...oneCard] : null;
}

function rainbow(deck) {
  // Three different suits
  const bySuit = {};
  for (const s of ALL_SUITS) bySuit[s] = deck.filter(c => c[c.length - 1] === s);
  const validSuits = ALL_SUITS.filter(s => bySuit[s].length >= 1);
  if (validSuits.length < 3) return null;
  const suits = pickN(validSuits, 3);
  if (!suits) return null;
  const cards = suits.map(s => pickN(bySuit[s], 1)?.[0]).filter(Boolean);
  return cards.length === 3 ? cards : null;
}

function paired(deck) {
  // Two cards of same rank + one other
  const byRank = {};
  for (const r of ALL_RANKS) byRank[r] = deck.filter(c => c[0] === r);
  const ranksWithPair = ALL_RANKS.filter(r => byRank[r].length >= 2);
  if (ranksWithPair.length === 0) return null;
  const pairRank = ranksWithPair[Math.floor(Math.random() * ranksWithPair.length)];
  const pairCards = pickN(byRank[pairRank], 2);
  if (!pairCards) return null;
  const rest = deck.filter(c => c[0] !== pairRank);
  if (rest.length === 0) return null;
  const kicker = rest[Math.floor(Math.random() * rest.length)];
  return [...pairCards, kicker];
}

function connected(deck) {
  // Three consecutive ranks (e.g. 7-8-9). One card of each from deck.
  // Try all triplets of consecutive ranks, shuffled
  const triplets = [];
  for (let i = 0; i <= ALL_RANKS.length - 3; i++) {
    triplets.push([ALL_RANKS[i], ALL_RANKS[i + 1], ALL_RANKS[i + 2]]);
  }
  // Shuffle so we don't always bias toward low ranks
  for (let i = triplets.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [triplets[i], triplets[j]] = [triplets[j], triplets[i]];
  }
  for (const [r1, r2, r3] of triplets) {
    const pool1 = deck.filter(c => c[0] === r1);
    const pool2 = deck.filter(c => c[0] === r2);
    const pool3 = deck.filter(c => c[0] === r3);
    if (pool1.length && pool2.length && pool3.length) {
      return [
        pool1[Math.floor(Math.random() * pool1.length)],
        pool2[Math.floor(Math.random() * pool2.length)],
        pool3[Math.floor(Math.random() * pool3.length)],
      ];
    }
  }
  return null;
}

function dry(deck) {
  // No pair, rainbow (3 different suits), no straight draw (no two consecutive ranks)
  // Try up to MAX_RETRY times to pick 3 cards matching constraints
  const MAX_RETRY = 200;
  for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
    const cards = pickN(deck, 3);
    if (!cards) return null;
    const ranks = cards.map(c => c[0]);
    const suits = cards.map(c => c[c.length - 1]);
    // No pair
    if (new Set(ranks).size < 3) continue;
    // Rainbow
    if (new Set(suits).size < 3) continue;
    // No straight draw: sort rank indices, ensure no two are within 4 of each other
    const indices = ranks.map(r => RANK_INDEX[r] ?? 0).sort((a, b) => a - b);
    const connected_ = (indices[1] - indices[0] <= 3) || (indices[2] - indices[1] <= 3);
    if (connected_) continue;
    return cards;
  }
  return null;
}

function wet(deck) {
  // At least 2 of: flush draw (2+ same suit), straight draw (2+ connected ranks), paired
  // Strategy: generate and check candidates
  const MAX_RETRY = 200;
  for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
    const cards = pickN(deck, 3);
    if (!cards) return null;
    const ranks = cards.map(c => c[0]);
    const suits = cards.map(c => c[c.length - 1]);

    const hasFlushdraw = suits.filter((s, i, a) => a.indexOf(s) !== i).length > 0 ||
      new Set(suits).size < 3;
    const isPaired = new Set(ranks).size < 3;
    const indices = ranks.map(r => RANK_INDEX[r] ?? 0).sort((a, b) => a - b);
    const hasStraightDraw = (indices[1] - indices[0] <= 3) || (indices[2] - indices[1] <= 3);

    const wetScore = (hasFlushdraw ? 1 : 0) + (hasStraightDraw ? 1 : 0) + (isPaired ? 1 : 0);
    if (wetScore >= 2) return cards;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

const TEXTURE_FNS = { monotone, two_tone: twoTone, rainbow, paired, connected, dry, wet };

/**
 * Generate a 3-card flop matching the given texture.
 * Retries up to 100 times then falls back to 3 random cards from the available deck.
 *
 * @param {string}   texture       - 'monotone'|'two_tone'|'rainbow'|'paired'|'connected'|'dry'|'wet'
 * @param {string[]} excludedCards - cards already assigned (hole cards + pinned turn/river)
 * @returns {string[]} Three card strings, e.g. ['3s','5h','Td']
 */
function generateFlop(texture, excludedCards = []) {
  const deck = availableDeck(excludedCards);
  const generator = TEXTURE_FNS[texture];

  if (!generator) {
    // Unknown texture: random
    return pickN(deck, 3) ?? [];
  }

  const MAX_ATTEMPTS = 100;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const result = generator(deck);
    if (result && result.length === 3) return result;
  }

  // Fallback: any 3 random cards
  return pickN(deck, 3) ?? [];
}

/**
 * Deal two hole cards from a range string, excluding already-used cards.
 *
 * @param {string}   rangeString   - e.g. "AA,KK,AKs"
 * @param {string[]} excludedCards
 * @returns {string[]|null} Two card strings or null if no valid combos remain
 */
function dealFromRange(rangeString, excludedCards = []) {
  const excluded = new Set(excludedCards);
  const allCombos = parseRange(rangeString);
  const eligible = allCombos.filter(([c1, c2]) => !excluded.has(c1) && !excluded.has(c2));
  if (eligible.length === 0) return null;
  const combo = eligible[Math.floor(Math.random() * eligible.length)];
  return combo;
}

/**
 * Full deal configuration for a scenario.
 * Returns { holeCards: Map<seat, [c1,c2]>, flop, turn, river } or throws on conflict.
 *
 * @param {object} scenario - from scenarios table
 * @returns {{ holeCards: object, flop: string[], turn: string|null, river: string|null }}
 */
function buildDealConfig(scenario) {
  const excludedCards = [];
  const holeCards = {};

  // Step 1: Deal hole cards in seat order
  const seatConfigs = Array.isArray(scenario.seat_configs) ? scenario.seat_configs : [];
  for (const seat of seatConfigs) {
    if (seat.cards && Array.isArray(seat.cards) && seat.cards.length === 2) {
      // Fixed mode
      holeCards[seat.seat] = seat.cards;
      excludedCards.push(...seat.cards);
    } else if (seat.range && typeof seat.range === 'string') {
      // Range mode
      const dealt = dealFromRange(seat.range, excludedCards);
      if (!dealt) throw new Error(`No valid cards available for seat ${seat.seat} range "${seat.range}"`);
      holeCards[seat.seat] = dealt;
      excludedCards.push(...dealt);
    }
  }

  // Step 2: Generate board
  let flop = [], turn = null, river = null;

  if (scenario.board_mode === 'specific') {
    if (scenario.board_turn)  excludedCards.push(scenario.board_turn);
    if (scenario.board_river) excludedCards.push(scenario.board_river);
    // Parse flop string "3s5hTd" → ['3s','5h','Td']
    const flopStr = scenario.board_flop || '';
    flop  = flopStr ? [flopStr.slice(0,2), flopStr.slice(2,4), flopStr.slice(4,6)].filter(Boolean) : [];
    turn  = scenario.board_turn  ?? null;
    river = scenario.board_river ?? null;
    if (flop.length < 3) {
      const deck = availableDeck(excludedCards);
      flop = pickN(deck, 3 - flop.length).concat ? flop.concat(pickN(deck, 3 - flop.length) ?? []) : flop;
    }
    if (!turn)  { const d = availableDeck([...excludedCards, ...flop]); turn  = d[Math.floor(Math.random() * d.length)] ?? null; }
    if (!river) { const d = availableDeck([...excludedCards, ...flop, turn].filter(Boolean)); river = d[Math.floor(Math.random() * d.length)] ?? null; }

  } else if (scenario.board_mode === 'texture') {
    if (scenario.texture_turn)  excludedCards.push(scenario.texture_turn);
    if (scenario.texture_river) excludedCards.push(scenario.texture_river);
    flop  = generateFlop(scenario.board_texture, excludedCards);
    turn  = scenario.texture_turn  ?? null;
    river = scenario.texture_river ?? null;
    if (!turn)  { const d = availableDeck([...excludedCards, ...flop]); turn  = d[Math.floor(Math.random() * d.length)] ?? null; }
    if (!river) { const d = availableDeck([...excludedCards, ...flop, turn].filter(Boolean)); river = d[Math.floor(Math.random() * d.length)] ?? null; }

  } else {
    // None — random board
    const deck = availableDeck(excludedCards);
    const board = pickN(deck, 5) ?? [];
    flop  = board.slice(0, 3);
    turn  = board[3] ?? null;
    river = board[4] ?? null;
  }

  return { holeCards, flop, turn, river };
}

module.exports = { generateFlop, dealFromRange, buildDealConfig, availableDeck };
