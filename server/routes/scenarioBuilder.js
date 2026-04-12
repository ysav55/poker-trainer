'use strict';

const express = require('express');
const { requirePermission } = require('../auth/requirePermission');
const HandLogger = require('../db/HandLoggerSupabase');
const repo = require('../db/repositories/ScenarioBuilderRepository');
const PlaylistExecutionService = require('../services/PlaylistExecutionService');
const SharedState = require('../state/SharedState');

const router = express.Router();

// Permission guards (requireAuth already applied at mount point in index.js)
const canTag      = requirePermission('hand:tag');       // create/edit scenarios & playlists
const canManage   = requirePermission('table:manage');   // drill session control

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUuidOrNullish(v) {
  return v === undefined || v === null || (typeof v === 'string' && UUID_RE.test(v));
}

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO FOLDERS  /api/scenarios/folders
// ─────────────────────────────────────────────────────────────────────────────

router.get('/scenarios/folders', canTag, async (req, res) => {
  try {
    const tree = await repo.getFolderTree(req.user.stableId);
    res.json({ folders: tree });
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

router.post('/scenarios/folders', canTag, async (req, res) => {
  const { name, parent_id: parentId = null, sort_order: sortOrder = 0 } = req.body || {};
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  try {
    const folder = await repo.createFolder({ coachId: req.user.stableId, name: name.trim(), parentId, sortOrder });
    res.status(201).json(folder);
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

router.patch('/scenarios/folders/:id', canTag, async (req, res) => {
  const { name, parent_id: parentId, sort_order: sortOrder } = req.body || {};
  try {
    const folder = await repo.updateFolder(req.params.id, { name, parentId, sortOrder });
    res.json(folder);
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

router.delete('/scenarios/folders/:id', canTag, async (req, res) => {
  try {
    await repo.deleteFolder(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIOS  /api/scenarios
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/scenarios  — list current scenarios for the authenticated coach
router.get('/scenarios', canTag, async (req, res) => {
  const { folder_id, tags, player_count, search } = req.query;
  try {
    const scenarios = await repo.listScenarios({
      coachId:     req.user.stableId,
      folderId:    folder_id,
      tags:        tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
      playerCount: player_count ? parseInt(player_count, 10) : undefined,
      search,
    });
    res.json({ scenarios });
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// GET /api/scenarios/:id  — single scenario
router.get('/scenarios/:id', canTag, async (req, res) => {
  try {
    const scenario = await repo.getScenario(req.params.id);
    if (!scenario) return res.status(404).json({ error: 'not_found' });
    if (scenario.coach_id !== req.user.stableId) return res.status(403).json({ error: 'forbidden' });
    res.json(scenario);
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// POST /api/scenarios  — create new scenario
router.post('/scenarios', canTag, async (req, res) => {
  const {
    name, folder_id, description, tags = [],
    player_count, btn_seat = 0, card_mode = 'fixed',
    seat_configs = [], stack_configs = [],
    board_mode = 'none', board_flop, board_turn, board_river,
    board_texture, texture_turn, texture_river,
    blind_mode = false, is_shareable = false,
    primary_playlist_id = null,
  } = req.body || {};

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  if (!Number.isInteger(player_count) || player_count < 2 || player_count > 9) {
    return res.status(400).json({ error: 'player_count must be 2–9' });
  }
  if (!['fixed', 'range'].includes(card_mode)) {
    return res.status(400).json({ error: 'card_mode must be "fixed" or "range"' });
  }
  if (!isValidUuidOrNullish(primary_playlist_id)) {
    return res.status(400).json({ error: 'primary_playlist_id must be a valid UUID' });
  }

  try {
    const scenario = await repo.createScenario({
      coachId: req.user.stableId, folderId: folder_id, name: name.trim(),
      description, tags, playerCount: player_count, btnSeat: btn_seat,
      cardMode: card_mode, seatConfigs: seat_configs, stackConfigs: stack_configs,
      boardMode: board_mode, boardFlop: board_flop, boardTurn: board_turn,
      boardRiver: board_river, boardTexture: board_texture,
      textureTurn: texture_turn, textureRiver: texture_river,
      blindMode: blind_mode, isShareable: is_shareable,
      primaryPlaylistId: primary_playlist_id,
    });
    res.status(201).json(scenario);
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// PATCH /api/scenarios/:id  — edit scenario (auto-versions if play_count > 0)
router.patch('/scenarios/:id', canTag, async (req, res) => {
  try {
    const existing = await repo.getScenario(req.params.id);
    if (!existing) return res.status(404).json({ error: 'not_found' });
    if (existing.coach_id !== req.user.stableId) return res.status(403).json({ error: 'forbidden' });

    const {
      name, folder_id: folderId, description, tags,
      player_count: playerCount, btn_seat: btnSeat, card_mode: cardMode,
      seat_configs: seatConfigs, stack_configs: stackConfigs,
      board_mode: boardMode, board_flop: boardFlop, board_turn: boardTurn,
      board_river: boardRiver, board_texture: boardTexture,
      texture_turn: textureTurn, texture_river: textureRiver,
      blind_mode: blindMode, is_shareable: isShareable,
      primary_playlist_id: primaryPlaylistId,
    } = req.body || {};

    if (!isValidUuidOrNullish(primaryPlaylistId)) {
      return res.status(400).json({ error: 'primary_playlist_id must be a valid UUID' });
    }

    const updated = await repo.updateScenario(req.params.id, {
      name, folderId, description, tags, playerCount, btnSeat, cardMode,
      seatConfigs, stackConfigs, boardMode, boardFlop, boardTurn, boardRiver,
      boardTexture, textureTurn, textureRiver, blindMode, isShareable,
      primaryPlaylistId,
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// POST /api/scenarios/:id/duplicate
router.post('/scenarios/:id/duplicate', canTag, async (req, res) => {
  try {
    const existing = await repo.getScenario(req.params.id);
    if (!existing) return res.status(404).json({ error: 'not_found' });
    if (existing.coach_id !== req.user.stableId) return res.status(403).json({ error: 'forbidden' });
    const copy = await repo.duplicateScenario(req.params.id, req.user.stableId);
    res.status(201).json(copy);
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// POST /api/scenarios/from-hand  — create scenario from completed hand
router.post('/scenarios/from-hand', canTag, async (req, res) => {
  const { hand_id, include_board = true } = req.body || {};
  if (!hand_id) return res.status(400).json({ error: 'hand_id is required' });
  try {
    const scenario = await repo.createScenarioFromHand(hand_id, req.user.stableId, { includeBoard: include_board });
    res.status(201).json(scenario);
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// DELETE /api/scenarios/:id  — soft-delete
router.delete('/scenarios/:id', canTag, async (req, res) => {
  try {
    const existing = await repo.getScenario(req.params.id);
    if (!existing) return res.status(404).json({ error: 'not_found' });
    if (existing.coach_id !== req.user.stableId) return res.status(403).json({ error: 'forbidden' });
    await repo.deleteScenario(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// GET /api/scenarios/:id/versions
router.get('/scenarios/:id/versions', canTag, async (req, res) => {
  try {
    const versions = await repo.getVersionHistory(req.params.id);
    res.json({ versions });
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PLAYLISTS (new column mutations)  /api/playlists/:id
// Base GET /api/playlists and POST /api/playlists stay in routes/playlists.js
// ─────────────────────────────────────────────────────────────────────────────

// PATCH /api/playlists/:id  — update name, tags, ordering, advance_mode, folder_id
router.patch('/playlists/:id', canTag, async (req, res) => {
  const { name, description, tags, ordering, advance_mode: advanceMode, folder_id: folderId, is_shareable: isShareable } = req.body || {};
  try {
    const updated = await repo.updatePlaylistMeta(req.params.id, {
      name, description, tags, ordering, advanceMode, folderId, isShareable,
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// DELETE /api/playlists/:id/soft  — soft-delete (new builder uses this; old DELETE in playlists.js hard-deletes)
router.delete('/playlists/:id/soft', canTag, async (req, res) => {
  try {
    await repo.softDeletePlaylist(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// ─── Playlist items ───────────────────────────────────────────────────────────

// GET /api/playlists/:id/items
router.get('/playlists/:id/items', canTag, async (req, res) => {
  try {
    const items = await repo.getPlaylistItems(req.params.id);
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// POST /api/playlists/:id/items  — add scenario to playlist
router.post('/playlists/:id/items', canTag, async (req, res) => {
  const { scenario_id, position } = req.body || {};
  if (!scenario_id) return res.status(400).json({ error: 'scenario_id is required' });
  try {
    // Check playlist item count (max 100)
    const existing = await repo.getPlaylistItems(req.params.id);
    if (existing.length >= 100) {
      return res.status(400).json({ error: 'Playlist is full (max 100 items)' });
    }
    const item = await repo.addPlaylistItem(req.params.id, scenario_id, position);
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// PATCH /api/playlists/:id/items/:itemId  — update position
router.patch('/playlists/:id/items/:itemId', canTag, async (req, res) => {
  const { position } = req.body || {};
  if (position === undefined) return res.status(400).json({ error: 'position is required' });
  try {
    await repo.reorderPlaylistItems(req.params.id, [{ id: req.params.itemId, position }]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// DELETE /api/playlists/:id/items/:itemId
router.delete('/playlists/:id/items/:itemId', canTag, async (req, res) => {
  try {
    await repo.removePlaylistItem(req.params.itemId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// POST /api/playlists/:id/items/reorder  — bulk reorder
router.post('/playlists/:id/items/reorder', canTag, async (req, res) => {
  const { items } = req.body || {};
  if (!Array.isArray(items)) return res.status(400).json({ error: 'items[] is required' });
  try {
    await repo.reorderPlaylistItems(req.params.id, items);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DRILL SESSIONS  /api/tables/:tableId/drill
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/tables/:tableId/drill  — start a drill session
router.post('/tables/:tableId/drill', canManage, async (req, res) => {
  const { playlist_id, opted_in_players = [], opted_out_players = [] } = req.body || {};
  if (!playlist_id) return res.status(400).json({ error: 'playlist_id is required' });

  // Guard: block if socket playlist drill is already active at this table
  const gm = SharedState.tables.get(req.params.tableId);
  if (gm?.state.playlist_mode?.active) {
    return res.status(409).json({
      error: 'conflict',
      message: 'A socket playlist drill is active at this table. Deactivate it first.',
    });
  }

  try {
    const session = await PlaylistExecutionService.start({
      tableId:          req.params.tableId,
      playlistId:       playlist_id,
      coachId:          req.user.stableId,
      optedInPlayers:   opted_in_players,
      optedOutPlayers:  opted_out_players,
    });
    res.status(201).json(session);
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// GET /api/tables/:tableId/drill  — get current drill session
router.get('/tables/:tableId/drill', async (req, res) => {
  try {
    const session = await PlaylistExecutionService.getStatus(req.params.tableId);
    res.json(session ?? { active: false });
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// PATCH /api/tables/:tableId/drill/pause
router.patch('/tables/:tableId/drill/pause', canManage, async (req, res) => {
  try {
    const session = await PlaylistExecutionService.pause(req.params.tableId);
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// PATCH /api/tables/:tableId/drill/resume
router.patch('/tables/:tableId/drill/resume', canManage, async (req, res) => {
  try {
    const session = await PlaylistExecutionService.resume(req.params.tableId);
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// PATCH /api/tables/:tableId/drill/advance
router.patch('/tables/:tableId/drill/advance', canManage, async (req, res) => {
  try {
    const result = await PlaylistExecutionService.advance(req.params.tableId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// PATCH /api/tables/:tableId/drill/pick  — manual scenario pick
router.patch('/tables/:tableId/drill/pick', canManage, async (req, res) => {
  const { item_id } = req.body || {};
  if (!item_id) return res.status(400).json({ error: 'item_id is required' });
  try {
    const session = await PlaylistExecutionService.pick(req.params.tableId, item_id);
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// PATCH /api/tables/:tableId/drill/participation  — opt player in/out
router.patch('/tables/:tableId/drill/participation', canManage, async (req, res) => {
  const { player_id, opt_in } = req.body || {};
  if (!player_id || opt_in === undefined) {
    return res.status(400).json({ error: 'player_id and opt_in are required' });
  }
  try {
    const session = await PlaylistExecutionService.setParticipation(req.params.tableId, player_id, opt_in);
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// DELETE /api/tables/:tableId/drill  — cancel/end drill session
router.delete('/tables/:tableId/drill', canManage, async (req, res) => {
  try {
    await PlaylistExecutionService.cancel(req.params.tableId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

module.exports = router;
