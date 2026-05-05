'use strict';

const supabase = require('../supabase');
const { q, parseTags } = require('../utils');
const { buildPositionMap } = require('../../game/positions');
const { ensureSession } = require('./SessionRepository');

// ─── Hand Lifecycle ───────────────────────────────────────────────────────────

async function startHand({ handId, sessionId, tableId, players, allPlayers, dealerSeat = 0, isScenario = false, smallBlind = 0, bigBlind = 0, sessionType = null, tableMode = null }) {
  await ensureSession(sessionId, tableId);

  await q(supabase.from('hands').upsert({
    hand_id:            handId,
    session_id:         sessionId,
    table_id:           tableId,
    started_at:         new Date().toISOString(),
    completed_normally: false,
    dealer_seat:        dealerSeat,
    is_scenario_hand:   isScenario,
    small_blind:        smallBlind,
    big_blind:          bigBlind,
    session_type:       sessionType,
    table_mode:         tableMode,
  }, { onConflict: 'hand_id', ignoreDuplicates: true }));

  // Ensure each player has a player_profiles row before inserting hand_players FK
  const profileUpserts = players.map(p => ({
    id:           p.id,
    display_name: p.name,
  }));
  await q(supabase.from('player_profiles').upsert(profileUpserts, {
    onConflict: 'id',
    ignoreDuplicates: true,
  }));

  const seatedForPositions = (allPlayers || players)
    .filter(p => p.seat >= 0)
    .sort((a, b) => a.seat - b.seat)
    .map(p => ({ player_id: p.id, seat: p.seat }));
  const positionMap = buildPositionMap(seatedForPositions, dealerSeat);

  const playerRows = (allPlayers || players).map(p => ({
    hand_id:     handId,
    player_id:   p.id,
    player_name: p.name,
    seat:        p.seat ?? -1,
    position:    positionMap[p.id] ?? null,
    stack_start: p.stack ?? 0,
  }));
  await q(supabase.from('hand_players').upsert(playerRows, {
    onConflict: 'hand_id,player_id',
    ignoreDuplicates: true,
  }));
}

async function recordAction({ handId, playerId, playerName, street, action, amount = 0, isManualScenario = false, stackAtAction = null, potAtAction = null, decisionTimeMs = null, position = null }) {
  await q(supabase.from('hand_actions').insert({
    hand_id:            handId,
    player_id:          playerId,
    player_name:        playerName,
    street,
    action,
    amount:             amount || 0,
    created_at:         new Date().toISOString(),
    is_manual_scenario: isManualScenario,
    stack_at_action:    stackAtAction ?? null,
    pot_at_action:      potAtAction ?? null,
    decision_time_ms:   decisionTimeMs ?? null,
    position:           position ?? null,
  }));
}

