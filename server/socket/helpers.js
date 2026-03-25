'use strict';

/**
 * buildHelpers — constructs the socket helper functions bound to io + sharedState.
 *
 * Call once at server startup:  const helpers = buildHelpers(io, sharedState);
 * Pass helpers into each socket handler's ctx.
 *
 * Functions returned:
 *   broadcastState(tableId, notification?)
 *   sendError(socket, message)
 *   sendSyncError(socket, message)
 *   startActionTimer(tableId, opts?)
 *   clearActionTimer(tableId, opts?)
 */
function buildHelpers(io, sharedState) {
  const { tables, actionTimers, pausedTimerRemainders } = sharedState;

  function broadcastState(tableId, notification = null) {
    const gm = tables.get(tableId);
    if (!gm) return;
    const room = io.sockets.adapter.rooms.get(tableId);
    if (!room) return;
    for (const socketId of room) {
      const socket = io.sockets.sockets.get(socketId);
      if (!socket) continue;
      const publicState = gm.getPublicState(socketId, socket.data.isCoach);
      socket.emit('game_state', publicState);
    }
    if (notification) {
      io.to(tableId).emit('notification', notification);
    }
  }

  function sendError(socket, message) {
    socket.emit('error', { message });
  }

  function sendSyncError(socket, message) {
    socket.emit('sync_error', { message });
  }

  function startActionTimer(tableId, { resumeRemaining = false } = {}) {
    clearActionTimer(tableId, { saving: false });
    const gm = tables.get(tableId);
    if (!gm) return;
    const state = gm.state;
    if (!state.current_turn || state.paused || state.phase === 'waiting' || state.phase === 'showdown') return;

    const playerId = state.current_turn;
    const player = state.players.find(p => p.id === playerId);
    if (!player) return;

    let duration = 30_000;
    if (resumeRemaining) {
      const saved = pausedTimerRemainders.get(tableId);
      if (saved && saved.playerId === playerId) {
        duration = Math.max(saved.remainingMs, 1000);
        pausedTimerRemainders.delete(tableId);
      }
    }

    const startedAt = Date.now();
    io.to(tableId).emit('action_timer', { playerId, duration, startedAt });

    const timeout = setTimeout(() => {
      actionTimers.delete(tableId);
      const currentGm = tables.get(tableId);
      if (!currentGm || currentGm.state.paused) return;
      const activeBetting = ['preflop', 'flop', 'turn', 'river'];
      if (!activeBetting.includes(currentGm.state.phase)) return;
      if (currentGm.state.current_turn !== playerId) return;
      const timerPlayer = currentGm.state.players.find(p => p.id === playerId);
      const toCall = (currentGm.state.current_bet ?? 0) - (timerPlayer?.total_bet_this_round ?? 0);
      const autoAction = toCall <= 0 ? 'check' : 'fold';
      const result = currentGm.placeBet(playerId, autoAction);
      if (!result.error) {
        const timedOutPlayer = timerPlayer || { name: player.name };
        broadcastState(tableId, {
          type: autoAction === 'check' ? 'auto_check' : 'auto_fold',
          message: `${timedOutPlayer.name || 'Player'} timed out — auto-${autoAction}ed`
        });
        startActionTimer(tableId);
      }
    }, duration);

    actionTimers.set(tableId, { timeout, playerId, startedAt, duration });
  }

  function clearActionTimer(tableId, { saving = false } = {}) {
    const entry = actionTimers.get(tableId);
    if (entry) {
      clearTimeout(entry.timeout);
      if (saving) {
        const elapsed = Date.now() - entry.startedAt;
        const remainingMs = Math.max(0, entry.duration - elapsed);
        pausedTimerRemainders.set(tableId, { playerId: entry.playerId, remainingMs });
      } else {
        pausedTimerRemainders.delete(tableId);
      }
      actionTimers.delete(tableId);
      io.to(tableId).emit('action_timer', null);
    }
  }

  return { broadcastState, sendError, sendSyncError, startActionTimer, clearActionTimer };
}

module.exports = buildHelpers;
