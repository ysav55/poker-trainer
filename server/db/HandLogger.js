'use strict';

const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

/**
 * HandLogger — records hand history to SQLite.
 *
 * API:
 *   ensureSession(sessionId, tableId)
 *   startHand({ handId, sessionId, tableId, players })
 *   recordAction({ handId, playerId, playerName, street, action, amount, isManualScenario })
 *   endHand({ handId, state })       — state = gm.state at end of hand
 *   markIncomplete(handId)           — called on crash / mid-hand disconnect of all players
 *
 * players shape: [{ id, name, seat, stack }]
 * state shape:   { phase, board, pot, winner, winner_name, players, showdown_result }
 */

const { getDb } = require('./Database');

// Prepared statements (lazy-init, cached)
let _stmts = null;
function stmts() {
  if (_stmts) return _stmts;
  const db = getDb();
  _stmts = {
    upsertSession: db.prepare(`
      INSERT OR IGNORE INTO sessions (session_id, table_id, started_at)
      VALUES (@session_id, @table_id, @started_at)
    `),
    insertHand: db.prepare(`
      INSERT OR IGNORE INTO hands
        (hand_id, session_id, table_id, started_at, completed_normally, dealer_seat, is_scenario_hand, small_blind, big_blind)
      VALUES (@hand_id, @session_id, @table_id, @started_at, 0, @dealer_seat, @is_scenario_hand, @small_blind, @big_blind)
    `),
    insertHandPlayer: db.prepare(`
      INSERT OR IGNORE INTO hand_players
        (hand_id, player_id, player_name, seat, stack_start)
      VALUES (@hand_id, @player_id, @player_name, @seat, @stack_start)
    `),
    insertAction: db.prepare(`
      INSERT INTO hand_actions
        (hand_id, player_id, player_name, street, action, amount, timestamp, is_manual_scenario)
      VALUES (@hand_id, @player_id, @player_name, @street, @action, @amount, @timestamp, @is_manual_scenario)
    `),
    updateHandEnd: db.prepare(`
      UPDATE hands SET
        ended_at = @ended_at,
        board = @board,
        final_pot = @final_pot,
        winner_id = @winner_id,
        winner_name = @winner_name,
        phase_ended = @phase_ended,
        completed_normally = @completed_normally
      WHERE hand_id = @hand_id
    `),
    updateHandPlayer: db.prepare(`
      UPDATE hand_players SET
        stack_end  = @stack_end,
        hole_cards = @hole_cards,
        is_winner  = @is_winner,
        vpip       = @vpip,
        pfr        = @pfr,
        wtsd       = @wtsd,
        wsd        = @wsd
      WHERE hand_id = @hand_id AND player_id = @player_id
    `),
    // Gap 2: fetch preflop actions to compute accurate VPIP/PFR
    getPreflopActions: db.prepare(`
      SELECT player_id, action FROM hand_actions
      WHERE hand_id = ? AND street = 'preflop' AND is_reverted = 0
    `),
    markIncomplete: db.prepare(`
      UPDATE hands SET completed_normally = 0 WHERE hand_id = @hand_id
    `),
    // Query helpers
    getHands: db.prepare(`
      SELECT hand_id, session_id, table_id, started_at, ended_at,
             board, final_pot, winner_name, phase_ended, completed_normally,
             auto_tags, coach_tags, dealer_seat, is_scenario_hand
      FROM hands
      WHERE (@table_id IS NULL OR table_id = @table_id)
      ORDER BY started_at DESC
      LIMIT @limit OFFSET @offset
    `),
    getHandById: db.prepare(`SELECT * FROM hands WHERE hand_id = ?`),
    getHandPlayers: db.prepare(`SELECT * FROM hand_players WHERE hand_id = ?`),
    getHandActions: db.prepare(`SELECT * FROM hand_actions WHERE hand_id = ? ORDER BY id`),
    // Playlist CRUD
    insertPlaylist: db.prepare(`
      INSERT INTO playlists (playlist_id, name, description, table_id, created_at)
      VALUES (@playlist_id, @name, @description, @table_id, @created_at)
    `),
    getPlaylists: db.prepare(`
      SELECT p.*, COUNT(ph.hand_id) AS hand_count
      FROM playlists p
      LEFT JOIN playlist_hands ph ON p.playlist_id = ph.playlist_id
      WHERE (@table_id IS NULL OR p.table_id = @table_id)
      GROUP BY p.playlist_id
      ORDER BY p.created_at DESC
    `),
    getPlaylistById: db.prepare(`SELECT * FROM playlists WHERE playlist_id = ?`),
    deletePlaylist: db.prepare(`DELETE FROM playlists WHERE playlist_id = ?`),
    insertPlaylistHand: db.prepare(`
      INSERT OR IGNORE INTO playlist_hands (playlist_id, hand_id, display_order, added_at)
      VALUES (@playlist_id, @hand_id, @display_order, @added_at)
    `),
    getPlaylistHands: db.prepare(`
      SELECT ph.*, h.board, h.final_pot, h.winner_name, h.phase_ended, h.auto_tags
      FROM playlist_hands ph
      JOIN hands h ON ph.hand_id = h.hand_id
      WHERE ph.playlist_id = ?
      ORDER BY ph.display_order ASC
    `),
    getMaxDisplayOrder: db.prepare(`
      SELECT COALESCE(MAX(display_order), -1) AS max_order
      FROM playlist_hands WHERE playlist_id = ?
    `),
    removePlaylistHand: db.prepare(`
      DELETE FROM playlist_hands WHERE playlist_id = ? AND hand_id = ?
    `),
    reorderPlaylistHands: db.prepare(`
      UPDATE playlist_hands SET display_order = @display_order
      WHERE playlist_id = @playlist_id AND hand_id = @hand_id
    `),
    // Auto-tagging
    updateHandTags: db.prepare(`
      UPDATE hands SET auto_tags = @auto_tags, mistake_tags = @mistake_tags
      WHERE hand_id = @hand_id
    `),
    updateCoachTags: db.prepare(`UPDATE hands SET coach_tags = @coach_tags WHERE hand_id = @hand_id`),
    // Reverted action marking
    markLastActionReverted: db.prepare(`
      UPDATE hand_actions SET is_reverted = 1
      WHERE id = (
        SELECT id FROM hand_actions
        WHERE hand_id = @hand_id AND is_reverted = 0
        ORDER BY id DESC LIMIT 1
      )
    `),
    // Update getHandActions to include is_reverted
    getHandActionsAll: db.prepare(`SELECT * FROM hand_actions WHERE hand_id = ? ORDER BY id`),
    getSessionStats: db.prepare(`
      SELECT
        hp.player_id,
        hp.player_name,
        COUNT(*) AS hands_played,
        SUM(hp.is_winner) AS hands_won,
        SUM(hp.stack_end - hp.stack_start) AS net_chips,
        ROUND(CAST(SUM(hp.vpip) AS REAL) / COUNT(*), 3) AS vpip,
        ROUND(CAST(SUM(hp.pfr)  AS REAL) / COUNT(*), 3) AS pfr
      FROM hand_players hp
      JOIN hands h ON hp.hand_id = h.hand_id
      WHERE h.session_id = ?
      GROUP BY hp.player_id, hp.player_name
    `),
    upsertPlayerIdentity: db.prepare(`
      INSERT INTO player_identities (stable_id, last_known_name, last_seen)
      VALUES (@stable_id, @last_known_name, @last_seen)
      ON CONFLICT(stable_id) DO UPDATE SET
        last_known_name = excluded.last_known_name,
        last_seen       = excluded.last_seen
    `),
    getPlayerStats: db.prepare(`
      SELECT
        hp.player_id,
        MAX(hp.player_name) AS latest_name,
        COUNT(hp.hand_id)   AS total_hands,
        SUM(hp.is_winner)   AS total_wins,
        SUM(hp.stack_end - hp.stack_start) AS total_net_chips,
        ROUND(CAST(SUM(hp.vpip) AS REAL) / COUNT(*) * 100, 1) AS vpip_percent,
        ROUND(CAST(SUM(hp.pfr)  AS REAL) / COUNT(*) * 100, 1) AS pfr_percent
      FROM hand_players hp
      WHERE hp.player_id = ?
      GROUP BY hp.player_id
    `),
    // Auth statements (Epic 15)
    getPlayerByName: db.prepare(`SELECT * FROM player_identities WHERE last_known_name = ? COLLATE NOCASE`),
    getPlayerByEmail: db.prepare(`SELECT * FROM player_identities WHERE email = ? COLLATE NOCASE`),
    getPlayerById: db.prepare(`SELECT * FROM player_identities WHERE stable_id = ?`),
    registerPlayer: db.prepare(`
      INSERT INTO player_identities (stable_id, last_known_name, display_name, email, password_hash, last_seen)
      VALUES (@stable_id, @name, @name, @email, @password_hash, @last_seen)
    `),
    // Stats dashboard statements
    getAllRegisteredPlayers: db.prepare(`
      SELECT stable_id, last_known_name, last_seen, email
      FROM player_identities
      ORDER BY last_seen DESC
    `),
    getPlayerHandHistory: db.prepare(`
      SELECT
        h.hand_id, h.started_at, h.ended_at, h.final_pot, h.winner_id, h.winner_name,
        h.phase_ended, h.board, h.auto_tags, h.mistake_tags, h.coach_tags, h.table_id,
        hp.hole_cards, hp.stack_start, hp.stack_end, hp.is_winner,
        hp.vpip, hp.pfr, hp.wtsd, hp.wsd, hp.seat
      FROM hand_players hp
      JOIN hands h ON hp.hand_id = h.hand_id
      WHERE hp.player_id = ?
      ORDER BY h.started_at DESC
      LIMIT ? OFFSET ?
    `),
    getPlayerAggStats: db.prepare(`
      SELECT
        hp.player_id,
        MAX(hp.player_name) AS latest_name,
        COUNT(hp.hand_id)   AS total_hands,
        SUM(hp.is_winner)   AS total_wins,
        SUM(hp.stack_end - hp.stack_start) AS total_net_chips,
        ROUND(CAST(SUM(hp.vpip) AS REAL) / COUNT(*) * 100, 1) AS vpip_percent,
        ROUND(CAST(SUM(hp.pfr)  AS REAL) / COUNT(*) * 100, 1) AS pfr_percent,
        MAX(h.started_at) AS last_hand_at
      FROM hand_players hp
      JOIN hands h ON hp.hand_id = h.hand_id
      WHERE hp.player_id = ?
      GROUP BY hp.player_id
    `)
  };
  return _stmts;
}

