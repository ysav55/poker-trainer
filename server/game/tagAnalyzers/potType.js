'use strict';
const { norm } = require('./util');

/** Pot characterization tags: size, stack depth, player count. */
const PotTypeAnalyzer = {
  name: 'PotTypeAnalyzer',
  analyze({ hand, actions, byStreet, seated }) {
    const results = [];
    const pre     = byStreet['preflop'] || [];
    const flop    = byStreet['flop']    || [];
    const bb      = hand.big_blind || 20;

    // WHALE_POT: final pot > 150 BB
    if ((hand.final_pot || 0) > 150 * bb)
      results.push({ tag: 'WHALE_POT', tag_type: 'auto' });

    // MULTIWAY: 3+ players saw the flop (or preflop if no flop)
    {
      const flopActors = new Set(flop.filter(a => norm(a) !== 'fold').map(a => a.player_id));
      if (flopActors.size >= 3) {
        results.push({ tag: 'MULTIWAY', tag_type: 'auto' });
      } else if (flop.length === 0) {
        const pfActors = new Set(pre.filter(a => norm(a) !== 'fold').map(a => a.player_id));
        if (pfActors.size >= 3) results.push({ tag: 'MULTIWAY', tag_type: 'auto' });
      }
    }

    // SHORT_STACK / DEEP_STACK: any seated player's starting stack
    for (const p of seated) {
      const start = p.stack_start ?? 0;
      if (start < 20  * bb) results.push({ tag: 'SHORT_STACK', tag_type: 'auto' });
      if (start > 100 * bb) results.push({ tag: 'DEEP_STACK',  tag_type: 'auto' });
      // Deduplicate early once both have fired
      const tags = new Set(results.map(r => r.tag));
      if (tags.has('SHORT_STACK') && tags.has('DEEP_STACK')) break;
    }

    // OVERBET: any bet/raise > 2× pot at the moment of the action
    for (const a of actions) {
      if (['bet', 'raise'].includes(norm(a)) && a.amount > 0 && a.pot_at_action > 0) {
        if (a.amount > 2 * a.pot_at_action) {
          results.push({ tag: 'OVERBET', tag_type: 'auto' });
          break;
        }
      }
    }

    return results;
  },
};

module.exports = PotTypeAnalyzer;
