'use strict';

const express  = require('express');
const { v4: uuidv4 } = require('uuid');

const supabase   = require('../../db/supabase');
const HandLogger = require('../../db/HandLoggerSupabase');
const { saveScenarioConfig, getScenarioConfigs } = require('../../db/repositories/ScenarioRepository');
const { requirePermission } = require('../../auth/requirePermission');

const router = express.Router();

const VALID_STREETS = new Set(['preflop', 'flop', 'turn', 'river']);

// All routes below require hand:tag permission (requireAuth applied at registration).
router.use(requirePermission('hand:tag'));

// ─── POST /api/admin/scenarios ────────────────────────────────────────────────
// Save a scenario config, optionally creating a playlist, and link via a stub hand.
router.post('/scenarios', async (req, res) => {
  const {
    name,
    playlistId: rawPlaylistId,
    newPlaylistName,
    playerCount,
    dealerPosition = 0,
    startingStreet = 'preflop',
    smallBlind = 25,
    bigBlind = 50,
    configJson,
    tableId = null,
  } = req.body || {};

  // ── Validation ──────────────────────────────────────────────────────────────
  if (!Number.isInteger(playerCount) || playerCount < 2 || playerCount > 9) {
    return res.status(400).json({ error: 'playerCount must be an integer between 2 and 9' });
  }
  if (!VALID_STREETS.has(startingStreet)) {
    return res.status(400).json({ error: `startingStreet must be one of: ${[...VALID_STREETS].join(', ')}` });
  }
  if (!configJson || typeof configJson !== 'object') {
    return res.status(400).json({ error: 'configJson is required and must be an object' });
  }

  const createdBy = req.user?.id || null;

  try {
    // ── 1. Resolve or create playlist ────────────────────────────────────────
    let resolvedPlaylistId = rawPlaylistId;

    if (!resolvedPlaylistId || resolvedPlaylistId === 'new') {
      const pName = (newPlaylistName && newPlaylistName.trim()) || name || 'Scenarios';
      const playlist = await HandLogger.createPlaylist({ name: pName, tableId });
      resolvedPlaylistId = playlist.playlist_id;
    }

    // ── 2. Save scenario_config row ─────────────────────────────────────────
    const { id: scenarioId } = await saveScenarioConfig({
      tableId,
      name: name || null,
      createdBy,
      playerCount,
      dealerPosition,
      startingStreet,
      smallBlind,
      bigBlind,
      configJson,
    });

    // ── 3. Create a stub hand row ─────────────────────────────────────────────
    const stubHandId = uuidv4();
    const sessionId  = uuidv4();

    await HandLogger.startHand({
      handId:      stubHandId,
      sessionId,
      tableId:     tableId || 'main-table',
      players:     [],
      allPlayers:  [],
      dealerSeat:  dealerPosition,
      isScenario:  true,
      smallBlind,
      bigBlind,
      sessionType: 'drill',
    });

    await HandLogger.updateCoachTags(stubHandId, ['SCENARIO_BUILDER']);

    // ── 4. Link stub hand to playlist, then attach scenario_config_id ─────────
    await HandLogger.addHandToPlaylist(resolvedPlaylistId, stubHandId);

    await supabase
      .from('playlist_hands')
      .update({ scenario_config_id: scenarioId })
      .eq('playlist_id', resolvedPlaylistId)
      .eq('hand_id', stubHandId);

    return res.status(201).json({ scenarioId, playlistId: resolvedPlaylistId });

  } catch (err) {
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// ─── GET /api/admin/scenarios ─────────────────────────────────────────────────
// List all scenario configs created by the current user.
router.get('/scenarios', async (req, res) => {
  const createdBy = req.user?.id || null;
  if (!createdBy) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  try {
    const configs = await getScenarioConfigs(createdBy);
    return res.json({ configs });
  } catch (err) {
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

module.exports = router;