// ─── Public API ───────────────────────────────────────────────────────────────

function ensureSession(sessionId, tableId) {
  stmts().upsertSession.run({ session_id: sessionId, table_id: tableId, started_at: Date.now() });
}

function startHand({ handId, sessionId, tableId, players, dealerSeat = 0, isScenario = false, smallBlind = 0, bigBlind = 0 }) {
  const db = getDb();
  const now = Date.now();
  const s = stmts();

  db.transaction(() => {
    ensureSession(sessionId, tableId);
    s.insertHand.run({
      hand_id: handId, session_id: sessionId, table_id: tableId, started_at: now,
      dealer_seat: dealerSeat, is_scenario_hand: isScenario ? 1 : 0, small_blind: smallBlind, big_blind: bigBlind
    });
    for (const p of players) {
      s.insertHandPlayer.run({
        hand_id: handId, player_id: p.id, player_name: p.name,
        seat: p.seat ?? -1, stack_start: p.stack ?? 0
      });
    }
  })();
}

function recordAction({ handId, playerId, playerName, street, action, amount = 0, isManualScenario = false }) {
  stmts().insertAction.run({
    hand_id: handId, player_id: playerId, player_name: playerName,
    street, action, amount: amount || 0, timestamp: Date.now(),
    is_manual_scenario: isManualScenario ? 1 : 0
  });
}

