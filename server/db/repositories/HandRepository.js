'use strict';

const supabase = require('../supabase');
const { q, parseTags } = require('../utils');
const { buildPositionMap } = require('../../game/positions');
const { ensureSession } = require('./SessionRepository');

// ─── Hand Lifecycle ───────────────────────────────────────────────────────────

async function startHand({ handId, sessionId, tableId, players, allPlayers, dealerSeat = 0, isScenario = false, smallBlind = 0, bigBlind = 0, sessionType = null }) {
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

  await q(supabase.from('hands').update({
    ended_at:           now,
    board:              state.board || [],
    final_pot:          state.showdown_result?.potAwarded ?? state.pot ?? 0,
    winner_id:          winnerIdForDb,
    winner_name:        state.winner_name || null,
    phase_ended:        phaseEnded,
    completed_normally: completedNormally,
  }).eq('hand_id', handId));

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

  await Promise.all(updatePromises);
}

async function recordDeal(handId, players) {
  if (!players?.length) return;
  const rows = players.filter(p => p.hole_cards?.length > 0);
  if (!rows.length) return;
  await Promise.all(
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
    await Promise.all(
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

module.exports = {
  startHand, recordDeal, recordAction, endHand, markIncomplete, logStackAdjustment,
  markLastActionReverted, getHands, getHandDetail,
};
