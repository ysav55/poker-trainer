'use strict';

const svc = require('../../services/PlaylistExecutionService');

module.exports = function registerDrillSession(socket, ctx) {
  const { io, requireCoach } = ctx;

  socket.on('scenario:set_hero', async ({ tableId, playerId } = {}) => {
    if (requireCoach(socket, 'set drill hero')) return;
    if (!tableId || !playerId) return socket.emit('scenario:error', { code: 'bad_request' });
    try {
      await svc.updateHeroPlayer(tableId, playerId);
      io.to(tableId).emit('scenario:progress', { heroPlayerId: playerId });
    } catch (err) {
      socket.emit('scenario:error', { code: 'update_failed', message: err.message });
    }
  });

  socket.on('scenario:set_mode', async ({ tableId, heroMode, autoAdvance } = {}) => {
    if (requireCoach(socket, 'set drill mode')) return;
    if (!tableId) return socket.emit('scenario:error', { code: 'bad_request' });
    try {
      await svc.updateMode(tableId, { heroMode, autoAdvance });
      io.to(tableId).emit('scenario:progress', { heroMode, autoAdvance });
    } catch (err) {
      socket.emit('scenario:error', { code: 'update_failed', message: err.message });
    }
  });

  socket.on('scenario:request_resume', async ({ tableId, mode } = {}) => {
    if (requireCoach(socket, 'resume drill')) return;
    if (!tableId || !mode) return socket.emit('scenario:error', { code: 'bad_request' });
    try {
      if (mode === 'resume') {
        await svc.resume(tableId);
      } else if (mode === 'restart') {
        await svc.cancel(tableId);
      }
      io.to(tableId).emit('scenario:progress', { resumed: mode });
    } catch (err) {
      socket.emit('scenario:error', { code: 'resume_failed', message: err.message });
    }
  });
};
