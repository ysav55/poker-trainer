'use strict';

module.exports = function registerReplay(socket, ctx) {
  const { tables, io, broadcastState, sendError, sendSyncError,
          requireCoach, HandLogger, advancePlaylist } = ctx;

  socket.on('load_replay', async ({ handId } = {}) => {
    if (requireCoach(socket, 'load replays')) return;
    const tableId = socket.data.tableId;
    const gm = tables.get(tableId);
    if (!gm) return sendError(socket, 'Not in a room');
    if (gm.state.phase !== 'waiting') return sendSyncError(socket, 'Can only load replay between hands');
    const handDetail = await HandLogger.getHandDetail(handId);
    if (!handDetail) return sendSyncError(socket, `Hand ${handId} not found`);
    const result = gm.loadReplay(handDetail);
    if (result.error) return sendSyncError(socket, result.error);
    const actionCount = (handDetail.actions || []).filter(a => !a.is_reverted).length;
    broadcastState(tableId);
    socket.emit('replay_loaded', { handId, actionCount });
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
    const result = gm.exitReplay();
    if (result.error) return sendSyncError(socket, result.error);
    if (result.playlistWasActive && gm.state.playlist_mode?.active) {
      await advancePlaylist(tableId, gm);
    } else {
      broadcastState(tableId, { type: 'replay_exited', message: 'Replay mode ended' });
    }
  });
};
