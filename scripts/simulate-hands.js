#!/usr/bin/env node
'use strict';

/**
 * simulate-hands.js
 *
 * Multi-player hand simulation against staging/local server.
 * Validates end-to-end gameplay: hand persistence, hand analyzer,
 * DB writes to hands/hand_players/hand_actions/hand_tags.
 *
 * Usage:
 *   BASE_URL=https://poker-trainer-staging.fly.dev node scripts/simulate-hands.js
 *   node scripts/simulate-hands.js  (defaults to localhost:3001)
 */

const path = require('path');
process.env.NODE_PATH = path.join(__dirname, '../server/node_modules');
require('module').Module._initPaths();

require('dotenv').config({ path: path.join(__dirname, '../.env') });
const ioClient = require('socket.io-client');

const BASE_URL         = process.env.BASE_URL || 'http://localhost:3001';
const IDOPEER_NAME     = 'Idopeer';
const IDOPEER_PASSWORD = '123456789';
const ADMIN_NAME       = 'Admin_yonatan';
const ADMIN_PASSWORD   = '123456789';
const SIM_PASSWORD     = '12345678';
const HANDS_PER_COUNT  = parseInt(process.env.HANDS_PER_COUNT || '30', 10);
const HAND_TIMEOUT_MS  = 60_000;
const PAUSE_MS         = 500; // between hands in coached mode

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

async function apiFetch(urlPath, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(`${BASE_URL}${urlPath}`, { ...opts, signal: controller.signal });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || json.message || `HTTP ${res.status}`);
    return json;
  } finally {
    clearTimeout(timer);
  }
}

async function login(name, password) {
  const json = await apiFetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, password }),
  });
  return { stableId: json.stableId, token: json.token, name };
}

async function createTable(jwt, mode) {
  const label = mode === 'coached_cash' ? 'SimCoached' : 'SimUncoached';
  const json = await apiFetch('/api/tables', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ name: label, mode, privacy: 'open', bigBlind: 2, smallBlind: 1 }),
  });
  return json.id;
}

// ─── Socket helpers ───────────────────────────────────────────────────────────

function connectSocket(token) {
  return new Promise((resolve, reject) => {
    const socket = ioClient(BASE_URL, { auth: { token }, reconnection: false });
    const timer = setTimeout(() => reject(new Error('Socket connect timeout')), 10_000);
    socket.once('connect',       () => { clearTimeout(timer); resolve(socket); });
    socket.once('connect_error', err => { clearTimeout(timer); reject(err); });
  });
}

function joinTable(socket, tableId, name) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`join_room timeout for ${name}`)), 10_000);
    socket.once('room_joined', data => { clearTimeout(timer); resolve(data); });
    socket.emit('join_room', { name, tableId });
  });
}

// ─── Action strategy ─────────────────────────────────────────────────────────

function randomAction(gameState, playerStableId) {
  const me = (gameState.players || []).find(p => p.stableId === playerStableId);
  if (!me) return { action: 'fold' };

  const topBet  = gameState.current_bet || 0;
  const myBet   = me.current_bet || 0;
  const bb      = gameState.big_blind || 2;
  const canCheck = topBet === 0 || myBet >= topBet;

  if (canCheck) {
    if (Math.random() < 0.3) return { action: 'raise', amount: topBet + bb * 2 };
    return { action: 'check' };
  }

  const r = Math.random();
  if (r < 0.6) return { action: 'call' };
  if (r < 0.8) return { action: 'fold' };
  return { action: 'raise', amount: Math.max(topBet * 2, topBet + bb) };
}

