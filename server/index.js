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
 *   set_blind_levels   { sb, bb }
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
 *   load_replay           { handId }
 *   replay_step_forward   {}
 *   replay_step_back      {}
 *   replay_jump_to        { cursor }
 *   replay_branch         {}
 *   replay_unbranch       {}
 *   replay_exit           {}
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
 *   replay_loaded      { handId, actionCount }  — confirms replay loaded successfully
 *
 * REST API:
 *   GET /              — React app (production only; in dev, Vite dev server handles this)
 *   GET /api/hands                       — paginated hand history
 *   GET /api/hands/:handId               — full hand detail with actions
 *   GET /api/sessions/:sessionId/stats   — DB-backed session stats
 *   GET /api/sessions/:sessionId/report  — self-contained HTML report
 *   GET /api/sessions/current            — live in-memory session stats
 */

const path = require('path');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs   = require('fs');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const SessionManager = require('./game/SessionManager');
const HandLogger = require('./db/HandLoggerSupabase');
const { getPosition } = require('./game/positions');
const supabaseAdmin = require('./db/supabase');
const PlayerRoster = require('./auth/PlayerRoster');
const { generateHTMLReport } = require('./reports/SessionReport');
const { generateReport: generateAlphaReport } = require('./logs/AlphaReporter');
const log = require('./logs/logger');
const { v4: uuidv4 } = require('uuid');

const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  console.error('[startup] FATAL: SESSION_SECRET environment variable is not set.');
  console.error('[startup] Set a strong random secret in your .env file before starting the server.');
  console.error('[startup] Example: SESSION_SECRET=<run: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))")>');
  process.exit(1);
}

const ALLOWED_ORIGIN = process.env.CORS_ORIGIN || '';
if (!ALLOWED_ORIGIN && process.env.NODE_ENV === 'production') {
  console.warn('[startup] WARNING: CORS_ORIGIN is not set. Cross-origin requests will be blocked.');
  console.warn('[startup] Set CORS_ORIGIN=https://your-domain.com in your production .env file.');
}

// Per-table active hand tracking
const activeHands = new Map(); // tableId → { handId, sessionId }

// Stable identity map: socketId → stableId (UUID from client localStorage)
const stableIdMap = new Map();

const app = express();
app.use(cors({ origin: ALLOWED_ORIGIN }));
app.use(express.json());
app.use(log.httpMiddleware());

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: ALLOWED_ORIGIN,
    methods: ['GET', 'POST']
  }
});

// ─── Auth middleware ───────────────────────────────────────────────────────────

function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'auth_required', message: 'Login required' });
  }
  const payload = HandLogger.authenticateToken(auth.slice(7));
  if (!payload) {
    return res.status(401).json({ error: 'invalid_token', message: 'Session expired — please log in again' });
  }
  req.user = payload;
  next();
}

// ─── Rate limiter for auth endpoint ───────────────────────────────────────────

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests', message: 'Too many login attempts — try again in 15 minutes' },
});

// One SessionManager per table. For MVP: single table.
const tables = new Map();

// Map<socketId, { timer, tableId, name, isCoach }> — pending reconnect TTLs
const reconnectTimers = new Map();

// Map<stableId, stack> — chip count saved when a player's TTL expires so it can be restored on reconnect
const ghostStacks = new Map();

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
 * Send a sync_error (non-fatal game-state rejection) to the originating socket.
 * Use this instead of sendError for game-logic rejections so clients don't treat
 * them as fatal connection errors.
 */
function sendSyncError(socket, message) {
  socket.emit('sync_error', { message });
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
    // ISS-40: timer/pause race — if the coach pauses at the exact millisecond this
    // fires, `state.paused` is checked first. The toggle_pause handler clears the
    // timer (clearActionTimer) before setting state.paused, so if we reach here the
    // timer was NOT cancelled, meaning the pause event hadn't arrived yet — the paused
    // guard below catches that case correctly. Node.js is single-threaded so there
    // is no true concurrency, but the order of setTimeouts vs incoming socket events
    // is not strictly defined. The phase + current_turn guards below are the final
    // safety net; if phase changed or turn moved, we do nothing.
    if (!currentGm || currentGm.state.paused) return;
    // Guard: only auto-fold during active betting phases (phase may have changed since timer started)
    const activeBetting = ['preflop', 'flop', 'turn', 'river'];
    if (!activeBetting.includes(currentGm.state.phase)) return;
    if (currentGm.state.current_turn !== playerId) return; // turn moved on (e.g. action already taken)
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
 * Count active, seated, non-coach, non-disconnected players at the table.
 * This is the count that matters for matching playlist hands to the live table.
 */
function _activeNonCoachCount(gm) {
  return gm.state.players.filter(p => !p.is_coach && p.seat >= 0 && !p.disconnected).length;
}

/**
 * Search the active playlist for the next hand whose recorded player count matches
 * `activeCount`. Searches forward from currentIndex+1 and wraps around once through
 * the entire list. Returns the target index, or -1 if no match exists anywhere.
 *
 * Does NOT mutate playlist state.
 */
async function _findMatchingPlaylistIndex(gm, activeCount) {
  const pm = gm.state.playlist_mode;
  if (!pm.active || !pm.hands.length) return -1;
  const total = pm.hands.length;
  for (let i = 1; i <= total; i++) {
    const idx = (pm.currentIndex + i) % total;
    const h = pm.hands[idx];
    const detail = await HandLogger.getHandDetail(h.hand_id);
    if (!detail) continue; // deleted hand — skip
    const handCount = (detail.players || []).filter(p => (p.seat ?? -1) >= 0).length;
    if (handCount === activeCount) return idx;
  }
  return -1; // no matching hand anywhere in the playlist
}

/**
 * _advancePlaylist
 * Finds the next matching hand for the live table, loads it into config, and broadcasts.
 * Returns true if a hand was loaded, false if the playlist was exhausted/hard-stopped.
 * Mutates playlist state via seekPlaylist.
 */
async function _advancePlaylist(tableId, gm) {
  const activeCount = _activeNonCoachCount(gm);
  const matchIdx = await _findMatchingPlaylistIndex(gm, activeCount);

  if (matchIdx === -1) {
    gm.deactivatePlaylistMode();
    io.to(tableId).emit('notification', {
      type: 'playlist_complete',
      message: `Playlist stopped — no ${activeCount}-player hands remaining.`
    });
    broadcastState(tableId);
    return false;
  }

  const advance = gm.seekPlaylist(matchIdx);
  const nextDetail = await HandLogger.getHandDetail(advance.hand.hand_id);
  if (!nextDetail) {
    io.to(tableId).emit('notification', {
      type: 'warning',
      message: `Playlist: hand not found (deleted?)`
    });
    broadcastState(tableId);
    return false;
  }

  const loadResult = _loadScenarioIntoConfig(tableId, gm, nextDetail, 'keep');
  if (loadResult.error) {
    io.to(tableId).emit('notification', { type: 'warning', message: `Playlist load failed: ${loadResult.error}` });
    broadcastState(tableId);
    return false;
  }

  broadcastState(tableId, {
    type: 'playlist_advance',
    message: `Playlist: hand ${advance.currentIndex + 1} of ${gm.state.playlist_mode.hands.length}`
  });
  return true;
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
    // ISS-58: adjustStack validates against total_bet_this_round; between hands this
    // is always 0, so the call always succeeds. If called mid-hand this could fail —
    // the load_hand_scenario handler rejects mid-hand calls (phase !== 'waiting') so
    // this code path is only reached between hands.
    activePlayers.forEach((player, i) => {
      const rel  = (i - liveDealerIdx + activeCount) % activeCount;
      const hist = histRelMap.get(rel % Math.max(histCount, 1));
      if (hist?.stack_start != null) gm.adjustStack(player.id, hist.stack_start);
    });
  }

  const openResult = gm.openConfigPhase();
  if (openResult && openResult.error) return { error: openResult.error };
  const updateResult = gm.updateHandConfig({ mode: 'hybrid', hole_cards: holeCards, board });
  if (updateResult && updateResult.error) return { error: updateResult.error };

  return { countMismatch: activeCount !== histCount, activeCount, histCount };
}

