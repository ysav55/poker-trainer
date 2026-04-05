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
async function start({ tableId, playlistId, coachId, optedInPlayers = [], optedOutPlayers = [], seatedCount }) {
  // Cancel any existing session
  const existing = await repo.getActiveDrillSession(tableId);
  if (existing) {
    await repo.updateDrillSession(existing.id, { status: 'cancelled' });
  }

  // Fetch all items for this playlist
  const allItems = await repo.getPlaylistItems(playlistId);
  if (allItems.length === 0) throw new Error('Playlist is empty');

  // Fetch playlist metadata (for ordering)
  const playlists = await HandLogger.getPlaylists();
  const playlist = playlists.find(p => p.playlist_id === playlistId);
  const ordering = playlist?.ordering ?? 'sequential';

  // Filter by player_count if seatedCount provided
  const effectiveCount = seatedCount ?? optedInPlayers.length;
  const eligible = effectiveCount > 0
    ? allItems.filter(item => (item.scenario?.player_count ?? 0) <= effectiveCount)
    : allItems;

  if (eligible.length === 0) {
    throw new Error(`No scenarios in this playlist match the current player count (${effectiveCount})`);
  }

  // Shuffle if ordering === 'random'
  const orderedItems = ordering === 'random' ? shuffled(eligible) : eligible;

  const session = await repo.createDrillSession({
    tableId,
    playlistId,
    coachId,
    itemsTotal:       orderedItems.length,
    optedInPlayers,
    optedOutPlayers,
  });

  // Return session + first scenario
  const firstScenario = orderedItems[0]?.scenario ?? null;
  return { session, currentScenario: firstScenario, items: orderedItems };
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

module.exports = { start, getStatus, advance, pause, resume, pick, setParticipation, cancel, getNextScenario };
