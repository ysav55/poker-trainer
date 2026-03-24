'use strict';
const { norm } = require('./util');

/** Tags describing which streets were reached and how the hand ended. */
const StreetAnalyzer = {
  name: 'StreetAnalyzer',
  analyze({ hand, byStreet }) {
    const results = [];
    const board   = hand.board || [];
    const pre     = byStreet['preflop'] || [];

    // WALK: BB wins uncontested — everyone else folded, no board dealt
    if (pre.length > 0 && board.length === 0) {
      const raises = pre.filter(a => norm(a) === 'raise');
      const folds  = pre.filter(a => norm(a) === 'fold');
      if (raises.length === 0 && folds.length > 0 && folds.length >= pre.length - 1)
        results.push({ tag: 'WALK', tag_type: 'auto' });
    }

    if (board.length >= 3) results.push({ tag: 'SAW_FLOP',  tag_type: 'auto' });
    if (board.length >= 4) results.push({ tag: 'SAW_TURN',  tag_type: 'auto' });
    if (board.length >= 5) results.push({ tag: 'SAW_RIVER', tag_type: 'auto' });
    if (hand.phase_ended === 'showdown') results.push({ tag: 'WENT_TO_SHOWDOWN', tag_type: 'auto' });

    return results;
  },
};

module.exports = StreetAnalyzer;