// ─── Core hand runner ─────────────────────────────────────────────────────────
//
// playerSocketsBySockId: { [socket.id]: { socket, stableId, name } }
//   Built after each socket connects — socket.id is the server-assigned transport ID.
//   action_timer.playerId is this socket.id, so we must key by socket.id (not stableId).
//
// coachSocket: null for uncoached (AutoController deals). For coached, this socket
//   emits start_game and reset_hand.
//
// hand_complete payload: { winners: [{playerName}], potAwarded, splitPot, foldWin }
//   — no hand_id field; that's only in the server's activeHands map.
//
function runOneHand({ listenerSocket, playerSocketsBySockId, coachSocket, label }) {
  return new Promise((resolve) => {
    let latestState = null;
    let handStarted = false;
    let hasReset    = false;

    const cleanup = () => {
      listenerSocket.off('game_state',    onGameState);
      listenerSocket.off('action_timer',  onActionTimer);
      listenerSocket.off('hand_complete', onHandComplete);
      listenerSocket.off('error',         onServerError);
    };

    const timeoutHandle = setTimeout(() => {
      cleanup();
      console.error(`  ${label} — TIMEOUT`);
      resolve(null);
    }, HAND_TIMEOUT_MS);

    const onHandComplete = (result) => {
      clearTimeout(timeoutHandle);
      cleanup();
      const winner = result?.winners?.[0]?.playerName ?? (result?.foldWin ? '(fold)' : 'unknown');
      const pot    = result?.potAwarded ?? 0;
      console.log(`  ${label} — winner=${winner} pot=${pot}`);
      resolve({ winner, pot });
    };

    const onGameState = (state) => {
      if (!state) return;
      latestState = state;

      // Track when hand leaves waiting phase
      if (!handStarted && state.phase && state.phase !== 'waiting') handStarted = true;

      // In coached mode: detect hand end and trigger reset
      // winner_name is set on fold win; phase==='showdown' after cards are revealed
      if (coachSocket && handStarted && !hasReset) {
        if (state.winner_name || state.phase === 'showdown') {
          hasReset = true;
          coachSocket.emit('reset_hand');
        }
      }
    };

    const onActionTimer = (data) => {
      // Server emits null to cancel the timer — ignore
      if (!data || !data.playerId) return;

      const entry = playerSocketsBySockId[data.playerId];
      if (!entry || !latestState) return;

      const action = randomAction(latestState, entry.stableId);
      entry.socket.emit('place_bet', action);
    };

    const onServerError = ({ message } = {}) => {
      clearTimeout(timeoutHandle);
      cleanup();
      console.error(`  ${label} — SERVER ERROR: ${message}`);
      resolve(null);
    };

    listenerSocket.on('game_state',    onGameState);
    listenerSocket.on('action_timer',  onActionTimer);
    listenerSocket.on('hand_complete', onHandComplete);
    listenerSocket.once('error',       onServerError);

    // Coached: coach kicks off each hand manually
    if (coachSocket) {
      coachSocket.emit('start_game', { mode: 'rng' });
    }
    // Uncoached: AutoController deals automatically — no emit needed
  });
}

// ─── Coached scenario ─────────────────────────────────────────────────────────

async function runCoachedScenario(idoCreds, simPlayers) {
  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log('║ COACHED: Idopeer as coach, progressive 2→9 players   ║');
  console.log('╚═══════════════════════════════════════════════════════╝\n');

  const tableId = await createTable(idoCreds.token, 'coached_cash');
  console.log(`[coached] Table: ${tableId}`);

  const coachSocket = await connectSocket(idoCreds.token);
  await joinTable(coachSocket, tableId, idoCreds.name);
  console.log(`[coached] Coach joined: ${idoCreds.name} (sock=${coachSocket.id.slice(0, 8)})\n`);

  // socket.id keyed map — coach is also a seated player who receives action_timer
  const playerSocketsBySockId = {
    [coachSocket.id]: { socket: coachSocket, stableId: idoCreds.stableId, name: idoCreds.name },
  };

  let totalHands = 0;
  const maxPlayerCount = Math.min(simPlayers.length + 1, 9);

  for (let playerCount = 2; playerCount <= maxPlayerCount; playerCount++) {
    const nextPlayer = simPlayers[playerCount - 2]; // simPlayers[0] for playerCount=2
    if (!nextPlayer) break;

    const playerSocket = await connectSocket(nextPlayer.token);
    await joinTable(playerSocket, tableId, nextPlayer.name);
    playerSocketsBySockId[playerSocket.id] = {
      socket:   playerSocket,
      stableId: nextPlayer.stableId,
      name:     nextPlayer.name,
    };

    console.log(`[coached] ${nextPlayer.name} joined → ${playerCount}p`);

    for (let i = 1; i <= HANDS_PER_COUNT; i++) {
      totalHands++;
      const label = `[COACHED][${playerCount}p] Hand ${i}/${HANDS_PER_COUNT}`;
      let result = await runOneHand({ listenerSocket: coachSocket, playerSocketsBySockId, coachSocket, label });

      // If hand failed (timeout or error), try to top up broke players and retry once
      if (!result) {
        console.log(`  [RETRY] Topping up player stacks...`);
        for (const socketId of Object.keys(playerSocketsBySockId)) {
          coachSocket.emit('adjust_stack', { playerId: socketId, amount: 500 });
        }
        await new Promise(r => setTimeout(r, 1000)); // Wait for stack adjustment to settle
        result = await runOneHand({ listenerSocket: coachSocket, playerSocketsBySockId, coachSocket, label });
        if (!result) {
          console.error(`  Hand ${i}/${HANDS_PER_COUNT} failed twice — skipping`);
        }
      }

      await new Promise(r => setTimeout(r, PAUSE_MS));
    }

    console.log(`[coached] ${playerCount}p — ${HANDS_PER_COUNT} hands done\n`);
  }

  Object.values(playerSocketsBySockId).forEach(({ socket }) => socket.disconnect());
  console.log(`\n=== COACHED SCENARIO COMPLETE: ${totalHands} hands ===\n`);
  return totalHands;
}

// ─── Uncoached scenario ───────────────────────────────────────────────────────

