'use strict';

const { v4: uuidv4 } = require('uuid');
const supabase = require('../supabase');
const { q, parseTags } = require('../utils');

// ─── Playlist API ─────────────────────────────────────────────────────────────

async function createPlaylist({ name, description = '', tableId = null }) {
  const playlist_id = uuidv4();
  await q(supabase.from('playlists').insert({
    playlist_id, name, description: description || null,
    table_id: tableId, created_at: new Date().toISOString(),
  }));
  return { playlist_id, name, description, table_id: tableId };
}

async function getPlaylists({ tableId = null } = {}) {
  let query = supabase
    .from('playlists')
    .select('*, playlist_hands(count)')
    .order('created_at', { ascending: false });
  if (tableId) query = query.eq('table_id', tableId);
  const data = await q(query);
  return (data || []).map(p => ({
    ...p,
    hand_count: p.playlist_hands?.[0]?.count ?? 0,
    playlist_hands: undefined,
  }));
}

async function getPlaylistHands(playlistId) {
  const data = await q(
    supabase.from('playlist_hands')
      .select('*, hands(board, final_pot, winner_name, phase_ended, hand_tags(tag, tag_type))')
      .eq('playlist_id', playlistId)
      .order('display_order', { ascending: true })
  );
  return (data || []).map(row => ({
    playlist_id:   row.playlist_id,
    hand_id:       row.hand_id,
    display_order: row.display_order,
    board:         row.hands?.board || [],
    final_pot:     row.hands?.final_pot,
    winner_name:   row.hands?.winner_name,
    phase_ended:   row.hands?.phase_ended,
    ...parseTags(row.hands?.hand_tags ?? []),
  }));
}

async function addHandToPlaylist(playlistId, handId) {
  if (!playlistId || !handId) throw new Error('playlistId and handId are required');

  const existing = await q(
    supabase.from('playlist_hands')
      .select('display_order')
      .eq('playlist_id', playlistId)
      .order('display_order', { ascending: false })
      .limit(1)
  );
  const nextOrder = existing?.length > 0 ? (existing[0].display_order + 1) : 0;

  await q(supabase.from('playlist_hands').upsert({
    playlist_id: playlistId,
    hand_id:     handId,
    display_order: nextOrder,
    added_at:    new Date().toISOString(),
  }, { onConflict: 'playlist_id,hand_id', ignoreDuplicates: true }));

  return { playlist_id: playlistId, hand_id: handId, display_order: nextOrder };
}

async function removeHandFromPlaylist(playlistId, handId) {
  await q(supabase.from('playlist_hands').delete()
    .eq('playlist_id', playlistId).eq('hand_id', handId));

  const remaining = await q(
    supabase.from('playlist_hands')
      .select('hand_id')
      .eq('playlist_id', playlistId)
      .order('display_order', { ascending: true })
  );

  if (remaining?.length > 0) {
    await Promise.all(remaining.map((row, idx) =>
      q(supabase.from('playlist_hands')
        .update({ display_order: idx })
        .eq('playlist_id', playlistId)
        .eq('hand_id', row.hand_id))
    ));
  }
}

async function deletePlaylist(playlistId) {
  await q(supabase.from('playlists').delete().eq('playlist_id', playlistId));
}

module.exports = {
  createPlaylist, getPlaylists, getPlaylistHands,
  addHandToPlaylist, removeHandFromPlaylist, deletePlaylist,
};
