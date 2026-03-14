/**
 * Poker Training Platform — Socket.io Server
 *
 * Events (Client → Server):
 *   join_room          { name, isCoach }
 *   start_game         { mode: 'rng'|'manual' }
 *   place_bet          { action: 'fold'|'check'|'call'|'raise', amount? }
 *   manual_deal_card   { targetType: 'player'|'board', targetId?, position, card }
 *   undo_action        {}
 *   rollback_street    {}
 *   toggle_pause       {}
 *   set_mode           { mode }
 *   force_next_street  {}
 *   award_pot          { winnerId }
 *   reset_hand         {}
 *   adjust_stack            { playerId, amount }
 *   open_config_phase       {}
 *   update_hand_config      { config: HandConfiguration }
 *   start_configured_hand   {}
 *   load_hand_scenario    { handId, stackMode?: 'keep'|'historical' }
 *   update_hand_tags      { handId, tags: string[] }
 *   create_playlist       { name, description? }
 *   get_playlists         {}
 *   add_to_playlist       { playlistId, handId }
 *   remove_from_playlist  { playlistId, handId }
 *   delete_playlist       { playlistId }
 *   activate_playlist     { playlistId }
 *   deactivate_playlist   {}
 *
 * Events (Server → Client):
 *   room_joined        { playerId, isCoach, isSpectator, name }
 *   game_state         <personalized TableState>
 *   notification       { type, message }
 *   error              { message }
 *   sync_error         { message }  — late/rejected action; client should resync state
 *   session_stats      <SessionState>
 *   action_timer       { playerId, duration, startedAt } | null  (null = cancelled)
 *   coach_disconnected { message }  — game auto-paused, coach has 30s to reconnect
 *   playlist_state  { playlists, active? }
 *   hand_tagged     { handId, auto_tags, mistake_tags }
 *   hand_started       { handId }  — emitted to coach only when a hand begins (for tagging)
 *   hand_tags_saved    { handId, coach_tags }  — confirms tag persistence to coach
 *
 * REST API:
 *   GET /              — React app (production only; in dev, Vite dev server handles this)
 *   GET /api/hands                       — paginated hand history
 *   GET /api/hands/:handId               — full hand detail with actions
 *   GET /api/sessions/:sessionId/stats   — DB-backed session stats
 *   GET /api/sessions/current            — live in-memory session stats
 */

const path = require('path');
const fs   = require('fs');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const SessionManager = require('./game/SessionManager');
const HandLogger = require('./db/HandLogger');
const { v4: uuidv4 } = require('uuid');

// Coach password — set COACH_PASSWORD env var to require a password.
// Leave unset (or empty) to allow any coach join without a password.
const COACH_PASSWORD = process.env.COACH_PASSWORD || '';

// Per-table active hand tracking
const activeHands = new Map(); // tableId → { handId, sessionId }

// Stable identity map: socketId → stableId (UUID from client localStorage)
const stableIdMap = new Map();

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// One SessionManager per table. For MVP: single table.
const tables = new Map();

// Map<socketId, { timer, tableId, name, isCoach }> — pending reconnect TTLs
const reconnectTimers = new Map();

// Per-table action timers
const actionTimers = new Map(); // tableId → { timeout, startedAt, duration, playerId }

// Saved remaining time when coach pauses mid-turn; restored on resume
const pausedTimerRemainders = new Map(); // tableId → { playerId, remainingMs }

function getOrCreateTable(tableId) {
  if (!tables.has(tableId)) {
    tables.set(tableId, new SessionManager(tableId));
  }
  return tables.get(tableId);
}

/**
 * Broadcast personalized game state to every socket in the room.
 */
function broadcastState(tableId, notification = null) {
  const gm = tables.get(tableId);
  if (!gm) return;

  const room = io.sockets.adapter.rooms.get(tableId);
  if (!room) return;

  for (const socketId of room) {
    const socket = io.sockets.sockets.get(socketId);
    if (!socket) continue;
    const publicState = gm.getPublicState(socketId, socket.data.isCoach);
    socket.emit('game_state', publicState);
  }

  if (notification) {
    io.to(tableId).emit('notification', notification);
  }
}

/**
 * Send an error only to the originating socket.
 */
function sendError(socket, message) {
  socket.emit('error', { message });
}

/**
 * Start a 30-second action timer for the current turn player.
 * Clears any existing timer first. Auto-folds on expiry if game is not paused.
 */
/**
 * Start (or resume) the action timer for the current turn player.
 * Pass { resumeRemaining: true } when resuming after a coach pause — the timer
 * will pick up exactly where it left off instead of restarting at 30s.
 */
