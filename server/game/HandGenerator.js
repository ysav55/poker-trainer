/**
 * HandGenerator.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Implements the "Fill-the-Gaps" algorithm for hybrid hand generation.
 *
 * HandConfiguration schema — accepts both snake_case (from the Socket API) and
 * camelCase (legacy internal form):
 *
 *   {
 *     hole_cards | holeCards: {
 *       [playerId]: [card | null, card | null]  // null = fill randomly
 *     },
 *     board: [card | null, card | null, card | null, card | null, card | null]
 *             // indices 0-2 = flop, 3 = turn, 4 = river; null = fill randomly
 *   }
 *
 * generateHand(config, players, _deck?) returns one of:
 *   { hand: { playerCards, board, deck } }  — success
 *   { error: string }                       — validation failure
 *
 *   where:
 *     playerCards: { [playerId]: [card, card] }
 *     board:       string[]   — 5-card board
 *     deck:        string[]   — remaining shuffled cards after draw
 *
 * players may be an array of player objects ({ id, ... }) OR plain string IDs.
 * An optional third argument (_deck) is accepted for API compatibility but ignored.
 */

'use strict';

const { createDeck, shuffleDeck, isValidCard } = require('./Deck');

/**
 * generateHand
 *
 * @param {Object|null} config   - HandConfiguration (see schema above).
 *                                 If null/undefined, treats every slot as null (full RNG).
 * @param {Array} players        - Player objects ({ id, … }) or plain string IDs.
 * @param {Array} [_deck]        - Ignored; accepted for API compatibility.
 * @returns {{ hand: { playerCards, board, deck } } | { error: string }}
 */
function generateHand(config, players, _deck) {
  // Normalise players: accept string IDs or player objects
  const normPlayers = (players || []).map(p =>
    typeof p === 'string' ? { id: p } : p
  );

  // Normalise config: accept both snake_case (hole_cards) and camelCase (holeCards)
  const normConfig = config ? {
    ...config,
    holeCards: config.holeCards || config.hole_cards || {}
  } : null;

  // ── Step 1: Normalise slots ────────────────────────────────────────────────
  const normalised = _normaliseConfig(normConfig, normPlayers);

  // ── Step 2: Collect all explicitly specified (non-null) cards ─────────────
  const specifiedCards = _collectSpecifiedCards(normalised, normPlayers);

  // ── Step 3: Validate each specified card ──────────────────────────────────
  for (const card of specifiedCards) {
    if (!isValidCard(card)) {
      return {
        error:
          `"${card}" is not a valid card. ` +
          `Cards must be a rank (2-9, T, J, Q, K, A) followed by a suit (h, d, c, s).`
      };
    }
  }

  // ── Step 4: Check for duplicates among specified cards ────────────────────
  const seen = new Set();
  for (const card of specifiedCards) {
    if (seen.has(card)) {
      return {
        error:
          `Card "${card}" appears more than once in the hand configuration. ` +
          `Each card can only be assigned to one slot.`
      };
    }
    seen.add(card);
  }

  // ── Step 5: Build a shuffled deck excluding the specified cards ───────────
  const fullDeck = createDeck(); // 52 cards, deterministic order
  const remainingDeck = shuffleDeck(
    fullDeck.filter(card => !seen.has(card))
  );

  let drawIndex = 0;
  function drawCard() {
    if (drawIndex >= remainingDeck.length) {
      return null; // caller checks for nulls below
    }
    return remainingDeck[drawIndex++];
  }

  // ── Step 6: Assign hole cards (null slots → draw) ─────────────────────────
  const playerCards = {};
  for (const player of normPlayers) {
    const configKey = player.stableId || player.id;
    const slots = normalised.holeCards[configKey] ?? normalised.holeCards[player.id] ?? [null, null];
    playerCards[configKey] = [
      slots[0] !== null ? slots[0] : drawCard(),
      slots[1] !== null ? slots[1] : drawCard(),
    ];
  }

  // ── Step 7: Assign board cards (null slots → draw) ────────────────────────
  const board = normalised.board.map(slot =>
    slot !== null ? slot : drawCard()
  );

  // Guard: deck exhaustion (should not happen with a valid 52-card scenario)
  const allDealt = Object.values(playerCards).flat().concat(board);
  if (allDealt.includes(null)) {
    return { error: 'Ran out of cards — check that specified cards are correct.' };
  }

  // ── Step 8: Return result ─────────────────────────────────────────────────
  const deck = remainingDeck.slice(drawIndex); // cards not drawn

  // Return flat properties for backward compatibility with existing callers
  // AND a nested `hand` property for the qa_checklist / new-style API.
  return { playerCards, board, deck, hand: { playerCards, board, deck } };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * _normaliseConfig
 * Converts a possibly-null config into a guaranteed-shape object where:
 *   holeCards[playerId] = [card|null, card|null]  for every player
 *   board               = [card|null, …]           with exactly 5 slots
 */
function _normaliseConfig(config, players) {
  const holeCards = {};

  for (const player of players) {
    // Config keys may be stableId (new) or socket id (legacy fallback)
    const configKey = player.stableId || player.id;
    const raw = config && config.holeCards && (config.holeCards[configKey] ?? config.holeCards[player.id]);
    if (Array.isArray(raw) && raw.length === 2) {
      // Treat undefined entries as null
      holeCards[configKey] = [
        raw[0] !== undefined ? raw[0] : null,
        raw[1] !== undefined ? raw[1] : null,
      ];
    } else {
      holeCards[configKey] = [null, null];
    }
  }

  let board;
  if (config && Array.isArray(config.board) && config.board.length === 5) {
    board = config.board.map(slot => (slot !== undefined ? slot : null));
  } else {
    board = [null, null, null, null, null];
  }

  return { holeCards, board };
}

/**
 * _collectSpecifiedCards
 * Returns an array of all non-null cards from the normalised config,
 * preserving the order: hole cards (per player, then board).
 */
function _collectSpecifiedCards(normalised, players) {
  const cards = [];

  for (const player of players) {
    const configKey = player.stableId || player.id;
    const slots = normalised.holeCards[configKey] ?? normalised.holeCards[player.id];
    for (const slot of (slots ?? [])) {
      if (slot !== null) cards.push(slot);
    }
  }

  for (const slot of normalised.board) {
    if (slot !== null) cards.push(slot);
  }

  return cards;
}

module.exports = { generateHand };
