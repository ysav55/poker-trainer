'use strict';

const { v4: uuidv4 } = require('uuid');
const supabase = require('../supabase');
const { q } = require('../utils');

// ─────────────────────────────────────────────────────────────────────────────
// FOLDERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch all folders for a coach as a nested tree.
 * Supabase JS client doesn't support recursive CTEs so we build the tree in JS.
 */
async function getFolderTree(coachId) {
  const rows = await q(
    supabase.from('scenario_folders')
      .select('id, parent_id, name, sort_order, created_at, updated_at')
      .eq('coach_id', coachId)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })
  );
  return buildTree(rows || []);
}

function buildTree(rows, parentId = null) {
  return rows
    .filter(r => (r.parent_id ?? null) === parentId)
    .map(r => ({ ...r, children: buildTree(rows, r.id) }));
}

async function createFolder({ coachId, name, parentId = null, sortOrder = 0 }) {
  const data = await q(
    supabase.from('scenario_folders')
      .insert({ coach_id: coachId, parent_id: parentId, name, sort_order: sortOrder })
      .select('id, parent_id, name, sort_order, created_at, updated_at')
      .single()
  );
  return data;
}

async function updateFolder(id, { name, parentId, sortOrder } = {}) {
  const patch = {};
  if (name       !== undefined) patch.name       = name;
  if (parentId   !== undefined) patch.parent_id  = parentId;
  if (sortOrder  !== undefined) patch.sort_order = sortOrder;
  patch.updated_at = new Date().toISOString();
  const data = await q(
    supabase.from('scenario_folders')
      .update(patch)
      .eq('id', id)
      .select('id, parent_id, name, sort_order, updated_at')
      .single()
  );
  return data;
}

/**
 * Delete a folder. All child folders are re-parented to this folder's parent
 * (or root) before deletion so no orphans are created.
 */
async function deleteFolder(id) {
  const folder = await q(
    supabase.from('scenario_folders').select('parent_id').eq('id', id).single()
  );
  // Re-parent direct children to grandparent (or root)
  await q(
    supabase.from('scenario_folders')
      .update({ parent_id: folder.parent_id ?? null })
      .eq('parent_id', id)
  );
  // Move scenarios in this folder to grandparent (or root)
  await q(
    supabase.from('scenarios')
      .update({ folder_id: folder.parent_id ?? null })
      .eq('folder_id', id)
  );
  // Move playlists in this folder to grandparent (or root)
  await q(
    supabase.from('playlists')
      .update({ folder_id: folder.parent_id ?? null })
      .eq('folder_id', id)
  );
  await q(supabase.from('scenario_folders').delete().eq('id', id));
}

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIOS
// ─────────────────────────────────────────────────────────────────────────────

const SCENARIO_COLS = [
  'id', 'coach_id', 'folder_id', 'version', 'parent_id', 'is_current',
  'name', 'description', 'tags',
  'player_count', 'btn_seat', 'card_mode',
  'seat_configs', 'stack_configs',
  'board_mode', 'board_flop', 'board_turn', 'board_river',
  'board_texture', 'texture_turn', 'texture_river',
  'blind_mode', 'source_hand_id', 'is_shareable', 'play_count',
  'primary_playlist_id', 'hero_seat',
  'created_at', 'updated_at',
].join(', ');

/**
 * List current (non-deleted) scenarios for a coach.
 * Supports filtering by folderId, tags (array ANY), playerCount, and name search.
 */
async function listScenarios({ coachId, folderId, tags, playerCount, search } = {}) {
  let query = supabase.from('scenarios')
    .select(SCENARIO_COLS)
    .eq('coach_id', coachId)
    .eq('is_current', true)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false });

  if (folderId !== undefined) query = query.eq('folder_id', folderId);
  if (playerCount) query = query.eq('player_count', playerCount);
  if (search)      query = query.ilike('name', `%${search}%`);
  // Tags: all provided tags must appear in the scenario's tags array
  if (tags && tags.length > 0) {
    query = query.contains('tags', tags);
  }

  return (await q(query)) || [];
}

async function getScenario(id) {
  const data = await q(
    supabase.from('scenarios').select(SCENARIO_COLS).eq('id', id).single()
  );
  return data || null;
}

