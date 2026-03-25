'use strict';

module.exports = function registerMisc(socket, ctx) {
  const { log } = ctx;

  socket.on('client_error', (payload) => {
    log.logClientError(socket, payload);
  });
};
