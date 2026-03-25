'use strict';

const JwtService = require('./JwtService');

/**
 * Socket.IO connection-level auth middleware.
 *
 * Reads the JWT from socket.handshake.auth.token and populates
 * socket.data with verified identity fields. Unauthenticated
 * connections are allowed through so spectators can still connect;
 * socket.data.authenticated tells join_room whether to trust the claims.
 *
 * Usage:  io.use(socketAuthMiddleware);
 */
function socketAuthMiddleware(socket, next) {
  const token = socket.handshake.auth?.token || '';
  const payload = JwtService.verify(token);

  if (payload) {
    socket.data.authenticated = true;
    socket.data.stableId      = payload.stableId;
    socket.data.role          = payload.role;
    socket.data.isCoach       = payload.role === 'coach';
    socket.data.jwtName       = payload.name;
  } else {
    socket.data.authenticated = false;
  }

  next();
}

module.exports = socketAuthMiddleware;
