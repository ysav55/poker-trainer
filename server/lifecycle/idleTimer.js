'use strict';

/**
 * registerIdleTimer — auto-shuts the server down after IDLE_TIMEOUT_MINUTES of zero connections.
 * Called only when IDLE_TIMEOUT_MINUTES env var is set and > 0.
 * The hosting platform (Fly.io) restarts on the next request.
 *
 * @param {import('socket.io').Server} io
 * @param {Map} activeHands
 * @param {object} HandLogger
 * @param {number} idleMinutes
 */
function registerIdleTimer(io, activeHands, HandLogger, idleMinutes) {
  if (!idleMinutes || idleMinutes <= 0) return;

  let _idleTimer = null;

  function markAllHandsIncomplete() {
    for (const [, handInfo] of activeHands.entries()) {
      HandLogger.markIncomplete(handInfo.handId, null).catch(() => {});
    }
  }

  const _scheduleIdleShutdown = () => {
    clearTimeout(_idleTimer);
    if (io.engine.clientsCount === 0) {
      _idleTimer = setTimeout(() => {
        console.log(`[idle] No connections for ${idleMinutes} min — shutting down for hosting cost savings`);
        markAllHandsIncomplete();
        process.exit(0);
      }, idleMinutes * 60 * 1000);
    }
  };

  io.on('connection', (socket) => {
    clearTimeout(_idleTimer);
    socket.on('disconnect', _scheduleIdleShutdown);
  });

  console.log(`[idle] Auto-shutdown enabled — will exit after ${idleMinutes} min of zero connections`);

  return _scheduleIdleShutdown; // returned so caller can trigger initial schedule on 'listening'
}

module.exports = { registerIdleTimer };
