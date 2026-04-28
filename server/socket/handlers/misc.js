'use strict';

module.exports = function registerMisc(socket, ctx) {
  const { tables, broadcastState, log } = ctx;

  socket.on('client_error', (payload) => {
    log.logClientError(socket, payload);
  });

  // Player sit-out / sit-in — only for non-coach, non-spectator players on any table.
  // Marks the player as inactive (won't be dealt in) without removing them from the table.
  socket.on('player_sit_out', () => {
    if (socket.data.isCoach || socket.data.isSpectator) return;
    const tableId = socket.data.tableId;
    const gm = tables.get(tableId);
    if (!gm) return;
    gm.setPlayerInHand(socket.id, false);
    broadcastState(tableId, { type: 'sit_out', message: `${socket.data.name} is sitting out` });
  });

  socket.on('player_sit_in', () => {
    if (socket.data.isCoach || socket.data.isSpectator) return;
    const tableId = socket.data.tableId;
    const gm = tables.get(tableId);
    if (!gm) return;
    gm.setPlayerInHand(socket.id, true);
    broadcastState(tableId, { type: 'sit_in', message: `${socket.data.name} is back in` });
  });
};
