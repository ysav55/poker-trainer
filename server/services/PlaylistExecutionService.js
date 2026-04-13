'use strict';

/**
 * PlaylistExecutionService
 *
 * Manages the lifecycle of drill sessions (scenario playlist execution at a table).
 * All state is persisted to the drill_sessions table.
 *
 * NOTE: Game engine wiring (ScenarioDealer.deal()) is deferred — this service
 * manages DB state and returns the next scenario config; the game engine will
 * consume it in a future phase.
 */

const repo = require('../db/repositories/ScenarioBuilderRepository');
const HandLogger = require('../db/HandLoggerSupabase');

// ─── Start ────────────────────────────────────────────────────────────────────

/**
 * Start a new drill session at a table.
 * Cancels any existing active/paused session for the table first.
 *
 * @param {object} opts
 * @param {string} opts.tableId
 * @param {string} opts.playlistId
 * @param {string} opts.coachId
 * @param {string[]} opts.optedInPlayers  - player UUIDs participating
 * @param {string[]} opts.optedOutPlayers - player UUIDs sitting out
 * @param {number}  [opts.seatedCount]    - current seated (opted-in) count for filtering
 */
async function start({
  tableId, playlistId, coachId,
  optedInPlayers = [], optedOutPlayers = [], seatedCount,
  heroMode = 'sticky', heroPlayerId = null, autoAdvance = false,
  forceRestart = false,
}) {
  const paused = await repo.getPausedDrillSession(tableId, playlistId);
  if (paused && !forceRestart) {
    return { resumable: true, priorSessionId: paused.id, priorPosition: paused.current_position, priorTotal: paused.items_total };
  }
  if (paused && forceRestart) {
    await repo.updateDrillSession(paused.id, { status: 'cancelled' });
  }
  const existingActive = await repo.getActiveDrillSession(tableId);
  if (existingActive) {
    await repo.updateDrillSession(existingActive.id, { status: 'cancelled' });
  }

  const allItems = await repo.getPlaylistItems(playlistId);
  if (allItems.length === 0) throw new Error('Playlist is empty');

  const playlists = await HandLogger.getPlaylists();
  const playlist = playlists.find(p => p.playlist_id === playlistId);
  const ordering = playlist?.ordering ?? 'sequential';

  const effectiveCount = seatedCount ?? optedInPlayers.length;
  const eligible = effectiveCount > 0
    ? allItems.filter(item => (item.scenario?.player_count ?? 0) === effectiveCount)
    : allItems;
  if (eligible.length === 0) {
    const session = await repo.createDrillSession({
      tableId, playlistId, coachId,
      itemsTotal: allItems.length,
      optedInPlayers, optedOutPlayers,
      heroMode, heroPlayerId, autoAdvance,
    });
    return { session, currentScenario: null, items: [], fitCount: 0 };
  }

  const orderedItems = ordering === 'random' ? shuffled(eligible) : eligible;
  const session = await repo.createDrillSession({
    tableId, playlistId, coachId,
    itemsTotal: orderedItems.length,
    optedInPlayers, optedOutPlayers,
    heroMode, heroPlayerId, autoAdvance,
  });

  return { session, currentScenario: orderedItems[0]?.scenario ?? null, items: orderedItems, fitCount: eligible.length };
}

// ─── Get status ───────────────────────────────────────────────────────────────

async function getStatus(tableId) {
  const session = await repo.getActiveDrillSession(tableId);
  if (!session) return null;

  const items = await repo.getPlaylistItems(session.playlist_id);
  const currentItem = items.find((_, i) => i === session.current_position) ?? items[session.current_position] ?? null;
  const nextItem    = items[session.current_position + 1] ?? null;

  return {
    ...session,
    currentScenario: currentItem?.scenario ?? null,
    nextScenario:    nextItem?.scenario    ?? null,
  };
}

// ─── Advance ──────────────────────────────────────────────────────────────────

async function advance(tableId) {
  const session = await repo.getActiveDrillSession(tableId);
  if (!session) throw new Error('No active drill session at this table');

  const nextPosition = session.current_position + 1;
  const newDealt     = session.items_dealt + 1;

  if (nextPosition >= session.items_total) {
    // Reached the end — mark completed
    const done = await repo.updateDrillSession(session.id, {
      status:          'completed',
      currentPosition: nextPosition,
      itemsDealt:      newDealt,
      completedAt:     new Date().toISOString(),
    });
    return { session: done, completed: true, currentScenario: null };
  }

  const updated = await repo.updateDrillSession(session.id, {
    currentPosition: nextPosition,
    itemsDealt:      newDealt,
  });

  const items = await repo.getPlaylistItems(session.playlist_id);
  const currentScenario = items[nextPosition]?.scenario ?? null;

  return { session: updated, completed: false, currentScenario };
}

