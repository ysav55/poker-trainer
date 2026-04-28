'use strict';

/**
 * EquityService.js
 *
 * Computes win-probability (equity %) for each active player given their
 * hole cards and the current board state.
 *
 * computeEquity(players, board) → [{ playerId, equity, tieEquity }]
 *
 * Pure computation — no side effects, no DB access.
 * Uses poker-odds-calculator (rundef/node-poker-odds-calculator).
 */

const { OddsCalculator, CardGroup, Card } = require('poker-odds-calculator');

/**
 * Convert a card string in our format ('As', 'Td', '9c') to a Card object.
 * Our format: rank = card[0], suit = card[1].
 */
function toCard(cardStr) {
  return new Card(cardStr[0], cardStr[1]);
}

/**
 * computeEquity(players, board)
 *
 * @param {Array<{ id: string, holeCards: string[] }>} players
 *   Active (non-folded) players with 2 hole cards each.
 *   `id` should be the player's stableId for result mapping.
 * @param {string[]} board
 *   0, 3, 4, or 5 card strings representing the revealed community cards.
 *
 * @returns {Array<{ playerId: string, equity: number, tieEquity: number }>}
 *   Equity as a percentage (0–100). Integers from the library.
 *   Returns [] if fewer than 2 valid players, or on any error.
 */
function computeEquity(players, board = []) {
  // Filter to players with exactly 2 hole cards
  const valid = players.filter(p => Array.isArray(p.holeCards) && p.holeCards.length === 2);
  if (valid.length < 2) return [];

  try {
    const cardGroups = valid.map(p =>
      CardGroup.fromString(p.holeCards[0] + p.holeCards[1])
    );

    const boardCards = board.length > 0
      ? board.map(toCard)
      : undefined;

    const result = OddsCalculator.calculate(cardGroups, boardCards);

    return valid.map((p, i) => ({
      playerId:  p.id,
      equity:    result.equities[i].getEquity(),
      tieEquity: result.equities[i].getTiePercentage(),
    }));
  } catch (err) {
    // Non-fatal: invalid card strings, duplicate cards, etc.
    return [];
  }
}

/**
 * buildEquityPlayers(gameState, stableIdMap)
 *
 * Extracts the active players with hole cards from a GameManager public/internal
 * state object, mapping socketId → stableId via stableIdMap.
 *
 * Used by socket handlers to build the `players` arg for computeEquity.
 *
 * @param {object} state  Raw GameManager state (state.players array)
 * @param {Map}    stableIdMap  socketId → stableId
 * @returns {Array<{ id: string, holeCards: string[] }>}
 */
function buildEquityPlayers(state, stableIdMap) {
  if (!state?.players) return [];
  return state.players
    .filter(p =>
      p.in_hand !== false &&
      !p.is_observer &&
      Array.isArray(p.hole_cards) &&
      p.hole_cards.length === 2 &&
      p.action !== 'folded'
    )
    .map(p => ({
      id:        stableIdMap.get(p.id) || p.stableId || p.id,
      holeCards: p.hole_cards,
    }));
}

module.exports = { computeEquity, buildEquityPlayers };
