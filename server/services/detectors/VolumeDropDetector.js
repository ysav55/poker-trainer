'use strict';

/**
 * VolumeDropDetector
 *
 * Fires when a student's hands this week fall below `drop_pct` of their
 * rolling 4-week average.
 *
 * Severity: 1 - (this_week / avg_weekly)  (capped at 1.0)
 *
 * Inputs:
 *   student     — { id }
 *   weeklyStats — { hands_played }  (from weekly student_baselines row, or null)
 *   baseline    — rolling_30d student_baselines row, or null
 *   config      — { volume_drop: { drop_pct: 0.5 } }
 */

const DEFAULT_DROP_PCT   = 0.5;   // 50% of avg triggers
const MIN_AVG_HANDS      = 5;     // don't alert if baseline avg is tiny

function check(student, weeklyStats, baseline, config) {
  const dropPct = config?.volume_drop?.drop_pct ?? DEFAULT_DROP_PCT;

  const thisWeekHands = weeklyStats?.hands_played ?? 0;

  // 4-week average approximated from rolling_30d (4 weeks in a 30d window).
  const avgWeekly = baseline?.hands_played != null
    ? Number(baseline.hands_played) / 4
    : null;

  if (!avgWeekly || avgWeekly < MIN_AVG_HANDS) return null;
  if (thisWeekHands >= avgWeekly * dropPct) return null;

  const ratio    = thisWeekHands / avgWeekly;
  const severity = Math.min(parseFloat((1 - ratio).toFixed(2)), 1.0);

  return {
    alert_type: 'volume_drop',
    severity,
    data: {
      this_week_hands:  thisWeekHands,
      avg_weekly_hands: Math.round(avgWeekly),
      drop_pct:         parseFloat((1 - ratio).toFixed(2)),
    },
  };
}

module.exports = { check };