function startActionTimer(tableId, { resumeRemaining = false } = {}) {
  clearActionTimer(tableId, { saving: false }); // clears any live timer without saving remainder
  const gm = tables.get(tableId);
  if (!gm) return;
  const state = gm.state;
  if (!state.current_turn || state.paused || state.phase === 'waiting' || state.phase === 'showdown') return;

  const playerId = state.current_turn;
  const player = state.players.find(p => p.id === playerId);
  if (!player) return;

  // Determine timer duration: resume with saved remainder or full 30s
  let duration = 30_000;
  if (resumeRemaining) {
    const saved = pausedTimerRemainders.get(tableId);
    if (saved && saved.playerId === playerId) {
      duration = Math.max(saved.remainingMs, 1000); // at least 1s to avoid instant fold
      pausedTimerRemainders.delete(tableId);
    }
  }

  const startedAt = Date.now();
  io.to(tableId).emit('action_timer', { playerId, duration, startedAt });

  const timeout = setTimeout(() => {
    actionTimers.delete(tableId);
    const currentGm = tables.get(tableId);
    if (!currentGm || currentGm.state.paused) return;
    // Auto-fold the timed-out player
    const result = currentGm.placeBet(playerId, 'fold');
    if (!result.error) {
      const timedOutPlayer = currentGm.state.players.find(p => p.id === playerId)
        || { name: player.name };
      broadcastState(tableId, {
        type: 'auto_fold',
        message: `${timedOutPlayer.name || 'Player'} timed out — auto-folded`
      });
      startActionTimer(tableId);
    }
  }, duration);

  actionTimers.set(tableId, { timeout, playerId, startedAt, duration });
}

/**
 * Cancel the active action timer for a table and notify clients.
 * Pass { saving: true } when pausing — saves remaining time for later resume.
 */
function clearActionTimer(tableId, { saving = false } = {}) {
  const entry = actionTimers.get(tableId);
  if (entry) {
    clearTimeout(entry.timeout);
    if (saving) {
      const elapsed = Date.now() - entry.startedAt;
      const remainingMs = Math.max(0, entry.duration - elapsed);
      pausedTimerRemainders.set(tableId, { playerId: entry.playerId, remainingMs });
    } else {
      pausedTimerRemainders.delete(tableId);
    }
    actionTimers.delete(tableId);
    io.to(tableId).emit('action_timer', null);
  }
}

/**
 * _loadScenarioIntoConfig
 * Maps a historical hand onto current active seats by RELATIVE POSITION from the dealer button.
 * BTN→BTN, SB→SB, BB→BB regardless of physical seat numbers or player count differences.
 *
 * stackMode: 'keep' — preserves current stacks
 *            'historical' — sets stacks to historical stack_start values
 */
function _loadScenarioIntoConfig(tableId, gm, handDetail, stackMode = 'keep') {
  const activePlayers = gm.state.players
    .filter(p => !p.is_coach)
    .sort((a, b) => a.seat - b.seat);

  const histPlayers = (handDetail.players || [])
    .sort((a, b) => (a.seat ?? 0) - (b.seat ?? 0));

  const activeCount = activePlayers.length;
  const histCount   = histPlayers.length;

  // dealer_seat stored in DB = index into the sorted non-coach players array (same as GM)
  const histDealerIdx = Math.max(0, (handDetail.dealer_seat ?? 0) % Math.max(histCount, 1));

  // Build relativePosition → histPlayer  (0 = BTN/dealer, 1 = SB, 2 = BB …)
  const histRelMap = new Map();
  for (let i = 0; i < histCount; i++) {
    const rel = (i - histDealerIdx + histCount) % histCount;
    histRelMap.set(rel, histPlayers[i]);
  }

  // Current dealer index
  const liveDealerIdx = activeCount > 0
    ? gm.state.dealer_seat % activeCount
    : 0;

  const holeCards = {};
  activePlayers.forEach((player, i) => {
    const rel  = (i - liveDealerIdx + activeCount) % activeCount;
    const hist = histRelMap.get(rel % Math.max(histCount, 1));
    holeCards[player.id] = (hist?.hole_cards?.length === 2) ? hist.hole_cards : [null, null];
  });

  const board = (handDetail.board?.length === 5)
    ? handDetail.board
    : [null, null, null, null, null];

  if (stackMode === 'historical') {
    activePlayers.forEach((player, i) => {
      const rel  = (i - liveDealerIdx + activeCount) % activeCount;
      const hist = histRelMap.get(rel % Math.max(histCount, 1));
      if (hist?.stack_start != null) gm.adjustStack(player.id, hist.stack_start);
    });
  }

  gm.openConfigPhase();
  gm.updateHandConfig({ mode: 'hybrid', hole_cards: holeCards, board });

  return { countMismatch: activeCount !== histCount, activeCount, histCount };
}

