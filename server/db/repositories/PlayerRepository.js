'use strict';

const { v4: uuidv4 } = require('uuid');
const supabase = require('../supabase');
const { q, parseTags } = require('../utils');

// ─── Player Identity ──────────────────────────────────────────────────────────

async function upsertPlayerIdentity(stableId, name) {
  await q(supabase.from('player_profiles').upsert({
    id:           stableId,
    display_name: name,
    last_seen:    new Date().toISOString(),
  }, { onConflict: 'id' }));
}

async function getPlayerStats(stableId) {
  const data = await q(
    supabase.from('leaderboard').select('*').eq('player_id', stableId).maybeSingle()
  );
  if (!data) return null;
  const totalHands = data.total_hands ?? 0;
  const vpipCount  = data.vpip_count  ?? 0;
  const pfrCount   = data.pfr_count   ?? 0;
  return {
    player_id:       data.player_id,
    latest_name:     data.display_name,
    total_hands:     totalHands,
    total_wins:      data.total_wins   ?? 0,
    total_net_chips: data.net_chips    ?? 0,
    vpip_percent:    totalHands > 0 ? Math.round(vpipCount / totalHands * 100) : 0,
    pfr_percent:     totalHands > 0 ? Math.round(pfrCount  / totalHands * 100) : 0,
  };
}

async function getAllPlayersWithStats() {
  const data = await q(
    supabase.from('leaderboard').select('*').order('net_chips', { ascending: false })
  );
  return (data || []).map(r => {
    const total = r.total_hands ?? 0;
    return {
      stableId:        r.player_id,
      name:            r.display_name,
      total_hands:     total,
      total_wins:      r.total_wins   ?? 0,
      total_net_chips: r.net_chips    ?? 0,
      vpip_percent:    total > 0 ? Math.round((r.vpip_count ?? 0) / total * 100) : 0,
      pfr_percent:     total > 0 ? Math.round((r.pfr_count  ?? 0) / total * 100) : 0,
      last_hand_at:    r.last_hand_at,
    };
  });
}

/**
 * Returns { allTime, session } for the PlayerSeat hover tooltip.
 * allTime — row from leaderboard table (or null)
 * session — row from session_player_stats (or null if no sessionId given)
 */
