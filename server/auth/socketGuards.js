'use strict';

const { requireSocketPermission } = require('./socketPermissions.js');

/**
 * requireCoach — Socket guard for coach-only actions.
 *
 * Emits an error and returns true if the socket is NOT the coach.
 * Returns false if the caller is allowed to proceed.
 *
 * Usage:
 *   if (requireCoach(socket, 'start the game')) return;
 */
function requireCoach(socket, action) {
  if (!socket.data.isCoach) {
    socket.emit('error', { message: `Only the coach can ${action}` });
    return true;
  }
  return false;
}

module.exports = { requireCoach, requireSocketPermission };
