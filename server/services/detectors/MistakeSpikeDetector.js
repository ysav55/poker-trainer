'use strict';

/**
 * MistakeSpikeDetector
 *
 * Fires when any mistake tag frequency this week exceeds `spike_ratio` × the
 * player's 30-day baseline rate.
 *
 * Severity (per tag): (current_rate - baseline_rate) / baseline_rate  (capped at 1.0)
 * The alert severity = max severity across all spiking tags.
 *
 * Inputs:
 *   student     — { id }
 *   weeklyTags  — { [tagName]: count }  (tag_profile from weekly baseline, or null)
 *   weeklyHands — hands_played in the current week (from weekly baseline)
 *   baseline    — rolling_30d student_baselines row  (needs tag_profile, hands_played)
 *   config      — { mistake_spike: { spike_ratio: 1.5 } }
 */

const DEFAULT_SPIKE_RATIO    = 1.5;
const MIN_BASELINE_RATE      = 1.0;   // per-100 hands — ignore very rare tags
const TRACKED_MISTAKE_TAGS   = [
  'OPEN_LIMP', 'OVERLIMP', 'LIMP_RERAISE', 'COLD_CALL_3BET',
  'FOLD_TO_PROBE', 'MIN_RAISE', 'EQUITY_FOLD', 'DREW_THIN', 'UNDO_USED',
];

function check(student, weeklyTags, weeklyHands, baseline, config) {
  const spikeRatio = config?.mistake_spike?.spike_ratio ?? DEFAULT_SPIKE_RATIO;

  const tagProfile   = baseline?.tag_profile ?? {};
  const baselineHands = Number(baseline?.hands_played ?? 0);

  if (baselineHands < 10) return null; // not enough baseline data

  const wHands = Math.max(weeklyHands ?? 0, 1);
  const wTags  = weeklyTags ?? {};

  const spikes = [];

  for (const tag of TRACKED_MISTAKE_TAGS) {
    const currentCount  = wTags[tag] ?? 0;
    const baselineCount = tagProfile[tag] ?? 0;

    const currentRatePer100  = (currentCount  / wHands)       * 100;
    const baselineRatePer100 = (baselineCount / baselineHands) * 100;

    if (baselineRatePer100 < MIN_BASELINE_RATE) continue;
    if (currentRatePer100 < baselineRatePer100 * spikeRatio) continue;

    const ratio    = currentRatePer100 / baselineRatePer100;
    const severity = Math.min(
      parseFloat(((currentRatePer100 - baselineRatePer100) / baselineRatePer100).toFixed(2)),
      1.0
    );

    spikes.push({
      tag,
      current_rate_per_100:  parseFloat(currentRatePer100.toFixed(1)),
      baseline_rate_per_100: parseFloat(baselineRatePer100.toFixed(1)),
      ratio:                 parseFloat(ratio.toFixed(2)),
      severity,
    });
  }

  if (spikes.length === 0) return null;

  spikes.sort((a, b) => b.severity - a.severity);
  const topSeverity = spikes[0].severity;

  return {
    alert_type: 'mistake_spike',
    severity:   topSeverity,
    data:       { spikes },
  };
}

module.exports = { check };
