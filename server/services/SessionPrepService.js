'use strict';

/**
 * SessionPrepService
 *
 * Assembles the session prep brief for a coach before sitting with a student.
 * Returns (and caches) 7 data sections:
 *
 *   1. leaks          — top 3 leaks vs school-wide baseline
 *   2. flagged_hands  — top 5 hands by review value
 *   3. coach_notes    — last 5 player_notes + last-session annotations
 *   4. stats_snapshot — current rolling_30d stats + delta vs previous period
 *   5. session_history— last 5 sessions (date, hands, net_chips, quality_score)
 *   6. active_alerts  — active alert_instances for this student
 *   7. scenario_performance — results of assigned scenarios since last session
 *
 * Caching: stored in `session_prep_briefs` table.
 * Stale threshold: 1 hour, or whenever a new session has ended after the last
 * generation (checked via sessions.ended_at > generated_at).
 *
 * Dependencies (must be deployed before this service is usable):
 *   - POK-41: migration adding student_baselines, alert_instances,
 *             session_prep_briefs tables + quality_score on sessions
 *   - POK-43: BaselineService that writes rolling_30d rows into student_baselines
 */

const supabase        = require('../db/supabase');
const { q }           = require('../db/utils');
const NarratorService = require('../ai/NarratorService');

// Tags that carry negative review weight.
const MISTAKE_TAGS = new Set([
  'DREW_THIN', 'EQUITY_FOLD', 'UNDO_USED', 'OPEN_LIMP', 'OVERLIMP',
  'LIMP_RERAISE', 'COLD_CALL_3BET', 'FOLD_TO_PROBE', 'MIN_RAISE',
]);

// High-value mistake tags get an extra bonus.
const HIGH_VALUE_TAGS = new Set(['EQUITY_FOLD', 'DREW_THIN']);

// Stats included in the leak ranking comparison.
const COMPARABLE_STATS = [
  'vpip', 'pfr', 'three_bet_pct', 'wtsd', 'wsd',
  'aggression', 'cbet_flop', 'cbet_turn', 'fold_to_cbet', 'fold_to_probe',
  'open_limp_rate', 'cold_call_3bet_rate', 'equity_fold_rate',
  'overlimp_rate', 'min_raise_rate',
];

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns a session prep brief for (coachId, studentId).
 * Serves cached data when it is fresh; otherwise generates a new brief.
 *
 * @param {string} coachId   - UUID of the coach (from JWT)
 * @param {string} studentId - UUID of the student
 * @returns {Promise<object>} brief payload
 */
async function generate(coachId, studentId) {
  const cached = await _fetchCached(coachId, studentId);
  if (cached) return cached;
  return _generateAndCache(coachId, studentId);
}

/**
 * Force-regenerates the brief (ignores cache age).
 */
async function refresh(coachId, studentId) {
  return _generateAndCache(coachId, studentId);
}

// ─── Cache helpers ────────────────────────────────────────────────────────────

async function _fetchCached(coachId, studentId) {
  const { data, error } = await supabase
    .from('session_prep_briefs')
    .select('data, generated_at')
    .eq('coach_id', coachId)
    .eq('player_id', studentId)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  const age = Date.now() - new Date(data.generated_at).getTime();
  if (age > CACHE_TTL_MS) return null;

  // Also invalidate if a new session has ended since the brief was generated.
  const { data: newSession } = await supabase
    .from('sessions')
    .select('session_id')
    .gt('ended_at', data.generated_at)
    .eq('player_id', studentId)   // sessions table may not have player_id; see note below
    .limit(1)
    .maybeSingle();

  if (newSession) return null;

  return { ...data.data, generated_at: data.generated_at, from_cache: true };
}

async function _generateAndCache(coachId, studentId) {
  const [
    leaks,
    flagged_hands,
    coach_notes,
    stats_snapshot,
    session_history,
    active_alerts,
    scenario_performance,
  ] = await Promise.all([
    _assembleLeakRanking(studentId).catch(() => []),
    _assembleFlaggedHands(studentId).catch(() => []),
    _assembleCoachNotes(coachId, studentId).catch(() => ({ notes: [], annotations: [] })),
    _assembleStatsSnapshot(studentId).catch(() => []),
    _assembleSessionHistory(studentId).catch(() => []),
    _assembleActiveAlerts(coachId, studentId).catch(() => []),
    _assembleScenarioPerformance(studentId).catch(() => []),
  ]);

  const brief = {
    leaks,
    flagged_hands,
    coach_notes,
    stats_snapshot,
    session_history,
    active_alerts,
    scenario_performance,
  };

  const generated_at = new Date().toISOString();

  // Tier 2: LLM narrative — never in the critical path.
  const narrative = await NarratorService.narratePrepBrief(brief).catch(() => null);
  const briefWithNarrative = { ...brief, narrative };

  // Upsert cache row (no unique constraint — insert and let old rows age out).
  await supabase
    .from('session_prep_briefs')
    .insert({ coach_id: coachId, player_id: studentId, data: briefWithNarrative, generated_at });

  return { ...briefWithNarrative, generated_at, from_cache: false };
}

