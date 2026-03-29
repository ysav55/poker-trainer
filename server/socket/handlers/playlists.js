'use strict';

module.exports = function registerPlaylists(socket, ctx) {
  const { tables, io, broadcastState, sendError,
          requireCoach, HandLogger,
          activeNonCoachCount, findMatchingPlaylistIndex, loadScenarioIntoConfig } = ctx;

  socket.on('update_hand_tags', async ({ handId, tags } = {}) => {
    if (requireCoach(socket, 'tag hands')) return;
    if (!handId || !Array.isArray(tags)) return sendError(socket, 'handId and tags[] are required');
    try {
      await HandLogger.updateCoachTags(handId, tags);
      socket.emit('hand_tags_saved', { handId, coach_tags: tags });
      if (tags.length > 0) {
        const tableId = socket.data.tableId;
        const existingPlaylists = await HandLogger.getPlaylists({ tableId });
        const nameToPlaylist = new Map(existingPlaylists.map(p => [p.name.toLowerCase(), p]));
        let playlistsChanged = false;
        for (const tag of tags) {
          const key = tag.toLowerCase();
          let pl = nameToPlaylist.get(key);
          if (!pl) {
            pl = await HandLogger.createPlaylist({ name: tag, tableId });
            nameToPlaylist.set(key, pl);
            playlistsChanged = true;
          }
          await HandLogger.addHandToPlaylist(pl.playlist_id, handId);
          playlistsChanged = true;
        }
        if (playlistsChanged) {
          socket.emit('playlist_state', { playlists: await HandLogger.getPlaylists({ tableId }) });
        }
      }
    } catch (err) {
      sendError(socket, `Failed to save tags: ${err.message}`);
    }
  });

  socket.on('create_playlist', async ({ name, description = '' } = {}) => {
    if (requireCoach(socket, 'create playlists')) return;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return sendError(socket, 'Playlist name is required');
    }
    try {
      const tableId = socket.data.tableId;
      const playlist = await HandLogger.createPlaylist({ name: name.trim(), description, tableId });
      socket.emit('playlist_state', { playlists: await HandLogger.getPlaylists({ tableId }) });
      socket.emit('notification', { type: 'playlist_created', message: `Playlist "${playlist.name}" created` });
    } catch (err) {
      sendError(socket, `Failed to create playlist: ${err.message}`);
    }
  });

  socket.on('get_playlists', async () => {
    try {
      const tableId = socket.data.tableId;
      const playlists = await HandLogger.getPlaylists({ tableId: tableId || null });
      socket.emit('playlist_state', { playlists });
    } catch (err) {
      sendError(socket, `Failed to load playlists: ${err.message}`);
    }
  });

  socket.on('add_to_playlist', async ({ playlistId, handId } = {}) => {
    if (requireCoach(socket, 'modify playlists')) return;
    if (!playlistId || !handId) return sendError(socket, 'playlistId and handId are required');
    try {
      await HandLogger.addHandToPlaylist(playlistId, handId);
      const tableId = socket.data.tableId;
      socket.emit('playlist_state', { playlists: await HandLogger.getPlaylists({ tableId }) });
    } catch (err) {
      sendError(socket, `Could not add hand to playlist: ${err.message}`);
    }
  });

  socket.on('remove_from_playlist', async ({ playlistId, handId } = {}) => {
    if (requireCoach(socket, 'modify playlists')) return;
    if (!playlistId || !handId) return sendError(socket, 'playlistId and handId are required');
    try {
      await HandLogger.removeHandFromPlaylist(playlistId, handId);
      const tableId = socket.data.tableId;
      socket.emit('playlist_state', { playlists: await HandLogger.getPlaylists({ tableId }) });
    } catch (err) {
      sendError(socket, `Failed to remove hand from playlist: ${err.message}`);
    }
  });

  socket.on('delete_playlist', async ({ playlistId } = {}) => {
    if (requireCoach(socket, 'delete playlists')) return;
    if (!playlistId) return sendError(socket, 'playlistId is required');
    try {
      const tableId = socket.data.tableId;
      const gm = tables.get(tableId);
      if (gm && gm.state.playlist_mode?.playlistId === playlistId) {
        gm.deactivatePlaylistMode();
      }
      await HandLogger.deletePlaylist(playlistId);
      socket.emit('playlist_state', { playlists: await HandLogger.getPlaylists({ tableId }) });
      socket.emit('notification', { type: 'playlist_deleted', message: 'Playlist deleted' });
    } catch (err) {
      sendError(socket, `Failed to delete playlist: ${err.message}`);
    }
  });

  socket.on('activate_playlist', async ({ playlistId } = {}) => {
    if (requireCoach(socket, 'activate playlists')) return;
    const tableId = socket.data.tableId;
    const gm = tables.get(tableId);
    if (!gm) return sendError(socket, 'Not in a room');
    if (gm.state.phase !== 'waiting') return sendError(socket, 'Can only activate playlist between hands');
    try {
      const hands = await HandLogger.getPlaylistHands(playlistId);
      if (!hands.length) return sendError(socket, 'Playlist is empty');
      const result = gm.activatePlaylistMode({ playlistId, hands });
      if (result.error) return sendError(socket, result.error);
      gm.state.playlist_mode.currentIndex = -1;
      const count = activeNonCoachCount(gm);
      const matchIdx = await findMatchingPlaylistIndex(gm, count);
      if (matchIdx === -1) {
        gm.deactivatePlaylistMode();
        return sendError(socket, `Playlist has no ${count}-player hands — add matching hands or adjust table size`);
      }
      gm.seekPlaylist(matchIdx);
      const firstDetail = await HandLogger.getHandDetail(hands[matchIdx].hand_id);
      if (firstDetail) {
        const loadResult = loadScenarioIntoConfig(gm, firstDetail, 'keep');
        if (loadResult.error) {
          io.to(tableId).emit('notification', { type: 'warning', message: `Playlist load failed: ${loadResult.error}` });
        }
      }
      broadcastState(tableId, {
        type: 'playlist_activated',
        message: `Playlist activated — ${result.totalHands} hands queued (hand 1 of ${result.totalHands})`
      });
      io.to(tableId).emit('playlist_state', { playlists: await HandLogger.getPlaylists({ tableId }) });
    } catch (err) {
      sendError(socket, `Failed to activate playlist: ${err.message}`);
    }
  });

  socket.on('deactivate_playlist', () => {
    if (requireCoach(socket, 'deactivate playlists')) return;
    const tableId = socket.data.tableId;
    const gm = tables.get(tableId);
    if (!gm) return sendError(socket, 'Not in a room');
    gm.deactivatePlaylistMode();
    broadcastState(tableId, { type: 'playlist_deactivated', message: 'Playlist mode deactivated' });
  });
};
