'use strict';
const { norm, findLastAggressorIndex } = require('./util');
const { HAND_RANKS } = require('../HandEvaluator');

/**
 * Hand-strength tags — outcome-aware, requires hole cards in DB.
 * Uses ctx.evaluateAt(playerId, street) → HandResult | null.
 * All tags include player_id. Skips gracefully when evaluateAt returns null.
 *
 * Strength tiers (from HAND_RANKS in HandEvaluator):
 *   ONE_PAIR  (1) — marginal
 *   TWO_PAIR  (2) — strong
 *   THREE_OF_A_KIND (3) — monster threshold (set or better)
 */

const HandStrengthAnalyzer = {
  name: 'HandStrengthAnalyzer',
  analyze({ hand, byStreet, seated, evaluateAt }) {
    const results = [];

    // ── SLOWPLAY: had a monster on flop or turn, never bet or raised that street ──
    for (const street of ['flop', 'turn']) {
      const streetActions = byStreet[street] || [];
      if (streetActions.length === 0) continue;

      const actingPlayers = new Set(streetActions.map(a => a.player_id));
      for (const playerId of actingPlayers) {
        const result = evaluateAt(playerId, street);
        if (!result || result.rank < HAND_RANKS.THREE_OF_A_KIND) continue;
        const playerStreetActions = streetActions.filter(a => a.player_id === playerId);
        const everAggressed = playerStreetActions.some(a => ['bet', 'raise'].includes(norm(a)));
        if (!everAggressed)
          results.push({ tag: 'SLOWPLAY', tag_type: 'auto', player_id: playerId });
      }
    }

    // ── HERO_CALL: called river bet with pair or worse ──────────────────────
    {
      const riverActions = byStreet['river'] || [];
      if (hand.phase_ended === 'showdown' && riverActions.length > 0) {
        const lastBetIdx = findLastAggressorIndex(riverActions);
        if (lastBetIdx >= 0) {
          const callsAfterBet = riverActions.slice(lastBetIdx + 1).filter(a => norm(a) === 'call');
          for (const call of callsAfterBet) {
            const result = evaluateAt(call.player_id, 'river');
            if (result && result.rank <= HAND_RANKS.ONE_PAIR)
              results.push({ tag: 'HERO_CALL', tag_type: 'auto', player_id: call.player_id, action_id: call.id });
          }
        }
      }
    }

    // ── VALUE_MISSED: had strong hand on every postflop street, never bet/raised ──
    {
      const postflopStreets = ['flop', 'turn', 'river'].filter(s => (byStreet[s] || []).length > 0);
      if (postflopStreets.length > 0) {
        const flopPlayers = new Set((byStreet['flop'] || []).map(a => a.player_id));
        for (const playerId of flopPlayers) {
          let strongEveryStreet = true;
          let everAggressed     = false;
          for (const street of postflopStreets) {
            const result = evaluateAt(playerId, street);
            if (!result || result.rank < HAND_RANKS.TWO_PAIR) { strongEveryStreet = false; break; }
            const playerActs = (byStreet[street] || []).filter(a => a.player_id === playerId);
            if (playerActs.some(a => ['bet', 'raise'].includes(norm(a)))) everAggressed = true;
          }
          if (strongEveryStreet && !everAggressed)
            results.push({ tag: 'VALUE_MISSED', tag_type: 'auto', player_id: playerId });
        }
      }
    }

    // ── THIN_VALUE_RAISE: raised on river with exactly one pair ────────────
    {
      const riverActions = byStreet['river'] || [];
      for (const a of riverActions) {
        if (norm(a) !== 'raise') continue;
        const result = evaluateAt(a.player_id, 'river');
        if (result && result.rank === HAND_RANKS.ONE_PAIR)
          results.push({ tag: 'THIN_VALUE_RAISE', tag_type: 'auto', player_id: a.player_id, action_id: a.id });
      }
    }

    return results;
  },
};

module.exports = HandStrengthAnalyzer;
