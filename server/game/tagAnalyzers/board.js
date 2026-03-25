'use strict';

const { RANKS } = require('../Deck');

const RANK_INDEX = Object.fromEntries(RANKS.map((r, i) => [r, i]));
const BROADWAY   = new Set(['T', 'J', 'Q', 'K', 'A']);

/**
 * Best span of a 3-card flop, considering ace duality (high OR low).
 * Mirrors flopBestSpan in HandGenerator exactly.
 */
function bestSpan(flop) {
  const ranks = flop.map(c => c[0]);
  const idxs  = ranks.map(r => RANK_INDEX[r]).sort((a, b) => a - b);
  const normal = idxs[2] - idxs[0];
  if (!ranks.includes('A')) return normal;
  const low = idxs.map(i => i === 12 ? -1 : i).sort((a, b) => a - b);
  return Math.min(normal, low[2] - low[0]);
}

/**
 * Board texture tags — hand-level, fired from the flop cards (indices 0-2).
 *
 * SUIT    (one):  RAINBOW_BOARD | TWO_TONE_BOARD | MONOTONE_BOARD
 * PAIR    (one):  UNPAIRED_BOARD | PAIRED_BOARD | TRIPS_BOARD
 * CONNECT (one, unpaired only):
 *   CONNECTED_BOARD    span ≤ 2  (e.g. 7-8-9, A-2-3 via ace-low)
 *   ONE_GAP_BOARD      span 3-4  (e.g. 6-7-9, A-2-5 via ace-low)
 *   DISCONNECTED_BOARD span > 4  (e.g. Q-2-3 — pair adjacency is irrelevant)
 * HEIGHT  (one):  ACE_HIGH_BOARD | BROADWAY_BOARD | MID_BOARD | LOW_BOARD
 * COMPOSITE (when applicable): WET_BOARD | DRY_BOARD
 */
const BoardAnalyzer = {
  name: 'BoardAnalyzer',
  analyze({ hand }) {
    const results = [];
    const board   = hand.board || [];
    if (board.length < 3) return results;

    const flop  = board.slice(0, 3);
    const suits  = flop.map(c => c[1]);
    const ranks  = flop.map(c => c[0]);

    // ── SUIT ─────────────────────────────────────────────────────────────────
    const suitUnique = new Set(suits).size;
    const maxSuit = Math.max(
      ...Object.values(suits.reduce((m, s) => { m[s] = (m[s] || 0) + 1; return m; }, {}))
    );
    let suitTag;
    if (suitUnique === 1)    suitTag = 'MONOTONE_BOARD';
    else if (maxSuit === 2)  suitTag = 'TWO_TONE_BOARD';
    else                     suitTag = 'RAINBOW_BOARD';
    results.push({ tag: suitTag, tag_type: 'auto' });

    // ── PAIR ─────────────────────────────────────────────────────────────────
    const rankUnique = new Set(ranks).size;
    let pairTag;
    if (rankUnique === 1)      pairTag = 'TRIPS_BOARD';
    else if (rankUnique === 2) pairTag = 'PAIRED_BOARD';
    else                       pairTag = 'UNPAIRED_BOARD';
    results.push({ tag: pairTag, tag_type: 'auto' });

    // ── CONNECT (unpaired boards only) ────────────────────────────────────────
    let connTag = null;
    if (rankUnique === 3) {
      const span = bestSpan(flop);
      if (span <= 2)      connTag = 'CONNECTED_BOARD';
      else if (span <= 4) connTag = 'ONE_GAP_BOARD';
      else                connTag = 'DISCONNECTED_BOARD';
      results.push({ tag: connTag, tag_type: 'auto' });
    }

    // ── HEIGHT ────────────────────────────────────────────────────────────────
    if (ranks.includes('A')) {
      results.push({ tag: 'ACE_HIGH_BOARD', tag_type: 'auto' });
    } else if (ranks.every(r => BROADWAY.has(r))) {
      results.push({ tag: 'BROADWAY_BOARD', tag_type: 'auto' });
    } else if (ranks.every(r => RANK_INDEX[r] >= 6 && RANK_INDEX[r] <= 9)) {
      results.push({ tag: 'MID_BOARD', tag_type: 'auto' });
    } else if (ranks.every(r => RANK_INDEX[r] <= 7)) {
      results.push({ tag: 'LOW_BOARD', tag_type: 'auto' });
    }

    // ── COMPOSITE ─────────────────────────────────────────────────────────────
    const hasFlushDraw = suitTag === 'TWO_TONE_BOARD' || suitTag === 'MONOTONE_BOARD';
    const hasDraw      = connTag === 'CONNECTED_BOARD' || connTag === 'ONE_GAP_BOARD';

    if (hasFlushDraw && hasDraw) {
      results.push({ tag: 'WET_BOARD', tag_type: 'auto' });
    } else if (suitTag === 'RAINBOW_BOARD' && connTag === 'DISCONNECTED_BOARD') {
      results.push({ tag: 'DRY_BOARD', tag_type: 'auto' });
    }

    return results;
  },
};

module.exports = BoardAnalyzer;
