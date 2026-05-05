'use strict';

const PlaylistExecutionService = require('../../services/PlaylistExecutionService');

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

  socket.on('rename_playlist', async ({ playlistId, name } = {}) => {
    if (requireCoach(socket, 'rename playlists')) return;
    if (!playlistId || typeof name !== 'string' || !name.trim()) {
      return sendError(socket, 'playlistId and name are required');
    }
    try {
      const trimmed = name.trim();
      if (trimmed.length > 100) return sendError(socket, 'Playlist name is too long');
      await HandLogger.renamePlaylist(playlistId, trimmed);
      const tableId = socket.data.tableId;
      socket.emit('playlist_state', { playlists: await HandLogger.getPlaylists({ tableId }) });
      socket.emit('notification', { type: 'playlist_renamed', message: `Playlist renamed to "${trimmed}"` });
    } catch (err) {
      sendError(socket, `Failed to rename playlist: ${err.message}`);
    }
  });

  socket.on('activate_playlist', async ({ playlistId } = {}) => {
    if (requireCoach(socket, 'activate playlists')) return;
    const tableId = socket.data.tableId;
    const gm = tables.get(tableId);
    if (!gm) return sendError(socket, 'Not in a room');
    if (gm.state.phase !== 'waiting') return sendError(socket, 'Can only activate playlist between hands');

    // Guard: block if a REST drill session is already active at this table
    try {
      const restDrillSession = await PlaylistExecutionService.getStatus(tableId);
      if (restDrillSession?.active) {
        return sendError(socket, 'A structured drill session is active at this table. End it first.');
      }
    } catch (_) { /* non-blocking — proceed if status check fails */ }

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

  // ── branch_to_drill: capture a (replay or live-history) hand into a playlist
  // for later drilling. New playlists are created on demand by name. The
  // optional cursor argument is logged but not yet persisted — playlist_hands
  // has no per-snapshot column. Once that lands the cursor will let the drill
  // load the hand at a specific decision point instead of from the start.
  socket.on('branch_to_drill', async ({ handId, playlistId, newPlaylistName, cursor } = {}) => {
    if (requireCoach(socket, 'branch to drill')) return;
    if (!handId || typeof handId !== 'string') {
      return sendError(socket, 'handId is required');
    }
    if (!playlistId && !newPlaylistName) {
      return sendError(socket, 'Provide either playlistId or newPlaylistName');
    }
    if (playlistId && newPlaylistName) {
      return sendError(socket, 'Provide one of playlistId or newPlaylistName, not both');
    }
    const tableId = socket.data.tableId;

    // Authorization: when adding to an existing playlist, verify it belongs
    // to this coach's table. Without this, a coach with a known playlist UUID
    // could pollute another table's drill. UUIDs are unguessable in practice
    // but the principle ("never trust client-supplied IDs") is the rule per
    // CLAUDE.md auth scope guidance.
    if (playlistId) {
      let playlist;
      try {
        playlist = await HandLogger.getPlaylist(playlistId);
      } catch (err) {
        return sendError(socket, `Failed to verify playlist: ${err.message}`);
      }
      if (!playlist) return sendError(socket, 'Playlist not found');
      // Allow null table_id (legacy global playlists) or matching table.
      if (playlist.table_id != null && playlist.table_id !== tableId) {
        return sendError(socket, 'Playlist belongs to a different table');
      }
    }

    let resolvedPlaylistId = playlistId;
    let createdNewPlaylist = false;
    try {
      if (!resolvedPlaylistId) {
        const trimmed = String(newPlaylistName).trim();
        if (!trimmed) return sendError(socket, 'newPlaylistName cannot be empty');
        const created = await HandLogger.createPlaylist({
          name: trimmed,
          description: 'Created from Review tab branch',
          tableId,
        });
        resolvedPlaylistId = created.playlist_id;
        createdNewPlaylist = true;
      }
      try {
        await HandLogger.addHandToPlaylist(resolvedPlaylistId, handId);
      } catch (addErr) {
        // Rollback: if we just created the playlist for this branch, drop it
        // so DB doesn't accumulate empty drill ghosts on transient failures.
        if (createdNewPlaylist) {
          await HandLogger.deletePlaylist(resolvedPlaylistId).catch(() => {});
        }
        throw addErr;
      }
      socket.emit('branch_to_drill_saved', {
        playlistId: resolvedPlaylistId,
        handId,
        cursor: typeof cursor === 'number' ? cursor : null,
      });
      socket.emit('playlist_state', { playlists: await HandLogger.getPlaylists({ tableId }) });
      socket.emit('notification', {
        type: 'branched_to_drill',
        message: 'Hand saved to drill',
      });
    } catch (err) {
      sendError(socket, `Failed to save branch: ${err.message}`);
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
