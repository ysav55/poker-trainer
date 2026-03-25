'use strict';
const { norm, findLastPFRaiser, findNthRaiser } = require('./util');
const { isInPosition } = require('../positions');

/**
 * Position-qualified action tags.
 * Requires ctx.positions (built by buildAnalyzerContext via positions.js).
 * All tags include player_id.
 */
const PositionalAnalyzer = {
  name: 'PositionalAnalyzer',
  analyze({ hand, byStreet, seated, positions }) {
    const results      = [];
    const pre          = byStreet['preflop'] || [];
    const flopActions  = byStreet['flop']    || [];
    const dealerSeat   = hand.dealer_seat ?? -1;

    // C_BET_IP / C_BET_OOP: C-bet with/without positional advantage
    if (flopActions.length > 0) {
      const lastPFRaiser = findLastPFRaiser(pre);
      if (lastPFRaiser) {
        const firstFlopAgg = flopActions.find(a => ['raise', 'bet'].includes(norm(a)));
        if (firstFlopAgg && firstFlopAgg.player_id === lastPFRaiser.player_id) {
          const target = flopActions.find(
            a => a.player_id !== lastPFRaiser.player_id && norm(a) !== 'fold'
          );
          if (target) {
            const ip = isInPosition(seated, dealerSeat, lastPFRaiser.player_id, target.player_id);
            results.push({
              tag:       ip ? 'C_BET_IP' : 'C_BET_OOP',
              tag_type:  'auto',
              player_id: lastPFRaiser.player_id,
            });
          }
        }
      }
    }

    // DONK_BET_BB: donk bet specifically from BB position
    if (flopActions.length > 0) {
      const lastPFRaiser = findLastPFRaiser(pre);
      if (lastPFRaiser) {
        const firstFlopBet = flopActions.find(a => norm(a) === 'bet');
        if (firstFlopBet && firstFlopBet.player_id !== lastPFRaiser.player_id) {
          if (positions[firstFlopBet.player_id] === 'BB')
            results.push({ tag: 'DONK_BET_BB', tag_type: 'auto', player_id: firstFlopBet.player_id });
        }
      }
    }

    // 3BET_BTN / 3BET_SB: 3-bet from button or small blind
    {
      const threeBettor = findNthRaiser(pre, 2);
      if (threeBettor) {
        const pos = positions[threeBettor.player_id];
        if (pos === 'BTN') results.push({ tag: '3BET_BTN', tag_type: 'auto', player_id: threeBettor.player_id });
        if (pos === 'SB')  results.push({ tag: '3BET_SB',  tag_type: 'auto', player_id: threeBettor.player_id });
      }
    }

    // SQUEEZE_CO: squeeze (raise after raise+call) from CO position
    {
      let seenRaise = false, seenCallAfterRaise = false;
      for (const a of pre) {
        if (norm(a) === 'raise' && seenCallAfterRaise) {
          if (positions[a.player_id] === 'CO')
            results.push({ tag: 'SQUEEZE_CO', tag_type: 'auto', player_id: a.player_id });
          break;
        }
        if (norm(a) === 'raise') seenRaise = true;
        if (norm(a) === 'call' && seenRaise) seenCallAfterRaise = true;
      }
    }

    return results;
  },
};

module.exports = PositionalAnalyzer;
