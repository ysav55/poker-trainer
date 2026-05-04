'use strict';

const IDLE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
const CHECK_INTERVAL_MS = 5 * 60 * 1000;  // every 5 minutes
const lastActivityMap = new Map();

const log = require('../logs/logger');
const SharedState = require('../state/SharedState.js');

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

    // Snapshot in-memory table IDs before eviction so the orphan guard
    // below knows which tables were already tracked at the start of this tick.
    const knownTableIds = new Set(tables.keys());

    for (const [tableId] of tables.entries()) {
      const sockets = await io.in(tableId).fetchSockets().catch(() => []);
      if (sockets.length > 0) {
        recordTableActivity(tableId);
        continue;
      }
      const lastActivity = lastActivityMap.get(tableId) ?? 0;
      if (Date.now() - lastActivity > IDLE_THRESHOLD_MS) {
        // Snapshot session data before evicting from memory
        const gm = tables.get(tableId);
        const sessionId  = gm?.sessionId  ?? null;
        const playerIds  = (gm?.state?.players ?? [])
          .filter(p => !p.is_coach && p.id && p.id.length === 36) // stable UUIDs only
          .map(p => p.id);

        // Disconnect any coach-spawned bots before deleting the table so their
        // socket-clients close cleanly instead of looping on stale game_state.
        try {
          const { disconnectAllAtTable } = require('../game/BotConnection');
          disconnectAllAtTable(tableId);
        } catch { /* ignore — module may not be loaded in tests */ }

        tables.delete(tableId);
        lastActivityMap.delete(tableId);

        // Clean up coach state (active locks and pending blind updates)
        SharedState.activeCoachLocks.delete(tableId);
        SharedState.pendingBlinds.delete(tableId);

        await TableRepository.closeTable(tableId).catch(() => {});
        console.log(`[tableCleanup] Evicted idle table: ${tableId}`);

        // Fire-and-forget: compute session quality + update baselines
        if (sessionId && playerIds.length > 0) {
          const { compute: computeQuality } = require('../services/SessionQualityService');
          const { recomputeAfterSession }   = require('../services/BaselineService');
          Promise.allSettled(
            playerIds.map(pid => computeQuality(pid, sessionId))
          ).then(() => recomputeAfterSession(playerIds))
            .catch(err => log.error('service', 'session_close_intelligence_failed',
              `Failed coach intelligence after table eviction: ${err.message}`,
              { tableId, sessionId, playerCount: playerIds.length }));
        }
      }
    }
    // Close DB-only tables (created via REST but never socket-joined)
    try {
      const orphans = await TableRepository.listOrphanedTables(IDLE_THRESHOLD_MS / 60_000);
      for (const orphan of orphans) {
        if (!knownTableIds.has(orphan.id)) {
          await TableRepository.closeTable(orphan.id).catch(() => {});
          console.log(`[tableCleanup] Closed orphaned DB table: ${orphan.id}`);
        }
      }
    } catch (err) {
      console.error('[tableCleanup] orphan cleanup failed:', err.message);
    }
  }, CHECK_INTERVAL_MS);
}

module.exports = { startTableCleanup, recordTableActivity };