// ─────────────────────────────────────────────
//  Connection handling
// ─────────────────────────────────────────────
io.on('connection', socket => {
  console.log(`[connect] ${socket.id}`);

  // ── join_room ─────────────────────────────
  socket.on('join_room', async ({ name, isCoach = false, isSpectator: payloadSpectator = false, tableId = 'main-table', stableId, token = '' } = {}) => {
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return sendError(socket, 'Name is required');
    }

    const trimmedName = name.trim();

    // Spectators skip auth — they cannot act, just observe
    if (!payloadSpectator) {
      const authResult = HandLogger.authenticateToken(token);
      if (!authResult) {
        return sendError(socket, 'Authentication required — please log in');
      }
      // Use server-verified identity (ignore client-supplied flags)
      isCoach = authResult.role === 'coach';
      stableId = authResult.stableId;
    }

    const gm = getOrCreateTable(tableId);

    // Resolve stable identity — use the UUID from the JWT for everyone (coaches included).
    // Fallback is socket.id only if no stableId was issued (should not occur for roster players).
    const resolvedStableId = (stableId && typeof stableId === 'string' && stableId.length > 0)
      ? stableId
      : socket.id;
    stableIdMap.set(socket.id, resolvedStableId);
    HandLogger.upsertPlayerIdentity(resolvedStableId, trimmedName).catch(err => log.error('db', 'upsert_identity_failed', '[HandLogger] upsertPlayerIdentity', { err, tableId, playerId: resolvedStableId }));

    // Check if a previous session for this player name is pending TTL (reconnect path)
    let isReconnect = false;
    let savedReconnectEntry = null;
    for (const [oldSocketId, entry] of reconnectTimers.entries()) {
      if (entry.tableId === tableId && entry.name === trimmedName) {
        // On reconnect: coach flag must match the original seat to prevent impersonation
        if (entry.isCoach && !isCoach) {
          return sendError(socket, 'This seat belongs to the coach — rejoin as Coach');
        }
        if (!entry.isCoach && isCoach) {
          return sendError(socket, 'This seat belongs to a player — rejoin without coach flag');
        }
        // Cancel the eviction timer
        savedReconnectEntry = entry;
        clearTimeout(entry.timer);
        reconnectTimers.delete(oldSocketId);
        // Remove the old ghost seat so the new socket takes over
        gm.removePlayer(oldSocketId);
        isReconnect = true;
        log.info('socket', 'player_reconnect', `${trimmedName} rejoined, cancelled TTL`, { tableId, name: trimmedName });
        console.log(`[reconnect] ${trimmedName} rejoined, cancelled TTL for old socket ${oldSocketId}`);
        break;
      }
    }

    // ── Spectator handling ────────────────────────────────────────────────────
    // Case 1: explicit spectator join (payloadSpectator = true)
    // Case 2: second coach attempt while a coach is already seated (downgrade)
    let isSpectator = false;

    const joinAsSpectator = (reason) => {
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
      if (reason) {
        socket.emit('notification', { type: 'spectator', message: reason });
      }
      const publicState = gm.getPublicState(socket.id, false);
      socket.emit('game_state', publicState);
      log.info('game', 'player_join', `${trimmedName} joined as spectator`, { tableId, name: trimmedName, role: 'spectator' });
      console.log(`[spectator] ${trimmedName} joined ${tableId} as spectator (${reason || 'explicit'})`);
    };

    if (payloadSpectator && !isCoach) {
      joinAsSpectator('');
      return;
    }

    if (isCoach && !isReconnect) {
      const existingCoach = gm.state.players.find(p => p.is_coach);
      if (existingCoach) {
        // Another coach is already running this session — demote to regular player.
        // Their UUID is real so they will be tracked like any student.
        isCoach = false;
        socket.emit('notification', { type: 'info', message: `Session is managed by ${existingCoach.name} — you are joining as a player` });
      }
    }

    const result = gm.addPlayer(socket.id, trimmedName, isCoach, resolvedStableId);

    if (result.error) return sendError(socket, result.error);

    // Restore stack if this player had a saved stack from a previous TTL expiry
    if (ghostStacks.has(resolvedStableId)) {
      gm.adjustStack(socket.id, ghostStacks.get(resolvedStableId));
      ghostStacks.delete(resolvedStableId);
    }

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

    log.info('game', 'player_join', `${trimmedName} joined`, { tableId, name: trimmedName, role: isCoach ? 'coach' : 'player', playerId: resolvedStableId });
    log.trackSocket('join_room', tableId, resolvedStableId, { name: trimmedName, isCoach });
    console.log(`[join] ${trimmedName} (coach=${isCoach}) → ${tableId}`);
  });

  // ── start_game ────────────────────────────
  socket.on('start_game', async ({ mode = 'rng' } = {}) => {
    if (!socket.data.isCoach) return sendError(socket, 'Only the coach can start the game');
    const gm = tables.get(socket.data.tableId);
    if (!gm) return sendError(socket, 'Not in a room');

    const result = gm.startGame(mode);
    if (result.error) return sendError(socket, result.error);

    const tableId = socket.data.tableId;

    // Skip DB logging for branched replay hands — they're exploratory, not recorded
    if (!gm.state.is_replay_branch) {
      // Log hand start to DB
      const handId = uuidv4();
      const allSeatedPlayers = gm.state.players
        .filter(p => !p.is_shadow && !p.is_observer)
        .map(p => ({ id: stableIdMap.get(p.id) || p.id, name: p.name, seat: p.seat, stack: p.stack, is_coach: p.is_coach }));
      await HandLogger.startHand({
        handId,
        sessionId: gm.sessionId,
        tableId,
        players: allSeatedPlayers,
        allPlayers: allSeatedPlayers,
        dealerSeat: gm.state.dealer_seat,
        smallBlind: gm.state.small_blind,
        bigBlind: gm.state.big_blind,
        isScenario: false,
        sessionType: 'live',
      }).catch(err => log.error('db', 'start_hand_failed', '[HandLogger] startHand', { err, tableId, sessionId: gm.sessionId }));
      activeHands.set(tableId, { handId, sessionId: gm.sessionId });
      socket.emit('hand_started', { handId }); // notify coach of active handId for tagging
    }

    broadcastState(tableId, {
      type: 'game_start',
      message: `New hand started (${mode.toUpperCase()} mode)`
    });
    startActionTimer(tableId);
    log.info('game', 'hand_start', `hand started mode=${mode}`, { tableId, mode, sessionId: gm.sessionId });
    log.trackSocket('start_game', tableId, socket.data.stableId, { mode });
    console.log(`[start_game] mode=${mode}`);
  });

  // ── place_bet ─────────────────────────────
  socket.on('place_bet', ({ action, amount = 0 } = {}) => {
    const tableId = socket.data.tableId;
    const gm = tables.get(tableId);
    if (!gm) return sendError(socket, 'Not in a room');

    // In branched replay the coach acts on behalf of the current shadow player.
    // Otherwise the sender acts for themselves as usual.
    const isBranchedCoach = gm.state.is_replay_branch && socket.data.isCoach;
    const effectivePlayerId = isBranchedCoach ? gm.state.current_turn : socket.id;

    if (isBranchedCoach && !effectivePlayerId) {
      return sendError(socket, 'No active shadow player to act for');
    }

    // Capture decision time BEFORE clearing the timer (clearActionTimer removes the entry)
    const timerEntry = actionTimers.get(tableId);
    const decisionTimeMs = timerEntry ? (Date.now() - timerEntry.startedAt) : null;

    // Cancel the running timer BEFORE placeBet to close the race window between
    // auto-fold timeout firing and a legitimate player action arriving.
    // We intentionally do NOT save the remainder here — the new action resets the next turn.
    clearActionTimer(tableId, { saving: false });

    // Capture street + player stack + pot BEFORE placeBet (state mutates inside)
    const streetBeforeBet = gm.state.phase;
    const playerBeforeBet = gm.state.players.find(p => p.id === effectivePlayerId);
    const stackBeforeBet  = playerBeforeBet?.stack ?? null;
    const potBeforeBet    = gm.state.pot ?? null;

    const result = gm.placeBet(effectivePlayerId, action, Number(amount));

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

    // Log action to DB — skip for branched replay hands (exploratory, not recorded)
    const handInfo = activeHands.get(tableId);
    if (handInfo && !isBranchedCoach) {
      const player = gm.state.players.find(p => p.id === effectivePlayerId);
      // Compute position using game state (socket.id keys) then look up by effectivePlayerId
      const seatedForPos = gm.state.players
        .filter(p => p.seat >= 0)
        .sort((a, b) => a.seat - b.seat)
        .map(p => ({ player_id: p.id, seat: p.seat }));
      const position = getPosition(seatedForPos, gm.state.dealer_seat ?? -1, effectivePlayerId);
      HandLogger.recordAction({
        handId: handInfo.handId,
        playerId: socket.data.stableId || socket.id,
        playerName: player?.name || socket.data.name,
        street: streetBeforeBet,
        action,
        amount: Number(amount) || 0,
        isManualScenario: handInfo.isManualScenario || false,
        stackAtAction: stackBeforeBet,
        potAtAction:   potBeforeBet,
        decisionTimeMs,
        position,
      }).catch(err => log.error('db', 'record_action_failed', '[HandLogger] recordAction', { err, tableId: socket.data.tableId }));
    }

    const actingPlayer = gm.state.players.find(p => p.id === effectivePlayerId);
    broadcastState(tableId, {
      type: 'action',
      message: `${actingPlayer?.name} ${action}${action === 'raise' ? 's to ' + amount : action === 'call' ? 's' : 's'}`
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
    if (gm.state.phase === 'waiting') return sendSyncError(socket, 'Nothing to undo between hands');

    const result = gm.undoAction();
    if (result.error) return sendSyncError(socket, result.error);

    broadcastState(socket.data.tableId, { type: 'undo', message: 'Coach undid the last action' });

    // Mark the undone action in DB so analyzer knows it was reverted
    const undoHandInfo = activeHands.get(socket.data.tableId);
    if (undoHandInfo) {
      HandLogger.markLastActionReverted(undoHandInfo.handId).catch(err => log.error('db', 'undo_revert_failed', '[HandLogger] markLastActionReverted', { err, tableId: socket.data.tableId }));
    }
  });

  // ── rollback_street ───────────────────────
  socket.on('rollback_street', () => {
    if (!socket.data.isCoach) return sendError(socket, 'Only the coach can roll back a street');
    const gm = tables.get(socket.data.tableId);
    if (!gm) return sendError(socket, 'Not in a room');

    const result = gm.rollbackStreet();
    if (result.error) {
      sendSyncError(socket, result.error);
      broadcastState(socket.data.tableId); // WF-11: unblock client even on failure
      return;
    }

    broadcastState(socket.data.tableId, {
      type: 'rollback',
      message: 'Coach rolled back to the previous street'
    });
  });

  // ── set_player_in_hand ────────────────────
  socket.on('set_player_in_hand', ({ playerId, inHand } = {}) => {
    if (!socket.data.isCoach) return sendError(socket, 'Only the coach can change in-hand status');
    const tableId = socket.data.tableId;
    const gm = tables.get(tableId);
    if (!gm) return sendError(socket, 'Not in a room');
    const result = gm.setPlayerInHand(playerId, inHand);
    if (result.error) return sendError(socket, result.error);
    broadcastState(tableId);
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

  // ── set_blind_levels ──────────────────────
  socket.on('set_blind_levels', ({ sb, bb } = {}) => {
    if (!socket.data.isCoach) return sendError(socket, 'Only the coach can change blind levels');
    const gm = tables.get(socket.data.tableId);
    if (!gm) return sendError(socket, 'Not in a room');
    const result = gm.setBlindLevels(Number(sb), Number(bb));
    if (result.error) return sendSyncError(socket, result.error);
    broadcastState(socket.data.tableId, {
      type: 'blind_change',
      message: `Blinds set to ${sb}/${bb}`
    });
  });

  // ── set_mode ──────────────────────────────
  socket.on('set_mode', ({ mode } = {}) => {
    if (!socket.data.isCoach) return sendError(socket, 'Only the coach can set mode');
    const gm = tables.get(socket.data.tableId);
    if (!gm) return sendError(socket, 'Not in a room');
    const ACTIVE_PHASES = new Set(['preflop', 'flop', 'turn', 'river', 'showdown', 'replay']);
    if (ACTIVE_PHASES.has(gm.state.phase)) return sendSyncError(socket, 'Cannot change mode during an active hand');

    const result = gm.setMode(mode);
    if (result.error) return sendSyncError(socket, result.error);

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
    if (result.error) return sendSyncError(socket, result.error);

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
  socket.on('reset_hand', async () => {
    if (!socket.data.isCoach) return sendError(socket, 'Only the coach can reset');
    const gm = tables.get(socket.data.tableId);
    if (!gm) return sendError(socket, 'Not in a room');

    const tableId = socket.data.tableId;
    clearActionTimer(tableId);
    pausedTimerRemainders.delete(tableId); // discard any paused remainder from the old hand

    // Branched replay hands are exploratory — unbranch back to replay instead of logging/advancing
    if (gm.state.is_replay_branch) {
      const result = gm.unBranchToReplay();
      if (result.error) return sendSyncError(socket, result.error);
      broadcastState(tableId, { type: 'replay_unbranced', message: 'Returned to replay' });
      return;
    }

    // Capture state BEFORE reset for DB logging
    const handInfo = activeHands.get(tableId);
    const stateCopy = handInfo ? JSON.parse(JSON.stringify(gm.state)) : null;

    gm.resetForNextHand();

    // Log completed hand to DB
    if (handInfo && stateCopy) {
      HandLogger.endHand({ handId: handInfo.handId, state: stateCopy, socketToStable: Object.fromEntries(stableIdMap) })
        .then(() => HandLogger.analyzeAndTagHand(handInfo.handId))
        .catch(err => log.error('db', 'end_hand_failed', '[HandLogger] endHand/analyzeAndTagHand', { err, tableId: socket.data.tableId }));
      activeHands.delete(tableId);
    }

    broadcastState(tableId, { type: 'reset', message: 'Ready for next hand' });

    // Emit session stats after hand ends
    const stats = gm.getSessionStats();
    io.to(tableId).emit('session_stats', stats);

    // Playlist mode: advance to next matching hand (hard-stop if none match)
    const playlistGm = tables.get(tableId);
    if (playlistGm && playlistGm.state.playlist_mode?.active) {
      await _advancePlaylist(tableId, playlistGm);
    }
  });

  // ── adjust_stack ──────────────────────────
  socket.on('adjust_stack', ({ playerId, amount } = {}) => {
    if (!socket.data.isCoach) return sendError(socket, 'Only the coach can adjust stacks');
    const gm = tables.get(socket.data.tableId);
    if (!gm) return sendError(socket, 'Not in a room');

    const result = gm.adjustStack(playerId, Number(amount));
    if (result.error) return sendError(socket, result.error);

    // Log restock to stack_adjustments for audit trail
    const sessionId = gm.state?.session_id;
    const stableId  = stableIdMap.get(playerId) || playerId;
    if (sessionId && stableId && !String(stableId).startsWith('coach_')) {
      HandLogger.logStackAdjustment(sessionId, stableId, Number(amount)).catch(() => {});
    }

    broadcastState(socket.data.tableId);
  });

  // ── open_config_phase ─────────────────────
  socket.on('open_config_phase', () => {
    if (!socket.data.isCoach) return sendError(socket, 'Only the coach can open the config phase');
    const gm = tables.get(socket.data.tableId);
    if (!gm) return sendError(socket, 'Not in a room');
    if (gm.state.phase === 'replay') return sendSyncError(socket, 'Cannot open config phase during replay — exit replay first');

    const ocResult = gm.openConfigPhase();
    if (ocResult.error) return sendSyncError(socket, ocResult.error);
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
  socket.on('start_configured_hand', async () => {
    if (!socket.data.isCoach) return sendError(socket, 'Only the coach can start a configured hand');
    const gm = tables.get(socket.data.tableId);
    if (!gm) return sendError(socket, 'Not in a room');
    if (!gm.state.config_phase) return sendSyncError(socket, 'No active config phase — call open_config_phase first');

    const result = gm.startGame();
    if (result.error) return sendSyncError(socket, result.error);

    const tableId = socket.data.tableId;

    // Log hand start to DB (mark as manual scenario for action-level analytics)
    const handId = uuidv4();
    const allSeatedPlayers = gm.state.players
      .map(p => ({ id: stableIdMap.get(p.id) || p.id, name: p.name, seat: p.seat, stack: p.stack, is_coach: p.is_coach }));
    await HandLogger.startHand({
      handId,
      sessionId: gm.sessionId,
      tableId,
      players: allSeatedPlayers,
      allPlayers: allSeatedPlayers,
      dealerSeat: gm.state.dealer_seat,
      smallBlind: gm.state.small_blind,
      bigBlind: gm.state.big_blind,
      isScenario: true,
      sessionType: 'drill',
    }).catch(err => log.error('db', 'start_hand_configured_failed', '[HandLogger] startHand (configured)', { err, tableId: socket.data.tableId }));
    activeHands.set(tableId, { handId, sessionId: gm.sessionId, isManualScenario: true });
    socket.emit('hand_started', { handId }); // notify coach of active handId for tagging

    broadcastState(tableId, {
      type: 'game_start',
      message: 'Configured hand started'
    });
    startActionTimer(tableId);
  });

  // ── load_hand_scenario ─────────────────────────────────────────────────────
  socket.on('load_hand_scenario', async ({ handId, stackMode = 'keep' } = {}) => {
    if (!socket.data.isCoach) return sendError(socket, 'Only the coach can load scenarios');
    const tableId = socket.data.tableId;
    const gm = tables.get(tableId);
    if (!gm) return sendError(socket, 'Not in a room');
    if (gm.state.phase !== 'waiting') return sendError(socket, 'Can only load a scenario between hands');
    if (!['keep', 'historical'].includes(stackMode)) return sendError(socket, 'stackMode must be keep or historical');

    const handDetail = await HandLogger.getHandDetail(handId);
    if (!handDetail) return sendError(socket, `Hand ${handId} not found`);

    const result = _loadScenarioIntoConfig(tableId, gm, handDetail, stackMode);
    if (result.error) return sendError(socket, result.error);

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
  socket.on('update_hand_tags', async ({ handId, tags } = {}) => {
    if (!socket.data.isCoach) return sendError(socket, 'Only the coach can tag hands');
    if (!handId || !Array.isArray(tags)) return sendError(socket, 'handId and tags[] are required');
    try {
      await HandLogger.updateCoachTags(handId, tags);
      socket.emit('hand_tags_saved', { handId, coach_tags: tags });

      // Auto-create a playlist for each tag that doesn't have one yet,
      // then add this hand to every matching playlist.
      if (tags.length > 0) {
        const tableId = socket.data.tableId;
        const existingPlaylists = await HandLogger.getPlaylists({ tableId });
        const nameToPlaylist = new Map(
          existingPlaylists.map(p => [p.name.toLowerCase(), p])
        );
        let playlistsChanged = false;
        for (const tag of tags) {
          const key = tag.toLowerCase();
          let pl = nameToPlaylist.get(key);
          if (!pl) {
            pl = await HandLogger.createPlaylist({ name: tag, tableId });
            nameToPlaylist.set(key, pl);
            playlistsChanged = true;
          }
          // upsert keeps this idempotent
          await HandLogger.addHandToPlaylist(pl.playlist_id, handId);
          playlistsChanged = true;
        }
        if (playlistsChanged) {
          socket.emit('playlist_state', { playlists: await HandLogger.getPlaylists({ tableId }) });
        }
      }
    } catch (err) {
      sendError(socket, `Failed to save tags: ${err.message}`);
    }
  });

  // ── create_playlist ────────────────────────────────────────────────────────
  socket.on('create_playlist', async ({ name, description = '' } = {}) => {
    if (!socket.data.isCoach) return sendError(socket, 'Only the coach can create playlists');
    if (!name || typeof name !== 'string' || !name.trim()) {
      return sendError(socket, 'Playlist name is required');
    }
    const tableId = socket.data.tableId;
    const playlist = await HandLogger.createPlaylist({ name: name.trim(), description, tableId });
    socket.emit('playlist_state', { playlists: await HandLogger.getPlaylists({ tableId }) });
    socket.emit('notification', { type: 'playlist_created', message: `Playlist "${playlist.name}" created` });
  });

  // ── get_playlists ──────────────────────────────────────────────────────────
  socket.on('get_playlists', async () => {
    const tableId = socket.data.tableId;
    const playlists = await HandLogger.getPlaylists({ tableId: tableId || null });
    socket.emit('playlist_state', { playlists });
  });

  // ── add_to_playlist ────────────────────────────────────────────────────────
  socket.on('add_to_playlist', async ({ playlistId, handId } = {}) => {
    if (!socket.data.isCoach) return sendError(socket, 'Only the coach can modify playlists');
    if (!playlistId || !handId) return sendError(socket, 'playlistId and handId are required');
    try {
      await HandLogger.addHandToPlaylist(playlistId, handId);
      const tableId = socket.data.tableId;
      socket.emit('playlist_state', { playlists: await HandLogger.getPlaylists({ tableId }) });
    } catch (err) {
      sendError(socket, `Could not add hand to playlist: ${err.message}`);
    }
  });

  // ── remove_from_playlist ───────────────────────────────────────────────────
  socket.on('remove_from_playlist', async ({ playlistId, handId } = {}) => {
    if (!socket.data.isCoach) return sendError(socket, 'Only the coach can modify playlists');
    if (!playlistId || !handId) return sendError(socket, 'playlistId and handId are required');
    await HandLogger.removeHandFromPlaylist(playlistId, handId);
    const tableId = socket.data.tableId;
    socket.emit('playlist_state', { playlists: await HandLogger.getPlaylists({ tableId }) });
  });

  // ── delete_playlist ────────────────────────────────────────────────────────
  socket.on('delete_playlist', async ({ playlistId } = {}) => {
    if (!socket.data.isCoach) return sendError(socket, 'Only the coach can delete playlists');
    if (!playlistId) return sendError(socket, 'playlistId is required');
    const tableId = socket.data.tableId;
    const gm = tables.get(tableId);
    // If this playlist was active, deactivate first
    if (gm && gm.state.playlist_mode?.playlistId === playlistId) {
      gm.deactivatePlaylistMode();
    }
    await HandLogger.deletePlaylist(playlistId);
    socket.emit('playlist_state', { playlists: await HandLogger.getPlaylists({ tableId }) });
    socket.emit('notification', { type: 'playlist_deleted', message: 'Playlist deleted' });
  });

  // ── activate_playlist ──────────────────────────────────────────────────────
  socket.on('activate_playlist', async ({ playlistId } = {}) => {
    if (!socket.data.isCoach) return sendError(socket, 'Only the coach can activate playlists');
    const tableId = socket.data.tableId;
    const gm = tables.get(tableId);
    if (!gm) return sendError(socket, 'Not in a room');
    // ISS-57: config_phase=true still has phase='waiting', so this guard already
    // allows playlist activation during the config phase — no extra check needed.
    if (gm.state.phase !== 'waiting') return sendError(socket, 'Can only activate playlist between hands');

    const hands = await HandLogger.getPlaylistHands(playlistId);
    if (!hands.length) return sendError(socket, 'Playlist is empty');

    const result = gm.activatePlaylistMode({ playlistId, hands });
    if (result.error) return sendError(socket, result.error);

    // Find the first hand whose player count matches the live table.
    // Hard-stop: if no match found anywhere, deactivate and notify.
    gm.state.playlist_mode.currentIndex = -1;
    const activeCount = _activeNonCoachCount(gm);
    const matchIdx = await _findMatchingPlaylistIndex(gm, activeCount);

    if (matchIdx === -1) {
      gm.deactivatePlaylistMode();
      return sendError(socket, `Playlist has no ${activeCount}-player hands — add matching hands or adjust table size`);
    }

    gm.seekPlaylist(matchIdx);
    const firstDetail = await HandLogger.getHandDetail(hands[matchIdx].hand_id);
    if (firstDetail) {
      const loadResult = _loadScenarioIntoConfig(tableId, gm, firstDetail, 'keep');
      if (loadResult.error) {
        io.to(tableId).emit('notification', { type: 'warning', message: `Playlist load failed: ${loadResult.error}` });
      }
    }

    broadcastState(tableId, {
      type: 'playlist_activated',
      message: `Playlist activated — ${result.totalHands} hands queued (hand 1 of ${result.totalHands})`
    });
    io.to(tableId).emit('playlist_state', { playlists: await HandLogger.getPlaylists({ tableId: tableId }) });
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

  // ── load_replay ────────────────────────────────────────────────────────────
  socket.on('load_replay', async ({ handId } = {}) => {
    if (!socket.data.isCoach) return sendError(socket, 'Only the coach can load replays');
    const tableId = socket.data.tableId;
    const gm = tables.get(tableId);
    if (!gm) return sendError(socket, 'Not in a room');
    if (gm.state.phase !== 'waiting') return sendSyncError(socket, 'Can only load replay between hands');
    const handDetail = await HandLogger.getHandDetail(handId);
    if (!handDetail) return sendSyncError(socket, `Hand ${handId} not found`);
    const result = gm.loadReplay(handDetail);
    if (result.error) return sendSyncError(socket, result.error);
    const actionCount = (handDetail.actions || []).filter(a => !a.is_reverted).length;
    broadcastState(tableId);
    socket.emit('replay_loaded', { handId, actionCount });
  });

  // ── replay_step_forward ────────────────────────────────────────────────────
  socket.on('replay_step_forward', () => {
    if (!socket.data.isCoach) return sendError(socket, 'Only the coach can control replay');
    const tableId = socket.data.tableId;
    const gm = tables.get(tableId);
    if (!gm) return sendError(socket, 'Not in a room');
    const result = gm.replayStepForward();
    if (result.error) return sendSyncError(socket, result.error);
    broadcastState(tableId);
  });

  // ── replay_step_back ───────────────────────────────────────────────────────
  socket.on('replay_step_back', () => {
    if (!socket.data.isCoach) return sendError(socket, 'Only the coach can control replay');
    const tableId = socket.data.tableId;
    const gm = tables.get(tableId);
    if (!gm) return sendError(socket, 'Not in a room');
    const result = gm.replayStepBack();
    if (result.error) return sendSyncError(socket, result.error);
    broadcastState(tableId);
  });

  // ── replay_jump_to ─────────────────────────────────────────────────────────
  socket.on('replay_jump_to', ({ cursor } = {}) => {
    if (!socket.data.isCoach) return sendError(socket, 'Only the coach can control replay');
    const tableId = socket.data.tableId;
    const gm = tables.get(tableId);
    if (!gm) return sendError(socket, 'Not in a room');
    if (cursor === undefined || cursor === null) return sendSyncError(socket, 'cursor is required');
    const result = gm.replayJumpTo(parseInt(cursor));
    if (result.error) return sendSyncError(socket, result.error);
    broadcastState(tableId);
  });

  // ── replay_branch ──────────────────────────────────────────────────────────
  socket.on('replay_branch', () => {
    if (!socket.data.isCoach) return sendError(socket, 'Only the coach can branch replay');
    const tableId = socket.data.tableId;
    const gm = tables.get(tableId);
    if (!gm) return sendError(socket, 'Not in a room');
    const result = gm.branchFromReplay();
    if (result.error) return sendSyncError(socket, result.error);
    broadcastState(tableId, { type: 'replay_branched', message: 'Branched to live play from replay state' });
  });

  // ── replay_unbranch ────────────────────────────────────────────────────────
  socket.on('replay_unbranch', () => {
    if (!socket.data.isCoach) return sendError(socket, 'Only the coach can unbranch replay');
    const tableId = socket.data.tableId;
    const gm = tables.get(tableId);
    if (!gm) return sendError(socket, 'Not in a room');
    const result = gm.unBranchToReplay();
    if (result.error) return sendSyncError(socket, result.error);
    broadcastState(tableId, { type: 'replay_unbranced', message: 'Returned to replay mode' });
  });

  // ── replay_exit ────────────────────────────────────────────────────────────
  socket.on('replay_exit', async () => {
    if (!socket.data.isCoach) return sendError(socket, 'Only the coach can exit replay');
    const tableId = socket.data.tableId;
    const gm = tables.get(tableId);
    if (!gm) return sendError(socket, 'Not in a room');
    const result = gm.exitReplay();
    if (result.error) return sendSyncError(socket, result.error);
    // If a playlist was active when the replay was loaded, resume it now
    if (result.playlistWasActive && gm.state.playlist_mode?.active) {
      await _advancePlaylist(tableId, gm);
    } else {
      broadcastState(tableId, { type: 'replay_exited', message: 'Replay mode ended' });
    }
  });

  // ── client_error — receives uncaught errors from the React client ─────────
  socket.on('client_error', (payload) => {
    log.logClientError(socket, payload);
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
          message: `${name} (Coach) disconnected — game paused. Reconnect window: 60s`
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
          message: `${name} (Coach) disconnected — reconnect window: 60s`
        });
      }
    } else {
      // Regular player disconnect: pause timer if it was their turn, mark as disconnected
      if (gm.state.current_turn === socket.id) {
        clearActionTimer(tableId, { saving: true });
      }
      gm.setPlayerDisconnected(socket.id, true);
      io.to(tableId).emit('notification', {
        type: 'disconnect',
        message: `${name} disconnected — reconnect window: 60s`
      });
    }

    broadcastState(tableId); // keep state visible without that player's private data
    log.info('game', 'player_disconnect', `${name} disconnected`, { tableId, name, isCoach, playerId: socket.data.stableId });
    log.trackSocket('disconnect', tableId, socket.data.stableId, { name, isCoach });
    console.log(`[disconnect] ${name} (coach=${isCoach}) — starting 60s TTL`);

    // Delay removal — give player 60s to reconnect
    const timer = setTimeout(() => {
      reconnectTimers.delete(socket.id);
      const currentGm = tables.get(tableId);
      if (!currentGm) return;
      // Save stack before removing so it can be restored if the player rejoins later
      const ghostPlayer = currentGm.state.players.find(p => p.id === socket.id);
      if (ghostPlayer && socket.data.stableId) {
        ghostStacks.set(socket.data.stableId, ghostPlayer.stack);
      }
      currentGm.removePlayer(socket.id);
      // If the coach never came back, clear the paused state so play can eventually resume
      // when a new coach joins (they will have to manually unpause)
      broadcastState(tableId, { type: 'leave', message: `${name} left the table (timeout)` });
      console.log(`[TTL expired] ${name} removed from ${tableId}`);
      // Prune table entry if no sockets remain in the room (EC-03: prevent unbounded growth)
      const socketsInRoom = io.sockets.adapter.rooms.get(tableId);
      if (!socketsInRoom || socketsInRoom.size === 0) {
        tables.delete(tableId);
        console.log(`[prune] table ${tableId} removed — no sockets remain`);
      }
    }, 60_000);

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

// GET /api/players/:stableId/hover-stats?sessionId=...  (no auth — spectators can see)
app.get('/api/players/:stableId/hover-stats', async (req, res) => {
  try {
    const { stableId } = req.params;
    const { sessionId } = req.query;
    const stats = await HandLogger.getPlayerHoverStats(stableId, sessionId || null);
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/hands?limit=20&offset=0&tableId=main-table
app.get('/api/hands', requireAuth, async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit)  || 20, 100);
    const offset = parseInt(req.query.offset) || 0;
    const tableId = req.query.tableId || null;
    const hands = await HandLogger.getHands({ tableId, limit, offset });
    res.json({ hands, limit, offset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/hands/:handId
app.get('/api/hands/:handId', requireAuth, async (req, res) => {
  try {
    const detail = await HandLogger.getHandDetail(req.params.handId);
    if (!detail) return res.status(404).json({ error: 'Hand not found' });
    res.json(detail);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/players/:stableId/stats  — career stats across all sessions
app.get('/api/players/:stableId/stats', requireAuth, async (req, res) => {
  try {
    const stats = await HandLogger.getPlayerStats(req.params.stableId);
    if (!stats) return res.status(404).json({ error: 'Player not found' });
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/players — all registered players with aggregate stats
app.get('/api/players', requireAuth, async (req, res) => {
  try {
    const players = await HandLogger.getAllPlayersWithStats();
    res.json({ players });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/players/:stableId/hands — paginated hand history for a specific player
app.get('/api/players/:stableId/hands', requireAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = parseInt(req.query.offset) || 0;
    const hands = await HandLogger.getPlayerHands(req.params.stableId, { limit, offset });
    res.json({ hands, limit, offset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sessions/:sessionId/stats
app.get('/api/sessions/:sessionId/stats', requireAuth, async (req, res) => {
  try {
    const stats = await HandLogger.getSessionStats(req.params.sessionId);
    res.json({ sessionId: req.params.sessionId, players: stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sessions/:sessionId/report — self-contained HTML report
app.get('/api/sessions/:sessionId/report', requireAuth, async (req, res) => {
  try {
    const reportData = await HandLogger.getSessionReport(req.params.sessionId);
    if (!reportData) return res.status(404).send('Session not found');
    const html = generateHTMLReport(reportData);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; script-src 'none'");
    res.send(html);
  } catch (err) {
    res.status(500).send(`<pre>Report error: ${err.message}</pre>`);
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
app.get('/api/playlists', async (req, res) => {
  try {
    const playlists = await HandLogger.getPlaylists({ tableId: req.query.tableId || null });
    res.json({ playlists });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/playlists — body: { name, description?, tableId? }
app.post('/api/playlists', async (req, res) => {
  try {
    const { name, description = '', tableId = null } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name is required' });
    const playlist = await HandLogger.createPlaylist({ name, description, tableId });
    res.status(201).json(playlist);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/playlists/:playlistId/hands
app.get('/api/playlists/:playlistId/hands', async (req, res) => {
  try {
    const hands = await HandLogger.getPlaylistHands(req.params.playlistId);
    res.json({ hands });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/playlists/:playlistId/hands — body: { handId }
app.post('/api/playlists/:playlistId/hands', async (req, res) => {
  try {
    const { handId } = req.body || {};
    if (!handId) return res.status(400).json({ error: 'handId is required' });
    const entry = await HandLogger.addHandToPlaylist(req.params.playlistId, handId);
    res.status(201).json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/playlists/:playlistId/hands/:handId
app.delete('/api/playlists/:playlistId/hands/:handId', async (req, res) => {
  try {
    await HandLogger.removeHandFromPlaylist(req.params.playlistId, req.params.handId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/playlists/:playlistId
app.delete('/api/playlists/:playlistId', async (req, res) => {
  try {
    await HandLogger.deletePlaylist(req.params.playlistId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
//  Auth endpoints (roster-based)
// ─────────────────────────────────────────────

// POST /api/auth/register — self-registration is disabled; admin manages players.csv
app.post('/api/auth/register', (req, res) => {
  res.status(410).json({
    error: 'registration_disabled',
    message: 'Self-registration is disabled. Contact the coach to be added to the roster.',
  });
});

// POST /api/auth/login — validates against players.csv, returns a server-signed JWT
app.post('/api/auth/login', authLimiter, async (req, res) => {
  const { name, password } = req.body || {};
  if (!name || typeof name !== 'string' || name.trim().length === 0)
    return res.status(400).json({ error: 'invalid_input', message: 'Name is required.' });
  if (!password || typeof password !== 'string')
    return res.status(400).json({ error: 'invalid_input', message: 'Password is required.' });

  const entry = await PlayerRoster.authenticate(name.trim(), password);
  if (!entry) {
    log.warn('auth', 'login_fail', `Failed login attempt for "${name.trim()}"`, { name: name.trim(), ip: req.ip });
    return res.status(401).json({ error: 'invalid_credentials', message: 'Invalid name or password.' });
  }

  // Get (or create) stableId for this player in the DB
  let stableId;
  try {
    const record = await HandLogger.loginRosterPlayer(entry.name);
    stableId = record.stableId;
  } catch (err) {
    return res.status(500).json({ error: 'db_error', message: 'Could not resolve player identity.' });
  }

  const token = jwt.sign(
    { stableId, name: entry.name, role: entry.role },
    SESSION_SECRET,
    { expiresIn: '7d' }
  );

  log.info('auth', 'login_ok', `${entry.name} logged in`, { name: entry.name, role: entry.role, playerId: stableId });
  res.json({ stableId, name: entry.name, role: entry.role, token });
});

// ─────────────────────────────────────────────
//  Health check — verifies server + DB connectivity
// ─────────────────────────────────────────────
app.get('/health', async (_, res) => {
  let dbStatus = 'ok';
  let dbError  = null;
  try {
    // Lightweight probe: select 1 row from a known table
    const { error } = await supabaseAdmin.from('player_profiles').select('player_id').limit(1);
    if (error) { dbStatus = 'error'; dbError = error.message; }
  } catch (err) {
    dbStatus = 'error';
    dbError  = err.message;
  }
  const status = dbStatus === 'ok' ? 'ok' : 'degraded';
  res.status(status === 'ok' ? 200 : 503).json({
    status,
    tables: tables.size,
    db: dbStatus,
    ...(dbError ? { dbError } : {}),
  });
});

// ─────────────────────────────────────────────
//  Alpha-testing report
//  GET /api/alpha-report?hours=72
//  No auth — view in any browser tab. Keep internal during alpha.
// ─────────────────────────────────────────────
app.get('/api/alpha-report', async (req, res) => {
  try {
    const hours = Math.min(Math.max(parseInt(req.query.hours, 10) || 72, 1), 720);
    const html = await generateAlphaReport(hours);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(html);
  } catch (err) {
    log.error('system', 'alpha_report_failed', 'Alpha report generation failed', { err: err.message });
    res.status(500).json({ error: 'report_failed', message: err.message });
  }
});

// ─────────────────────────────────────────────
//  Global Express error middleware
//  Catches any synchronous throws in route handlers.
// ─────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  log.error('http', 'unhandled_error', `Unhandled Express error: ${err.message}`, {
    err: err.message, stack: err.stack?.slice(0, 500), path: req.path, method: req.method
  });
  res.status(500).json({ error: 'internal_error', message: 'An unexpected error occurred' });
});

// ─────────────────────────────────────────────
//  Graceful shutdown
// ─────────────────────────────────────────────
function markAllHandsIncomplete() {
  for (const [tableId, handInfo] of activeHands.entries()) {
    const gm = tables.get(tableId);
    HandLogger.markIncomplete(handInfo.handId, gm?.state ?? null).catch(() => {});
  }
}

process.on('SIGINT',  () => { markAllHandsIncomplete(); process.exit(0); });
process.on('SIGTERM', () => { markAllHandsIncomplete(); process.exit(0); });

// ─────────────────────────────────────────────
//  Idle auto-shutdown
//  If IDLE_TIMEOUT_MINUTES is set (e.g. in production), the server exits
//  cleanly after that many minutes of zero connected sockets.
//  The hosting platform (Fly.io) will restart it on the next request.
// ─────────────────────────────────────────────
const IDLE_MINUTES = parseInt(process.env.IDLE_TIMEOUT_MINUTES, 10) || 0;
if (IDLE_MINUTES > 0) {
  let _idleTimer = null;

  const _scheduleIdleShutdown = () => {
    clearTimeout(_idleTimer);
    if (io.engine.clientsCount === 0) {
      _idleTimer = setTimeout(() => {
        console.log(`[idle] No connections for ${IDLE_MINUTES} min — shutting down for hosting cost savings`);
        markAllHandsIncomplete();
        process.exit(0);
      }, IDLE_MINUTES * 60 * 1000);
    }
  };

  io.on('connection', (socket) => {
    clearTimeout(_idleTimer); // someone connected — cancel shutdown
    socket.on('disconnect', _scheduleIdleShutdown);
  });

  // Also start the timer at boot in case no one ever connects
  httpServer.on('listening', _scheduleIdleShutdown);

  console.log(`[idle] Auto-shutdown enabled — will exit after ${IDLE_MINUTES} min of zero connections`);
}

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
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'API endpoint not found' });
    }
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });

  console.log(`[static] Serving React build from ${CLIENT_DIST}`);
}

const PORT = process.env.PORT || 3001;
if (require.main === module) {
  httpServer.listen(PORT, () => {
    console.log(`Poker Training Server running on http://localhost:${PORT}`);
  });
}

module.exports = { app, httpServer, io, tables };
