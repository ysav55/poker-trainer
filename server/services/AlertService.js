'use strict';

/**
 * AlertService
 *
 * Generates dashboard alerts for a coach by running 6 detectors across all
 * of their students.
 *
 * generateAlerts(coachId):
 *   1. Fetch all students (player_profiles where is_coach = false)
 *   2. Fetch alert config for this coach
 *   3. For each student: fetch baseline, weekly stats, recent sessions, last activity
 *   4. Run all 6 detectors
 *   5. Filter severity < 0.2  (positive_milestone alerts bypass this filter)
 *   6. Deduplicate: update existing active alert of same type+player instead of inserting new
 *   7. Insert/update alert_instances
 *   8. Return sorted list (severity desc, milestones last)
 *
 * Dependencies:
 *   - POK-41: migration adding alert_instances, alert_config, student_baselines tables
 *   - POK-43: BaselineService that writes rolling_30d rows into student_baselines
 *             (code runs without it but yields no regression/spike alerts)
 */

const supabase = require('../db/supabase');
const InactivityDetector   = require('./detectors/InactivityDetector');
const VolumeDropDetector   = require('./detectors/VolumeDropDetector');
const MistakeSpikeDetector = require('./detectors/MistakeSpikeDetector');
const LosingStreakDetector  = require('./detectors/LosingStreakDetector');
const RegressionDetector   = require('./detectors/RegressionDetector');
const MilestoneDetector    = require('./detectors/MilestoneDetector');

const SEVERITY_FLOOR = 0.2;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate (and persist) alerts for all students of a given coach.
 * Returns the updated list of active alerts sorted by severity descending.
 */
async function generateAlerts(coachId) {
  const [students, config] = await Promise.all([
    _fetchStudents(coachId),
    _fetchConfig(coachId),
  ]);

  if (!students.length) return [];

  const perStudentAlerts = await Promise.allSettled(
    students.map(s => _runDetectorsForStudent(s, config))
  );

  const allAlerts = [];
  for (let i = 0; i < perStudentAlerts.length; i++) {
    const result = perStudentAlerts[i];
    if (result.status !== 'fulfilled' || !result.value) continue;
    for (const alert of result.value) {
      allAlerts.push({ ...alert, player_id: students[i].id });
    }
  }

  // Apply severity filter (milestones exempt).
  const filtered = allAlerts.filter(
    a => a.alert_type === 'positive_milestone' || a.severity >= SEVERITY_FLOOR
  );

  // Persist and return.
  if (filtered.length > 0) {
    await _upsertAlerts(coachId, filtered);
  }

  return _fetchActiveAlerts(coachId);
}

// ─── Private helpers ──────────────────────────────────────────────────────────

async function _fetchStudents(coachId) {
  // Find players with a student role. Replaces the deprecated is_coach=false filter
  // (player_profiles.is_coach was removed in migration 043).
  const { data: roleRows } = await supabase
    .from('player_roles')
    .select('player_id, roles!inner(name)')
    .in('roles.name', ['coached_student', 'solo_student', 'trial', 'player']);

  if (!roleRows || roleRows.length === 0) return [];
  const studentIds = [...new Set(roleRows.map(r => r.player_id))];

  const { data, error } = await supabase
    .from('player_profiles')
    .select('id, display_name, last_seen')
    .in('id', studentIds)
    .eq('coach_id', coachId)  // Scope to only this coach's students
    .eq('is_bot', false); // Exclude bot players — alerts are for human students only

  if (error || !data) return [];
  return data;
}

async function _fetchConfig(coachId) {
  const { data } = await supabase
    .from('alert_config')
    .select('alert_type, enabled, threshold')
    .eq('coach_id', coachId);

  // Build a config map: { alert_type: { enabled, ...threshold } }
  const config = {};
  for (const row of data ?? []) {
    if (!row.enabled) {
      config[row.alert_type] = null; // disabled
    } else {
      config[row.alert_type] = row.threshold ?? {};
    }
  }
  return config;
}