function endHand({ handId, state }) {
  const db = getDb();
  const s = stmts();
  const now = Date.now();

  // Determine if hand ended normally (reached showdown or fold-to-one)
  const completedNormally = ['showdown', 'waiting'].includes(state.phase) ||
    (state.winner != null) ? 1 : 0;

  const phaseEnded = state.phase === 'showdown'
    ? 'showdown'
    : state.winner != null ? 'fold_to_one' : state.phase;

  // Gap 2: compute VPIP/PFR from actual preflop actions, not from final game-state action
  const preflopActions = s.getPreflopActions.all(handId);
  const preflopByPlayer = {};
  for (const row of preflopActions) {
    if (!preflopByPlayer[row.player_id]) preflopByPlayer[row.player_id] = { vpip: 0, pfr: 0 };
    // Accept both verb forms: 'call'/'called', 'raise'/'raised', 'all-in'
    if (['call', 'called', 'raise', 'raised', 'all-in'].includes(row.action))
      preflopByPlayer[row.player_id].vpip = 1;
    if (['raise', 'raised'].includes(row.action))
      preflopByPlayer[row.player_id].pfr  = 1;
  }

  // Gap 3: WTSD = hand reached showdown; WSD = player won at showdown
  const reachedShowdown = phaseEnded === 'showdown' ? 1 : 0;
  const winnerIds = new Set();
  if (state.showdown_result) {
    state.showdown_result.winners.forEach(w => winnerIds.add(w.playerId));
  } else if (state.winner) {
    winnerIds.add(state.winner);
  }

  db.transaction(() => {
    s.updateHandEnd.run({
      hand_id: handId,
      ended_at: now,
      board: JSON.stringify(state.board || []),
      final_pot: state.pot || 0,
      winner_id: state.winner || null,
      winner_name: state.winner_name || null,
      phase_ended: phaseEnded,
      completed_normally: completedNormally
    });

    for (const p of (state.players || [])) {
      if (p.is_coach) continue;
      const pf = preflopByPlayer[p.id] || { vpip: 0, pfr: 0 };
      s.updateHandPlayer.run({
        hand_id: handId,
        player_id: p.id,
        stack_end: p.stack ?? 0,
        hole_cards: JSON.stringify(p.hole_cards || []),
        is_winner: winnerIds.has(p.id) ? 1 : 0,
        vpip: pf.vpip,
        pfr:  pf.pfr,
        wtsd: reachedShowdown,
        wsd:  (reachedShowdown && winnerIds.has(p.id)) ? 1 : 0
      });
    }
  })();
}

function markIncomplete(handId) {
  stmts().markIncomplete.run({ hand_id: handId });
}

function updateCoachTags(handId, tags) {
  stmts().updateCoachTags.run({
    hand_id: handId,
    coach_tags: JSON.stringify(Array.isArray(tags) ? tags : [])
  });
}

// ─── Query API ────────────────────────────────────────────────────────────────

function getHands({ tableId = null, limit = 20, offset = 0 } = {}) {
  return stmts().getHands.all({ table_id: tableId, limit, offset });
}

function getHandDetail(handId) {
  const hand = stmts().getHandById.get(handId);
  if (!hand) return null;
  const players = stmts().getHandPlayers.all(handId);
  const actions = stmts().getHandActions.all(handId);
  return {
    ...hand,
    board: JSON.parse(hand.board || '[]'),
    auto_tags:    hand.auto_tags    ? JSON.parse(hand.auto_tags)    : [],
    coach_tags:   hand.coach_tags   ? JSON.parse(hand.coach_tags)   : [],
    mistake_tags: hand.mistake_tags ? JSON.parse(hand.mistake_tags) : [],
    players: players.map(p => ({ ...p, hole_cards: JSON.parse(p.hole_cards || '[]') })),
    actions
  };
}

function getSessionStats(sessionId) {
  return stmts().getSessionStats.all(sessionId);
}

// ─── Playlist API ─────────────────────────────────────────────────────────────

