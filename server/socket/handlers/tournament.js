'use strict';

/**
 * Tournament socket event handlers.
 *
 * Registered events:
 *   tournament:move_player  — move a player from their current table to a target table
 */

module.exports = function registerTournamentHandlers(socket, ctx) {
  const { tables, io, requireCoach, sendError } = ctx;

  /**
   * tournament:move_player
   *
   * Payload: { fromTableId, toTableId, playerId }
   *
   * Moves a seated player from one tournament table's game state to another.
   * The player keeps their current chip stack.
   * Emits 'game_state' to both tables after the move.
   */
  socket.on('tournament:move_player', async (payload) => {
    if (requireCoach(socket, 'move tournament players')) return;

    const { fromTableId, toTableId, playerId } = payload ?? {};
    if (!fromTableId || !toTableId || !playerId) {
      return sendError(socket, 'tournament:move_player requires fromTableId, toTableId, playerId');
    }
    if (fromTableId === toTableId) {
      return sendError(socket, 'fromTableId and toTableId must be different');
    }

    const fromGm = tables.get(fromTableId);
    const toGm   = tables.get(toTableId);

    if (!fromGm) return sendError(socket, `Source table ${fromTableId} not found`);
    if (!toGm)   return sendError(socket, `Target table ${toTableId} not found`);

    const fromState = fromGm.getState ? fromGm.getState() : (fromGm.state ?? {});
    const toState   = toGm.getState   ? toGm.getState()   : (toGm.state   ?? {});

    const allFromPlayers = fromState.seated ?? fromState.players ?? [];
    const playerEntry    = allFromPlayers.find(p => p.id === playerId || p.stable_id === playerId);

    if (!playerEntry) {
      return sendError(socket, `Player ${playerId} not found at table ${fromTableId}`);
    }

    const stack = playerEntry.stack ?? 0;
    const name  = playerEntry.name  ?? 'Unknown';

    // Check target table has an available seat
    const toPlayers = toState.seated ?? toState.players ?? [];
    const takenSeats = new Set(toPlayers.map(p => p.seat));
    let targetSeat = -1;
    for (let s = 0; s <= 8; s++) {
      if (!takenSeats.has(s)) { targetSeat = s; break; }
    }
    if (targetSeat === -1) {
      return sendError(socket, `No available seat at table ${toTableId}`);
    }

    // Remove from source table
    if (typeof fromGm.removePlayer === 'function') {
      fromGm.removePlayer(playerId);
    } else {
      // Fallback: mark as disconnected / out of hand so they don't affect the game
      if (typeof fromGm.setPlayerInHand === 'function') fromGm.setPlayerInHand(playerId, false);
    }

    // Seat at target table
    if (typeof toGm.addPlayer === 'function') {
      toGm.addPlayer({ id: playerId, name, seat: targetSeat, stack });
    } else if (typeof toGm.seatPlayer === 'function') {
      toGm.seatPlayer({ id: playerId, name, seat: targetSeat, stack });
    }

    // Broadcast updated state to both tables
    const broadcastTable = (tableId, gm) => {
      const state = gm.getState ? gm.getState() : (gm.state ?? {});
      io.to(tableId).emit('game_state', { ...state, tableId });
    };

    broadcastTable(fromTableId, fromGm);
    broadcastTable(toTableId,   toGm);

    io.to(socket.data.tableId).emit('notification', {
      type:    'info',
      message: `${name} moved from ${fromTableId} to ${toTableId}`,
    });
  });

  // tournament:request_reentry
  socket.on('tournament:request_reentry', async () => {
    const tableId = socket.data.tableId;
    if (!tableId) return sendError(socket, 'Not in a table');

    const { getController } = require('../../state/SharedState');
    const ctrl = getController(tableId);
    if (!ctrl || ctrl.getMode?.() !== 'tournament') {
      return socket.emit('tournament:reentry_rejected', { reason: 'Not a tournament table' });
    }

    try {
      await ctrl.handleReentry(socket);
    } catch (err) {
      socket.emit('tournament:reentry_rejected', { reason: err.message });
    }
  });

  // tournament:request_addon
  socket.on('tournament:request_addon', async () => {
    const tableId = socket.data.tableId;
    if (!tableId) return sendError(socket, 'Not in a table');

    const { getController } = require('../../state/SharedState');
    const ctrl = getController(tableId);
    if (!ctrl || ctrl.getMode?.() !== 'tournament') {
      return socket.emit('tournament:addon_rejected', { reason: 'Not a tournament table' });
    }

    try {
      await ctrl.handleAddon(socket);
    } catch (err) {
      socket.emit('tournament:addon_rejected', { reason: err.message });
    }
  });
};
