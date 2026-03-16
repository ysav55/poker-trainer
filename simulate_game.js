#!/usr/bin/env node
/**
 * simulate_game.js
 *
 * Simulates 1000 hands between 1 coach and 3 registered players.
 * Actions are chosen randomly — fold / check / call / raise (random legal amount).
 *
 * Uses an in-memory SQLite database (DATABASE_PATH=:memory:) so the
 * production DB is completely untouched.
 *
 * Run:  node simulate_game.js
 */

'use strict';

// ─── 0. Use an in-memory database ─────────────────────────────────────────────
process.env.DATABASE_PATH = process.env.DATABASE_PATH || './sim_results.db';

// ─── 1. Boot the server in-process ───────────────────────────────────────────
const { httpServer } = require('./server/index');

const ioc     = require('./server/node_modules/socket.io-client');
const http    = require('http');

// ─── 2. Config ────────────────────────────────────────────────────────────────
const TABLE_ID     = 'sim-table';
const TARGET_HANDS = parseInt(process.argv[2], 10) || 1000;
const LOG_INTERVAL = Math.max(1, Math.floor(TARGET_HANDS / 20));

// ─── 3. Tracking ─────────────────────────────────────────────────────────────
const crashes   = [];
const anomalies = [];
let handsCompleted = 0;
let wonByFold      = 0;
let wonByShowdown  = 0;

function log(msg) { process.stdout.write(msg + '\n'); }

// ─── 4. Helpers ───────────────────────────────────────────────────────────────

/** Wait for an event on a socket, reject on timeout */
function waitFor(socket, event, ms = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timeout waiting for '${event}' (${ms}ms)`));
    }, ms);
    function handler(data) { clearTimeout(timer); resolve(data); }
    socket.once(event, handler);
  });
}

/** POST JSON to the server and return parsed response body */
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
    req.write(payload);
    req.end();
  });
}

/** Create a socket.io client on the given port */
function mkSocket(port) {
  return ioc(`http://localhost:${port}`, { transports: ['websocket'], reconnection: false });
}

/** Pick a random valid action for the player whose turn it is */
function pickAction(state) {
  const me = state.players.find(p => p.id === state.current_turn);
  if (!me || me.stack <= 0) return { action: 'fold' };

  const canCheck = me.current_bet >= state.current_bet;
  // Total chips the player can put in = already committed + stack remaining
  const totalAvail = me.current_bet + me.stack;
  const minRaiseTotal = state.current_bet + state.min_raise; // minimum total bet level to raise
  const canRaise = state.min_raise > 0 && totalAvail >= minRaiseTotal;

  const options = ['fold'];
  if (canCheck) options.push('check');
  else          options.push('call');
  if (canRaise) options.push('raise');

  const action = options[Math.floor(Math.random() * options.length)];
  if (action === 'raise') {
    // amount = total bet level sent to server; server checks (amount - current_bet) >= min_raise
    const extra = Math.floor(Math.random() * state.min_raise * 2);
    const amount = Math.min(minRaiseTotal + extra, totalAvail);
    return { action: 'raise', amount };
  }
  return { action };
}

// ─── 5. Main ──────────────────────────────────────────────────────────────────

