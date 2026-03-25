'use strict';

module.exports = function registerGameLifecycle(socket, ctx) {
  const { tables, activeHands, stableIdMap, io,
          broadcastState, sendError, sendSyncError, startActionTimer, clearActionTimer,
          pausedTimerRemainders,
          requireCoach, HandLogger, AnalyzerService, log, uuidv4, advancePlaylist } = ctx;

  socket.on('start_game', async ({ mode = 'rng' } = {}) => {
    if (requireCoach(socket, 'start the game')) return;
    const gm = tables.get(socket.data.tableId);
    if (!gm) return sendError(socket, 'Not in a room');

    const nonCoachCount = gm.state.players.filter(p => !p.is_coach && p.seat >= 0 && !p.disconnected).length;
    if (nonCoachCount < 1) return sendError(socket, 'Need at least one player seated to start');

    const result = gm.startGame(mode);
    if (result.error) return sendError(socket, result.error);

    const tableId = socket.data.tableId;

    if (!gm.state.is_replay_branch) {
      const handId = uuidv4();
      const allSeatedPlayers = gm.state.players
        .filter(p => !p.is_shadow && !p.is_observer)
        .map(p => ({ id: stableIdMap.get(p.id) || p.id, name: p.name, seat: p.seat, stack: p.stack, is_coach: p.is_coach }));
      HandLogger.startHand({
        handId,
        sessionId: gm.sessionId,
        tableId,
        players: allSeatedPlayers,
        allPlayers: allSeatedPlayers,
        dealerSeat: gm.state.dealer_seat,
        smallBlind: gm.state.small_blind,
        bigBlind: gm.state.big_blind,
        isScenario: false,
        sessionType: 'live',
      }).then(() => {
        activeHands.set(tableId, { handId, sessionId: gm.sessionId });
        socket.emit('hand_started', { handId });
      }).catch(err => log.error('db', 'start_hand_failed', '[HandLogger] startHand', { err, tableId, sessionId: gm.sessionId }));
    }

    broadcastState(tableId, { type: 'game_start', message: `New hand started (${mode.toUpperCase()} mode)` });
    startActionTimer(tableId);
    log.info('game', 'hand_start', `hand started mode=${mode}`, { tableId, mode, sessionId: gm.sessionId });
    log.trackSocket('start_game', tableId, socket.data.stableId, { mode });
    console.log(`[start_game] mode=${mode}`);
  });

  socket.on('reset_hand', async () => {
    if (requireCoach(socket, 'reset')) return;
    const gm = tables.get(socket.data.tableId);
    if (!gm) return sendError(socket, 'Not in a room');
    const tableId = socket.data.tableId;
    clearActionTimer(tableId);
    pausedTimerRemainders.delete(tableId);

    if (gm.state.is_replay_branch) {
      const result = gm.unBranchToReplay();
      if (result.error) return sendSyncError(socket, result.error);
      broadcastState(tableId, { type: 'replay_unbranced', message: 'Returned to replay' });
      return;
    }

    const handInfo = activeHands.get(tableId);
    const stateCopy = handInfo ? JSON.parse(JSON.stringify(gm.state)) : null;

    gm.resetForNextHand();

    if (handInfo && stateCopy) {
      HandLogger.endHand({ handId: handInfo.handId, state: stateCopy, socketToStable: Object.fromEntries(stableIdMap) })
        .then(() => AnalyzerService.analyzeAndTagHand(handInfo.handId))
        .catch(err => log.error('db', 'end_hand_failed', '[HandLogger] endHand/analyzeAndTagHand', { err, tableId }));
      activeHands.delete(tableId);
    }

    broadcastState(tableId, { type: 'reset', message: 'Ready for next hand' });
    const stats = gm.getSessionStats();
    io.to(tableId).emit('session_stats', stats);

    const playlistGm = tables.get(tableId);
    if (playlistGm && playlistGm.state.playlist_mode?.active) {
      await advancePlaylist(tableId, playlistGm);
    }
  });

  socket.on('start_configured_hand', async () => {
    if (requireCoach(socket, 'start a configured hand')) return;
    const gm = tables.get(socket.data.tableId);
    if (!gm) return sendError(socket, 'Not in a room');
    if (!gm.state.config_phase) return sendSyncError(socket, 'No active config phase — call open_config_phase first');

    const result = gm.startGame();
    if (result.error) return sendSyncError(socket, result.error);

    const tableId = socket.data.tableId;
    const handId = uuidv4();
    const allSeatedPlayers = gm.state.players
      .map(p => ({ id: stableIdMap.get(p.id) || p.id, name: p.name, seat: p.seat, stack: p.stack, is_coach: p.is_coach }));
    await HandLogger.startHand({
      handId,
      sessionId: gm.sessionId,
      tableId,
      players: allSeatedPlayers,
      allPlayers: allSeatedPlayers,
      dealerSeat: gm.state.dealer_seat,
      smallBlind: gm.state.small_blind,
      bigBlind: gm.state.big_blind,
      isScenario: true,
      sessionType: 'drill',
    }).catch(err => log.error('db', 'start_hand_configured_failed', '[HandLogger] startHand (configured)', { err, tableId }));
    activeHands.set(tableId, { handId, sessionId: gm.sessionId, isManualScenario: true });
    socket.emit('hand_started', { handId });

    broadcastState(tableId, { type: 'game_start', message: 'Configured hand started' });
    startActionTimer(tableId);
  });
};