function createPlaylist({ name, description = '', tableId = null }) {
  const playlist_id = uuidv4();
  stmts().insertPlaylist.run({
    playlist_id, name, description,
    table_id: tableId, created_at: Date.now()
  });
  return { playlist_id, name, description, table_id: tableId };
}

function getPlaylists({ tableId = null } = {}) {
  return stmts().getPlaylists.all({ table_id: tableId });
}

function getPlaylistHands(playlistId) {
  const hands = stmts().getPlaylistHands.all(playlistId);
  return hands.map(h => ({
    ...h,
    auto_tags: h.auto_tags ? JSON.parse(h.auto_tags) : []
  }));
}

function addHandToPlaylist(playlistId, handId) {
  const maxRow = stmts().getMaxDisplayOrder.get(playlistId);
  const nextOrder = (maxRow?.max_order ?? -1) + 1;
  stmts().insertPlaylistHand.run({
    playlist_id: playlistId,
    hand_id: handId,
    display_order: nextOrder,
    added_at: Date.now()
  });
  return { playlist_id: playlistId, hand_id: handId, display_order: nextOrder };
}

function removeHandFromPlaylist(playlistId, handId) {
  stmts().removePlaylistHand.run(playlistId, handId);
  // Compact display_order to remove gaps after deletion.
  // ISS-56: the reorder loop runs inside a transaction for atomicity. Node.js is
  // single-threaded so concurrent interleaving with another removeHandFromPlaylist
  // call is impossible, but the transaction also prevents a partial update from
  // being visible if the process crashes mid-loop.
  const remaining = stmts().getPlaylistHands.all(playlistId);
  const db = getDb();
  db.transaction(() => {
    remaining.forEach((row, idx) => {
      stmts().reorderPlaylistHands.run({
        playlist_id: playlistId,
        hand_id: row.hand_id,
        display_order: idx
      });
    });
  })();
}

function deletePlaylist(playlistId) {
  stmts().deletePlaylist.run(playlistId);
}

// ─── Action Undo Marking ──────────────────────────────────────────────────────

function markLastActionReverted(handId) {
  stmts().markLastActionReverted.run({ hand_id: handId });
}

// ─── Hand Analyzer ────────────────────────────────────────────────────────────

/**
 * Given players sorted by seat and the dealer seat, return the BB player_id.
 * HU (2 players): BB = the non-dealer. 3+ players: BB = 2nd after dealer.
 */
function _findBBPlayerId(seatedPlayers, dealerSeat) {
  if (seatedPlayers.length < 2) return null;
  const dealerIdx = seatedPlayers.findIndex(p => p.seat === dealerSeat);
  if (dealerIdx === -1) return null;
  const bbOffset = seatedPlayers.length === 2 ? 1 : 2;
  const bbIdx = (dealerIdx + bbOffset) % seatedPlayers.length;
  return seatedPlayers[bbIdx].player_id;
}

/**
 * analyzeAndTagHand(handId)
 *
 * Runs pattern detection on the FINAL committed state of a hand
 * (actions where is_reverted = 0) and writes auto_tags + mistake_tags.
 *
 * Auto tags:
 *   WALK           — everyone folds to BB without a preflop raise
 *   3BET_POT       — 2+ voluntary preflop raises (open + 3-bet or more)
 *   FOUR_BET_POT   — 3+ voluntary preflop raises (open + 3-bet + 4-bet or more)
 *   SQUEEZE_POT    — preflop raise after (prior raise + ≥1 caller)
 *   C_BET          — preflop raiser made the first aggression on flop
 *   CHECK_RAISE    — player checked then raised on the same street
 *   BLUFF_CATCH    — player called last river bet and won at showdown
 *   WHALE_POT      — final_pot > 150 × big_blind
 *   MULTIWAY       — ≥3 distinct players active on flop (or preflop if no flop)
 *   ALL_IN_PREFLOP — any preflop all-in action
 *   LIMPED_POT     — voluntary preflop actions are calls only, no raise
 *   DONK_BET       — first flop bet is from the non-preflop-aggressor
 *   MONOTONE_BOARD — flop is all same suit
 *   PAIRED_BOARD   — flop has a rank pair
 *   RIVER_RAISE    — a raise action on the river
 *   OVERBET        — any bet/raise > 2× reconstructed pot at that point
 *   SAW_FLOP       — hand reached the flop
 *   SAW_TURN       — hand reached the turn
 *   SAW_RIVER      — hand reached the river
 *   WENT_TO_SHOWDOWN — hand ended at showdown
 *   SHORT_STACK    — any player had < 20BB at start of hand
 *   DEEP_STACK     — any player had > 100BB at start of hand
 *   BTN_OPEN       — button (dealer) made the first preflop raise
 *   BLIND_DEFENSE  — BB called or raised after a preflop raise
 *
 * Mistake tags:
 *   UNDO_USED     — any action is_reverted=1
 *   OPEN_LIMP     — player's first preflop action is call with no prior raise, not BB
 *   MIN_RAISE     — raise amount ≤ 2× the previous bet/raise amount
 */
