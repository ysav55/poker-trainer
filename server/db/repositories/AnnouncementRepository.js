'use strict';

/**
 * AnnouncementRepository
 *
 * Thin data-access layer over the `announcements` + `announcement_reads` tables.
 *
 * Functions:
 *   createAnnouncement({ authorId, targetType, targetId, title, body })
 *   listForPlayer(playerId, { limit, offset })
 *   markRead(announcementId, playerId)
 *   unreadCount(playerId)
 */

const supabase = require('../supabase');

/**
 * Create a new announcement.
 * @returns {object} The created announcement row.
 */
async function createAnnouncement({ authorId, targetType = 'all', targetId = null, title, body }) {
  if (!authorId) throw new Error('authorId is required');
  if (!title || typeof title !== 'string' || title.trim().length === 0) throw new Error('title is required');
  if (!body  || typeof body  !== 'string' || body.trim().length  === 0) throw new Error('body is required');
  if (!['all', 'group', 'individual'].includes(targetType)) throw new Error('invalid targetType');

  const { data, error } = await supabase
    .from('announcements')
    .insert({
      author_id:   authorId,
      target_type: targetType,
      target_id:   targetId ?? null,
      title:       title.trim(),
      body:        body.trim(),
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * List announcements visible to a player — newest first.
 * Includes a `read_at` field (null if unread).
 *
 * Visibility rules (applied server-side after fetch):
 *   target_type = 'all'        → always visible
 *   target_type = 'group'      → visible when target_id matches a tag on the player (future work)
 *   target_type = 'individual' → visible only when target_id = playerId
 *
 * For now, we return 'all' + 'individual' rows for this player.
 */
async function listForPlayer(playerId, { limit = 50, offset = 0 } = {}) {
  if (!playerId) throw new Error('playerId is required');

  const safeLimit  = Math.min(parseInt(limit, 10)  || 50, 200);
  const safeOffset = parseInt(offset, 10) || 0;

  // Fetch all + individual announcements for this player
  const { data, error } = await supabase
    .from('announcements')
    .select(`
      id, author_id, target_type, target_id, title, body, created_at,
      announcement_reads!left ( read_at )
    `)
    .or(`target_type.eq.all,and(target_type.eq.individual,target_id.eq.${playerId})`)
    .order('created_at', { ascending: false })
    .range(safeOffset, safeOffset + safeLimit - 1);

  if (error) throw new Error(error.message);

  // Flatten read_at from the join
  return (data ?? []).map(row => ({
    id:          row.id,
    authorId:    row.author_id,
    targetType:  row.target_type,
    targetId:    row.target_id,
    title:       row.title,
    body:        row.body,
    createdAt:   row.created_at,
    readAt:      row.announcement_reads?.[0]?.read_at ?? null,
  }));
}

/**
 * Mark an announcement as read for a player.
 * Idempotent — subsequent calls update read_at.
 */
async function markRead(announcementId, playerId) {
  if (!announcementId || !playerId) throw new Error('announcementId and playerId are required');

  const { error } = await supabase
    .from('announcement_reads')
    .upsert({ announcement_id: announcementId, player_id: playerId, read_at: new Date().toISOString() },
             { onConflict: 'announcement_id,player_id' });

  if (error) throw new Error(error.message);
}

/**
 * Count unread announcements for a player.
 * @returns {number}
 */
async function unreadCount(playerId) {
  if (!playerId) throw new Error('playerId is required');

  // Get IDs of all visible announcements
  const { data: allRows, error: allErr } = await supabase
    .from('announcements')
    .select('id')
    .or(`target_type.eq.all,and(target_type.eq.individual,target_id.eq.${playerId})`);

  if (allErr) throw new Error(allErr.message);
  if (!allRows || allRows.length === 0) return 0;

  const allIds = allRows.map(r => r.id);

  // Get IDs already read
  const { data: readRows, error: readErr } = await supabase
    .from('announcement_reads')
    .select('announcement_id')
    .eq('player_id', playerId)
    .in('announcement_id', allIds);

  if (readErr) throw new Error(readErr.message);

  return allIds.length - (readRows?.length ?? 0);
}

module.exports = { createAnnouncement, listForPlayer, markRead, unreadCount };
