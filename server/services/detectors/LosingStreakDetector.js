'use strict';

/**
 * LosingStreakDetector
 *
 * Fires when a student has negative net chips in N consecutive sessions
 * (configurable, default N=3).
 *
 * Severity: streak_length / streak_length_threshold  (capped at 1.0)
 *
 * Inputs:
 *   student        — { id }
 *   recentSessions — array of { session_id, ended_at, net_chips }, ordered
 *                    most-recent-first.
 *   config         — { losing_streak: { streak_length: 3 } }
 */

const DEFAULT_STREAK_LENGTH = 3;

function check(student, recentSessions, config) {
  const streakThreshold = config?.losing_streak?.streak_length ?? DEFAULT_STREAK_LENGTH;

  if (!recentSessions || recentSessions.length < streakThreshold) return null;

  let streak = 0;
  const streakSessions = [];

  for (const session of recentSessions) {
    const net = Number(session.net_chips ?? 0);
    if (net < 0) {
      streak++;
      streakSessions.push(session);
    } else {
      break;
    }
  }

  if (streak < streakThreshold) return null;

  const severity    = Math.min(parseFloat((streak / streakThreshold).toFixed(2)), 1.0);
  const totalLoss   = streakSessions.reduce((sum, s) => sum + Number(s.net_chips ?? 0), 0);

  return {
    alert_type: 'losing_streak',
    severity,
    data: {
      streak_sessions: streak,
      total_loss:      totalLoss,
      session_results: streakSessions.map(s => ({
        session_id: s.session_id,
        date:       s.ended_at,
        net:        Number(s.net_chips ?? 0),
      })),
    },
  };
}

module.exports = { check };
