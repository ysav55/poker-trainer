'use strict';

/**
 * BotTableRepository — persistence for Play vs Bot tables.
 *
 * Visibility rules (enforced here, not in route):
 *   solo player (no coach / no school)  => privacy=private  (creator only)
 *   coached player (has school_id)      => privacy=private  (creator + coach sees via coach query)
 *   coach                               => privacy=school   (coach + all stable members)
 *
 * Requires migration 019 (bot_cash mode, bot_config column, is_bot flag).
 */

const { v4: uuidv4 } = require('uuid');
const supabase = require('../supabase');

// ─── Create ───────────────────────────────────────────────────────────────────

/**
 * Create a new bot_cash table and return the inserted row.
 *
 * @param {{
 *   name: string,
 *   creatorId: string,
 *   creatorRole: string,
 *   difficulty: 'easy'|'medium'|'hard',
 *   humanSeats: number,
 *   blinds: { small: number, big: number },
 *   schoolId?: string|null,
 * }} opts
 * @returns {Promise<object>} Inserted table row
 */
async function createBotTable({ name, creatorId, creatorRole, difficulty, humanSeats, blinds, schoolId = null }) {
  const id = uuidv4();

  const privacy = creatorRole === 'coach' ? 'school' : 'private';

  const bot_config = {
    difficulty,
    human_seats: humanSeats,
    blinds,
    ...(creatorRole !== 'coach' && schoolId ? { coach_school_id: schoolId } : {}),
  };

  const { data, error } = await supabase
    .from('tables')
    .insert({
      id,
      name,
      mode:       'bot_cash',
      status:     'waiting',
      privacy,
      bot_config,
      created_by: creatorId,
    })
    .select('id, name, mode, status, privacy, bot_config, created_by, created_at')
    .single();

  if (error) throw new Error(error.message);
  return data;
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Return bot_cash tables visible to the requesting user.
 *
 * Visibility:
 *   - coach  => all tables with privacy='school' where created_by is a member
 *               of the same school, PLUS own private tables
 *   - player => own tables only (privacy=private, created_by=requesterId)
 *
 * For simplicity in Phase 1 we return:
 *   - coach: all bot tables whose created_by = requesterId  OR  privacy='school'
 *            and the creator shares the same school_id as the coach
 *   - player: all bot tables whose created_by = requesterId
 *
 * @param {string} requesterId  stable UUID of calling user
 * @param {string} role         'coach' | 'player' | other
 * @returns {Promise<object[]>}
 */
async function getBotTables(requesterId, role) {
  if (role === 'coach') {
    // Coaches see: own tables + school-privacy tables whose creator shares school
    const { data: coachProfile, error: profileErr } = await supabase
      .from('player_profiles')
      .select('school_id')
      .eq('id', requesterId)
      .maybeSingle();
    if (profileErr) throw new Error(profileErr.message);

    const schoolId = coachProfile?.school_id ?? null;

    if (schoolId) {
      // created_by = me  OR  (privacy=school AND creator is in same school)
      // Supabase JS doesn't support subquery-based OR easily; do two queries and merge.
      const [ownResult, schoolResult] = await Promise.all([
        supabase
          .from('tables')
          .select('id, name, mode, status, privacy, bot_config, created_by, created_at')
          .eq('mode', 'bot_cash')
          .neq('status', 'completed')
          .eq('created_by', requesterId)
          .order('created_at', { ascending: false }),
        supabase
          .from('tables')
          .select('id, name, mode, status, privacy, bot_config, created_by, created_at, player_profiles!tables_created_by_fkey(school_id)')
          .eq('mode', 'bot_cash')
          .neq('status', 'completed')
          .eq('privacy', 'school')
          .order('created_at', { ascending: false }),
      ]);
      if (ownResult.error) throw new Error(ownResult.error.message);
      if (schoolResult.error) throw new Error(schoolResult.error.message);

      const own = ownResult.data ?? [];
      const schoolTables = (schoolResult.data ?? []).filter(
        t => t.player_profiles?.school_id === schoolId
      );
      // deduplicate by id
      const seen = new Set();
      const merged = [];
      for (const t of [...own, ...schoolTables]) {
        if (!seen.has(t.id)) {
          seen.add(t.id);
          // strip joined profile data before returning
          const { player_profiles: _pp, ...row } = t;
          merged.push(row);
        }
      }
      return merged.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    // Coach without a school: own tables only
    const { data, error } = await supabase
      .from('tables')
      .select('id, name, mode, status, privacy, bot_config, created_by, created_at')
      .eq('mode', 'bot_cash')
      .neq('status', 'completed')
      .eq('created_by', requesterId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  // Player (solo or coached): own tables only
  const { data, error } = await supabase
    .from('tables')
    .select('id, name, mode, status, privacy, bot_config, created_by, created_at')
    .eq('mode', 'bot_cash')
    .neq('status', 'completed')
    .eq('created_by', requesterId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
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
