'use strict';
const { norm } = require('./util');

/** Preflop action pattern tags. */
const PreflopAnalyzer = {
  name: 'PreflopAnalyzer',
  analyze({ hand, byStreet, seated, bbPlayerId }) {
    const results = [];
    const pre     = byStreet['preflop'] || [];

    // 3BET_POT / FOUR_BET_POT
    const raiseCount = pre.filter(a => norm(a) === 'raise').length;
    if (raiseCount >= 2) results.push({ tag: '3BET_POT',    tag_type: 'auto' });
    if (raiseCount >= 3) results.push({ tag: 'FOUR_BET_POT', tag_type: 'auto' });

    // SQUEEZE_POT: raise after (raise → call) sequence
    {
      let seenRaise = false, seenCallAfterRaise = false;
      for (const a of pre) {
        if (norm(a) === 'raise' && seenCallAfterRaise) { results.push({ tag: 'SQUEEZE_POT', tag_type: 'auto' }); break; }
        if (norm(a) === 'raise') seenRaise = true;
        if (norm(a) === 'call' && seenRaise) seenCallAfterRaise = true;
      }
    }

    // ALL_IN_PREFLOP
    if (pre.some(a => norm(a) === 'all-in')) results.push({ tag: 'ALL_IN_PREFLOP', tag_type: 'auto' });

    // LIMPED_POT: voluntary actions but no raise
    {
      const voluntary = pre.filter(a => ['call', 'raise', 'all-in'].includes(norm(a)));
      if (voluntary.length > 0 && !voluntary.some(a => norm(a) === 'raise'))
        results.push({ tag: 'LIMPED_POT', tag_type: 'auto' });
    }

    // BTN_OPEN: first preflop raise came from the button seat
    {
      const dealerSeat = hand.dealer_seat ?? -1;
      if (dealerSeat >= 0) {
        const btnPlayer = seated.find(p => p.seat === dealerSeat);
        if (btnPlayer) {
          for (const a of pre) {
            if (norm(a) === 'raise') {
              if (a.player_id === btnPlayer.player_id) results.push({ tag: 'BTN_OPEN', tag_type: 'auto' });
              break;
            }
          }
        }
      }
    }

    // BLIND_DEFENSE: BB responded to a raise with call or re-raise
    if (bbPlayerId) {
      let seenRaise = false;
      for (const a of pre) {
        if (norm(a) === 'raise') seenRaise = true;
        if (seenRaise && a.player_id === bbPlayerId && ['call', 'raise'].includes(norm(a))) {
          results.push({ tag: 'BLIND_DEFENSE', tag_type: 'auto' });
          break;
        }
      }
    }

    return results;
  },
};

module.exports = PreflopAnalyzer;