// ─── Section 1: Leak Ranking ──────────────────────────────────────────────────

async function _assembleLeakRanking(studentId) {
  // Fetch student's rolling_30d baseline.
  const { data: studentRow, error: sErr } = await supabase
    .from('student_baselines')
    .select('*')
    .eq('player_id', studentId)
    .eq('period_type', 'rolling_30d')
    .order('computed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sErr || !studentRow) return [];

  // Fetch previous 30d baseline for trend.
  const { data: prevRows } = await supabase
    .from('student_baselines')
    .select('*')
    .eq('player_id', studentId)
    .eq('period_type', 'rolling_30d')
    .order('computed_at', { ascending: false })
    .range(1, 1);
  const prevRow = prevRows?.[0] ?? null;

  // Fetch school-wide average (all students' most recent rolling_30d).
  const { data: schoolRows } = await supabase
    .from('student_baselines')
    .select(COMPARABLE_STATS.join(', '))
    .eq('period_type', 'rolling_30d');

  const schoolAvg = _computeAvg(schoolRows ?? [], COMPARABLE_STATS);

  // Rank stats by absolute deviation from school average.
  const deviations = [];
  for (const stat of COMPARABLE_STATS) {
    const studentVal = studentRow[stat];
    const avgVal     = schoolAvg[stat];
    if (studentVal == null || avgVal == null || avgVal === 0) continue;

    const deviation = Math.abs(studentVal - avgVal);
    const trend = _computeTrend(stat, studentRow, prevRow);

    deviations.push({ stat, student_value: studentVal, school_avg: avgVal, deviation, trend });
  }

  deviations.sort((a, b) => b.deviation - a.deviation);
  return deviations.slice(0, 3);
}

function _computeAvg(rows, stats) {
  const sums   = {};
  const counts = {};
  for (const stat of stats) { sums[stat] = 0; counts[stat] = 0; }

  for (const row of rows) {
    for (const stat of stats) {
      if (row[stat] != null) {
        sums[stat]   += Number(row[stat]);
        counts[stat] += 1;
      }
    }
  }

  const avg = {};
  for (const stat of stats) {
    avg[stat] = counts[stat] > 0 ? sums[stat] / counts[stat] : null;
  }
  return avg;
}

function _computeTrend(stat, current, previous) {
  if (!previous || current[stat] == null || previous[stat] == null) return 'stable';
  const delta = Number(current[stat]) - Number(previous[stat]);
  if (Math.abs(delta) < 0.005) return 'stable';
  return delta > 0 ? 'worsening' : 'improving';
}

// ─── Section 2: Flagged Hands ─────────────────────────────────────────────────

async function _assembleFlaggedHands(studentId) {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Fetch hands where this student participated in the last 30 days.
  const { data: playerHands } = await supabase
    .from('hand_players')
    .select('hand_id')
    .eq('player_id', studentId);

  if (!playerHands || playerHands.length === 0) return [];

  const handIds = playerHands.map(r => r.hand_id);

  const { data: hands } = await supabase
    .from('hands')
    .select('id, started_at, hand_tags(tag, tag_type, player_id), hand_players!inner(player_id, net_chips)')
    .in('id', handIds)
    .gte('started_at', since)
    .order('started_at', { ascending: false });

  if (!hands || hands.length === 0) return [];

  const scored = hands.map(hand => {
    const playerRecord = (hand.hand_players || []).find(p => p.player_id === studentId);
    const tags = (hand.hand_tags || []).filter(t =>
      t.player_id === studentId || t.player_id == null
    );

    // Scoring: +3 per mistake tag, +2 for high-value mistakes, +1 per tag (depth proxy)
    let score = 0;
    const tagNames = [];
    for (const t of tags) {
      tagNames.push(t.tag);
      if (MISTAKE_TAGS.has(t.tag)) {
        score += 3;
        if (HIGH_VALUE_TAGS.has(t.tag)) score += 2;
      } else {
        score += 1;  // street/scenario tags add depth
      }
    }

    return {
      hand_id:      hand.id,
      date:         hand.started_at,
      tags:         tagNames,
      net_result:   playerRecord?.net_chips ?? null,
      review_score: score,
    };
  });

  scored.sort((a, b) => b.review_score - a.review_score);
  return scored.slice(0, 5);
}

// ─── Section 3: Coach's Notes ────────────────────────────────────────────────

async function _assembleCoachNotes(coachId, studentId) {
  // Last 5 player_notes for this student by this coach.
  const { data: notesRows } = await supabase
    .from('player_notes')
    .select('id, content, note_type, created_at')
    .eq('player_id', studentId)
    .eq('coach_id', coachId)
    .order('created_at', { ascending: false })
    .limit(5);

  // Last session ID for this student (for annotations).
  const { data: lastSession } = await supabase
    .from('sessions')
    .select('session_id')
    .order('ended_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let annotations = [];
  if (lastSession) {
    // Fetch all hands in that session where the student participated.
    const { data: sessionHands } = await supabase
      .from('hands')
      .select('id')
      .eq('session_id', lastSession.session_id);

    if (sessionHands && sessionHands.length > 0) {
      const sessionHandIds = sessionHands.map(h => h.id);
      const { data: annRows } = await supabase
        .from('hand_annotations')
        .select('id, hand_id, action_index, text, created_at')
        .in('hand_id', sessionHandIds)
        .eq('author_id', coachId)
        .order('created_at', { ascending: false })
        .limit(10);
      annotations = annRows ?? [];
    }
  }

  return {
    notes:       notesRows ?? [],
    annotations,
  };
}

// ─── Section 4: Stats Snapshot ────────────────────────────────────────────────

async function _assembleStatsSnapshot(studentId) {
  // Fetch two most recent rolling_30d baselines (current + previous).
  const { data: rows } = await supabase
    .from('student_baselines')
    .select('*')
    .eq('player_id', studentId)
    .eq('period_type', 'rolling_30d')
    .order('computed_at', { ascending: false })
    .limit(2);

  if (!rows || rows.length === 0) return [];

  const current  = rows[0];
  const previous = rows[1] ?? null;

  return COMPARABLE_STATS.map(stat => {
    const curr = current[stat];
    const prev = previous?.[stat] ?? null;
    const delta = curr != null && prev != null ? Number(curr) - Number(prev) : null;
    let direction = 'stable';
    if (delta != null) direction = delta > 0.005 ? 'up' : delta < -0.005 ? 'down' : 'stable';

    return { stat, current: curr, previous: prev, delta, direction };
  });
}

// ─── Section 5: Session History ───────────────────────────────────────────────

async function _assembleSessionHistory(studentId) {
  // Join sessions + session_player_stats to get net_chips per session.
  // quality_score added by POK-41 migration; null-safe.
  const { data: statsRows } = await supabase
    .from('session_player_stats')
    .select('session_id, hands_played, net_chips, sessions(started_at, ended_at, quality_score)')
    .eq('player_id', studentId)
    .order('sessions(ended_at)', { ascending: false })
    .limit(5);

  if (!statsRows || statsRows.length === 0) return [];

  return statsRows.map(r => ({
    session_id:    r.session_id,
    date:          r.sessions?.ended_at ?? r.sessions?.started_at ?? null,
    hands_played:  r.hands_played,
    net_chips:     r.net_chips,
    quality_score: r.sessions?.quality_score ?? null,
  }));
}

// ─── Section 6: Active Alerts ─────────────────────────────────────────────────

async function _assembleActiveAlerts(coachId, studentId) {
  const { data: rows } = await supabase
    .from('alert_instances')
    .select('id, alert_type, severity, data, created_at')
    .eq('coach_id', coachId)
    .eq('player_id', studentId)
    .eq('status', 'active')
    .order('severity', { ascending: false });

  return rows ?? [];
}

// ─── Section 7: Scenario Performance ─────────────────────────────────────────

async function _assembleScenarioPerformance(studentId) {
  // Find the most recent session end time.
  const { data: lastSessionRow } = await supabase
    .from('session_player_stats')
    .select('sessions(ended_at)')
    .eq('player_id', studentId)
    .order('sessions(ended_at)', { ascending: false })
    .limit(1)
    .maybeSingle();

  const since = lastSessionRow?.sessions?.ended_at
    ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Hands played by student since last session that originated from a scenario.
  const { data: scenarioHands } = await supabase
    .from('hand_players')
    .select('hand_id, hands!inner(id, started_at, scenario_id, hand_tags(tag, tag_type, player_id))')
    .eq('player_id', studentId)
    .gt('hands.started_at', since)
    .not('hands.scenario_id', 'is', null);

  if (!scenarioHands || scenarioHands.length === 0) return [];

  // Group by scenario_id and compute success rate (no mistake tags on this player).
  const byScenario = {};
  for (const row of scenarioHands) {
    const hand = row.hands;
    if (!hand) continue;
    const sid = hand.scenario_id;
    if (!byScenario[sid]) byScenario[sid] = { scenario_id: sid, played: 0, clean: 0 };

    const playerMistakes = (hand.hand_tags || []).filter(
      t => t.player_id === studentId && MISTAKE_TAGS.has(t.tag)
    );

    byScenario[sid].played += 1;
    if (playerMistakes.length === 0) byScenario[sid].clean += 1;
  }

  return Object.values(byScenario).map(s => ({
    scenario_id:   s.scenario_id,
    played:        s.played,
    clean:         s.clean,
    success_rate:  s.played > 0 ? Math.round((s.clean / s.played) * 100) : 0,
  }));
}

module.exports = { generate, refresh };
