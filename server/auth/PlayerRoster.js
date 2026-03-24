'use strict';

/**
 * PlayerRoster — validates player credentials against players.csv.
 *
 * The CSV file is the single source of truth for who can log in and
 * what role they have (coach / student).  The DB stores stableIds for
 * hand-history persistence but is NOT consulted for authentication.
 *
 * CSV format (one player per line):
 *   name,bcrypt_hash,role
 *
 * Lines starting with # and blank lines are ignored.
 * Whitespace around each field is trimmed.
 * Duplicate names: last entry wins (a warning is printed at startup).
 * Invalid role (not 'coach' or 'student'): row skipped with a warning.
 *
 * Usage:
 *   const PlayerRoster = require('./auth/PlayerRoster');
 *   // load() is called automatically on require.
 *
 *   const entry = await PlayerRoster.authenticate('Alice', 'mypass');
 *   // → { name: 'Alice', passwordHash: '...', role: 'student' } | null
 *
 *   const role = PlayerRoster.getRole('Alice');
 *   // → 'coach' | 'student' | null
 *
 *   PlayerRoster.reload();   // re-read file without restarting the server
 */

const fs     = require('fs');
const path   = require('path');
const bcrypt = require('bcrypt');

const ROSTER_PATH = process.env.ROSTER_PATH
  || path.join(__dirname, '..', '..', 'players.csv');

/** @type {Map<string, { name: string, password: string, role: 'coach'|'student' }>} */
let _roster = new Map();

// ─── CSV parser ───────────────────────────────────────────────────────────────

function _parse(raw) {
  const roster = new Map();
  const lines  = raw.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    // Split on the first three commas only (allows future extra columns)
    const parts = trimmed.split(',');
    if (parts.length < 3) {
      console.warn(`[PlayerRoster] Skipping malformed line ${i + 1}: "${trimmed}"`);
      continue;
    }

    const name     = parts[0].trim();
    const password = parts[1].trim();
    const roleRaw  = parts[2].trim().toLowerCase();

    if (!name) {
      console.warn(`[PlayerRoster] Skipping line ${i + 1}: name is empty`);
      continue;
    }

    if (roleRaw !== 'coach' && roleRaw !== 'student') {
      console.warn(`[PlayerRoster] Skipping line ${i + 1}: invalid role "${parts[2].trim()}" (must be coach or student)`);
      continue;
    }

    const key = name.toLowerCase();
    if (roster.has(key)) {
      console.warn(`[PlayerRoster] Duplicate name "${name}" at line ${i + 1} — overwriting previous entry`);
    }

    roster.set(key, { name, passwordHash: password, role: roleRaw });
  }

  return roster;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * load() — reads and parses players.csv synchronously.
 * Called automatically on module init. Process exits with error if file missing.
 */
function load() {
  if (!fs.existsSync(ROSTER_PATH)) {
    console.error(`[PlayerRoster] FATAL: players.csv not found at ${ROSTER_PATH}`);
    console.error('[PlayerRoster] Create the file with at least one coach entry before starting the server.');
    process.exit(1);
  }
  const raw = fs.readFileSync(ROSTER_PATH, 'utf8');
  _roster = _parse(raw);
  console.log(`[PlayerRoster] Loaded ${_roster.size} player(s) from ${ROSTER_PATH}`);
}

/**
 * reload() — re-reads players.csv without restarting the server.
 * Useful after adding/removing players in production.
 */
function reload() {
  console.log('[PlayerRoster] Reloading roster...');
  load();
}

/**
 * authenticate(name, password)
 * Async — returns the roster record if credentials match, or null.
 * Password is verified against a bcrypt hash; name lookup is case-insensitive.
 */
async function authenticate(name, password) {
  if (!name || !password) return null;
  const entry = _roster.get(name.trim().toLowerCase());
  if (!entry) return null;
  const match = await bcrypt.compare(password, entry.passwordHash);
  if (!match) return null;
  return entry;
}

/**
 * getRole(name)
 * Returns 'coach' | 'student' | null (null if name not in roster).
 */
function getRole(name) {
  if (!name) return null;
  const entry = _roster.get(name.trim().toLowerCase());
  return entry ? entry.role : null;
}

// ─── Auto-load on require ─────────────────────────────────────────────────────
load();

module.exports = { load, reload, authenticate, getRole };
