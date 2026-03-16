#!/usr/bin/env node
/**
 * play_vs_bots.js
 *
 * Registers N bot players and connects them to a running poker-trainer
 * server so you can play against them from your browser as coach.
 *
 * You control the game (Start Hand, Pause, Undo, etc.).
 * Bots act automatically on their turns with a configurable delay.
 *
 * Usage:
 *   node play_vs_bots.js [options]
 *
 * Options:
 *   --table TABLE   Table name to join (default: "bots")
 *   --bots N        Number of bots (3–6, default: 3)
 *   --delay MS      Milliseconds between bot actions (default: 1200)
 *   --port PORT     Server port (default: 3001)
 *   --host HOST     Server host (default: localhost)
 *
 * Example:
 *   node play_vs_bots.js --table my-game --bots 4 --delay 800
 *
 * Then open http://localhost:5173 (dev) or http://localhost:3001 (prod) and join table "my-game" as Coach.
 * The bots always connect to port 3001 (the socket server) regardless of which URL you use.
 */

'use strict';

const http = require('http');
const ioc  = require('./server/node_modules/socket.io-client');

// ─── Parse CLI args ──────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function getArg(name, fallback) {
  const i = args.indexOf('--' + name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}

const TABLE   = getArg('table', 'bots');
const N_BOTS  = Math.min(6, Math.max(1, parseInt(getArg('bots', '3'), 10)));
const DELAY   = Math.max(200, parseInt(getArg('delay', '1200'), 10));
const PORT    = parseInt(getArg('port', '3001'), 10);
const HOST    = getArg('host', 'localhost');
const BASE    = `http://${HOST}:${PORT}`;

// Use "Bot" prefix to avoid colliding with real player accounts
const BOT_NAMES = ['Bot1', 'Bot2', 'Bot3', 'Bot4', 'Bot5', 'Bot6'];

// ─── HTTP helper ─────────────────────────────────────────────────────────────