async function _runDetectorsForStudent(student, config) {
  // Fetch all data needed by detectors in parallel.
  const [baseline, weeklyBaseline, prevBaseline, recentSessions, leaderboardRow] =
    await Promise.all([
      _fetchBaseline(student.id, 'rolling_30d'),
      _fetchBaseline(student.id, 'weekly'),
      _fetchPrevBaseline(student.id),
      _fetchRecentSessions(student.id),
      _fetchLeaderboard(student.id),
    ]);

  const studentWithActivity = {
    ...student,
    last_hand_at: leaderboardRow?.last_hand_at ?? null,
  };

  const weeklyTags  = weeklyBaseline?.tag_profile ?? null;
  const weeklyHands = weeklyBaseline?.hands_played ?? 0;

  const results = [];

  // Run each detector; skip disabled types.
  const detectors = [
    () => config?.inactivity === null
      ? null
      : InactivityDetector.check(studentWithActivity, config),

    () => config?.volume_drop === null
      ? null
      : VolumeDropDetector.check(student, weeklyBaseline, baseline, config),

    () => config?.mistake_spike === null
      ? null
      : MistakeSpikeDetector.check(student, weeklyTags, weeklyHands, baseline, config),

    () => config?.losing_streak === null
      ? null
      : LosingStreakDetector.check(student, recentSessions, config),

    () => config?.stat_regression === null
      ? null
      : RegressionDetector.check(student, weeklyBaseline, baseline, config),

    () => config?.positive_milestone === null
      ? null
      : MilestoneDetector.check(student, weeklyBaseline, baseline, prevBaseline, recentSessions),
  ];

  for (const fn of detectors) {
    try {
      const result = fn();
      if (result) results.push(result);
    } catch (_) {
      // Individual detector failures should never break the whole pipeline.
    }
  }

  return results;
}

async function _fetchBaseline(playerId, periodType) {
  const { data } = await supabase
    .from('student_baselines')
    .select('*')
    .eq('player_id', playerId)
    .eq('period_type', periodType)
    .order('computed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

async function _fetchPrevBaseline(playerId) {
  const { data } = await supabase
    .from('student_baselines')
    .select('*')
    .eq('player_id', playerId)
    .eq('period_type', 'rolling_30d')
    .order('computed_at', { ascending: false })
    .range(1, 1);
  return data?.[0] ?? null;
}

async function _fetchRecentSessions(playerId) {
  const { data } = await supabase
    .from('session_player_stats')
    .select('session_id, net_chips, sessions(ended_at)')
    .eq('player_id', playerId)
    .order('sessions(ended_at)', { ascending: false })
    .limit(10);

  if (!data) return [];
  return data.map(r => ({
    session_id: r.session_id,
    net_chips:  r.net_chips,
    ended_at:   r.sessions?.ended_at ?? null,
  }));
}

async function _fetchLeaderboard(playerId) {
  const { data } = await supabase
    .from('leaderboard')
    .select('last_hand_at, net_chips, total_hands')
    .eq('player_id', playerId)
    .maybeSingle();
  return data ?? null;
}

async function _upsertAlerts(coachId, alerts) {
  // Fetch existing active alerts for this coach to enable dedup.
  const { data: existing } = await supabase
    .from('alert_instances')
    .select('id, player_id, alert_type')
    .eq('coach_id', coachId)
    .eq('status', 'active');

  const existingMap = new Map(
    (existing ?? []).map(r => [`${r.player_id}:${r.alert_type}`, r.id])
  );

  const inserts = [];
  const updates = [];

  for (const alert of alerts) {
    const key        = `${alert.player_id}:${alert.alert_type}`;
    const existingId = existingMap.get(key);

    if (existingId) {
      updates.push({ id: existingId, severity: alert.severity, data: alert.data });
    } else {
      inserts.push({
        coach_id:   coachId,
        player_id:  alert.player_id,
        alert_type: alert.alert_type,
        severity:   alert.severity,
        data:       alert.data,
        status:     'active',
      });
    }
  }

  await Promise.all([
    inserts.length > 0
      ? supabase.from('alert_instances').insert(inserts)
      : Promise.resolve(),
    ...updates.map(u =>
      supabase.from('alert_instances').update({ severity: u.severity, data: u.data }).eq('id', u.id)
    ),
  ]);
}

async function _fetchActiveAlerts(coachId) {
  const { data } = await supabase
    .from('alert_instances')
    .select('id, player_id, alert_type, severity, data, created_at, status')
    .eq('coach_id', coachId)
    .eq('status', 'active')
    .order('severity', { ascending: false });

  return data ?? [];
}

module.exports = { generateAlerts };
