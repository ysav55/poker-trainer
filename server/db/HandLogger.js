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
        (hand_id, session_id, table_id, started_at, completed_normally, dealer_seat, is_scenario_hand)
      VALUES (@hand_id, @session_id, @table_id, @started_at, 0, @dealer_seat, @is_scenario_hand)
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
        pfr        = @pfr
      WHERE hand_id = @hand_id AND player_id = @player_id
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
        last_seen = excluded.last_seen
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
        h.phase_ended, h.board, h.auto_tags, h.coach_tags, h.table_id,
        hp.hole_cards, hp.stack_start, hp.stack_end, hp.is_winner, hp.vpip, hp.pfr, hp.seat
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

function startHand({ handId, sessionId, tableId, players, dealerSeat = 0, isScenario = false }) {
  const db = getDb();
  const now = Date.now();
  const s = stmts();

  db.transaction(() => {
    ensureSession(sessionId, tableId);
    s.insertHand.run({
      hand_id: handId, session_id: sessionId, table_id: tableId, started_at: now,
      dealer_seat: dealerSeat, is_scenario_hand: isScenario ? 1 : 0
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

    // Update per-player end state
    const winnerIds = new Set();
    if (state.showdown_result) {
      state.showdown_result.winners.forEach(w => winnerIds.add(w.playerId));
    } else if (state.winner) {
      winnerIds.add(state.winner);
    }

    for (const p of (state.players || [])) {
      if (p.is_coach) continue;
      s.updateHandPlayer.run({
        hand_id: handId,
        player_id: p.id,
        stack_end: p.stack ?? 0,
        hole_cards: JSON.stringify(p.hole_cards || []),
        is_winner: winnerIds.has(p.id) ? 1 : 0,
        vpip: (p.action && ['called', 'raised', 'all-in'].includes(p.action)) ? 1 : 0,
        pfr:  (p.action && ['raised'].includes(p.action)) ? 1 : 0
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
    auto_tags: hand.auto_tags ? JSON.parse(hand.auto_tags) : [],
    coach_tags: hand.coach_tags ? JSON.parse(hand.coach_tags) : [],
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
  // Compact display_order to remove gaps
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
 * analyzeAndTagHand(handId)
 *
 * Runs pattern detection on the FINAL committed state of a hand
 * (actions where is_reverted = 0) and writes auto_tags + mistake_tags.
 *
 * Patterns detected:
 *   WALK          — everyone folds to BB without a preflop raise
 *   3BET_POT      — 3+ rounds of aggression preflop (open + 3bet + action)
 *   C_BET         — preflop raiser also made the first bet on the flop
 *   CHECK_RAISE   — a player checked then raised on the same street
 *   BLUFF_CATCH   — a player called the last river bet and won at showdown
 *   WHALE_POT     — final_pot > 150 * big_blind (default bb=20 → >3000)
 *
 * Mistake tags:
 *   UNDO_USED     — any action in this hand is marked is_reverted=1
 */
function analyzeAndTagHand(handId) {
  const hand = stmts().getHandById.get(handId);
  if (!hand) return;

  // All actions including reverted (for mistake_tags check)
  const allActions = stmts().getHandActionsAll.all(handId);
  // Only committed (non-reverted) actions for pattern detection
  const actions = allActions.filter(a => !a.is_reverted);

  const autoTags = new Set();
  const mistakeTags = new Set();

  // Mistake: undo was used at least once
  if (allActions.some(a => a.is_reverted)) {
    mistakeTags.add('UNDO_USED');
  }

  // Group actions by street
  const byStreet = {};
  for (const a of actions) {
    if (!byStreet[a.street]) byStreet[a.street] = [];
    byStreet[a.street].push(a);
  }

  const preflopActions = byStreet['preflop'] || [];
  const flopActions = byStreet['flop'] || [];
  const riverActions = byStreet['river'] || [];

  // WALK: everyone folded to BB preflop, no raise — BB wins uncontested
  // Requires at least 1 fold to avoid tagging a single free-check as a walk
  if (preflopActions.length > 0) {
    const preflopRaises = preflopActions.filter(a => a.action === 'raised' || a.action === 'raise');
    const preflopFolds = preflopActions.filter(a => a.action === 'folded' || a.action === 'fold');
    if (preflopRaises.length === 0 && preflopFolds.length > 0 && preflopFolds.length >= preflopActions.length - 1) {
      // At least one fold, no raises, at most one non-fold action (BB's option) — Walk
      autoTags.add('WALK');
    }
  }

  // 3BET_POT: 3+ raises preflop
  {
    const raiseCount = preflopActions.filter(a => a.action === 'raised' || a.action === 'raise').length;
    if (raiseCount >= 3) autoTags.add('3BET_POT');
  }

  // C_BET: find last preflop raiser; check if they bet first on flop
  if (flopActions.length > 0) {
    const lastPreflopRaiser = [...preflopActions]
      .reverse()
      .find(a => a.action === 'raised' || a.action === 'raise');
    if (lastPreflopRaiser) {
      const firstFlopAggressor = flopActions.find(a =>
        a.action === 'raised' || a.action === 'raise' || a.action === 'bet'
      );
      if (firstFlopAggressor && firstFlopAggressor.player_id === lastPreflopRaiser.player_id) {
        autoTags.add('C_BET');
      }
    }
  }

  // CHECK_RAISE: within any street, a player checks then raises
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

  // BLUFF_CATCH: player called last river bet and won at showdown
  if (riverActions.length > 0 && hand.phase_ended === 'showdown') {
    const lastRiverBet = [...riverActions]
      .reverse()
      .find(a => a.action === 'raised' || a.action === 'raise' || a.action === 'bet');
    if (lastRiverBet) {
      const callerAfterBet = riverActions.find(a =>
        a.action === 'called' || a.action === 'call'
      );
      if (callerAfterBet && callerAfterBet.player_id === hand.winner_id) {
        autoTags.add('BLUFF_CATCH');
      }
    }
  }

  // WHALE_POT: pot > 150 BB (assuming bb=20 as default)
  const bb = 20;
  if ((hand.final_pot || 0) > 150 * bb) {
    autoTags.add('WHALE_POT');
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
    auto_tags: h.auto_tags ? JSON.parse(h.auto_tags) : [],
    coach_tags: h.coach_tags ? JSON.parse(h.coach_tags) : [],
    board: h.board ? JSON.parse(h.board) : [],
    hole_cards: h.hole_cards ? JSON.parse(h.hole_cards) : []
  }));
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
  registerPlayerAccount, loginPlayerAccount, isRegisteredPlayer
};
