'use strict';

const sharedState  = require('../state/SharedState');
const buildHelpers = require('./helpers');
const { loadScenarioIntoConfig } = require('./services/scenarioService');
const buildPlaylistService       = require('./services/playlistService');

const HandLogger      = require('../db/HandLoggerSupabase');
const AnalyzerService = require('../game/AnalyzerService');
const EquityService   = require('../game/EquityService');
const log             = require('../logs/logger');
const { v4: uuidv4 }  = require('uuid');
const { getPosition } = require('../game/positions');
const { requireCoach } = require('../auth/socketGuards');

const registerJoinRoom      = require('./handlers/joinRoom');
const registerGameLifecycle = require('./handlers/gameLifecycle');
const registerBetting       = require('./handlers/betting');
const registerCoachControls = require('./handlers/coachControls');
const registerHandConfig    = require('./handlers/handConfig');
const registerPlaylists     = require('./handlers/playlists');
const registerReplay           = require('./handlers/replay');
const registerDisconnect       = require('./handlers/disconnect');
const registerMisc             = require('./handlers/misc');
const registerScenarioBuilder  = require('./handlers/scenarioBuilder');
const registerTournament       = require('./handlers/tournament');
const registerBotTable         = require('./handlers/botTable');
const registerDrillSession     = require('./handlers/drillSession');

/**
 * registerSocketHandlers — wires all socket event handlers onto the io instance.
 * Called once at server startup after io is created.
 */
function registerSocketHandlers(io) {
  const helpers         = buildHelpers(io, sharedState);
  const playlistService = buildPlaylistService({
    io,
    HandLogger,
    broadcastState:        helpers.broadcastState,
    loadScenarioIntoConfig,
  });

  /** Compute and broadcast equity for all active players at tableId. */
  function emitEquityUpdate(tableId) {
    const gm = sharedState.tables.get(tableId);
    if (!gm) return;
    const { phase } = gm.state;
    if (!['preflop', 'flop', 'turn', 'river'].includes(phase)) return;
    const players  = EquityService.buildEquityPlayers(gm.state, sharedState.stableIdMap);
    const board    = gm.state.board || [];
    const equities = EquityService.computeEquity(players, board);
    if (!equities.length) return;
    const cached   = { phase, equities };
    sharedState.equityCache.set(tableId, cached);
    const settings = sharedState.equitySettings.get(tableId)
      || { coach: true, players: false, showToPlayers: false, showRangesToPlayers: false, showHeatmapToPlayers: false };
    io.to(tableId).emit('equity_update', {
      ...cached,
      showToPlayers: settings.players ?? settings.showToPlayers ?? false,
      equity_visibility: { coach: settings.coach ?? true, players: settings.players ?? settings.showToPlayers ?? false },
    });
  }

  const ctx = {
    io,
    // Shared Maps (same Map instances throughout server lifetime)
    tables:                sharedState.tables,
    activeHands:           sharedState.activeHands,
    stableIdMap:           sharedState.stableIdMap,
    reconnectTimers:       sharedState.reconnectTimers,
    ghostStacks:           sharedState.ghostStacks,
    actionTimers:          sharedState.actionTimers,
    pausedTimerRemainders: sharedState.pausedTimerRemainders,
    equityCache:           sharedState.equityCache,
    equitySettings:        sharedState.equitySettings,
    // Helper functions
    ...helpers,
    emitEquityUpdate,
    // Playlist service
    advancePlaylist:           playlistService.advancePlaylist,
    findMatchingPlaylistIndex: playlistService.findMatchingPlaylistIndex,
    activeNonCoachCount:       playlistService.activeNonCoachCount,
    // Scenario service
    loadScenarioIntoConfig,
    // External modules
    HandLogger,
    AnalyzerService,
    EquityService,
    log,
    uuidv4,
    getPosition,
    requireCoach,
  };

  io.on('connection', socket => {
    console.log(`[connect] ${socket.id}`);
    registerJoinRoom(socket, ctx);
    registerGameLifecycle(socket, ctx);
    registerBetting(socket, ctx);
    registerCoachControls(socket, ctx);
    registerHandConfig(socket, ctx);
    registerPlaylists(socket, ctx);
    registerReplay(socket, ctx);
    registerDisconnect(socket, ctx);
    registerMisc(socket, ctx);
    registerScenarioBuilder(socket, ctx);
    registerTournament(socket, ctx);
    registerBotTable(socket, ctx);
    registerDrillSession(socket, ctx);
  });
}

module.exports = { registerSocketHandlers };