function analyzeAndTagHand(handId) {
  const hand = stmts().getHandById.get(handId);
  if (!hand) return;

  const allActions = stmts().getHandActionsAll.all(handId);
  const actions = allActions.filter(a => !a.is_reverted);

  const autoTags = new Set();
  const mistakeTags = new Set();

  // Mistake: undo was used at least once
  if (allActions.some(a => a.is_reverted)) mistakeTags.add('UNDO_USED');

  // Group actions by street
  const byStreet = {};
  for (const a of actions) {
    if (!byStreet[a.street]) byStreet[a.street] = [];
    byStreet[a.street].push(a);
  }

  const preflopActions = byStreet['preflop'] || [];
  const flopActions    = byStreet['flop']    || [];
  const riverActions   = byStreet['river']   || [];

  // Hoisted player query — reused by SHORT_STACK, DEEP_STACK, BTN_OPEN, BLIND_DEFENSE, OPEN_LIMP
  const handPlayers = stmts().getHandPlayers.all(handId);
  const seated      = handPlayers.filter(p => p.seat >= 0).sort((a, b) => a.seat - b.seat);
  const bbPlayerId  = _findBBPlayerId(seated, hand.dealer_seat ?? -1);

  // Board parsed once — reused by WALK guard, SAW_FLOP/TURN/RIVER, MONOTONE_BOARD, PAIRED_BOARD
  const boardCards = JSON.parse(hand.board || '[]');

  // ─── WALK ──────────────────────────────────────────────────────────────────
  // boardCards.length === 0 guard: if the board was manually pre-configured,
  // cards exist even when everyone folds preflop — that isn't a true WALK.
  if (preflopActions.length > 0 && boardCards.length === 0) {
    const pfRaises = preflopActions.filter(a => a.action === 'raised' || a.action === 'raise');
    const pfFolds  = preflopActions.filter(a => a.action === 'folded' || a.action === 'fold');
    if (pfRaises.length === 0 && pfFolds.length > 0 && pfFolds.length >= preflopActions.length - 1) {
      autoTags.add('WALK');
    }
  }

  // ─── SAW_FLOP / SAW_TURN / SAW_RIVER / WENT_TO_SHOWDOWN ──────────────────
  // Use board card count — action-based detection misses all-in runouts and
  // hands reset immediately after the street is opened (e.g. B45 reset-on-flop).
  if (boardCards.length >= 3) autoTags.add('SAW_FLOP');
  if (boardCards.length >= 4) autoTags.add('SAW_TURN');
  if (boardCards.length >= 5) autoTags.add('SAW_RIVER');
  if (hand.phase_ended === 'showdown') autoTags.add('WENT_TO_SHOWDOWN');

  // ─── 3BET_POT / FOUR_BET_POT ──────────────────────────────────────────────
  // Blind posts are logged as 'bet', not 'raise', so raiseCount only counts
  // voluntary raises. raiseCount=1 = open raise only; raiseCount=2 = open+3-bet;
  // raiseCount=3 = open+3-bet+4-bet, etc.
  {
    const raiseCount = preflopActions.filter(a => a.action === 'raised' || a.action === 'raise').length;
    if (raiseCount >= 2) autoTags.add('3BET_POT');
    if (raiseCount >= 3) autoTags.add('FOUR_BET_POT');
  }

  // ─── SQUEEZE_POT ──────────────────────────────────────────────────────────
  {
    let seenRaise = false, seenCallAfterRaise = false;
    for (const a of preflopActions) {
      if ((a.action === 'raise' || a.action === 'raised') && seenCallAfterRaise) {
        autoTags.add('SQUEEZE_POT');
        break;
      }
      if (a.action === 'raise' || a.action === 'raised') seenRaise = true;
      if ((a.action === 'call' || a.action === 'called') && seenRaise) seenCallAfterRaise = true;
    }
  }

  // ─── C_BET ────────────────────────────────────────────────────────────────
  if (flopActions.length > 0) {
    const lastPFRaiser = [...preflopActions].reverse()
      .find(a => a.action === 'raised' || a.action === 'raise');
    if (lastPFRaiser) {
      const firstFlopAgg = flopActions.find(a =>
        a.action === 'raised' || a.action === 'raise' || a.action === 'bet'
      );
      if (firstFlopAgg && firstFlopAgg.player_id === lastPFRaiser.player_id) {
        autoTags.add('C_BET');
      }
    }
  }

  // ─── CHECK_RAISE ──────────────────────────────────────────────────────────
  for (const street of ['preflop', 'flop', 'turn', 'river']) {
    const streetActs = byStreet[street] || [];
    const checkedPlayers = new Set();
    for (const a of streetActs) {
      if (a.action === 'checked' || a.action === 'check') {
        checkedPlayers.add(a.player_id);
      } else if ((a.action === 'raised' || a.action === 'raise') && checkedPlayers.has(a.player_id)) {
        autoTags.add('CHECK_RAISE');
        break;
      }
    }
    if (autoTags.has('CHECK_RAISE')) break;
  }

  // ─── BLUFF_CATCH ──────────────────────────────────────────────────────────
  if (riverActions.length > 0 && hand.phase_ended === 'showdown') {
    const lastRiverBet = [...riverActions].reverse()
      .find(a => a.action === 'raised' || a.action === 'raise' || a.action === 'bet');
    if (lastRiverBet) {
      const callerAfterBet = riverActions.find(a => a.action === 'called' || a.action === 'call');
      if (callerAfterBet && callerAfterBet.player_id === hand.winner_id) {
        autoTags.add('BLUFF_CATCH');
      }
    }
  }

  // ─── WHALE_POT ────────────────────────────────────────────────────────────
  const bb = hand.big_blind || 20;
  if ((hand.final_pot || 0) > 150 * bb) autoTags.add('WHALE_POT');

  // ─── MULTIWAY ─────────────────────────────────────────────────────────────
  {
    const nonFold = (a) => a.action !== 'folded' && a.action !== 'fold';
    const flopActors = new Set(flopActions.filter(nonFold).map(a => a.player_id));
    if (flopActors.size >= 3) {
      autoTags.add('MULTIWAY');
    } else if (flopActions.length === 0) {
      const pfActors = new Set(preflopActions.filter(nonFold).map(a => a.player_id));
      if (pfActors.size >= 3) autoTags.add('MULTIWAY');
    }
  }

  // ─── ALL_IN_PREFLOP ───────────────────────────────────────────────────────
  if (preflopActions.some(a => a.action === 'all-in')) autoTags.add('ALL_IN_PREFLOP');

  // ─── LIMPED_POT ───────────────────────────────────────────────────────────
  {
    const voluntary = preflopActions.filter(a =>
      ['call', 'called', 'raise', 'raised', 'all-in'].includes(a.action)
    );
    if (voluntary.length > 0 && !voluntary.some(a => a.action === 'raise' || a.action === 'raised')) {
      autoTags.add('LIMPED_POT');
    }
  }

  // ─── SHORT_STACK / DEEP_STACK ─────────────────────────────────────────────
  {
    const bb = hand.big_blind || 20;
    for (const p of seated) {
      const start = p.stack_start ?? 0;
      if (start < 20 * bb)  autoTags.add('SHORT_STACK');
      if (start > 100 * bb) autoTags.add('DEEP_STACK');
      if (autoTags.has('SHORT_STACK') && autoTags.has('DEEP_STACK')) break;
    }
  }

  // ─── BTN_OPEN ─────────────────────────────────────────────────────────────
  {
    const dealerSeat = hand.dealer_seat ?? -1;
    if (dealerSeat >= 0) {
      const btnPlayer = seated.find(p => p.seat === dealerSeat);
      if (btnPlayer) {
        for (const a of preflopActions) {
          if (a.action === 'raise' || a.action === 'raised') {
            if (a.player_id === btnPlayer.player_id) autoTags.add('BTN_OPEN');
            break; // only check the first raise
          }
        }
      }
    }
  }

  // ─── BLIND_DEFENSE ────────────────────────────────────────────────────────
  if (bbPlayerId) {
    let seenRaise = false;
    for (const a of preflopActions) {
      if (a.action === 'raise' || a.action === 'raised') seenRaise = true;
      if (seenRaise && a.player_id === bbPlayerId &&
          (a.action === 'call' || a.action === 'called' ||
           a.action === 'raise' || a.action === 'raised')) {
        autoTags.add('BLIND_DEFENSE');
        break;
      }
    }
  }

  // ─── DONK_BET ─────────────────────────────────────────────────────────────
  if (flopActions.length > 0) {
    const lastPFRaiser = [...preflopActions].reverse()
      .find(a => a.action === 'raised' || a.action === 'raise');
    if (lastPFRaiser) {
      const firstFlopBet = flopActions.find(a => a.action === 'bet');
      if (firstFlopBet && firstFlopBet.player_id !== lastPFRaiser.player_id) {
        autoTags.add('DONK_BET');
      }
    }
  }

  // ─── MONOTONE_BOARD ───────────────────────────────────────────────────────
  if (boardCards.length >= 3) {
    const suits = boardCards.slice(0, 3).map(c => c[1]);
    if (suits[0] === suits[1] && suits[1] === suits[2]) autoTags.add('MONOTONE_BOARD');
  }

  // ─── PAIRED_BOARD ─────────────────────────────────────────────────────────
  if (boardCards.length >= 3) {
    const ranks = boardCards.slice(0, 3).map(c => c[0]);
    if (ranks[0] === ranks[1] || ranks[1] === ranks[2] || ranks[0] === ranks[2]) {
      autoTags.add('PAIRED_BOARD');
    }
  }

  // ─── RIVER_RAISE ──────────────────────────────────────────────────────────
  if (riverActions.some(a => a.action === 'raised' || a.action === 'raise')) {
    autoTags.add('RIVER_RAISE');
  }

  // ─── OVERBET ──────────────────────────────────────────────────────────────
  {
    let runningPot = 0;
    for (const a of actions) {
      if ((a.action === 'bet' || a.action === 'raised' || a.action === 'raise') && a.amount > 0) {
        if (runningPot > 0 && a.amount > 2 * runningPot) {
          autoTags.add('OVERBET');
          break;
        }
      }
      if (a.amount > 0) runningPot += a.amount;
    }
  }

  // ─── OPEN_LIMP (mistake) ──────────────────────────────────────────────────
  {
    // handPlayers / seated / bbPlayerId hoisted to top of analyzeAndTagHand
    let anyRaiseSeen = false;
    const firstAction = {};  // player_id → { action, hadRaiseBefore }

    for (const a of preflopActions) {
      if (!(a.player_id in firstAction)) {
        if (['call', 'called', 'raise', 'raised', 'all-in'].includes(a.action)) {
          firstAction[a.player_id] = { action: a.action, hadRaiseBefore: anyRaiseSeen };
        }
      }
      if (a.action === 'raise' || a.action === 'raised') anyRaiseSeen = true;
    }

    // ISS-67: only tag OPEN_LIMP when BB is identifiable; skip if bbPlayerId is null
    // (edge case: spectator seat=-1 player in hand_players breaks _findBBPlayerId)
    if (bbPlayerId) {
      for (const [playerId, info] of Object.entries(firstAction)) {
        if ((info.action === 'call' || info.action === 'called') &&
            !info.hadRaiseBefore &&
            playerId !== bbPlayerId) {
          mistakeTags.add('OPEN_LIMP');
          break;
        }
      }
    }
  }

  // ─── MIN_RAISE (mistake) ──────────────────────────────────────────────────
  {
    const streetOrder = ['preflop', 'flop', 'turn', 'river'];
    outer: for (const street of streetOrder) {
      const streetActs = byStreet[street] || [];
      let lastBetAmount = street === 'preflop' ? (hand.big_blind || 20) : 0;
      for (const a of streetActs) {
        if ((a.action === 'raise' || a.action === 'raised') && a.amount > 0) {
          if (lastBetAmount > 0 && a.amount <= lastBetAmount * 2) {
            mistakeTags.add('MIN_RAISE');
            break outer;
          }
          lastBetAmount = a.amount;
        } else if (a.action === 'bet' && a.amount > 0) {
          lastBetAmount = a.amount;
        }
      }
    }
  }

  stmts().updateHandTags.run({
    hand_id: handId,
    auto_tags: JSON.stringify([...autoTags]),
    mistake_tags: JSON.stringify([...mistakeTags])
  });

  return { auto_tags: [...autoTags], mistake_tags: [...mistakeTags] };
}