// ─── Pause / Resume ───────────────────────────────────────────────────────────

async function pause(tableId) {
  const session = await repo.getActiveDrillSession(tableId);
  if (!session) throw new Error('No active drill session at this table');
  if (session.status === 'paused') return session; // already paused
  return repo.updateDrillSession(session.id, {
    status:   'paused',
    pausedAt: new Date().toISOString(),
  });
}

async function resume(tableId) {
  const session = await repo.getActiveDrillSession(tableId);
  if (!session) throw new Error('No active drill session at this table');
  if (session.status === 'active') return session; // already active
  return repo.updateDrillSession(session.id, {
    status:   'active',
    pausedAt: null,
  });
}

// ─── Manual pick ──────────────────────────────────────────────────────────────

async function pick(tableId, itemId) {
  const session = await repo.getActiveDrillSession(tableId);
  if (!session) throw new Error('No active drill session at this table');

  const items = await repo.getPlaylistItems(session.playlist_id);
  const itemIndex = items.findIndex(i => i.id === itemId);
  if (itemIndex === -1) throw new Error(`Item ${itemId} not found in playlist`);

  return repo.updateDrillSession(session.id, { currentPosition: itemIndex });
}

// ─── Participation ────────────────────────────────────────────────────────────

async function setParticipation(tableId, playerId, optIn) {
  const session = await repo.getActiveDrillSession(tableId);
  if (!session) throw new Error('No active drill session at this table');

  let inList  = [...(session.opted_in_players  || [])];
  let outList = [...(session.opted_out_players || [])];

  if (optIn) {
    if (!inList.includes(playerId))  inList.push(playerId);
    outList = outList.filter(id => id !== playerId);
  } else {
    if (!outList.includes(playerId)) outList.push(playerId);
    inList = inList.filter(id => id !== playerId);
  }

  return repo.updateDrillSession(session.id, {
    optedInPlayers:  inList,
    optedOutPlayers: outList,
  });
}

// ─── Cancel ───────────────────────────────────────────────────────────────────

async function cancel(tableId) {
  const session = await repo.getActiveDrillSession(tableId);
  if (!session) return;
  await repo.updateDrillSession(session.id, {
    status:      'cancelled',
    completedAt: new Date().toISOString(),
  });
}

// ─── Get next scenario (called by game engine) ────────────────────────────────

/**
 * Returns the scenario config for the current position, or null.
 * Used by the game engine before dealing a hand (Phase 6 integration).
 */
async function getNextScenario(tableId, seatedOptedInCount) {
  const session = await repo.getActiveDrillSession(tableId);
  if (!session || session.status !== 'active') return null;

  const items = await repo.getPlaylistItems(session.playlist_id);

  if (session.items_total === 0 || items.length === 0) return null;

  // For sequential: find next eligible item at or after current_position
  // For random: pick a random eligible item
  const eligible = items.filter(item =>
    (item.scenario?.player_count ?? 0) <= seatedOptedInCount
  );
  if (eligible.length === 0) return null;

  const currentItem = items[session.current_position];
  if (currentItem && (currentItem.scenario?.player_count ?? 0) <= seatedOptedInCount) {
    return currentItem.scenario;
  }

  // Skip to next eligible
  const nextEligible = eligible.find((item, _) => {
    const idx = items.indexOf(item);
    return idx >= session.current_position;
  });
  return nextEligible?.scenario ?? eligible[0]?.scenario ?? null;
}

// ─── Hero player / mode updates ───────────────────────────────────────────────

async function updateHeroPlayer(tableId, heroPlayerId) {
  const session = await repo.getActiveDrillSession(tableId);
  if (!session) throw new Error('No active drill session at this table');
  return repo.updateDrillSession(session.id, { heroPlayerId });
}

async function updateMode(tableId, { heroMode, autoAdvance } = {}) {
  const session = await repo.getActiveDrillSession(tableId);
  if (!session) throw new Error('No active drill session at this table');
  const patch = {};
  if (heroMode !== undefined) patch.heroMode = heroMode;
  if (autoAdvance !== undefined) patch.autoAdvance = autoAdvance;
  return repo.updateDrillSession(session.id, patch);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

module.exports = {
  start, getStatus, advance, pause, resume, pick, setParticipation, cancel,
  getNextScenario, updateHeroPlayer, updateMode,
};