async function createScenario({
  coachId, folderId = null, name, description = null, tags = [],
  playerCount, btnSeat = 0, cardMode = 'fixed',
  seatConfigs = [], stackConfigs = [],
  boardMode = 'none', boardFlop = null, boardTurn = null, boardRiver = null,
  boardTexture = null, textureTurn = null, textureRiver = null,
  blindMode = false, sourceHandId = null, isShareable = false,
  primaryPlaylistId = null, heroSeat = null,
}) {
  const data = await q(
    supabase.from('scenarios').insert({
      coach_id:      coachId,
      folder_id:     folderId,
      name,
      description,
      tags,
      player_count:  playerCount,
      btn_seat:      btnSeat,
      card_mode:     cardMode,
      seat_configs:  seatConfigs,
      stack_configs: stackConfigs,
      board_mode:    boardMode,
      board_flop:    boardFlop,
      board_turn:    boardTurn,
      board_river:   boardRiver,
      board_texture: boardTexture,
      texture_turn:  textureTurn,
      texture_river: textureRiver,
      blind_mode:    blindMode,
      source_hand_id: sourceHandId,
      is_shareable:  isShareable,
      primary_playlist_id: primaryPlaylistId,
      hero_seat:     heroSeat,
    })
    .select(SCENARIO_COLS)
    .single()
  );
  return data;
}

/**
 * Update a scenario.
 * - play_count === 0: edit in place.
 * - play_count  > 0: create new version (mark old is_current=false, insert new).
 * Returns the saved scenario (new version or updated).
 */
async function updateScenario(id, changes) {
  const current = await getScenario(id);
  if (!current) throw new Error(`Scenario ${id} not found`);

  if (current.play_count > 0) {
    // Create new version
    await q(
      supabase.from('scenarios').update({ is_current: false }).eq('id', id)
    );
    const newData = await createScenario({
      coachId:       current.coach_id,
      folderId:      changes.folderId      ?? current.folder_id,
      name:          changes.name          ?? current.name,
      description:   changes.description   ?? current.description,
      tags:          changes.tags          ?? current.tags,
      playerCount:   changes.playerCount   ?? current.player_count,
      btnSeat:       changes.btnSeat       ?? current.btn_seat,
      cardMode:      changes.cardMode      ?? current.card_mode,
      seatConfigs:   changes.seatConfigs   ?? current.seat_configs,
      stackConfigs:  changes.stackConfigs  ?? current.stack_configs,
      boardMode:     changes.boardMode     ?? current.board_mode,
      boardFlop:     changes.boardFlop     ?? current.board_flop,
      boardTurn:     changes.boardTurn     ?? current.board_turn,
      boardRiver:    changes.boardRiver    ?? current.board_river,
      boardTexture:  changes.boardTexture  ?? current.board_texture,
      textureTurn:   changes.textureTurn   ?? current.texture_turn,
      textureRiver:  changes.textureRiver  ?? current.texture_river,
      blindMode:     changes.blindMode     ?? current.blind_mode,
      sourceHandId:  current.source_hand_id,
      isShareable:   changes.isShareable   ?? current.is_shareable,
      primaryPlaylistId: changes.primaryPlaylistId ?? current.primary_playlist_id,
      heroSeat:      changes.heroSeat      ?? current.hero_seat,
    });
    // Patch version + parent_id after insert (createScenario defaults version=1)
    const versioned = await q(
      supabase.from('scenarios')
        .update({ version: current.version + 1, parent_id: id })
        .eq('id', newData.id)
        .select(SCENARIO_COLS)
        .single()
    );
    // Re-point all playlist_items that referenced the old scenario to the new one
    await q(
      supabase.from('playlist_items')
        .update({ scenario_id: versioned.id })
        .eq('scenario_id', id)
    );
    return versioned;
  }

  // Edit in place
  const patch = {};
  const fieldMap = {
    folderId:     'folder_id',     name:          'name',
    description:  'description',   tags:          'tags',
    playerCount:  'player_count',  btnSeat:       'btn_seat',
    cardMode:     'card_mode',     seatConfigs:   'seat_configs',
    stackConfigs: 'stack_configs', boardMode:     'board_mode',
    boardFlop:    'board_flop',    boardTurn:     'board_turn',
    boardRiver:   'board_river',   boardTexture:  'board_texture',
    textureTurn:  'texture_turn',  textureRiver:  'texture_river',
    blindMode:    'blind_mode',    isShareable:   'is_shareable',
    primaryPlaylistId: 'primary_playlist_id',
    heroSeat:     'hero_seat',
  };
  for (const [jsKey, dbCol] of Object.entries(fieldMap)) {
    if (changes[jsKey] !== undefined) patch[dbCol] = changes[jsKey];
  }
  patch.updated_at = new Date().toISOString();

  const data = await q(
    supabase.from('scenarios').update(patch).eq('id', id).select(SCENARIO_COLS).single()
  );
  return data;
}

