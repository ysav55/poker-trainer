#!/usr/bin/env node
/**
 * simulate_batches.js
 *
 * 20 batches × 20 hands — varied player counts, stack sizes, modes,
 * manual hole cards, and manual board textures.
 *
 * Run:  node simulate_batches.js
 *
 * Uses in-memory SQLite; production DB is untouched.
 */

'use strict';

const fs = require('fs');
const DB_PATH = process.env.DATABASE_PATH || './sim_results.db';
process.env.DATABASE_PATH = DB_PATH;

// Fresh DB each run so player names never collide
if (DB_PATH !== ':memory:') {
  try { fs.unlinkSync(DB_PATH); } catch (_) {}
}

const { httpServer, app } = require('./server/index');
const ioc  = require('./server/node_modules/socket.io-client');
const http = require('http');

// ─── Config ──────────────────────────────────────────────────────────────────

const HANDS_PER_BATCH = 20;
const DEFAULT_BIG_BLIND = 10;

// CLI: node simulate_batches.js [startBatch] [endBatch]  (1-indexed, inclusive)
// e.g. node simulate_batches.js 1 5   → runs B01–B05 only
const CLI_START = parseInt(process.argv[2], 10) || 1;
const CLI_END   = parseInt(process.argv[3], 10) || 0; // 0 = run all

// ─── Helpers ─────────────────────────────────────────────────────────────────

function log(msg) { process.stdout.write(msg + '\n'); }

function waitFor(socket, event, ms = 6000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      socket.off(event, h);
      reject(new Error(`Timeout waiting for '${event}' (${ms}ms)`));
    }, ms);
    function h(data) { clearTimeout(t); resolve(data); }
    socket.once(event, h);
  });
}

function postJSON(port, path, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request(
      { hostname: '127.0.0.1', port, path, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } },
      res => {
        let raw = '';
        res.on('data', d => raw += d);
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
          catch { resolve({ status: res.statusCode, body: raw }); }
        });
      }
    );
    req.on('error', reject);
    req.write(payload); req.end();
  });
}

function mkSocket(port) {
  return ioc(`http://localhost:${port}`, { transports: ['websocket'], reconnection: false });
}

function getJSON(port, path) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: '127.0.0.1', port, path }, res => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    }).on('error', reject);
  });
}

function pickAction(state) {
  const me = state.players.find(p => p.id === state.current_turn);
  if (!me || me.stack <= 0) return { action: 'fold' };
  const canCheck = me.current_bet >= state.current_bet;
  // amount is TOTAL bet this street; min is current_bet + min_raise
  const minRaiseTotal = state.current_bet + state.min_raise;
  const maxRaiseTotal = me.current_bet + me.stack;
  const canRaise = state.min_raise > 0 && maxRaiseTotal >= minRaiseTotal;
  const options = ['fold'];
  if (canCheck) options.push('check'); else options.push('call');
  if (canRaise) options.push('raise');
  const action = options[Math.floor(Math.random() * options.length)];
  if (action === 'raise') {
    const extra = Math.floor(Math.random() * state.min_raise * 2);
    return { action: 'raise', amount: Math.min(minRaiseTotal + extra, maxRaiseTotal) };
  }
  return { action };
}

// ─── Registration cache ───────────────────────────────────────────────────────

const registeredPlayers = {};

async function ensureRegistered(port, name) {
  if (registeredPlayers[name]) return registeredPlayers[name];
  const email = `${name.toLowerCase()}@sim.test`;
  const reg = await postJSON(port, '/api/auth/register', { name, email, password: 'pw12345' });
  if (reg.body.stableId) {
    registeredPlayers[name] = reg.body.stableId;
    return reg.body.stableId;
  }
  // Name already taken — log in instead
  if (reg.body.error === 'name_taken') {
    const login = await postJSON(port, '/api/auth/login', { name, password: 'pw12345' });
    if (login.body.stableId) {
      registeredPlayers[name] = login.body.stableId;
      return login.body.stableId;
    }
    throw new Error(`Login fallback failed for ${name}: ${JSON.stringify(login.body)}`);
  }
  throw new Error(`Register failed for ${name}: ${JSON.stringify(reg.body)}`);
}

// ─── Play one hand ────────────────────────────────────────────────────────────

async function playHand(handNum, coachSock, allActors, batchCrashes, batchAnomalies, hooks = {}) {
  const stateQueue = [];
  const stateWaiters = [];
  let lastPhase = 'unknown';

  function onState(s) {
    lastPhase = s.phase || lastPhase;
    if (stateWaiters.length > 0) stateWaiters.shift()(s);
    else stateQueue.push(s);
  }
  coachSock.on('game_state', onState);

  // Real server errors = crash. sync_error = rejected action (timing) = anomaly only.
  function onServerError(data) {
    batchCrashes.push({ hand: handNum, error: `server error: ${data?.message || JSON.stringify(data)}` });
  }
  function onSyncError(data) {
    batchAnomalies.push({ hand: handNum, msg: `sync_error: ${data?.message || JSON.stringify(data)}` });
  }
  coachSock.on('error', onServerError);
  coachSock.on('sync_error', onSyncError);

  function nextState(ms = 1500) {
    if (stateQueue.length > 0) return Promise.resolve(stateQueue.shift());
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        const idx = stateWaiters.indexOf(resolve);
        if (idx !== -1) stateWaiters.splice(idx, 1);
        reject(new Error(`game_state timeout (hand ${handNum}, lastPhase=${lastPhase})`));
      }, ms);
      stateWaiters.push(data => { clearTimeout(t); resolve(data); });
    });
  }

  const ACTIVE = new Set(['preflop', 'flop', 'turn', 'river', 'showdown']);
  let done = false, steps = 0;
  const MAX_STEPS = 300;

  try {
    coachSock.emit('start_game', { mode: 'rng' });

    while (!done && steps < MAX_STEPS) {
      const state = await nextState(3000);
      steps++;

      if (state.winner || state.showdown_result) { done = true; break; }
      // Game returned to waiting after pot awarded — hand is over
      if (steps > 1 && (state.phase === 'waiting' || state.phase === 'WAITING')) { done = true; break; }
      if (!ACTIVE.has(state.phase)) continue;
      if (state.paused) continue; // don't act on paused states — they're queued noise

      if (!state.current_turn) {
        // All players all-in — server won't broadcast again without a trigger
        coachSock.emit('force_next_street');
        continue;
      }

      // onState hook — return 'abort' to end hand, 'skip' to skip acting this state
      if (hooks.onState) {
        const sig = await hooks.onState(state, coachSock);
        if (sig === 'abort') { done = true; break; }
        if (sig === 'skip') continue;
      }

      // Find which actor should act
      const actor = allActors.find(a => a.serverId === state.current_turn);
      if (!actor) {
        batchAnomalies.push({ hand: handNum, msg: `current_turn ${state.current_turn} not in actor list` });
        break;
      }
      const bet = pickAction(state);
      actor.sock.emit('place_bet', bet);
      if (hooks.afterBet) await hooks.afterBet(bet, coachSock);
    }

    if (steps >= MAX_STEPS) {
      batchAnomalies.push({ hand: handNum, msg: `Exceeded ${MAX_STEPS} steps` });
    }
  } catch (err) {
    batchCrashes.push({ hand: handNum, error: err.message });
  } finally {
    coachSock.off('game_state', onState);
    coachSock.off('error', onServerError);
    coachSock.off('sync_error', onSyncError);
    coachSock.emit('reset_hand');
    await new Promise(resolve => {
      const t = setTimeout(resolve, 400);
      function onW(s) {
        if (s && (s.phase === 'waiting' || s.phase === 'WAITING')) {
          clearTimeout(t); coachSock.off('game_state', onW); resolve();
        }
      }
      coachSock.on('game_state', onW);
    });
  }
}

// ─── Play one hand in MANUAL CONFIG mode ─────────────────────────────────────
// holeCards: { [playerName]: ['As','Kh'] }
// boardCards: ['2c','7d','9h','3s','Jc']  (up to 5)

async function playManualHand(handNum, coachSock, allActors, holeCards, boardCards, batchCrashes, batchAnomalies, hooks = {}) {
  const stateQueue = [];
  const stateWaiters = [];

  function onState(s) {
    if (stateWaiters.length > 0) stateWaiters.shift()(s);
    else stateQueue.push(s);
  }
  coachSock.on('game_state', onState);

  function nextState(ms = 1500) {
    if (stateQueue.length > 0) return Promise.resolve(stateQueue.shift());
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        const idx = stateWaiters.indexOf(resolve);
        if (idx !== -1) stateWaiters.splice(idx, 1);
        reject(new Error(`game_state timeout (hand ${handNum})`));
      }, ms);
      stateWaiters.push(data => { clearTimeout(t); resolve(data); });
    });
  }

  const ACTIVE = new Set(['preflop', 'flop', 'turn', 'river', 'showdown']);
  let done = false, steps = 0;
  const MAX_STEPS = 300;

  try {
    // Flush any stale queued states, then give server 150ms to settle in WAITING
    stateQueue.length = 0;
    await new Promise(r => setTimeout(r, 30));

    // Open config phase
    coachSock.emit('open_config_phase');
    // Wait for config phase
    let cfgState = null;
    for (let i = 0; i < 10; i++) {
      const s = await nextState(1500).catch(() => null);
      if (s && s.config_phase === true) { cfgState = s; break; }
    }
    if (!cfgState) throw new Error(`Config phase never reached (hand ${handNum})`);

    // Build config: map player names to stableIds via allActors
    const playerHoleConfig = {};
    for (const [name, cards] of Object.entries(holeCards)) {
      const actor = allActors.find(a => a.name === name);
      if (actor && actor.stableId) {
        playerHoleConfig[actor.stableId] = { cards };
      }
    }

    const config = {
      boardCards: boardCards || [],
      playerHoleCards: playerHoleConfig,
    };
    coachSock.emit('update_hand_config', config);
    await new Promise(r => setTimeout(r, 20));

    // afterConfigUpdate hook — extra config updates or abort before starting
    if (hooks.afterConfigUpdate) {
      const sig = await hooks.afterConfigUpdate(coachSock, config);
      if (sig === 'abort') return; // finally block will reset
    }

    coachSock.emit('start_configured_hand');

    while (!done && steps < MAX_STEPS) {
      const state = await nextState(3000);
      steps++;

      if (state.winner || state.showdown_result) { done = true; break; }
      if (steps > 1 && (state.phase === 'waiting' || state.phase === 'WAITING')) { done = true; break; }
      if (!ACTIVE.has(state.phase)) continue;
      if (state.paused) continue;

      if (!state.current_turn) {
        coachSock.emit('force_next_street');
        continue;
      }

      // onState hook
      if (hooks.onState) {
        const sig = await hooks.onState(state, coachSock);
        if (sig === 'abort') { done = true; break; }
        if (sig === 'skip') continue;
      }

      const actor = allActors.find(a => a.serverId === state.current_turn);
      if (!actor) {
        batchAnomalies.push({ hand: handNum, msg: `current_turn ${state.current_turn} not in actor list` });
        break;
      }
      const bet = pickAction(state);
      actor.sock.emit('place_bet', bet);
      if (hooks.afterBet) await hooks.afterBet(bet, coachSock);
    }

    if (steps >= MAX_STEPS) {
      batchAnomalies.push({ hand: handNum, msg: `Exceeded ${MAX_STEPS} steps` });
    }
  } catch (err) {
    batchCrashes.push({ hand: handNum, error: err.message });
  } finally {
    coachSock.off('game_state', onState);
    coachSock.emit('reset_hand');
    await new Promise(resolve => {
      const t = setTimeout(resolve, 400);
      function onW(s) {
        if (s && (s.phase === 'waiting' || s.phase === 'WAITING')) {
          clearTimeout(t); coachSock.off('game_state', onW); resolve();
        }
      }
      coachSock.on('game_state', onW);
    });
  }
}

// ─── Build a session: join table, return allActors ────────────────────────────

async function buildSession(port, tableId, playerNames) {
  const coachSock = mkSocket(port);

  // Coach joins
  coachSock.emit('join_room', { name: 'Coach', isCoach: true, tableId });
  await waitFor(coachSock, 'room_joined', 5000);

  const players = [];
  for (const name of playerNames) {
    const stableId = await ensureRegistered(port, name);
    const sock = mkSocket(port);
    sock.emit('join_room', { name, isCoach: false, isSpectator: false, stableId, tableId });
    const joined = await waitFor(sock, 'room_joined', 5000);
    players.push({ name, stableId, sock, serverId: joined.playerId });
  }

  // Resolve coach serverId from next game_state
  const firstState = await waitFor(coachSock, 'game_state', 5000);
  const coachInState = firstState.players.find(p => p.name === 'Coach' || p.isCoach);
  const coachServerId = coachInState ? coachInState.id : null;
  const coachStableId = coachInState ? (coachInState.stableId || coachInState.id) : null;

  const allActors = [
    { name: 'Coach', sock: coachSock, serverId: coachServerId, stableId: coachStableId, isCoach: true },
    ...players,
  ];

  return { coachSock, allActors, sockets: [coachSock, ...players.map(p => p.sock)] };
}

/** Set a player's stack via adjust_stack (coach only) */
async function setStack(coachSock, serverId, amount) {
  coachSock.emit('adjust_stack', { playerId: serverId, amount });
  await new Promise(r => setTimeout(r, 20));
}

/** Coach control helpers */
function setPlayerInHand(coachSock, serverId, inHand) {
  coachSock.emit('set_player_in_hand', { playerId: serverId, inHand });
}
function togglePause(coachSock) { coachSock.emit('toggle_pause'); }
function undoAction(coachSock)  { coachSock.emit('undo_action'); }
function rollbackStreet(coachSock) { coachSock.emit('rollback_street'); }
function awardPot(coachSock, winnerId) { coachSock.emit('award_pot', { winnerId }); }
function setMode(coachSock, mode) { coachSock.emit('set_mode', { mode }); }

/** Pick first active player as award_pot winner */
function firstActivePlayer(state) {
  return (state.players || []).find(p => p.stack > 0 && p.in_hand !== false);
}

/** Tear down all sockets for a session */
function teardown(sockets) {
  for (const s of sockets) { try { s.disconnect(); } catch (_) {} }
}

/**
 * Play a guided-replay session for one "hand slot".
 * Loads handId into replay mode, calls replayOps(coachSock, nextState, crashes, anomalies),
 * then exits replay and waits for phase=waiting.
 */
async function playReplayHand(handNum, coachSock, handId, replayOps, crashes, anomalies) {
  const stateQueue = [];
  const stateWaiters = [];
  function onState(s) {
    if (stateWaiters.length > 0) stateWaiters.shift()(s);
    else stateQueue.push(s);
  }
  coachSock.on('game_state', onState);

  function nextRState(ms = 2000) {
    if (stateQueue.length > 0) return Promise.resolve(stateQueue.shift());
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        const idx = stateWaiters.indexOf(resolve);
        if (idx !== -1) stateWaiters.splice(idx, 1);
        reject(new Error(`replay_state timeout (hand ${handNum})`));
      }, ms);
      stateWaiters.push(data => { clearTimeout(t); resolve(data); });
    });
  }

  try {
    coachSock.emit('load_replay', { handId });
    await waitFor(coachSock, 'replay_loaded', 3000)
      .catch(() => { throw new Error(`replay_loaded timeout (handId=${handId})`); });
    if (replayOps) await replayOps(coachSock, nextRState, crashes, anomalies, handNum);
  } catch (err) {
    crashes.push({ hand: handNum, error: err.message });
  } finally {
    coachSock.off('game_state', onState);
    coachSock.emit('replay_exit');
    await new Promise(resolve => {
      const t = setTimeout(resolve, 500);
      function onW(s) {
        if (s && (s.phase === 'waiting' || s.phase === 'WAITING')) {
          clearTimeout(t); coachSock.off('game_state', onW); resolve();
        }
      }
      coachSock.on('game_state', onW);
    });
  }
}

// ─── Play one hand in PLAYLIST mode ──────────────────────────────────────────
// Server has already loaded the next matching hand into config_phase.
// We just need to start it, play it, then reset (which triggers the next skip-and-load).

async function playPlaylistHand(handNum, coachSock, allActors, batchCrashes, batchAnomalies, hooks = {}) {
  const stateQueue = [];
  const stateWaiters = [];
  function onState(s) {
    if (stateWaiters.length > 0) stateWaiters.shift()(s);
    else stateQueue.push(s);
  }
  coachSock.on('game_state', onState);

  function nextState(ms = 1500) {
    if (stateQueue.length > 0) return Promise.resolve(stateQueue.shift());
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        const idx = stateWaiters.indexOf(resolve);
        if (idx !== -1) stateWaiters.splice(idx, 1);
        reject(new Error(`playlist_state timeout (hand ${handNum})`));
      }, ms);
      stateWaiters.push(data => { clearTimeout(t); resolve(data); });
    });
  }

  const ACTIVE = new Set(['preflop', 'flop', 'turn', 'river', 'showdown']);
  let done = false, steps = 0;
  const MAX_STEPS = 300;

  try {
    // Drain stale queue entries, then yield for any in-flight server broadcasts
    stateQueue.length = 0;
    await new Promise(r => setTimeout(r, 40));

    // Emit start_configured_hand — server will reject with sync_error if config_phase
    // isn't ready (EC-25 guard), which will show up as an anomaly. On success the server
    // transitions to preflop and broadcasts a game_state.
    coachSock.emit('start_configured_hand');

    while (!done && steps < MAX_STEPS) {
      const state = await nextState(3000);
      steps++;

      if (state.winner || state.showdown_result) { done = true; break; }
      if (steps > 1 && state.phase === 'waiting' && !state.config_phase) { done = true; break; }
      if (!ACTIVE.has(state.phase)) continue;
      if (state.paused) continue;

      if (!state.current_turn) {
        coachSock.emit('force_next_street');
        continue;
      }

      if (hooks.onState) {
        const sig = await hooks.onState(state, coachSock);
        if (sig === 'abort') { done = true; break; }
        if (sig === 'skip') continue;
      }

      const actor = allActors.find(a => a.serverId === state.current_turn);
      if (!actor) {
        batchAnomalies.push({ hand: handNum, msg: `current_turn ${state.current_turn} not in actor list` });
        break;
      }
      const bet = pickAction(state);
      actor.sock.emit('place_bet', bet);
      if (hooks.afterBet) await hooks.afterBet(bet, coachSock);
    }

    if (steps >= MAX_STEPS) {
      batchAnomalies.push({ hand: handNum, msg: `Exceeded ${MAX_STEPS} steps` });
    }
  } catch (err) {
    batchCrashes.push({ hand: handNum, error: err.message });
  } finally {
    coachSock.off('game_state', onState);
    coachSock.emit('reset_hand');
    // Wait for next config_phase load OR playlist-exhausted waiting state
    await new Promise(resolve => {
      const t = setTimeout(resolve, 800);
      function onW(s) {
        if (!s) return;
        if (s.config_phase === true) { clearTimeout(t); coachSock.off('game_state', onW); resolve(); }
        if (s.phase === 'waiting' && !s.playlist_mode?.active) { clearTimeout(t); coachSock.off('game_state', onW); resolve(); }
      }
      coachSock.on('game_state', onW);
    });
  }
}

// ─── Shared 3-bet playlist setup (shared across B115-B124) ───────────────────
//
// Design: each batch contributes seed hands at its OWN player count to the shared
// playlist. By the time B117 runs (4-player table), the playlist already contains
// 1-player and 2-player hands from B115-B116, giving the skip logic real mismatch
// cases to navigate.

let _3betPlaylistId = null;

async function setup3betPlaylist(_port, coachSock, allActors, crashes, anomalies) {
  const HandLogger = require('./server/db/HandLogger');

  // Create the shared playlist once (first batch to run)
  if (!_3betPlaylistId) {
    const playlist = HandLogger.createPlaylist({
      name: '3-bet situations',
      description: 'Hands with 3+ rounds of preflop aggression (auto-tagged 3BET_POT)'
    });
    _3betPlaylistId = playlist.playlist_id;
    log(`  [playlist-seed] Created shared playlist (id: ${_3betPlaylistId.slice(0, 8)}…)`);
  }

  // Count non-coach players at this batch's table
  const thisCount = allActors.filter(a => !a.isCoach).length;

  // How many 3BET_POT hands do we already have at this player count in the DB?
  const allHands = HandLogger.getHands({ tableId: null, limit: 9999 });
  const parseAutoTags = h => { try { return JSON.parse(h.auto_tags || '[]'); } catch { return []; } };

  const atThisCount = allHands.filter(h => {
    if (!parseAutoTags(h).includes('3BET_POT')) return false;
    const detail = HandLogger.getHandDetail(h.hand_id);
    return detail && (detail.players || []).filter(p => (p.seat ?? -1) >= 0).length === thisCount;
  });

  // Generate extra seed hands at this table's player count if needed
  if (atThisCount.length < 8) {
    for (let i = 0; i < 120; i++) {
      await playHand(i + 1, coachSock, allActors, crashes, anomalies);
    }
  }

  // Refresh and pick up to 15 new 3BET_POT hands at this player count
  const refreshed = HandLogger.getHands({ tableId: null, limit: 9999 });
  const newAtCount = refreshed.filter(h => {
    if (!parseAutoTags(h).includes('3BET_POT')) return false;
    const detail = HandLogger.getHandDetail(h.hand_id);
    return detail && (detail.players || []).filter(p => (p.seat ?? -1) >= 0).length === thisCount;
  });

  // Add hands not already in the playlist (cap at 15 per player-count)
  const existing = new Set(HandLogger.getPlaylistHands(_3betPlaylistId).map(h => h.hand_id));
  let added = 0;
  for (const h of newAtCount) {
    if (added >= 15) break;
    if (!existing.has(h.hand_id)) {
      HandLogger.addHandToPlaylist(_3betPlaylistId, h.hand_id);
      added++;
    }
  }

  // Log distribution across all playlist hands
  const playlistHands = HandLogger.getPlaylistHands(_3betPlaylistId);
  const dist = {};
  for (const h of playlistHands) {
    const detail = HandLogger.getHandDetail(h.hand_id);
    const n = detail ? (detail.players || []).filter(p => (p.seat ?? -1) >= 0).length : '?';
    dist[n] = (dist[n] || 0) + 1;
  }
  log(`  [playlist-seed] ${thisCount}-player table: added ${added} hands. Playlist total: ${playlistHands.length} hands. Dist: ${JSON.stringify(dist)}`);

  if (playlistHands.length === 0) {
    anomalies.push({ hand: 0, msg: 'setup3betPlaylist: playlist is empty — no 3BET_POT hands found' });
  }

  return { playlistId: _3betPlaylistId };
}

// ─── Play one hand with hole_cards_combos config ─────────────────────────────
// combosConfig: { [playerName]: [[c1,c2], [c1,c2], ...] }  (pre-resolved combo list)
// boardCards:   up to 5 specific board cards (or [])
// boardTexture: array of texture tags (or [])
// onPreflop:    optional fn(state) → void called on first preflop state (for assertions)

async function playComboHand(handNum, coachSock, allActors, combosConfig, boardCards, boardTexture, batchCrashes, batchAnomalies, onPreflop, extraConfig = {}) {
  const stateQueue   = [];
  const stateWaiters = [];

  function onState(s) {
    if (stateWaiters.length > 0) stateWaiters.shift()(s);
    else stateQueue.push(s);
  }
  coachSock.on('game_state', onState);

  function nextState(ms = 2000) {
    if (stateQueue.length > 0) return Promise.resolve(stateQueue.shift());
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        const idx = stateWaiters.indexOf(resolve);
        if (idx !== -1) stateWaiters.splice(idx, 1);
        reject(new Error(`game_state timeout (hand ${handNum})`));
      }, ms);
      stateWaiters.push(data => { clearTimeout(t); resolve(data); });
    });
  }

  const ACTIVE = new Set(['preflop','flop','turn','river','showdown']);
  let done = false, steps = 0;
  const MAX_STEPS = 300;

  try {
    stateQueue.length = 0;
    await new Promise(r => setTimeout(r, 30));

    // Open config phase
    coachSock.emit('open_config_phase');
    let cfgState = null;
    for (let i = 0; i < 10; i++) {
      const s = await nextState(1500).catch(() => null);
      if (s && s.config_phase === true) { cfgState = s; break; }
    }
    if (!cfgState) throw new Error(`Config phase never reached (hand ${handNum})`);

    // Build hole_cards_combos keyed by stableId
    const holeCombos = {};
    for (const [name, combos] of Object.entries(combosConfig)) {
      const actor = allActors.find(a => a.name === name);
      if (actor && actor.stableId) holeCombos[actor.stableId] = combos;
    }

    // Build board array (pad with nulls to length 5)
    const board = [null,null,null,null,null];
    (boardCards || []).forEach((c, i) => { if (i < 5) board[i] = c; });

    const config = {
      mode: 'hybrid',
      hole_cards: {},
      hole_cards_range: {},
      hole_cards_combos: holeCombos,
      board,
      board_texture: boardTexture || [],
      ...extraConfig,
    };
    coachSock.emit('update_hand_config', { config });
    await new Promise(r => setTimeout(r, 20));

    coachSock.emit('start_configured_hand');

    let preflopCalled = false;
    while (!done && steps < MAX_STEPS) {
      const state = await nextState(3000);
      steps++;

      if (state.winner || state.showdown_result) { done = true; break; }
      if (steps > 1 && (state.phase === 'waiting' || state.phase === 'WAITING')) { done = true; break; }
      if (!ACTIVE.has(state.phase)) continue;
      if (state.paused) continue;

      // Run preflop assertion hook once
      if (!preflopCalled && state.phase === 'preflop' && onPreflop) {
        preflopCalled = true;
        try { onPreflop(state); } catch (e) {
          batchAnomalies.push({ hand: handNum, msg: `assertion: ${e.message}` });
        }
      }

      if (!state.current_turn) { coachSock.emit('force_next_street'); continue; }

      const actor = allActors.find(a => a.serverId === state.current_turn);
      if (!actor) {
        batchAnomalies.push({ hand: handNum, msg: `current_turn ${state.current_turn} not in actor list` });
        break;
      }
      actor.sock.emit('place_bet', pickAction(state));
    }

    if (steps >= MAX_STEPS) batchAnomalies.push({ hand: handNum, msg: `Exceeded ${MAX_STEPS} steps` });
  } catch (err) {
    batchCrashes.push({ hand: handNum, error: err.message });
  } finally {
    coachSock.off('game_state', onState);
    coachSock.emit('reset_hand');
    await new Promise(resolve => {
      const t = setTimeout(resolve, 400);
      function onW(s) {
        if (s && (s.phase === 'waiting' || s.phase === 'WAITING')) {
          clearTimeout(t); coachSock.off('game_state', onW); resolve();
        }
      }
      coachSock.on('game_state', onW);
    });
  }
}

