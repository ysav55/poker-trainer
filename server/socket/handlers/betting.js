'use strict';

module.exports = function registerBetting(socket, ctx) {
  const { tables, activeHands, stableIdMap, actionTimers, io,
          broadcastState, sendError, startActionTimer, clearActionTimer,
          HandLogger, log, getPosition } = ctx;

  socket.on('place_bet', ({ action, amount = 0 } = {}) => {
    const tableId = socket.data.tableId;
    const gm = tables.get(tableId);
    if (!gm) return sendError(socket, 'Not in a room');

    const isBranchedCoach = gm.state.is_replay_branch && socket.data.isCoach;
    const effectivePlayerId = isBranchedCoach ? gm.state.current_turn : socket.id;
    if (isBranchedCoach && !effectivePlayerId) return sendError(socket, 'No active shadow player to act for');

    const timerEntry = actionTimers.get(tableId);
    const decisionTimeMs = timerEntry ? (Date.now() - timerEntry.startedAt) : null;

    clearActionTimer(tableId, { saving: false });

    const streetBeforeBet = gm.state.phase;
    const playerBeforeBet = gm.state.players.find(p => p.id === effectivePlayerId);
    const stackBeforeBet  = playerBeforeBet?.stack ?? null;
    const potBeforeBet    = gm.state.pot ?? null;

    const result = gm.placeBet(effectivePlayerId, action, Number(amount));

    if (result.error) {
      const isSyncRejection = result.error.includes('Not your turn')
        || result.error.includes('paused')
        || result.error.includes('Game is not');
      if (isSyncRejection) {
        socket.emit('sync_error', { message: result.error });
      } else {
        sendError(socket, result.error);
      }
      startActionTimer(tableId);
      return;
    }

    const handInfo = activeHands.get(tableId);
    if (handInfo && !isBranchedCoach) {
      const player = gm.state.players.find(p => p.id === effectivePlayerId);
      const seatedForPos = gm.state.players
        .filter(p => p.seat >= 0)
        .sort((a, b) => a.seat - b.seat)
        .map(p => ({ player_id: p.id, seat: p.seat }));
      const position = getPosition(seatedForPos, gm.state.dealer_seat ?? -1, effectivePlayerId);
      HandLogger.recordAction({
        handId: handInfo.handId,
        playerId: socket.data.stableId || socket.id,
        playerName: player?.name || socket.data.name,
        street: streetBeforeBet,
        action,
        amount: Number(amount) || 0,
        isManualScenario: handInfo.isManualScenario || false,
        stackAtAction: stackBeforeBet,
        potAtAction:   potBeforeBet,
        decisionTimeMs,
        position,
      }).catch(err => log.error('db', 'record_action_failed', '[HandLogger] recordAction', { err, tableId }));
    }

    const actingPlayer = gm.state.players.find(p => p.id === effectivePlayerId);
    broadcastState(tableId, {
      type: 'action',
      message: `${actingPlayer?.name} ${action}${action === 'raise' ? 's to ' + amount : action === 'call' ? 's' : 's'}`
    });
    const freshState = gm.getPublicState(socket.id, socket.data.isCoach);
    if (freshState.phase === 'showdown' && freshState.showdown_result) {
      io.to(tableId).emit('showdown_result', freshState.showdown_result);
    }
    startActionTimer(tableId);
  });
};