async function duplicateScenario(id, coachId) {
  const src = await getScenario(id);
  if (!src) throw new Error(`Scenario ${id} not found`);
  return createScenario({
    coachId,
    folderId:     src.folder_id,
    name:         `${src.name} (copy)`,
    description:  src.description,
    tags:         src.tags,
    playerCount:  src.player_count,
    btnSeat:      src.btn_seat,
    cardMode:     src.card_mode,
    seatConfigs:  src.seat_configs,
    stackConfigs: src.stack_configs,
    boardMode:    src.board_mode,
    boardFlop:    src.board_flop,
    boardTurn:    src.board_turn,
    boardRiver:   src.board_river,
    boardTexture: src.board_texture,
    textureTurn:  src.texture_turn,
    textureRiver: src.texture_river,
    blindMode:    src.blind_mode,
    isShareable:  src.is_shareable,
    primaryPlaylistId: src.primary_playlist_id,
    heroSeat:     src.hero_seat,
  });
}

/** Soft-delete: remove from all playlist_items first, then set deleted_at. */
async function deleteScenario(id) {
  await q(supabase.from('playlist_items').delete().eq('scenario_id', id));
  await q(
    supabase.from('scenarios')
      .update({ deleted_at: new Date().toISOString(), is_current: false })
      .eq('id', id)
  );
}

async function getVersionHistory(id) {
  // Walk the parent_id chain to collect all versions
  const all = await q(
    supabase.from('scenarios')
      .select('id, version, is_current, play_count, created_at, name')
      .or(`id.eq.${id},parent_id.eq.${id}`)
      .order('version', { ascending: true })
  );
  return all || [];
}

async function incrementPlayCount(id) {
  // Use rpc or a read-then-write (Supabase JS v2 doesn't have atomic increment without rpc)
  const current = await q(
    supabase.from('scenarios').select('play_count').eq('id', id).single()
  );
  await q(
    supabase.from('scenarios')
      .update({ play_count: (current?.play_count ?? 0) + 1 })
      .eq('id', id)
  );
}

/**
 * Create a scenario pre-filled from a completed hand record.
 * Returns the new scenario (caller should redirect to builder for review).
 */
