'use strict';

module.exports = function registerCoachControls(socket, ctx) {
  const { tables, activeHands, stableIdMap, io,
          broadcastState, sendError, sendSyncError, startActionTimer, clearActionTimer,
          requireCoach, HandLogger, log } = ctx;

  socket.on('manual_deal_card', ({ targetType, targetId, position, card } = {}) => {
    if (requireCoach(socket, 'deal cards manually')) return;
    const gm = tables.get(socket.data.tableId);
    if (!gm) return sendError(socket, 'Not in a room');
    const result = gm.manualDealCard(targetType, targetId, position, card);
    if (result.error) return sendError(socket, result.error);
    const targetName = targetType === 'board'
      ? 'the board'
      : gm.state.players.find(p => p.id === targetId)?.name || targetId;
    broadcastState(socket.data.tableId, {
      type: 'manual_card',
      message: `Coach dealt ${card} to ${targetName}`
    });
  });

  socket.on('undo_action', () => {
    if (requireCoach(socket, 'undo')) return;
    const gm = tables.get(socket.data.tableId);
    if (!gm) return sendError(socket, 'Not in a room');
    if (gm.state.phase === 'waiting') return sendSyncError(socket, 'Nothing to undo between hands');
    const result = gm.undoAction();
    if (result.error) return sendSyncError(socket, result.error);
    broadcastState(socket.data.tableId, { type: 'undo', message: 'Coach undid the last action' });
    const undoHandInfo = activeHands.get(socket.data.tableId);
    if (undoHandInfo) {
      HandLogger.markLastActionReverted(undoHandInfo.handId).catch(err =>
        log.error('db', 'undo_revert_failed', '[HandLogger] markLastActionReverted', { err, tableId: socket.data.tableId }));
    }
  });

  socket.on('rollback_street', () => {
    if (requireCoach(socket, 'roll back a street')) return;
    const gm = tables.get(socket.data.tableId);
    if (!gm) return sendError(socket, 'Not in a room');
    const result = gm.rollbackStreet();
    if (result.error) {
      sendSyncError(socket, result.error);
      broadcastState(socket.data.tableId);
      return;
    }
    broadcastState(socket.data.tableId, { type: 'rollback', message: 'Coach rolled back to the previous street' });
  });

  socket.on('set_player_in_hand', ({ playerId, inHand } = {}) => {
    if (requireCoach(socket, 'change in-hand status')) return;
    if (!playerId || typeof playerId !== 'string' || !playerId.trim()) return sendError(socket, 'playerId is required');
    if (typeof inHand !== 'boolean') return sendError(socket, 'inHand must be a boolean');
    const tableId = socket.data.tableId;
    const gm = tables.get(tableId);
    if (!gm) return sendError(socket, 'Not in a room');
    const result = gm.setPlayerInHand(playerId, inHand);
    if (result.error) return sendError(socket, result.error);
    broadcastState(tableId);
  });

  socket.on('toggle_pause', () => {
    if (requireCoach(socket, 'pause')) return;
    const gm = tables.get(socket.data.tableId);
    if (!gm) return sendError(socket, 'Not in a room');
    const tableId = socket.data.tableId;
    const result = gm.togglePause();
    if (result.paused) {
      clearActionTimer(tableId, { saving: true });
    } else {
      startActionTimer(tableId, { resumeRemaining: true });
    }
    broadcastState(tableId, {
      type: result.paused ? 'pause' : 'resume',
      message: result.paused ? 'Coach paused the game' : 'Coach resumed the game'
    });
  });

  socket.on('set_blind_levels', ({ sb, bb } = {}) => {
    if (requireCoach(socket, 'change blind levels')) return;
    const sbN = Number(sb), bbN = Number(bb);
    if (!Number.isFinite(sbN) || !Number.isInteger(sbN) || sbN <= 0) return sendSyncError(socket, 'Invalid blind levels: sb must be a positive integer');
    if (!Number.isFinite(bbN) || !Number.isInteger(bbN) || bbN <= sbN) return sendSyncError(socket, 'Invalid blind levels: bb must be a positive integer greater than sb');
    const gm = tables.get(socket.data.tableId);
    if (!gm) return sendError(socket, 'Not in a room');
    const result = gm.setBlindLevels(sbN, bbN);
    if (result.error) return sendSyncError(socket, result.error);
    broadcastState(socket.data.tableId, { type: 'blind_change', message: `Blinds set to ${sbN}/${bbN}` });
  });

  socket.on('set_mode', ({ mode } = {}) => {
    if (requireCoach(socket, 'set mode')) return;
    const gm = tables.get(socket.data.tableId);
    if (!gm) return sendError(socket, 'Not in a room');
    const ACTIVE_PHASES = new Set(['preflop', 'flop', 'turn', 'river', 'showdown', 'replay']);
    if (ACTIVE_PHASES.has(gm.state.phase)) return sendSyncError(socket, 'Cannot change mode during an active hand');
    const result = gm.setMode(mode);
    if (result.error) return sendSyncError(socket, result.error);
    broadcastState(socket.data.tableId, { type: 'mode_change', message: `Mode switched to ${mode.toUpperCase()}` });
  });

  socket.on('force_next_street', () => {
    if (requireCoach(socket, 'force a street')) return;
    const gm = tables.get(socket.data.tableId);
    if (!gm) return sendError(socket, 'Not in a room');
    const result = gm.forceNextStreet();
    if (result.error) return sendError(socket, result.error);
    const tableId = socket.data.tableId;
    broadcastState(tableId, { type: 'street_advance', message: `Coach advanced to ${gm.state.phase}` });
    const freshState = gm.getPublicState(socket.id, socket.data.isCoach);
    if (freshState.phase === 'showdown' && freshState.showdown_result) {
      io.to(tableId).emit('showdown_result', freshState.showdown_result);
    }
    startActionTimer(tableId);
  });

  socket.on('award_pot', ({ winnerId } = {}) => {
    if (requireCoach(socket, 'award the pot')) return;
    if (!winnerId || typeof winnerId !== 'string' || !winnerId.trim()) return sendError(socket, 'winnerId is required');
    const gm = tables.get(socket.data.tableId);
    if (!gm) return sendError(socket, 'Not in a room');
    const result = gm.awardPot(winnerId);
    if (result.error) return sendSyncError(socket, result.error);
    const winner = gm.state.players.find(p => p.id === winnerId);
    const tableId = socket.data.tableId;
    broadcastState(tableId, { type: 'pot_awarded', message: `Pot awarded to ${winner?.name}` });
    const freshState = gm.getPublicState(socket.id, socket.data.isCoach);
    if (freshState.phase === 'showdown' && freshState.showdown_result) {
      io.to(tableId).emit('showdown_result', freshState.showdown_result);
    }
    startActionTimer(tableId);
  });

  socket.on('adjust_stack', ({ playerId, amount } = {}) => {
    if (requireCoach(socket, 'adjust stacks')) return;
    if (!playerId || typeof playerId !== 'string' || !playerId.trim()) return sendError(socket, 'playerId is required');
    const amtN = Number(amount);
    if (!Number.isFinite(amtN) || amtN < 0 || !Number.isInteger(amtN)) return sendError(socket, 'amount must be a non-negative integer');
    const gm = tables.get(socket.data.tableId);
    if (!gm) return sendError(socket, 'Not in a room');
    const result = gm.adjustStack(playerId, Number(amount));
    if (result.error) return sendError(socket, result.error);
    const sessionId = gm.state?.session_id;
    const stableId  = stableIdMap.get(playerId) || playerId;
    if (sessionId && stableId && !String(stableId).startsWith('coach_')) {
      HandLogger.logStackAdjustment(sessionId, stableId, Number(amount)).catch(() => {});
    }
    broadcastState(socket.data.tableId);
  });
};