async function endHand({ handId, state, socketToStable = {} }) {
  const now = new Date().toISOString();

  const resolveId = (socketId) => socketToStable[socketId] || socketId;

  const completedNormally = ['showdown', 'waiting'].includes(state.phase) || state.winner != null;
  const isFoldWin = state.showdown_result?.foldWin === true;
  const phaseEnded = (state.phase === 'showdown' && !isFoldWin)
    ? 'showdown'
    : state.winner != null ? 'fold_to_one' : state.phase;

  // Compute VPIP/PFR/3-bet from actual preflop actions (ordered by id for correct sequence)
  const preflopRows = await q(
    supabase.from('hand_actions')
      .select('player_id, action')
      .eq('hand_id', handId)
      .eq('street', 'preflop')
      .eq('is_reverted', false)
      .order('id', { ascending: true })
  );

  const preflopByPlayer = {};
  // raiseCount tracks total raises in preflop action order within this hand.
  // The 2nd raise is the 3-bet by definition; 4-bets and beyond are not tracked.
  // Blind postings are NOT in hand_actions and are not counted here.
  let raiseCount = 0;
  for (const row of (preflopRows || [])) {
    if (!preflopByPlayer[row.player_id]) preflopByPlayer[row.player_id] = { vpip: false, pfr: false, three_bet: false };
    if (['call', 'called', 'raise', 'raised', 'all-in'].includes(row.action))
      preflopByPlayer[row.player_id].vpip = true;
    if (['raise', 'raised'].includes(row.action)) {
      preflopByPlayer[row.player_id].pfr = true;
      raiseCount++;
      if (raiseCount === 2) {
        preflopByPlayer[row.player_id].three_bet = true;
      }
    }
  }

  const reachedShowdown = phaseEnded === 'showdown';
  const winnerIds = new Set();
  if (state.showdown_result) {
    state.showdown_result.winners.forEach(w => winnerIds.add(resolveId(w.playerId)));
  } else if (state.winner) {
    winnerIds.add(resolveId(state.winner));
  }

  const winnerId = state.winner ? resolveId(state.winner) : null;
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const winnerIdForDb = winnerId && uuidRe.test(winnerId) ? winnerId : null;

  // Run player updates first — mark hand complete only after they succeed.
  // Promise.allSettled tolerates partial failures without losing the entire hand record.
  const updatePromises = (state.players || [])
    .map(p => {
      const stableId = resolveId(p.id);
      const pf = preflopByPlayer[stableId] || { vpip: false, pfr: false, three_bet: false };
      return q(supabase.from('hand_players').update({
        stack_end:  p.stack ?? 0,
        hole_cards: p.hole_cards || [],
        is_winner:  winnerIds.has(stableId),
        vpip:       pf.vpip,
        pfr:        pf.pfr,
        three_bet:  pf.three_bet,
        wtsd:       reachedShowdown,
        wsd:        reachedShowdown && winnerIds.has(stableId),
      }).eq('hand_id', handId).eq('player_id', stableId));
    });

  const playerResults = await Promise.allSettled(updatePromises);
  const failures = playerResults.filter(r => r.status === 'rejected');
  if (failures.length > 0) {
    const log = require('../../logs/logger');
    log.error('db', 'end_hand_partial', 'Some hand_players updates failed', { handId, count: failures.length });
  }
  if (failures.length === playerResults.length && playerResults.length > 0) {
    throw new Error('All hand_players updates failed');
  }

  await q(supabase.from('hands').update({
    ended_at:           now,
    board:              state.board || [],
    final_pot:          state.showdown_result?.potAwarded ?? state.pot ?? 0,
    winner_id:          winnerIdForDb,
    winner_name:        state.winner_name || null,
    phase_ended:        phaseEnded,
    completed_normally: completedNormally,
  }).eq('hand_id', handId));
}

async function recordDeal(handId, players) {
  if (!players?.length) return;
  const rows = players.filter(p => p.hole_cards?.length > 0);
  if (!rows.length) return;
  await Promise.allSettled(
    rows.map(p =>
      q(supabase.from('hand_players')
        .update({ hole_cards: p.hole_cards })
        .eq('hand_id', handId)
        .eq('player_id', p.id)
      )
    )
  );
}

async function markIncomplete(handId, state = null) {
  const update = { completed_normally: false };
  if (state) {
    if (state.board?.length > 0) update.board = state.board;
    if (state.pot > 0) update.final_pot = state.pot;
    if (state.phase) update.phase_ended = state.phase;
  }
  await q(supabase.from('hands').update(update).eq('hand_id', handId));

  if (state?.players) {
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    await Promise.allSettled(
      (state.players || [])
        .filter(p => p.hole_cards?.length > 0 && uuidRe.test(p.stableId || p.id))
        .map(p => q(supabase.from('hand_players')
          .update({ hole_cards: p.hole_cards })
          .eq('hand_id', handId)
          .eq('player_id', p.stableId || p.id)
        ))
    );
  }
}

async function logStackAdjustment(sessionId, playerId, amount) {
  if (!sessionId || !playerId || !amount) return;
  await q(supabase.from('stack_adjustments').insert({
    session_id: sessionId,
    player_id:  playerId,
    amount:     Number(amount),
    created_at: new Date().toISOString(),
  }));
}

async function markLastActionReverted(handId) {
  const rows = await q(
    supabase.from('hand_actions')
      .select('id')
      .eq('hand_id', handId)
      .eq('is_reverted', false)
      .order('id', { ascending: false })
      .limit(1)
  );
  if (rows?.length > 0) {
    await q(supabase.from('hand_actions').update({ is_reverted: true }).eq('id', rows[0].id));
  }
}

// ─── Query API ────────────────────────────────────────────────────────────────