async function createScenarioFromHand(handId, coachId, { includeBoard = true, heroPlayerId = null } = {}) {
  // Fetch hand + players
  const hand = await q(
    supabase.from('hands')
      .select('hand_id, board, dealer_seat, small_blind, big_blind, hand_tags(tag)')
      .eq('hand_id', handId)
      .single()
  );
  if (!hand) throw new Error(`Hand ${handId} not found`);

  const players = await q(
    supabase.from('hand_players')
      .select('seat, hole_cards, stack_start, player_id')
      .eq('hand_id', handId)
      .order('seat', { ascending: true })
  );
  const playerRows = players || [];
  const playerCount = playerRows.length || 2;

  // Build seat / stack configs
  const seatConfigs = playerRows.map(p => ({
    seat:  p.seat,
    cards: Array.isArray(p.hole_cards) ? p.hole_cards : [],
  }));

  // Default hero seat: explicit heroPlayerId if it matches, else first seat
  // with filled hole cards, else first seat, else null.
  let heroSeat = null;
  if (heroPlayerId) {
    const match = playerRows.find(p => p.player_id === heroPlayerId);
    if (match) heroSeat = match.seat;
  }
  if (heroSeat == null) {
    const filled = playerRows.find(
      p => Array.isArray(p.hole_cards) && p.hole_cards.length === 2 && p.hole_cards[0] && p.hole_cards[1]
    );
    heroSeat = filled?.seat ?? playerRows[0]?.seat ?? null;
  }
  const bigBlind = hand.big_blind || 50;
  const stackConfigs = playerRows.map(p => ({
    seat:     p.seat,
    stack_bb: bigBlind > 0 ? Math.round((p.stack_start || 0) / bigBlind) : 100,
  }));

  // Board
  const board = hand.board || [];
  const boardMode = includeBoard && board.length >= 3 ? 'specific' : 'none';
  const flopCards = board.slice(0, 3);
  const boardFlop  = flopCards.length === 3 ? flopCards.join('') : null;
  const boardTurn  = board[3] ?? null;
  const boardRiver = board[4] ?? null;

  // Auto-tags for name generation
  const autoTags = (hand.hand_tags || []).map(t => t.tag);
  const name = autoTags.length > 0
    ? `${autoTags.slice(0, 2).join(' ')} — Hand #${handId.slice(0, 6)}`
    : `Hand #${handId.slice(0, 6)}`;

  return createScenario({
    coachId,
    name,
    tags:          autoTags,
    playerCount,
    btnSeat:       hand.dealer_seat ?? 0,
    cardMode:      'fixed',
    seatConfigs,
    stackConfigs,
    boardMode,
    boardFlop:     boardMode === 'specific' ? boardFlop   : null,
    boardTurn:     boardMode === 'specific' ? boardTurn   : null,
    boardRiver:    boardMode === 'specific' ? boardRiver  : null,
    sourceHandId:  handId,
    heroSeat,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PLAYLISTS (new-column operations only — base CRUD stays in PlaylistRepository)
// ─────────────────────────────────────────────────────────────────────────────

async function updatePlaylistMeta(playlistId, { name, description, tags, ordering, advanceMode, folderId, isShareable } = {}) {
  const patch = {};
  if (name        !== undefined) patch.name         = name;
  if (description !== undefined) patch.description  = description;
  if (tags        !== undefined) patch.tags         = tags;
  if (ordering    !== undefined) patch.ordering     = ordering;
  if (advanceMode !== undefined) patch.advance_mode = advanceMode;
  if (folderId    !== undefined) patch.folder_id    = folderId;
  if (isShareable !== undefined) patch.is_shareable = isShareable;
  if (Object.keys(patch).length === 0) return;

  const data = await q(
    supabase.from('playlists')
      .update(patch)
      .eq('playlist_id', playlistId)
      .select('playlist_id, name, description, tags, ordering, advance_mode, folder_id, is_shareable')
      .single()
  );
  return data;
}

async function softDeletePlaylist(playlistId) {
  // Cancel any active drill sessions first
  await q(
    supabase.from('drill_sessions')
      .update({ status: 'cancelled' })
      .eq('playlist_id', playlistId)
      .eq('status', 'active')
  );
  await q(
    supabase.from('playlists')
      .update({ deleted_at: new Date().toISOString() })
      .eq('playlist_id', playlistId)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PLAYLIST ITEMS
// ─────────────────────────────────────────────────────────────────────────────

async function getPlaylistItems(playlistId) {
  const rows = await q(
    supabase.from('playlist_items')
      .select(`
        id, playlist_id, scenario_id, position,
        scenarios (
          id, name, player_count, card_mode, tags, play_count, version, is_current,
          board_mode, board_flop, board_turn, board_river, board_texture
        )
      `)
      .eq('playlist_id', playlistId)
      .order('position', { ascending: true })
  );
  return (rows || []).map(r => ({
    id:          r.id,
    playlist_id: r.playlist_id,
    scenario_id: r.scenario_id,
    position:    r.position,
    scenario:    r.scenarios || null,
  }));
}

async function addPlaylistItem(playlistId, scenarioId, position) {
  // If position not provided, append at end
  if (position === undefined || position === null) {
    const existing = await q(
      supabase.from('playlist_items')
        .select('position')
        .eq('playlist_id', playlistId)
        .order('position', { ascending: false })
        .limit(1)
    );
    position = existing?.length > 0 ? existing[0].position + 1 : 0;
  } else {
    // Shift items at >= position up by 1
    const toShift = await q(
      supabase.from('playlist_items')
        .select('id, position')
        .eq('playlist_id', playlistId)
        .gte('position', position)
        .order('position', { ascending: false })
    );
    for (const row of (toShift || [])) {
      await q(
        supabase.from('playlist_items')
          .update({ position: row.position + 1 })
          .eq('id', row.id)
      );
    }
  }

  const data = await q(
    supabase.from('playlist_items')
      .insert({ playlist_id: playlistId, scenario_id: scenarioId, position })
      .select('id, playlist_id, scenario_id, position')
      .single()
  );
  return data;
}

async function removePlaylistItem(itemId) {
  const item = await q(
    supabase.from('playlist_items').select('playlist_id, position').eq('id', itemId).single()
  );
  if (!item) throw new Error(`Playlist item ${itemId} not found`);
  await q(supabase.from('playlist_items').delete().eq('id', itemId));
  // Re-sequence remaining items
  const remaining = await q(
    supabase.from('playlist_items')
      .select('id')
      .eq('playlist_id', item.playlist_id)
      .order('position', { ascending: true })
  );
  for (let i = 0; i < (remaining || []).length; i++) {
    await q(
      supabase.from('playlist_items')
        .update({ position: i })
        .eq('id', remaining[i].id)
    );
  }
}

/**
 * Bulk reorder. items = [{ id, position }, ...]
 * Applies all position updates atomically (parallel Supabase calls, best-effort).
 */
async function reorderPlaylistItems(playlistId, items) {
  if (!Array.isArray(items) || items.length === 0) return;
  await Promise.all(
    items.map(({ id, position }) =>
      q(supabase.from('playlist_items').update({ position }).eq('id', id).eq('playlist_id', playlistId))
    )
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DRILL SESSIONS
// ─────────────────────────────────────────────────────────────────────────────

async function createDrillSession({
  tableId, playlistId, coachId,
  itemsTotal, optedInPlayers = [], optedOutPlayers = [],
  heroMode = 'sticky', heroPlayerId = null, autoAdvance = false,
}) {
  return q(supabase.from('drill_sessions').insert({
    table_id:           tableId,
    playlist_id:        playlistId,
    coach_id:           coachId,
    items_total:        itemsTotal,
    opted_in_players:   optedInPlayers,
    opted_out_players:  optedOutPlayers,
    hero_mode:          heroMode,
    hero_player_id:     heroPlayerId,
    auto_advance:       autoAdvance,
  }).select('*').single());
}

async function getActiveDrillSession(tableId) {
  const data = await q(
    supabase.from('drill_sessions')
      .select('id, table_id, playlist_id, coach_id, status, current_position, items_dealt, items_total, opted_in_players, opted_out_players, started_at, paused_at')
      .eq('table_id', tableId)
      .in('status', ['active', 'paused'])
      .order('started_at', { ascending: false })
      .limit(1)
  );
  return data?.[0] ?? null;
}

async function getPausedDrillSession(tableId, playlistId) {
  const row = await q(
    supabase.from('drill_sessions')
      .select('*')
      .eq('table_id', tableId)
      .eq('playlist_id', playlistId)
      .eq('status', 'paused')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  );
  return row ?? null;
}

async function getDrillSession(sessionId) {
  const data = await q(
    supabase.from('drill_sessions')
      .select('id, table_id, playlist_id, coach_id, status, current_position, items_dealt, items_total, opted_in_players, opted_out_players, started_at, paused_at, completed_at')
      .eq('id', sessionId)
      .single()
  );
  return data || null;
}

async function updateDrillSession(sessionId, changes) {
  const patch = {};
  const fieldMap = {
    status:           'status',
    currentPosition:  'current_position',
    itemsDealt:       'items_dealt',
    itemsTotal:       'items_total',
    optedInPlayers:   'opted_in_players',
    optedOutPlayers:  'opted_out_players',
    pausedAt:         'paused_at',
    completedAt:      'completed_at',
    heroMode:         'hero_mode',
    heroPlayerId:     'hero_player_id',
    autoAdvance:      'auto_advance',
  };
  for (const [jsKey, dbCol] of Object.entries(fieldMap)) {
    if (changes[jsKey] !== undefined) patch[dbCol] = changes[jsKey];
  }
  if (Object.keys(patch).length === 0) return getDrillSession(sessionId);
  const data = await q(
    supabase.from('drill_sessions')
      .update(patch)
      .eq('id', sessionId)
      .select('id, table_id, playlist_id, coach_id, status, current_position, items_dealt, items_total, opted_in_players, opted_out_players, started_at, paused_at, completed_at')
      .single()
  );
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  // Folders
  getFolderTree, createFolder, updateFolder, deleteFolder,
  // Scenarios
  listScenarios, getScenario, createScenario, updateScenario,
  duplicateScenario, deleteScenario, getVersionHistory, incrementPlayCount,
  createScenarioFromHand,
  // Playlists (new-column ops)
  updatePlaylistMeta, softDeletePlaylist,
  // Playlist items
  getPlaylistItems, addPlaylistItem, removePlaylistItem, reorderPlaylistItems,
  // Drill sessions
  createDrillSession, getActiveDrillSession, getPausedDrillSession, getDrillSession, updateDrillSession,
};