async function runUnCoachedScenario(adminToken, simPlayers) {
  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log('║ UNCOACHED: AutoController, progressive 2→9 players   ║');
  console.log('╚═══════════════════════════════════════════════════════╝\n');

  const tableId = await createTable(adminToken, 'uncoached_cash');
  console.log(`[uncoached] Table: ${tableId}`);

  const playerSocketsBySockId = {};
  let totalHands = 0;
  const maxPlayerCount = Math.min(simPlayers.length, 9);

  for (let playerCount = 2; playerCount <= maxPlayerCount; playerCount++) {
    const nextPlayer = simPlayers[playerCount - 2];
    if (!nextPlayer) break;

    const playerSocket = await connectSocket(nextPlayer.token);
    await joinTable(playerSocket, tableId, nextPlayer.name);
    playerSocketsBySockId[playerSocket.id] = {
      socket:   playerSocket,
      stableId: nextPlayer.stableId,
      name:     nextPlayer.name,
    };

    const seated = Object.values(playerSocketsBySockId).map(e => e.name).join(', ');
    console.log(`[uncoached] ${nextPlayer.name} joined → ${playerCount}p (${seated})`);

    const listenerSocket = Object.values(playerSocketsBySockId)[0].socket;

    for (let i = 1; i <= HANDS_PER_COUNT; i++) {
      totalHands++;
      const label = `[UNCOACHED][${playerCount}p] Hand ${i}/${HANDS_PER_COUNT}`;
      // AutoController deals; no coachSocket needed
      let result = await runOneHand({ listenerSocket, playerSocketsBySockId, coachSocket: null, label });
      // If hand failed, retry once (no stack adjustment available without coach)
      if (!result) {
        console.log(`  [RETRY] Attempting hand again...`);
        await new Promise(r => setTimeout(r, 500));
        result = await runOneHand({ listenerSocket, playerSocketsBySockId, coachSocket: null, label });
        if (!result) {
          console.error(`  Hand ${i}/${HANDS_PER_COUNT} failed twice — skipping`);
        }
      }
      // AutoController has a 2000ms auto-deal pause built in — no extra sleep needed
    }

    console.log(`[uncoached] ${playerCount}p — ${HANDS_PER_COUNT} hands done\n`);
  }

  Object.values(playerSocketsBySockId).forEach(({ socket }) => socket.disconnect());
  console.log(`\n=== UNCOACHED SCENARIO COMPLETE: ${totalHands} hands ===\n`);
  return totalHands;
}

// ─── SimPlayer setup ──────────────────────────────────────────────────────────

async function ensureSimPlayers(adminToken) {
  const simPlayers = [];

  for (let i = 1; i <= 8; i++) {
    const name = `SimPlayer${i}`;
    let created = false;

    // Try creating; 409/500 means name taken — fall through to login
    try {
      await apiFetch('/api/admin/users', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body:    JSON.stringify({ displayName: name, password: SIM_PASSWORD, role: 'coached_student' }),
      });
      created = true;
    } catch (_) { /* name likely taken */ }

    try {
      const creds = await login(name, SIM_PASSWORD);
      simPlayers.push({ name, stableId: creds.stableId, token: creds.token });
      console.log(`  ${name} ${created ? 'created' : 'exists'} — ready`);
    } catch (err) {
      console.error(`  ${name} login failed: ${err.message} — skipping`);
    }

    // Spread logins to stay under authLimiter (20 req / 15 min)
    await new Promise(r => setTimeout(r, 400));
  }

  return simPlayers;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n════════════════════════════════════════════════════════');
  console.log(`  Multi-Player Hand Simulation`);
  console.log(`  Target : ${BASE_URL}`);
  console.log(`  Hands  : ${HANDS_PER_COUNT} per player count (${HANDS_PER_COUNT * 8 * 2} total)`);
  console.log(`  Time   : ${new Date().toISOString()}`);
  console.log('════════════════════════════════════════════════════════\n');

  console.log('[startup] Logging in as admin...');
  const adminCreds = await login(ADMIN_NAME, ADMIN_PASSWORD);
  console.log(`[startup] Admin: ${adminCreds.name} (${adminCreds.stableId.slice(0, 8)})\n`);

  console.log('[startup] Setting up SimPlayer1..8...');
  const simPlayers = await ensureSimPlayers(adminCreds.token);
  if (simPlayers.length < 2) throw new Error(`Need ≥2 SimPlayers, got ${simPlayers.length}`);
  console.log(`[startup] ${simPlayers.length} SimPlayers ready\n`);

  await new Promise(r => setTimeout(r, 400));
  console.log('[startup] Logging in Idopeer...');
  const idoCreds = await login(IDOPEER_NAME, IDOPEER_PASSWORD);
  console.log(`[startup] Idopeer ready (${idoCreds.stableId.slice(0, 8)})\n`);

  const coachedCount   = await runCoachedScenario(idoCreds, simPlayers);
  const uncoachedCount = await runUnCoachedScenario(adminCreds.token, simPlayers);

  console.log('════════════════════════════════════════════════════════');
  console.log(`  SIMULATION COMPLETE: ${coachedCount + uncoachedCount} hands`);
  console.log('════════════════════════════════════════════════════════\n');
  console.log('Next: wait ~10s then run  node scripts/verify-simulation.js\n');

  process.exit(0);
}

main().catch(err => {
  console.error('\n✗ FATAL:', err.message);
  process.exit(1);
});