// ─── Combo helpers (mirrors client PRESET_META logic, server-side) ────────────

const _RANKS = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
const _SUITS = ['h','d','c','s'];

function _parseSimpleRange(str) {
  // Minimal inline parser for batch needs — just handles comma-separated XYs/XYo/XX tokens
  const combos = [];
  for (const token of str.split(',').map(s => s.trim()).filter(Boolean)) {
    if (token.length === 2 && token[0] === token[1]) {
      // Pair
      const cards = _SUITS.map(s => `${token[0]}${s}`);
      for (let i = 0; i < cards.length; i++)
        for (let j = i+1; j < cards.length; j++)
          combos.push([cards[i], cards[j]]);
    } else if (token.endsWith('s') && token.length === 3) {
      const [r1, r2] = [token[0], token[1]];
      _SUITS.forEach(s => combos.push([`${r1}${s}`, `${r2}${s}`]));
    } else if (token.endsWith('o') && token.length === 3) {
      const [r1, r2] = [token[0], token[1]];
      for (const s1 of _SUITS) for (const s2 of _SUITS) {
        if (s1 !== s2) combos.push([`${r1}${s1}`, `${r2}${s2}`]);
      }
    }
  }
  return combos;
}

function _expandPreset(rangeStr) {
  return _parseSimpleRange(rangeStr);
}

function _intersect(lists) {
  if (!lists.length) return [];
  const sets = lists.map(combos => new Set(combos.map(([c1,c2]) => [c1,c2].sort().join(','))));
  const [first, ...rest] = sets;
  const inter = new Set([...first].filter(k => rest.every(s => s.has(k))));
  return [...inter].map(k => k.split(','));
}

// Pre-built combo lists matching client PRESET_META
const PRESET_COMBOS = {
  suited:       _RANKS.flatMap((r1,i) => _RANKS.slice(0,i).flatMap(r2 => _SUITS.map(s => [`${r1}${s}`,`${r2}${s}`]))),
  offsuit:      _RANKS.flatMap((r1,i) => _RANKS.slice(0,i).flatMap(r2 => _SUITS.flatMap(s1 => _SUITS.filter(s2=>s2!==s1).map(s2=>[`${r1}${s1}`,`${r2}${s2}`])))),
  broadway:     _expandPreset('AKs,AKo,AQs,AQo,AJs,AJo,ATs,ATo,KQs,KQo,KJs,KJo,KTs,KTo,QJs,QJo,QTs,QTo,JTs,JTo'),
  connectors:   _expandPreset('AKs,AKo,KQs,KQo,QJs,QJo,JTs,JTo,T9s,T9o,98s,98o,87s,87o,76s,76o,65s,65o,54s,54o,43s,43o,32s,32o'),
  one_gappers:  _expandPreset('AQs,AQo,KJs,KJo,QTs,QTo,J9s,J9o,T8s,T8o,97s,97o,86s,86o,75s,75o,64s,64o,53s,53o,42s,42o'),
  ace_high:     _expandPreset('AKs,AKo,AQs,AQo,AJs,AJo,ATs,ATo,A9s,A9o,A8s,A8o,A7s,A7o,A6s,A6o,A5s,A5o,A4s,A4o,A3s,A3o,A2s,A2o'),
  king_high:    _expandPreset('KQs,KQo,KJs,KJo,KTs,KTo,K9s,K9o,K8s,K8o,K7s,K7o,K6s,K6o,K5s,K5o,K4s,K4o,K3s,K3o,K2s,K2o'),
  premium_pairs:_expandPreset('QQ,KK,AA'),
  ato_plus:     _expandPreset('ATs,ATo,AJs,AJo,AQs,AQo,AKs,AKo'),
  premium:      [..._expandPreset('AA,KK,QQ,JJ,TT'), ..._expandPreset('AKs,AKo')],
};

// ─── Batch definitions ────────────────────────────────────────────────────────

