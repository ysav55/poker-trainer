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

const CASH_MODES = ['coached_cash', 'uncoached_cash', 'bot_cash'];

async function getAllPlayersWithStats({ period = 'all', gameType = 'all' } = {}) {
  // Fast path: use pre-aggregated leaderboard table when no filters applied
  if (period === 'all' && gameType === 'all') {
    const data = await q(
      supabase.from('leaderboard').select('*').order('net_chips', { ascending: false })
    );
    const players = (data || []).map(r => {
      const total   = r.total_hands  ?? 0;
      const wtsdCnt = r.wtsd_count   ?? 0;
      return {
        stableId:           r.player_id,
        name:               r.display_name,
        total_hands:        total,
        total_wins:         r.total_wins   ?? 0,
        total_net_chips:    r.net_chips    ?? 0,
        vpip_percent:       total > 0 ? Math.round((r.vpip_count      ?? 0) / total   * 100) : 0,
        pfr_percent:        total > 0 ? Math.round((r.pfr_count       ?? 0) / total   * 100) : 0,
        wtsd_percent:       total > 0 ? Math.round(wtsdCnt                   / total   * 100) : 0,
        wsd_percent:        wtsdCnt > 0 ? Math.round((r.wsd_count     ?? 0) / wtsdCnt * 100) : 0,
        three_bet_percent:  total > 0 ? Math.round((r.three_bet_count ?? 0) / total   * 100) : 0,
        last_hand_at:       r.last_hand_at,
        // Baseline-sourced fields filled below (null if no baseline row)
        bb_per_100: null, af: null, cbet_flop: null, fold_to_cbet: null,
        open_limp_rate: null, cold_call_3bet_rate: null, min_raise_rate: null,
        overlimp_rate: null, equity_fold_rate: null,
      };
    });

    // Merge rolling-30d baselines for advanced stats
    if (players.length > 0) {
      const ids = players.map(p => p.stableId);
      const { data: blRows } = await supabase
        .from('student_baselines')
        .select('player_id, bb_per_100, aggression, cbet_flop, fold_to_cbet, open_limp_rate, cold_call_3bet_rate, min_raise_rate, overlimp_rate, equity_fold_rate')
        .eq('period_type', 'rolling_30d')
        .in('player_id', ids);
      if (blRows) {
        const blMap = new Map(blRows.map(b => [b.player_id, b]));
        for (const p of players) {
          const bl = blMap.get(p.stableId);
          if (!bl) continue;
          p.bb_per_100          = bl.bb_per_100 != null          ? Number(bl.bb_per_100)          : null;
          p.af                  = bl.aggression != null          ? Number(bl.aggression)           : null;
          p.cbet_flop           = bl.cbet_flop  != null          ? Math.round(Number(bl.cbet_flop)      * 100) : null;
          p.fold_to_cbet        = bl.fold_to_cbet != null        ? Math.round(Number(bl.fold_to_cbet)   * 100) : null;
          p.open_limp_rate      = bl.open_limp_rate != null      ? Number(bl.open_limp_rate)      : null;
          p.cold_call_3bet_rate = bl.cold_call_3bet_rate != null ? Number(bl.cold_call_3bet_rate) : null;
          p.min_raise_rate      = bl.min_raise_rate != null      ? Number(bl.min_raise_rate)      : null;
          p.overlimp_rate       = bl.overlimp_rate != null       ? Number(bl.overlimp_rate)       : null;
          p.equity_fold_rate    = bl.equity_fold_rate != null    ? Number(bl.equity_fold_rate)    : null;
        }
      }
    }

    return players;
  }

  // Filtered path: aggregate from hand_players + hands with date/mode constraints
  // Step 1: build filtered hand_players query
  let query = supabase
    .from('hand_players')
    .select('player_id, vpip, pfr, wtsd, wsd, three_bet, is_winner, stack_start, stack_end, hands!inner(started_at, table_mode)');

  if (period !== 'all') {
    const days = period === '7d' ? 7 : 30;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    query = query.gte('hands.started_at', cutoff);
  }

  if (gameType === 'cash') {
    query = query.in('hands.table_mode', CASH_MODES);
  } else if (gameType === 'tournament') {
    query = query.eq('hands.table_mode', 'tournament');
  }

  const { data: hpRows, error: hpErr } = await query;
  if (hpErr) throw hpErr;

  // Step 2: aggregate by player_id in JS
  const playerMap = new Map();
  for (const hp of hpRows || []) {
    let p = playerMap.get(hp.player_id);
    if (!p) {
      p = { player_id: hp.player_id, total_hands: 0, total_wins: 0, net_chips: 0, vpip_count: 0, pfr_count: 0, wtsd_count: 0, wsd_count: 0, three_bet_count: 0 };
      playerMap.set(hp.player_id, p);
    }
    p.total_hands += 1;
    if (hp.is_winner)  p.total_wins += 1;
    p.net_chips  += (hp.stack_end ?? 0) - (hp.stack_start ?? 0);
    if (hp.vpip)       p.vpip_count     += 1;
    if (hp.pfr)        p.pfr_count      += 1;
    if (hp.wtsd)       p.wtsd_count     += 1;
    if (hp.wsd)        p.wsd_count      += 1;
    if (hp.three_bet)  p.three_bet_count += 1;
  }

  if (playerMap.size === 0) return [];

  // Step 3: resolve display names from leaderboard (already caches names)
  const playerIds = [...playerMap.keys()];
  const { data: nameRows } = await supabase
    .from('leaderboard')
    .select('player_id, display_name')
    .in('player_id', playerIds);
  const nameMap = new Map((nameRows || []).map(r => [r.player_id, r.display_name]));

  return [...playerMap.values()]
    .sort((a, b) => b.net_chips - a.net_chips)
    .map(p => {
      const total = p.total_hands;
      return {
        stableId:           p.player_id,
        name:               nameMap.get(p.player_id) ?? p.player_id,
        total_hands:        total,
        total_wins:         p.total_wins,
        total_net_chips:    p.net_chips,
        vpip_percent:       total > 0 ? Math.round(p.vpip_count      / total          * 100) : 0,
        pfr_percent:        total > 0 ? Math.round(p.pfr_count       / total          * 100) : 0,
        wtsd_percent:       total > 0 ? Math.round(p.wtsd_count      / total          * 100) : 0,
        wsd_percent:        p.wtsd_count > 0 ? Math.round(p.wsd_count / p.wtsd_count  * 100) : 0,
        three_bet_percent:  total > 0 ? Math.round(p.three_bet_count / total          * 100) : 0,
        last_hand_at:       null,
        // Baseline stats unavailable for filtered views
        bb_per_100: null, af: null, cbet_flop: null, fold_to_cbet: null,
        open_limp_rate: null, cold_call_3bet_rate: null, min_raise_rate: null,
        overlimp_rate: null, equity_fold_rate: null,
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
    .select('id, display_name, email, status, password_hash, last_seen, school_id, trial_expires_at, trial_hands_remaining')
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
    .select('id, display_name, email, status, password_hash, last_seen')
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
  const ROLE_PRIORITY = ['superadmin', 'admin', 'coach', 'coached_student', 'solo_student', 'trial'];
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
    .insert({
      id: crypto.randomUUID(),
      display_name: displayName,
      email,
      password_hash: passwordHash,
      created_by: createdBy,
    })
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
  if (patch.schoolId    !== undefined) dbPatch.school_id    = patch.schoolId;
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
  const ROLE_PRIORITY = ['superadmin', 'admin', 'coach', 'coached_student', 'solo_student', 'trial'];

  let query = supabase
    .from('player_profiles')
    .select('id, display_name, email, status, avatar_url, last_seen, coach_id, created_at, school_id')
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
      last_seen: new Date().toISOString(),
    }).eq('id', existing.id));
    return { stableId: existing.id, name: existing.display_name };
  }

  const stableId = uuidv4();
  await q(supabase.from('player_profiles').insert({
    id:           stableId,
    display_name: trimmed,
    last_seen:    new Date().toISOString(),
  }));
  return { stableId, name: trimmed };
}

async function isRegisteredPlayer(stableId) {
  if (!stableId) return false;
  const data = await q(
    supabase.from('player_profiles')
      .select('id')
      .eq('id', stableId)
      .maybeSingle()
  );
  return !!data;
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
