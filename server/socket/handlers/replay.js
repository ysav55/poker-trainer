'use strict';

module.exports = function registerReplay(socket, ctx) {
  const { tables, activeHands, io, broadcastState, sendError, sendSyncError,
          requireCoach, HandLogger, advancePlaylist } = ctx;

  socket.on('load_replay', async ({ handId } = {}) => {
    if (requireCoach(socket, 'load replays')) return;
    const tableId = socket.data.tableId;
    const gm = tables.get(tableId);
    if (!gm) return sendError(socket, 'Not in a room');
    if (gm.state.phase !== 'waiting') return sendSyncError(socket, 'Can only load replay between hands');
    try {
      const handDetail = await HandLogger.getHandDetail(handId);
      if (!handDetail) return sendSyncError(socket, `Hand ${handId} not found`);
      const result = gm.loadReplay(handDetail);
      if (result.error) return sendSyncError(socket, result.error);
      const actionCount = (handDetail.actions || []).filter(a => !a.is_reverted).length;
      broadcastState(tableId);
      socket.emit('replay_loaded', { handId, actionCount });
    } catch (err) {
      sendError(socket, `Failed to load replay: ${err.message}`);
    }
  });

  socket.on('replay_step_forward', () => {
    if (requireCoach(socket, 'control replay')) return;
    const tableId = socket.data.tableId;
    const gm = tables.get(tableId);
    if (!gm) return sendError(socket, 'Not in a room');
    const result = gm.replayStepForward();
    if (result.error) return sendSyncError(socket, result.error);
    broadcastState(tableId);
  });

  socket.on('replay_step_back', () => {
    if (requireCoach(socket, 'control replay')) return;
    const tableId = socket.data.tableId;
    const gm = tables.get(tableId);
    if (!gm) return sendError(socket, 'Not in a room');
    const result = gm.replayStepBack();
    if (result.error) return sendSyncError(socket, result.error);
    broadcastState(tableId);
  });

  socket.on('replay_jump_to', ({ cursor } = {}) => {
    if (requireCoach(socket, 'control replay')) return;
    const tableId = socket.data.tableId;
    const gm = tables.get(tableId);
    if (!gm) return sendError(socket, 'Not in a room');
    if (cursor === undefined || cursor === null) return sendSyncError(socket, 'cursor is required');
    const result = gm.replayJumpTo(parseInt(cursor));
    if (result.error) return sendSyncError(socket, result.error);
    broadcastState(tableId);
  });

  socket.on('replay_branch', () => {
    if (requireCoach(socket, 'branch replay')) return;
    const tableId = socket.data.tableId;
    const gm = tables.get(tableId);
    if (!gm) return sendError(socket, 'Not in a room');
    const result = gm.branchFromReplay();
    if (result.error) return sendSyncError(socket, result.error);
    broadcastState(tableId, { type: 'replay_branched', message: 'Branched to live play from replay state' });
  });

  socket.on('replay_unbranch', () => {
    if (requireCoach(socket, 'unbranch replay')) return;
    const tableId = socket.data.tableId;
    const gm = tables.get(tableId);
    if (!gm) return sendError(socket, 'Not in a room');
    const result = gm.unBranchToReplay();
    if (result.error) return sendSyncError(socket, result.error);
    broadcastState(tableId, { type: 'replay_unbranced', message: 'Returned to replay mode' });
  });

  socket.on('replay_exit', async () => {
    if (requireCoach(socket, 'exit replay')) return;
    const tableId = socket.data.tableId;
    const gm = tables.get(tableId);
    if (!gm) return sendError(socket, 'Not in a room');
    try {
      const result = gm.exitReplay();
      if (result.error) return sendSyncError(socket, result.error);
      if (result.playlistWasActive && gm.state.playlist_mode?.active) {
        await advancePlaylist(tableId, gm);
      } else {
        broadcastState(tableId, { type: 'replay_exited', message: 'Replay mode ended' });
      }
    } catch (err) {
      sendError(socket, `Failed to exit replay: ${err.message}`);
    }
  });

  // ── "Go to Review" — load a hand into replay and signal all clients to navigate
  // to the ReviewTablePage in socket-driven mode. Only valid between hands.
  socket.on('transition_to_review', async ({ handId: requestedHandId } = {}) => {
    if (requireCoach(socket, 'start review')) return;
    const tableId = socket.data.tableId;
    const gm = tables.get(tableId);
    if (!gm) return sendError(socket, 'Not in a room');
    if (gm.state.phase !== 'waiting') {
      return sendError(socket, 'Can only start a review between hands — end the current hand first');
    }

    try {
      // Resolve handId: use the requested one, or fall back to the most recent hand for this table
      let handId = requestedHandId;
      if (!handId && activeHands?.has?.(tableId)) {
        handId = activeHands.get(tableId)?.handId ?? null;
      }
      if (!handId) return sendError(socket, 'No hand specified and no recent hand found');

      const handDetail = await HandLogger.getHandDetail(handId);
      if (!handDetail) return sendError(socket, `Hand ${handId} not found`);

      const result = gm.loadReplay(handDetail);
      if (result.error) return sendError(socket, result.error);

      const actionCount = (handDetail.actions || []).filter(a => !a.is_reverted).length;
      broadcastState(tableId);
      // Signal all clients in the room to navigate to ReviewTablePage in socket mode
      io.to(tableId).emit('transition_to_review', { handId, tableId, actionCount });
    } catch (err) {
      sendError(socket, `Failed to start review: ${err.message}`);
    }
  });

  // ── "Back to Play" — exit replay mode and signal all clients to return to the live table
  socket.on('transition_back_to_play', async () => {
    if (requireCoach(socket, 'end review')) return;
    const tableId = socket.data.tableId;
    const gm = tables.get(tableId);
    if (!gm) return sendError(socket, 'Not in a room');
    try {
      const result = gm.exitReplay();
      if (result.error) return sendError(socket, result.error);
      broadcastState(tableId);
      io.to(tableId).emit('transition_back_to_play', { tableId });
    } catch (err) {
      sendError(socket, `Failed to end review: ${err.message}`);
    }
  });
};
