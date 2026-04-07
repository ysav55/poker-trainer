'use strict';

/**
 * ProgressReportService
 *
 * Generates periodic progress reports (weekly, monthly, custom) for a student.
 * Reports are stored in `progress_reports` and served via the reports API.
 *
 * Public API:
 *   generate(coachId, studentId, periodStart, periodEnd, reportType?)
 *   list(coachId, studentId, { type, limit })
 *   getById(coachId, studentId, reportId)
 *   stableOverview(coachId)
 *
 * Dependencies: migration 018 (progress_reports table + student_baselines)
 */

const supabase        = require('../db/supabase');
const NarratorService = require('../ai/NarratorService');

// ─── Constants ────────────────────────────────────────────────────────────────

const CORE_STATS = [
  'vpip', 'pfr', 'three_bet_pct', 'wtsd', 'wsd',
  'aggression', 'cbet_flop', 'cbet_turn', 'fold_to_cbet',
];

const MISTAKE_RATE_STATS = [
  'open_limp_rate', 'cold_call_3bet_rate', 'equity_fold_rate',
  'overlimp_rate', 'min_raise_rate',
];

const MISTAKE_TAGS   = new Set(['OPEN_LIMP', 'OVERLIMP', 'COLD_CALL_3BET', 'EQUITY_FOLD', 'MIN_RAISE', 'FOLD_TO_PROBE']);
const HIGH_VALUE_TAGS = new Set(['EQUITY_FOLD', 'DREW_THIN']);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function s4(n)   { return n != null ? Math.round(n * 10000) / 10000 : null; }
function s2(n)   { return n != null ? Math.round(n * 100)   / 100   : null; }
function div(a, b) { return b > 0 ? a / b : null; }
function p100(cnt, hands) { return hands > 0 ? s2((cnt / hands) * 100) : null; }
function clamp(v, lo = 0, hi = 100) { return Math.max(lo, Math.min(hi, v)); }

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate a progress report for a student over a date range.
 * Upserts into progress_reports (idempotent for same coach/student/type/period_start).
 *
 * @param {string} coachId
 * @param {string} studentId
 * @param {string} periodStart  ISO date string e.g. "2026-03-24"
 * @param {string} periodEnd    ISO date string e.g. "2026-03-30"
 * @param {string} [reportType] 'weekly' | 'monthly' | 'custom' (auto-detected if omitted)
 * @returns {Promise<object>} report payload
 */
async function generate(coachId, studentId, periodStart, periodEnd, reportType) {
  const start = new Date(periodStart);
  const end   = new Date(periodEnd);
  if (isNaN(start) || isNaN(end)) throw new Error('Invalid date range');
  if (end < start) throw new Error('period_end must be >= period_start');

  // Auto-detect type from period length.
  const daysDiff = Math.round((end - start) / (1000 * 60 * 60 * 24));
  const type = reportType ?? (daysDiff <= 8 ? 'weekly' : daysDiff <= 35 ? 'monthly' : 'custom');

  // Previous equivalent period.
  const prevEnd   = new Date(start.getTime() - 86400000); // one day before start
  const prevStart = new Date(prevEnd.getTime() - daysDiff * 86400000);

  // Fetch all 8 sections concurrently.
  const [
    periodStats,
    prevStats,
    topHands,
    sessionSummary,
    scenarioResults,
    startBaseline,
  ] = await Promise.all([
    _computePeriodStats(studentId, start, end).catch(() => _emptyStats()),
    _computePeriodStats(studentId, prevStart, prevEnd).catch(() => null),
    _assembleTopHands(studentId, start, end).catch(() => ({ best: null, worst: null, most_instructive: null })),
    _assembleSessionSummary(studentId, start, end).catch(() => ({ sessions: 0, hands: 0, net_chips: 0, quality_avg: null, quality_trend: null })),
    _assembleScenarioResults(studentId, start, end).catch(() => []),
    _fetchBaselineAtDate(studentId, start).catch(() => null),
  ]);

  const comparison     = _buildComparison(periodStats, prevStats);
  const mistakeTrends  = _buildMistakeTrends(periodStats, prevStats);
  const leakEvolution  = _buildLeakEvolution(startBaseline, periodStats);
  const overallGrade   = _computeOverallGrade({ comparison, mistakeTrends, sessionSummary, scenarioResults });

  const report = {
    period_start:    periodStart,
    period_end:      periodEnd,
    period_stats:    periodStats,
    comparison,
    mistake_trends:  mistakeTrends,
    top_hands:       topHands,
    leak_evolution:  leakEvolution,
    session_summary: sessionSummary,
    scenario_results: scenarioResults,
    overall_grade:   overallGrade,
  };

  // Tier 2: LLM narrative — never in the critical path.
  const narrative = await NarratorService.narrateProgressReport(report).catch(() => null);

  const { data, error } = await supabase
    .from('progress_reports')
    .upsert(
      {
        coach_id:     coachId,
        player_id:    studentId,
        report_type:  type,
        period_start: periodStart,
        period_end:   periodEnd,
        data:         report,
        overall_grade: overallGrade,
        narrative,
      },
      { onConflict: 'coach_id,player_id,report_type,period_start' }
    )
    .select('id, created_at')
    .maybeSingle();

  if (error) throw new Error(error.message);

  return { ...report, report_type: type, narrative, id: data?.id ?? null, created_at: data?.created_at ?? null };
}