// ─────────────────────────────────────────────
//  Connection handling
// ─────────────────────────────────────────────
io.on('connection', socket => {
  console.log(`[connect] ${socket.id}`);

  // ── join_room ─────────────────────────────
  socket.on('join_room', ({ name, isCoach = false, tableId = 'main-table', stableId, password = '', playAtTable = false } = {}) => {
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return sendError(socket, 'Name is required');
    }

    // Validate coach password if one is configured
    if (isCoach && COACH_PASSWORD && password !== COACH_PASSWORD) {
      return sendError(socket, 'Incorrect coach password');
    }

    const gm = getOrCreateTable(tableId);
    const trimmedName = name.trim();

    // Resolve stable identity: use client-provided UUID if valid, else fall back to socket.id
    const resolvedStableId = (stableId && typeof stableId === 'string' && stableId.length > 0)
      ? stableId
      : socket.id;
    stableIdMap.set(socket.id, resolvedStableId);
    HandLogger.upsertPlayerIdentity(resolvedStableId, trimmedName);

    // Check if a previous session for this player name is pending TTL (reconnect path)
    let isReconnect = false;
    let savedReconnectEntry = null;
    for (const [oldSocketId, entry] of reconnectTimers.entries()) {
      if (entry.tableId === tableId && entry.name === trimmedName) {
        // On reconnect: coach flag must match the original seat to prevent impersonation
        if (entry.isCoach && !isCoach) {
          return sendError(socket, 'This seat belongs to the coach — rejoin as Coach');
        }
        // Cancel the eviction timer
        savedReconnectEntry = entry;
        clearTimeout(entry.timer);
        reconnectTimers.delete(oldSocketId);
        // Remove the old ghost seat so the new socket takes over
        gm.removePlayer(oldSocketId);
        isReconnect = true;
        console.log(`[reconnect] ${trimmedName} rejoined, cancelled TTL for old socket ${oldSocketId}`);
        break;
      }
    }

    // ── Single Coach Enforcement ──────────────────────────────────────────────
    // If a second user tries to join as coach while an active coach is already seated,
    // downgrade them to spectator (view-only, no controls).
    let isSpectator = false;
    if (isCoach && !isReconnect) {
      const existingCoach = gm.state.players.find(p => p.is_coach);
      if (existingCoach) {
        isSpectator = true;
        socket.data.tableId = tableId;
        socket.data.isCoach = false;
        socket.data.isSpectator = true;
        socket.data.name = trimmedName;
        socket.join(tableId);
        socket.emit('room_joined', {
          playerId: socket.id,
          isCoach: false,
          isSpectator: true,
          name: trimmedName,
          tableId
        });
        socket.emit('notification', {
          type: 'spectator',
          message: `Session is managed by ${existingCoach.name} — you are watching as a spectator`
        });
        // Send current game state to the new spectator
        const publicState = gm.getPublicState(socket.id, false);
        socket.emit('game_state', publicState);
        console.log(`[spectator] ${trimmedName} joined ${tableId} as spectator (coach already present)`);
        return;
      }
    }

    const result = gm.addPlayer(socket.id, trimmedName, isCoach, playAtTable);

    if (result.error) return sendError(socket, result.error);

    // If reconnecting coach had an active config phase, restore it
    if (isReconnect && savedReconnectEntry?.configSnapshot) {
      gm.state.config_phase = savedReconnectEntry.configSnapshot.config_phase;
      gm.state.config = savedReconnectEntry.configSnapshot.config;
    }

    socket.data.tableId = tableId;
    socket.data.isCoach = isCoach;
    socket.data.isSpectator = false;
    socket.data.name = trimmedName;
    socket.data.stableId = resolvedStableId;
    socket.join(tableId);

    socket.emit('room_joined', {
      playerId: socket.id,
      isCoach,
      isSpectator: false,
      name: trimmedName,
      tableId
    });

    broadcastState(tableId, {
      type: 'join',
      message: `${trimmedName} ${isCoach ? '(Coach)' : ''} joined the table`
    });

    console.log(`[join] ${trimmedName} (coach=${isCoach}) → ${tableId}`);
  });

  // ── start_game ────────────────────────────
  socket.on('start_game', ({ mode = 'rng' } = {}) => {
    if (!socket.data.isCoach) return sendError(socket, 'Only the coach can start the game');
    const gm = tables.get(socket.data.tableId);
    if (!gm) return sendError(socket, 'Not in a room');

    const result = gm.startGame(mode);
    if (result.error) return sendError(socket, result.error);

    const tableId = socket.data.tableId;

    // Log hand start to DB
    const handId = uuidv4();
    const nonCoachPlayers = gm.state.players
      .filter(p => !p.is_coach)
      .map(p => ({ id: stableIdMap.get(p.id) || p.id, name: p.name, seat: p.seat, stack: p.stack }));
    HandLogger.startHand({
      handId,
      sessionId: gm.sessionId,
      tableId,
      players: nonCoachPlayers,
      dealerSeat: gm.state.dealer_seat,
      isScenario: false
    });
    activeHands.set(tableId, { handId, sessionId: gm.sessionId });
    socket.emit('hand_started', { handId }); // notify coach of active handId for tagging

    broadcastState(tableId, {
      type: 'game_start',
      message: `New hand started (${mode.toUpperCase()} mode)`
    });
    startActionTimer(tableId);
    console.log(`[start_game] mode=${mode}`);
  });

  // ── place_bet ─────────────────────────────
  socket.on('place_bet', ({ action, amount = 0 } = {}) => {
    const tableId = socket.data.tableId;
    const gm = tables.get(tableId);
    if (!gm) return sendError(socket, 'Not in a room');

    // Cancel the running timer BEFORE placeBet to close the race window between
    // auto-fold timeout firing and a legitimate player action arriving.
    // We intentionally do NOT save the remainder here — the new action resets the next turn.
    clearActionTimer(tableId, { saving: false });

    // Capture street BEFORE placeBet (phase may advance inside placeBet)
    const streetBeforeBet = gm.state.phase;

    const result = gm.placeBet(socket.id, action, Number(amount));

    if (result.error) {
      // For pause/turn-order rejections, emit sync_error so client knows to resync
      // without showing a permanent error toast.
      const isSyncRejection = result.error.includes('Not your turn')
        || result.error.includes('paused')
        || result.error.includes('Game is not');
      if (isSyncRejection) {
        socket.emit('sync_error', { message: result.error });
      } else {
        sendError(socket, result.error);
      }
      // Restart timer for the actual current-turn player (handles late-action case)
      startActionTimer(tableId);
      return;
    }

    // Log action to DB using the street captured BEFORE placeBet advanced the phase
    const handInfo = activeHands.get(tableId);
    if (handInfo) {
      const player = gm.state.players.find(p => p.id === socket.id);
      HandLogger.recordAction({
        handId: handInfo.handId,
        playerId: socket.data.stableId || socket.id,
        playerName: player?.name || socket.data.name,
        street: streetBeforeBet,
        action,
        amount: Number(amount) || 0,
        isManualScenario: handInfo.isManualScenario || false
      });
    }

    const player = gm.state.players.find(p => p.id === socket.id);
    broadcastState(tableId, {
      type: 'action',
      message: `${player?.name} ${action}${action === 'raise' ? 's to ' + amount : action === 'call' ? 's' : 's'}`
    });
    const freshState = gm.getPublicState(socket.id, socket.data.isCoach);
    if (freshState.phase === 'showdown' && freshState.showdown_result) {
      io.to(tableId).emit('showdown_result', freshState.showdown_result);
    }
    startActionTimer(tableId);
  });

  // ── manual_deal_card ──────────────────────
  socket.on('manual_deal_card', ({ targetType, targetId, position, card } = {}) => {
    if (!socket.data.isCoach) return sendError(socket, 'Only the coach can deal cards manually');
    const gm = tables.get(socket.data.tableId);
    if (!gm) return sendError(socket, 'Not in a room');

    const result = gm.manualDealCard(targetType, targetId, position, card);
    if (result.error) return sendError(socket, result.error);

    const targetName = targetType === 'board'
      ? 'the board'
      : gm.state.players.find(p => p.id === targetId)?.name || targetId;

    broadcastState(socket.data.tableId, {
      type: 'manual_card',
      message: `Coach dealt ${card} to ${targetName}`
    });
  });

  // ── undo_action ───────────────────────────
  socket.on('undo_action', () => {
    if (!socket.data.isCoach) return sendError(socket, 'Only the coach can undo');
    const gm = tables.get(socket.data.tableId);
    if (!gm) return sendError(socket, 'Not in a room');

    const result = gm.undoAction();
    if (result.error) return sendError(socket, result.error);

    broadcastState(socket.data.tableId, { type: 'undo', message: 'Coach undid the last action' });

    // Mark the undone action in DB so analyzer knows it was reverted
    const undoHandInfo = activeHands.get(socket.data.tableId);
    if (undoHandInfo) {
      HandLogger.markLastActionReverted(undoHandInfo.handId);
    }
  });

  // ── rollback_street ───────────────────────
  socket.on('rollback_street', () => {
    if (!socket.data.isCoach) return sendError(socket, 'Only the coach can roll back a street');
    const gm = tables.get(socket.data.tableId);
    if (!gm) return sendError(socket, 'Not in a room');

    const result = gm.rollbackStreet();
    if (result.error) return sendError(socket, result.error);

    broadcastState(socket.data.tableId, {
      type: 'rollback',
      message: 'Coach rolled back to the previous street'
    });
  });

  // ── toggle_pause ──────────────────────────
  socket.on('toggle_pause', () => {
    if (!socket.data.isCoach) return sendError(socket, 'Only the coach can pause');
    const gm = tables.get(socket.data.tableId);
    if (!gm) return sendError(socket, 'Not in a room');

    const tableId = socket.data.tableId;
    const result = gm.togglePause();
    if (result.paused) {
      clearActionTimer(tableId, { saving: true }); // save remaining time on pause
    } else {
      startActionTimer(tableId, { resumeRemaining: true }); // resume from saved time
    }
    broadcastState(tableId, {
      type: result.paused ? 'pause' : 'resume',
      message: result.paused ? 'Coach paused the game' : 'Coach resumed the game'
    });
  });

  // ── set_mode ──────────────────────────────
  socket.on('set_mode', ({ mode } = {}) => {
    if (!socket.data.isCoach) return sendError(socket, 'Only the coach can set mode');
    const gm = tables.get(socket.data.tableId);
    if (!gm) return sendError(socket, 'Not in a room');

    const result = gm.setMode(mode);
    if (result.error) return sendError(socket, result.error);

    broadcastState(socket.data.tableId, {
      type: 'mode_change',
      message: `Mode switched to ${mode.toUpperCase()}`
    });
  });

  // ── force_next_street ─────────────────────
  socket.on('force_next_street', () => {
    if (!socket.data.isCoach) return sendError(socket, 'Only the coach can force a street');
    const gm = tables.get(socket.data.tableId);
    if (!gm) return sendError(socket, 'Not in a room');

    const result = gm.forceNextStreet();
    if (result.error) return sendError(socket, result.error);

    const tableId = socket.data.tableId;
    broadcastState(tableId, {
      type: 'street_advance',
      message: `Coach advanced to ${gm.state.phase}`
    });
    const freshState = gm.getPublicState(socket.id, socket.data.isCoach);
    if (freshState.phase === 'showdown' && freshState.showdown_result) {
      io.to(tableId).emit('showdown_result', freshState.showdown_result);
    }
    startActionTimer(tableId);
  });

  // ── award_pot ─────────────────────────────
  socket.on('award_pot', ({ winnerId } = {}) => {
    if (!socket.data.isCoach) return sendError(socket, 'Only the coach can award the pot');
    const gm = tables.get(socket.data.tableId);
    if (!gm) return sendError(socket, 'Not in a room');

    const result = gm.awardPot(winnerId);
    if (result.error) return sendError(socket, result.error);

    const winner = gm.state.players.find(p => p.id === winnerId);
    const tableId = socket.data.tableId;
    broadcastState(tableId, {
      type: 'pot_awarded',
      message: `Pot awarded to ${winner?.name}`
    });
    const freshState = gm.getPublicState(socket.id, socket.data.isCoach);
    if (freshState.phase === 'showdown' && freshState.showdown_result) {
      io.to(tableId).emit('showdown_result', freshState.showdown_result);
    }
    startActionTimer(tableId);
  });

  // ── reset_hand ────────────────────────────
  socket.on('reset_hand', () => {
    if (!socket.data.isCoach) return sendError(socket, 'Only the coach can reset');
    const gm = tables.get(socket.data.tableId);
    if (!gm) return sendError(socket, 'Not in a room');

    const tableId = socket.data.tableId;
    clearActionTimer(tableId);

    // Capture state BEFORE reset for DB logging
    const handInfo = activeHands.get(tableId);
    const stateCopy = handInfo ? JSON.parse(JSON.stringify(gm.state)) : null;

    gm.resetForNextHand();

    // Log completed hand to DB
    if (handInfo && stateCopy) {
      HandLogger.endHand({ handId: handInfo.handId, state: stateCopy });
      // Auto-tag the completed hand with pedagogical patterns
      try { HandLogger.analyzeAndTagHand(handInfo.handId); } catch {}
      activeHands.delete(tableId);
    }

    broadcastState(tableId, { type: 'reset', message: 'Ready for next hand' });

    // Emit session stats after hand ends
    const stats = gm.getSessionStats();
    io.to(tableId).emit('session_stats', stats);

    // Playlist mode: auto-load next hand into config_phase
    const playlistGm = tables.get(tableId);
    if (playlistGm && playlistGm.state.playlist_mode?.active) {
      const advance = playlistGm.advancePlaylist();
      if (advance.done) {
        // Playlist exhausted — notify coach and revert to RNG
        playlistGm.setMode('rng');
        io.to(tableId).emit('notification', {
          type: 'playlist_complete',
          message: 'Playlist complete — switching to RNG mode'
        });
      } else {
        // Load next hand into config phase automatically
        const nextHandId = advance.hand.hand_id;
        const nextDetail = HandLogger.getHandDetail(nextHandId);
        if (nextDetail) {
          _loadScenarioIntoConfig(tableId, playlistGm, nextDetail, 'keep');
          broadcastState(tableId, {
            type: 'playlist_advance',
            message: `Playlist: loaded hand ${advance.currentIndex + 1} of ${playlistGm.state.playlist_mode.totalHands}`
          });
        }
      }
    }
  });

  // ── adjust_stack ──────────────────────────
  socket.on('adjust_stack', ({ playerId, amount } = {}) => {
    if (!socket.data.isCoach) return sendError(socket, 'Only the coach can adjust stacks');
    const gm = tables.get(socket.data.tableId);
    if (!gm) return sendError(socket, 'Not in a room');

    const result = gm.adjustStack(playerId, Number(amount));
    if (result.error) return sendError(socket, result.error);

    broadcastState(socket.data.tableId);
  });

  // ── open_config_phase ─────────────────────
  socket.on('open_config_phase', () => {
    if (!socket.data.isCoach) return sendError(socket, 'Only the coach can open the config phase');
    const gm = tables.get(socket.data.tableId);
    if (!gm) return sendError(socket, 'Not in a room');

    gm.openConfigPhase();
    broadcastState(socket.data.tableId, {
      type: 'config_phase',
      message: 'Coach opened hand configuration'
    });
  });

  // ── update_hand_config ────────────────────
  socket.on('update_hand_config', ({ config } = {}) => {
    if (!socket.data.isCoach) return sendError(socket, 'Only the coach can update hand config');
    const gm = tables.get(socket.data.tableId);
    if (!gm) return sendError(socket, 'Not in a room');

    const result = gm.updateHandConfig(config);
    if (result.error) return sendError(socket, result.error);

    broadcastState(socket.data.tableId, {
      type: 'config_updated',
      message: 'Hand configuration updated'
    });
  });

  // ── start_configured_hand ─────────────────
  socket.on('start_configured_hand', () => {
    if (!socket.data.isCoach) return sendError(socket, 'Only the coach can start a configured hand');
    const gm = tables.get(socket.data.tableId);
    if (!gm) return sendError(socket, 'Not in a room');

    const result = gm.startGame();
    if (result.error) return sendError(socket, result.error);

    const tableId = socket.data.tableId;

    // Log hand start to DB (mark as manual scenario for action-level analytics)
    const handId = uuidv4();
    const nonCoachPlayers = gm.state.players
      .filter(p => !p.is_coach)
      .map(p => ({ id: stableIdMap.get(p.id) || p.id, name: p.name, seat: p.seat, stack: p.stack }));
    HandLogger.startHand({
      handId,
      sessionId: gm.sessionId,
      tableId,
      players: nonCoachPlayers,
      dealerSeat: gm.state.dealer_seat,
      isScenario: true
    });
    activeHands.set(tableId, { handId, sessionId: gm.sessionId, isManualScenario: true });
    socket.emit('hand_started', { handId }); // notify coach of active handId for tagging

    broadcastState(tableId, {
      type: 'game_start',
      message: 'Configured hand started'
    });
    startActionTimer(tableId);
  });

  // ── load_hand_scenario ─────────────────────────────────────────────────────
  socket.on('load_hand_scenario', ({ handId, stackMode = 'keep' } = {}) => {
    if (!socket.data.isCoach) return sendError(socket, 'Only the coach can load scenarios');
    const tableId = socket.data.tableId;
    const gm = tables.get(tableId);
    if (!gm) return sendError(socket, 'Not in a room');
    if (gm.state.phase !== 'waiting') return sendError(socket, 'Can only load a scenario between hands');
    if (!['keep', 'historical'].includes(stackMode)) return sendError(socket, 'stackMode must be keep or historical');

    const handDetail = HandLogger.getHandDetail(handId);
    if (!handDetail) return sendError(socket, `Hand ${handId} not found`);

    const result = _loadScenarioIntoConfig(tableId, gm, handDetail, stackMode);

    if (result.countMismatch) {
      socket.emit('notification', {
        type: 'warning',
        message: `Scenario had ${result.histCount} players, table has ${result.activeCount}. Cards mapped by position (BTN→BTN, SB→SB…).`
      });
    }

    broadcastState(tableId, {
      type: 'scenario_loaded',
      message: `Loaded scenario from hand history (stack mode: ${stackMode})`
    });
  });

  // ── update_hand_tags ───────────────────────────────────────────────────────
  socket.on('update_hand_tags', ({ handId, tags } = {}) => {
    if (!socket.data.isCoach) return sendError(socket, 'Only the coach can tag hands');
    if (!handId || !Array.isArray(tags)) return sendError(socket, 'handId and tags[] are required');
    try {
      HandLogger.updateCoachTags(handId, tags);
      socket.emit('hand_tags_saved', { handId, coach_tags: tags });
    } catch (err) {
      sendError(socket, `Failed to save tags: ${err.message}`);
    }
  });

  // ── create_playlist ────────────────────────────────────────────────────────
  socket.on('create_playlist', ({ name, description = '' } = {}) => {
    if (!socket.data.isCoach) return sendError(socket, 'Only the coach can create playlists');
    if (!name || typeof name !== 'string' || !name.trim()) {
      return sendError(socket, 'Playlist name is required');
    }
    const tableId = socket.data.tableId;
    const playlist = HandLogger.createPlaylist({ name: name.trim(), description, tableId });
    socket.emit('playlist_state', { playlists: HandLogger.getPlaylists({ tableId }) });
    socket.emit('notification', { type: 'playlist_created', message: `Playlist "${playlist.name}" created` });
  });

  // ── get_playlists ──────────────────────────────────────────────────────────
  socket.on('get_playlists', () => {
    const tableId = socket.data.tableId;
    const playlists = HandLogger.getPlaylists({ tableId: tableId || null });
    socket.emit('playlist_state', { playlists });
  });

  // ── add_to_playlist ────────────────────────────────────────────────────────
  socket.on('add_to_playlist', ({ playlistId, handId } = {}) => {
    if (!socket.data.isCoach) return sendError(socket, 'Only the coach can modify playlists');
    if (!playlistId || !handId) return sendError(socket, 'playlistId and handId are required');
    try {
      HandLogger.addHandToPlaylist(playlistId, handId);
      const tableId = socket.data.tableId;
      socket.emit('playlist_state', { playlists: HandLogger.getPlaylists({ tableId }) });
    } catch (err) {
      sendError(socket, `Could not add hand to playlist: ${err.message}`);
    }
  });

  // ── remove_from_playlist ───────────────────────────────────────────────────
  socket.on('remove_from_playlist', ({ playlistId, handId } = {}) => {
    if (!socket.data.isCoach) return sendError(socket, 'Only the coach can modify playlists');
    if (!playlistId || !handId) return sendError(socket, 'playlistId and handId are required');
    HandLogger.removeHandFromPlaylist(playlistId, handId);
    const tableId = socket.data.tableId;
    socket.emit('playlist_state', { playlists: HandLogger.getPlaylists({ tableId }) });
  });

  // ── delete_playlist ────────────────────────────────────────────────────────
  socket.on('delete_playlist', ({ playlistId } = {}) => {
    if (!socket.data.isCoach) return sendError(socket, 'Only the coach can delete playlists');
    if (!playlistId) return sendError(socket, 'playlistId is required');
    const tableId = socket.data.tableId;
    const gm = tables.get(tableId);
    // If this playlist was active, deactivate first
    if (gm && gm.state.playlist_mode?.playlistId === playlistId) {
      gm.deactivatePlaylistMode();
    }
    HandLogger.deletePlaylist(playlistId);
    socket.emit('playlist_state', { playlists: HandLogger.getPlaylists({ tableId }) });
    socket.emit('notification', { type: 'playlist_deleted', message: 'Playlist deleted' });
  });

  // ── activate_playlist ──────────────────────────────────────────────────────
  socket.on('activate_playlist', ({ playlistId } = {}) => {
    if (!socket.data.isCoach) return sendError(socket, 'Only the coach can activate playlists');
    const tableId = socket.data.tableId;
    const gm = tables.get(tableId);
    if (!gm) return sendError(socket, 'Not in a room');
    if (gm.state.phase !== 'waiting') return sendError(socket, 'Can only activate playlist between hands');

    const hands = HandLogger.getPlaylistHands(playlistId);
    if (!hands.length) return sendError(socket, 'Playlist is empty');

    const result = gm.activatePlaylistMode({ playlistId, hands });
    if (result.error) return sendError(socket, result.error);

    // Auto-load the first hand into config phase
    const firstDetail = HandLogger.getHandDetail(hands[0].hand_id);
    if (firstDetail) {
      _loadScenarioIntoConfig(tableId, gm, firstDetail, 'keep');
    }

    broadcastState(tableId, {
      type: 'playlist_activated',
      message: `Playlist activated — ${result.totalHands} hands queued`
    });
    io.to(tableId).emit('playlist_state', { playlists: HandLogger.getPlaylists({ tableId: tableId }) });
  });

  // ── deactivate_playlist ────────────────────────────────────────────────────
  socket.on('deactivate_playlist', () => {
    if (!socket.data.isCoach) return sendError(socket, 'Only the coach can deactivate playlists');
    const tableId = socket.data.tableId;
    const gm = tables.get(tableId);
    if (!gm) return sendError(socket, 'Not in a room');
    gm.deactivatePlaylistMode();
    broadcastState(tableId, { type: 'playlist_deactivated', message: 'Playlist mode deactivated' });
  });

  // ── disconnect ────────────────────────────
  socket.on('disconnect', () => {
    stableIdMap.delete(socket.id);
    const tableId = socket.data.tableId;
    if (!tableId) return;
    const gm = tables.get(tableId);
    if (!gm) return;

    const name = socket.data.name || socket.id;
    const isCoach = socket.data.isCoach;
    const isSpectator = socket.data.isSpectator;

    // Spectators are not seated in GameManager — just drop them silently, no TTL needed
    if (isSpectator) {
      console.log(`[disconnect] spectator ${name} left ${tableId}`);
      return;
    }

    // ── Ghost-Coach Auto-Pause ──────────────────────────────────────────────
    // When the coach disconnects, auto-pause the game and freeze the action timer
    // so players cannot act unobserved during the reconnect window.
    if (isCoach) {
      if (!gm.state.paused) {
        gm.state.paused = true; // direct mutation — togglePause would emit twice
        clearActionTimer(tableId, { saving: true }); // preserve remaining time
        io.to(tableId).emit('coach_disconnected', {
          message: `${name} (Coach) disconnected — game paused. Reconnect window: 30s`
        });
        io.to(tableId).emit('notification', {
          type: 'coach_disconnect',
          message: `Game paused — waiting for coach to reconnect`
        });
      } else {
        // Game was already paused; just freeze timer position if running (safety)
        clearActionTimer(tableId, { saving: true });
        io.to(tableId).emit('notification', {
          type: 'disconnect',
          message: `${name} (Coach) disconnected — reconnect window: 30s`
        });
      }
    } else {
      // Regular player disconnect: clear timer only if it was their turn
      if (gm.state.current_turn === socket.id) {
        clearActionTimer(tableId, { saving: false });
      }
      io.to(tableId).emit('notification', {
        type: 'disconnect',
        message: `${name} disconnected — reconnect window: 30s`
      });
    }

    broadcastState(tableId); // keep state visible without that player's private data
    console.log(`[disconnect] ${name} (coach=${isCoach}) — starting 30s TTL`);

    // Delay removal — give player 30s to reconnect
    const timer = setTimeout(() => {
      reconnectTimers.delete(socket.id);
      const currentGm = tables.get(tableId);
      if (!currentGm) return;
      currentGm.removePlayer(socket.id);
      // If the coach never came back, clear the paused state so play can eventually resume
      // when a new coach joins (they will have to manually unpause)
      broadcastState(tableId, { type: 'leave', message: `${name} left the table (timeout)` });
      console.log(`[TTL expired] ${name} removed from ${tableId}`);
    }, 30_000);

    // Persist config_phase state so it's available when coach reconnects within 30s
    const configSnapshot = (() => {
      const g = tables.get(tableId);
      if (!g || !g.state.config_phase) return null;
      return { config_phase: true, config: g.state.config };
    })();
    reconnectTimers.set(socket.id, { timer, tableId, name, isCoach, configSnapshot });
  });
});