async function main() {
  // Start server on a random OS-assigned port
  await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve));
  const { port } = httpServer.address();
  log(`\n[sim] Server on port ${port} (DATABASE_PATH=${process.env.DATABASE_PATH || './sim_results.db'})`);

  // Use a unique suffix per run to avoid 409 conflicts if the DB is shared
  const RUN_ID = process.pid;
  const PLAYERS = [
    { name: `Alice_${RUN_ID}`, email: `alice_${RUN_ID}@sim.test`, password: 'password1' },
    { name: `Bob_${RUN_ID}`,   email: `bob_${RUN_ID}@sim.test`,   password: 'password2' },
    { name: `Carol_${RUN_ID}`, email: `carol_${RUN_ID}@sim.test`, password: 'password3' },
  ];

  for (const p of PLAYERS) {
    const { status, body } = await postJSON(port, '/api/auth/register', {
      name: p.name, email: p.email, password: p.password,
    });
    if (!body.stableId) throw new Error(`Register failed for ${p.name} (HTTP ${status}): ${JSON.stringify(body)}`);
    p.stableId = body.stableId;
  }
  log(`[sim] Registered: ${PLAYERS.map(p => `${p.name} (${p.stableId.slice(0, 8)}…)`).join(', ')}`);

  // Create and connect sockets
  const coachSock   = mkSocket(port);
  const pSocks      = PLAYERS.map(() => mkSocket(port));
  const allSockets  = [coachSock, ...pSocks];

  // Collect server-side error events so they don't pollute anomalies with normal auth errors
  // (we only care about unexpected ones)

  // Join the room
  coachSock.emit('join_room', { name: 'Coach', isCoach: true, tableId: TABLE_ID });
  await waitFor(coachSock, 'room_joined', 4000);

  for (let i = 0; i < PLAYERS.length; i++) {
    const p = PLAYERS[i];
    pSocks[i].emit('join_room', {
      name: p.name, isCoach: false, isSpectator: false,
      stableId: p.stableId, tableId: TABLE_ID,
    });
    const joined = await waitFor(pSocks[i], 'room_joined', 4000);
    p.serverId = joined.playerId;
  }

  // Resolve coach serverId from the next game_state broadcast
  const COACH = { name: 'Coach', serverId: null };
  const firstState = await waitFor(coachSock, 'game_state', 4000);
  const coachPlayer = firstState.players.find(p => p.name === 'Coach' || p.isCoach);
  if (coachPlayer) COACH.serverId = coachPlayer.id;

  log(`[sim] All 4 clients joined '${TABLE_ID}'`);
  log(`[sim] Coach serverId: ${COACH.serverId}`);

  log(`\n[sim] Starting ${TARGET_HANDS} hands…\n`);

  const t0 = Date.now();

  // ── Hand loop ──────────────────────────────────────────────────────────────

  for (let handNum = 1; handNum <= TARGET_HANDS; handNum++) {
    // Refill stacks every 10 hands — keeps the game playable and tests
    // the adjust_stack event path continuously.
    if (handNum % 10 === 1 && handNum > 1) {
      const stateSnap = await new Promise(resolve => {
        coachSock.once('game_state', resolve);
        // Trigger a state broadcast by emitting a harmless adjust_stack of 0
        // or just wait briefly and re-read last state
        setTimeout(resolve.bind(null, null), 50);
      });
      const allPlayerIds = [
        ...(PLAYERS.map(p => p.serverId)),
        COACH.serverId,
      ].filter(Boolean);
      for (const pid of allPlayerIds) {
        coachSock.emit('adjust_stack', { playerId: pid, amount: 1000 });
      }
      // Brief pause for stack adjustments to land
      await new Promise(r => setTimeout(r, 50));
    }

    try {
      await playHand(handNum, port, coachSock, pSocks, PLAYERS, COACH);
      handsCompleted++;
    } catch (err) {
      crashes.push({ hand: handNum, phase: 'uncaught', error: err.message, stack: err.stack });
    }

    if (handNum % LOG_INTERVAL === 0) {
      const sec = ((Date.now() - t0) / 1000).toFixed(1);
      log(`  ✓ ${handNum}/${TARGET_HANDS}  crashes:${crashes.length}  anomalies:${anomalies.length}  ${sec}s`);
    }
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  // ── Final report ───────────────────────────────────────────────────────────
  printReport(elapsed);

  for (const s of allSockets) s.disconnect();
  httpServer.close(() => {
    process.exit(crashes.length > 0 || anomalies.length > 0 ? 1 : 0);
  });
}

// ─── 6. Single hand driver ────────────────────────────────────────────────────

