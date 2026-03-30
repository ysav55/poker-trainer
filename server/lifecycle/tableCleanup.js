'use strict';

const IDLE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
const CHECK_INTERVAL_MS = 5 * 60 * 1000;  // every 5 minutes
const lastActivityMap = new Map();

function recordTableActivity(tableId) {
  lastActivityMap.set(tableId, Date.now());
}

function startTableCleanup(io, tables) {
  // Also activate any scheduled tables on startup
  const { TableRepository } = require('../db/repositories/TableRepository.js');
  TableRepository.activateScheduledTables().then(opened => {
    opened.forEach(t => console.log(`[tableCleanup] Scheduled table opened: ${t.id} (${t.name})`));
  }).catch(() => {});

  // Check every 5 minutes for idle empty tables
  setInterval(async () => {
    // Activate newly-scheduled tables
    await TableRepository.activateScheduledTables().catch(() => {});

    for (const [tableId] of tables.entries()) {
      const sockets = await io.in(tableId).fetchSockets().catch(() => []);
      if (sockets.length > 0) {
        recordTableActivity(tableId);
        continue;
      }
      const lastActivity = lastActivityMap.get(tableId) ?? 0;
      if (Date.now() - lastActivity > IDLE_THRESHOLD_MS) {
        tables.delete(tableId);
        lastActivityMap.delete(tableId);
        await TableRepository.closeTable(tableId).catch(() => {});
        console.log(`[tableCleanup] Evicted idle table: ${tableId}`);
      }
    }
  }, CHECK_INTERVAL_MS);
}

module.exports = { startTableCleanup, recordTableActivity };
