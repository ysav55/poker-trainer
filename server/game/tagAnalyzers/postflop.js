'use strict';
const { norm, findLastPFRaiser, findLastAggressorIndex } = require('./util');

/** Postflop action pattern tags. */
const PostflopAnalyzer = {
  name: 'PostflopAnalyzer',
  analyze({ hand, byStreet }) {
    const results      = [];
    const pre          = byStreet['preflop'] || [];
    const flopActions  = byStreet['flop']    || [];
    const riverActions = byStreet['river']   || [];

    // C_BET: last preflop raiser is first to bet/raise on the flop.
    // In multiway pots, earlier checks by other players don't change this —
    // the PF raiser's first bet is a C-bet regardless of position in the betting order.
    if (flopActions.length > 0) {
      const lastPFRaiser = findLastPFRaiser(pre);
      if (lastPFRaiser) {
        const firstFlopAgg = flopActions.find(a => ['raise', 'bet'].includes(norm(a)));
        if (firstFlopAgg && firstFlopAgg.player_id === lastPFRaiser.player_id)
          results.push({ tag: 'C_BET', tag_type: 'auto' });
      }
    }

    // CHECK_RAISE: player checks then raises on any street
    outer: for (const street of ['preflop', 'flop', 'turn', 'river']) {
      const checkedPlayers = new Set();
      for (const a of (byStreet[street] || [])) {
        if (norm(a) === 'check') checkedPlayers.add(a.player_id);
        else if (norm(a) === 'raise' && checkedPlayers.has(a.player_id)) {
          results.push({ tag: 'CHECK_RAISE', tag_type: 'auto' });
          break outer;
        }
      }
    }

    // BLUFF_CATCH: caller of the last river bet wins at showdown.
    if (riverActions.length > 0 && hand.phase_ended === 'showdown') {
      const lastBetIdx = findLastAggressorIndex(riverActions);
      if (lastBetIdx >= 0) {
        const callerAfterBet = riverActions.slice(lastBetIdx + 1).find(a => norm(a) === 'call');
        if (callerAfterBet && callerAfterBet.player_id === hand.winner_id)
          results.push({ tag: 'BLUFF_CATCH', tag_type: 'auto' });
      }
    }

    // DONK_BET: non-preflop-raiser bets first on the flop
    if (flopActions.length > 0) {
      const lastPFRaiser = findLastPFRaiser(pre);
      if (lastPFRaiser) {
        const firstFlopBet = flopActions.find(a => norm(a) === 'bet');
        if (firstFlopBet && firstFlopBet.player_id !== lastPFRaiser.player_id)
          results.push({ tag: 'DONK_BET', tag_type: 'auto' });
      }
    }

    // RIVER_RAISE
    if (riverActions.some(a => norm(a) === 'raise'))
      results.push({ tag: 'RIVER_RAISE', tag_type: 'auto' });

    return results;
  },
};

module.exports = PostflopAnalyzer;