async function playHand(handNum, _port, coachSock, pSocks, PLAYERS, COACH) {
  // Tell the coach socket to collect game_states
  const stateQueue = [];
  const stateWaiters = [];

  function onState(s) {
    if (stateWaiters.length > 0) {
      stateWaiters.shift()(s);
    } else {
      stateQueue.push(s);
    }
  }
  coachSock.on('game_state', onState);

  function nextState(ms = 5000) {
    if (stateQueue.length > 0) return Promise.resolve(stateQueue.shift());
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        const idx = stateWaiters.indexOf(resolve);
        if (idx !== -1) stateWaiters.splice(idx, 1);
        coachSock.off('error', onServerError);
        pSocks.forEach(s => s.off('error', onServerError));
        reject(new Error(`Timeout waiting for game_state (hand ${handNum})`));
      }, ms);
      // Race: resolve immediately if the server sends an error event on ANY socket
      function onServerError(data) {
        clearTimeout(t);
        const idx = stateWaiters.indexOf(resolve);
        if (idx !== -1) stateWaiters.splice(idx, 1);
        coachSock.off('error', onServerError);
        pSocks.forEach(s => s.off('error', onServerError));
        resolve({ _serverError: data?.message || JSON.stringify(data) });
      }
      coachSock.once('error', onServerError);
      pSocks.forEach(s => s.once('error', onServerError));
      stateWaiters.push(data => {
        clearTimeout(t);
        coachSock.off('error', onServerError);
        pSocks.forEach(s => s.off('error', onServerError));
        resolve(data);
      });
    });
  }

  try {
    // Start game
    coachSock.emit('start_game', { mode: 'rng' });

    const ACTIVE = new Set(['preflop', 'flop', 'turn', 'river', 'showdown']);
    let done = false;
    let steps = 0;
    const MAX_STEPS = 300;

    while (!done && steps < MAX_STEPS) {
      const state = await nextState();
      steps++;

      // Server rejected an action (e.g., start_game with wrong phase, out of chips)
      if (state._serverError) {
        anomalies.push({ hand: handNum, description: `server error: ${state._serverError}` });
        done = true;
        break;
      }

      // Hand over
      if (state.winner || state.showdown_result) {
        if (state.showdown_result) wonByShowdown++;
        else                        wonByFold++;
        done = true;
        break;
      }

      // Not in an active phase — skip (transient WAITING between hands)
      if (!ACTIVE.has(state.phase)) {
        continue;
      }

      // No current_turn: all-in runout — force the next street immediately.
      // The server only broadcasts in response to events, so without an action
      // the simulation would time out waiting for a state that never arrives.
      if (!state.current_turn) {
        coachSock.emit('force_next_street');
        continue;
      }

      // Find which socket should act (coach or player)
      const bet = pickAction(state);
      if (COACH.serverId && state.current_turn === COACH.serverId) {
        coachSock.emit('place_bet', bet);
      } else {
        const turnPlayer = PLAYERS.find(p => p.serverId === state.current_turn);
        if (!turnPlayer) {
          anomalies.push({ hand: handNum, description: `current_turn ${state.current_turn} not found among player sockets` });
          break;
        }
        const pIdx = PLAYERS.indexOf(turnPlayer);
        pSocks[pIdx].emit('place_bet', bet);
      }
    }

    if (steps >= MAX_STEPS) {
      anomalies.push({ hand: handNum, description: `Exceeded ${MAX_STEPS} steps — possible infinite loop` });
    }
  } finally {
    coachSock.off('game_state', onState);

    // Reset: emit reset_hand, then wait until server confirms phase='waiting'.
    // Must not call start_game until phase='waiting' or startGame() errors.
    coachSock.emit('reset_hand');
    await new Promise(resolve => {
      const timer = setTimeout(resolve, 1000);
      function onWaiting(s) {
        if (s && s.phase === 'waiting') {
          clearTimeout(timer);
          coachSock.off('game_state', onWaiting);
          resolve();
        }
      }
      coachSock.on('game_state', onWaiting);
    });
  }
}

// ─── 7. Report ────────────────────────────────────────────────────────────────

function printReport(elapsed) {
  const LINE = '═'.repeat(62);
  log('\n' + LINE);
  log('  SIMULATION REPORT — 1 Coach + 3 Players, RNG mode');
  log(LINE);
  log(`  Target hands       : ${TARGET_HANDS}`);
  log(`  Completed hands    : ${handsCompleted}`);
  log(`  Won by fold        : ${wonByFold}`);
  log(`  Won at showdown    : ${wonByShowdown}`);
  log(`  Crashes            : ${crashes.length}`);
  log(`  Anomalies          : ${anomalies.length}`);
  log(`  Total time         : ${elapsed}s`);
  log(LINE);

  if (crashes.length === 0) {
    log('\n  ✓ No crashes.');
  } else {
    log('\n── CRASHES ' + '─'.repeat(50));
    // Deduplicate by error message
    const seen = new Map();
    for (const c of crashes) {
      const key = c.error;
      if (!seen.has(key)) seen.set(key, { first: c.hand, count: 0 });
      seen.get(key).count++;
    }
    for (const [msg, info] of seen.entries()) {
      log(`\n  [First at hand ${info.first}, ×${info.count}]`);
      log(`  Error: ${msg}`);
      // Print one full stack trace for each unique error
      const sample = crashes.find(c => c.error === msg);
      if (sample?.stack) {
        sample.stack.split('\n').slice(0, 6).forEach(l => log(`    ${l}`));
      }
    }
  }

  if (anomalies.length === 0) {
    log('\n  ✓ No anomalies.');
  } else {
    log('\n── ANOMALIES ' + '─'.repeat(48));
    const counts = {};
    for (const a of anomalies) {
      counts[a.description] = (counts[a.description] || 0) + 1;
    }
    for (const [desc, n] of Object.entries(counts)) {
      log(`  × ${desc} (×${n})`);
    }
  }

  log('\n' + LINE + '\n');
}

// ─── 8. Safety nets ───────────────────────────────────────────────────────────

process.on('unhandledRejection', reason => {
  crashes.push({ hand: handsCompleted, phase: 'unhandledRejection', error: String(reason) });
});

main().catch(err => {
  log(`[sim] Fatal error: ${err.message}`);
  log(err.stack);
  process.exit(2);
});
