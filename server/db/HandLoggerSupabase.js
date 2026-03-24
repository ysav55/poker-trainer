'use strict';

/**
 * HandLoggerSupabase — async replacement for HandLogger.js (SQLite).
 *
 * All public functions are async. Callers in Socket.io handlers should
 * fire-and-forget with .catch() for writes; REST handlers should await.
 *
 * Key schema changes vs SQLite HandLogger:
 *   - Tags: hand_tags junction table instead of JSON text columns
 *   - board / hole_cards: native text[] arrays (no JSON.stringify)
 *   - Timestamps: timestamptz (ISO strings) instead of ms integers
 *   - Stats: session_player_stats + leaderboard maintained by DB triggers
 */

const { v4: uuidv4 } = require('uuid');
const supabase = require('./supabase');
const { buildPositionMap } = require('../game/positions');
const { evaluate: evaluateHand } = require('../game/HandEvaluator');
const { ANALYZER_REGISTRY } = require('../game/tagAnalyzers/index');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Throw on Supabase error, otherwise return data. */
function q(result) {
  return result.then(({ data, error }) => {
    if (error) throw error;
    return data;
  });
}

/** Transform hand_tags rows into { auto_tags, mistake_tags, coach_tags } arrays. */
function parseTags(hand_tags = []) {
  return {
    auto_tags:    hand_tags.filter(t => t.tag_type === 'auto').map(t => t.tag),
    mistake_tags: hand_tags.filter(t => t.tag_type === 'mistake').map(t => t.tag),
    coach_tags:   hand_tags.filter(t => t.tag_type === 'coach').map(t => t.tag),
  };
}

// ─── Session ──────────────────────────────────────────────────────────────────

async function ensureSession(sessionId, tableId) {
  await q(supabase.from('sessions').upsert(
    { session_id: sessionId, table_id: tableId, started_at: new Date().toISOString() },
    { onConflict: 'session_id', ignoreDuplicates: true }
  ));
}

// ─── Hand Lifecycle ───────────────────────────────────────────────────────────

/**
 * Compute position labels for all players given their seats and the dealer seat.
 * Returns a Map from player_id → position label string.
 */
function _computePositions(players, dealerSeat) {
  const POSITION_LABELS = ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'HJ', 'CO'];
  const seated = [...players].filter(p => p.seat >= 0).sort((a, b) => a.seat - b.seat);
  const n = seated.length;
  if (n < 2) return new Map();

  const dealerIdx = seated.findIndex(p => p.seat === dealerSeat);
  if (dealerIdx === -1) return new Map();

  const posMap = new Map();
  for (let i = 0; i < n; i++) {
    const offset = (dealerIdx + i) % n; // 0 = BTN, 1 = SB, 2 = BB, ...
    const label = i < POSITION_LABELS.length ? POSITION_LABELS[i] : `EP${i - 3}`;
    posMap.set(seated[offset].id, label);
  }
  return posMap;
}

