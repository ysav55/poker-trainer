'use strict';

/**
 * MilestoneDetector
 *
 * Detects positive achievements and surfaces them as informational alerts
 * (severity = 0.0 — informational only, shown in a separate section by the UI).
 *
 * Milestones checked:
 *   1. first_profitable_week  — this week net_chips > 0 AND recent history
 *                               had no profitable week in the previous 3 weeks.
 *   2. stat_improvement_held  — a core stat improved by ≥ 0.03 compared to
 *                               the previous rolling_30d and the trend is
 *                               still improving this week.
 *
 * Inputs:
 *   student        — { id }
 *   weeklyStats    — weekly student_baselines row  (or null)
 *   baseline       — rolling_30d student_baselines row (or null)
 *   prevBaseline   — previous rolling_30d row (or null)
 *   recentSessions — recent sessions array (most-recent-first)
 */

const IMPROVEMENT_THRESHOLD = 0.03; // 3pp shift counts as meaningful improvement
const POSITIVE_STATS        = ['vpip', 'pfr', 'fold_to_cbet']; // lower = better for some
// For these stats, a *decrease* is an improvement.
const LOWER_IS_BETTER = new Set(['vpip', 'open_limp_rate', 'cold_call_3bet_rate', 'overlimp_rate', 'fold_to_probe', 'equity_fold_rate']);

function check(student, weeklyStats, baseline, prevBaseline, recentSessions) {
  const milestones = [];

  // ── Milestone 1: First profitable week ──────────────────────────────────────
  const thisWeekNet = Number(weeklyStats?.net_chips ?? NaN);
  if (!isNaN(thisWeekNet) && thisWeekNet > 0 && recentSessions) {
    // Consider "first" if none of the last 3 prior sessions were profitable weeks.
    // We approximate by checking if the previous 3 weekly sessions are all negative.
    const priorProfitable = recentSessions
      .slice(1, 4)  // skip current week's session(s)
      .some(s => Number(s.net_chips ?? 0) > 0);

    if (!priorProfitable) {
      milestones.push({
        milestone_type: 'first_profitable_week',
        details: {
          net_chips:    thisWeekNet,
          hands_played: weeklyStats?.hands_played ?? null,
        },
      });
    }
  }

  // ── Milestone 2: Stat improvement held 2+ weeks ──────────────────────────────
  if (baseline && prevBaseline && weeklyStats) {
    for (const stat of POSITIVE_STATS) {
      const curr     = Number(baseline[stat]     ?? NaN);
      const prev     = Number(prevBaseline[stat] ?? NaN);
      const weekly   = Number(weeklyStats[stat]  ?? NaN);

      if (isNaN(curr) || isNaN(prev) || isNaN(weekly)) continue;

      const delta = prev - curr;  // positive = decreased
      const isImproving = LOWER_IS_BETTER.has(stat) ? delta > 0 : delta < 0;

      if (!isImproving || Math.abs(delta) < IMPROVEMENT_THRESHOLD) continue;

      // Confirm weekly trend is continuing in the same direction.
      const weeklyDelta    = prev - weekly;
      const weeklyImproving = LOWER_IS_BETTER.has(stat) ? weeklyDelta > 0 : weeklyDelta < 0;

      if (!weeklyImproving) continue;

      milestones.push({
        milestone_type: 'stat_improvement_held',
        details: {
          stat,
          previous_value: parseFloat(prev.toFixed(4)),
          current_value:  parseFloat(curr.toFixed(4)),
          delta:          parseFloat(delta.toFixed(4)),
        },
      });
    }
  }

  if (milestones.length === 0) return null;

  return {
    alert_type: 'positive_milestone',
    severity:   0.0,
    data:       { milestones },
  };
}

module.exports = { check };