// ─── Player Identity API ──────────────────────────────────────────────────────

function upsertPlayerIdentity(stableId, name) {
  stmts().upsertPlayerIdentity.run({ stable_id: stableId, last_known_name: name, last_seen: Date.now() });
}

function getPlayerStats(stableId) {
  return stmts().getPlayerStats.get(stableId) ?? null;
}

// ─── Auth API (Epic 15) ───────────────────────────────────────────────────────

async function registerPlayerAccount(name, email, password) {
  // Check for duplicate name (only block if the existing record has a password — i.e. is a registered account)
  const existingName = stmts().getPlayerByName.get(name.trim());
  if (existingName && existingName.password_hash) {
    return { error: 'name_taken', message: 'This display name is already taken' };
  }
  // Check for duplicate email
  const existingEmail = stmts().getPlayerByEmail.get(email.trim().toLowerCase());
  if (existingEmail) {
    return { error: 'email_taken', message: 'An account with this email already exists' };
  }
  const stableId = uuidv4();
  const passwordHash = await bcrypt.hash(password, 10);
  stmts().registerPlayer.run({
    stable_id: stableId,
    name: name.trim(),
    email: email.trim().toLowerCase(),
    password_hash: passwordHash,
    last_seen: Date.now()
  });
  return { success: true, stableId };
}

