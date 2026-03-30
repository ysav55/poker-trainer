'use strict';

const { getPlayerPermissions } = require('./requirePermission.js');

async function requireSocketPermission(socket, ...keys) {
  const playerId = socket.data.playerId;
  if (!playerId) {
    socket.emit('error', { message: 'Not authenticated' });
    return false;
  }
  const perms = await getPlayerPermissions(playerId);
  if (!keys.every(k => perms.has(k))) {
    socket.emit('error', { message: 'Insufficient permissions' });
    return false;
  }
  return true;
}

module.exports = { requireSocketPermission };