// ─────────────────────────────────────────────
//  History REST API
// ─────────────────────────────────────────────

// GET /api/hands?limit=20&offset=0&tableId=main-table
app.get('/api/hands', (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit)  || 20, 100);
    const offset = parseInt(req.query.offset) || 0;
    const tableId = req.query.tableId || null;
    const hands = HandLogger.getHands({ tableId, limit, offset });
    res.json({ hands, limit, offset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/hands/:handId
app.get('/api/hands/:handId', (req, res) => {
  try {
    const detail = HandLogger.getHandDetail(req.params.handId);
    if (!detail) return res.status(404).json({ error: 'Hand not found' });
    res.json(detail);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/players/:stableId/stats  — career stats across all sessions
app.get('/api/players/:stableId/stats', (req, res) => {
  try {
    const stats = HandLogger.getPlayerStats(req.params.stableId);
    if (!stats) return res.status(404).json({ error: 'Player not found' });
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sessions/:sessionId/stats
app.get('/api/sessions/:sessionId/stats', (req, res) => {
  try {
    const stats = HandLogger.getSessionStats(req.params.sessionId);
    res.json({ sessionId: req.params.sessionId, players: stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sessions/current — returns stats for the current in-memory session of main-table
app.get('/api/sessions/current', (req, res) => {
  try {
    const gm = tables.get('main-table');
    if (!gm) return res.json({ players: [] });
    const stats = gm.getSessionStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
//  Playlist REST API
// ─────────────────────────────────────────────

// GET /api/playlists?tableId=main-table
app.get('/api/playlists', (req, res) => {
  try {
    const playlists = HandLogger.getPlaylists({ tableId: req.query.tableId || null });
    res.json({ playlists });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/playlists — body: { name, description?, tableId? }
app.post('/api/playlists', (req, res) => {
  try {
    const { name, description = '', tableId = null } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name is required' });
    const playlist = HandLogger.createPlaylist({ name, description, tableId });
    res.status(201).json(playlist);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/playlists/:playlistId/hands
app.get('/api/playlists/:playlistId/hands', (req, res) => {
  try {
    const hands = HandLogger.getPlaylistHands(req.params.playlistId);
    res.json({ hands });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/playlists/:playlistId/hands — body: { handId }
app.post('/api/playlists/:playlistId/hands', (req, res) => {
  try {
    const { handId } = req.body || {};
    if (!handId) return res.status(400).json({ error: 'handId is required' });
    const entry = HandLogger.addHandToPlaylist(req.params.playlistId, handId);
    res.status(201).json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/playlists/:playlistId/hands/:handId
app.delete('/api/playlists/:playlistId/hands/:handId', (req, res) => {
  try {
    HandLogger.removeHandFromPlaylist(req.params.playlistId, req.params.handId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/playlists/:playlistId
app.delete('/api/playlists/:playlistId', (req, res) => {
  try {
    HandLogger.deletePlaylist(req.params.playlistId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
//  Health check
// ─────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ status: 'ok', tables: tables.size }));

// ─────────────────────────────────────────────
//  Graceful shutdown
// ─────────────────────────────────────────────
function markAllHandsIncomplete() {
  for (const [tableId, handInfo] of activeHands.entries()) {
    try { HandLogger.markIncomplete(handInfo.handId); } catch {}
  }
}

process.on('SIGINT',  () => { markAllHandsIncomplete(); process.exit(0); });
process.on('SIGTERM', () => { markAllHandsIncomplete(); process.exit(0); });

// ─────────────────────────────────────────────
//  Static file serving (production)
//  In development, the Vite dev server handles client assets.
//  In production, Express serves the React build from client/dist.
// ─────────────────────────────────────────────
const CLIENT_DIST = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));

  // Catch-all: serve index.html for any unknown route (client-side routing)
  // This must come AFTER all /api routes so API calls are not intercepted.
  app.get('*', (req, res) => {
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });

  console.log(`[static] Serving React build from ${CLIENT_DIST}`);
}

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Poker Training Server running on http://localhost:${PORT}`);
});