function postJSON(path, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request(
      { hostname: HOST, port: PORT, path, method: 'POST',
        headers: { 'Content-Type': 'application/json',
                   'Content-Length': Buffer.byteLength(payload) } },
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

// ─── Bot action logic ─────────────────────────────────────────────────────────

function pickAction(state, botId) {
  const me = state.players.find(p => p.id === botId);
  if (!me || me.stack <= 0) return { action: 'fold' };

  const canCheck  = me.current_bet >= state.current_bet;
  const minRaise  = state.current_bet + state.min_raise;
  const maxRaise  = me.current_bet + me.stack;
  const canRaise  = state.min_raise > 0 && maxRaise >= minRaise;

  const options = ['fold'];
  if (canCheck) options.push('check', 'check'); // weight check higher
  else          options.push('call', 'call');
  if (canRaise) options.push('raise');

  const action = options[Math.floor(Math.random() * options.length)];
  if (action === 'raise') {
    // Pick a raise between min and 3× min (capped at all-in)
    const extra = Math.floor(Math.random() * state.min_raise * 2);
    return { action: 'raise', amount: Math.min(minRaise + extra, maxRaise) };
  }
  return { action };
}

// ─── Register or login a bot ──────────────────────────────────────────────────

async function ensureRegistered(name) {
  const email    = `${name.toLowerCase()}.bot@play.local`;
  const password = 'botpass123';

  // Try register
  const reg = await postJSON('/api/auth/register', { name, email, password });
  if (reg.body.stableId) return { stableId: reg.body.stableId, password };

  // Already exists — log in
  if (reg.body.error === 'name_taken' || reg.body.error === 'email_taken') {
    const login = await postJSON('/api/auth/login', { name, password });
    if (login.body.stableId) return { stableId: login.body.stableId, password };
    // Name exists but with different password (user account) — try a suffixed bot name
    throw new Error(
      `Cannot register bot "${name}" — that name is taken by a real account.\n` +
      `Use a different --bots count or rename the conflict.`
    );
  }

  throw new Error(`Register failed for ${name}: ${JSON.stringify(reg.body)}`);
}

// ─── Connect one bot socket ───────────────────────────────────────────────────

function connectBot({ name, stableId, tableId }) {
  return new Promise((resolve, reject) => {
    const sock = ioc(BASE, { transports: ['websocket'], reconnection: true,
                              reconnectionDelay: 1000, reconnectionAttempts: 10 });

    let serverId = null;
    let acting   = false;

    sock.on('connect', () => {
      sock.emit('join_room', { name, isCoach: false, isSpectator: false,
                               stableId, tableId });
    });

    sock.on('room_joined', (data) => {
      serverId = data.playerId;
      console.log(`  ✓ ${name} joined table "${tableId}" (id: ${serverId.slice(0, 8)}…)`);
      resolve({ name, sock, stableId, serverId });
    });

    sock.on('game_state', (state) => {
      // It's this bot's turn
      if (state.current_turn !== serverId) return;
      if (acting) return;
      acting = true;

      const bet = pickAction(state, serverId);
      const label = bet.action === 'raise' ? `raise ${bet.amount}` : bet.action;

      setTimeout(() => {
        sock.emit('place_bet', bet);
        console.log(`  [${name}] ${label}`);
        acting = false;
      }, DELAY);
    });

    sock.on('error', (err) => {
      console.error(`  [${name}] server error: ${err?.message || JSON.stringify(err)}`);
    });

    sock.on('disconnect', (reason) => {
      if (reason !== 'io client disconnect') {
        console.log(`  [${name}] disconnected (${reason}) — reconnecting…`);
      }
    });

    sock.on('connect_error', (err) => {
      reject(new Error(`Cannot connect to ${BASE}: ${err.message}`));
    });

    // Reject if room_joined never fires
    setTimeout(() => reject(new Error(`${name}: join_room timed out`)), 8000);
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nPoker Bot Runner`);
  console.log(`  Server : ${BASE}`);
  console.log(`  Table  : ${TABLE}`);
  console.log(`  Bots   : ${N_BOTS} (${BOT_NAMES.slice(0, N_BOTS).join(', ')})`);
  console.log(`  Delay  : ${DELAY}ms per action`);
  console.log('');

  // Verify the server is reachable
  try {
    await postJSON('/api/auth/login', { name: '__ping__', password: 'x' });
  } catch (err) {
    console.error(`✗ Cannot reach server at ${BASE}`);
    console.error(`  Make sure the server is running: cd server && node index.js`);
    process.exit(1);
  }

  // Register bots
  console.log('Registering bots…');
  const botCreds = [];
  for (const name of BOT_NAMES.slice(0, N_BOTS)) {
    try {
      const creds = await ensureRegistered(name);
      botCreds.push({ name, ...creds });
      console.log(`  ✓ ${name} ready`);
    } catch (err) {
      console.error(`  ✗ ${err.message}`);
      process.exit(1);
    }
  }

  // Connect all bots to the table
  console.log(`\nConnecting to table "${TABLE}"…`);
  const bots = [];
  for (const cred of botCreds) {
    try {
      const bot = await connectBot({ name: cred.name, stableId: cred.stableId,
                                     tableId: TABLE });
      bots.push(bot);
    } catch (err) {
      console.error(`  ✗ ${err.message}`);
      process.exit(1);
    }
  }

  console.log(`\n✓ All bots seated. Open your browser and join table "${TABLE}" as Coach.`);
  console.log(`  Dev  → http://localhost:5173  (if running Vite dev server)`);
  console.log(`  Prod → ${BASE}  (if running built client)`);
  console.log(`\n  Bots will act automatically on their turns (${DELAY}ms delay).`);
  console.log(`  Press Ctrl+C to stop.\n`);

  // Keep process alive; handle clean shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down bots…');
    for (const bot of bots) bot.sock.disconnect();
    setTimeout(() => process.exit(0), 300);
  });
}

main().catch(err => {
  console.error(`\nFatal: ${err.message}`);
  process.exit(1);
});
