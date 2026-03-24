'use strict';

/** Board texture tags. */
const BoardAnalyzer = {
  name: 'BoardAnalyzer',
  analyze({ hand }) {
    const results = [];
    const board   = hand.board || [];

    if (board.length < 3) return results;

    // MONOTONE_BOARD: all three flop cards same suit
    const suits = board.slice(0, 3).map(c => c[1]);
    if (suits[0] === suits[1] && suits[1] === suits[2])
      results.push({ tag: 'MONOTONE_BOARD', tag_type: 'auto' });

    // PAIRED_BOARD: at least two ranks match on the flop
    const ranks = board.slice(0, 3).map(c => c[0]);
    if (ranks[0] === ranks[1] || ranks[1] === ranks[2] || ranks[0] === ranks[2])
      results.push({ tag: 'PAIRED_BOARD', tag_type: 'auto' });

    return results;
  },
};

module.exports = BoardAnalyzer;