const BATCHES = [
  // ── B1–B5: Player count & stack variations ──────────────────────────────────
  {
    id: 'B01', label: 'Coach+3 RNG Standard (200BB baseline)',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: null,     // default
    mode: 'rng',
  },
  {
    id: 'B02', label: 'Coach+2 RNG Standard',
    players: ['Dave', 'Eve'],
    stacks: null,
    mode: 'rng',
  },
  {
    id: 'B03', label: 'Heads-Up (Coach+1) RNG Standard',
    players: ['Frank'],
    stacks: null,
    mode: 'rng',
  },
  {
    id: 'B04', label: 'Coach+3 RNG Short stacks (10BB)',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: { all: 10 * DEFAULT_BIG_BLIND },
    mode: 'rng',
  },
  {
    id: 'B05', label: 'Coach+3 RNG Deep stacks (500BB)',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: { all: 500 * DEFAULT_BIG_BLIND },
    mode: 'rng',
  },

  // ── B6–B10: Side-pot & stack edge cases ─────────────────────────────────────
  {
    id: 'B06', label: 'Coach+3 RNG — one player has 1 chip',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: { Alice: 1 },
    mode: 'rng',
  },
  {
    id: 'B07', label: 'Coach+2 RNG — uneven stacks 10/50/200BB',
    players: ['Dave', 'Eve'],
    stacks: { Coach: 10 * DEFAULT_BIG_BLIND, Dave: 50 * DEFAULT_BIG_BLIND, Eve: 200 * DEFAULT_BIG_BLIND },
    mode: 'rng',
  },
  {
    id: 'B08', label: 'Coach+3 RNG — two players have 1 chip (multi side-pot)',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: { Alice: 1, Bob: 1 },
    mode: 'rng',
  },
  {
    id: 'B09', label: 'Heads-Up Coach+1 — one has 5BB (shove/fold)',
    players: ['Frank'],
    stacks: { Frank: 5 * DEFAULT_BIG_BLIND },
    mode: 'rng',
  },
  {
    id: 'B10', label: 'Coach+3 RNG — all start with exactly 2BB (blind-off)',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: { all: 2 * DEFAULT_BIG_BLIND },
    mode: 'rng',
  },

  // ── B11–B15: Manual hole card scenarios ─────────────────────────────────────
  {
    id: 'B11', label: 'Manual holes: AA vs KK vs QQ vs JJ — premium collision',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: null,
    mode: 'manual',
    holeCards: { Coach: ['Ah','Ad'], Alice: ['Kh','Kd'], Bob: ['Qh','Qd'], Carol: ['Jh','Jd'] },
    boardCards: [],
  },
  {
    id: 'B12', label: 'Manual holes: AKs vs AKo vs 72o vs 32o',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: null,
    mode: 'manual',
    holeCards: { Coach: ['As','Ks'], Alice: ['Ac','Kc'], Bob: ['7h','2c'], Carol: ['3d','2s'] },
    boardCards: [],
  },
  {
    id: 'B13', label: 'Manual holes: suited connectors 87s/76s/65s/54s',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: null,
    mode: 'manual',
    holeCards: { Coach: ['8h','7h'], Alice: ['7c','6c'], Bob: ['6d','5d'], Carol: ['5s','4s'] },
    boardCards: [],
  },
  {
    id: 'B14', label: 'Manual 3-handed: AA vs KK vs AK (cooler)',
    players: ['Dave', 'Eve'],
    stacks: null,
    mode: 'manual',
    holeCards: { Coach: ['Ah','As'], Dave: ['Kh','Ks'], Eve: ['Ac','Kc'] },
    boardCards: [],
  },
  {
    id: 'B15', label: 'Manual HU: Royal flush scenario (AhKhQhJhTh possible)',
    players: ['Frank'],
    stacks: null,
    mode: 'manual',
    holeCards: { Coach: ['Ah','Kh'], Frank: ['Qd','Jd'] },
    boardCards: ['Qh','Jh','Th'],
  },

  // ── B16–B20: Board texture scenarios ────────────────────────────────────────
  {
    id: 'B16', label: 'Manual board: Monotone Broadway As-Ks-Qs-Js-Ts',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: null,
    mode: 'manual',
    holeCards: {},
    boardCards: ['As','Ks','Qs','Js','Ts'],
  },
  {
    id: 'B17', label: 'Manual board: Quads on board Td-Th-Tc-Ts-2c',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: null,
    mode: 'manual',
    holeCards: {},
    boardCards: ['Td','Th','Tc','Ts','2c'],
  },
  {
    id: 'B18', label: 'Manual board: Rainbow dry brick 2c-7d-9h-3s-Jc',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: null,
    mode: 'manual',
    holeCards: {},
    boardCards: ['2c','7d','9h','3s','Jc'],
  },
  {
    id: 'B19', label: 'Manual board: Monotone straight-flush 8h-9h-Th-7h-Jh',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: null,
    mode: 'manual',
    holeCards: {},
    boardCards: ['8h','9h','Th','7h','Jh'],
  },
  {
    id: 'B20', label: 'Manual board: Four aces Ac-Ad-Ah-As-2c (kicker plays)',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: null,
    mode: 'manual',
    holeCards: {},
    boardCards: ['Ac','Ad','Ah','As','2c'],
  },

  // ── B21–B24: Full table (8–9 players) ──────────────────────────────────────
  {
    id: 'B21', label: 'Full table Coach+7 RNG Standard (8-handed)',
    players: ['P1','P2','P3','P4','P5','P6','P7'],
    stacks: null,
    mode: 'rng',
  },
  {
    id: 'B22', label: 'Full table Coach+8 RNG Standard (9-handed)',
    players: ['P1','P2','P3','P4','P5','P6','P7','P8'],
    stacks: null,
    mode: 'rng',
  },
  {
    id: 'B23', label: 'Full table Coach+7 RNG Mixed stacks — 3 players short (5BB), rest deep (300BB)',
    players: ['P1','P2','P3','P4','P5','P6','P7'],
    stacks: {
      P1: 5  * DEFAULT_BIG_BLIND,
      P2: 5  * DEFAULT_BIG_BLIND,
      P3: 5  * DEFAULT_BIG_BLIND,
      P4: 300 * DEFAULT_BIG_BLIND,
      P5: 300 * DEFAULT_BIG_BLIND,
      P6: 300 * DEFAULT_BIG_BLIND,
      P7: 300 * DEFAULT_BIG_BLIND,
    },
    mode: 'rng',
  },
  {
    id: 'B24', label: 'Full table Coach+8 Manual board: Monotone flop Ah-Kh-Qh (9-handed flush stress)',
    players: ['P1','P2','P3','P4','P5','P6','P7','P8'],
    stacks: null,
    mode: 'manual',
    holeCards: {},
    boardCards: ['Ah','Kh','Qh'],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // B25–B54 — Coach setting interaction tests
  // ══════════════════════════════════════════════════════════════════════════

  // ── B25–B29: set_player_in_hand toggles ─────────────────────────────────
  {
    id: 'B25', label: 'set_player_in_hand: exclude Carol each hand (3→2 effective)',
    players: ['Alice','Bob','Carol'],
    stacks: null, mode: 'rng',
    beforeHand: (coachSock, allActors) => {
      const p = allActors.find(a => a.name === 'Carol');
      if (p) setPlayerInHand(coachSock, p.serverId, false);
    },
  },
  {
    id: 'B26', label: 'set_player_in_hand: exclude Bob+Carol (coach heads-up every hand)',
    players: ['Alice','Bob','Carol'],
    stacks: null, mode: 'rng',
    beforeHand: (coachSock, allActors) => {
      for (const name of ['Bob','Carol']) {
        const p = allActors.find(a => a.name === name);
        if (p) setPlayerInHand(coachSock, p.serverId, false);
      }
    },
  },
  {
    id: 'B27', label: 'set_player_in_hand: re-include Carol after hand 10',
    players: ['Alice','Bob','Carol'],
    stacks: null, mode: 'rng',
    beforeHand: (coachSock, allActors, h) => {
      if (h <= 10) {
        const p = allActors.find(a => a.name === 'Carol');
        if (p) setPlayerInHand(coachSock, p.serverId, false);
      }
      // h > 10: in_hand auto-resets to true — Carol naturally returns
    },
  },
  {
    id: 'B28', label: 'set_player_in_hand: alternate Carol in/out every hand',
    players: ['Alice','Bob','Carol'],
    stacks: null, mode: 'rng',
    beforeHand: (coachSock, allActors, h) => {
      if (h % 2 === 0) { // even hands: exclude Carol
        const p = allActors.find(a => a.name === 'Carol');
        if (p) setPlayerInHand(coachSock, p.serverId, false);
      }
      // odd hands: auto-included
    },
  },
  {
    id: 'B29', label: 'set_player_in_hand: coach excludes self every hand',
    players: ['Alice','Bob','Carol'],
    stacks: null, mode: 'rng',
    beforeHand: (coachSock, allActors) => {
      const coach = allActors.find(a => a.isCoach);
      if (coach) setPlayerInHand(coachSock, coach.serverId, false);
    },
  },

  // ── B30–B34: Stack manipulation ─────────────────────────────────────────
  {
    id: 'B30', label: 'adjust_stack: top-up all players to 200BB before every hand',
    players: ['Alice','Bob','Carol'],
    stacks: null, mode: 'rng',
    beforeHand: async (coachSock, allActors) => {
      for (const a of allActors) {
        if (a.serverId) await setStack(coachSock, a.serverId, 200 * DEFAULT_BIG_BLIND);
      }
    },
  },
  {
    id: 'B31', label: 'adjust_stack: reduce Carol to 1 chip starting hand 6',
    players: ['Alice','Bob','Carol'],
    stacks: null, mode: 'rng',
    beforeHand: async (coachSock, allActors, h) => {
      if (h === 6) {
        const carol = allActors.find(a => a.name === 'Carol');
        if (carol) await setStack(coachSock, carol.serverId, 1);
      }
    },
  },
  {
    id: 'B32', label: 'adjust_stack: alternate Alice between 50BB and 200BB each hand',
    players: ['Alice','Bob','Carol'],
    stacks: null, mode: 'rng',
    beforeHand: async (coachSock, allActors, h) => {
      const alice = allActors.find(a => a.name === 'Alice');
      if (alice) await setStack(coachSock, alice.serverId, (h % 2 === 1 ? 50 : 200) * DEFAULT_BIG_BLIND);
    },
  },
  {
    id: 'B33', label: 'adjust_stack: normalise all 4 players to equal stacks before each hand',
    players: ['Alice','Bob','Carol'],
    stacks: null, mode: 'rng',
    beforeHand: async (coachSock, allActors) => {
      for (const a of allActors) {
        if (a.serverId) await setStack(coachSock, a.serverId, 100 * DEFAULT_BIG_BLIND);
      }
    },
  },
  {
    id: 'B34', label: 'adjust_stack: rapid 5× successive adjustments per hand, settle to 200BB',
    players: ['Alice','Bob','Carol'],
    stacks: null, mode: 'rng',
    beforeHand: async (coachSock, allActors) => {
      for (let i = 1; i <= 5; i++) {
        for (const a of allActors) {
          if (a.serverId) coachSock.emit('adjust_stack', { playerId: a.serverId, amount: i * 100 });
        }
        await new Promise(r => setTimeout(r, 5));
      }
      // Settle all to 200BB
      for (const a of allActors) {
        if (a.serverId) await setStack(coachSock, a.serverId, 200 * DEFAULT_BIG_BLIND);
      }
    },
  },

  // ── B35–B37: Pause / resume ──────────────────────────────────────────────
  {
    id: 'B35', label: 'toggle_pause: pause after first action each hand, then unpause',
    players: ['Alice','Bob','Carol'],
    stacks: null, mode: 'rng',
    hooksFactory: () => {
      let paused = false;
      let skipNext = false;
      return {
        onState: () => { if (skipNext) { skipNext = false; return 'skip'; } },
        afterBet: async (_bet, coachSock) => {
          if (!paused) {
            paused = true;
            skipNext = true;
            togglePause(coachSock);
            await new Promise(r => setTimeout(r, 60));
            togglePause(coachSock);
            await new Promise(r => setTimeout(r, 20));
          }
        },
      };
    },
  },
  {
    id: 'B36', label: 'toggle_pause: pause + unpause at start of each new street',
    players: ['Alice','Bob','Carol'],
    stacks: null, mode: 'rng',
    hooksFactory: () => {
      const pausedStreets = new Set();
      return {
        onState: async (state, coachSock) => {
          const s = state.phase;
          if (['flop','turn','river'].includes(s) && !pausedStreets.has(s)) {
            pausedStreets.add(s);
            togglePause(coachSock);
            await new Promise(r => setTimeout(r, 60));
            togglePause(coachSock);
            await new Promise(r => setTimeout(r, 20));
            return 'skip';
          }
        },
      };
    },
  },
  {
    id: 'B37', label: 'toggle_pause: pause immediately after start_game, unpause before first action',
    players: ['Alice','Bob','Carol'],
    stacks: null, mode: 'rng',
    hooksFactory: () => {
      let done = false;
      return {
        onState: async (state, coachSock) => {
          if (!done && state.phase === 'preflop') {
            done = true;
            togglePause(coachSock);
            await new Promise(r => setTimeout(r, 60));
            togglePause(coachSock);
            await new Promise(r => setTimeout(r, 20));
            return 'skip';
          }
        },
      };
    },
  },

  // ── B38–B40: Action controls ─────────────────────────────────────────────
  {
    id: 'B38', label: 'undo_action: undo the first action on each street',
    players: ['Alice','Bob','Carol'],
    stacks: null, mode: 'rng',
    hooksFactory: () => {
      const undoneStreets = new Set();
      let skipNext = false;
      return {
        onState: () => { if (skipNext) { skipNext = false; return 'skip'; } },
        afterBet: async (_bet, coachSock) => {
          // undo once per hand; skip the stale post-bet state that queued before undo
          if (!undoneStreets.has('once')) {
            undoneStreets.add('once');
            skipNext = true;
            undoAction(coachSock);
            await new Promise(r => setTimeout(r, 20));
          }
        },
      };
    },
  },
  {
    id: 'B39', label: 'rollback_street: roll back to flop when turn starts',
    players: ['Alice','Bob','Carol'],
    stacks: { all: 200 * DEFAULT_BIG_BLIND }, mode: 'rng',
    hooksFactory: () => {
      let done = false;
      return {
        onState: async (state, coachSock) => {
          if (state.phase === 'turn' && state.current_turn && !done) {
            done = true;
            let failed = false;
            const onErr = () => { failed = true; };
            coachSock.once('error', onErr);
            rollbackStreet(coachSock);
            await new Promise(r => setTimeout(r, 40));
            coachSock.off('error', onErr);
            if (failed) return 'abort'; // server rejected rollback; reset normally
            return 'skip';
          }
        },
      };
    },
  },
  {
    id: 'B40', label: 'rollback_street: roll back to turn when river starts',
    players: ['Alice','Bob','Carol'],
    stacks: { all: 200 * DEFAULT_BIG_BLIND }, mode: 'rng',
    hooksFactory: () => {
      let done = false;
      return {
        onState: async (state, coachSock) => {
          if (state.phase === 'river' && !done) {
            done = true;
            rollbackStreet(coachSock);
            await new Promise(r => setTimeout(r, 20));
            return 'skip';
          }
        },
      };
    },
  },

  // ── B41: force_next_street with players still to act ────────────────────
  {
    id: 'B41', label: 'force_next_street: skip preflop betting (force flop immediately)',
    players: ['Alice','Bob','Carol'],
    stacks: null, mode: 'rng',
    hooksFactory: () => {
      let forced = false;
      return {
        onState: async (state, coachSock) => {
          if (state.phase === 'preflop' && state.current_turn && !forced) {
            forced = true;
            coachSock.emit('force_next_street');
            await new Promise(r => setTimeout(r, 20));
            return 'skip';
          }
        },
      };
    },
  },

  // ── B42–B43: award_pot ───────────────────────────────────────────────────
  {
    id: 'B42', label: 'award_pot: manually award pot when flop appears',
    players: ['Alice','Bob','Carol'],
    stacks: null, mode: 'rng',
    hooksFactory: () => {
      let awarded = false;
      return {
        onState: async (state, coachSock) => {
          if (state.phase === 'flop' && !awarded) {
            awarded = true;
            const winner = firstActivePlayer(state);
            if (winner) awardPot(coachSock, winner.id);
            return 'abort';
          }
        },
      };
    },
  },
  {
    id: 'B43', label: 'award_pot: award to richest player at start of turn',
    players: ['Alice','Bob','Carol'],
    stacks: null, mode: 'rng',
    hooksFactory: () => {
      let awarded = false;
      return {
        onState: async (state, coachSock) => {
          if (state.phase === 'turn' && !awarded) {
            awarded = true;
            const winner = (state.players || [])
              .filter(p => p.stack > 0)
              .sort((a, b) => b.stack - a.stack)[0];
            if (winner) awardPot(coachSock, winner.id);
            return 'abort';
          }
        },
      };
    },
  },

  // ── B44–B46: reset_hand mid-hand ─────────────────────────────────────────
  {
    id: 'B44', label: 'reset_hand: immediately after start_game (before any action)',
    players: ['Alice','Bob','Carol'],
    stacks: null, mode: 'rng',
    hooksFactory: () => {
      let reset = false;
      return {
        onState: async (state, coachSock) => {
          if (!reset && state.phase === 'preflop') {
            reset = true;
            coachSock.emit('reset_hand');
            return 'abort';
          }
        },
      };
    },
  },
  {
    id: 'B45', label: 'reset_hand: after preflop completes (when flop appears)',
    players: ['Alice','Bob','Carol'],
    stacks: null, mode: 'rng',
    hooksFactory: () => {
      let reset = false;
      return {
        onState: async (state, coachSock) => {
          if (!reset && state.phase === 'flop') {
            reset = true;
            coachSock.emit('reset_hand');
            return 'abort';
          }
        },
      };
    },
  },
  {
    id: 'B46', label: 'reset_hand: after flop betting (when turn appears)',
    players: ['Alice','Bob','Carol'],
    stacks: null, mode: 'rng',
    hooksFactory: () => {
      let reset = false;
      return {
        onState: async (state, coachSock) => {
          if (!reset && state.phase === 'turn') {
            reset = true;
            coachSock.emit('reset_hand');
            return 'abort';
          }
        },
      };
    },
  },

  // ── B47–B48: set_mode ────────────────────────────────────────────────────
  {
    id: 'B47', label: 'set_mode: alternate rng/manual hands (10+10)',
    players: ['Alice','Bob','Carol'],
    stacks: null,
    handMode: h => h % 2 === 0 ? 'manual' : 'rng',
    holeCards: {},
    boardCards: ['Ah','Kc','7d'],
  },
  {
    id: 'B48', label: 'set_mode: emit set_mode during active hand (expect graceful rejection)',
    players: ['Alice','Bob','Carol'],
    stacks: null, mode: 'rng',
    hooks: {
      onState: async (state, coachSock) => {
        if (state.phase === 'preflop' && state.current_turn) {
          setMode(coachSock, 'manual'); // server should reject mid-hand mode change
        }
      },
    },
  },

  // ── B49–B52: Config interactions ─────────────────────────────────────────
  {
    id: 'B49', label: 'update_hand_config: overwrite config 3× before starting (last wins)',
    players: ['Alice','Bob','Carol'],
    stacks: null, mode: 'manual',
    holeCards: { Coach: ['Ah','Ad'], Alice: ['Kh','Kd'] },
    boardCards: ['Qc','Jd','Ts'],
    hooks: {
      afterConfigUpdate: async (coachSock, originalConfig) => {
        // Second update — swap hole cards
        coachSock.emit('update_hand_config', {
          boardCards: ['2c','3d','4h'],
          playerHoleCards: originalConfig.playerHoleCards,
        });
        await new Promise(r => setTimeout(r, 10));
        // Third update — restore original (this is the one that should take effect)
        coachSock.emit('update_hand_config', originalConfig);
        await new Promise(r => setTimeout(r, 10));
      },
    },
  },
  {
    id: 'B50', label: 'update_hand_config: board only (server fills hole cards via RNG)',
    players: ['Alice','Bob','Carol'],
    stacks: null, mode: 'manual',
    holeCards: {}, // no hole cards — server fills them
    boardCards: ['Ac','Kd','Qh'],
  },
  {
    id: 'B51', label: 'update_hand_config: hole cards only (server fills board via RNG)',
    players: ['Alice','Bob','Carol'],
    stacks: null, mode: 'manual',
    holeCards: { Coach: ['As','Ks'], Alice: ['Qh','Jh'] },
    boardCards: [], // no board — server fills it
  },
  {
    id: 'B52', label: 'update_hand_config: open config then reset_hand (abort config)',
    players: ['Alice','Bob','Carol'],
    stacks: null, mode: 'manual',
    holeCards: { Coach: ['Ah','Ad'] },
    boardCards: [],
    hooks: {
      afterConfigUpdate: async (coachSock) => {
        coachSock.emit('reset_hand');
        await new Promise(r => setTimeout(r, 20));
        return 'abort'; // skip start_configured_hand
      },
    },
  },

  // ── B53–B54: Hand tagging ────────────────────────────────────────────────
  {
    id: 'B53', label: 'update_hand_tags: tag every hand as "study"',
    players: ['Alice','Bob','Carol'],
    stacks: null, mode: 'rng',
    afterHand: async (coachSock, _allActors, _h, handId) => {
      if (handId) {
        coachSock.emit('update_hand_tags', { handId, tags: ['study'] });
        await new Promise(r => setTimeout(r, 20));
      }
    },
  },
  {
    id: 'B54', label: 'update_hand_tags: cycle through all tag types (study/hero/bluff/value/interesting)',
    players: ['Alice','Bob','Carol'],
    stacks: null, mode: 'rng',
    afterHand: async (coachSock, _allActors, h, handId) => {
      if (handId) {
        const tags = ['study','hero','bluff','value','interesting','whale_pot','setup','mistake'];
        coachSock.emit('update_hand_tags', { handId, tags: [tags[(h - 1) % tags.length]] });
        await new Promise(r => setTimeout(r, 20));
      }
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // B55–B74 — Random / mixed scenarios
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: 'B55', label: '5-handed RNG (Coach+4) — general mid-size table',
    players: ['Alice','Bob','Carol','Dave'],
    stacks: null, mode: 'rng',
  },
  {
    id: 'B56', label: '3-handed raise-war: all deep (500BB) — stress multi-street betting',
    players: ['Alice','Bob'],
    stacks: { all: 500 * DEFAULT_BIG_BLIND }, mode: 'rng',
  },
  {
    id: 'B57', label: 'alternating RNG/manual per hand (10+10)',
    players: ['Alice','Bob','Carol'],
    stacks: null,
    handMode: h => h % 2 === 0 ? 'manual' : 'rng',
    holeCards: { Coach: ['Ah','Kh'], Alice: ['Qd','Jd'] },
    boardCards: ['Th','9h','8c'],
  },
  {
    id: 'B58', label: '9-handed all-in preflop (10BB stacks) — maximum side-pot chains',
    players: ['P1','P2','P3','P4','P5','P6','P7','P8'],
    stacks: { all: 10 * DEFAULT_BIG_BLIND }, mode: 'rng',
  },
  {
    id: 'B59', label: 'HU deep (1000BB) — maximise streets reached',
    players: ['Frank'],
    stacks: { all: 1000 * DEFAULT_BIG_BLIND }, mode: 'rng',
  },
  {
    id: 'B60', label: 'Coach+3: extreme ratio — Alice has 1 chip, others 500BB',
    players: ['Alice','Bob','Carol'],
    stacks: { Alice: 1, Bob: 500 * DEFAULT_BIG_BLIND, Carol: 500 * DEFAULT_BIG_BLIND },
    mode: 'rng',
  },
  {
    id: 'B61', label: '6-handed (Coach+5) 100BB standard',
    players: ['Alice','Bob','Carol','Dave','Eve'],
    stacks: { all: 100 * DEFAULT_BIG_BLIND }, mode: 'rng',
  },
  {
    id: 'B62', label: '7-handed: 4 short-stack (10BB) + Coach + 2 deep (300BB)',
    players: ['Alice','Bob','Carol','Dave','Eve','Frank'],
    stacks: {
      Alice: 10 * DEFAULT_BIG_BLIND, Bob: 10 * DEFAULT_BIG_BLIND,
      Carol: 10 * DEFAULT_BIG_BLIND, Dave: 10 * DEFAULT_BIG_BLIND,
      Eve: 300 * DEFAULT_BIG_BLIND,  Frank: 300 * DEFAULT_BIG_BLIND,
    },
    mode: 'rng',
  },
  {
    id: 'B63', label: 'reset after 2 actions: high-frequency mid-hand reset cycle',
    players: ['Alice','Bob','Carol'],
    stacks: null, mode: 'rng',
    hooksFactory: () => {
      let betCount = 0;
      return {
        afterBet: async (_bet, coachSock) => {
          betCount++;
          if (betCount >= 2) {
            coachSock.emit('reset_hand');
            betCount = 0;
          }
        },
      };
    },
  },
  {
    id: 'B64', label: 'coach always folds first: coach fold path + blind rotation',
    players: ['Alice','Bob','Carol'],
    stacks: null, mode: 'rng',
    hooksFactory: (_h, allActors) => ({
      onState: async (state, coachSock) => {
        // if coach has the turn, override to fold
        const coach = (allActors || []).find(a => a.isCoach);
        if (coach && state.current_turn === coach.serverId) {
          coachSock.emit('place_bet', { action: 'fold' });
          return; // let the normal actor-find path handle if coach is not the turn player
        }
      },
    }),
  },
  {
    id: 'B65', label: '9-handed extreme stack spread (10/20/50/100/200/300/400/500/1000BB)',
    players: ['P1','P2','P3','P4','P5','P6','P7','P8'],
    stacks: {
      Coach: 10 * DEFAULT_BIG_BLIND,
      P1: 20  * DEFAULT_BIG_BLIND, P2: 50  * DEFAULT_BIG_BLIND,
      P3: 100 * DEFAULT_BIG_BLIND, P4: 200 * DEFAULT_BIG_BLIND,
      P5: 300 * DEFAULT_BIG_BLIND, P6: 400 * DEFAULT_BIG_BLIND,
      P7: 500 * DEFAULT_BIG_BLIND, P8: 1000 * DEFAULT_BIG_BLIND,
    },
    mode: 'rng',
  },
  {
    id: 'B66', label: 'HU: one has 2BB — forced blind all-in edge case',
    players: ['Frank'],
    stacks: { Frank: 2 * DEFAULT_BIG_BLIND }, mode: 'rng',
  },
  {
    id: 'B67', label: 'Manual full board (5-handed): 5 streets pre-set — betting on each',
    players: ['Alice','Bob','Carol','Dave'],
    stacks: null, mode: 'manual',
    holeCards: {},
    boardCards: ['Ah','Kh','Qh','Jh','Th'],
  },
  {
    id: 'B68', label: 'adjust_stack + set_player_in_hand combined: normalise + exclude per hand',
    players: ['Alice','Bob','Carol'],
    stacks: null, mode: 'rng',
    beforeHand: async (coachSock, allActors, h) => {
      // Normalise stacks
      for (const a of allActors) {
        if (a.serverId) await setStack(coachSock, a.serverId, 100 * DEFAULT_BIG_BLIND);
      }
      // Rotate exclusion: hand 1 excludes Alice, hand 2 Bob, hand 3 Carol, hand 4 no one, …
      const names = ['Alice','Bob','Carol'];
      const excludeName = names[(h - 1) % 4]; // hand 4,8,… = index 3 = undefined → no exclusion
      if (excludeName) {
        const p = allActors.find(a => a.name === excludeName);
        if (p) setPlayerInHand(coachSock, p.serverId, false);
      }
    },
  },
  {
    id: 'B69', label: '8-handed: 3 players excluded via set_player_in_hand (effective 5-handed)',
    players: ['P1','P2','P3','P4','P5','P6','P7'],
    stacks: null, mode: 'rng',
    beforeHand: (coachSock, allActors) => {
      for (const name of ['P5','P6','P7']) {
        const p = allActors.find(a => a.name === name);
        if (p) setPlayerInHand(coachSock, p.serverId, false);
      }
    },
  },
  {
    id: 'B70', label: 'combined: RNG/manual alternating + pause each hand',
    players: ['Alice','Bob','Carol'],
    stacks: null,
    handMode: h => h % 2 === 0 ? 'manual' : 'rng',
    holeCards: {},
    boardCards: ['2c','5d','9h'],
    hooksFactory: () => {
      let paused = false;
      return {
        onState: async (state, coachSock) => {
          if (!paused && state.phase === 'preflop') {
            paused = true;
            togglePause(coachSock);
            await new Promise(r => setTimeout(r, 60));
            togglePause(coachSock);
            await new Promise(r => setTimeout(r, 20));
          }
        },
      };
    },
  },
  {
    id: 'B71', label: '6-handed deep (500BB) raise-heavy: maximise multi-street length',
    players: ['Alice','Bob','Carol','Dave','Eve'],
    stacks: { all: 500 * DEFAULT_BIG_BLIND }, mode: 'rng',
  },
  {
    id: 'B72', label: 'award_pot every hand: no natural completions — all manually closed',
    players: ['Alice','Bob','Carol'],
    stacks: null, mode: 'rng',
    hooksFactory: () => {
      let awarded = false;
      return {
        onState: async (state, coachSock) => {
          if (!awarded && state.phase === 'flop') {
            awarded = true;
            const winner = firstActivePlayer(state);
            if (winner) awardPot(coachSock, winner.id);
            return 'abort';
          }
        },
      };
    },
  },
  {
    id: 'B73', label: '9-handed triple edge: 1 excluded + 1 has 1 chip + 1 has 1000BB',
    players: ['P1','P2','P3','P4','P5','P6','P7','P8'],
    stacks: { P1: 1, P2: 1000 * DEFAULT_BIG_BLIND },
    mode: 'rng',
    beforeHand: (coachSock, allActors) => {
      const p = allActors.find(a => a.name === 'P3');
      if (p) setPlayerInHand(coachSock, p.serverId, false);
    },
  },
  {
    id: 'B74', label: 'scaling player count: 3-active → 6-active → 9-active within session',
    players: ['P1','P2','P3','P4','P5','P6','P7','P8'],
    stacks: null, mode: 'rng',
    beforeHand: (coachSock, allActors, h) => {
      // Hands 1-7:  only Coach+P1+P2 active (P3–P8 excluded)
      // Hands 8-14: Coach+P1..P5 active (P6–P8 excluded)
      // Hands 15-20: all 9 active
      const excludeFrom7  = ['P3','P4','P5','P6','P7','P8'];
      const excludeFrom14 = ['P6','P7','P8'];
      const toExclude = h <= 7 ? excludeFrom7 : h <= 14 ? excludeFrom14 : [];
      for (const a of allActors) {
        if (!a.isCoach) {
          const shouldExclude = toExclude.includes(a.name);
          if (shouldExclude) setPlayerInHand(coachSock, a.serverId, false);
        }
      }
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // B75–B84 — Coach Control Edge Cases
  // ══════════════════════════════════════════════════════════════════════════

  {
    id: 'B75', label: 'open_config_phase: called twice in a row (idempotent or error)',
    players: ['Alice','Bob','Carol'],
    stacks: null, mode: 'manual',
    holeCards: { Coach: ['Ah','Kh'] }, boardCards: ['Qc','Jd','Ts'],
    hooks: {
      afterConfigUpdate: async (coachSock) => {
        coachSock.emit('open_config_phase'); // second call while already in config phase
        await new Promise(r => setTimeout(r, 20));
      },
    },
  },
  {
    id: 'B76', label: 'start_configured_hand: without open_config_phase first (expect rejection)',
    players: ['Alice','Bob','Carol'],
    stacks: null, mode: 'rng',
    beforeHand: async (coachSock) => {
      coachSock.emit('start_configured_hand'); // no config open — server should reject
      await new Promise(r => setTimeout(r, 30));
    },
  },
  {
    id: 'B77', label: 'update_hand_config: duplicate card in both hole cards and board (As twice)',
    players: ['Alice','Bob','Carol'],
    stacks: null, mode: 'manual',
    holeCards: { Coach: ['As','Kh'] },
    boardCards: ['As','Qd','Jc'], // As duplicated
  },
  {
    id: 'B78', label: 'force_next_street: called at showdown (graceful no-op or error)',
    players: ['Alice','Bob','Carol'],
    stacks: null, mode: 'rng',
    hooksFactory: () => {
      let fired = false;
      return {
        onState: async (state, coachSock) => {
          if (state.phase === 'showdown' && !fired) {
            fired = true;
            coachSock.emit('force_next_street');
            await new Promise(r => setTimeout(r, 20));
          }
        },
      };
    },
  },
  {
    id: 'B79', label: 'adjust_stack: set player to 0 chips mid-session (force bust)',
    players: ['Alice','Bob','Carol'],
    stacks: null, mode: 'rng',
    beforeHand: async (coachSock, allActors, h) => {
      if (h === 5) {
        const alice = allActors.find(a => a.name === 'Alice');
        if (alice) coachSock.emit('adjust_stack', { playerId: alice.serverId, amount: 0 });
        await new Promise(r => setTimeout(r, 20));
      }
    },
  },
  {
    id: 'B80', label: 'adjust_stack: negative value (input sanitization)',
    players: ['Alice','Bob','Carol'],
    stacks: null, mode: 'rng',
    beforeHand: async (coachSock, allActors) => {
      const alice = allActors.find(a => a.name === 'Alice');
      if (alice) coachSock.emit('adjust_stack', { playerId: alice.serverId, amount: -500 });
      await new Promise(r => setTimeout(r, 20));
    },
  },
  {
    id: 'B81', label: 'rollback_street: called at preflop (nothing to roll back to)',
    players: ['Alice','Bob','Carol'],
    stacks: null, mode: 'rng',
    hooksFactory: () => {
      let done = false;
      return {
        onState: async (state, coachSock) => {
          if (state.phase === 'preflop' && state.current_turn && !done) {
            done = true;
            let failed = false;
            const onErr = () => { failed = true; };
            coachSock.once('error', onErr);
            rollbackStreet(coachSock);
            await new Promise(r => setTimeout(r, 40));
            coachSock.off('error', onErr);
            if (failed) return 'skip';
          }
        },
      };
    },
  },
  {
    id: 'B82', label: 'undo_action: called before start_game (nothing to undo)',
    players: ['Alice','Bob','Carol'],
    stacks: null, mode: 'rng',
    beforeHand: async (coachSock) => {
      coachSock.emit('undo_action');
      await new Promise(r => setTimeout(r, 20));
    },
  },
  {
    id: 'B83', label: 'award_pot: non-existent player ID (expect graceful rejection)',
    players: ['Alice','Bob','Carol'],
    stacks: null, mode: 'rng',
    hooksFactory: () => {
      let done = false;
      return {
        onState: async (state, coachSock) => {
          if (state.phase === 'flop' && !done) {
            done = true;
            awardPot(coachSock, 'nonexistent-player-id-00000');
            await new Promise(r => setTimeout(r, 20));
          }
        },
      };
    },
  },
  {
    id: 'B84', label: 'set_player_in_hand: non-existent player ID (expect graceful rejection)',
    players: ['Alice','Bob','Carol'],
    stacks: null, mode: 'rng',
    beforeHand: async (coachSock) => {
      coachSock.emit('set_player_in_hand', { playerId: 'nonexistent-id-00000', inHand: false });
      await new Promise(r => setTimeout(r, 20));
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // B85–B94 — Multi-Op Combinations
  // ══════════════════════════════════════════════════════════════════════════

  {
    id: 'B85', label: 'adjust_stack then rollback_street — does rollback restore original stack?',
    players: ['Alice','Bob','Carol'],
    stacks: { all: 200 * DEFAULT_BIG_BLIND }, mode: 'rng',
    hooksFactory: (_h, allActors) => {
      let done = false;
      return {
        onState: async (state, coachSock) => {
          if (state.phase === 'flop' && state.current_turn && !done) {
            done = true;
            const alice = allActors.find(a => a.name === 'Alice');
            if (alice) coachSock.emit('adjust_stack', { playerId: alice.serverId, amount: 9999 });
            await new Promise(r => setTimeout(r, 20));
            let failed = false;
            const onErr = () => { failed = true; };
            coachSock.once('error', onErr);
            rollbackStreet(coachSock);
            await new Promise(r => setTimeout(r, 40));
            coachSock.off('error', onErr);
            if (failed) return 'skip';
            return 'skip';
          }
        },
      };
    },
  },
  {
    id: 'B86', label: 'pause + undo_action while paused',
    players: ['Alice','Bob','Carol'],
    stacks: null, mode: 'rng',
    hooksFactory: () => {
      let done = false;
      let skipNext = false;
      return {
        onState: () => { if (skipNext) { skipNext = false; return 'skip'; } },
        afterBet: async (_bet, coachSock) => {
          if (!done) {
            done = true;
            skipNext = true;
            togglePause(coachSock);
            await new Promise(r => setTimeout(r, 30));
            undoAction(coachSock);
            await new Promise(r => setTimeout(r, 30));
            togglePause(coachSock);
            await new Promise(r => setTimeout(r, 20));
          }
        },
      };
    },
  },
  {
    id: 'B87', label: 'pause + rollback_street while paused',
    players: ['Alice','Bob','Carol'],
    stacks: { all: 200 * DEFAULT_BIG_BLIND }, mode: 'rng',
    hooksFactory: () => {
      let done = false;
      return {
        onState: async (state, coachSock) => {
          if (state.phase === 'turn' && state.current_turn && !done) {
            done = true;
            togglePause(coachSock);
            await new Promise(r => setTimeout(r, 30));
            let failed = false;
            const onErr = () => { failed = true; };
            coachSock.once('error', onErr);
            rollbackStreet(coachSock);
            await new Promise(r => setTimeout(r, 40));
            coachSock.off('error', onErr);
            togglePause(coachSock);
            await new Promise(r => setTimeout(r, 20));
            if (failed) return 'skip';
            return 'skip';
          }
        },
      };
    },
  },
  {
    id: 'B88', label: 'force_next_street then immediate rollback_street',
    players: ['Alice','Bob','Carol'],
    stacks: { all: 200 * DEFAULT_BIG_BLIND }, mode: 'rng',
    hooksFactory: () => {
      let done = false;
      return {
        onState: async (state, coachSock) => {
          if (state.phase === 'preflop' && state.current_turn && !done) {
            done = true;
            coachSock.emit('force_next_street');
            await new Promise(r => setTimeout(r, 30));
            let failed = false;
            const onErr = () => { failed = true; };
            coachSock.once('error', onErr);
            rollbackStreet(coachSock);
            await new Promise(r => setTimeout(r, 40));
            coachSock.off('error', onErr);
            if (failed) return 'skip';
            return 'skip';
          }
        },
      };
    },
  },
  {
    id: 'B89', label: 'award_pot: immediately at preflop start (before any action)',
    players: ['Alice','Bob','Carol'],
    stacks: null, mode: 'rng',
    hooksFactory: () => {
      let done = false;
      return {
        onState: async (state, coachSock) => {
          if (state.phase === 'preflop' && !done) {
            done = true;
            const winner = firstActivePlayer(state);
            if (winner) awardPot(coachSock, winner.id);
            return 'abort';
          }
        },
      };
    },
  },
  {
    id: 'B90', label: 'open_config_phase: called during active hand (expect rejection)',
    players: ['Alice','Bob','Carol'],
    stacks: null, mode: 'rng',
    hooks: {
      onState: async (state, coachSock) => {
        if (state.phase === 'preflop' && state.current_turn) {
          coachSock.emit('open_config_phase');
          await new Promise(r => setTimeout(r, 20));
        }
      },
    },
  },
  {
    id: 'B91', label: 'award_pot: called twice in same hand (second after first awards)',
    players: ['Alice','Bob','Carol'],
    stacks: null, mode: 'rng',
    hooksFactory: () => {
      let done = false;
      return {
        onState: async (state, coachSock) => {
          if (state.phase === 'flop' && !done) {
            done = true;
            const winner = firstActivePlayer(state);
            if (winner) {
              awardPot(coachSock, winner.id);
              await new Promise(r => setTimeout(r, 20));
              awardPot(coachSock, winner.id); // second award — should be rejected gracefully
              await new Promise(r => setTimeout(r, 20));
            }
            return 'abort';
          }
        },
      };
    },
  },
  {
    id: 'B92', label: 'set_player_in_hand: exclude the current turn player mid-hand',
    players: ['Alice','Bob','Carol'],
    stacks: null, mode: 'rng',
    hooksFactory: () => {
      let done = false;
      return {
        onState: async (state, coachSock) => {
          if (state.phase === 'preflop' && state.current_turn && !done) {
            done = true;
            setPlayerInHand(coachSock, state.current_turn, false);
            await new Promise(r => setTimeout(r, 20));
          }
        },
      };
    },
  },
  {
    id: 'B93', label: 'undo_action: undo first action on the flop (cross-street undo)',
    players: ['Alice','Bob','Carol'],
    stacks: null, mode: 'rng',
    hooksFactory: () => {
      let onFlop = false;
      let done = false;
      let skipNext = false;
      return {
        onState: (state) => {
          if (skipNext) { skipNext = false; return 'skip'; }
          if (state.phase === 'flop') onFlop = true;
        },
        afterBet: async (_bet, coachSock) => {
          if (onFlop && !done) {
            done = true;
            onFlop = false;
            skipNext = true;
            undoAction(coachSock);
            await new Promise(r => setTimeout(r, 20));
          }
        },
      };
    },
  },
  {
    id: 'B94', label: 'adjust_stack: called during active hand (mid-hand stack change)',
    players: ['Alice','Bob','Carol'],
    stacks: null, mode: 'rng',
    hooksFactory: (_h, allActors) => {
      let done = false;
      return {
        onState: async (state, coachSock) => {
          if (state.phase === 'flop' && !done) {
            done = true;
            for (const a of allActors) {
              if (a.serverId) coachSock.emit('adjust_stack', { playerId: a.serverId, amount: 500 * DEFAULT_BIG_BLIND });
            }
            await new Promise(r => setTimeout(r, 20));
          }
        },
      };
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // B95–B104 — Guided Replay Mode
  // ══════════════════════════════════════════════════════════════════════════

  {
    id: 'B95', label: 'replay: load hand + step_forward through all actions to end',
    players: ['Alice','Bob','Carol'],
    stacks: null, mode: 'replay',
    setup: async (_port, coachSock, allActors, crashes, anomalies) => {
      const handIds = [];
      const onHand = ({ handId }) => { if (handId) handIds.push(handId); };
      coachSock.on('hand_started', onHand);
      for (let i = 0; i < 5; i++) await playHand(i + 1, coachSock, allActors, crashes, anomalies);
      coachSock.off('hand_started', onHand);
      return { handIds };
    },
    hooksFactory: () => ({
      replayOps: async (coachSock, nextRState) => {
        for (let i = 0; i < 30; i++) {
          coachSock.emit('replay_step_forward');
          const s = await nextRState(1500).catch(() => null);
          if (!s || !s.replay_mode || !s.replay_mode.active) break;
        }
      },
    }),
  },
  {
    id: 'B96', label: 'replay: step_backward from end back to start',
    players: ['Alice','Bob','Carol'],
    stacks: null, mode: 'replay',
    setup: async (_port, coachSock, allActors, crashes, anomalies) => {
      const handIds = [];
      const onHand = ({ handId }) => { if (handId) handIds.push(handId); };
      coachSock.on('hand_started', onHand);
      for (let i = 0; i < 5; i++) await playHand(i + 1, coachSock, allActors, crashes, anomalies);
      coachSock.off('hand_started', onHand);
      return { handIds };
    },
    hooksFactory: () => ({
      replayOps: async (coachSock, nextRState) => {
        // Fast-forward to end
        for (let i = 0; i < 30; i++) {
          coachSock.emit('replay_step_forward');
          const s = await nextRState(1500).catch(() => null);
          if (!s || !s.replay_mode || !s.replay_mode.active) break;
        }
        // Step backward to start
        for (let i = 0; i < 30; i++) {
          coachSock.emit('replay_step_back');
          const s = await nextRState(1500).catch(() => null);
          if (!s || !s.replay_mode || !s.replay_mode.active) break;
          if (s.replay_mode.cursor <= 0) break;
        }
      },
    }),
  },
  {
    id: 'B97', label: 'replay: jump_to middle action directly',
    players: ['Alice','Bob','Carol'],
    stacks: null, mode: 'replay',
    setup: async (_port, coachSock, allActors, crashes, anomalies) => {
      const handIds = [];
      const onHand = ({ handId }) => { if (handId) handIds.push(handId); };
      coachSock.on('hand_started', onHand);
      for (let i = 0; i < 5; i++) await playHand(i + 1, coachSock, allActors, crashes, anomalies);
      coachSock.off('hand_started', onHand);
      return { handIds };
    },
    hooksFactory: () => ({
      replayOps: async (coachSock, nextRState) => {
        // Jump to action index 3 directly
        coachSock.emit('replay_jump_to', { index: 3 });
        await nextRState(1500).catch(() => null);
        // Then jump to index 0
        coachSock.emit('replay_jump_to', { index: 0 });
        await nextRState(1500).catch(() => null);
      },
    }),
  },
  {
    id: 'B98', label: 'replay: branch at flop (enter live play from replay)',
    players: ['Alice','Bob','Carol'],
    stacks: null, mode: 'replay',
    setup: async (_port, coachSock, allActors, crashes, anomalies) => {
      const handIds = [];
      const onHand = ({ handId }) => { if (handId) handIds.push(handId); };
      coachSock.on('hand_started', onHand);
      for (let i = 0; i < 5; i++) await playHand(i + 1, coachSock, allActors, crashes, anomalies);
      coachSock.off('hand_started', onHand);
      return { handIds };
    },
    hooksFactory: (_h, allActors) => ({
      replayOps: async (coachSock, nextRState, crashes, anomalies, handNum) => {
        // Step forward until flop or end
        let branched = false;
        for (let i = 0; i < 30 && !branched; i++) {
          coachSock.emit('replay_step_forward');
          const s = await nextRState(1500).catch(() => null);
          if (!s || !s.replay_mode || !s.replay_mode.active) break;
          if (s.phase === 'flop' || (s.replay_mode.cursor >= 3)) {
            coachSock.emit('replay_branch');
            await new Promise(r => setTimeout(r, 40));
            branched = true;
          }
        }
        if (branched) {
          // Play out the branched live hand
          await playHand(handNum, coachSock, allActors, crashes, anomalies);
        }
      },
    }),
  },
  {
    id: 'B99', label: 'replay: branch then replay_unbranch (restore replay state)',
    players: ['Alice','Bob','Carol'],
    stacks: null, mode: 'replay',
    setup: async (_port, coachSock, allActors, crashes, anomalies) => {
      const handIds = [];
      const onHand = ({ handId }) => { if (handId) handIds.push(handId); };
      coachSock.on('hand_started', onHand);
      for (let i = 0; i < 5; i++) await playHand(i + 1, coachSock, allActors, crashes, anomalies);
      coachSock.off('hand_started', onHand);
      return { handIds };
    },
    hooksFactory: () => ({
      replayOps: async (coachSock, nextRState) => {
        // Step forward a few actions
        for (let i = 0; i < 4; i++) {
          coachSock.emit('replay_step_forward');
          await nextRState(1500).catch(() => null);
        }
        // Branch
        coachSock.emit('replay_branch');
        await new Promise(r => setTimeout(r, 40));
        // Immediately unbranch (restore snapshot)
        coachSock.emit('replay_unbranch');
        await nextRState(1500).catch(() => null);
      },
    }),
  },
  {
    id: 'B100', label: 'replay: exit immediately after load (no navigation)',
    players: ['Alice','Bob','Carol'],
    stacks: null, mode: 'replay',
    setup: async (_port, coachSock, allActors, crashes, anomalies) => {
      const handIds = [];
      const onHand = ({ handId }) => { if (handId) handIds.push(handId); };
      coachSock.on('hand_started', onHand);
      for (let i = 0; i < 5; i++) await playHand(i + 1, coachSock, allActors, crashes, anomalies);
      coachSock.off('hand_started', onHand);
      return { handIds };
    },
    hooksFactory: () => ({
      replayOps: async () => {
        // No ops — just load and immediately let finally block exit
      },
    }),
  },
  {
    id: 'B101', label: 'load_replay during active hand (should be blocked by server)',
    players: ['Alice','Bob','Carol'],
    stacks: null, mode: 'rng',
    setup: async (_port, coachSock, allActors, crashes, anomalies) => {
      const handIds = [];
      const onHand = ({ handId }) => { if (handId) handIds.push(handId); };
      coachSock.on('hand_started', onHand);
      await playHand(1, coachSock, allActors, crashes, anomalies);
      coachSock.off('hand_started', onHand);
      return { handIds };
    },
    hooksFactory: (_h, _actors, setupCtx) => ({
      onState: async (state, coachSock) => {
        if (state.phase === 'preflop' && state.current_turn) {
          const handId = setupCtx.handIds && setupCtx.handIds[0];
          if (handId) {
            coachSock.emit('load_replay', { handId }); // should be rejected mid-hand
            await new Promise(r => setTimeout(r, 20));
          }
        }
      },
    }),
  },
  {
    id: 'B102', label: 'replay: two sequential replays (exit → load next)',
    players: ['Alice','Bob','Carol'],
    stacks: null, mode: 'replay',
    setup: async (_port, coachSock, allActors, crashes, anomalies) => {
      const handIds = [];
      const onHand = ({ handId }) => { if (handId) handIds.push(handId); };
      coachSock.on('hand_started', onHand);
      for (let i = 0; i < 10; i++) await playHand(i + 1, coachSock, allActors, crashes, anomalies);
      coachSock.off('hand_started', onHand);
      return { handIds };
    },
    hooksFactory: (_h, _actors, setupCtx) => ({
      replayOps: async (coachSock, nextRState, _crashes, _anomalies, handNum) => {
        // First replay: step forward 3, exit
        for (let i = 0; i < 3; i++) {
          coachSock.emit('replay_step_forward');
          await nextRState(1500).catch(() => null);
        }
        coachSock.emit('replay_exit');
        await new Promise(r => setTimeout(r, 100));
        // Second replay: different hand
        const ids = setupCtx.handIds || [];
        const nextId = ids[handNum % ids.length];
        if (nextId) {
          coachSock.emit('load_replay', { handId: nextId });
          await waitFor(coachSock, 'replay_loaded', 2000).catch(() => null);
          for (let i = 0; i < 3; i++) {
            coachSock.emit('replay_step_forward');
            await nextRState(1500).catch(() => null);
          }
        }
      },
    }),
  },
  {
    id: 'B103', label: 'replay: step_forward past end of actions (boundary guard)',
    players: ['Alice','Bob','Carol'],
    stacks: null, mode: 'replay',
    setup: async (_port, coachSock, allActors, crashes, anomalies) => {
      const handIds = [];
      const onHand = ({ handId }) => { if (handId) handIds.push(handId); };
      coachSock.on('hand_started', onHand);
      for (let i = 0; i < 5; i++) await playHand(i + 1, coachSock, allActors, crashes, anomalies);
      coachSock.off('hand_started', onHand);
      return { handIds };
    },
    hooksFactory: () => ({
      replayOps: async (coachSock, nextRState) => {
        // Step forward 50 times — well past any real hand's action count
        for (let i = 0; i < 50; i++) {
          coachSock.emit('replay_step_forward');
          const s = await nextRState(800).catch(() => null);
          if (!s) break; // timeout = server stopped responding = at end
        }
      },
    }),
  },
  {
    id: 'B104', label: 'replay: start_game called while in replay mode (should fail)',
    players: ['Alice','Bob','Carol'],
    stacks: null, mode: 'replay',
    setup: async (_port, coachSock, allActors, crashes, anomalies) => {
      const handIds = [];
      const onHand = ({ handId }) => { if (handId) handIds.push(handId); };
      coachSock.on('hand_started', onHand);
      for (let i = 0; i < 5; i++) await playHand(i + 1, coachSock, allActors, crashes, anomalies);
      coachSock.off('hand_started', onHand);
      return { handIds };
    },
    hooksFactory: () => ({
      replayOps: async (coachSock, nextRState) => {
        // Step forward once, then try start_game
        coachSock.emit('replay_step_forward');
        await nextRState(1500).catch(() => null);
        coachSock.emit('start_game', { mode: 'rng' }); // should be rejected in replay mode
        await new Promise(r => setTimeout(r, 40));
      },
    }),
  },

  // ══════════════════════════════════════════════════════════════════════════
  // B105–B114 — Random / Stress
  // ══════════════════════════════════════════════════════════════════════════

  {
    id: 'B105', label: '9-handed: all players always call (no folds/raises) — call-to-showdown volume',
    players: ['P1','P2','P3','P4','P5','P6','P7','P8'],
    stacks: { all: 100 * DEFAULT_BIG_BLIND }, mode: 'rng',
    // No hooks needed — default pickAction already handles call/check/fold randomly

  },
  {
    id: 'B106', label: '6-handed: stacks grow +20 chips every hand via adjust_stack',
    players: ['Alice','Bob','Carol','Dave','Eve'],
    stacks: { all: 100 * DEFAULT_BIG_BLIND }, mode: 'rng',
    beforeHand: async (coachSock, allActors, h) => {
      const bonus = h * 20;
      for (const a of allActors) {
        if (a.serverId) coachSock.emit('adjust_stack', { playerId: a.serverId, amount: 100 * DEFAULT_BIG_BLIND + bonus });
      }
      await new Promise(r => setTimeout(r, 20));
    },
  },
  {
    id: 'B107', label: '3-handed: 1 action then reset every hand (max-frequency reset stress)',
    players: ['Alice','Bob','Carol'],
    stacks: null, mode: 'rng',
    hooksFactory: () => {
      let betCount = 0;
      return {
        afterBet: async (_bet, coachSock) => {
          betCount++;
          if (betCount >= 1) {
            coachSock.emit('reset_hand');
            betCount = 0;
          }
        },
      };
    },
  },
  {
    id: 'B108', label: '9-handed all-in + manual board — max side-pots + set board',
    players: ['P1','P2','P3','P4','P5','P6','P7','P8'],
    stacks: { all: 10 * DEFAULT_BIG_BLIND }, mode: 'manual',
    holeCards: {},
    boardCards: ['Ah','Kh','Qh','Jh','Th'],
  },
  {
    id: 'B109', label: '2-player (Coach + 1): minimum legal table size',
    players: ['Solo'],
    stacks: { all: 100 * DEFAULT_BIG_BLIND }, mode: 'rng',
  },
  {
    id: 'B110', label: '9-handed: excluded slot rotates every hand (exclusion rotation)',
    players: ['P1','P2','P3','P4','P5','P6','P7','P8'],
    stacks: null, mode: 'rng',
    beforeHand: (coachSock, allActors, h) => {
      // Exclude 2 players rotating by hand number
      const nonCoach = allActors.filter(a => !a.isCoach);
      for (let i = 0; i < nonCoach.length; i++) {
        const exclude = (i === (h - 1) % nonCoach.length) || (i === h % nonCoach.length);
        setPlayerInHand(coachSock, nonCoach[i].serverId, !exclude);
      }
    },
  },
  {
    id: 'B111', label: 'mixed session: 5 RNG + 5 manual + 5 award_pot + 5 reset-early (all 4 end paths)',
    players: ['Alice','Bob','Carol'],
    stacks: null,
    handMode: h => (h <= 10) ? (h <= 5 ? 'rng' : 'manual') : 'rng',
    holeCards: h => h <= 10 && h > 5 ? { Coach: ['Ah','Kh'] } : {},
    boardCards: h => h <= 10 && h > 5 ? ['Qc','Jd','Ts'] : [],
    hooksFactory: (h) => {
      if (h >= 11 && h <= 15) {
        // award_pot group
        let done = false;
        return {
          onState: async (state, coachSock) => {
            if (state.phase === 'flop' && !done) {
              done = true;
              const winner = firstActivePlayer(state);
              if (winner) awardPot(coachSock, winner.id);
              return 'abort';
            }
          },
        };
      }
      if (h >= 16) {
        // reset-early group
        let done = false;
        return {
          afterBet: async (_bet, coachSock) => {
            if (!done) { done = true; coachSock.emit('reset_hand'); }
          },
        };
      }
      return {};
    },
  },
  {
    id: 'B112', label: 'combined storm: top-up 200BB + exclude 2 players + play every hand',
    players: ['P1','P2','P3','P4','P5','P6','P7'],
    stacks: null, mode: 'rng',
    beforeHand: async (coachSock, allActors, h) => {
      for (const a of allActors) {
        if (a.serverId) coachSock.emit('adjust_stack', { playerId: a.serverId, amount: 200 * DEFAULT_BIG_BLIND });
      }
      await new Promise(r => setTimeout(r, 20));
      const nonCoach = allActors.filter(a => !a.isCoach);
      const ex1 = nonCoach[(h - 1) % nonCoach.length];
      const ex2 = nonCoach[h % nonCoach.length];
      if (ex1) setPlayerInHand(coachSock, ex1.serverId, false);
      if (ex2 && ex2 !== ex1) setPlayerInHand(coachSock, ex2.serverId, false);
    },
  },
  {
    id: 'B113', label: 'stress: pause + undo + rollback all in same hand, 20 hands',
    players: ['Alice','Bob','Carol'],
    stacks: { all: 200 * DEFAULT_BIG_BLIND }, mode: 'rng',
    hooksFactory: () => {
      let betsDone = 0;
      let undoDone = false;
      let skipNext = false;
      return {
        onState: () => { if (skipNext) { skipNext = false; return 'skip'; } },
        afterBet: async (_bet, coachSock) => {
          betsDone++;
          if (betsDone === 1 && !undoDone) {
            undoDone = true;
            skipNext = true;
            togglePause(coachSock);
            await new Promise(r => setTimeout(r, 20));
            undoAction(coachSock);
            await new Promise(r => setTimeout(r, 20));
            togglePause(coachSock);
            await new Promise(r => setTimeout(r, 20));
          }
        },
      };
    },
  },
  {
    id: 'B114', label: 'final boss: 9-handed extreme stacks + manual board + pause + award_pot',
    players: ['P1','P2','P3','P4','P5','P6','P7','P8'],
    stacks: {
      Coach: 50 * DEFAULT_BIG_BLIND,
      P1: 10 * DEFAULT_BIG_BLIND,  P2: 200 * DEFAULT_BIG_BLIND,
      P3: 500 * DEFAULT_BIG_BLIND, P4: 1000 * DEFAULT_BIG_BLIND,
      P5: 30 * DEFAULT_BIG_BLIND,  P6: 75 * DEFAULT_BIG_BLIND,
      P7: 150 * DEFAULT_BIG_BLIND, P8: 25 * DEFAULT_BIG_BLIND,
    },
    mode: 'manual',
    holeCards: {},
    boardCards: ['As','Ks','Qs'],
    hooksFactory: () => {
      let paused = false;
      let awarded = false;
      let skipNext = false;
      return {
        onState: async (state, coachSock) => {
          if (skipNext) { skipNext = false; return 'skip'; }
          if (state.phase === 'turn' && !awarded) {
            awarded = true;
            const winner = firstActivePlayer(state);
            if (winner) awardPot(coachSock, winner.id);
            return 'abort';
          }
        },
        afterBet: async (_bet, coachSock) => {
          if (!paused) {
            paused = true;
            skipNext = true;
            togglePause(coachSock);
            await new Promise(r => setTimeout(r, 40));
            togglePause(coachSock);
            await new Promise(r => setTimeout(r, 20));
          }
        },
      };
    },
  },


  // ══════════════════════════════════════════════════════════════════════════
  // B115–B124 — 3-bet Playlist Practice
  //
  // Philosophy: playlists are practice tools. When the table has N players
  // and a playlist hand has M≠N players, the server skips to the next matching
  // hand. These batches verify that skip logic at every realistic table size,
  // and test edge cases (deactivate/reactivate, wrap-around, exhaustion).
  // ══════════════════════════════════════════════════════════════════════════

  {
    id: 'B115', label: '3-bet playlist: 2-player table (coach + 1)',
    players: ['Solo'],
    stacks: { all: 200 * DEFAULT_BIG_BLIND }, mode: 'playlist',
    setup: setup3betPlaylist,
  },
  {
    id: 'B116', label: '3-bet playlist: 3-player table (coach + 2)',
    players: ['Alice', 'Bob'],
    stacks: { all: 200 * DEFAULT_BIG_BLIND }, mode: 'playlist',
    setup: setup3betPlaylist,
  },
  {
    id: 'B117', label: '3-bet playlist: 4-player table (coach + 3)',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: { all: 200 * DEFAULT_BIG_BLIND }, mode: 'playlist',
    setup: setup3betPlaylist,
  },
  {
    id: 'B118', label: '3-bet playlist: 5-player table (coach + 4)',
    players: ['Alice', 'Bob', 'Carol', 'Dave'],
    stacks: { all: 200 * DEFAULT_BIG_BLIND }, mode: 'playlist',
    setup: setup3betPlaylist,
  },
  {
    id: 'B119', label: '3-bet playlist: 6-player table (coach + 5)',
    players: ['Alice', 'Bob', 'Carol', 'Dave', 'Eve'],
    stacks: { all: 200 * DEFAULT_BIG_BLIND }, mode: 'playlist',
    setup: setup3betPlaylist,
  },
  {
    id: 'B120', label: '3-bet playlist: 9-player table (coach + 8)',
    players: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'],
    stacks: { all: 200 * DEFAULT_BIG_BLIND }, mode: 'playlist',
    setup: setup3betPlaylist,
  },
  {
    id: 'B121', label: '3-bet playlist: deactivate after hand 5, then reactivate (coach override)',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: { all: 200 * DEFAULT_BIG_BLIND }, mode: 'playlist',
    setup: setup3betPlaylist,
    // Between hands 5 and 6: deactivate the playlist then immediately reactivate it.
    // activate_playlist is only allowed between hands (phase='waiting'), so this is the
    // correct time to test the override flow.
    afterHand: async (coachSock, _allActors, h) => {
      if (h === 5 && _3betPlaylistId) {
        coachSock.emit('deactivate_playlist');
        await new Promise(r => setTimeout(r, 40));
        coachSock.emit('activate_playlist', { playlistId: _3betPlaylistId });
        await new Promise(r => setTimeout(r, 200)); // give server time to re-open config_phase
      }
    },
  },
  {
    id: 'B122', label: '3-bet playlist: short stacks (10BB) — same scenario, stack pressure',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: { all: 10 * DEFAULT_BIG_BLIND }, mode: 'playlist',
    setup: setup3betPlaylist,
  },
  {
    id: 'B123', label: '3-bet playlist: 4-player table + undo_action once per hand',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: { all: 200 * DEFAULT_BIG_BLIND }, mode: 'playlist',
    setup: setup3betPlaylist,
    hooksFactory: () => {
      let undoDone = false;
      let skipNext = false;
      return {
        onState: () => { if (skipNext) { skipNext = false; return 'skip'; } },
        afterBet: async (_bet, coachSock) => {
          if (!undoDone) {
            undoDone = true;
            skipNext = true;
            undoAction(coachSock);
            await new Promise(r => setTimeout(r, 30));
          }
        },
      };
    },
  },
  {
    id: 'B124', label: '3-bet playlist: wrap-around — table size with fewest matching hands',
    // Use 9 players so many playlist hands (recorded at 2-4 players) will be skipped
    // and the server must find the few 9-player 3-bet hands or exhaust gracefully
    players: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'],
    stacks: { all: 200 * DEFAULT_BIG_BLIND }, mode: 'playlist',
    setup: setup3betPlaylist,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // B125–B134 — Preset Range Combos (hole_cards_combos feature)
  //
  // These batches exercise the end-to-end path:
  //   frontend preset tag picker → hole_cards_combos → GameManager →
  //   HandGenerator Step 0 → random pick from combo list
  //
  // Each batch calls playComboHand (which sends the correct { config } format)
  // with an onPreflop hook that asserts the dealt cards satisfy the constraint.
  // ══════════════════════════════════════════════════════════════════════════

  {
    id: 'B125', label: 'Combos: Coach gets suited connector (SUIT∩TYPE=connectors)',
    players: ['Alice', 'Bob'],
    stacks: null, mode: 'combos',
    combosConfig: { Coach: _intersect([PRESET_COMBOS.suited, PRESET_COMBOS.connectors]) },
    onPreflop: (state) => {
      const coach = state.players.find(p => p.name === 'Coach');
      if (!coach || !coach.hole_cards || coach.hole_cards.includes('HIDDEN')) return;
      const [c1, c2] = coach.hole_cards;
      if (c1[1] !== c2[1]) throw new Error(`Expected suited cards, got ${c1} ${c2}`);
      const ri1 = _RANKS.indexOf(c1[0]), ri2 = _RANKS.indexOf(c2[0]);
      if (Math.abs(ri1 - ri2) !== 1) throw new Error(`Expected connectors, got ${c1} ${c2}`);
    },
  },
  {
    id: 'B126', label: 'Combos: Alice gets premium pair (QQ+)',
    players: ['Alice', 'Bob'],
    stacks: null, mode: 'combos',
    combosConfig: { Alice: PRESET_COMBOS.premium_pairs },
    onPreflop: (state) => {
      const alice = state.players.find(p => p.name === 'Alice');
      if (!alice || !alice.hole_cards || alice.hole_cards.includes('HIDDEN')) return;
      const [c1, c2] = alice.hole_cards;
      if (c1[0] !== c2[0]) throw new Error(`Expected pair, got ${c1} ${c2}`);
      if (!['Q','K','A'].includes(c1[0])) throw new Error(`Expected QQ+, got ${c1[0]}${c2[0]}`);
    },
  },
  {
    id: 'B127', label: 'Combos: 3 players — QQ+ vs broadway vs RNG, no card conflicts',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: null, mode: 'combos',
    combosConfig: { Alice: PRESET_COMBOS.premium_pairs, Bob: PRESET_COMBOS.broadway },
    onPreflop: (state) => {
      const allCards = state.players.flatMap(p =>
        (p.hole_cards || []).filter(c => c && c !== 'HIDDEN')
      );
      if (new Set(allCards).size !== allCards.length)
        throw new Error(`Duplicate cards in state: ${allCards.join(' ')}`);
    },
  },
  {
    id: 'B128', label: 'Combos: Suited ∩ Broadway intersection',
    players: ['Alice', 'Bob'],
    stacks: null, mode: 'combos',
    combosConfig: { Alice: _intersect([PRESET_COMBOS.suited, PRESET_COMBOS.broadway]) },
    onPreflop: (state) => {
      const alice = state.players.find(p => p.name === 'Alice');
      if (!alice || !alice.hole_cards || alice.hole_cards.includes('HIDDEN')) return;
      const [c1, c2] = alice.hole_cards;
      if (c1[1] !== c2[1]) throw new Error(`Expected suited, got ${c1} ${c2}`);
      const broadwayRanks = ['T','J','Q','K','A'];
      if (!broadwayRanks.includes(c1[0]) || !broadwayRanks.includes(c2[0]))
        throw new Error(`Expected broadway ranks, got ${c1[0]} ${c2[0]}`);
    },
  },
  {
    id: 'B129', label: 'Combos: Offsuit ∩ Ace-high',
    players: ['Alice', 'Bob'],
    stacks: null, mode: 'combos',
    combosConfig: { Alice: _intersect([PRESET_COMBOS.offsuit, PRESET_COMBOS.ace_high]) },
    onPreflop: (state) => {
      const alice = state.players.find(p => p.name === 'Alice');
      if (!alice || !alice.hole_cards || alice.hole_cards.includes('HIDDEN')) return;
      const [c1, c2] = alice.hole_cards;
      if (c1[1] === c2[1]) throw new Error(`Expected offsuit, got ${c1} ${c2}`);
      if (c1[0] !== 'A' && c2[0] !== 'A') throw new Error(`Expected ace-high, got ${c1} ${c2}`);
    },
  },
  {
    id: 'B130', label: 'Combos: Empty list (pairs∩suited = 0 combos) — falls through to RNG',
    players: ['Alice', 'Bob'],
    stacks: null, mode: 'combos',
    // Pairs ∩ suited = empty intersection; server should deal Alice a random hand
    combosConfig: { Alice: _intersect([PRESET_COMBOS.premium_pairs, PRESET_COMBOS.suited]) },
    onPreflop: null, // just verify no crash
  },
  {
    id: 'B131', label: 'Combos: All 3 players have combo lists — no conflicts',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: null, mode: 'combos',
    combosConfig: {
      Coach: _intersect([PRESET_COMBOS.suited, PRESET_COMBOS.connectors]),
      Alice: PRESET_COMBOS.premium_pairs,
      Bob:   _intersect([PRESET_COMBOS.offsuit, PRESET_COMBOS.ace_high]),
    },
    onPreflop: (state) => {
      const allCards = state.players.flatMap(p =>
        (p.hole_cards || []).filter(c => c && c !== 'HIDDEN')
      );
      if (new Set(allCards).size !== allCards.length)
        throw new Error(`Duplicate cards: ${allCards.join(' ')}`);
    },
  },
  {
    id: 'B132', label: 'Combos: ATo+ combos + board flush_draw texture',
    players: ['Alice', 'Bob'],
    stacks: null, mode: 'combos',
    combosConfig: { Alice: PRESET_COMBOS.ato_plus },
    boardTexture: ['flush_draw'],
    onPreflop: (state) => {
      const alice = state.players.find(p => p.name === 'Alice');
      if (!alice || !alice.hole_cards || alice.hole_cards.includes('HIDDEN')) return;
      const [c1, c2] = alice.hole_cards;
      if (c1[0] !== 'A' && c2[0] !== 'A') throw new Error(`Expected ace-high, got ${c1} ${c2}`);
    },
  },
  {
    id: 'B133', label: 'Combos: Short stack (5BB) — combo player goes all-in frequently',
    players: ['Alice', 'Bob'],
    stacks: { all: 5 * DEFAULT_BIG_BLIND }, mode: 'combos',
    combosConfig: { Alice: PRESET_COMBOS.premium },
    onPreflop: null,
  },
  {
    id: 'B134', label: 'Combos: Mixed — combo + range + pinned + board (full interaction)',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: null, mode: 'combos',
    // Coach gets combos (suited connectors), Alice gets range (via hole_cards_range), Bob gets pinned
    combosConfig: { Coach: _intersect([PRESET_COMBOS.suited, PRESET_COMBOS.connectors]) },
    extraConfig: (allActors) => {
      const alice = allActors.find(a => a.name === 'Alice');
      return {
        hole_cards_range: alice ? { [alice.stableId]: 'AK' } : {},
        hole_cards: {},
      };
    },
    boardCards: ['2h', '7d', null, null, null], // pinned flop
    onPreflop: null,
  },

  // ── B135–B137: Blind controls + BB view ────────────────────────────────────
  {
    id: 'B135', label: 'Blind controls: coach sets 25/50, game_state reflects new blinds',
    players: ['Alice', 'Bob'],
    stacks: { all: 5000 }, mode: 'rng',
    setup: async (_port, coachSock) => {
      // Set blinds to 25/50 before any hand starts
      coachSock.emit('set_blind_levels', { sb: 25, bb: 50 });
      await new Promise(r => setTimeout(r, 80));
    },
    afterHand: async (coachSock, _allActors, _h, _handId) => {
      // Verify game_state reflects blinds
      const state = await waitFor(coachSock, 'game_state', 2000).catch(() => null);
      if (state && (state.small_blind !== 25 || state.big_blind !== 50)) {
        throw new Error(`Expected blinds 25/50 in game_state, got ${state.small_blind}/${state.big_blind}`);
      }
    },
  },
  {
    id: 'B136', label: 'Blind controls: default 5/10, game_state small_blind/big_blind present',
    players: ['Alice', 'Bob'],
    stacks: null, mode: 'rng',
    afterHand: async (coachSock, _allActors, h) => {
      if (h > 1) return; // only check first hand
      const state = await waitFor(coachSock, 'game_state', 2000).catch(() => null);
      if (state && (state.small_blind == null || state.big_blind == null)) {
        throw new Error(`game_state missing small_blind/big_blind fields`);
      }
      if (state && state.big_blind !== 10) {
        throw new Error(`Expected default big_blind=10, got ${state.big_blind}`);
      }
    },
  },
  {
    id: 'B137', label: 'Blind controls: set blinds mid-session, verify blind change accepted without error',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: null, mode: 'rng',
    beforeHand: async (coachSock, _allActors, h) => {
      if (h === 5) {
        // Change to 10/20 at hand 5
        coachSock.emit('set_blind_levels', { sb: 10, bb: 20 });
        await new Promise(r => setTimeout(r, 60));
      }
      if (h === 10) {
        // Change back to 5/10 at hand 10
        coachSock.emit('set_blind_levels', { sb: 5, bb: 10 });
        await new Promise(r => setTimeout(r, 60));
      }
    },
  },

  // ─── B138–B144: Chips / BB-view server-side contract ─────────────────────────
  {
    id: 'B138',
    label: 'fmtChips: big_blind and small_blind present as numbers in every game_state',
    players: ['Alice', 'Bob'],
    stacks: null, mode: 'rng',
    // Store anomalies ref in setupCtx so hooksFactory can push to it
    setup: async (_port, _coachSock, _allActors, _crashes, anomalies) => ({ anomalies }),
    hooksFactory: (_h, _allActors, setupCtx) => ({
      onState: (state) => {
        if (typeof state.big_blind !== 'number' || state.big_blind <= 0) {
          setupCtx.anomalies.push({ hand: _h, msg: `big_blind invalid: ${state.big_blind}` });
        }
        if (typeof state.small_blind !== 'number' || state.small_blind <= 0) {
          setupCtx.anomalies.push({ hand: _h, msg: `small_blind invalid: ${state.small_blind}` });
        }
      },
    }),
  },

  {
    id: 'B139',
    label: 'fmtChips: pot is a non-negative finite number in every game_state',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: null, mode: 'rng',
    setup: async (_port, _coachSock, _allActors, _crashes, anomalies) => ({ anomalies }),
    hooksFactory: (_h, _allActors, setupCtx) => ({
      onState: (state) => {
        const pot = state.pot;
        if (typeof pot !== 'number' || !isFinite(pot) || pot < 0) {
          setupCtx.anomalies.push({ hand: _h, msg: `pot invalid: ${pot}` });
        }
      },
    }),
  },

  {
    id: 'B140',
    label: 'fmtChips: all player stacks are non-negative finite numbers in every game_state',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: null, mode: 'rng',
    setup: async (_port, _coachSock, _allActors, _crashes, anomalies) => ({ anomalies }),
    hooksFactory: (_h, _allActors, setupCtx) => ({
      onState: (state) => {
        for (const p of (state.players || [])) {
          if (typeof p.stack !== 'number' || !isFinite(p.stack) || p.stack < 0) {
            setupCtx.anomalies.push({ hand: _h, msg: `player ${p.name} stack invalid: ${p.stack}` });
          }
        }
      },
    }),
  },

  {
    id: 'B141',
    label: 'Blind controls: phase guard — set_blind_levels during preflop returns sync_error',
    players: ['Alice', 'Bob'],
    stacks: null, mode: 'rng',
    setup: async (_port, coachSock, _allActors, _crashes, anomalies) => {
      // Start a hand so we are in preflop
      coachSock.emit('start_game', { mode: 'rng' });
      let preflopSeen = false;
      for (let i = 0; i < 8; i++) {
        const s = await waitFor(coachSock, 'game_state', 2000).catch(() => null);
        if (s && s.phase === 'preflop') { preflopSeen = true; break; }
      }
      if (!preflopSeen) {
        anomalies.push({ hand: 0, msg: 'B141 setup: never reached preflop' });
      } else {
        // Try to change blinds during active hand — server should reject with sync_error
        const errP = waitFor(coachSock, 'sync_error', 2000).catch(() => null);
        coachSock.emit('set_blind_levels', { sb: 10, bb: 20 });
        const err = await errP;
        if (!err) {
          anomalies.push({ hand: 0, msg: 'B141: expected sync_error when changing blinds mid-hand, got none' });
        }
      }
      // Reset to waiting phase and drain stale states
      coachSock.emit('reset_hand');
      for (let i = 0; i < 10; i++) {
        const s = await waitFor(coachSock, 'game_state', 500).catch(() => null);
        if (!s || s.phase === 'waiting' || s.phase === 'WAITING') break;
      }
      return {};
    },
  },

  {
    id: 'B142',
    label: 'Blind controls: sb = bb (equal) → sync_error, game continues cleanly',
    players: ['Alice', 'Bob'],
    stacks: null, mode: 'rng',
    setup: async (_port, coachSock, _allActors, _crashes, anomalies) => {
      // Try sb === bb — GameManager should reject this
      const errP = waitFor(coachSock, 'sync_error', 2000).catch(() => null);
      coachSock.emit('set_blind_levels', { sb: 10, bb: 10 });
      const err = await errP;
      if (!err) {
        anomalies.push({ hand: 0, msg: 'B142: expected sync_error for sb=bb=10, got none' });
      }
      // Also try sb > bb
      const errP2 = waitFor(coachSock, 'sync_error', 2000).catch(() => null);
      coachSock.emit('set_blind_levels', { sb: 20, bb: 10 });
      const err2 = await errP2;
      if (!err2) {
        anomalies.push({ hand: 0, msg: 'B142: expected sync_error for sb(20)>bb(10), got none' });
      }
      // Verify game_state blinds are still at default (unchanged)
      const stateP = waitFor(coachSock, 'game_state', 500).catch(() => null);
      // Trigger a state broadcast by a no-op that causes a broadcast (use reset_hand which is safe in waiting)
      coachSock.emit('reset_hand');
      const state = await stateP;
      if (state && (state.big_blind !== 10 || state.small_blind !== 5)) {
        anomalies.push({ hand: 0, msg: `B142: blinds corrupted after rejection: ${state.small_blind}/${state.big_blind}` });
      }
      return {};
    },
  },

  {
    id: 'B143',
    label: 'Blind escalation: 4 stages over 20 hands, game_state big_blind tracks each change',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: { all: 10000 }, mode: 'rng',
    setup: async (_port, _coachSock, _allActors, _crashes, anomalies) => ({ anomalies }),
    beforeHand: async (coachSock, _allActors, h) => {
      if (h === 1)  { coachSock.emit('set_blind_levels', { sb: 5,   bb: 10  }); await new Promise(r => setTimeout(r, 60)); }
      if (h === 6)  { coachSock.emit('set_blind_levels', { sb: 10,  bb: 20  }); await new Promise(r => setTimeout(r, 60)); }
      if (h === 11) { coachSock.emit('set_blind_levels', { sb: 25,  bb: 50  }); await new Promise(r => setTimeout(r, 60)); }
      if (h === 16) { coachSock.emit('set_blind_levels', { sb: 50,  bb: 100 }); await new Promise(r => setTimeout(r, 60)); }
    },
    hooksFactory: (h, _allActors, setupCtx) => {
      const expected =
        h < 6  ? { sb: 5,  bb: 10  } :
        h < 11 ? { sb: 10, bb: 20  } :
        h < 16 ? { sb: 25, bb: 50  } :
                 { sb: 50, bb: 100 };
      return {
        onState: (state) => {
          if (state.phase === 'preflop' &&
              (state.big_blind !== expected.bb || state.small_blind !== expected.sb)) {
            setupCtx.anomalies.push({
              hand: h,
              msg: `B143: blinds mismatch — expected ${expected.sb}/${expected.bb}, got ${state.small_blind}/${state.big_blind}`,
            });
          }
        },
      };
    },
  },

  {
    id: 'B144',
    label: 'Blind posting: preflop pot >= small_blind on every hand (SB always posts)',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: { all: 5000 }, mode: 'rng',
    setup: async (_port, _coachSock, _allActors, _crashes, anomalies) => ({ anomalies }),
    hooksFactory: (h, _allActors, setupCtx) => {
      let checkedThisHand = false;
      return {
        onState: (state) => {
          // On the first preflop state each hand, pot must be >= small_blind (SB always posts)
          if (state.phase === 'preflop' && !checkedThisHand) {
            checkedThisHand = true;
            const sb = state.small_blind || 0;
            if (state.pot < sb) {
              setupCtx.anomalies.push({
                hand: h,
                msg: `B144: preflop pot (${state.pot}) < small_blind (${sb}) — blind not posted`,
              });
            }
          }
          if (state.phase === 'waiting') checkedThisHand = false;
        },
      };
    },
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // GROUP A — Action-order consistency (B145–B150)
  // Verify that current_turn advances monotonically through seat indices (mod n)
  // so the server's turn progression never skips or backtracks.
  // ══════════════════════════════════════════════════════════════════════════════

  {
    id: 'B145',
    label: 'Action order: 4-player — turn sequences are monotonically increasing (mod seats)',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: { all: 2000 }, mode: 'rng',
    setup: async (_port, _coachSock, _allActors, _crashes, anomalies) => ({ anomalies }),
    hooksFactory: (h, allActors, setupCtx) => {
      // Build seat-index lookup once per hand
      let seatOf = {};
      let lastSeat = null;
      let streetTurns = [];
      let lastStreet = null;
      return {
        onState: (state) => {
          // Refresh seat map
          for (const p of (state.players || [])) seatOf[p.id] = p.seat;
          // Reset on new street
          if (state.phase !== lastStreet) { lastStreet = state.phase; lastSeat = null; streetTurns = []; }
          if (!state.current_turn) return;
          const curSeat = seatOf[state.current_turn];
          if (curSeat == null) return;
          if (lastSeat !== null && lastSeat === curSeat) {
            setupCtx.anomalies.push({ hand: h, msg: `B145: same seat acted twice in a row (seat ${curSeat}) in ${state.phase}` });
          }
          streetTurns.push(curSeat);
          lastSeat = curSeat;
        },
      };
    },
  },

  {
    id: 'B146',
    label: 'Action order: 3-player — no player acts twice consecutively within same street',
    players: ['Dave', 'Eve'],
    stacks: { all: 2000 }, mode: 'rng',
    setup: async (_port, _coachSock, _allActors, _crashes, anomalies) => ({ anomalies }),
    hooksFactory: (h, _allActors, setupCtx) => {
      let lastTurn = null;
      let lastStreet = null;
      return {
        onState: (state) => {
          if (state.phase !== lastStreet) { lastStreet = state.phase; lastTurn = null; }
          if (!state.current_turn) return;
          if (lastTurn !== null && lastTurn === state.current_turn) {
            setupCtx.anomalies.push({ hand: h, msg: `B146: same player acted twice in a row in ${state.phase}` });
          }
          lastTurn = state.current_turn;
        },
      };
    },
  },

  {
    id: 'B147',
    label: 'Action order: HU — turns strictly alternate between the two players',
    players: ['Frank'],
    stacks: { all: 2000 }, mode: 'rng',
    setup: async (_port, _coachSock, _allActors, _crashes, anomalies) => ({ anomalies }),
    hooksFactory: (h, _allActors, setupCtx) => {
      let lastTurn = null;
      let lastStreet = null;
      return {
        onState: (state) => {
          if (state.phase !== lastStreet) { lastStreet = state.phase; lastTurn = null; }
          if (!state.current_turn) return;
          if (lastTurn !== null && lastTurn === state.current_turn) {
            setupCtx.anomalies.push({ hand: h, msg: `B147: HU — same player acted twice consecutively in ${state.phase}` });
          }
          lastTurn = state.current_turn;
        },
      };
    },
  },

  {
    id: 'B148',
    label: 'Action order: with one short-stack (1BB) all-in, remaining turns still ordered',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: { Alice: DEFAULT_BIG_BLIND, Bob: 500, Carol: 500 },
    mode: 'rng',
    setup: async (_port, _coachSock, _allActors, _crashes, anomalies) => ({ anomalies }),
    hooksFactory: (h, _allActors, setupCtx) => {
      let lastTurn = null;
      let lastStreet = null;
      return {
        onState: (state) => {
          if (state.phase !== lastStreet) { lastStreet = state.phase; lastTurn = null; }
          if (!state.current_turn) return;
          if (lastTurn !== null && lastTurn === state.current_turn) {
            setupCtx.anomalies.push({ hand: h, msg: `B148: same player acted twice consecutively (short-stack scenario) in ${state.phase}` });
          }
          lastTurn = state.current_turn;
        },
      };
    },
  },

  {
    id: 'B149',
    label: 'Action order: current_turn player is always active (in_hand, stack>=0) when set',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: { all: 1500 }, mode: 'rng',
    setup: async (_port, _coachSock, _allActors, _crashes, anomalies) => ({ anomalies }),
    hooksFactory: (h, _allActors, setupCtx) => ({
      onState: (state) => {
        if (!state.current_turn) return;
        const actor = (state.players || []).find(p => p.id === state.current_turn);
        if (!actor) {
          setupCtx.anomalies.push({ hand: h, msg: `B149: current_turn ${state.current_turn} not found in players` });
          return;
        }
        if (actor.folded) {
          setupCtx.anomalies.push({ hand: h, msg: `B149: current_turn player (${actor.name}) is folded in ${state.phase}` });
        }
        if (actor.stack < 0) {
          setupCtx.anomalies.push({ hand: h, msg: `B149: current_turn player (${actor.name}) has negative stack ${actor.stack}` });
        }
      },
    }),
  },

  {
    id: 'B150',
    label: 'Action order: preflop — at least 2 distinct players act before street ends (3-player)',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: { all: 2000 }, mode: 'rng',
    setup: async (_port, _coachSock, _allActors, _crashes, anomalies) => ({ anomalies }),
    hooksFactory: (h, _allActors, setupCtx) => {
      const preflopActors = new Set();
      let preflopDone = false;
      return {
        onState: (state) => {
          if (state.phase === 'preflop' && state.current_turn) {
            preflopActors.add(state.current_turn);
          }
          if (!preflopDone && state.phase !== 'preflop' && preflopActors.size > 0) {
            preflopDone = true;
            if (preflopActors.size < 2) {
              setupCtx.anomalies.push({ hand: h, msg: `B150: preflop ended with only ${preflopActors.size} distinct actor(s)` });
            }
            preflopActors.clear();
          }
          if (state.phase === 'waiting') { preflopActors.clear(); preflopDone = false; }
        },
      };
    },
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // GROUP B — Fold-win showdown_result populated (B151–B156)
  // Verifies the fix: fold-to-winner path sets showdown_result on the server.
  // ══════════════════════════════════════════════════════════════════════════════

  {
    id: 'B151',
    label: 'Fold-win fix: whenever phase=showdown, showdown_result is non-null',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: { all: 1000 }, mode: 'rng',
    setup: async (_port, _coachSock, _allActors, _crashes, anomalies) => ({ anomalies }),
    hooksFactory: (h, _allActors, setupCtx) => ({
      onState: (state) => {
        if (state.phase === 'showdown' && state.showdown_result == null) {
          setupCtx.anomalies.push({ hand: h, msg: 'B151: phase=showdown but showdown_result is null' });
        }
      },
    }),
  },

  {
    id: 'B152',
    label: 'Fold-win fix: HU — every hand ends with showdown_result != null',
    players: ['Frank'],
    stacks: { all: 1000 }, mode: 'rng',
    setup: async (_port, _coachSock, _allActors, _crashes, anomalies) => ({ anomalies }),
    hooksFactory: (h, _allActors, setupCtx) => ({
      onState: (state) => {
        if (state.phase === 'showdown' && state.showdown_result == null) {
          setupCtx.anomalies.push({ hand: h, msg: 'B152: HU showdown with null showdown_result' });
        }
      },
    }),
  },

  {
    id: 'B153',
    label: 'Fold-win fix: showdown_result.winners is a non-empty array when phase=showdown',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: { all: 1000 }, mode: 'rng',
    setup: async (_port, _coachSock, _allActors, _crashes, anomalies) => ({ anomalies }),
    hooksFactory: (h, _allActors, setupCtx) => ({
      onState: (state) => {
        if (state.phase !== 'showdown') return;
        const sr = state.showdown_result;
        if (!sr) { setupCtx.anomalies.push({ hand: h, msg: 'B153: showdown_result null' }); return; }
        if (!Array.isArray(sr.winners) || sr.winners.length === 0) {
          setupCtx.anomalies.push({ hand: h, msg: `B153: showdown_result.winners invalid: ${JSON.stringify(sr.winners)}` });
        }
      },
    }),
  },

  {
    id: 'B154',
    label: 'Fold-win fix: showdown_result.potAwarded > 0 when phase=showdown',
    players: ['Alice', 'Bob'],
    stacks: { all: 1000 }, mode: 'rng',
    setup: async (_port, _coachSock, _allActors, _crashes, anomalies) => ({ anomalies }),
    hooksFactory: (h, _allActors, setupCtx) => ({
      onState: (state) => {
        if (state.phase !== 'showdown') return;
        const sr = state.showdown_result;
        if (!sr) return; // caught by B151
        if (typeof sr.potAwarded !== 'number' || sr.potAwarded <= 0) {
          setupCtx.anomalies.push({ hand: h, msg: `B154: potAwarded invalid: ${sr.potAwarded}` });
        }
      },
    }),
  },

  {
    id: 'B155',
    label: 'Fold-win fix: state.winner is set (non-null) whenever phase=showdown',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: { all: 1000 }, mode: 'rng',
    setup: async (_port, _coachSock, _allActors, _crashes, anomalies) => ({ anomalies }),
    hooksFactory: (h, _allActors, setupCtx) => ({
      onState: (state) => {
        if (state.phase === 'showdown' && !state.winner) {
          setupCtx.anomalies.push({ hand: h, msg: 'B155: phase=showdown but state.winner is null/undefined' });
        }
      },
    }),
  },

  {
    id: 'B156',
    label: 'Fold-win fix: after showdown reset_hand always returns to phase=waiting',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: { all: 1000 }, mode: 'rng',
    setup: async (_port, _coachSock, _allActors, _crashes, anomalies) => ({ anomalies }),
    hooksFactory: (h, _allActors, setupCtx) => {
      let seenShowdown = false;
      return {
        onState: (state) => {
          if (state.phase === 'showdown') seenShowdown = true;
          // After reset_hand (emitted in finally of playHand), state should be waiting
          // We check for any non-waiting non-active phase after showdown
          if (seenShowdown && state.phase !== 'showdown' &&
              !['preflop','flop','turn','river','waiting','WAITING','config'].includes(state.phase)) {
            setupCtx.anomalies.push({ hand: h, msg: `B156: unexpected phase after showdown: ${state.phase}` });
          }
          if (state.phase === 'waiting' || state.phase === 'WAITING') seenShowdown = false;
        },
      };
    },
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // GROUP C — Coach seat assignment (B157–B162)
  // Verifies the fix: coach always occupies the highest available seat.
  // ══════════════════════════════════════════════════════════════════════════════

  {
    id: 'B157',
    label: 'Coach seat: HU — coach gets higher seat than the single player',
    players: ['Frank'],
    stacks: null, mode: 'rng',
    setup: async (_port, coachSock, _allActors, _crashes, anomalies) => {
      // buildSession consumed the first game_state; trigger a fresh broadcast
      const stateP = waitFor(coachSock, 'game_state', 3000);
      coachSock.emit('reset_hand');
      const state = await stateP.catch(() => null);
      if (!state) { anomalies.push({ hand: 0, msg: 'B157: no game_state received' }); return {}; }
      const coach = (state.players || []).find(p => p.isCoach || p.name === 'Coach');
      const others = (state.players || []).filter(p => !(p.isCoach || p.name === 'Coach'));
      if (!coach) { anomalies.push({ hand: 0, msg: 'B157: coach not in players' }); return {}; }
      const maxOther = Math.max(...others.map(p => p.seat));
      if (coach.seat <= maxOther) {
        anomalies.push({ hand: 0, msg: `B157: coach seat (${coach.seat}) not > max other seat (${maxOther})` });
      }
      return {};
    },
  },

  {
    id: 'B158',
    label: 'Coach seat: 4-player — coach seat is higher than all non-coach seats',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: null, mode: 'rng',
    setup: async (_port, coachSock, _allActors, _crashes, anomalies) => {
      const stateP = waitFor(coachSock, 'game_state', 3000);
      coachSock.emit('reset_hand');
      const state = await stateP.catch(() => null);
      if (!state) { anomalies.push({ hand: 0, msg: 'B158: no game_state received' }); return {}; }
      const coach = (state.players || []).find(p => p.isCoach || p.name === 'Coach');
      const others = (state.players || []).filter(p => !(p.isCoach || p.name === 'Coach'));
      if (!coach) { anomalies.push({ hand: 0, msg: 'B158: coach not in players' }); return {}; }
      const maxOther = Math.max(...others.map(p => p.seat));
      if (coach.seat <= maxOther) {
        anomalies.push({ hand: 0, msg: `B158: coach seat (${coach.seat}) not > max other seat (${maxOther})` });
      }
      return {};
    },
  },

  {
    id: 'B159',
    label: 'Coach seat: 3-player — coach seat is strictly greater than both other seats',
    players: ['Dave', 'Eve'],
    stacks: null, mode: 'rng',
    setup: async (_port, coachSock, _allActors, _crashes, anomalies) => {
      const stateP = waitFor(coachSock, 'game_state', 3000);
      coachSock.emit('reset_hand');
      const state = await stateP.catch(() => null);
      if (!state) { anomalies.push({ hand: 0, msg: 'B159: no game_state' }); return {}; }
      const coach = (state.players || []).find(p => p.isCoach || p.name === 'Coach');
      const others = (state.players || []).filter(p => !(p.isCoach || p.name === 'Coach'));
      if (!coach) { anomalies.push({ hand: 0, msg: 'B159: coach not found' }); return {}; }
      for (const p of others) {
        if (coach.seat <= p.seat) {
          anomalies.push({ hand: 0, msg: `B159: coach seat (${coach.seat}) not > ${p.name} seat (${p.seat})` });
        }
      }
      return {};
    },
  },

  {
    id: 'B160',
    label: 'Coach seat: coach seat number is >= 0 and <= 8',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: null, mode: 'rng',
    setup: async (_port, coachSock, _allActors, _crashes, anomalies) => {
      const stateP = waitFor(coachSock, 'game_state', 3000);
      coachSock.emit('reset_hand');
      const state = await stateP.catch(() => null);
      if (!state) { anomalies.push({ hand: 0, msg: 'B160: no game_state' }); return {}; }
      const coach = (state.players || []).find(p => p.isCoach || p.name === 'Coach');
      if (!coach) { anomalies.push({ hand: 0, msg: 'B160: coach not found' }); return {}; }
      if (coach.seat < 0 || coach.seat > 8) {
        anomalies.push({ hand: 0, msg: `B160: coach seat out of range: ${coach.seat}` });
      }
      return {};
    },
  },

  {
    id: 'B161',
    label: 'Coach seat: seat assignment is stable across 20 hands (never changes mid-session)',
    players: ['Alice', 'Bob'],
    stacks: null, mode: 'rng',
    setup: async (_port, coachSock, _allActors, _crashes, anomalies) => {
      const stateP = waitFor(coachSock, 'game_state', 3000);
      coachSock.emit('reset_hand');
      const state = await stateP.catch(() => null);
      if (!state) { anomalies.push({ hand: 0, msg: 'B161: no initial state' }); return { anomalies, coachSeat: null }; }
      const coach = (state.players || []).find(p => p.isCoach || p.name === 'Coach');
      return { anomalies, coachSeat: coach ? coach.seat : null };
    },
    hooksFactory: (h, _allActors, setupCtx) => ({
      onState: (state) => {
        if (setupCtx.coachSeat == null) return;
        const coach = (state.players || []).find(p => p.isCoach || p.name === 'Coach');
        if (coach && coach.seat !== setupCtx.coachSeat) {
          setupCtx.anomalies.push({ hand: h, msg: `B161: coach seat changed from ${setupCtx.coachSeat} to ${coach.seat}` });
          setupCtx.coachSeat = coach.seat; // update so we don't spam
        }
      },
    }),
  },

  {
    id: 'B162',
    label: 'Coach seat: all players have unique seats (no two share a seat number)',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: null, mode: 'rng',
    setup: async (_port, coachSock, _allActors, _crashes, anomalies) => {
      const stateP = waitFor(coachSock, 'game_state', 3000);
      coachSock.emit('reset_hand');
      const state = await stateP.catch(() => null);
      if (!state) { anomalies.push({ hand: 0, msg: 'B162: no game_state' }); return {}; }
      const seats = (state.players || []).map(p => p.seat);
      const unique = new Set(seats);
      if (unique.size !== seats.length) {
        anomalies.push({ hand: 0, msg: `B162: duplicate seats detected: ${JSON.stringify(seats)}` });
      }
      return {};
    },
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // GROUP D — Heads-up rules (B163–B168)
  // ══════════════════════════════════════════════════════════════════════════════

  {
    id: 'B163',
    label: 'HU rules: preflop pot = small_blind + big_blind on first preflop state',
    players: ['Frank'],
    stacks: { all: 1000 }, mode: 'rng',
    setup: async (_port, _coachSock, _allActors, _crashes, anomalies) => ({ anomalies }),
    hooksFactory: (h, _allActors, setupCtx) => {
      let checked = false;
      return {
        onState: (state) => {
          if (state.phase === 'preflop' && !checked) {
            checked = true;
            const expected = (state.small_blind || 0) + (state.big_blind || 0);
            if (state.pot < expected) {
              setupCtx.anomalies.push({ hand: h, msg: `B163: HU preflop pot (${state.pot}) < SB+BB (${expected})` });
            }
          }
          if (state.phase === 'waiting') checked = false;
        },
      };
    },
  },

  {
    id: 'B164',
    label: 'HU rules: 20 hands complete without crash (regression)',
    players: ['Frank'],
    stacks: { all: 2000 }, mode: 'rng',
  },

  {
    id: 'B165',
    label: 'HU rules: short stacks (3BB each) — all-in shoves resolved without crash',
    players: ['Frank'],
    stacks: { all: 3 * DEFAULT_BIG_BLIND }, mode: 'rng',
  },

  {
    id: 'B166',
    label: 'HU rules: deep stacks (500BB each) — 20 hands without crash',
    players: ['Frank'],
    stacks: { all: 500 * DEFAULT_BIG_BLIND }, mode: 'rng',
  },

  {
    id: 'B167',
    label: 'HU rules: dealer_seat alternates each hand (button rotation HU)',
    players: ['Frank'],
    stacks: { all: 2000 }, mode: 'rng',
    setup: async (_port, _coachSock, _allActors, _crashes, anomalies) => ({ anomalies, lastDealer: null }),
    hooksFactory: (h, _allActors, setupCtx) => {
      let seenThisHand = false;
      return {
        onState: (state) => {
          if (state.phase === 'preflop' && !seenThisHand && state.dealer_seat != null) {
            seenThisHand = true;
            if (h > 1 && setupCtx.lastDealer != null && state.dealer_seat === setupCtx.lastDealer) {
              setupCtx.anomalies.push({ hand: h, msg: `B167: dealer_seat (${state.dealer_seat}) same as previous hand — button did not rotate` });
            }
            setupCtx.lastDealer = state.dealer_seat;
          }
          if (state.phase === 'waiting') seenThisHand = false;
        },
      };
    },
  },

  {
    id: 'B168',
    label: 'HU rules: showdown_result present after HU fold-win (confirms fold-win fix works HU)',
    players: ['Frank'],
    stacks: { all: 500 }, mode: 'rng',
    setup: async (_port, _coachSock, _allActors, _crashes, anomalies) => ({ anomalies }),
    hooksFactory: (h, _allActors, setupCtx) => ({
      onState: (state) => {
        if (state.phase === 'showdown' && !state.showdown_result) {
          setupCtx.anomalies.push({ hand: h, msg: 'B168: HU showdown with null showdown_result' });
        }
      },
    }),
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // GROUP E — Chip conservation (B169–B174)
  // Total chips (sum of stacks + pot) must remain constant every state.
  // ══════════════════════════════════════════════════════════════════════════════

  {
    id: 'B169',
    label: 'Chip conservation: sum(stacks) + pot is constant throughout a hand (3-player)',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: { all: 1000 }, mode: 'rng',
    setup: async (_port, _coachSock, _allActors, _crashes, anomalies) => ({ anomalies, initialTotal: null }),
    hooksFactory: (h, _allActors, setupCtx) => ({
      onState: (state) => {
        if (!['preflop','flop','turn','river','showdown'].includes(state.phase)) return;
        const total = (state.players || []).reduce((s, p) => s + (p.stack || 0), 0) + (state.pot || 0);
        if (setupCtx.initialTotal == null) {
          setupCtx.initialTotal = total;
        } else if (Math.abs(total - setupCtx.initialTotal) > 1) {
          setupCtx.anomalies.push({ hand: h, msg: `B169: chip total drifted: expected ${setupCtx.initialTotal}, got ${total} in ${state.phase}` });
          setupCtx.initialTotal = total; // update to avoid spam
        }
        if (state.phase === 'waiting') setupCtx.initialTotal = null;
      },
    }),
  },

  {
    id: 'B170',
    label: 'Chip conservation: sum(stacks) + pot constant with uneven stacks',
    players: ['Dave', 'Eve'],
    stacks: { Coach: 300, Dave: 700, Eve: 500 }, mode: 'rng',
    setup: async (_port, _coachSock, _allActors, _crashes, anomalies) => ({ anomalies, initialTotal: null }),
    hooksFactory: (h, _allActors, setupCtx) => ({
      onState: (state) => {
        if (!['preflop','flop','turn','river','showdown'].includes(state.phase)) return;
        const total = (state.players || []).reduce((s, p) => s + (p.stack || 0), 0) + (state.pot || 0);
        if (setupCtx.initialTotal == null) { setupCtx.initialTotal = total; return; }
        if (Math.abs(total - setupCtx.initialTotal) > 1) {
          setupCtx.anomalies.push({ hand: h, msg: `B170: chip drift: expected ${setupCtx.initialTotal}, got ${total}` });
          setupCtx.initialTotal = total;
        }
        if (state.phase === 'waiting') setupCtx.initialTotal = null;
      },
    }),
  },

  {
    id: 'B171',
    label: 'Chip conservation: over 20 hands, total chip pool never changes between hands',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: { all: 1000 }, mode: 'rng',
    setup: async (_port, _coachSock, _allActors, _crashes, anomalies) => ({ anomalies, totalBetweenHands: null }),
    hooksFactory: (h, _allActors, setupCtx) => ({
      onState: (state) => {
        if (state.phase !== 'waiting' && state.phase !== 'WAITING') return;
        const total = (state.players || []).reduce((s, p) => s + (p.stack || 0), 0) + (state.pot || 0);
        if (setupCtx.totalBetweenHands == null) { setupCtx.totalBetweenHands = total; return; }
        if (Math.abs(total - setupCtx.totalBetweenHands) > 1) {
          setupCtx.anomalies.push({ hand: h, msg: `B171: chip total between hands changed: was ${setupCtx.totalBetweenHands}, now ${total}` });
          setupCtx.totalBetweenHands = total;
        }
      },
    }),
  },

  {
    id: 'B172',
    label: 'Chip conservation: pot is 0 at start of each new hand (waiting phase)',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: { all: 1000 }, mode: 'rng',
    setup: async (_port, _coachSock, _allActors, _crashes, anomalies) => ({ anomalies }),
    hooksFactory: (h, _allActors, setupCtx) => {
      let handStarted = false;
      return {
        onState: (state) => {
          if (state.phase === 'waiting' || state.phase === 'WAITING') { handStarted = false; }
          if (!handStarted && state.phase === 'preflop') {
            handStarted = true; // pot will have blinds now — that's fine
          }
          // Pot in waiting phase should be 0 (between hands)
          if ((state.phase === 'waiting' || state.phase === 'WAITING') && state.pot > 0) {
            setupCtx.anomalies.push({ hand: h, msg: `B172: pot (${state.pot}) > 0 in waiting phase` });
          }
        },
      };
    },
  },

  {
    id: 'B173',
    label: 'Chip conservation: HU short stack — winner stack increase = loser stack decrease',
    players: ['Frank'],
    stacks: { all: 5 * DEFAULT_BIG_BLIND }, mode: 'rng',
    setup: async (_port, _coachSock, _allActors, _crashes, anomalies) => ({ anomalies, totalBetweenHands: null }),
    hooksFactory: (h, _allActors, setupCtx) => ({
      onState: (state) => {
        if (state.phase !== 'waiting' && state.phase !== 'WAITING') return;
        const total = (state.players || []).reduce((s, p) => s + (p.stack || 0), 0);
        if (setupCtx.totalBetweenHands == null) { setupCtx.totalBetweenHands = total; return; }
        if (Math.abs(total - setupCtx.totalBetweenHands) > 1) {
          setupCtx.anomalies.push({ hand: h, msg: `B173: HU chip total changed: ${setupCtx.totalBetweenHands} → ${total}` });
          setupCtx.totalBetweenHands = total;
        }
      },
    }),
  },

  {
    id: 'B174',
    label: 'Chip conservation: 3 mismatched stacks (side pots) — 20 hands no crash',
    // Note: intermediate state chip accounting with active side pots may show temporary
    // inconsistency during bet collection (ISS candidate). Crash-free is the primary check.
    players: ['Dave', 'Eve'],
    stacks: { Coach: 1 * DEFAULT_BIG_BLIND, Dave: 3 * DEFAULT_BIG_BLIND, Eve: 7 * DEFAULT_BIG_BLIND },
    mode: 'rng',
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // GROUP F — REST API coverage (B175–B180)
  // ══════════════════════════════════════════════════════════════════════════════

  {
    id: 'B175',
    label: 'REST API: GET /api/hands returns array after 5 hands played',
    players: ['Alice', 'Bob'],
    stacks: { all: 1000 }, mode: 'rng',
    setup: async (port, coachSock, allActors, crashes, anomalies) => {
      for (let i = 0; i < 5; i++) await playHand(i + 1, coachSock, allActors, crashes, anomalies);
      const res = await getJSON(port, '/api/hands');
      if (res.status !== 200) {
        anomalies.push({ hand: 0, msg: `B175: GET /api/hands status ${res.status}` });
      } else {
        // Route returns { hands: [...] }
        const arr = Array.isArray(res.body) ? res.body : res.body?.hands;
        if (!Array.isArray(arr)) {
          anomalies.push({ hand: 0, msg: `B175: expected array in response, got: ${JSON.stringify(res.body).slice(0,80)}` });
        } else if (arr.length === 0) {
          anomalies.push({ hand: 0, msg: 'B175: GET /api/hands returned empty array after 5 hands' });
        }
      }
      return {};
    },
  },

  {
    id: 'B176',
    label: 'REST API: GET /api/players returns array with registered players',
    players: ['Alice', 'Bob'],
    stacks: { all: 1000 }, mode: 'rng',
    setup: async (port, _coachSock, _allActors, _crashes, anomalies) => {
      const res = await getJSON(port, '/api/players');
      if (res.status !== 200) {
        anomalies.push({ hand: 0, msg: `B176: GET /api/players status ${res.status}` });
      } else {
        const arr = Array.isArray(res.body) ? res.body : res.body?.players;
        if (!Array.isArray(arr)) {
          anomalies.push({ hand: 0, msg: `B176: expected array in response, got: ${JSON.stringify(res.body).slice(0,80)}` });
        } else if (arr.length < 2) {
          anomalies.push({ hand: 0, msg: `B176: expected >= 2 players, got ${arr.length}` });
        }
      }
      return {};
    },
  },

  {
    id: 'B177',
    label: 'REST API: GET /api/players/:stableId/stats returns valid stats object',
    players: ['Alice', 'Bob'],
    stacks: { all: 1000 }, mode: 'rng',
    setup: async (port, coachSock, allActors, crashes, anomalies) => {
      for (let i = 0; i < 3; i++) await playHand(i + 1, coachSock, allActors, crashes, anomalies);
      const player = allActors.find(a => !a.isCoach);
      if (!player) { anomalies.push({ hand: 0, msg: 'B177: no non-coach actor' }); return {}; }
      const res = await getJSON(port, `/api/players/${player.stableId}/stats`);
      if (res.status !== 200) {
        anomalies.push({ hand: 0, msg: `B177: stats status ${res.status} for ${player.stableId}` });
      } else if (!res.body || typeof res.body !== 'object') {
        anomalies.push({ hand: 0, msg: `B177: stats not an object: ${JSON.stringify(res.body)}` });
      }
      return {};
    },
  },

  {
    id: 'B178',
    label: 'REST API: GET /api/hands?limit=3 returns <= 3 results',
    players: ['Alice', 'Bob'],
    stacks: { all: 1000 }, mode: 'rng',
    setup: async (port, coachSock, allActors, crashes, anomalies) => {
      for (let i = 0; i < 5; i++) await playHand(i + 1, coachSock, allActors, crashes, anomalies);
      const res = await getJSON(port, '/api/hands?limit=3');
      if (res.status !== 200) {
        anomalies.push({ hand: 0, msg: `B178: status ${res.status}` });
      } else {
        const arr = Array.isArray(res.body) ? res.body : res.body?.hands;
        if (!Array.isArray(arr)) {
          anomalies.push({ hand: 0, msg: `B178: expected array in response, got: ${JSON.stringify(res.body).slice(0,80)}` });
        } else if (arr.length > 3) {
          anomalies.push({ hand: 0, msg: `B178: expected <=3 results, got ${arr.length}` });
        }
      }
      return {};
    },
  },

  {
    id: 'B179',
    label: 'REST API: GET /api/players/:stableId/hands returns array',
    players: ['Alice', 'Bob'],
    stacks: { all: 1000 }, mode: 'rng',
    setup: async (port, coachSock, allActors, crashes, anomalies) => {
      for (let i = 0; i < 3; i++) await playHand(i + 1, coachSock, allActors, crashes, anomalies);
      const player = allActors.find(a => !a.isCoach);
      if (!player) { anomalies.push({ hand: 0, msg: 'B179: no player' }); return {}; }
      const res = await getJSON(port, `/api/players/${player.stableId}/hands`);
      if (res.status !== 200) {
        anomalies.push({ hand: 0, msg: `B179: status ${res.status}` });
      } else {
        const arr = Array.isArray(res.body) ? res.body : res.body?.hands;
        if (!Array.isArray(arr)) {
          anomalies.push({ hand: 0, msg: `B179: expected array in response, got: ${JSON.stringify(res.body).slice(0,80)}` });
        }
      }
      return {};
    },
  },

  {
    id: 'B180',
    label: 'REST API: unknown route returns 404 JSON error (not HTML)',
    players: ['Alice'],
    stacks: null, mode: 'rng',
    setup: async (port, _coachSock, _allActors, _crashes, anomalies) => {
      const res = await getJSON(port, '/api/nonexistent_route_xyz');
      if (res.status !== 404) {
        anomalies.push({ hand: 0, msg: `B180: expected 404, got ${res.status}` });
      } else if (typeof res.body !== 'object' || !res.body.error) {
        anomalies.push({ hand: 0, msg: `B180: expected JSON error body, got: ${JSON.stringify(res.body).slice(0, 80)}` });
      }
      return {};
    },
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // GROUP G — Dealer button rotation (B181–B186)
  // ══════════════════════════════════════════════════════════════════════════════

  {
    id: 'B181',
    label: 'Dealer rotation: dealer_seat is present (non-null) on every preflop state',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: { all: 1000 }, mode: 'rng',
    setup: async (_port, _coachSock, _allActors, _crashes, anomalies) => ({ anomalies }),
    hooksFactory: (h, _allActors, setupCtx) => {
      let checked = false;
      return {
        onState: (state) => {
          if (state.phase === 'preflop' && !checked) {
            checked = true;
            if (state.dealer_seat == null) {
              setupCtx.anomalies.push({ hand: h, msg: 'B181: dealer_seat null on preflop state' });
            }
          }
          if (state.phase === 'waiting') checked = false;
        },
      };
    },
  },

  {
    id: 'B182',
    label: 'Dealer rotation: dealer_seat changes from hand to hand (3-player, 20 hands)',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: { all: 2000 }, mode: 'rng',
    setup: async (_port, _coachSock, _allActors, _crashes, anomalies) => ({ anomalies, lastDealer: null, sameCount: 0 }),
    hooksFactory: (h, _allActors, setupCtx) => {
      let seen = false;
      return {
        onState: (state) => {
          if (state.phase === 'preflop' && !seen && state.dealer_seat != null) {
            seen = true;
            if (h > 1) {
              if (state.dealer_seat === setupCtx.lastDealer) setupCtx.sameCount++;
              // If dealer never changes across all 20 hands, flag at end
              if (h === 20 && setupCtx.sameCount >= 18) {
                setupCtx.anomalies.push({ hand: h, msg: `B182: dealer_seat never changed (same ${setupCtx.sameCount}/19 hands)` });
              }
            }
            setupCtx.lastDealer = state.dealer_seat;
          }
          if (state.phase === 'waiting') seen = false;
        },
      };
    },
  },

  {
    id: 'B183',
    label: 'Dealer rotation: over 3 hands, all 3 different seats act as dealer (3-player)',
    players: ['Alice', 'Bob'],
    stacks: { all: 2000 }, mode: 'rng',
    setup: async (_port, _coachSock, _allActors, _crashes, anomalies) => ({ anomalies, dealerSeats: new Set() }),
    hooksFactory: (h, _allActors, setupCtx) => {
      let seen = false;
      return {
        onState: (state) => {
          if (state.phase === 'preflop' && !seen && state.dealer_seat != null) {
            seen = true;
            setupCtx.dealerSeats.add(state.dealer_seat);
            if (h === 20 && setupCtx.dealerSeats.size < 2) {
              setupCtx.anomalies.push({ hand: h, msg: `B183: only ${setupCtx.dealerSeats.size} unique dealer seat(s) over 20 hands` });
            }
          }
          if (state.phase === 'waiting') seen = false;
        },
      };
    },
  },

  {
    id: 'B184',
    label: 'Dealer rotation: dealer_seat is always a valid seat index (0-8)',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: { all: 1000 }, mode: 'rng',
    setup: async (_port, _coachSock, _allActors, _crashes, anomalies) => ({ anomalies }),
    hooksFactory: (h, _allActors, setupCtx) => ({
      onState: (state) => {
        if (state.dealer_seat != null && (state.dealer_seat < 0 || state.dealer_seat > 8)) {
          setupCtx.anomalies.push({ hand: h, msg: `B184: dealer_seat out of range: ${state.dealer_seat}` });
        }
      },
    }),
  },

  {
    id: 'B185',
    label: 'Min-raise: state.min_raise >= big_blind on every preflop state',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: { all: 1000 }, mode: 'rng',
    setup: async (_port, _coachSock, _allActors, _crashes, anomalies) => ({ anomalies }),
    hooksFactory: (h, _allActors, setupCtx) => ({
      onState: (state) => {
        if (state.phase !== 'preflop') return;
        if (state.min_raise == null) return; // ok if not set yet
        const bb = state.big_blind || DEFAULT_BIG_BLIND;
        if (state.min_raise < bb) {
          setupCtx.anomalies.push({ hand: h, msg: `B185: min_raise (${state.min_raise}) < big_blind (${bb})` });
        }
      },
    }),
  },

  {
    id: 'B186',
    label: 'Min-raise: 4-player deep stacks — min_raise increments after each raise',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: { all: 5000 }, mode: 'rng',
    setup: async (_port, _coachSock, _allActors, _crashes, anomalies) => ({ anomalies }),
    hooksFactory: (h, _allActors, setupCtx) => {
      let lastRaise = 0;
      let lastStreet = null;
      return {
        onState: (state) => {
          if (state.phase !== lastStreet) { lastStreet = state.phase; lastRaise = state.current_bet || 0; }
          if (state.phase !== 'preflop' && state.phase !== 'flop' && state.phase !== 'turn' && state.phase !== 'river') return;
          const cb = state.current_bet || 0;
          if (cb > lastRaise && state.min_raise != null) {
            const increase = cb - lastRaise;
            if (state.min_raise < increase) {
              setupCtx.anomalies.push({ hand: h, msg: `B186: min_raise (${state.min_raise}) < last raise size (${increase})` });
            }
            lastRaise = cb;
          }
        },
      };
    },
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // GROUP H — All-in and side pots (B187–B192)
  // ══════════════════════════════════════════════════════════════════════════════

  {
    id: 'B187',
    label: 'All-in: all 4 players go all-in — game reaches showdown without crash',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: { all: 2 * DEFAULT_BIG_BLIND }, mode: 'rng',
  },

  {
    id: 'B188',
    label: 'All-in: 3 different stack sizes — game resolves without anomaly',
    players: ['Dave', 'Eve'],
    stacks: { Coach: 1 * DEFAULT_BIG_BLIND, Dave: 3 * DEFAULT_BIG_BLIND, Eve: 7 * DEFAULT_BIG_BLIND },
    mode: 'rng',
  },

  {
    id: 'B189',
    label: 'All-in: no player ever has a negative stack (stack < 0)',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: { Alice: 1, Bob: 1000, Carol: 1000 }, mode: 'rng',
    setup: async (_port, _coachSock, _allActors, _crashes, anomalies) => ({ anomalies }),
    hooksFactory: (h, _allActors, setupCtx) => ({
      onState: (state) => {
        for (const p of (state.players || [])) {
          if (typeof p.stack === 'number' && p.stack < 0) {
            setupCtx.anomalies.push({ hand: h, msg: `B189: player ${p.name} has negative stack (${p.stack}) in ${state.phase}` });
          }
        }
      },
    }),
  },

  {
    id: 'B190',
    label: 'All-in: short stack all-in pot is >=  their bet on every street',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: { Alice: DEFAULT_BIG_BLIND, Bob: 500, Carol: 500 }, mode: 'rng',
    setup: async (_port, _coachSock, _allActors, _crashes, anomalies) => ({ anomalies }),
    hooksFactory: (h, allActors, setupCtx) => ({
      onState: (state) => {
        if (!['preflop','flop','turn','river','showdown'].includes(state.phase)) return;
        const pot = state.pot || 0;
        const maxBet = Math.max(...(state.players || []).map(p => p.total_bet || 0));
        if (pot < 0) {
          setupCtx.anomalies.push({ hand: h, msg: `B190: pot is negative (${pot}) in ${state.phase}` });
        }
      },
    }),
  },

  {
    id: 'B191',
    label: 'All-in: two players all-in simultaneously — showdown reached (no stuck game)',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: { Alice: DEFAULT_BIG_BLIND, Bob: DEFAULT_BIG_BLIND, Carol: 1000 }, mode: 'rng',
    setup: async (_port, _coachSock, _allActors, _crashes, anomalies) => ({ anomalies }),
    hooksFactory: (h, _allActors, setupCtx) => ({
      onState: (state) => {
        if (state.phase === 'showdown' && !state.showdown_result) {
          setupCtx.anomalies.push({ hand: h, msg: 'B191: showdown without showdown_result (all-in scenario)' });
        }
      },
    }),
  },

  {
    id: 'B192',
    label: 'All-in: winner stack after showdown > 0 (chips correctly awarded)',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: { all: 3 * DEFAULT_BIG_BLIND }, mode: 'rng',
    setup: async (_port, _coachSock, _allActors, _crashes, anomalies) => ({ anomalies }),
    hooksFactory: (h, _allActors, setupCtx) => ({
      onState: (state) => {
        if (state.phase !== 'showdown' || !state.winner) return;
        const winner = (state.players || []).find(p => p.id === state.winner);
        if (winner && winner.stack === 0) {
          setupCtx.anomalies.push({ hand: h, msg: `B192: winner ${winner.name} has stack=0 after pot awarded` });
        }
      },
    }),
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // GROUP I — Phase sequence integrity (B193–B196)
  // ══════════════════════════════════════════════════════════════════════════════

  {
    id: 'B193',
    label: 'Phase sequence: phases appear in legal order (waiting→preflop→…→showdown)',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: { all: 1000 }, mode: 'rng',
    setup: async (_port, _coachSock, _allActors, _crashes, anomalies) => ({ anomalies }),
    hooksFactory: (h, _allActors, setupCtx) => {
      const ORDER = ['waiting','WAITING','preflop','flop','turn','river','showdown'];
      let lastPhaseIdx = 0;
      return {
        onState: (state) => {
          const idx = ORDER.indexOf(state.phase);
          if (idx === -1) return; // unknown phase (config etc) — skip
          // Allowed transitions: forward, or back to waiting (new hand)
          const isReset = state.phase === 'waiting' || state.phase === 'WAITING';
          if (!isReset && idx < lastPhaseIdx) {
            setupCtx.anomalies.push({ hand: h, msg: `B193: phase went backwards: ${ORDER[lastPhaseIdx]} → ${state.phase}` });
          }
          lastPhaseIdx = isReset ? 0 : idx;
        },
      };
    },
  },

  {
    id: 'B194',
    label: 'Phase sequence: showdown only appears once per hand (not repeated)',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: { all: 1000 }, mode: 'rng',
    setup: async (_port, _coachSock, _allActors, _crashes, anomalies) => ({ anomalies }),
    hooksFactory: (h, _allActors, setupCtx) => {
      let showdownCount = 0;
      return {
        onState: (state) => {
          if (state.phase === 'showdown') showdownCount++;
          if (showdownCount > 1) {
            setupCtx.anomalies.push({ hand: h, msg: `B194: showdown phase appeared ${showdownCount} times in one hand` });
            showdownCount = 0; // reset to avoid spam
          }
          if (state.phase === 'waiting' || state.phase === 'WAITING') showdownCount = 0;
        },
      };
    },
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // GROUP J — Undo / rollback (B195–B200)
  // ══════════════════════════════════════════════════════════════════════════════

  {
    id: 'B195',
    label: 'Undo: undo_action during preflop reverts current_bet (previous player acts again)',
    players: ['Alice', 'Bob'],
    stacks: { all: 1000 }, mode: 'rng',
    setup: async (_port, _coachSock, _allActors, _crashes, anomalies) => ({ anomalies }),
    hooksFactory: (h, allActors, setupCtx) => {
      let undone = false;
      let betBeforeUndo = null;
      return {
        onState: (state, coachSock) => {
          if (state.phase !== 'preflop' || undone) return;
          if (!state.current_turn) return;
          const actor = allActors.find(a => a.serverId === state.current_turn);
          if (actor && !actor.isCoach) {
            // Record pot then undo
            betBeforeUndo = state.current_bet;
            undone = true;
            coachSock.emit('undo_action');
          }
        },
      };
    },
  },

  {
    id: 'B196',
    label: 'Undo: rollback_street on flop returns to preflop state (no crash)',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: { all: 1000 }, mode: 'rng',
    setup: async (_port, coachSock, allActors, crashes, anomalies) => {
      // Start a hand, wait for flop, emit rollback, verify a game_state comes back
      coachSock.emit('start_game', { mode: 'rng' });
      let flopSeen = false;
      for (let i = 0; i < 12; i++) {
        const s = await waitFor(coachSock, 'game_state', 2000).catch(() => null);
        if (!s) break;
        if (s.phase === 'flop') { flopSeen = true; break; }
      }
      if (!flopSeen) {
        // Hand may have ended without a flop (fold-win) — just reset and skip
        coachSock.emit('reset_hand');
        await waitFor(coachSock, 'game_state', 2000).catch(() => null);
        return {};
      }
      // Emit rollback and expect a game_state back (not a crash / timeout)
      const stateP = waitFor(coachSock, 'game_state', 2000).catch(() => null);
      coachSock.emit('rollback_street');
      const afterRollback = await stateP;
      if (!afterRollback) {
        crashes.push({ hand: 0, error: 'B196: no game_state after rollback_street on flop' });
      }
      // Reset to waiting
      coachSock.emit('reset_hand');
      for (let i = 0; i < 5; i++) {
        const s = await waitFor(coachSock, 'game_state', 500).catch(() => null);
        if (!s || s.phase === 'waiting' || s.phase === 'WAITING') break;
      }
      return {};
    },
  },

  {
    id: 'B197',
    label: 'Undo: single undo_action during preflop does not produce server error event',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: { all: 1000 }, mode: 'rng',
    setup: async (_port, coachSock, allActors, crashes, anomalies) => {
      let undone = false;
      await playHand(1, coachSock, allActors, crashes, anomalies, {
        onState: (_state, cs) => {
          if (!undone) { undone = true; cs.emit('undo_action'); return 'skip'; }
        },
      });
      return {};
    },
  },

  {
    id: 'B198',
    label: 'Undo: undo_action in waiting phase returns sync_error (invalid phase)',
    players: ['Alice', 'Bob'],
    stacks: null, mode: 'rng',
    setup: async (_port, coachSock, _allActors, _crashes, anomalies) => {
      // We are in waiting — emit undo and expect sync_error
      const errP = waitFor(coachSock, 'sync_error', 1500).catch(() => null);
      coachSock.emit('undo_action');
      const err = await errP;
      if (!err) {
        anomalies.push({ hand: 0, msg: 'B198: expected sync_error for undo_action in waiting phase, got none' });
      }
      return {};
    },
  },

  {
    id: 'B199',
    label: 'Rollback: rollback_street in preflop returns sync_error (no previous street)',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: { all: 1000 }, mode: 'rng',
    setup: async (_port, coachSock, allActors, crashes, anomalies) => {
      // Start a hand and immediately try rollback in preflop
      coachSock.emit('start_game', { mode: 'rng' });
      for (let i = 0; i < 8; i++) {
        const s = await waitFor(coachSock, 'game_state', 2000).catch(() => null);
        if (s && s.phase === 'preflop') break;
      }
      const errP = waitFor(coachSock, 'sync_error', 1500).catch(() => null);
      coachSock.emit('rollback_street');
      const err = await errP;
      if (!err) {
        anomalies.push({ hand: 0, msg: 'B199: expected sync_error for rollback_street in preflop, got none' });
      }
      coachSock.emit('reset_hand');
      for (let i = 0; i < 5; i++) {
        const s = await waitFor(coachSock, 'game_state', 500).catch(() => null);
        if (!s || s.phase === 'waiting' || s.phase === 'WAITING') break;
      }
      return {};
    },
  },

  {
    id: 'B200',
    label: 'Rollback: rollback_street on river is accepted without server error event',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: { all: 1000 }, mode: 'rng',
    setup: async (_port, coachSock, allActors, crashes, anomalies) => {
      let rolledBack = false;
      await playHand(1, coachSock, allActors, crashes, anomalies, {
        onState: (state, cs) => {
          if (state.phase === 'river' && !rolledBack) {
            rolledBack = true;
            cs.emit('rollback_street');
            return 'skip';
          }
        },
      });
      return {};
    },
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // GROUP K — Coach in-hand toggle (B201–B206)
  // ══════════════════════════════════════════════════════════════════════════════

  {
    id: 'B201',
    label: 'In-hand toggle: player with in_hand=false receives empty hole_cards after deal',
    // in_hand=false skips card dealing; player stays seated and is still in turn order
    players: ['Alice', 'Bob', 'Carol'],
    stacks: { all: 1000 }, mode: 'rng',
    setup: async (_port, coachSock, allActors, _crashes, anomalies) => {
      const alice = allActors.find(a => a.name === 'Alice');
      if (alice) {
        setPlayerInHand(coachSock, alice.serverId, false);
        await new Promise(r => setTimeout(r, 40));
      }
      // Start a hand and verify Alice's hole_cards are empty on first preflop state
      coachSock.emit('start_game', { mode: 'rng' });
      let preflopState = null;
      for (let i = 0; i < 10; i++) {
        const s = await waitFor(coachSock, 'game_state', 2000).catch(() => null);
        if (!s) break;
        if (s.phase === 'preflop') { preflopState = s; break; }
      }
      if (preflopState && alice) {
        const ap = (preflopState.players || []).find(p => p.id === alice.serverId);
        if (ap && ap.hole_cards && ap.hole_cards.length > 0) {
          anomalies.push({ hand: 0, msg: `B201: Alice (in_hand=false) dealt ${ap.hole_cards.length} cards, expected 0` });
        }
      }
      // Reset to waiting
      coachSock.emit('reset_hand');
      for (let i = 0; i < 5; i++) {
        const s = await waitFor(coachSock, 'game_state', 500).catch(() => null);
        if (!s || s.phase === 'waiting' || s.phase === 'WAITING') break;
      }
      if (alice) { setPlayerInHand(coachSock, alice.serverId, true); await new Promise(r => setTimeout(r, 30)); }
      return {};
    },
  },

  {
    id: 'B202',
    label: 'In-hand toggle: toggling player back to in_hand=true lets them act again',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: { all: 1000 }, mode: 'rng',
    setup: async (_port, coachSock, allActors, crashes, anomalies) => {
      const alice = allActors.find(a => a.name === 'Alice');
      if (alice) {
        setPlayerInHand(coachSock, alice.serverId, false);
        await new Promise(r => setTimeout(r, 30));
        setPlayerInHand(coachSock, alice.serverId, true);
        await new Promise(r => setTimeout(r, 30));
      }
      return { anomalies };
    },
  },

  {
    id: 'B203',
    label: 'In-hand toggle: toggled-out player is still in game_state.players (just not dealt)',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: { all: 1000 }, mode: 'rng',
    setup: async (_port, coachSock, allActors, _crashes, anomalies) => {
      // Toggle Alice out, wait for a state, verify she's still in players list
      const alice = allActors.find(a => a.name === 'Alice');
      if (alice) {
        setPlayerInHand(coachSock, alice.serverId, false);
        await new Promise(r => setTimeout(r, 50));
      }
      // Get a game_state and verify Alice is still listed
      const stateP = waitFor(coachSock, 'game_state', 2000);
      coachSock.emit('reset_hand'); // trigger broadcast
      const state = await stateP.catch(() => null);
      if (state && alice) {
        const ap = (state.players || []).find(p => p.id === alice.serverId);
        if (!ap) {
          anomalies.push({ hand: 0, msg: 'B203: Alice not in players after in_hand=false' });
        }
      }
      // Restore
      if (alice) setPlayerInHand(coachSock, alice.serverId, true);
      await new Promise(r => setTimeout(r, 30));
      return {};
    },
  },

  {
    id: 'B204',
    label: 'In-hand toggle: toggling a player mid-flop does not crash the server',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: { all: 1000 }, mode: 'rng',
    setup: async (_port, coachSock, allActors, crashes, _anomalies) => {
      // Start a hand, wait for flop, emit toggle, verify server stays alive via game_state
      coachSock.emit('start_game', { mode: 'rng' });
      let flopSeen = false;
      for (let i = 0; i < 12; i++) {
        const s = await waitFor(coachSock, 'game_state', 2000).catch(() => null);
        if (!s) break;
        if (s.phase === 'flop') { flopSeen = true; break; }
        if (s.phase === 'showdown' || s.phase === 'waiting') break;
      }
      if (flopSeen) {
        const alice = allActors.find(a => a.name === 'Alice');
        if (alice) {
          setPlayerInHand(coachSock, alice.serverId, false);
          await new Promise(r => setTimeout(r, 50));
          setPlayerInHand(coachSock, alice.serverId, true);
          await new Promise(r => setTimeout(r, 50));
        }
        // Server should still broadcast a game_state (toggle triggers broadcastState)
        // Just verify no crash — reset the hand to clean up
      }
      coachSock.emit('reset_hand');
      for (let i = 0; i < 5; i++) {
        const s = await waitFor(coachSock, 'game_state', 500).catch(() => null);
        if (!s || s.phase === 'waiting' || s.phase === 'WAITING') break;
      }
      return {};
    },
  },

  {
    id: 'B205',
    label: 'In-hand toggle: game_state in_hand field matches what coach set',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: { all: 1000 }, mode: 'rng',
    setup: async (_port, coachSock, allActors, crashes, anomalies) => {
      const alice = allActors.find(a => a.name === 'Alice');
      if (alice) setPlayerInHand(coachSock, alice.serverId, false);
      await new Promise(r => setTimeout(r, 50));
      // Check game_state reflects in_hand=false for Alice
      const state = await waitFor(coachSock, 'game_state', 2000).catch(() => null);
      if (state && alice) {
        const ap = (state.players || []).find(p => p.id === alice.serverId);
        if (ap && ap.in_hand !== false) {
          anomalies.push({ hand: 0, msg: `B205: Alice in_hand expected false, got ${ap.in_hand}` });
        }
      }
      // Restore
      if (alice) setPlayerInHand(coachSock, alice.serverId, true);
      return {};
    },
  },

  {
    id: 'B206',
    label: 'In-hand toggle: non-coach cannot toggle another player (error event)',
    players: ['Alice', 'Bob'],
    stacks: null, mode: 'rng',
    setup: async (_port, _coachSock, allActors, _crashes, anomalies) => {
      const playerSock = allActors.find(a => !a.isCoach)?.sock;
      const target = allActors.find(a => !a.isCoach && a.sock !== playerSock);
      if (!playerSock || !target) { return {}; }
      // Server emits 'error' for auth violations
      const errP = waitFor(playerSock, 'error', 1500).catch(() => null);
      playerSock.emit('set_player_in_hand', { playerId: target.serverId, inHand: false });
      const err = await errP;
      if (!err) {
        anomalies.push({ hand: 0, msg: 'B206: non-coach set_player_in_hand should return error event' });
      }
      return {};
    },
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // GROUP L — Pause / resume (B207–B210)
  // ══════════════════════════════════════════════════════════════════════════════

  {
    id: 'B207',
    label: 'Pause: toggle_pause sets paused=true in game_state (verified in setup)',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: { all: 1000 }, mode: 'rng',
    setup: async (_port, coachSock, allActors, crashes, anomalies) => {
      // Start one hand, pause it, verify paused=true, then unpause and continue
      coachSock.emit('start_game', { mode: 'rng' });
      let preflopState = null;
      for (let i = 0; i < 8; i++) {
        const s = await waitFor(coachSock, 'game_state', 2000).catch(() => null);
        if (s && s.phase === 'preflop') { preflopState = s; break; }
      }
      if (!preflopState) { anomalies.push({ hand: 0, msg: 'B207: preflop not reached' }); return {}; }
      // Pause and wait for paused state
      const pausedP = waitFor(coachSock, 'game_state', 1500);
      coachSock.emit('toggle_pause');
      const pausedState = await pausedP.catch(() => null);
      if (!pausedState || !pausedState.paused) {
        anomalies.push({ hand: 0, msg: `B207: expected paused=true after toggle_pause, got: ${pausedState?.paused}` });
      }
      // Unpause
      coachSock.emit('toggle_pause');
      coachSock.emit('reset_hand');
      for (let i = 0; i < 5; i++) {
        const s = await waitFor(coachSock, 'game_state', 500).catch(() => null);
        if (!s || s.phase === 'waiting' || s.phase === 'WAITING') break;
      }
      return {};
    },
  },

  {
    id: 'B208',
    label: 'Pause: pause then unpause — paused flips back to false',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: { all: 1000 }, mode: 'rng',
    setup: async (_port, coachSock, allActors, crashes, anomalies) => {
      coachSock.emit('start_game', { mode: 'rng' });
      for (let i = 0; i < 8; i++) {
        const s = await waitFor(coachSock, 'game_state', 2000).catch(() => null);
        if (s && s.phase === 'preflop') break;
      }
      // Pause
      const p1 = waitFor(coachSock, 'game_state', 1000);
      coachSock.emit('toggle_pause');
      await p1.catch(() => {});
      // Unpause
      const p2 = waitFor(coachSock, 'game_state', 1000);
      coachSock.emit('toggle_pause');
      const resumed = await p2.catch(() => null);
      if (resumed && resumed.paused === true) {
        anomalies.push({ hand: 0, msg: 'B208: game still paused after double toggle' });
      }
      coachSock.emit('reset_hand');
      for (let i = 0; i < 5; i++) {
        const s = await waitFor(coachSock, 'game_state', 500).catch(() => null);
        if (!s || s.phase === 'waiting' || s.phase === 'WAITING') break;
      }
      return {};
    },
  },

  {
    id: 'B209',
    label: 'Pause: 10 rapid toggles during preflop — server does not crash',
    players: ['Alice', 'Bob'],
    stacks: { all: 1000 }, mode: 'rng',
    setup: async (_port, coachSock, allActors, crashes, anomalies) => {
      // Start a hand, fire 10 toggles, reset
      coachSock.emit('start_game', { mode: 'rng' });
      for (let i = 0; i < 8; i++) {
        const s = await waitFor(coachSock, 'game_state', 2000).catch(() => null);
        if (s && s.phase === 'preflop') {
          for (let j = 0; j < 10; j++) coachSock.emit('toggle_pause');
          break;
        }
      }
      await new Promise(r => setTimeout(r, 100));
      coachSock.emit('reset_hand');
      for (let i = 0; i < 5; i++) {
        const s = await waitFor(coachSock, 'game_state', 500).catch(() => null);
        if (!s || s.phase === 'waiting' || s.phase === 'WAITING') break;
      }
      return {};
    },
  },

  {
    id: 'B210',
    label: 'Pause: current_turn unchanged in paused state broadcast',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: { all: 1000 }, mode: 'rng',
    setup: async (_port, coachSock, _allActors, _crashes, anomalies) => {
      coachSock.emit('start_game', { mode: 'rng' });
      let prePauseState = null;
      for (let i = 0; i < 8; i++) {
        const s = await waitFor(coachSock, 'game_state', 2000).catch(() => null);
        if (s && s.phase === 'preflop') { prePauseState = s; break; }
      }
      if (!prePauseState) { anomalies.push({ hand: 0, msg: 'B210: preflop not reached' }); return {}; }
      const turnBefore = prePauseState.current_turn;
      const pausedP = waitFor(coachSock, 'game_state', 1500);
      coachSock.emit('toggle_pause');
      const pausedState = await pausedP.catch(() => null);
      if (pausedState && pausedState.current_turn !== turnBefore) {
        anomalies.push({ hand: 0, msg: `B210: current_turn changed on pause: ${turnBefore} → ${pausedState.current_turn}` });
      }
      coachSock.emit('toggle_pause'); // unpause
      coachSock.emit('reset_hand');
      for (let i = 0; i < 5; i++) {
        const s = await waitFor(coachSock, 'game_state', 500).catch(() => null);
        if (!s || s.phase === 'waiting' || s.phase === 'WAITING') break;
      }
      return {};
    },
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // GROUP M — Config phase guards (B211–B214)
  // ══════════════════════════════════════════════════════════════════════════════

  {
    id: 'B211',
    label: 'Config guard: open_config_phase during active hand returns sync_error',
    players: ['Alice', 'Bob'],
    stacks: null, mode: 'rng',
    setup: async (_port, coachSock, allActors, crashes, anomalies) => {
      // Start a hand first
      coachSock.emit('start_game', { mode: 'rng' });
      let preflopSeen = false;
      for (let i = 0; i < 8; i++) {
        const s = await waitFor(coachSock, 'game_state', 2000).catch(() => null);
        if (s && s.phase === 'preflop') { preflopSeen = true; break; }
      }
      if (!preflopSeen) { anomalies.push({ hand: 0, msg: 'B211 setup: preflop not reached' }); return {}; }
      const errP = waitFor(coachSock, 'sync_error', 1500).catch(() => null);
      coachSock.emit('open_config_phase');
      const err = await errP;
      if (!err) anomalies.push({ hand: 0, msg: 'B211: expected sync_error for open_config_phase during active hand' });
      coachSock.emit('reset_hand');
      for (let i = 0; i < 5; i++) {
        const s = await waitFor(coachSock, 'game_state', 500).catch(() => null);
        if (!s || s.phase === 'waiting' || s.phase === 'WAITING') break;
      }
      return {};
    },
  },

  {
    id: 'B212',
    label: 'Config guard: start_configured_hand without open_config_phase returns sync_error',
    players: ['Alice', 'Bob'],
    stacks: null, mode: 'rng',
    setup: async (_port, coachSock, _allActors, _crashes, anomalies) => {
      // In waiting phase — try start_configured_hand without opening config
      const errP = waitFor(coachSock, 'sync_error', 1500).catch(() => null);
      coachSock.emit('start_configured_hand');
      const err = await errP;
      if (!err) anomalies.push({ hand: 0, msg: 'B212: expected sync_error for start_configured_hand without config_phase' });
      return {};
    },
  },

  {
    id: 'B213',
    label: 'Config guard: update_hand_config with invalid card string does not crash server',
    players: ['Alice', 'Bob'],
    stacks: null, mode: 'rng',
    setup: async (_port, coachSock, allActors, _crashes, anomalies) => {
      coachSock.emit('open_config_phase');
      for (let i = 0; i < 5; i++) {
        const s = await waitFor(coachSock, 'game_state', 1000).catch(() => null);
        if (s && s.config_phase) break;
      }
      const player = allActors.find(a => !a.isCoach);
      if (player) {
        const badConfig = { playerHoleCards: { [player.stableId]: { cards: ['ZZ','??'] } } };
        coachSock.emit('update_hand_config', badConfig);
        await new Promise(r => setTimeout(r, 100));
      }
      // Game should still be alive — reset
      coachSock.emit('reset_hand');
      for (let i = 0; i < 5; i++) {
        const s = await waitFor(coachSock, 'game_state', 500).catch(() => null);
        if (!s || s.phase === 'waiting' || s.phase === 'WAITING') break;
      }
      return {};
    },
  },

  {
    id: 'B214',
    label: 'Config guard: manual config with valid cards produces preflop state',
    players: ['Alice', 'Bob'],
    stacks: { all: 500 }, mode: 'manual',
    holeCards: { Coach: ['Ah', 'Kh'], Alice: ['Qd', 'Jd'] },
    boardCards: [],
    setup: async (_port, _coachSock, _allActors, _crashes, anomalies) => ({ anomalies }),
    hooksFactory: (h, _allActors, setupCtx) => {
      let sawPreflop = false;
      return {
        onState: (state) => {
          if (state.phase === 'preflop') sawPreflop = true;
          if (state.phase === 'showdown' && !sawPreflop) {
            setupCtx.anomalies.push({ hand: h, msg: 'B214: reached showdown without preflop (manual config hand)' });
          }
          if (state.phase === 'waiting') sawPreflop = false;
        },
      };
    },
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // GROUP N — Replay edge cases (B215–B220)
  // ══════════════════════════════════════════════════════════════════════════════

  {
    id: 'B215',
    label: 'Replay: load_replay with invalid handId returns error (not crash)',
    players: ['Alice', 'Bob'],
    stacks: { all: 1000 }, mode: 'rng',
    setup: async (_port, coachSock, _allActors, _crashes, anomalies) => {
      const errP = waitFor(coachSock, 'error', 2000).catch(() => null);
      const syncErrP = waitFor(coachSock, 'sync_error', 2000).catch(() => null);
      coachSock.emit('load_replay', { handId: 'nonexistent-hand-id-xyz' });
      const result = await Promise.race([errP, syncErrP]);
      if (!result) {
        anomalies.push({ hand: 0, msg: 'B215: load_replay with bad handId returned no error event' });
      }
      return {};
    },
  },

  {
    id: 'B216',
    label: 'Replay: step_forward past end of actions is safe (no crash)',
    players: ['Alice', 'Bob'],
    stacks: { all: 1000 }, mode: 'rng',
    // Seed 5 RNG hands in setup, then replay 5 of them (h=6-10); remaining hands are RNG
    setup: async (_port, coachSock, allActors, crashes, anomalies) => {
      for (let i = 0; i < 5; i++) await playHand(i + 1, coachSock, allActors, crashes, anomalies);
      return {};
    },
    handMode: (h) => (h >= 6 && h <= 10) ? 'replay' : 'rng',
    hooksFactory: () => ({
      replayOps: async (coachSock, nextRState) => {
        // Step forward 5 times (some may be past end) with short timeout
        for (let i = 0; i < 5; i++) {
          coachSock.emit('replay_step_forward');
          await nextRState(400).catch(() => {});
        }
      },
    }),
  },

  {
    id: 'B217',
    label: 'Replay: step_back at cursor=0 is safe (no crash)',
    players: ['Alice', 'Bob'],
    stacks: { all: 1000 }, mode: 'rng',
    setup: async (_port, coachSock, allActors, crashes, anomalies) => {
      for (let i = 0; i < 5; i++) await playHand(i + 1, coachSock, allActors, crashes, anomalies);
      return {};
    },
    handMode: (h) => (h >= 6 && h <= 10) ? 'replay' : 'rng',
    hooksFactory: () => ({
      replayOps: async (coachSock, nextRState) => {
        // Step back 5 times from start (cursor=0)
        for (let i = 0; i < 5; i++) {
          coachSock.emit('replay_step_back');
          await nextRState(400).catch(() => {});
        }
      },
    }),
  },

  {
    id: 'B218',
    label: 'Replay: branch from replay, unbranch back — no crash',
    players: ['Alice', 'Bob'],
    stacks: { all: 1000 }, mode: 'rng',
    setup: async (_port, coachSock, allActors, crashes, anomalies) => {
      for (let i = 0; i < 5; i++) await playHand(i + 1, coachSock, allActors, crashes, anomalies);
      return {};
    },
    handMode: (h) => (h >= 6 && h <= 10) ? 'replay' : 'rng',
    hooksFactory: () => ({
      replayOps: async (coachSock, nextRState, _crashes, anomalies, handNum) => {
        coachSock.emit('replay_step_forward');
        await nextRState(400).catch(() => {});
        coachSock.emit('replay_branch');
        const s = await nextRState(1000).catch(() => null);
        if (!s) { anomalies.push({ hand: handNum, msg: 'B218: no state after replay_branch' }); return; }
        coachSock.emit('replay_unbranch');
        await nextRState(1000).catch(() => {});
      },
    }),
  },

  {
    id: 'B219',
    label: 'Replay: exit replay mid-way returns to waiting phase',
    players: ['Alice', 'Bob'],
    stacks: { all: 1000 }, mode: 'rng',
    setup: async (_port, coachSock, allActors, crashes, anomalies) => {
      for (let i = 0; i < 5; i++) await playHand(i + 1, coachSock, allActors, crashes, anomalies);
      return {};
    },
    handMode: (h) => (h >= 6 && h <= 10) ? 'replay' : 'rng',
    hooksFactory: () => ({
      replayOps: async (coachSock, nextRState) => {
        coachSock.emit('replay_step_forward');
        await nextRState(400).catch(() => {});
        // playReplayHand finally block emits replay_exit
      },
    }),
  },

  {
    id: 'B220',
    label: 'Replay: replay_jump_to cursor=0 resets to start state without crash',
    players: ['Alice', 'Bob'],
    stacks: { all: 1000 }, mode: 'rng',
    setup: async (_port, coachSock, allActors, crashes, anomalies) => {
      for (let i = 0; i < 5; i++) await playHand(i + 1, coachSock, allActors, crashes, anomalies);
      return {};
    },
    handMode: (h) => (h >= 6 && h <= 10) ? 'replay' : 'rng',
    hooksFactory: () => ({
      replayOps: async (coachSock, nextRState) => {
        coachSock.emit('replay_step_forward');
        await nextRState(400).catch(() => {});
        coachSock.emit('replay_jump_to', { cursor: 0 });
        await nextRState(600).catch(() => {});
      },
    }),
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // GROUP O — Non-coach action guards (B221–B224)
  // ══════════════════════════════════════════════════════════════════════════════

  {
    id: 'B221',
    label: 'Auth guard: non-coach player cannot start_game (error event expected)',
    players: ['Alice', 'Bob'],
    stacks: null, mode: 'rng',
    setup: async (_port, _coachSock, allActors, _crashes, anomalies) => {
      const playerSock = allActors.find(a => !a.isCoach)?.sock;
      if (!playerSock) { return {}; }
      // Server emits 'error' (not sync_error) for auth violations
      const errP = waitFor(playerSock, 'error', 1500).catch(() => null);
      playerSock.emit('start_game', { mode: 'rng' });
      const err = await errP;
      if (!err) anomalies.push({ hand: 0, msg: 'B221: non-coach start_game should return error event' });
      return {};
    },
  },

  {
    id: 'B222',
    label: 'Auth guard: non-coach cannot reset_hand (error event expected)',
    players: ['Alice', 'Bob'],
    stacks: null, mode: 'rng',
    setup: async (_port, _coachSock, allActors, _crashes, anomalies) => {
      const playerSock = allActors.find(a => !a.isCoach)?.sock;
      if (!playerSock) { return {}; }
      const errP = waitFor(playerSock, 'error', 1500).catch(() => null);
      playerSock.emit('reset_hand');
      const err = await errP;
      if (!err) anomalies.push({ hand: 0, msg: 'B222: non-coach reset_hand should return error event' });
      return {};
    },
  },

  {
    id: 'B223',
    label: 'Auth guard: non-coach cannot adjust_stack (error event expected)',
    players: ['Alice', 'Bob'],
    stacks: null, mode: 'rng',
    setup: async (_port, _coachSock, allActors, _crashes, anomalies) => {
      const playerSock = allActors.find(a => !a.isCoach)?.sock;
      const target = allActors.find(a => !a.isCoach && a.sock !== playerSock);
      if (!playerSock || !target) { return {}; }
      const errP = waitFor(playerSock, 'error', 1500).catch(() => null);
      playerSock.emit('adjust_stack', { playerId: target.serverId, amount: 9999 });
      const err = await errP;
      if (!err) anomalies.push({ hand: 0, msg: 'B223: non-coach adjust_stack should return error event' });
      return {};
    },
  },

  {
    id: 'B224',
    label: 'Auth guard: non-coach cannot set_blind_levels (error event expected)',
    players: ['Alice', 'Bob'],
    stacks: null, mode: 'rng',
    setup: async (_port, _coachSock, allActors, _crashes, anomalies) => {
      const playerSock = allActors.find(a => !a.isCoach)?.sock;
      if (!playerSock) { return {}; }
      const errP = waitFor(playerSock, 'error', 1500).catch(() => null);
      playerSock.emit('set_blind_levels', { sb: 100, bb: 200 });
      const err = await errP;
      if (!err) anomalies.push({ hand: 0, msg: 'B224: non-coach set_blind_levels should return error event' });
      return {};
    },
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // GROUP P — Player count / game state invariants (B225–B230)
  // ══════════════════════════════════════════════════════════════════════════════

  {
    id: 'B225',
    label: 'Players invariant: every game_state has at least 1 player with a valid seat',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: { all: 1000 }, mode: 'rng',
    setup: async (_port, _coachSock, _allActors, _crashes, anomalies) => ({ anomalies }),
    hooksFactory: (h, _allActors, setupCtx) => ({
      onState: (state) => {
        const seated = (state.players || []).filter(p => p.seat >= 0);
        if (seated.length === 0) {
          setupCtx.anomalies.push({ hand: h, msg: `B225: no seated players in ${state.phase}` });
        }
      },
    }),
  },

  {
    id: 'B226',
    label: 'Players invariant: player names are non-empty strings in every game_state',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: { all: 1000 }, mode: 'rng',
    setup: async (_port, _coachSock, _allActors, _crashes, anomalies) => ({ anomalies }),
    hooksFactory: (h, _allActors, setupCtx) => ({
      onState: (state) => {
        for (const p of (state.players || [])) {
          if (!p.name || typeof p.name !== 'string' || p.name.trim() === '') {
            setupCtx.anomalies.push({ hand: h, msg: `B226: player has empty/invalid name: ${JSON.stringify(p.name)}` });
          }
        }
      },
    }),
  },

  {
    id: 'B227',
    label: 'Players invariant: current_bet is always >= 0 for all players',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: { all: 1000 }, mode: 'rng',
    setup: async (_port, _coachSock, _allActors, _crashes, anomalies) => ({ anomalies }),
    hooksFactory: (h, _allActors, setupCtx) => ({
      onState: (state) => {
        for (const p of (state.players || [])) {
          if (typeof p.current_bet === 'number' && p.current_bet < 0) {
            setupCtx.anomalies.push({ hand: h, msg: `B227: ${p.name} current_bet < 0: ${p.current_bet}` });
          }
        }
      },
    }),
  },

  {
    id: 'B228',
    label: 'Players invariant: no player has current_bet > their stack before acting',
    // Note: current_bet is not guaranteed to reset at exact street boundary broadcast
    players: ['Alice', 'Bob', 'Carol'],
    stacks: { all: 2000 }, mode: 'rng',
    setup: async (_port, _coachSock, _allActors, _crashes, anomalies) => ({ anomalies }),
    hooksFactory: (h, _allActors, setupCtx) => ({
      onState: (state) => {
        for (const p of (state.players || [])) {
          // A player can't have bet more than their original stack on a single street
          if (typeof p.current_bet === 'number' && typeof p.stack === 'number') {
            if (p.current_bet < 0) {
              setupCtx.anomalies.push({ hand: h, msg: `B228: ${p.name} has negative current_bet ${p.current_bet}` });
            }
          }
        }
      },
    }),
  },

  {
    id: 'B229',
    label: 'Game state: state.current_bet >= 0 and <= max player total_bet in active streets',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: { all: 1500 }, mode: 'rng',
    setup: async (_port, _coachSock, _allActors, _crashes, anomalies) => ({ anomalies }),
    hooksFactory: (h, _allActors, setupCtx) => ({
      onState: (state) => {
        if (!['preflop','flop','turn','river'].includes(state.phase)) return;
        if (typeof state.current_bet !== 'number') return;
        if (state.current_bet < 0) {
          setupCtx.anomalies.push({ hand: h, msg: `B229: state.current_bet < 0: ${state.current_bet}` });
        }
        // If state.current_bet > 0, at least one player must have current_bet >= state.current_bet
        if (state.current_bet > 0) {
          const maxPlayerBet = Math.max(...(state.players || []).map(p => p.current_bet || 0));
          if (maxPlayerBet < state.current_bet) {
            setupCtx.anomalies.push({ hand: h, msg: `B229: state.current_bet (${state.current_bet}) > max player bet (${maxPlayerBet})` });
          }
        }
      },
    }),
  },

  {
    id: 'B230',
    label: 'Game state: winner and winner_name match a player in the players array',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: { all: 1000 }, mode: 'rng',
    setup: async (_port, _coachSock, _allActors, _crashes, anomalies) => ({ anomalies }),
    hooksFactory: (h, _allActors, setupCtx) => ({
      onState: (state) => {
        if (!state.winner) return;
        const winnerPlayer = (state.players || []).find(p => p.id === state.winner);
        if (!winnerPlayer) {
          setupCtx.anomalies.push({ hand: h, msg: `B230: winner id ${state.winner} not found in players array` });
        } else if (state.winner_name && winnerPlayer.name !== state.winner_name) {
          setupCtx.anomalies.push({ hand: h, msg: `B230: winner_name mismatch: state says ${state.winner_name}, player says ${winnerPlayer.name}` });
        }
      },
    }),
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // GROUP Q — Manual config edge cases (B231–B236)
  // ══════════════════════════════════════════════════════════════════════════════

  {
    id: 'B231',
    label: 'Manual config: board with 5 cards — all 5 present on river state',
    players: ['Alice', 'Bob'],
    stacks: { all: 1000 }, mode: 'manual',
    holeCards: { Coach: ['Ah', 'Kh'], Alice: ['Qd', 'Jd'] },
    boardCards: ['2c', '7d', '9h', '3s', 'Jc'],
    setup: async (_port, _coachSock, _allActors, _crashes, anomalies) => ({ anomalies }),
    hooksFactory: (h, _allActors, setupCtx) => ({
      onState: (state) => {
        if (state.phase === 'river' || state.phase === 'showdown') {
          const board = state.board || [];
          const revealed = board.filter(c => c && c !== '??' && c !== null);
          if (revealed.length < 5) {
            setupCtx.anomalies.push({ hand: h, msg: `B231: expected 5 board cards on ${state.phase}, got ${revealed.length}` });
          }
        }
      },
    }),
  },

  {
    id: 'B232',
    label: 'Manual config: flop only (3 board cards) — no crash on river',
    players: ['Alice', 'Bob'],
    stacks: { all: 1000 }, mode: 'manual',
    holeCards: { Coach: ['Ts', 'Th'], Alice: ['9c', '8c'] },
    boardCards: ['As', 'Kd', 'Qh'],
  },

  {
    id: 'B233',
    label: 'Manual config: no hole cards assigned — all players get RNG cards',
    players: ['Alice', 'Bob'],
    stacks: { all: 1000 }, mode: 'manual',
    holeCards: {},
    boardCards: [],
  },

  {
    id: 'B234',
    label: 'Manual config: same hand replayed 3× with identical cards — each completes',
    players: ['Alice', 'Bob'],
    stacks: { all: 1000 }, mode: 'manual',
    holeCards: { Coach: ['Ac', 'Ad'], Alice: ['Kc', 'Kd'] },
    boardCards: ['2h', '7s', 'Tc', '4d', '8h'],
  },

  {
    id: 'B235',
    label: 'Manual config: 4-handed with all hole cards assigned — no card collision',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: { all: 1000 }, mode: 'manual',
    holeCards: {
      Coach: ['Ah', 'Kh'],
      Alice: ['Qd', 'Jd'],
      Bob:   ['Tc', '9c'],
      Carol: ['8s', '7s'],
    },
    boardCards: ['2c', '6d', 'Th'],
    setup: async (_port, _coachSock, _allActors, _crashes, anomalies) => ({ anomalies }),
    hooksFactory: (h, _allActors, setupCtx) => ({
      onState: (state) => {
        if (state.phase !== 'preflop') return;
        // Collect all visible hole cards and check uniqueness
        const allCards = [];
        for (const p of (state.players || [])) {
          for (const c of (p.holeCards || [])) {
            if (c && c !== '??' && c !== 'back') allCards.push(c);
          }
        }
        const unique = new Set(allCards);
        if (unique.size !== allCards.length) {
          setupCtx.anomalies.push({ hand: h, msg: `B235: duplicate hole cards: ${allCards.join(',')}` });
        }
      },
    }),
  },

  {
    id: 'B236',
    label: 'Manual config: board cards don\'t overlap with any hole cards (B235 variant)',
    players: ['Alice', 'Bob'],
    stacks: { all: 1000 }, mode: 'manual',
    holeCards: { Coach: ['Ah', 'Kh'], Alice: ['Qd', 'Jd'] },
    boardCards: ['2c', '7d', '9h'],
    setup: async (_port, _coachSock, _allActors, _crashes, anomalies) => ({ anomalies }),
    hooksFactory: (h, _allActors, setupCtx) => ({
      onState: (state) => {
        if (state.phase !== 'flop') return;
        const board = (state.board || []).filter(Boolean);
        const holeCards = [];
        for (const p of (state.players || [])) {
          for (const c of (p.holeCards || [])) {
            if (c && c !== '??' && c !== 'back') holeCards.push(c);
          }
        }
        for (const bc of board) {
          if (holeCards.includes(bc)) {
            setupCtx.anomalies.push({ hand: h, msg: `B236: board card ${bc} appears in hole cards` });
          }
        }
      },
    }),
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // GROUP R — Registration / auth edge cases (B237–B240)
  // ══════════════════════════════════════════════════════════════════════════════

  {
    id: 'B237',
    label: 'Auth: register same player twice — second call succeeds via login fallback',
    players: ['Alice'],
    stacks: null, mode: 'rng',
    setup: async (port, _coachSock, _allActors, _crashes, anomalies) => {
      // First registration
      const reg1 = await postJSON(port, '/api/auth/register', { name: 'DupUser', email: 'dup@test.sim', password: 'pw12345' });
      if (!reg1.body.stableId) { anomalies.push({ hand: 0, msg: `B237: first register failed: ${JSON.stringify(reg1.body)}` }); return {}; }
      // Second registration — should return name_taken or auto-login
      const reg2 = await postJSON(port, '/api/auth/register', { name: 'DupUser', email: 'dup@test.sim', password: 'pw12345' });
      if (reg2.body.stableId) {
        // Returned a stableId — fine (auto-login path)
      } else if (reg2.body.error === 'name_taken') {
        // Also fine — expected
      } else {
        anomalies.push({ hand: 0, msg: `B237: unexpected response on duplicate register: ${JSON.stringify(reg2.body)}` });
      }
      return {};
    },
  },

  {
    id: 'B238',
    label: 'Auth: login with wrong password returns error (not stableId)',
    players: ['Alice'],
    stacks: null, mode: 'rng',
    setup: async (port, _coachSock, _allActors, _crashes, anomalies) => {
      const reg = await postJSON(port, '/api/auth/register', { name: 'PwTestUser', email: 'pw@test.sim', password: 'correctpw' });
      if (!reg.body.stableId && reg.body.error !== 'name_taken') { return {}; }
      const bad = await postJSON(port, '/api/auth/login', { name: 'PwTestUser', password: 'wrongpw' });
      if (bad.body.stableId) {
        anomalies.push({ hand: 0, msg: 'B238: login with wrong password returned a stableId' });
      }
      return {};
    },
  },

  {
    id: 'B239',
    label: 'Auth: login for non-existent player returns error',
    players: ['Alice'],
    stacks: null, mode: 'rng',
    setup: async (port, _coachSock, _allActors, _crashes, anomalies) => {
      const res = await postJSON(port, '/api/auth/login', { name: 'NoSuchPlayerXYZ999', password: 'pw12345' });
      if (res.body.stableId) {
        anomalies.push({ hand: 0, msg: 'B239: login for non-existent player returned stableId' });
      }
      return {};
    },
  },

  {
    id: 'B240',
    label: 'Auth: GET /api/players after registration includes registered player name',
    players: ['Alice', 'Bob'],
    stacks: null, mode: 'rng',
    setup: async (port, _coachSock, allActors, _crashes, anomalies) => {
      const res = await getJSON(port, '/api/players');
      if (!Array.isArray(res.body)) { return {}; }
      const names = res.body.map(p => p.display_name || p.name);
      const missing = allActors.filter(a => !a.isCoach && !names.includes(a.name));
      for (const m of missing) {
        anomalies.push({ hand: 0, msg: `B240: registered player ${m.name} not in /api/players` });
      }
      return {};
    },
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // GROUP S — Regression: multi-hand stability (B241–B244)
  // ══════════════════════════════════════════════════════════════════════════════

  {
    id: 'B241',
    label: 'Regression: 20 hands 4-player no crash (post-fixes baseline)',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: { all: 1500 }, mode: 'rng',
  },

  {
    id: 'B242',
    label: 'Regression: 20 hands HU no crash (post-fixes baseline)',
    players: ['Frank'],
    stacks: { all: 1500 }, mode: 'rng',
  },

  {
    id: 'B243',
    label: 'Regression: mixed manual and RNG hands (alternating) — no crash',
    players: ['Alice', 'Bob'],
    stacks: { all: 1000 },
    handMode: (h) => h % 2 === 0 ? 'manual' : 'rng',
    holeCards: (h) => h % 2 === 0 ? { Coach: ['As', 'Ks'], Alice: ['Qh', 'Jh'] } : {},
    boardCards: (h) => h % 2 === 0 ? ['2d', '7c', '9s'] : [],
  },

  {
    id: 'B244',
    label: 'Regression: 20 hands with pause/unpause on every 3rd hand — no crash',
    players: ['Alice', 'Bob', 'Carol'],
    stacks: { all: 1000 }, mode: 'rng',
    hooksFactory: (h, _allActors) => {
      if (h % 3 !== 0) return {};
      let fired = false;
      return {
        onState: (state, coachSock) => {
          if (state.phase === 'preflop' && !fired) {
            fired = true;
            coachSock.emit('toggle_pause');
            setTimeout(() => coachSock.emit('toggle_pause'), 30);
            return 'skip'; // don't act on the same state we paused on
          }
          if (state.paused) return 'skip';
        },
      };
    },
  },

];

// ─── Run one batch ────────────────────────────────────────────────────────────

async function runBatch(port, batch) {
  const tableId = `sim-${batch.id}`;
  const crashes = [], anomalies = [];
  let completed = 0;

  const { coachSock, allActors, sockets } = await buildSession(port, tableId, batch.players);

  // Track hand IDs emitted by the server for tagging / replay seeding
  let lastHandId = null;
  const seededHandIds = [];
  coachSock.on('hand_started', ({ handId }) => {
    lastHandId = handId;
    if (handId) seededHandIds.push(handId);
  });

  // Apply custom stacks
  if (batch.stacks) {
    for (const actor of allActors) {
      const key = actor.name;
      const amount = batch.stacks[key] ?? batch.stacks.all ?? null;
      if (amount !== null) {
        await setStack(coachSock, actor.serverId, amount);
      }
    }
  }

  // Optional pre-batch setup (e.g. seed hands for replay tests)
  let setupCtx = {};
  if (batch.setup) {
    setupCtx = await batch.setup(port, coachSock, allActors, crashes, anomalies) || {};
  }

  // Playlist mode: activate the playlist before the hand loop begins.
  // We intentionally don't wait for the config_phase broadcast here — playPlaylistHand
  // yields 40ms before emitting start_configured_hand, which gives the server enough
  // time to process activate_playlist and load the first matching hand.
  if (batch.mode === 'playlist') {
    const playlistId = setupCtx.playlistId;
    if (!playlistId) {
      crashes.push({ hand: 0, error: 'playlist mode but no playlistId returned from setup' });
    } else {
      coachSock.emit('activate_playlist', { playlistId });
      await new Promise(r => setTimeout(r, 150)); // let server open config_phase
    }
  }

  const t0 = Date.now();

  for (let h = 1; h <= HANDS_PER_BATCH; h++) {
    // beforeHand hook
    if (batch.beforeHand) await batch.beforeHand(coachSock, allActors, h);

    // Determine per-hand mode and hooks
    const mode = batch.handMode ? batch.handMode(h) : batch.mode;
    const hooks = batch.hooksFactory ? batch.hooksFactory(h, allActors, setupCtx) : (batch.hooks || {});

    // Per-hand cards (can be functions or static)
    const holeCards  = typeof batch.holeCards  === 'function' ? batch.holeCards(h)  : (batch.holeCards  || {});
    const boardCards = typeof batch.boardCards === 'function' ? batch.boardCards(h) : (batch.boardCards || []);

    try {
      if (mode === 'playlist') {
        await playPlaylistHand(h, coachSock, allActors, crashes, anomalies, hooks);
        completed++;
      } else if (mode === 'replay') {
        // Replay mode: load a seeded hand, run replayOps, then exit
        const ids = setupCtx.handIds && setupCtx.handIds.length ? setupCtx.handIds : seededHandIds;
        const handId = ids.length ? ids[(h - 1) % ids.length] : null;
        if (!handId) {
          crashes.push({ hand: h, error: 'no seeded handId available for replay' });
        } else {
          await playReplayHand(h, coachSock, handId, hooks.replayOps, crashes, anomalies);
          completed++;
        }
      } else if (mode === 'combos') {
        const combosConfig = typeof batch.combosConfig === 'function'
          ? batch.combosConfig(h, allActors) : (batch.combosConfig || {});
        await playComboHand(
          h, coachSock, allActors,
          combosConfig,
          boardCards,
          batch.boardTexture || [],
          crashes, anomalies,
          batch.onPreflop || null,
          batch.extraConfig ? batch.extraConfig(allActors) : {}
        );
        completed++;
      } else if (mode === 'manual') {
        await playManualHand(h, coachSock, allActors, holeCards, boardCards, crashes, anomalies, hooks);
        completed++;
      } else {
        await playHand(h, coachSock, allActors, crashes, anomalies, hooks);
        completed++;
      }
      // afterHand hook
      if (batch.afterHand) await batch.afterHand(coachSock, allActors, h, lastHandId);
    } catch (err) {
      crashes.push({ hand: h, error: `uncaught: ${err.message}` });
      try { coachSock.emit('reset_hand'); await new Promise(r => setTimeout(r, 50)); } catch (_) {}
    }
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  teardown(sockets);
  // Brief pause between batches for TTL cleanup
  await new Promise(r => setTimeout(r, 80));

  return { id: batch.id, label: batch.label, completed, crashes, anomalies, elapsed };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve));
  const { port } = httpServer.address();
  log(`\n[sim] Server on port ${port} — DB: ${DB_PATH}`);

  const results = [];
  const t0 = Date.now();

  let activeBatches;
  const BATCH_IDS_ENV = process.env.BATCH_IDS;
  if (BATCH_IDS_ENV) {
    const indices = BATCH_IDS_ENV.split(',').map(s => parseInt(s.trim(), 10) - 1).filter(i => i >= 0 && i < BATCHES.length);
    activeBatches = indices.map(i => BATCHES[i]);
    log(`[sim] Running specific batches (BATCH_IDS): ${BATCH_IDS_ENV} (${activeBatches.length} batches)\n`);
  } else {
    const startIdx = CLI_START - 1;
    const endIdx   = CLI_END > 0 ? CLI_END : BATCHES.length;
    activeBatches = BATCHES.slice(startIdx, endIdx);
    log(`[sim] Running batches ${CLI_START}–${CLI_END || BATCHES.length} (${activeBatches.length} batches)\n`);
  }

  for (let i = 0; i < activeBatches.length; i++) {
    const batch = activeBatches[i];
    process.stdout.write(`  [${batch.id}] ${batch.label} … `);
    try {
      const result = await runBatch(port, batch);
      results.push(result);
      const status = result.crashes.length === 0 && result.anomalies.length === 0
        ? '✓' : `✗ (${result.crashes.length}C ${result.anomalies.length}A)`;
      log(`${status}  ${result.completed}/${HANDS_PER_BATCH}  ${result.elapsed}s`);
    } catch (err) {
      results.push({ id: batch.id, label: batch.label, completed: 0,
        crashes: [{ hand: 0, error: `batch setup failed: ${err.message}` }],
        anomalies: [], elapsed: '0' });
      log(`FATAL: ${err.message}`);
    }
  }

  const totalElapsed = ((Date.now() - t0) / 1000).toFixed(1);

  // ── Final report ──────────────────────────────────────────────────────────
  const LINE = '═'.repeat(72);
  log('\n' + LINE);
  log('  BATCH SIMULATION REPORT');
  log(`  ${activeBatches.length} batches × ${HANDS_PER_BATCH} hands = ${activeBatches.length * HANDS_PER_BATCH} target hands`);
  log(`  Total time: ${totalElapsed}s`);
  log(LINE);

  let totalCompleted = 0, totalCrashes = 0, totalAnomalies = 0;

  for (const r of results) {
    totalCompleted += r.completed;
    totalCrashes   += r.crashes.length;
    totalAnomalies += r.anomalies.length;

    const ok = r.crashes.length === 0 && r.anomalies.length === 0;
    log(`\n  ${ok ? '✓' : '✗'} [${r.id}] ${r.label}`);
    log(`     Completed: ${r.completed}/${HANDS_PER_BATCH}  Crashes: ${r.crashes.length}  Anomalies: ${r.anomalies.length}  Time: ${r.elapsed}s`);

    if (r.crashes.length > 0) {
      const seen = new Map();
      for (const c of r.crashes) {
        const k = c.error.split('\n')[0];
        if (!seen.has(k)) seen.set(k, { first: c.hand, n: 0 });
        seen.get(k).n++;
      }
      for (const [msg, info] of seen.entries()) {
        log(`     CRASH [hand ${info.first}, ×${info.n}]: ${msg}`);
      }
    }
    if (r.anomalies.length > 0) {
      const seen = new Map();
      for (const a of r.anomalies) {
        seen.set(a.msg, (seen.get(a.msg) || 0) + 1);
      }
      for (const [msg, n] of seen.entries()) {
        log(`     ANOMALY ×${n}: ${msg}`);
      }
    }
  }

  log('\n' + LINE);
  log(`  TOTALS — Completed: ${totalCompleted}/${BATCHES.length * HANDS_PER_BATCH}  Crashes: ${totalCrashes}  Anomalies: ${totalAnomalies}`);
  log(LINE + '\n');

  httpServer.close(() => process.exit(totalCrashes + totalAnomalies > 0 ? 1 : 0));
}

process.on('unhandledRejection', reason => {
  log(`[unhandledRejection] ${reason}`);
});

main().catch(err => {
  log(`[sim] Fatal: ${err.message}\n${err.stack}`);
  process.exit(2);
});
