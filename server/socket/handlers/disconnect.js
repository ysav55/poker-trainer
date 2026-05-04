'use strict';

const SharedState = require('../../state/SharedState.js');

function releaseCoachLockIfHeld({ io, tableId, stableId }) {
  const current = SharedState.activeCoachLocks.get(tableId);
  if (current !== stableId) return; // not our lock

  // Are there other sockets from same stableId still in the room?
  const room = io.sockets.adapter.rooms.get(tableId);
  if (room) {
    for (const socketId of room) {
      const sock = io.sockets.sockets.get(socketId);
      if (sock?.data?.stableId === stableId) return; // another tab still in room
    }
  }
  // Last socket left — release
  SharedState.activeCoachLocks.delete(tableId);
}

function registerDisconnect(socket, ctx) {
  const { tables, stableIdMap, reconnectTimers, ghostStacks, io,
          broadcastState, clearActionTimer, log } = ctx;

  socket.on('disconnect', () => {
    stableIdMap.delete(socket.id);
    const tableId = socket.data.tableId;
    if (!tableId) return;
    const gm = tables.get(tableId);
    if (!gm) return;

    const name = socket.data.name || socket.id;
    const isCoach = socket.data.isCoach;
    const isSpectator = socket.data.isSpectator;

    if (isSpectator) {
      // If the spectator was the tournament manager, start the 10s grace window
      if (socket.data.isManager) {
        const { getController } = require('../../state/SharedState');
        const ctrl = getController(tableId);
        if (ctrl && ctrl.getMode?.() === 'tournament') {
          ctrl.onManagerDisconnect(socket.data.stableId, name);
        }
      }
      console.log(`[disconnect] spectator ${name} left ${tableId}`);
      return;
    }

    if (isCoach) {
      if (!gm.state.paused) {
        gm.state.paused = true; // direct mutation — togglePause would emit twice
        clearActionTimer(tableId, { saving: true });
        io.to(tableId).emit('coach_disconnected', {
          message: `${name} (Coach) disconnected — game paused. Reconnect window: 60s`
        });
        io.to(tableId).emit('notification', {
          type: 'coach_disconnect',
          message: `Game paused — waiting for coach to reconnect`
        });
      } else {
        clearActionTimer(tableId, { saving: true });
        io.to(tableId).emit('notification', {
          type: 'disconnect',
          message: `${name} (Coach) disconnected — reconnect window: 60s`
        });
      }
    } else {
      const disconnectingStableId = socket.data.stableId;
      const isCurrentTurn = gm.state.current_turn === socket.id ||
        (disconnectingStableId && stableIdMap.get(gm.state.current_turn) === disconnectingStableId);
      if (isCurrentTurn) clearActionTimer(tableId, { saving: true });
      gm.setPlayerDisconnected(socket.id, true);
      io.to(tableId).emit('notification', {
        type: 'disconnect',
        message: `${name} disconnected — reconnect window: 60s`
      });
    }

    broadcastState(tableId);
    log.info('game', 'player_disconnect', `${name} disconnected`, { tableId, name, isCoach, playerId: socket.data.stableId });
    log.trackSocket('disconnect', tableId, socket.data.stableId, { name, isCoach });
    console.log(`[disconnect] ${name} (coach=${isCoach}) — starting 60s TTL`);

    const timer = setTimeout(() => {
      reconnectTimers.delete(socket.id);
      const currentGm = tables.get(tableId);
      if (!currentGm) return;
      const ghostPlayer = currentGm.state.players.find(p => p.id === socket.id);
      const ghostStack  = ghostPlayer?.stack ?? 0;
      if (ghostPlayer && socket.data.stableId) {
        ghostStacks.set(socket.data.stableId, ghostStack);
      }
      currentGm.removePlayer(socket.id);
      broadcastState(tableId, { type: 'leave', message: `${name} left the table (timeout)` });
      console.log(`[TTL expired] ${name} removed from ${tableId}`);

      // Chip bank cash-out: return remaining stack to the player's bank (fire-and-forget)
      if (socket.data.stableId && !isCoach && ghostStack > 0) {
        const ChipBankRepo = require('../../db/repositories/ChipBankRepository');
        ChipBankRepo.cashOut(socket.data.stableId, ghostStack, tableId).catch(err =>
          log.error('db', 'chip_cash_out_failed', `chipCashOut failed for ${name}`, { err, tableId, playerId: socket.data.stableId }));
      }

      const socketsInRoom = io.sockets.adapter.rooms.get(tableId);
      if (!socketsInRoom || socketsInRoom.size === 0) {
        try {
          const { disconnectAllAtTable } = require('../../game/BotConnection');
          disconnectAllAtTable(tableId);
        } catch { /* ignore */ }
        tables.delete(tableId);
        console.log(`[prune] table ${tableId} removed — no sockets remain`);
        // Close in DB so lobby stops showing this table
        const { TableRepository } = require('../../db/repositories/TableRepository.js');
        TableRepository.closeTable(tableId).catch((err) =>
          console.error(`[prune] failed to close table ${tableId} in DB:`, err.message)
        );
      }
    }, 60_000);

    const configSnapshot = (() => {
      const g = tables.get(tableId);
      if (!g || !g.state.config_phase) return null;
      return { config_phase: true, config: g.state.config };
    })();
    reconnectTimers.set(socket.id, { timer, tableId, name, isCoach, configSnapshot });

    // Release coach lock if this was the last socket from that stableId
    const stableId = socket.data?.stableId ?? socket.data?.userId;
    if (tableId && stableId && isCoach) {
      releaseCoachLockIfHeld({ io, tableId, stableId });
    }
  });
}

module.exports = registerDisconnect;
module.exports.releaseCoachLockIfHeld = releaseCoachLockIfHeld;
