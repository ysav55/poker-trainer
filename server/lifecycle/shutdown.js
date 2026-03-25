'use strict';

/**
 * registerShutdown — registers SIGINT/SIGTERM handlers for graceful shutdown.
 * Marks all in-progress hands as incomplete before exit.
 *
 * @param {Map} tables      — SharedState.tables
 * @param {Map} activeHands — SharedState.activeHands
 * @param {object} HandLogger
 */
function registerShutdown(tables, activeHands, HandLogger) {
  function markAllHandsIncomplete() {
    for (const [tableId, handInfo] of activeHands.entries()) {
      const gm = tables.get(tableId);
      HandLogger.markIncomplete(handInfo.handId, gm?.state ?? null).catch(() => {});
    }
  }

  process.on('SIGINT',  () => { markAllHandsIncomplete(); process.exit(0); });
  process.on('SIGTERM', () => { markAllHandsIncomplete(); process.exit(0); });
}

module.exports = { registerShutdown };