/**
 * List saved reports for a student.
 */
async function list(coachId, studentId, { type, limit = 10 } = {}) {
  let query = supabase
    .from('progress_reports')
    .select('id, report_type, period_start, period_end, overall_grade, narrative, created_at')
    .eq('coach_id', coachId)
    .eq('player_id', studentId)
    .order('created_at', { ascending: false })
    .limit(Math.min(limit, 50));

  if (type) query = query.eq('report_type', type);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Fetch a single report by ID.
 */
async function getById(coachId, studentId, reportId) {
  const { data, error } = await supabase
    .from('progress_reports')
    .select('*')
    .eq('id', reportId)
    .eq('coach_id', coachId)
    .eq('player_id', studentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

/**
 * Stable-wide summary: aggregates all students' latest weekly reports.
 * Returns avg_grade, top_performers, concerns.
 */
async function stableOverview(coachId) {
  // Find players with a student role. Replaces the deprecated is_coach=false filter
  // (player_profiles.is_coach was removed in migration 043).
  const { data: roleRows } = await supabase
    .from('player_roles')
    .select('player_id, roles!inner(name)')
    .in('roles.name', ['coached_student', 'solo_student', 'trial', 'player']);
  const studentIds = [...new Set((roleRows ?? []).map(r => r.player_id))];
  const { data: students, error: sErr } = studentIds.length
    ? await supabase.from('player_profiles').select('id, display_name').in('id', studentIds)
    : { data: [], error: null };
  if (sErr) throw new Error(sErr.message);
  if (!students || students.length === 0) return { students: [], avg_grade: null, top_performers: [], concerns: [] };

  const results = await Promise.allSettled(
    students.map(s =>
      supabase
        .from('progress_reports')
        .select('player_id, overall_grade, period_start, period_end, created_at')
        .eq('coach_id', coachId)
        .eq('player_id', s.id)
        .eq('report_type', 'weekly')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(({ data }) => (data ? { ...data, display_name: s.display_name } : null))
    )
  );

  const studentReports = results
    .filter(r => r.status === 'fulfilled' && r.value)
    .map(r => r.value);

  const grades = studentReports.map(r => r.overall_grade).filter(g => g != null);
  const avg_grade = grades.length > 0
    ? Math.round(grades.reduce((a, b) => a + b, 0) / grades.length)
    : null;

  const sorted = [...studentReports].sort((a, b) => (b.overall_grade ?? 0) - (a.overall_grade ?? 0));

  return {
    students:       studentReports,
    avg_grade,
    top_performers: sorted.slice(0, 3),
    concerns:       sorted.slice(-3).reverse(),
  };
}

// ─── Section helpers ──────────────────────────────────────────────────────────

function _emptyStats() {
  return {
    hands_played: 0, sessions: 0, net_chips: 0, avg_quality_score: null,
    vpip: null, pfr: null, three_bet_pct: null, wtsd: null, wsd: null,
    aggression: null, cbet_flop: null, cbet_turn: null, fold_to_cbet: null,
    open_limp_rate: null, cold_call_3bet_rate: null, equity_fold_rate: null,
    overlimp_rate: null, min_raise_rate: null, tag_profile: {},
  };
}

async function _computePeriodStats(studentId, start, end) {
  const startIso = start.toISOString();
  const endIso   = end.toISOString();

  // Sessions in period.
  const { data: sessions, error: sErr } = await supabase
    .from('sessions')
    .select('session_id')
    .gte('started_at', startIso)
    .lte('started_at', endIso);
  if (sErr) throw new Error(sErr.message);

  const sessionIds = (sessions || []).map(s => s.session_id);

  let statRows = [];
  if (sessionIds.length > 0) {
    const { data, error } = await supabase
      .from('session_player_stats')
      .select('hands_played, vpip_count, pfr_count, wtsd_count, wsd_count, net_chips, quality_score')
      .eq('player_id', studentId)
      .in('session_id', sessionIds);
    if (error) throw new Error(error.message);
    statRows = data || [];
  }

  const hands    = statRows.reduce((s, r) => s + (r.hands_played || 0), 0);
  const vpipCnt  = statRows.reduce((s, r) => s + (r.vpip_count  || 0), 0);
  const pfrCnt   = statRows.reduce((s, r) => s + (r.pfr_count   || 0), 0);
  const wtsdCnt  = statRows.reduce((s, r) => s + (r.wtsd_count  || 0), 0);
  const wsdCnt   = statRows.reduce((s, r) => s + (r.wsd_count   || 0), 0);
  const netChips = statRows.reduce((s, r) => s + (r.net_chips   || 0), 0);
  const quals    = statRows.map(r => r.quality_score).filter(q => q != null);

  // Actions in period for aggression, c-bet, 3-bet.
  const { data: actions, error: actErr } = await supabase
    .from('hand_actions')
    .select('hand_id, street, action, amount, pot_at_action')
    .eq('player_id', studentId)
    .gte('created_at', startIso)
    .lte('created_at', endIso);
  if (actErr) throw new Error(actErr.message);

  const allActions = actions || [];
  const byHand = {};
  for (const a of allActions) {
    (byHand[a.hand_id] = byHand[a.hand_id] || []).push(a);
  }

  let betsRaises = 0, calls = 0;
  for (const a of allActions) {
    if (a.action === 'bet' || a.action === 'raise') betsRaises++;
    else if (a.action === 'call') calls++;
  }
  const aggression = calls > 0 ? betsRaises / calls : (betsRaises > 0 ? 3.0 : null);

  let pfRaiserHands = 0, cbetFlopCount = 0, cbetTurnCount = 0;
  let flopFacedBet = 0, foldedToCbetCount = 0;
  let threeBetOpps = 0, threeBetCount = 0;

  for (const acts of Object.values(byHand)) {
    const pfActions = acts.filter(a => a.street === 'preflop');
    const flopActs  = acts.filter(a => a.street === 'flop');
    const turnActs  = acts.filter(a => a.street === 'turn');
    const pfRaised  = pfActions.some(a => a.action === 'raise' || a.action === 'bet');

    if (pfRaised) {
      pfRaiserHands++;
      if (flopActs.some(a => a.action === 'bet' || a.action === 'raise')) cbetFlopCount++;
      if (turnActs.some(a => a.action === 'bet' || a.action === 'raise')) cbetTurnCount++;
    }
    if (flopActs.length > 0) {
      flopFacedBet++;
      if (flopActs.some(a => a.action === 'fold')) foldedToCbetCount++;
    }
  }

  // 3bet%: Fetch ALL preflop actions (not just student's) to identify 3-bet opportunities
  // A 3-bet opportunity exists when opponent raised preflop first
  // A 3-bet is counted when student raised AFTER opponent's raise
  const handIds = Object.keys(byHand);
  if (handIds.length > 0) {
    // Fetch ALL preflop actions for these hands (no player_id filter)
    const { data: allPreflopActions, error: pfErr } = await supabase
      .from('hand_actions')
      .select('id, hand_id, player_id, action, street')
      .in('hand_id', handIds)
      .eq('street', 'preflop')
      .gte('created_at', startIso)
      .lte('created_at', endIso);
    if (pfErr) throw new Error(pfErr.message);

    const preflopActionsAll = allPreflopActions || [];
    const byHandAllActions = {};
    for (const a of preflopActionsAll) {
      (byHandAllActions[a.hand_id] = byHandAllActions[a.hand_id] || []).push(a);
    }

    for (const [handId, handActions] of Object.entries(byHandAllActions)) {
      // Sort by action id to see sequence
      const sorted = handActions.sort((a, b) => a.id - b.id);

      // Find the first raiser (opponent)
      const firstRaiserId = sorted.find(a => a.action === 'raise' || a.action === 'bet')?.player_id;
      if (!firstRaiserId) continue; // No raise in this hand, no 3-bet opportunity

      // Student saw a raise: 3-bet opportunity exists
      threeBetOpps++;

      // Check if student raised after the first raiser
      const studentIdx = sorted.findIndex(a => a.player_id === studentId);
      const firstRaiserIdx = sorted.findIndex(a => a.player_id === firstRaiserId);

      if (studentIdx > firstRaiserIdx && sorted[studentIdx].action === 'raise') {
        // Student raised after opponent's initial raise — this is a 3-bet
        threeBetCount++;
      }
    }
  }
  const tagCounts = {};
  if (handIds.length > 0) {
    const [{ data: pt }, { data: ht }] = await Promise.all([
      supabase.from('hand_tags').select('tag').in('hand_id', handIds).eq('player_id', studentId),
      supabase.from('hand_tags').select('tag').in('hand_id', handIds).is('player_id', null),
    ]);
    for (const t of [...(pt || []), ...(ht || [])]) {
      tagCounts[t.tag] = (tagCounts[t.tag] || 0) + 1;
    }
  }

  return {
    hands_played:        hands,
    sessions:            statRows.length,
    net_chips:           netChips,
    avg_quality_score:   quals.length > 0 ? Math.round(quals.reduce((a, b) => a + b, 0) / quals.length) : null,
    vpip:                s4(div(vpipCnt, hands)),
    pfr:                 s4(div(pfrCnt, hands)),
    three_bet_pct:       s4(threeBetOpps > 0 ? threeBetCount / threeBetOpps : null),
    wtsd:                s4(div(wtsdCnt, hands)),
    wsd:                 s4(div(wsdCnt, wtsdCnt)),
    aggression:          s2(aggression),
    cbet_flop:           s4(pfRaiserHands > 0 ? cbetFlopCount / pfRaiserHands : null),
    cbet_turn:           s4(pfRaiserHands > 0 ? cbetTurnCount / pfRaiserHands : null),
    fold_to_cbet:        s4(flopFacedBet > 0 ? foldedToCbetCount / flopFacedBet : null),
    open_limp_rate:      p100(tagCounts['OPEN_LIMP']       || 0, hands),
    cold_call_3bet_rate: p100(tagCounts['COLD_CALL_3BET']  || 0, hands),
    equity_fold_rate:    p100(tagCounts['EQUITY_FOLD']     || 0, hands),
    overlimp_rate:       p100(tagCounts['OVERLIMP']        || 0, hands),
    min_raise_rate:      p100(tagCounts['MIN_RAISE']       || 0, hands),
    tag_profile:         tagCounts,
  };
}

function _buildComparison(current, previous) {
  return CORE_STATS.map(stat => {
    const curr = current[stat];
    const prev = previous?.[stat] ?? null;
    if (curr == null || prev == null) {
      return { stat, current: curr, previous: prev, delta: null, direction: 'stable', significant: false };
    }
    const delta = Number(curr) - Number(prev);
    // For fold_to_cbet: lower is better (direction inverted for "improvement" label).
    const direction = Math.abs(delta) < 0.005 ? 'stable' : (delta > 0 ? 'up' : 'down');
    const relChange = Number(prev) !== 0 ? Math.abs(delta) / Math.abs(Number(prev)) : 0;
    return {
      stat,
      current:     curr,
      previous:    prev,
      delta:       s4(delta),
      direction,
      significant: relChange > 0.10,
    };
  });
}

function _buildMistakeTrends(current, previous) {
  return MISTAKE_RATE_STATS.map(stat => {
    const curr = current[stat];
    const prev = previous?.[stat] ?? null;
    const delta = curr != null && prev != null ? s2(curr - prev) : null;
    let direction = 'stable';
    if (delta != null && Math.abs(delta) > 0.5) direction = delta > 0 ? 'worse' : 'better';
    return { stat, current: curr, previous: prev, delta, direction };
  });
}

async function _fetchBaselineAtDate(studentId, date) {
  const { data } = await supabase
    .from('student_baselines')
    .select('*')
    .eq('player_id', studentId)
    .eq('period_type', 'rolling_30d')
    .lte('computed_at', date.toISOString())
    .order('computed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

function _buildLeakEvolution(startBaseline, currentStats) {
  if (!startBaseline) return [];
  const LEAK_STATS = [...MISTAKE_RATE_STATS, 'fold_to_cbet'];

  return LEAK_STATS
    .filter(s => startBaseline[s] != null)
    .map(s => {
      const startVal   = Number(startBaseline[s]);
      const currentVal = currentStats[s] != null ? Number(currentStats[s]) : null;
      const delta = currentVal != null ? s2(currentVal - startVal) : null;
      let direction = 'unknown';
      if (delta != null) direction = delta < -0.5 ? 'improved' : delta > 0.5 ? 'worsened' : 'stable';
      return { stat: s, start_value: startVal, current_value: currentVal, delta, direction };
    })
    .sort((a, b) => (b.start_value ?? 0) - (a.start_value ?? 0))
    .slice(0, 3);
}

async function _assembleTopHands(studentId, start, end) {
  const { data: playerHands } = await supabase
    .from('hand_players')
    .select('hand_id, net_chips')
    .eq('player_id', studentId);

  if (!playerHands || playerHands.length === 0) {
    return { best: null, worst: null, most_instructive: null };
  }

  const handIds = playerHands.map(r => r.hand_id);
  const chipMap = Object.fromEntries(playerHands.map(r => [r.hand_id, r.net_chips ?? 0]));

  const { data: hands } = await supabase
    .from('hands')
    .select('hand_id, started_at, hand_tags(tag, player_id)')
    .in('hand_id', handIds)
    .gte('started_at', start.toISOString())
    .lte('started_at', end.toISOString());

  if (!hands || hands.length === 0) {
    return { best: null, worst: null, most_instructive: null };
  }

  const scored = hands.map(hand => {
    const net_chips = chipMap[hand.hand_id] ?? 0;
    const tags = (hand.hand_tags || []).filter(t => t.player_id === studentId || t.player_id == null);
    let reviewScore = 0;
    for (const t of tags) {
      if (MISTAKE_TAGS.has(t.tag))      reviewScore += 3;
      if (HIGH_VALUE_TAGS.has(t.tag))   reviewScore += 2;
      else                              reviewScore += 1;
    }
    return { hand_id: hand.hand_id, date: hand.started_at, net_chips, review_score: reviewScore };
  });

  const best        = scored.reduce((a, b) => (b.net_chips > a.net_chips ? b : a), scored[0]);
  const worst       = scored.reduce((a, b) => (b.net_chips < a.net_chips ? b : a), scored[0]);
  const instructive = scored.reduce((a, b) => (b.review_score > a.review_score ? b : a), scored[0]);

  return { best, worst, most_instructive: instructive };
}

async function _assembleSessionSummary(studentId, start, end) {
  const { data: sessions } = await supabase
    .from('sessions')
    .select('session_id')
    .gte('started_at', start.toISOString())
    .lte('started_at', end.toISOString());

  if (!sessions || sessions.length === 0) {
    return { sessions: 0, hands: 0, net_chips: 0, quality_avg: null, quality_trend: null };
  }

  const { data: stats } = await supabase
    .from('session_player_stats')
    .select('hands_played, net_chips, quality_score')
    .eq('player_id', studentId)
    .in('session_id', sessions.map(s => s.session_id));

  const hands    = (stats || []).reduce((s, r) => s + (r.hands_played || 0), 0);
  const netChips = (stats || []).reduce((s, r) => s + (r.net_chips   || 0), 0);
  const quals    = (stats || []).map(r => r.quality_score).filter(q => q != null);
  const qualAvg  = quals.length > 0 ? Math.round(quals.reduce((a, b) => a + b, 0) / quals.length) : null;

  let qualTrend = null;
  if (quals.length >= 4) {
    const half      = Math.floor(quals.length / 2);
    const firstAvg  = quals.slice(0, half).reduce((a, b) => a + b, 0) / half;
    const secondAvg = quals.slice(-half).reduce((a, b) => a + b, 0) / half;
    const slope     = secondAvg - firstAvg;
    qualTrend = slope > 3 ? 'improving' : slope < -3 ? 'declining' : 'stable';
  }

  return {
    sessions:      (stats || []).length,
    hands,
    net_chips:     netChips,
    quality_avg:   qualAvg,
    quality_trend: qualTrend,
  };
}

async function _assembleScenarioResults(studentId, start, end) {
  const { data: playerHands } = await supabase
    .from('hand_players')
    .select('hand_id')
    .eq('player_id', studentId);

  if (!playerHands || playerHands.length === 0) return [];

  const handIds = playerHands.map(r => r.hand_id);

  const { data: scenarioHands } = await supabase
    .from('hands')
    .select('hand_id, scenario_id, hand_tags(tag, player_id)')
    .in('hand_id', handIds)
    .gte('started_at', start.toISOString())
    .lte('started_at', end.toISOString())
    .not('scenario_id', 'is', null);

  if (!scenarioHands || scenarioHands.length === 0) return [];

  const byScenario = {};
  for (const hand of scenarioHands) {
    const sid = hand.scenario_id;
    if (!byScenario[sid]) byScenario[sid] = { scenario_id: sid, played: 0, clean: 0 };
    byScenario[sid].played++;
    const mistakes = (hand.hand_tags || []).filter(t => t.player_id === studentId && MISTAKE_TAGS.has(t.tag));
    if (mistakes.length === 0) byScenario[sid].clean++;
  }

  return Object.values(byScenario).map(s => ({
    scenario_id:  s.scenario_id,
    played:       s.played,
    clean:        s.clean,
    success_rate: Math.round((s.clean / s.played) * 100),
  }));
}

function _computeOverallGrade({ comparison, mistakeTrends, sessionSummary, scenarioResults }) {
  // 1. Stat improvement (30%)
  const statChanges = comparison.filter(c => c.delta != null && Math.abs(c.delta) >= 0.005);
  let statScore = 0.5;
  if (statChanges.length > 0) {
    // Improvement definition: higher is generally better, except fold_to_cbet (lower = better).
    const improved  = statChanges.filter(c => c.stat === 'fold_to_cbet' ? c.direction === 'down' : c.direction === 'up').length;
    const regressed = statChanges.filter(c => c.stat === 'fold_to_cbet' ? c.direction === 'up'  : c.direction === 'down').length;
    statScore = clamp(0.5 + (improved - regressed) / statChanges.length * 0.5, 0, 1);
  }

  // 2. Mistake reduction (30%)
  const mistakeChanges = mistakeTrends.filter(m => m.delta != null && Math.abs(m.delta) > 0.1);
  let mistakeScore = 0.5;
  if (mistakeChanges.length > 0) {
    const better = mistakeChanges.filter(m => m.direction === 'better').length;
    const worse  = mistakeChanges.filter(m => m.direction === 'worse').length;
    mistakeScore = clamp(0.5 + (better - worse) / mistakeChanges.length * 0.5, 0, 1);
  }

  // 3. Volume consistency (15%): >50 hands = good
  const volumeScore = sessionSummary.hands >= 50 ? 1.0
    : sessionSummary.hands >= 20 ? 0.7
    : sessionSummary.hands >= 10 ? 0.4
    : 0.2;

  // 4. Scenario performance (15%)
  const totalPlayed  = scenarioResults.reduce((s, r) => s + r.played, 0);
  const totalClean   = scenarioResults.reduce((s, r) => s + r.clean, 0);
  const scenarioScore = totalPlayed > 0 ? totalClean / totalPlayed : 0.5;

  // 5. Session quality (10%): average quality_score / 100
  const qualScore = sessionSummary.quality_avg != null
    ? sessionSummary.quality_avg / 100
    : 0.5;

  const raw =
    statScore     * 30
    + mistakeScore  * 30
    + volumeScore   * 15
    + scenarioScore * 15
    + qualScore     * 10;

  return Math.round(clamp(raw, 0, 100));
}

module.exports = { generate, list, getById, stableOverview };
