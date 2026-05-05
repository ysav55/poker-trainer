'use strict';

/**
 * RegressionDetector
 *
 * Fires when any core stat drifts more than `z_threshold` standard deviations
 * from the player's 30-day baseline.
 *
 * Severity: abs(z_score) / 4  (capped at 1.0)
 *
 * Standard deviation is approximated as max(stat_mean * 0.20, 0.02) since
 * student_baselines does not yet store per-stat variance.  This will be
 * revisited once BaselineService stores stddev columns.
 *
 * Inputs:
 *   student     — { id }
 *   weeklyStats — weekly student_baselines row  (or null)
 *   baseline    — rolling_30d student_baselines row (or null)
 *   config      — { stat_regression: { z_threshold: 2.0 } }
 */

const DEFAULT_Z_THRESHOLD = 2.0;
const CORE_STATS = ['vpip', 'pfr', 'three_bet_pct', 'aggression'];

// Interpretation labels for UI.
const STAT_DIRECTIONS = {
  vpip:          { up: 'loosening',       down: 'tightening' },
  pfr:           { up: 'more aggressive', down: 'more passive' },
  three_bet_pct: { up: 'more 3bets',      down: 'fewer 3bets' },
  aggression:    { up: 'more aggressive', down: 'less aggressive' },
};

function check(student, weeklyStats, baseline, config) {
  const zThreshold = config?.stat_regression?.z_threshold ?? DEFAULT_Z_THRESHOLD;

  if (!baseline || !weeklyStats) return null;

  const regressions = [];

  for (const stat of CORE_STATS) {
    const current = Number(weeklyStats[stat] ?? NaN);
    const mean    = Number(baseline[stat]    ?? NaN);

    if (isNaN(current) || isNaN(mean) || mean === 0) continue;

    // Approximate stddev: 20% of mean, minimum 0.02 (2 percentage points).
    const stddev = Math.max(mean * 0.20, 0.02);
    const zScore = (current - mean) / stddev;

    if (Math.abs(zScore) < zThreshold) continue;

    const direction = zScore > 0 ? 'up' : 'down';
    const severity  = Math.min(
      parseFloat((Math.abs(zScore) / 4).toFixed(2)),
      1.0
    );
    const interpretation = STAT_DIRECTIONS[stat]?.[direction] ?? direction;

    regressions.push({ stat, current, baseline: mean, z_score: parseFloat(zScore.toFixed(2)), direction, interpretation, severity });
  }

  if (regressions.length === 0) return null;

  regressions.sort((a, b) => b.severity - a.severity);
  const topSeverity = regressions[0].severity;

  return {
    alert_type: 'stat_regression',
    severity:   topSeverity,
    data:       { regressions },
  };
}

module.exports = { check };
