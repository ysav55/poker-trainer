'use strict';

/**
 * BotTableRepository — persistence for Play vs Bot tables.
 *
 * Privacy mapping (incoming → DB):
 *   'solo'    → privacy='private'   (player-created, creator-only)
 *   'open'    → privacy='public'    (player-created, visible to all)
 *   'public'  → privacy='public'    (coach-created, visible to all)
 *   'school'  → privacy='school'    (coach-created, school-members only)
 *   'private' → privacy='private'   (coach-created, creator-only)
 *
 * Visibility in getBotTables:
 *   player => own private tables + ALL public tables
 *   coach  => own tables + school tables (same school) + ALL public tables
 *
 * Requires migration 019 (bot_cash mode, bot_config column, is_bot flag).
 */

const { v4: uuidv4 } = require('uuid');
const supabase = require('../supabase');

// ─── Privacy mapping ───────────────────────────────────────────────────────────

/**
 * Map an incoming privacy value (from the route) to a DB privacy value.
 * 'solo' and 'open' are player-tier aliases; coach roles pass through directly.
 */
function mapPrivacyToDb(privacy) {
  if (privacy === 'solo') return 'private';
  if (privacy === 'open') return 'public';
  return privacy; // 'public' | 'school' | 'private' pass through unchanged
}

// ─── Create ───────────────────────────────────────────────────────────────────

/**
 * Create a new bot_cash table and return the inserted row.
 *
 * @param {{
 *   name: string,
 *   creatorId: string,
 *   creatorRole: string,
 *   difficulty: 'easy'|'medium'|'hard',
 *   privacy: 'solo'|'open'|'public'|'school'|'private',
 *   blinds: { small: number, big: number },
 *   schoolId?: string|null,
 * }} opts
 * @returns {Promise<object>} Inserted table row
 */
async function createBotTable({ name, creatorId, creatorRole, difficulty, privacy, blinds, schoolId = null }) {
  const id        = uuidv4();
  const dbPrivacy = mapPrivacyToDb(privacy);

  const bot_config = {
    difficulty,
    bot_count: 0,
    blinds,
  };

  const { data, error } = await supabase
    .from('tables')
    .insert({
      id,
      name,
      mode:       'bot_cash',
      status:     'waiting',
      privacy:    dbPrivacy,
      bot_config,
      created_by: creatorId,
    })
    .select('id, name, mode, status, privacy, bot_config, created_by, created_at')
    .single();

  if (error) throw new Error(error.message);
  return data;
}

// ─── Read ─────────────────────────────────────────────────────────────────────

const TABLE_SELECT = 'id, name, mode, status, privacy, bot_config, created_by, created_at';

/**
 * Return bot_cash tables visible to the requesting user.
 *
 * Visibility:
 *   - coach  => own tables + school-privacy tables (same school) + public tables
 *   - player => own private tables + public tables (all players' open tables)
 *
 * @param {string} requesterId  stable UUID of calling user
 * @param {string} role         'coach' | 'admin' | 'superadmin' | other
 * @returns {Promise<object[]>}
 */
async function getBotTables(requesterId, role) {
  const COACH_ROLES = new Set(['coach', 'admin', 'superadmin']);

  // Shared query: all public bot tables
  const publicQuery = supabase
    .from('tables')
    .select(TABLE_SELECT)
    .eq('mode', 'bot_cash')
    .neq('status', 'completed')
    .eq('privacy', 'public')
    .order('created_at', { ascending: false });

  if (COACH_ROLES.has(role)) {
    // Coaches see: own tables + school-privacy tables (same school) + public tables
    const { data: coachProfile, error: profileErr } = await supabase
      .from('player_profiles')
      .select('school_id')
      .eq('id', requesterId)
      .maybeSingle();
    if (profileErr) throw new Error(profileErr.message);

    const schoolId = coachProfile?.school_id ?? null;

    const queries = [
      // Own tables
      supabase
        .from('tables')
        .select(TABLE_SELECT)
        .eq('mode', 'bot_cash')
        .neq('status', 'completed')
        .eq('created_by', requesterId)
        .order('created_at', { ascending: false }),
      // Public tables
      publicQuery,
    ];

    if (schoolId) {
      // School-privacy tables from same school
      queries.push(
        supabase
          .from('tables')
          .select(`${TABLE_SELECT}, player_profiles!tables_created_by_fkey(school_id)`)
          .eq('mode', 'bot_cash')
          .neq('status', 'completed')
          .eq('privacy', 'school')
          .order('created_at', { ascending: false })
      );
    }

    const results = await Promise.all(queries);
    for (const r of results) {
      if (r.error) throw new Error(r.error.message);
    }

    const own    = results[0].data ?? [];
    const pub    = results[1].data ?? [];
    const school = schoolId ? (results[2].data ?? []).filter(
      t => t.player_profiles?.school_id === schoolId
    ) : [];

    // Deduplicate by id, strip joined profile data
    const seen   = new Set();
    const merged = [];
    for (const t of [...own, ...school, ...pub]) {
      if (!seen.has(t.id)) {
        seen.add(t.id);
        const { player_profiles: _pp, ...row } = t;
        merged.push(row);
      }
    }
    return merged.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  // Player: own private tables + all public tables
  const [ownResult, pubResult] = await Promise.all([
    supabase
      .from('tables')
      .select(TABLE_SELECT)
      .eq('mode', 'bot_cash')
      .neq('status', 'completed')
      .eq('created_by', requesterId)
      .neq('privacy', 'public')  // avoid double-counting own public tables
      .order('created_at', { ascending: false }),
    publicQuery,
  ]);
  if (ownResult.error) throw new Error(ownResult.error.message);
  if (pubResult.error)  throw new Error(pubResult.error.message);

  const own = ownResult.data ?? [];
  const pub = pubResult.data ?? [];

  // Deduplicate (player's own open table might appear in public list)
  const seen   = new Set();
  const merged = [];
  for (const t of [...own, ...pub]) {
    if (!seen.has(t.id)) {
      seen.add(t.id);
      merged.push(t);
    }
  }
  return merged.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

// ─── Bot player management ────────────────────────────────────────────────────

/**
 * Create or update a bot player_profile row.
 * Bot players are identified by a server-assigned UUID and is_bot=true.
 * Display name encodes the difficulty level: "Bot (Easy)", etc.
 *
 * @param {string} stableId   UUID for this bot (stable across sessions)
 * @param {string} name       Display name, e.g. "Bot (Easy)"
 * @param {'easy'|'medium'|'hard'} difficulty
 * @returns {Promise<void>}
 */
async function upsertBotPlayer(stableId, name, difficulty) {
  const { error } = await supabase
    .from('player_profiles')
    .upsert({
      id:           stableId,
      display_name: name,
      is_bot:       true,
      last_seen:    new Date().toISOString(),
    }, { onConflict: 'id' });
  if (error) throw new Error(error.message);
}

module.exports = { createBotTable, getBotTables, upsertBotPlayer };
