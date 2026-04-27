'use strict';

/**
 * BotConnection — spawn a single bot socket.io-client that joins a table and
 * acts on its own turn via BotDecisionService. Currently used only by the
 * `coach:add_bot` socket event for ad-hoc bots on coached_cash /
 * uncoached_cash tables. (`BotTableController` predates this module and still
 * carries its own connection logic; consolidating is a future refactor.)
 *
 * Decoupled from any controller so a coach-spawned bot survives without a
 * BotTableController on the table.
 */

const JwtService = require('../auth/JwtService');
const { decide } = require('./BotDecisionService');
const { v4: uuidv4 } = require('uuid');

let _ioClientCache = null;
function _ioClient() { return _ioClientCache ??= require('socket.io-client'); }

const MIN_THINK_MS = 300;
const MAX_THINK_MS = 800;
const VALID_DIFFICULTIES = new Set(['easy', 'medium', 'hard']);

// Per-table tracking so coach:kick_player can target an ad-hoc bot by stableId
// and onPlayerLeave / table teardown can disconnect them cleanly.
// Map<tableId, Map<stableId, BotEntry>>
const _adHocBots = new Map();

// Monotonic per-table bot counter. Survives kick/disconnect so spawned names
// never collide (e.g., kick "Bot 1", next spawn is "Bot 3", not "Bot 2").
const _botSeq = new Map();

function _nextOrdinal(tableId) {
  const next = (_botSeq.get(tableId) ?? 0) + 1;
  _botSeq.set(tableId, next);
  return next;
}

function _trackBot(tableId, entry) {
  let perTable = _adHocBots.get(tableId);
  if (!perTable) { perTable = new Map(); _adHocBots.set(tableId, perTable); }
  perTable.set(entry.stableId, entry);
}

function _untrackBot(tableId, stableId) {
  const perTable = _adHocBots.get(tableId);
  if (!perTable) return;
  perTable.delete(stableId);
  if (perTable.size === 0) {
    _adHocBots.delete(tableId);
    _botSeq.delete(tableId);
  }
}

/**
 * Spawn a bot socket.io-client that joins the given table and plays autonomously.
 *
 * @param {object} opts
 * @param {string} opts.tableId
 * @param {string} [opts.difficulty='easy']  - 'easy' | 'medium' | 'hard'
 * @param {string} [opts.serverUrl]          - defaults to local server URL
 * @param {(err: Error) => void} [opts.onConnectError] - callback when the socket fails to connect
 * @returns {{ stableId: string, name: string, disconnect: () => void } | { error: string }}
 */
function spawnBot({ tableId, difficulty = 'easy', serverUrl, onConnectError } = {}) {
  if (!tableId) return { error: 'tableId is required' };
  if (!VALID_DIFFICULTIES.has(difficulty)) {
    return { error: `difficulty must be one of: ${Array.from(VALID_DIFFICULTIES).join(', ')}` };
  }

  const url = serverUrl
    ?? (process.env.FLY_APP_NAME
      ? `https://${process.env.FLY_APP_NAME}.fly.dev`
      : `http://localhost:${process.env.PORT ?? 3001}`);

  const stableId = uuidv4();
  const diffLabel = difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
  const ordinal = _nextOrdinal(tableId);
  const name = `Bot ${ordinal} (${diffLabel})`;

  const token = JwtService.sign({ stableId, name, role: 'bot' });
  const socket = _ioClient()(url, {
    auth: { token },
    reconnection: false,
    forceNew: true,
  });

  const entry = {
    stableId,
    name,
    difficulty,
    socket,
    thinkTimer: null,
    joined: false,
    disconnect: () => {
      if (entry.thinkTimer) { clearTimeout(entry.thinkTimer); entry.thinkTimer = null; }
      try { socket.disconnect(); } catch { /* ignore */ }
      _untrackBot(tableId, stableId);
    },
  };
  _trackBot(tableId, entry);

  socket.on('connect', () => {
    socket.emit('join_room', { name, tableId });
  });

  socket.on('room_joined', () => {
    entry.joined = true;
  });

  socket.on('game_state', (state) => {
    const BETTING_PHASES = new Set(['preflop', 'flop', 'turn', 'river']);
    if (!BETTING_PHASES.has(state.phase)) return;
    if (state.current_turn !== socket.id) return;

    if (entry.thinkTimer) clearTimeout(entry.thinkTimer);
    const delay = MIN_THINK_MS + Math.floor(Math.random() * (MAX_THINK_MS - MIN_THINK_MS + 1));

    entry.thinkTimer = setTimeout(() => {
      entry.thinkTimer = null;
      // Re-check turn ownership after the think delay
      if (state.current_turn !== socket.id) return;
      try {
        const decision = decide(state, socket.id, difficulty);
        socket.emit('place_bet', decision);
      } catch (err) {
        console.error(`[BotConnection] ${name} decision failed:`, err.message);
      }
    }, delay);
  });

  // Untrack on either the server-side disconnect OR a failed initial connection.
  // Without these the _adHocBots Map would hold zombie entries forever.
  socket.on('disconnect', () => {
    if (entry.thinkTimer) { clearTimeout(entry.thinkTimer); entry.thinkTimer = null; }
    _untrackBot(tableId, stableId);
  });

  socket.on('connect_error', (err) => {
    console.error(`[BotConnection] ${name} connect error: ${err.message}`);
    entry.disconnect();
    if (typeof onConnectError === 'function') {
      try { onConnectError(err); } catch { /* swallow caller errors */ }
    }
  });

  return entry;
}

/**
 * Disconnect every ad-hoc bot at the given table. Used when the table closes.
 * Snapshot the values before iterating because each entry.disconnect() calls
 * _untrackBot, which mutates the Map.
 */
function disconnectAllAtTable(tableId) {
  const perTable = _adHocBots.get(tableId);
  if (!perTable) return;
  const snapshot = Array.from(perTable.values());
  for (const entry of snapshot) entry.disconnect();
}

/**
 * @returns {Array<{ stableId: string, name: string, difficulty: string }>}
 */
function listBotsAtTable(tableId) {
  const perTable = _adHocBots.get(tableId);
  if (!perTable) return [];
  return Array.from(perTable.values()).map((b) => ({
    stableId: b.stableId, name: b.name, difficulty: b.difficulty,
  }));
}

module.exports = { spawnBot, disconnectAllAtTable, listBotsAtTable };