async function loginPlayerAccount(name, password) {
  const player = stmts().getPlayerByName.get(name.trim());
  if (!player || !player.password_hash) {
    return { error: 'invalid_credentials', message: 'Invalid name or password' };
  }
  const match = await bcrypt.compare(password, player.password_hash);
  if (!match) {
    return { error: 'invalid_credentials', message: 'Invalid name or password' };
  }
  // Update last_seen
  stmts().upsertPlayerIdentity.run({ stable_id: player.stable_id, last_known_name: player.last_known_name, last_seen: Date.now() });
  return { success: true, stableId: player.stable_id, name: player.last_known_name };
}

function isRegisteredPlayer(stableId) {
  if (!stableId) return false;
  const player = stmts().getPlayerById.get(stableId);
  return !!(player && player.password_hash);
}

function getAllPlayersWithStats() {
  const players = stmts().getAllRegisteredPlayers.all();
  return players.map(p => {
    const stats = stmts().getPlayerAggStats.get(p.stable_id) ?? {
      total_hands: 0, total_wins: 0, total_net_chips: 0,
      vpip_percent: 0, pfr_percent: 0, last_hand_at: null
    };
    return {
      stableId: p.stable_id,
      name: p.last_known_name,
      email: p.email,
      lastSeen: p.last_seen,
      ...stats
    };
  });
}

function getPlayerHands(stableId, { limit = 20, offset = 0 } = {}) {
  return stmts().getPlayerHandHistory.all(stableId, limit, offset).map(h => ({
    ...h,
    auto_tags:    h.auto_tags    ? JSON.parse(h.auto_tags)    : [],
    coach_tags:   h.coach_tags   ? JSON.parse(h.coach_tags)   : [],
    mistake_tags: h.mistake_tags ? JSON.parse(h.mistake_tags) : [],
    board:      h.board      ? JSON.parse(h.board)      : [],
    hole_cards: h.hole_cards ? JSON.parse(h.hole_cards) : []
  }));
}

// ─── Session Report ───────────────────────────────────────────────────────────

/**
 * getSessionReport(sessionId)
 *
 * Returns aggregated data for the HTML session report.
 * Returns null if the session doesn't exist.
 */
