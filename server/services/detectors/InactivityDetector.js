'use strict';

/**
 * InactivityDetector
 *
 * Fires when a student has not played a hand in more than `threshold` days.
 *
 * Severity: days_inactive / threshold_days  (capped at 1.0)
 *
 * Input:
 *   student  — { id, last_hand_at }
 *   config   — { inactivity: { days: 5 } }  (optional — falls back to default)
 */

const DEFAULT_DAYS = 5;

function check(student, config) {
  const threshold = config?.inactivity?.days ?? DEFAULT_DAYS;

  if (!student.last_hand_at) return null;

  const msPerDay = 1000 * 60 * 60 * 24;
  const daysInactive = (Date.now() - new Date(student.last_hand_at).getTime()) / msPerDay;

  if (daysInactive <= threshold) return null;

  const severity = Math.min(parseFloat((daysInactive / threshold).toFixed(2)), 1.0);

  return {
    alert_type: 'inactivity',
    severity,
    data: {
      days_inactive:   Math.floor(daysInactive),
      last_hand_at:    student.last_hand_at,
      threshold_days:  threshold,
    },
  };
}

module.exports = { check };
