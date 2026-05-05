'use strict';

/**
 * PlayerRoster — validates player credentials against the database.
 *
 * Replaces the CSV-based implementation. Authentication now queries
 * player_profiles (display_name, password_hash, status) and player_roles
 * (for the primary role) directly from Supabase.
 *
 * IMPORTANT: password_hash and status columns, and the player_roles table,
 * are only present after migration 009 is applied. All players are managed
 * exclusively through the DB (player_profiles + player_roles). players.csv
 * has been removed — use the /admin/users API to create or modify players.
 *
 * Public interface (unchanged from the CSV version):
 *   const entry = await PlayerRoster.authenticate('Alice', 'mypass');
 *   // → { id, name, role } | null
 *
 * load() and reload() are kept as no-ops for backward compatibility
 * (they were called on server start; nothing calls them externally now).
 *
 * getRole() is kept as a stub; callers should use PlayerRepository.getPrimaryRole()
 * for DB-backed role lookups.
 */

const { findByDisplayName, getPrimaryRole } = require('../db/repositories/PlayerRepository');
const bcrypt = require('bcrypt');

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * authenticate(name, password)
 * Async — returns { id, name, role } if credentials are valid, or null.
 * Rejects suspended/archived accounts even if the password is correct.
 */
async function authenticate(name, password) {
  if (!name || !password) return null;

  const player = await findByDisplayName(name.trim());
  if (!player || !player.password_hash) return null;

  // Reject suspended or archived accounts
  if (player.status === 'suspended' || player.status === 'archived') return null;

  const valid = await bcrypt.compare(password, player.password_hash);
  if (!valid) return null;

  const role = await getPrimaryRole(player.id);
  return { id: player.id, name: player.display_name, role: role ?? 'coached_student' };
}

/**
 * load() — no-op. Previously re-read players.csv on startup.
 * Kept for backward compatibility; the DB is the source of truth now.
 */
function load() {
  // No-op: authentication is now fully DB-backed.
}

/**
 * reload() — no-op. Previously hot-reloaded players.csv.
 * Kept for backward compatibility.
 */
function reload() {
  // No-op: use the player-management API to add/modify players instead.
}

/**
 * getRole(name) — stub. Previously returned the in-memory CSV role.
 * Use PlayerRepository.getPrimaryRole(playerId) for DB-backed role lookups.
 * Returns null always (synchronous callers should be migrated to the async DB path).
 */
function getRole(_name) {
  return null;
}

module.exports = { authenticate, load, reload, getRole };
