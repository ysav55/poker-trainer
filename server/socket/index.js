'use strict';

const sharedState  = require('../state/SharedState');
const buildHelpers = require('./helpers');
const { loadScenarioIntoConfig } = require('./services/scenarioService');
const buildPlaylistService       = require('./services/playlistService');

const HandLogger      = require('../db/HandLoggerSupabase');
const AnalyzerService = require('../game/AnalyzerService');
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
const registerReplay        = require('./handlers/replay');
const registerDisconnect    = require('./handlers/disconnect');
const registerMisc          = require('./handlers/misc');

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
    // Helper functions
    ...helpers,
    // Playlist service
    advancePlaylist:           playlistService.advancePlaylist,
    findMatchingPlaylistIndex: playlistService.findMatchingPlaylistIndex,
    activeNonCoachCount:       playlistService.activeNonCoachCount,
    // Scenario service
    loadScenarioIntoConfig,
    // External modules
    HandLogger,
    AnalyzerService,
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
  });
}

module.exports = { registerSocketHandlers };