async function getHands({ tableId = null, limit = 20, offset = 0 } = {}) {
  let query = supabase
    .from('hands')
    .select('hand_id, session_id, table_id, started_at, ended_at, board, final_pot, winner_name, phase_ended, completed_normally, dealer_seat, is_scenario_hand, hand_tags(tag, tag_type)')
    .order('started_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (tableId) query = query.eq('table_id', tableId);

  const data = await q(query);
  return (data || []).map(h => ({
    hand_id:            h.hand_id,
    session_id:         h.session_id,
    table_id:           h.table_id,
    started_at:         h.started_at,
    ended_at:           h.ended_at,
    board:              h.board || [],
    final_pot:          h.final_pot,
    winner_name:        h.winner_name,
    phase_ended:        h.phase_ended,
    completed_normally: h.completed_normally,
    dealer_seat:        h.dealer_seat,
    is_scenario_hand:   h.is_scenario_hand,
    ...parseTags(h.hand_tags),
  }));
}

async function getHandDetail(handId) {
  const data = await q(
    supabase.from('hands')
      .select('*, hand_tags(tag, tag_type), hand_players(*), hand_actions(*)')
      .eq('hand_id', handId)
      .order('id', { referencedTable: 'hand_actions', ascending: true })
      .maybeSingle()
  );
  if (!data) return null;

  return {
    ...data,
    ...parseTags(data.hand_tags),
    board:   data.board || [],
    players: (data.hand_players || []).map(p => ({ ...p, hole_cards: p.hole_cards || [] })),
    actions: data.hand_actions || [],
    hand_tags:    undefined,
    hand_players: undefined,
    hand_actions: undefined,
  };
}

// ─── Hand History (filterable browser) ───────────────────────────────────────

/**
 * Returns a paginated, filterable list of hands for the history browser.
 *
 * When `playerId` is provided the query starts from `hand_players` so that
 * per-player net chips (stack_end − stack_start) can be included.  When
 * omitted (coach all-hands view) the query runs directly on `hands`.
 *
 * Tag filtering is resolved in a pre-pass: we get the set of hand_ids that
 * carry the requested tags, then filter the main query with an IN clause.
 * Mistakes-only and explicit tag lists are intersected (both must match).
 */
async function getHandHistory({
  playerId     = null,
  tableId      = null,
  startDate    = null,
  endDate      = null,
  tags         = [],
  scenariosOnly = false,
  mistakesOnly  = false,
  limit  = 25,
  offset = 0,
} = {}) {
  // ── 1. Resolve tag/mistake filter into a hand_id set ────────────────────
  let tagHandIds = null;
  if (tags.length > 0 || mistakesOnly) {
    const promises = [];
    if (tags.length > 0) {
      promises.push(supabase.from('hand_tags').select('hand_id').in('tag', tags));
    }
    if (mistakesOnly) {
      promises.push(supabase.from('hand_tags').select('hand_id').eq('tag_type', 'mistake'));
    }
    const results = await Promise.all(promises);
    for (const r of results) {
      if (r.error) throw new Error(r.error.message);
    }

    if (tags.length > 0 && mistakesOnly) {
      // Intersection: hand must have a selected tag AND at least one mistake tag
      const tagSet     = new Set((results[0].data || []).map(r => r.hand_id));
      const mistakeSet = new Set((results[1].data || []).map(r => r.hand_id));
      tagHandIds = [...tagSet].filter(id => mistakeSet.has(id));
    } else {
      tagHandIds = [...new Set((results[0].data || []).map(r => r.hand_id))];
    }
    if (tagHandIds.length === 0) return { hands: [], total: 0, limit, offset };
  }

  // ── 2. Execute data + count queries ─────────────────────────────────────
  if (playerId) {
    // Build filter applicator for the hand_players base table
    const applyFilters = (q2) => {
      if (tableId)      q2 = q2.eq('hands.table_id',         tableId);
      if (startDate)    q2 = q2.gte('hands.started_at',       startDate);
      if (endDate)      q2 = q2.lte('hands.started_at',       endDate);
      if (scenariosOnly) q2 = q2.eq('hands.is_scenario_hand', true);
      if (tagHandIds)   q2 = q2.in('hands.hand_id',           tagHandIds);
      return q2;
    };

    const dataQ = applyFilters(
      supabase
        .from('hand_players')
        .select('stack_start, stack_end, is_winner, hands!inner(hand_id, started_at, final_pot, winner_name, phase_ended, table_id, is_scenario_hand, hand_tags(tag, tag_type))')
        .eq('player_id', playerId)
        .order('started_at', { foreignTable: 'hands', ascending: false })
        .range(offset, offset + limit - 1)
    );
    const countQ = applyFilters(
      supabase
        .from('hand_players')
        .select('hands!inner(hand_id)', { count: 'exact', head: true })
        .eq('player_id', playerId)
    );

    const [{ data, error: dataErr }, { count, error: countErr }] = await Promise.all([dataQ, countQ]);
    if (dataErr)  throw new Error(dataErr.message);
    if (countErr) throw new Error(countErr.message);

    const hands = (data || []).map(hp => ({
      hand_id:     hp.hands?.hand_id,
      started_at:  hp.hands?.started_at,
      final_pot:   hp.hands?.final_pot,
      winner_name: hp.hands?.winner_name,
      phase_ended: hp.hands?.phase_ended,
      table_id:    hp.hands?.table_id,
      is_scenario: hp.hands?.is_scenario_hand,
      ...parseTags(hp.hands?.hand_tags ?? []),
      net:         hp.stack_start != null && hp.stack_end != null
        ? hp.stack_end - hp.stack_start
        : null,
      is_winner:   hp.is_winner,
    }));
    return { hands, total: count ?? 0, limit, offset };

  } else {
    // No player filter — query directly from hands
    const applyFilters = (q2) => {
      if (tableId)      q2 = q2.eq('table_id',         tableId);
      if (startDate)    q2 = q2.gte('started_at',       startDate);
      if (endDate)      q2 = q2.lte('started_at',       endDate);
      if (scenariosOnly) q2 = q2.eq('is_scenario_hand', true);
      if (tagHandIds)   q2 = q2.in('hand_id',           tagHandIds);
      return q2;
    };

    const dataQ = applyFilters(
      supabase
        .from('hands')
        .select('hand_id, started_at, final_pot, winner_name, phase_ended, table_id, is_scenario_hand, hand_tags(tag, tag_type)')
        .order('started_at', { ascending: false })
        .range(offset, offset + limit - 1)
    );
    const countQ = applyFilters(
      supabase
        .from('hands')
        .select('*', { count: 'exact', head: true })
    );

    const [{ data, error: dataErr }, { count, error: countErr }] = await Promise.all([dataQ, countQ]);
    if (dataErr)  throw new Error(dataErr.message);
    if (countErr) throw new Error(countErr.message);

    const hands = (data || []).map(h => ({
      hand_id:     h.hand_id,
      started_at:  h.started_at,
      final_pot:   h.final_pot,
      winner_name: h.winner_name,
      phase_ended: h.phase_ended,
      table_id:    h.table_id,
      is_scenario: h.is_scenario_hand,
      ...parseTags(h.hand_tags ?? []),
      net: null,
    }));
    return { hands, total: count ?? 0, limit, offset };
  }
}

/** Returns all distinct tags (with type) that appear in hand_tags, for the filter UI. */
async function getDistinctHandTags() {
  const { data, error } = await supabase
    .from('hand_tags')
    .select('tag, tag_type');
  if (error) throw new Error(error.message);

  const seen = new Map();
  for (const row of (data || [])) {
    if (!seen.has(row.tag)) seen.set(row.tag, row.tag_type);
  }
  return [...seen.entries()].map(([tag, tag_type]) => ({ tag, tag_type }));
}

/** Returns distinct table IDs that appear in hands, for the table dropdown. */
async function getDistinctTableIds() {
  const { data, error } = await supabase
    .from('hands')
    .select('table_id');
  if (error) throw new Error(error.message);
  return [...new Set((data || []).map(r => r.table_id).filter(Boolean))];
}

/**
 * Search hand library for coach hand selection / scenario loading.
 *
 * Filters by:
 * - school_id (school scoping)
 * - text query (winner_name, hand_id substring)
 * - range filter (accepted but unimplemented for v1)
 *
 * Returns paginated list with total count.
 *
 * @param {string}   schoolId    — school scope
 * @param {string}   query       — text filter (winner name or hand_id)
 * @param {string[]} rangeFilter — hand range groups (e.g. ['AKo', 'QQ']) — unimplemented for v1
 * @param {number}   limit       — max results, default 20, capped at 100
 * @param {number}   offset      — pagination offset
 * @returns {Promise<{hands: Array, total: number}>}
 */
async function searchLibrary({ schoolId, query, rangeFilter = [], limit = 20, offset = 0 } = {}) {
  const safeLimit = Math.max(1, Math.min(100, limit));
  const safeOffset = Math.max(0, offset);

  let q = supabase.from('hands').select(
    'hand_id, started_at, ended_at, phase_ended, winner_name, final_pot, board, completed_normally',
    { count: 'exact' }
  );

  // School scope
  q = q.eq('school_id', schoolId);

  // Text search: winner_name or hand_id substring match
  if (query && query.trim()) {
    const term = query.trim().toLowerCase();
    // Use a filter instead of OR for better Supabase compatibility
    q = q.or(`winner_name.ilike.%${term}%,hand_id.like.${term}%`, { foreignTable: null });
  }

  // Range filter: accepted for API compatibility but not applied in v1
  // TODO: v2 — implement range filter as hand_players.hole_cards overlap check

  q = q.order('started_at', { ascending: false })
    .range(safeOffset, safeOffset + safeLimit - 1);

  const { data, count, error } = await q;
  if (error) {
    throw new Error(`searchLibrary failed: ${error.message}`);
  }

  return {
    hands: (data ?? []).map(h => ({
      hand_id: h.hand_id,
      started_at: h.started_at,
      ended_at: h.ended_at,
      phase_ended: h.phase_ended,
      winner_name: h.winner_name,
      final_pot: h.final_pot,
      board: h.board || [],
      completed_normally: h.completed_normally,
    })),
    total: count ?? 0,
  };
}

/**
 * Fetch hands for export (no pagination limit like searchLibrary).
 * School-scoped; optionally filtered by tableId.
 * Used by /api/exports/hands endpoint.
 *
 * @param {string} schoolId - School ID (from requireSchool middleware)
 * @param {string} [tableId] - Optional table ID filter
 * @param {number} [limit=10000] - Upper bound on rows (no hard cap for exports)
 * @returns {Promise<Array>} Array of hand objects with auto_tags aggregated
 */
async function getHandsForExport({ schoolId, tableId = null, limit = 10000 } = {}) {
  const safeLimit = Math.max(1, Math.min(limit, 10000)); // Up to 10k per call
  const safeOffset = 0;

  let query = supabase
    .from('hands')
    .select('hand_id, started_at, phase_ended, winner_name, final_pot, board, completed_normally', { count: 'exact' });

  // School scope
  query = query.eq('school_id', schoolId);

  // Table filter
  if (tableId) {
    query = query.eq('table_id', tableId);
  }

  query = query.order('started_at', { ascending: false })
    .range(safeOffset, safeOffset + safeLimit - 1);

  const { data, error } = await query;
  if (error) {
    throw new Error(`getHandsForExport failed: ${error.message}`);
  }

  // Fetch auto_tags for each hand separately (no junction table join in Supabase)
  const hands = data ?? [];
  const handIds = hands.map(h => h.hand_id);

  let autoTagsMap = {};
  if (handIds.length > 0) {
    const { data: tagsData, error: tagsError } = await supabase
      .from('hand_tags')
      .select('hand_id, tag')
      .in('hand_id', handIds)
      .eq('tag_type', 'auto');

    if (!tagsError && tagsData) {
      autoTagsMap = {};
      for (const row of tagsData) {
        if (!autoTagsMap[row.hand_id]) autoTagsMap[row.hand_id] = [];
        autoTagsMap[row.hand_id].push(row.tag);
      }
    }
  }

  return hands.map(h => ({
    hand_id: h.hand_id,
    started_at: h.started_at,
    phase_ended: h.phase_ended,
    winner_name: h.winner_name,
    final_pot: h.final_pot,
    board: h.board || [],
    completed_normally: h.completed_normally,
    auto_tags: autoTagsMap[h.hand_id] || [],
  }));
}

module.exports = {
  startHand, recordDeal, recordAction, endHand, markIncomplete, logStackAdjustment,
  markLastActionReverted, getHands, getHandDetail,
  getHandHistory, getDistinctHandTags, getDistinctTableIds, searchLibrary, getHandsForExport,
};