function getSessionReport(sessionId) {
  const db = getDb();

  const session = db.prepare('SELECT * FROM sessions WHERE session_id = ?').get(sessionId);
  if (!session) return null;

  // All hands in this session ordered by start time
  const hands = db.prepare(`
    SELECT hand_id, started_at, ended_at, board, final_pot, winner_id, winner_name,
           phase_ended, auto_tags, mistake_tags, coach_tags, completed_normally, big_blind
    FROM hands WHERE session_id = ? ORDER BY started_at ASC
  `).all(sessionId);

  const handCount = hands.length;

  if (handCount === 0) {
    return {
      session: { ...session, hand_count: 0 },
      players: [], hands: [], tag_summary: {}, mistake_summary: {}
    };
  }

  // All hand_players for this session (joined with hand start time for ordering)
  const allHP = db.prepare(`
    SELECT hp.*, h.started_at AS hand_started_at
    FROM hand_players hp
    JOIN hands h ON hp.hand_id = h.hand_id
    WHERE h.session_id = ?
    ORDER BY h.started_at ASC
  `).all(sessionId);

  // Aggregate per player
  const playerMap = {};
  for (const hp of allHP) {
    if (!playerMap[hp.player_id]) {
      playerMap[hp.player_id] = {
        stableId: hp.player_id,
        name: hp.player_name,
        stack_start: hp.stack_start,   // first hand
        stack_end: hp.stack_end,       // will update to last hand
        hands_played: 0,
        hands_won: 0,
        vpip_count: 0,
        pfr_count: 0,
        wtsd_count: 0,
        wsd_count: 0,
      };
    }
    const entry = playerMap[hp.player_id];
    entry.stack_end = hp.stack_end;    // keep updating — last write = last hand
    entry.hands_played++;
    entry.hands_won    += (hp.is_winner || 0);
    entry.vpip_count   += (hp.vpip || 0);
    entry.pfr_count    += (hp.pfr || 0);
    entry.wtsd_count   += (hp.wtsd || 0);
    entry.wsd_count    += (hp.wsd || 0);
  }

  const players = Object.values(playerMap).map(p => ({
    stableId:     p.stableId,
    name:         p.name,
    stack_start:  p.stack_start,
    stack_end:    p.stack_end,
    net_chips:    (p.stack_end || 0) - (p.stack_start || 0),
    hands_played: p.hands_played,
    hands_won:    p.hands_won,
    vpip:  p.hands_played > 0 ? Math.round(p.vpip_count  / p.hands_played * 100) : 0,
    pfr:   p.hands_played > 0 ? Math.round(p.pfr_count   / p.hands_played * 100) : 0,
    wtsd:  p.hands_played > 0 ? Math.round(p.wtsd_count  / p.hands_played * 100) : 0,
    wsd:   p.wtsd_count > 0   ? Math.round(p.wsd_count   / p.wtsd_count   * 100) : 0,
  })).sort((a, b) => b.net_chips - a.net_chips);

  // Per-hand players map (hand_id → players array)
  const hpByHand = {};
  for (const hp of allHP) {
    if (!hpByHand[hp.hand_id]) hpByHand[hp.hand_id] = [];
    hpByHand[hp.hand_id].push({
      player_id: hp.player_id,
      player_name: hp.player_name,
      seat: hp.seat,
      stack_start: hp.stack_start,
      stack_end: hp.stack_end,
      is_winner: hp.is_winner,
      hole_cards: hp.hole_cards ? JSON.parse(hp.hole_cards) : [],
    });
  }

  // Parse tag counts
  const tagSummary = {};
  const mistakeSummary = {};

  const handsDetail = hands.map(h => {
    const autoTags    = h.auto_tags    ? JSON.parse(h.auto_tags)    : [];
    const mistakeTags = h.mistake_tags ? JSON.parse(h.mistake_tags) : [];
    const coachTags   = h.coach_tags   ? JSON.parse(h.coach_tags)   : [];

    for (const t of autoTags) {
      tagSummary[t] = (tagSummary[t] || 0) + 1;
    }
    for (const t of mistakeTags) {
      if (!mistakeSummary[t]) mistakeSummary[t] = { count: 0, hands: [] };
      mistakeSummary[t].count++;
      mistakeSummary[t].hands.push(h.hand_id);
    }

    return {
      hand_id:      h.hand_id,
      started_at:   h.started_at,
      ended_at:     h.ended_at,
      board:        h.board ? JSON.parse(h.board) : [],
      final_pot:    h.final_pot,
      winner_name:  h.winner_name,
      phase_ended:  h.phase_ended,
      auto_tags:    autoTags,
      mistake_tags: mistakeTags,
      coach_tags:   coachTags,
      players:      hpByHand[h.hand_id] || [],
    };
  });

  const ended_at = hands[hands.length - 1]?.ended_at || null;

  return {
    session: { ...session, hand_count: handCount, ended_at },
    players,
    hands: handsDetail,
    tag_summary:     tagSummary,
    mistake_summary: mistakeSummary,
  };
}

module.exports = {
  ensureSession, startHand, recordAction, endHand, markIncomplete, updateCoachTags,
  getHands, getHandDetail, getSessionStats,
  upsertPlayerIdentity, getPlayerStats, getAllPlayersWithStats, getPlayerHands,
  // New Epic 8
  analyzeAndTagHand, markLastActionReverted,
  createPlaylist, getPlaylists, getPlaylistHands,
  addHandToPlaylist, removeHandFromPlaylist, deletePlaylist,
  // Epic 15 Auth
  registerPlayerAccount, loginPlayerAccount, isRegisteredPlayer,
  // Feature B: session report
  getSessionReport,
};
