'use strict';

const { computeEquity } = require('../EquityService');
const { norm }          = require('./util');

/**
 * EquityAnalyzer — equity-based hand tags.
 *
 * Tags:
 *   DREW_THIN     — Called a street bet with own equity < 25% (mistake)
 *   VALUE_BACKED  — Bet or raised with own equity > 70% (info — confirms a good spot)
 *   EQUITY_BLUFF  — Bet/raised with equity < 30%, got called (bluff-calling situation)
 *   EQUITY_FOLD   — Folded with equity > 50% (mistake — ahead but gave up)
 *
 * Equity is computed once per street and memoized.
 * Requires at least 2 players with recorded hole cards.
 */

function boardForStreet(board, street) {
  const len = { preflop: 0, flop: 3, turn: 4, river: 5 }[street] ?? 0;
  return board.slice(0, len);
}

const EquityAnalyzer = {
  name: 'EquityAnalyzer',

  analyze({ hand, byStreet, seated, holeCardsByPlayer }) {
    const board = hand.board || [];
    const results = [];

    // Build player list for equity computation — only non-coach players with hole cards
    const eligiblePlayers = seated
      .filter(p => !p.is_coach && Array.isArray(holeCardsByPlayer[p.player_id]) && holeCardsByPlayer[p.player_id].length === 2)
      .map(p => ({ id: p.player_id, holeCards: holeCardsByPlayer[p.player_id] }));

    if (eligiblePlayers.length < 2) return results;

    // Memoize equity per street
    const equityMemo = new Map();
    function getEquityAt(street) {
      if (equityMemo.has(street)) return equityMemo.get(street);
      const equities = computeEquity(eligiblePlayers, boardForStreet(board, street));
      const map = new Map(equities.map(e => [e.playerId, e.equity]));
      equityMemo.set(street, map);
      return map;
    }

    const STREETS = ['preflop', 'flop', 'turn', 'river'];

    for (const street of STREETS) {
      const actions = byStreet[street] || [];
      if (actions.length === 0) continue;

      // Find the last aggressor on this street to identify callers after it
      const lastBetIdx = (() => {
        for (let i = actions.length - 1; i >= 0; i--) {
          if (['bet', 'raise'].includes(norm(actions[i]))) return i;
        }
        return -1;
      })();

      const equityMap = getEquityAt(street);

      for (const action of actions) {
        const { player_id, id: action_id } = action;
        const equity = equityMap.get(player_id);
        if (equity == null) continue;
        const normalized = norm(action);

        // DREW_THIN — called a bet with < 25% equity
        if (normalized === 'call' && equity < 25) {
          results.push({ tag: 'DREW_THIN', tag_type: 'mistake', player_id, action_id });
        }

        // VALUE_BACKED — bet or raised with > 70% equity
        if (['bet', 'raise'].includes(normalized) && equity > 70) {
          results.push({ tag: 'VALUE_BACKED', tag_type: 'auto', player_id, action_id });
        }

        // EQUITY_BLUFF — bet/raised with < 30% equity, but no fold from opponents (they called)
        if (['bet', 'raise'].includes(normalized) && equity < 30) {
          const actionIdx = actions.indexOf(action);
          const hasCallAfter = actions.slice(actionIdx + 1).some(a => norm(a) === 'call');
          if (hasCallAfter) {
            results.push({ tag: 'EQUITY_BLUFF', tag_type: 'auto', player_id, action_id });
          }
        }

        // EQUITY_FOLD — folded with > 50% equity (was ahead, gave up)
        if (['fold', 'folded'].includes(normalized) && equity > 50) {
          results.push({ tag: 'EQUITY_FOLD', tag_type: 'mistake', player_id, action_id });
        }
      }
    }

    return results;
  },
};

module.exports = EquityAnalyzer;
