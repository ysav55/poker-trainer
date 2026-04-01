'use strict';

/**
 * BaselineService
 *
 * Recomputes a student's rolling statistical profile after each session.
 * Results are upserted into `student_baselines` (migration 018).
 *
 * Public API:
 *   recompute(playerId)                    → baseline row or null (< 2 hands)
 *   recomputeAfterSession(playerIds)       → runs recompute() for a list of players
 */

const supabase = require('../db/supabase');

// Tags that represent mistakes (used for per-100-hand rates)
const MISTAKE_TAGS = ['OPEN_LIMP', 'OVERLIMP', 'COLD_CALL_3BET', 'EQUITY_FOLD', 'MIN_RAISE'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safe4(n)   { return n != null ? Math.round(n * 10000) / 10000 : null; }
function safe2(n)   { return n != null ? Math.round(n * 100)   / 100   : null; }
function divOrNull(a, b) { return b > 0 ? a / b : null; }

/** ISO date string e.g. "2026-03-01" */
function toDate(d) { return d.toISOString().slice(0, 10); }

/** True if today is the first day of an ISO week (Monday). */
function isWeekBoundary(d) { return d.getDay() === 1; }
/** True if today is the first day of a calendar month. */
function isMonthBoundary(d) { return d.getDate() === 1; }

// ─── Core computation ─────────────────────────────────────────────────────────

async function recompute(playerId) {
  if (!playerId) throw new Error('playerId is required');

  const now       = new Date();
  const cutoff    = new Date(now - 30 * 24 * 60 * 60 * 1000);

  // ── 1. Aggregate VPIP/PFR/WTSD/WSD/net_chips from session_player_stats ──────

  // Get sessions started in the last 30 days
  const { data: recentSessions, error: sessErr } = await supabase
    .from('sessions')
    .select('session_id')
    .gte('started_at', cutoff.toISOString());
  if (sessErr) throw new Error(sessErr.message);

  const sessionIds = (recentSessions || []).map(s => s.session_id);

  let statRows = [];
  if (sessionIds.length > 0) {
    const { data: stats, error: statsErr } = await supabase
      .from('session_player_stats')
      .select('hands_played, vpip_count, pfr_count, wtsd_count, wsd_count, net_chips')
      .eq('player_id', playerId)
      .in('session_id', sessionIds);
    if (statsErr) throw new Error(statsErr.message);
    statRows = stats || [];
  }

  const totalHands    = statRows.reduce((s, r) => s + (r.hands_played || 0), 0);
  if (totalHands < 2) return null; // not enough data

  const totalVpip     = statRows.reduce((s, r) => s + (r.vpip_count || 0), 0);
  const totalPfr      = statRows.reduce((s, r) => s + (r.pfr_count  || 0), 0);
  const totalWtsd     = statRows.reduce((s, r) => s + (r.wtsd_count || 0), 0);
  const totalWsd      = statRows.reduce((s, r) => s + (r.wsd_count  || 0), 0);
  const totalNet      = statRows.reduce((s, r) => s + (r.net_chips  || 0), 0);

  // ── 2. Fetch hand_actions for action-level stats ──────────────────────────

  const { data: actions, error: actErr } = await supabase
    .from('hand_actions')
    .select('hand_id, street, action, amount, pot_at_action')
    .eq('player_id', playerId)
    .gte('created_at', cutoff.toISOString());
  if (actErr) throw new Error(actErr.message);

  const allActions = actions || [];

  // Group by hand
  const byHand = {};
  for (const a of allActions) {
    (byHand[a.hand_id] = byHand[a.hand_id] || []).push(a);
  }

  // Aggression factor = (bets + raises) / calls (across all streets)
  let betsRaises = 0, calls = 0;
  for (const a of allActions) {
    if (a.action === 'bet' || a.action === 'raise') betsRaises++;
    else if (a.action === 'call') calls++;
  }
  const aggression = calls > 0 ? betsRaises / calls : betsRaises > 0 ? 3.0 : null;

  // C-bet flop: hands where player raised preflop AND bet/raised on flop
  // Fold to c-bet: player folded on flop (approximation — assumes they faced a bet)
  let pfRaiseCount = 0, cbetFlopCount = 0;
  let flopFacedBet = 0, foldedToCbetCount = 0;
  let pfRaiserHands = 0, cbetTurnCount = 0;

  for (const acts of Object.values(byHand)) {
    const pfActions = acts.filter(a => a.street === 'preflop');
    const flopActs  = acts.filter(a => a.street === 'flop');
    const turnActs  = acts.filter(a => a.street === 'turn');

    const pfRaised  = pfActions.some(a => a.action === 'raise' || a.action === 'bet');
    const cbetFlop  = flopActs.some(a => a.action === 'bet' || a.action === 'raise');
    const cbetTurn  = turnActs.some(a => a.action === 'bet' || a.action === 'raise');

    if (pfRaised) {
      pfRaiserHands++;
      if (cbetFlop) cbetFlopCount++;
      if (cbetTurn) cbetTurnCount++;
    }

    // Fold to c-bet: player was on flop and folded
    if (flopActs.length > 0) {
      flopFacedBet++;
      if (flopActs.some(a => a.action === 'fold')) foldedToCbetCount++;
    }
  }

  const cbetFlop    = pfRaiserHands > 0 ? cbetFlopCount  / pfRaiserHands : null;
  const cbetTurn    = pfRaiserHands > 0 ? cbetTurnCount  / pfRaiserHands : null;
  const foldToCbet  = flopFacedBet  > 0 ? foldedToCbetCount / flopFacedBet : null;

  // 3bet%: hands where player raised facing a preflop raise / hands where player had an action after a raise
  let threeBetOpps = 0, threeBetCount = 0;
  for (const acts of Object.values(byHand)) {
    const pfActions  = acts.filter(a => a.street === 'preflop');
    if (pfActions.length === 0) continue;
    // Count preflop raises before this player's actions (simplified: any preflop raise in the hand)
    const raisesBefore = pfActions.filter(a => a.action === 'raise' || a.action === 'bet').length;
    if (raisesBefore >= 1) {
      threeBetOpps++;
      // Player 3-bet if they also raised (and there was already a raise)
      if (raisesBefore >= 2) threeBetCount++;
    }
  }
  const threeBetPct = threeBetOpps > 0 ? threeBetCount / threeBetOpps : null;

  // ── 3. Fetch hand_tags for tag profile and mistake frequencies ───────────────

  const handIds = Object.keys(byHand);
  const tagCounts = {};

  if (handIds.length > 0) {
    // Player-specific tags
    const { data: playerTags, error: tagErr } = await supabase
      .from('hand_tags')
      .select('tag')
      .in('hand_id', handIds)
      .eq('player_id', playerId);
    if (tagErr) throw new Error(tagErr.message);

    // Hand-level tags (player_id IS NULL)
    const { data: handTags, error: htErr } = await supabase
      .from('hand_tags')
      .select('tag')
      .in('hand_id', handIds)
      .is('player_id', null);
    if (htErr) throw new Error(htErr.message);

    for (const t of [...(playerTags || []), ...(handTags || [])]) {
      tagCounts[t.tag] = (tagCounts[t.tag] || 0) + 1;
    }
  }

  const per100 = (cnt) => totalHands > 0 ? safe2((cnt / totalHands) * 100) : null;

  // ── 4. Compute bb/100 from hands big_blind field ─────────────────────────────

  let bbPer100 = null;
  if (handIds.length > 0) {
    const { data: handsBb } = await supabase
      .from('hands')
      .select('big_blind')
      .in('hand_id', handIds)
      .gt('big_blind', 0);
    const bbValues = (handsBb || []).map(h => h.big_blind).filter(Boolean);
    if (bbValues.length > 0) {
      const avgBb = bbValues.reduce((a, b) => a + b, 0) / bbValues.length;
      if (avgBb > 0) bbPer100 = safe2((totalNet / avgBb / totalHands) * 100);
    }
  }

  // ── 5. Build and upsert baseline row ─────────────────────────────────────────

  const baseline = {
    player_id:           playerId,
    period_type:         'rolling_30d',
    period_start:        toDate(cutoff),
    period_end:          toDate(now),
    hands_played:        totalHands,
    sessions:            statRows.length,
    vpip:                safe4(divOrNull(totalVpip, totalHands)),
    pfr:                 safe4(divOrNull(totalPfr,  totalHands)),
    three_bet_pct:       safe4(threeBetPct),
    wtsd:                safe4(divOrNull(totalWtsd, totalHands)),
    wsd:                 safe4(divOrNull(totalWsd,  totalWtsd)),
    aggression:          safe2(aggression),
    cbet_flop:           safe4(cbetFlop),
    cbet_turn:           safe4(cbetTurn),
    fold_to_cbet:        safe4(foldToCbet),
    fold_to_probe:       null, // requires probe detection logic (future)
    open_limp_rate:      per100(tagCounts['OPEN_LIMP']        || 0),
    cold_call_3bet_rate: per100(tagCounts['COLD_CALL_3BET']   || 0),
    equity_fold_rate:    per100(tagCounts['EQUITY_FOLD']      || 0),
    overlimp_rate:       per100(tagCounts['OVERLIMP']         || 0),
    min_raise_rate:      per100(tagCounts['MIN_RAISE']        || 0),
    net_chips:           totalNet,
    bb_per_100:          bbPer100,
    tag_profile:         tagCounts,
    computed_at:         now.toISOString(),
  };

  const { error: upsertErr } = await supabase
    .from('student_baselines')
    .upsert(baseline, { onConflict: 'player_id,period_type,period_start' });
  if (upsertErr) throw new Error(upsertErr.message);

  // ── 6. Snapshot weekly / monthly rows if at a boundary ────────────────────

  if (isWeekBoundary(now)) {
    await _upsertSnapshot(playerId, 'weekly', now, baseline);
  }
  if (isMonthBoundary(now)) {
    await _upsertSnapshot(playerId, 'monthly', now, baseline);
  }

  return baseline;
}

async function _upsertSnapshot(playerId, periodType, now, baseline) {
  const snap = { ...baseline, period_type: periodType, period_start: toDate(now) };
  const { error } = await supabase
    .from('student_baselines')
    .upsert(snap, { onConflict: 'player_id,period_type,period_start' });
  if (error) throw new Error(error.message);
}

/**
 * Run recompute() for a batch of players (fire-and-forget per player).
 * Errors are logged, not rethrown — one failure doesn't block others.
 */
async function recomputeAfterSession(playerIds) {
  if (!Array.isArray(playerIds) || playerIds.length === 0) return;
  await Promise.allSettled(playerIds.map(id => recompute(id)));
}

module.exports = { recompute, recomputeAfterSession };
