'use strict';
const { norm } = require('./util');

/**
 * Bet sizing classification tags — fired per action.
 * Uses sizingRatio = amount / pot_at_action (attached by buildAnalyzerContext).
 * Only fires on bet and raise actions with a valid (non-null) sizingRatio.
 *
 * Buckets (agreed in planning):
 *   < 0.25        PROBE_BET
 *   0.25 – 0.49   THIRD_POT_BET
 *   0.50 – 0.79   HALF_POT_BET
 *   0.80 – 1.10   POT_BET
 *   1.10 – 2.00   OVERBET
 *   > 2.00        OVERBET_JAM
 */
function classifySizing(ratio) {
  if (ratio < 0.25)  return 'PROBE_BET';
  if (ratio < 0.50)  return 'THIRD_POT_BET';
  if (ratio < 0.80)  return 'HALF_POT_BET';
  if (ratio <= 1.10) return 'POT_BET';
  if (ratio <= 2.00) return 'OVERBET';
  return 'OVERBET_JAM';
}

const SizingAnalyzer = {
  name: 'SizingAnalyzer',
  analyze({ actions }) {
    const results = [];
    for (const a of actions) {
      if (!['bet', 'raise'].includes(norm(a))) continue;
      if (a.sizingRatio === null || a.sizingRatio === undefined) continue;
      results.push({
        tag:        classifySizing(a.sizingRatio),
        tag_type:   'sizing',
        player_id:  a.player_id,
        action_id:  a.id,
      });
    }
    return results;
  },
};

module.exports = { SizingAnalyzer, classifySizing };