async function getPlayerHoverStats(stableId, sessionId) {
  const [allTimeResult, sessionResult] = await Promise.all([
    supabase.from('leaderboard').select('*').eq('player_id', stableId).maybeSingle(),
    sessionId
      ? supabase.from('session_player_stats').select('*').eq('session_id', sessionId).eq('player_id', stableId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  return {
    allTime: allTimeResult.data ?? null,
    session: sessionResult.data  ?? null,
  };
}

/**
 * Return hand records for a player.
 * mode: 'overall' (default) — all hands
 *       'bot'     — only hands from bot_cash tables
 *       'human'   — only hands from non-bot tables
 */
async function getPlayerHands(stableId, { limit = 20, offset = 0, mode = 'overall' } = {}) {
  // Step 1: fetch hand_players with just enough join info to resolve table mode
  const { data: hpRaw, error: hpErr } = await supabase
    .from('hand_players')
    .select('hand_id, vpip, pfr, wtsd, wsd, is_winner, stack_start, stack_end, seat, hole_cards, hands(table_id)')
    .eq('player_id', stableId);
  if (hpErr) throw hpErr;
  if (!hpRaw || hpRaw.length === 0) return [];

  let filteredHp = hpRaw;

  if (mode !== 'overall') {
    // Step 2: resolve table modes for all distinct table_ids
    const tableIds = [...new Set(hpRaw.map(hp => hp.hands?.table_id).filter(Boolean))];
    if (tableIds.length > 0) {
      const { data: tablesData } = await supabase
        .from('tables')
        .select('id, mode')
        .in('id', tableIds);
      const tableMode = {};
      (tablesData || []).forEach(t => { tableMode[t.id] = t.mode; });

      filteredHp = hpRaw.filter(hp => {
        const tMode = tableMode[hp.hands?.table_id] ?? null;
        return mode === 'bot' ? tMode === 'bot_cash' : tMode !== 'bot_cash';
      });
    } else {
      filteredHp = [];
    }
  }

  if (filteredHp.length === 0) return [];

  // Step 3: paginate on filtered hand_ids, then fetch full hand data
  const sortedHandIds = filteredHp.map(hp => hp.hand_id);
  const pageIds = sortedHandIds.slice(offset, offset + limit);
  if (pageIds.length === 0) return [];

  const { data, error } = await supabase
    .from('hand_players')
    .select('*, hands(hand_id, started_at, ended_at, final_pot, winner_id, winner_name, phase_ended, board, table_id, hand_tags(tag, tag_type))')
    .eq('player_id', stableId)
    .in('hand_id', pageIds);
  if (error) throw error;

  // Sort by started_at descending
  (data || []).sort((a, b) => {
    const ta = new Date(a.hands?.started_at || 0).getTime();
    const tb = new Date(b.hands?.started_at || 0).getTime();
    return tb - ta;
  });

  return (data || []).map(hp => ({
    hand_id:     hp.hands?.hand_id,
    started_at:  hp.hands?.started_at,
    ended_at:    hp.hands?.ended_at,
    final_pot:   hp.hands?.final_pot,
    winner_id:   hp.hands?.winner_id,
    winner_name: hp.hands?.winner_name,
    phase_ended: hp.hands?.phase_ended,
    board:       hp.hands?.board || [],
    table_id:    hp.hands?.table_id,
    ...parseTags(hp.hands?.hand_tags),
    hole_cards:  hp.hole_cards || [],
    stack_start: hp.stack_start,
    stack_end:   hp.stack_end,
    is_winner:   hp.is_winner,
    vpip:        hp.vpip,
    pfr:         hp.pfr,
    wtsd:        hp.wtsd,
    wsd:         hp.wsd,
    seat:        hp.seat,
  }));
}

/**
 * Compute player stats filtered by game mode.
 * mode: 'overall' — reads from leaderboard view (same as getPlayerStats)
 *       'bot'     — only bot_cash table hands
 *       'human'   — only non-bot table hands
 */
async function getPlayerStatsByMode(stableId, mode = 'overall') {
  if (mode === 'overall') return getPlayerStats(stableId);

  // Fetch hand_players with table_id via hands join
  const { data: hpRaw, error: hpErr } = await supabase
    .from('hand_players')
    .select('hand_id, vpip, pfr, wtsd, wsd, is_winner, stack_start, stack_end, hands(table_id)')
    .eq('player_id', stableId);
  if (hpErr) throw hpErr;
  if (!hpRaw || hpRaw.length === 0) {
    return { player_id: stableId, total_hands: 0, total_wins: 0, total_net_chips: 0, vpip_percent: 0, pfr_percent: 0 };
  }

  // Resolve table modes
  const tableIds = [...new Set(hpRaw.map(hp => hp.hands?.table_id).filter(Boolean))];
  const tableMode = {};
  if (tableIds.length > 0) {
    const { data: tablesData } = await supabase
      .from('tables')
      .select('id, mode')
      .in('id', tableIds);
    (tablesData || []).forEach(t => { tableMode[t.id] = t.mode; });
  }

  const filtered = hpRaw.filter(hp => {
    const tMode = tableMode[hp.hands?.table_id] ?? null;
    return mode === 'bot' ? tMode === 'bot_cash' : tMode !== 'bot_cash';
  });

  const totalHands = filtered.length;
  if (totalHands === 0) {
    return { player_id: stableId, total_hands: 0, total_wins: 0, total_net_chips: 0, vpip_percent: 0, pfr_percent: 0 };
  }

  const vpipCount = filtered.filter(hp => hp.vpip).length;
  const pfrCount  = filtered.filter(hp => hp.pfr).length;
  const totalWins = filtered.filter(hp => hp.is_winner).length;
  const netChips  = filtered.reduce((sum, hp) => sum + ((hp.stack_end ?? 0) - (hp.stack_start ?? 0)), 0);

  return {
    player_id:       stableId,
    total_hands:     totalHands,
    total_wins:      totalWins,
    total_net_chips: netChips,
    vpip_percent:    Math.round(vpipCount / totalHands * 100),
    pfr_percent:     Math.round(pfrCount  / totalHands * 100),
  };
}

// ─── Auth / RBAC ─────────────────────────────────────────────────────────────

/**
 * Look up a player by UUID.
 * Returns a full player_profiles row including trial fields, or null if not found.
 */
async function findById(id) {
  const { data } = await supabase
    .from('player_profiles')
    .select('id, display_name, email, status, password_hash, is_roster, last_seen, trial_expires_at, trial_hands_remaining')
    .eq('id', id)
    .maybeSingle();
  return data ?? null;
}

/**
 * Decrement trial_hands_remaining by 1 for a player.
 * Does nothing if the column is NULL (unlimited) or already 0.
 */
async function decrementTrialHands(id) {
  const player = await findById(id);
  if (!player || player.trial_hands_remaining == null) return;
  const next = Math.max(0, player.trial_hands_remaining - 1);
  const { error } = await supabase.from('player_profiles').update({ trial_hands_remaining: next }).eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Look up a player by display name (case-insensitive via DB collation).
 * Returns a full player_profiles row — including password_hash and status —
 * once migration 009 and the roster-migration script have been applied.
 * Returns null if not found.
 */
async function findByDisplayName(name) {
  const { data } = await supabase
    .from('player_profiles')
    .select('id, display_name, email, status, password_hash, is_roster, last_seen')
    .eq('display_name', name.trim())
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

/**
 * Get the highest-privilege role name for a player.
 * Returns null if the player has no roles assigned.
 * Requires the player_roles + roles tables (migration 009).
 */
async function getPrimaryRole(playerId) {
  const ROLE_PRIORITY = ['superadmin', 'admin', 'coach', 'moderator', 'referee', 'player', 'trial'];
  const { data } = await supabase
    .from('player_roles')
    .select('roles(name)')
    .eq('player_id', playerId);
  if (!data || data.length === 0) return null;
  const names = data.map(r => r.roles?.name).filter(Boolean);
  for (const r of ROLE_PRIORITY) {
    if (names.includes(r)) return r;
  }
  return names[0] ?? null;
}

/**
 * Create a new player profile. Returns the new player's UUID.
 * Requires migration 009 (password_hash, email, created_by columns).
 */
async function createPlayer({ displayName, email, passwordHash, createdBy }) {
  const { data, error } = await supabase
    .from('player_profiles')
    .insert({ display_name: displayName, email, password_hash: passwordHash, created_by: createdBy })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

/**
 * Patch a player's profile. Accepts camelCase keys; maps to DB column names.
 * Supported patch keys: displayName, email, status, avatarUrl.
 */
async function updatePlayer(id, patch) {
  const dbPatch = {};
  if (patch.displayName !== undefined) dbPatch.display_name = patch.displayName;
  if (patch.email       !== undefined) dbPatch.email        = patch.email;
  if (patch.status      !== undefined) dbPatch.status       = patch.status;
  if (patch.avatarUrl   !== undefined) dbPatch.avatar_url   = patch.avatarUrl;
  if (patch.coachId     !== undefined) dbPatch.coach_id     = patch.coachId;
  const { error } = await supabase.from('player_profiles').update(dbPatch).eq('id', id);
  if (error) throw error;
}

/** Soft-delete a player by setting status = 'archived'. */
async function archivePlayer(id) {
  const { error } = await supabase.from('player_profiles').update({ status: 'archived' }).eq('id', id);
  if (error) throw error;
}

/** Replace a player's bcrypt password hash. */
async function setPassword(id, passwordHash) {
  const { error } = await supabase.from('player_profiles').update({ password_hash: passwordHash }).eq('id', id);
  if (error) throw error;
}

/** Assign a role (by roleId UUID) to a player. */
async function assignRole(playerId, roleId, assignedBy) {
  const { error } = await supabase.from('player_roles').insert({ player_id: playerId, role_id: roleId, assigned_by: assignedBy });
  if (error) throw error;
}

/** Remove a role from a player. */
async function removeRole(playerId, roleId) {
  const { error } = await supabase.from('player_roles').delete().eq('player_id', playerId).eq('role_id', roleId);
  if (error) throw error;
}

/**
 * List player profiles with optional filters.
 * @param {{ status?: string, role?: string, limit?: number, offset?: number }} opts
 */
async function listPlayers({ status, role, limit = 50, offset = 0 } = {}) {
  const ROLE_PRIORITY = ['superadmin', 'admin', 'coach', 'moderator', 'referee', 'player', 'trial'];

  let query = supabase
    .from('player_profiles')
    .select('id, display_name, email, status, avatar_url, last_seen, coach_id, created_at')
    .order('display_name')
    .range(offset, offset + limit - 1);
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw error;
  const players = data ?? [];

  if (players.length === 0) return players;

  // Two-step role fetch: avoids nested PostgREST join that can fail on schema
  // cache mismatches. Queries roles and player_roles independently, then merges.
  const playerIds = players.map(p => p.id);
  const [rolesRes, prRes] = await Promise.all([
    supabase.from('roles').select('id, name'),
    supabase.from('player_roles').select('player_id, role_id').in('player_id', playerIds),
  ]);

  const roleNameById = {};
  (rolesRes.data ?? []).forEach(r => { roleNameById[r.id] = r.name; });

  const playerRoleMap = {};
  (prRes.data ?? []).forEach(({ player_id, role_id }) => {
    const roleName = roleNameById[role_id];
    if (!roleName) return;
    const current = playerRoleMap[player_id];
    const newPriority = ROLE_PRIORITY.indexOf(roleName);
    const curPriority = ROLE_PRIORITY.indexOf(current);
    if (!current || (newPriority !== -1 && newPriority < curPriority)) {
      playerRoleMap[player_id] = roleName;
    }
  });

  return players.map(p => ({ ...p, role: playerRoleMap[p.id] ?? null }));
}

// ─── Roster Auth (legacy) ─────────────────────────────────────────────────────

async function loginRosterPlayer(name) {
  const trimmed = name.trim();

  const existing = await q(
    supabase.from('player_profiles')
      .select('id, display_name')
      .eq('display_name', trimmed)
      .limit(1)
      .maybeSingle()
  );

  if (existing) {
    await q(supabase.from('player_profiles').update({
      is_roster: true,
      last_seen: new Date().toISOString(),
    }).eq('id', existing.id));
    return { stableId: existing.id, name: existing.display_name };
  }

  const stableId = uuidv4();
  await q(supabase.from('player_profiles').insert({
    id:           stableId,
    display_name: trimmed,
    is_roster:    true,
    last_seen:    new Date().toISOString(),
  }));
  return { stableId, name: trimmed };
}

async function isRegisteredPlayer(stableId) {
  if (!stableId) return false;
  const data = await q(
    supabase.from('player_profiles')
      .select('id, is_roster')
      .eq('id', stableId)
      .maybeSingle()
  );
  return !!(data && data.is_roster);
}

module.exports = {
  // Identity / stats (existing)
  upsertPlayerIdentity, getPlayerStats, getPlayerStatsByMode, getAllPlayersWithStats,
  getPlayerHoverStats, getPlayerHands, loginRosterPlayer, isRegisteredPlayer,
  // Auth / RBAC (new — requires migration 009)
  findByDisplayName, findById, getPrimaryRole,
  createPlayer, updatePlayer, archivePlayer, setPassword,
  assignRole, removeRole, listPlayers,
  // Trial helpers (migration 014)
  decrementTrialHands,
};