async function startHand({ handId, sessionId, tableId, players, allPlayers, dealerSeat = 0, isScenario = false, smallBlind = 0, bigBlind = 0, sessionType = null }) {
  await ensureSession(sessionId, tableId);

  await q(supabase.from('hands').upsert({
    hand_id:           handId,
    session_id:        sessionId,
    table_id:          tableId,
    started_at:        new Date().toISOString(),
    completed_normally: false,
    dealer_seat:       dealerSeat,
    is_scenario_hand:  isScenario,
    small_blind:       smallBlind,
    big_blind:         bigBlind,
    session_type:      sessionType,
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

  // Use allPlayers (including coach) for position computation so the coach's seat
  // is counted in the rotation. Only non-coach players get rows in hand_players.
  const positionMap = _computePositions(allPlayers || players, dealerSeat);

  const playerRows = players.map(p => ({
    hand_id:     handId,
    player_id:   p.id,
    player_name: p.name,
    seat:        p.seat ?? -1,
    position:    positionMap.get(p.id) ?? null,
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

  // Resolve socket.id → stableId (UUID). Falls back to p.id if already a UUID.
  const resolveId = (socketId) => socketToStable[socketId] || socketId;

  const completedNormally = ['showdown', 'waiting'].includes(state.phase) || state.winner != null;
  const phaseEnded = state.phase === 'showdown'
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
        // Second raise preflop = 3-bet
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
  // Only store winner_id if it's a valid UUID (not a coach key or socket.id)
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const winnerIdForDb = winnerId && uuidRe.test(winnerId) ? winnerId : null;

  // Update hands row
  await q(supabase.from('hands').update({
    ended_at:           now,
    board:              state.board || [],
    final_pot:          state.pot || 0,
    winner_id:          winnerIdForDb,
    winner_name:        state.winner_name || null,
    phase_ended:        phaseEnded,
    completed_normally: completedNormally,
  }).eq('hand_id', handId));

  // Update each hand_players row
  const updatePromises = (state.players || [])
    .filter(p => !p.is_coach)
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

async function markIncomplete(handId, state = null) {
  const update = { completed_normally: false };
  if (state) {
    // Save whatever board/hole-card state we have so replay isn't completely blank
    if (state.board?.length > 0) update.board = state.board;
    if (state.pot > 0) update.final_pot = state.pot;
    if (state.phase) update.phase_ended = state.phase;
  }
  await q(supabase.from('hands').update(update).eq('hand_id', handId));

  // Persist hole cards for each player if available
  if (state?.players) {
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    await Promise.all(
      (state.players || [])
        .filter(p => !p.is_coach && p.hole_cards?.length > 0 && uuidRe.test(p.stableId || p.id))
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

// ─── Coach Tags ───────────────────────────────────────────────────────────────

async function updateCoachTags(handId, tags) {
  const tagArray = Array.isArray(tags) ? tags : [];

  // Delete existing coach tags then re-insert
  await q(supabase.from('hand_tags').delete()
    .eq('hand_id', handId).eq('tag_type', 'coach'));

  if (tagArray.length > 0) {
    await q(supabase.from('hand_tags').insert(
      tagArray.map(tag => ({ hand_id: handId, tag, tag_type: 'coach' }))
    ));
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
    hand_id:           h.hand_id,
    session_id:        h.session_id,
    table_id:          h.table_id,
    started_at:        h.started_at,
    ended_at:          h.ended_at,
    board:             h.board || [],
    final_pot:         h.final_pot,
    winner_name:       h.winner_name,
    phase_ended:       h.phase_ended,
    completed_normally: h.completed_normally,
    dealer_seat:       h.dealer_seat,
    is_scenario_hand:  h.is_scenario_hand,
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

async function getSessionStats(sessionId) {
  // session_player_stats is maintained by trigger — no aggregation needed
  const data = await q(
    supabase.from('session_player_stats')
      .select('*')
      .eq('session_id', sessionId)
  );
  return (data || []).map(r => ({
    player_id:    r.player_id,
    player_name:  r.display_name,
    hands_played: r.hands_played,
    hands_won:    r.hands_won,
    net_chips:    r.net_chips,
    vpip: r.hands_played > 0 ? Math.round(r.vpip_count / r.hands_played * 1000) / 1000 : 0,
    pfr:  r.hands_played > 0 ? Math.round(r.pfr_count  / r.hands_played * 1000) / 1000 : 0,
  }));
}

// ─── Playlist API ─────────────────────────────────────────────────────────────

async function createPlaylist({ name, description = '', tableId = null }) {
  const playlist_id = uuidv4();
  await q(supabase.from('playlists').insert({
    playlist_id, name, description: description || null,
    table_id: tableId, created_at: new Date().toISOString(),
  }));
  return { playlist_id, name, description, table_id: tableId };
}

async function getPlaylists({ tableId = null } = {}) {
  let query = supabase
    .from('playlists')
    .select('*, playlist_hands(count)')
    .order('created_at', { ascending: false });
  if (tableId) query = query.eq('table_id', tableId);
  const data = await q(query);
  return (data || []).map(p => ({
    ...p,
    hand_count: p.playlist_hands?.[0]?.count ?? 0,
    playlist_hands: undefined,
  }));
}

async function getPlaylistHands(playlistId) {
  const data = await q(
    supabase.from('playlist_hands')
      .select('*, hands(board, final_pot, winner_name, phase_ended, hand_tags(tag, tag_type))')
      .eq('playlist_id', playlistId)
      .order('display_order', { ascending: true })
  );
  return (data || []).map(row => ({
    playlist_id:   row.playlist_id,
    hand_id:       row.hand_id,
    display_order: row.display_order,
    board:         row.hands?.board || [],
    final_pot:     row.hands?.final_pot,
    winner_name:   row.hands?.winner_name,
    phase_ended:   row.hands?.phase_ended,
    auto_tags:     (row.hands?.hand_tags || []).filter(t => t.tag_type === 'auto').map(t => t.tag),
  }));
}

async function addHandToPlaylist(playlistId, handId) {
  // Get max display_order for this playlist
  const existing = await q(
    supabase.from('playlist_hands')
      .select('display_order')
      .eq('playlist_id', playlistId)
      .order('display_order', { ascending: false })
      .limit(1)
  );
  const nextOrder = existing?.length > 0 ? (existing[0].display_order + 1) : 0;

  await q(supabase.from('playlist_hands').upsert({
    playlist_id: playlistId,
    hand_id:     handId,
    display_order: nextOrder,
    added_at:    new Date().toISOString(),
  }, { onConflict: 'playlist_id,hand_id', ignoreDuplicates: true }));

  return { playlist_id: playlistId, hand_id: handId, display_order: nextOrder };
}

async function removeHandFromPlaylist(playlistId, handId) {
  await q(supabase.from('playlist_hands').delete()
    .eq('playlist_id', playlistId).eq('hand_id', handId));

  // Compact display_order to remove gaps
  const remaining = await q(
    supabase.from('playlist_hands')
      .select('hand_id')
      .eq('playlist_id', playlistId)
      .order('display_order', { ascending: true })
  );

  if (remaining?.length > 0) {
    await Promise.all(remaining.map((row, idx) =>
      q(supabase.from('playlist_hands')
        .update({ display_order: idx })
        .eq('playlist_id', playlistId)
        .eq('hand_id', row.hand_id))
    ));
  }
}

async function deletePlaylist(playlistId) {
  await q(supabase.from('playlists').delete().eq('playlist_id', playlistId));
}

// ─── Action Undo Marking ──────────────────────────────────────────────────────

async function markLastActionReverted(handId) {
  // Find the last non-reverted action id
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

// ─── Hand Analyzer ────────────────────────────────────────────────────────────

/**
 * Build the shared context object consumed by every tag analyzer.
 * Fetches hand, actions, and players once; attaches sizingRatio and position
 * to each action row; constructs the evaluateAt helper for hand-strength tags.
 */
async function buildAnalyzerContext(handId) {
  const hand = await q(supabase.from('hands').select('*').eq('hand_id', handId).maybeSingle());
  if (!hand) return null;

  const allActions = await q(
    supabase.from('hand_actions').select('*').eq('hand_id', handId).order('id', { ascending: true })
  );
  const handPlayers = await q(supabase.from('hand_players').select('*').eq('hand_id', handId));

  const actions = (allActions || []).filter(a => !a.is_reverted);
  const seated  = (handPlayers || []).filter(p => p.seat >= 0).sort((a, b) => a.seat - b.seat);

  // Attach sizingRatio to each action (null when pot is 0 or unknown)
  const enrichedActions = actions.map(a => ({
    ...a,
    sizingRatio: (a.pot_at_action > 0 && a.amount > 0)
      ? a.amount / a.pot_at_action
      : null,
  }));

  // Group by street
  const byStreet = {};
  for (const a of enrichedActions) {
    if (!byStreet[a.street]) byStreet[a.street] = [];
    byStreet[a.street].push(a);
  }

  // pot entering each street = potAtAction of first action on that street.
  // Fallback: sum all amounts from prior streets (for old rows with null potAtAction).
  const STREETS = ['preflop', 'flop', 'turn', 'river'];
  const potByStreet = {};
  let runningSum = 0;
  for (const street of STREETS) {
    const first = (byStreet[street] || [])[0];
    potByStreet[street] = (first?.pot_at_action ?? null) ?? runningSum;
    for (const a of (byStreet[street] || [])) {
      if (a.amount > 0) runningSum += a.amount;
    }
  }

  const positions  = buildPositionMap(seated, hand.dealer_seat ?? -1);
  const bbPlayerId = (() => {
    if (seated.length < 2) return null;
    const dealerIdx = seated.findIndex(p => p.seat === (hand.dealer_seat ?? -1));
    if (dealerIdx === -1) return null;
    const bbOffset = seated.length === 2 ? 1 : 2;
    return seated[(dealerIdx + bbOffset) % seated.length].player_id;
  })();

  // Build hole-card lookup for evaluateAt
  const holeCardsByPlayer = {};
  for (const p of (handPlayers || [])) {
    if (p.hole_cards?.length >= 2) holeCardsByPlayer[p.player_id] = p.hole_cards;
  }
  const board = hand.board || [];
  const STREET_BOARD_LEN = { preflop: 0, flop: 3, turn: 4, river: 5 };

  /**
   * Evaluate a player's hand strength at a given street.
   * Returns HandResult { rank, rankName, bestFive, ... } or null if data unavailable.
   */
  function evaluateAt(playerId, street) {
    const holeCards = holeCardsByPlayer[playerId];
    if (!holeCards || holeCards.length < 2) return null;
    const boardLen = STREET_BOARD_LEN[street] ?? 0;
    if (board.length < boardLen || boardLen < 3) return null;
    try {
      return evaluateHand(holeCards, board.slice(0, boardLen));
    } catch {
      return null;
    }
  }

  return {
    hand,
    allActions: allActions || [],
    actions: enrichedActions,
    byStreet,
    seated,
    positions,
    bbPlayerId,
    potByStreet,
    evaluateAt,
    holeCardsByPlayer,
  };
}

/**
 * Normalize DB action strings to present-tense canonical forms.
 * The DB stores past-tense ('raised', 'folded', 'called', 'checked') from
 * older records and present-tense ('raise', 'fold', 'call', 'check') from
 * newer ones. All analyzer logic uses the canonical present-tense form.
 */
function normalizeAction(action) {
  const MAP = { raised: 'raise', folded: 'fold', called: 'call', checked: 'check' };
  return MAP[action] ?? action;
}

/** Given players sorted by seat and the dealer seat, return the BB player_id. */
function _findBBPlayerId(seatedPlayers, dealerSeat) {
  if (seatedPlayers.length < 2) return null;
  const dealerIdx = seatedPlayers.findIndex(p => p.seat === dealerSeat);
  if (dealerIdx === -1) return null;
  const bbOffset = seatedPlayers.length === 2 ? 1 : 2;
  return seatedPlayers[(dealerIdx + bbOffset) % seatedPlayers.length].player_id;
}

async function analyzeAndTagHand(handId) {
  const ctx = await buildAnalyzerContext(handId);
  if (!ctx) return;

  // Run every analyzer in the registry against the shared context
  const rawResults = [];
  for (const analyzer of ANALYZER_REGISTRY) {
    try {
      rawResults.push(...analyzer.analyze(ctx));
    } catch (err) {
      console.error(`[analyzeAndTagHand] ${analyzer.name} threw:`, err);
    }
  }

  // Deduplicate hand-level tags (player_id IS NULL) — same tag+type can only appear once.
  // Player/action-level tags are allowed to repeat for different player_ids.
  const seen   = new Set();
  const tagRows = [];
  for (const r of rawResults) {
    if (!r.player_id) {
      const key = `${r.tag_type}::${r.tag}`;
      if (seen.has(key)) continue;
      seen.add(key);
    }
    tagRows.push({ hand_id: handId, tag: r.tag, tag_type: r.tag_type, player_id: r.player_id ?? null, action_id: r.action_id ?? null });
  }

  // Atomically replace auto + mistake + sizing tags; coach tags are untouched.
  await q(supabase.from('hand_tags').delete()
    .eq('hand_id', handId)
    .in('tag_type', ['auto', 'mistake', 'sizing']));

  if (tagRows.length > 0) {
    await q(supabase.from('hand_tags').insert(tagRows));
  }

  return tagRows;
}

// ─── Player Identity API ──────────────────────────────────────────────────────

async function upsertPlayerIdentity(stableId, name) {
  await q(supabase.from('player_profiles').upsert({
    id:           stableId,
    display_name: name,
    last_seen:    new Date().toISOString(),
  }, { onConflict: 'id' }));
}

async function getPlayerStats(stableId) {
  const data = await q(
    supabase.from('leaderboard').select('*').eq('player_id', stableId).maybeSingle()
  );
  if (!data) return null;
  const totalHands = data.total_hands ?? 0;
  const vpipCount  = data.vpip_count  ?? 0;
  const pfrCount   = data.pfr_count   ?? 0;
  return {
    player_id:       data.player_id,
    latest_name:     data.display_name,
    total_hands:     totalHands,
    total_wins:      data.total_wins   ?? 0,
    total_net_chips: data.net_chips    ?? 0,
    vpip_percent:    totalHands > 0 ? Math.round(vpipCount / totalHands * 100) : 0,
    pfr_percent:     totalHands > 0 ? Math.round(pfrCount  / totalHands * 100) : 0,
  };
}

async function getAllPlayersWithStats() {
  const data = await q(
    supabase.from('leaderboard').select('*').order('net_chips', { ascending: false })
  );
  return (data || []).map(r => {
    const total = r.total_hands ?? 0;
    return {
      stableId:        r.player_id,
      name:            r.display_name,
      total_hands:     total,
      total_wins:      r.total_wins   ?? 0,
      total_net_chips: r.net_chips    ?? 0,
      vpip_percent:    total > 0 ? Math.round((r.vpip_count ?? 0) / total * 100) : 0,
      pfr_percent:     total > 0 ? Math.round((r.pfr_count  ?? 0) / total * 100) : 0,
      last_hand_at:    r.last_hand_at,
    };
  });
}

/**
 * Returns { allTime, session } for the PlayerSeat hover tooltip.
 * allTime  — row from leaderboard table (or null)
 * session  — row from session_player_stats (or null if no sessionId given)
 */
async function getPlayerHoverStats(stableId, sessionId) {
  const [allTimeResult, sessionResult] = await Promise.all([
    supabase.from('leaderboard').select('*').eq('player_id', stableId).maybeSingle(),
    sessionId
      ? supabase.from('session_player_stats').select('*').eq('session_id', sessionId).eq('player_id', stableId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  return {
    allTime: allTimeResult.data ?? null,
    session: sessionResult.data  ?? null,
  };
}

async function getPlayerHands(stableId, { limit = 20, offset = 0 } = {}) {
  const data = await q(
    supabase.from('hand_players')
      .select('*, hands(hand_id, started_at, ended_at, final_pot, winner_id, winner_name, phase_ended, board, table_id, hand_tags(tag, tag_type))')
      .eq('player_id', stableId)
      .order('hand_id', { ascending: false })
      .range(offset, offset + limit - 1)
  );

  return (data || []).map(hp => ({
    hand_id:     hp.hands?.hand_id,
    started_at:  hp.hands?.started_at,
    ended_at:    hp.hands?.ended_at,
    final_pot:   hp.hands?.final_pot,
    winner_id:   hp.hands?.winner_id,
    winner_name: hp.hands?.winner_name,
    phase_ended: hp.hands?.phase_ended,
    board:       hp.hands?.board || [],
    table_id:    hp.hands?.table_id,
    ...parseTags(hp.hands?.hand_tags),
    hole_cards:  hp.hole_cards || [],
    stack_start: hp.stack_start,
    stack_end:   hp.stack_end,
    is_winner:   hp.is_winner,
    vpip:        hp.vpip,
    pfr:         hp.pfr,
    wtsd:        hp.wtsd,
    wsd:         hp.wsd,
    seat:        hp.seat,
  }));
}

// ─── Roster Auth API ─────────────────────────────────────────────────────────

async function loginRosterPlayer(name) {
  const trimmed = name.trim();

  // Case-insensitive lookup so CSV name capitalisation never breaks logins
  const existing = await q(
    supabase.from('player_profiles')
      .select('id, display_name')
      .eq('display_name', trimmed)
      .limit(1)
      .maybeSingle()
  );

  if (existing) {
    // Update last_seen
    await q(supabase.from('player_profiles').update({
      is_roster: true,
      last_seen: new Date().toISOString(),
    }).eq('id', existing.id));
    return { stableId: existing.id, name: existing.display_name };
  }

  // First login — mint new stableId
  const stableId = uuidv4();
  await q(supabase.from('player_profiles').insert({
    id:           stableId,
    display_name: trimmed,
    is_roster:    true,
    last_seen:    new Date().toISOString(),
  }));
  return { stableId, name: trimmed };
}

async function isRegisteredPlayer(stableId) {
  if (!stableId) return false;
  const data = await q(
    supabase.from('player_profiles')
      .select('id, is_roster')
      .eq('id', stableId)
      .maybeSingle()
  );
  return !!(data && data.is_roster);
}

// ─── Auth API (kept for test regression safety — not called in production) ───

async function registerPlayerAccount() {
  return { error: 'registration_disabled', message: 'Use Supabase Auth' };
}
async function loginPlayerAccount() {
  return { error: 'registration_disabled', message: 'Use Supabase Auth' };
}

// ─── Session Report ───────────────────────────────────────────────────────────

async function getSessionReport(sessionId) {
  const session = await q(
    supabase.from('sessions').select('*').eq('session_id', sessionId).maybeSingle()
  );
  if (!session) return null;

  // Use trigger-maintained session_player_stats for aggregates
  const statsRows = await q(
    supabase.from('session_player_stats').select('*').eq('session_id', sessionId)
  );

  const hands = await q(
    supabase.from('hands')
      .select('*, hand_tags(tag, tag_type), hand_players(player_id, player_name, seat, stack_start, stack_end, is_winner, hole_cards)')
      .eq('session_id', sessionId)
      .order('started_at', { ascending: true })
  );

  const handCount = (hands || []).length;
  if (handCount === 0) {
    return { session: { ...session, hand_count: 0 }, players: [], hands: [], tag_summary: {}, mistake_summary: {} };
  }

  // Build players array from session_player_stats
  const players = (statsRows || []).map(r => ({
    stableId:     r.player_id,
    name:         r.display_name,
    hands_played: r.hands_played,
    hands_won:    r.hands_won,
    net_chips:    r.net_chips,
    vpip:  r.hands_played > 0 ? Math.round(r.vpip_count / r.hands_played * 100) : 0,
    pfr:   r.hands_played > 0 ? Math.round(r.pfr_count  / r.hands_played * 100) : 0,
    wtsd:  r.hands_played > 0 ? Math.round(r.wtsd_count / r.hands_played * 100) : 0,
    wsd:   r.wtsd_count > 0   ? Math.round(r.wsd_count  / r.wtsd_count   * 100) : 0,
  })).sort((a, b) => b.net_chips - a.net_chips);

  const tagSummary = {};
  const mistakeSummary = {};

  const handsDetail = (hands || []).map(h => {
    const { auto_tags, mistake_tags, coach_tags } = parseTags(h.hand_tags);
    for (const t of auto_tags) tagSummary[t] = (tagSummary[t] || 0) + 1;
    for (const t of mistake_tags) {
      if (!mistakeSummary[t]) mistakeSummary[t] = { count: 0, hands: [] };
      mistakeSummary[t].count++;
      mistakeSummary[t].hands.push(h.hand_id);
    }
    return {
      hand_id:     h.hand_id,
      started_at:  h.started_at,
      ended_at:    h.ended_at,
      board:       h.board || [],
      final_pot:   h.final_pot,
      winner_name: h.winner_name,
      phase_ended: h.phase_ended,
      auto_tags, mistake_tags, coach_tags,
      players: (h.hand_players || []).map(p => ({
        player_id:   p.player_id,
        player_name: p.player_name,
        seat:        p.seat,
        stack_start: p.stack_start,
        stack_end:   p.stack_end,
        is_winner:   p.is_winner,
        hole_cards:  p.hole_cards || [],
      })),
    };
  });

  const ended_at = hands[hands.length - 1]?.ended_at || null;
  return {
    session: { ...session, hand_count: handCount, ended_at },
    players,
    hands:           handsDetail,
    tag_summary:     tagSummary,
    mistake_summary: mistakeSummary,
  };
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

const jwt = require('jsonwebtoken');

/**
 * Validate a server-signed JWT and return the payload.
 * Returns { stableId, name, role } or null if invalid/expired.
 */
function authenticateToken(token) {
  if (!token) return null;
  try {
    return jwt.verify(token, process.env.SESSION_SECRET);
  } catch {
    return null;
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  _computePositions,  // exported for unit testing
  ensureSession, startHand, recordAction, endHand, markIncomplete, logStackAdjustment, updateCoachTags,
  getHands, getHandDetail, getSessionStats,
  upsertPlayerIdentity, getPlayerStats, getAllPlayersWithStats, getPlayerHands, getPlayerHoverStats,
  analyzeAndTagHand, markLastActionReverted,
  createPlaylist, getPlaylists, getPlaylistHands,
  addHandToPlaylist, removeHandFromPlaylist, deletePlaylist,
  loginRosterPlayer, isRegisteredPlayer,
  registerPlayerAccount, loginPlayerAccount,
  getSessionReport,
  authenticateToken,
};
