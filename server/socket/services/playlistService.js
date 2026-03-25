'use strict';

/**
 * buildPlaylistService — constructs playlist helpers bound to their dependencies.
 *
 * @param {{ io, HandLogger, broadcastState, loadScenarioIntoConfig }} deps
 * @returns {{ activeNonCoachCount, findMatchingPlaylistIndex, advancePlaylist }}
 */
function buildPlaylistService({ io, HandLogger, broadcastState, loadScenarioIntoConfig }) {

  function activeNonCoachCount(gm) {
    return gm.state.players.filter(p => !p.is_coach && p.seat >= 0 && !p.disconnected).length;
  }

  async function findMatchingPlaylistIndex(gm, activeCount) {
    const pm = gm.state.playlist_mode;
    if (!pm.active || !pm.hands.length) return -1;
    const total = pm.hands.length;
    for (let i = 1; i <= total; i++) {
      const idx = (pm.currentIndex + i) % total;
      const h = pm.hands[idx];
      const detail = await HandLogger.getHandDetail(h.hand_id);
      if (!detail) continue;
      const handCount = (detail.players || []).filter(p => (p.seat ?? -1) >= 0).length;
      if (handCount === activeCount) return idx;
    }
    return -1;
  }

  async function advancePlaylist(tableId, gm) {
    const activeCount = activeNonCoachCount(gm);
    const matchIdx = await findMatchingPlaylistIndex(gm, activeCount);

    if (matchIdx === -1) {
      gm.deactivatePlaylistMode();
      io.to(tableId).emit('notification', {
        type: 'playlist_complete',
        message: `Playlist stopped — no ${activeCount}-player hands remaining.`
      });
      broadcastState(tableId);
      return false;
    }

    const advance = gm.seekPlaylist(matchIdx);
    const nextDetail = await HandLogger.getHandDetail(advance.hand.hand_id);
    if (!nextDetail) {
      io.to(tableId).emit('notification', {
        type: 'warning',
        message: `Playlist: hand not found (deleted?)`
      });
      broadcastState(tableId);
      return false;
    }

    const loadResult = loadScenarioIntoConfig(gm, nextDetail, 'keep');
    if (loadResult.error) {
      io.to(tableId).emit('notification', { type: 'warning', message: `Playlist load failed: ${loadResult.error}` });
      broadcastState(tableId);
      return false;
    }

    broadcastState(tableId, {
      type: 'playlist_advance',
      message: `Playlist: hand ${advance.currentIndex + 1} of ${gm.state.playlist_mode.hands.length}`
    });
    return true;
  }

  return { activeNonCoachCount, findMatchingPlaylistIndex, advancePlaylist };
}

module.exports = buildPlaylistService;
