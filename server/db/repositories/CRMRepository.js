'use strict';

/**
 * server/db/repositories/CRMRepository.js
 *
 * Data access for the Player CRM feature (Phase 2 Item 8).
 * Tables: player_notes, player_tags, coaching_sessions, player_performance_snapshots.
 */

const supabase = require('../supabase');
const { q } = require('../utils');

// ─── Player CRM Summary ───────────────────────────────────────────────────────

/**
 * Aggregated CRM view for a single player:
 *   - player_profiles row
 *   - latest session_player_stats row
 *   - all current player_tags
 *   - upcoming coaching_sessions (status = 'scheduled', ASC)
 *   - assigned groups (via player_groups)
 *   - recent performance snapshots (12 max, newest first)
 *   - recent coach notes (5 max, newest first)
 *
 * Returns null if the player does not exist.
 */
async function getPlayerCRMSummary(playerId) {
  const [profileResult, statsResult, tagsResult, sessionsResult, groupsResult, snapshotsResult, notesResult] = await Promise.all([
    supabase
      .from('player_profiles')
      .select('id, display_name, email, status, avatar_url, created_at')
      .eq('id', playerId)
      .maybeSingle(),

    supabase
      .from('session_player_stats')
      .select('session_id, hands_played, net_chips, vpip, pfr, wtsd, wsd, created_at')
      .eq('player_id', playerId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),

    supabase
      .from('player_tags')
      .select('tag, assigned_at')
      .eq('player_id', playerId)
      .order('assigned_at', { ascending: false }),

    supabase
      .from('coaching_sessions')
      .select('id, scheduled_at, duration_minutes, status, notes')
      .eq('player_id', playerId)
      .eq('status', 'scheduled')
      .order('scheduled_at', { ascending: true })
      .limit(5),

    supabase
      .from('player_groups')
      .select('groups(id, name, color, school_id, created_at)')
      .eq('player_id', playerId),

    supabase
      .from('player_performance_snapshots')
      .select('id, period_start, period_end, hands_played, net_chips, vpip_pct, pfr_pct, wtsd_pct, wsd_pct, three_bet_pct, avg_decision_time_ms, most_common_mistakes, created_at')
      .eq('player_id', playerId)
      .order('period_start', { ascending: false })
      .limit(12),

    supabase
      .from('player_notes')
      .select('id, content, note_type, created_at, coach_id, shared_with_student, player_profiles!coach_id(display_name)')
      .eq('player_id', playerId)
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  if (profileResult.error) throw new Error(profileResult.error.message);
  if (!profileResult.data) return null;

  return {
    player:           profileResult.data,
    summary:          statsResult.data ?? null,
    tags:             (tagsResult.data ?? []).map(r => r.tag),
    upcomingSessions: sessionsResult.data ?? [],
    groups:           (groupsResult.data ?? []).map(r => r.groups).filter(Boolean),
    snapshots:        snapshotsResult.data ?? [],
    notes:            (notesResult.data ?? []).map(r => ({
      id:                 r.id,
      content:            r.content,
      note_type:          r.note_type,
      created_at:         r.created_at,
      coach_id:           r.coach_id,
      shared_with_student: r.shared_with_student ?? false,
      coach_name:         r.player_profiles?.display_name ?? null,
    })),
  };
}

// ─── Notes ───────────────────────────────────────────────────────────────────

/**
 * Create a coach note for a player.
 * @param {string} playerId
 * @param {string} coachId
 * @param {string} content
 * @param {string} noteType  'general' | 'session_review' | 'goal' | 'weakness'
 * @param {boolean} sharedWithStudent  whether to show this note to the student
 * @returns {string} UUID of the new note.
 */
async function createNote(playerId, coachId, content, noteType = 'general', sharedWithStudent = false) {
  const data = await q(
    supabase
      .from('player_notes')
      .insert({ player_id: playerId, coach_id: coachId, content, note_type: noteType, shared_with_student: sharedWithStudent })
      .select('id')
      .single()
  );
  return data.id;
}

/**
 * Retrieve notes for a player, newest first.
 * @param {string} playerId
 * @param {{ limit?: number, offset?: number }} opts
 * @returns {Array} note rows with coach display_name joined and shared_with_student flag
 */
async function getNotes(playerId, { limit = 20, offset = 0 } = {}) {
  const data = await q(
    supabase
      .from('player_notes')
      .select('id, content, note_type, created_at, coach_id, shared_with_student, player_profiles!coach_id(display_name)')
      .eq('player_id', playerId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)
  );
  return (data || []).map(r => ({
    id:                 r.id,
    content:            r.content,
    note_type:          r.note_type,
    created_at:         r.created_at,
    coach_id:           r.coach_id,
    shared_with_student: r.shared_with_student ?? false,
    coach_name:         r.player_profiles?.display_name ?? null,
  }));
}

// ─── Tags ─────────────────────────────────────────────────────────────────────

/**
 * Replace all tags for a player (delete-then-insert).
 * Passing an empty array clears all tags.
 *
 * @param {string}   playerId
 * @param {string[]} tags        Array of tag strings (max 50 chars each)
 * @param {string}   assignedBy  UUID of the coach performing the update
 */
async function setPlayerTags(playerId, tags, assignedBy) {
  // Delete all existing tags for this player
  const { error: delErr } = await supabase
    .from('player_tags')
    .delete()
    .eq('player_id', playerId);
  if (delErr) throw new Error(delErr.message);

  if (!tags || tags.length === 0) return;

  const rows = tags.map(tag => ({
    player_id:   playerId,
    tag:         String(tag).slice(0, 50),
    assigned_by: assignedBy,
  }));
  const { error: insErr } = await supabase.from('player_tags').insert(rows);
  if (insErr) throw new Error(insErr.message);
}

/**
 * Get all tag strings for a player, newest first.
 * @returns {string[]}
 */
async function getPlayerTags(playerId) {
  const data = await q(
    supabase
      .from('player_tags')
      .select('tag')
      .eq('player_id', playerId)
      .order('assigned_at', { ascending: false })
  );
  return (data || []).map(r => r.tag);
}

// ─── Coaching Sessions ────────────────────────────────────────────────────────

/**
 * Create a coaching session.
 * @returns {string} UUID of the new session.
 */
async function createCoachingSession({ playerId, coachId, scheduledAt, durationMinutes = 60, notes = null }) {
  const data = await q(
    supabase
      .from('coaching_sessions')
      .insert({
        player_id:        playerId,
        coach_id:         coachId,
        scheduled_at:     scheduledAt,
        duration_minutes: durationMinutes,
        notes,
      })
      .select('id')
      .single()
  );
  return data.id;
}

/**
 * Get coaching sessions for a player, ordered by scheduled_at ASC.
 * Optionally filter by status.
 *
 * @param {string} playerId
 * @param {{ status?: string }} opts
 * @returns {Array}
 */
async function getCoachingSessions(playerId, { status } = {}) {
  let query = supabase
    .from('coaching_sessions')
    .select('id, scheduled_at, duration_minutes, status, notes, coach_id, created_at')
    .eq('player_id', playerId)
    .order('scheduled_at', { ascending: true });

  if (status) query = query.eq('status', status);

  const data = await q(query);
  return data || [];
}

/**
 * Update the status of a coaching session.
 * @param {string} sessionId
 * @param {string} status  'scheduled' | 'completed' | 'cancelled'
 */
async function updateSessionStatus(sessionId, status) {
  const { error } = await supabase
    .from('coaching_sessions')
    .update({ status })
    .eq('id', sessionId);
  if (error) throw new Error(error.message);
}

// ─── Performance Snapshots ───────────────────────────────────────────────────

/**
 * Upsert a weekly performance snapshot.
 * Conflicts on (player_id, period_start) are replaced.
 *
 * @param {string} playerId
 * @param {string} periodStart  ISO date string 'YYYY-MM-DD'
 * @param {string} periodEnd    ISO date string 'YYYY-MM-DD'
 * @param {object} stats        { hands_played, net_chips, vpip_pct, pfr_pct, wtsd_pct, wsd_pct, three_bet_pct, avg_decision_time_ms, most_common_mistakes }
 */
async function upsertSnapshot(playerId, periodStart, periodEnd, stats) {
  const { error } = await supabase
    .from('player_performance_snapshots')
    .upsert(
      {
        player_id:    playerId,
        period_start: periodStart,
        period_end:   periodEnd,
        ...stats,
      },
      { onConflict: 'player_id,period_start' }
    );
  if (error) throw new Error(error.message);
}

/**
 * Get performance snapshots for a player, newest first.
 * @param {string} playerId
 * @param {{ limit?: number }} opts
 * @returns {Array}
 */
async function getSnapshots(playerId, { limit = 12 } = {}) {
  const data = await q(
    supabase
      .from('player_performance_snapshots')
      .select('id, period_start, period_end, hands_played, net_chips, vpip_pct, pfr_pct, wtsd_pct, wsd_pct, three_bet_pct, avg_decision_time_ms, most_common_mistakes, created_at')
      .eq('player_id', playerId)
      .order('period_start', { ascending: false })
      .limit(limit)
  );
  return data || [];
}

// ─── Game Session History ─────────────────────────────────────────────────────

/**
 * Get game session history for a player from session_player_stats.
 * Joins the sessions table to get table_id and started_at.
 *
 * @param {string} playerId
 * @param {{ limit?: number, offset?: number }} opts
 * @returns {Array}
 */
async function getPlayerGameSessions(playerId, { limit = 20, offset = 0 } = {}) {
  const data = await q(
    supabase
      .from('session_player_stats')
      .select('session_id, hands_played, hands_won, net_chips, vpip_count, pfr_count, wtsd_count, updated_at, sessions(table_id, started_at, ended_at)')
      .eq('player_id', playerId)
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1)
  );
  return (data || []).map(r => {
    const total = r.hands_played ?? 0;
    return {
      session_id:   r.session_id,
      table_id:     r.sessions?.table_id ?? null,
      started_at:   r.sessions?.started_at ?? r.updated_at,
      ended_at:     r.sessions?.ended_at ?? null,
      hands_played: total,
      net_chips:    r.net_chips ?? 0,
      win_rate:     total > 0 ? Math.round((r.hands_won ?? 0) / total * 100) : null,
      vpip:         total > 0 ? Math.round((r.vpip_count  ?? 0) / total * 100) : null,
      pfr:          total > 0 ? Math.round((r.pfr_count   ?? 0) / total * 100) : null,
    };
  });
}

// ─── Note Update ──────────────────────────────────────────────────────────────

/**
 * Update a coach note. Validates the note belongs to the given player.
 *
 * @param {string} noteId
 * @param {string} playerId  Safety scoping: note must belong to this player
 * @param {{ content?: string, noteType?: string, sharedWithStudent?: boolean }} opts
 */
async function updateNote(noteId, playerId, { content, noteType, sharedWithStudent } = {}) {
  const patch = {};
  if (content              !== undefined) patch.content            = content;
  if (noteType             !== undefined) patch.note_type          = noteType;
  if (sharedWithStudent    !== undefined) patch.shared_with_student = sharedWithStudent;
  if (Object.keys(patch).length === 0) return;

  const { error } = await supabase
    .from('player_notes')
    .update(patch)
    .eq('id', noteId)
    .eq('player_id', playerId);
  if (error) throw new Error(error.message);
}

// ─── Student-facing notes (shared only) ───────────────────────────────────────

/**
 * Get notes shared with a student (player).
 * @param {string} playerId  The student's own player_id
 * @param {{ limit?: number, offset?: number }} opts
 * @returns {Array} shared note rows with coach identity
 */
async function getSharedNotes(playerId, { limit = 20, offset = 0 } = {}) {
  const data = await q(
    supabase
      .from('player_notes')
      .select('id, content, note_type, created_at, coach_id, player_profiles!coach_id(display_name)')
      .eq('player_id', playerId)
      .eq('shared_with_student', true)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)
  );
  return (data || []).map(r => ({
    id:         r.id,
    content:    r.content,
    note_type:  r.note_type,
    created_at: r.created_at,
    coach_name: r.player_profiles?.display_name ?? null,
  }));
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  getPlayerCRMSummary,
  createNote,
  getNotes,
  updateNote,
  getSharedNotes,
  setPlayerTags,
  getPlayerTags,
  createCoachingSession,
  getCoachingSessions,
  updateSessionStatus,
  upsertSnapshot,
  getSnapshots,
  getPlayerGameSessions,
};
