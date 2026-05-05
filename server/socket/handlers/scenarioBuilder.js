'use strict';

const supabase = require('../../db/supabase');

const VALID_STREETS = new Set(['preflop', 'flop', 'turn', 'river']);

module.exports = function registerScenarioBuilder(socket, ctx) {
  const { tables, stableIdMap, requireCoach, HandLogger, sendError, uuidv4, log } = ctx;

  // ─── save_scenario_to_playlist ─────────────────────────────────────────────
  socket.on('save_scenario_to_playlist', async (payload = {}) => {
    if (requireCoach(socket, 'save scenario')) return;

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
    } = payload;

    // ── Validation ────────────────────────────────────────────────────────────
    if (!Number.isInteger(playerCount) || playerCount < 2 || playerCount > 9) {
      return sendError(socket, 'playerCount must be an integer between 2 and 9');
    }
    if (!VALID_STREETS.has(startingStreet)) {
      return sendError(socket, `startingStreet must be one of: ${[...VALID_STREETS].join(', ')}`);
    }
    if (!configJson || typeof configJson !== 'object') {
      return sendError(socket, 'configJson is required and must be an object');
    }

    const tableId   = socket.data.tableId;
    const createdBy = stableIdMap.get(socket.id) || socket.data.stableId || null;

    try {
      // ── 1. Resolve or create playlist ────────────────────────────────────────
      let resolvedPlaylistId = rawPlaylistId;

      if (!resolvedPlaylistId || resolvedPlaylistId === 'new') {
        const pName = (newPlaylistName && newPlaylistName.trim()) || name || 'Scenarios';
        const playlist = await HandLogger.createPlaylist({ name: pName, tableId });
        resolvedPlaylistId = playlist.playlist_id;
      }

      // ── 2. Save scenario_config row ─────────────────────────────────────────
      const { saveScenarioConfig } = require('../../db/repositories/ScenarioRepository');
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

      // ── 3. Create a stub hand row ────────────────────────────────────────────
      const stubHandId = uuidv4();
      const gm = tables.get(tableId);
      const sessionId = gm?.sessionId || uuidv4();

      await HandLogger.startHand({
        handId:      stubHandId,
        sessionId,
        tableId,
        players:     [],
        allPlayers:  [],
        dealerSeat:  dealerPosition,
        isScenario:  true,
        smallBlind,
        bigBlind,
        sessionType: 'drill',
      });

      // Tag the stub hand so it's distinguishable from real hands
      await HandLogger.updateCoachTags(stubHandId, ['SCENARIO_BUILDER']);

      // ── 4. Link stub hand to playlist, then attach scenario_config_id ────────
      await HandLogger.addHandToPlaylist(resolvedPlaylistId, stubHandId);

      const { error: updateErr } = await supabase
        .from('playlist_hands')
        .update({ scenario_config_id: scenarioId })
        .eq('playlist_id', resolvedPlaylistId)
        .eq('hand_id', stubHandId);

      if (updateErr) {
        log.error('db', 'scenario_config_id_update_failed',
          '[scenarioBuilder] Failed to set scenario_config_id on playlist_hands',
          { updateErr, resolvedPlaylistId, stubHandId, scenarioId });
      }

      // ── 5. Emit success ──────────────────────────────────────────────────────
      socket.emit('scenario_saved', { scenarioId, playlistId: resolvedPlaylistId, scenarioName: name || '' });
      socket.emit('playlist_state', { playlists: await HandLogger.getPlaylists({ tableId }) });
      socket.emit('notification', {
        type: 'scenario_saved',
        message: `"${name || 'Scenario'}" added to playlist`,
      });

      log.info('game', 'scenario_saved',
        `scenario saved scenarioId=${scenarioId}`,
        { tableId, scenarioId, resolvedPlaylistId });

    } catch (err) {
      log.error('game', 'save_scenario_failed', `[scenarioBuilder] save_scenario_to_playlist: ${err.message}`, { err });
      sendError(socket, `Failed to save scenario: ${err.message}`);
    }
  });

  // ─── get_scenario_configs ───────────────────────────────────────────────────
  socket.on('get_scenario_configs', async () => {
    if (requireCoach(socket, 'get scenario configs')) return;

    const createdBy = stableIdMap.get(socket.id) || socket.data.stableId || null;
    if (!createdBy) {
      return sendError(socket, 'Could not determine player identity');
    }

    try {
      const { getScenarioConfigs } = require('../../db/repositories/ScenarioRepository');
      const configs = await getScenarioConfigs(createdBy);
      socket.emit('scenario_configs', { configs });
    } catch (err) {
      sendError(socket, `Failed to load scenario configs: ${err.message}`);
    }
  });
};
