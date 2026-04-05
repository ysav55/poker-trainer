'use strict';

const SessionManager = require('../game/SessionManager');
const { CoachedController }    = require('../game/controllers/CoachedController');
const { AutoController }       = require('../game/controllers/AutoController');
const { TournamentController } = require('../game/controllers/TournamentController');
const { BotTableController }   = require('../game/controllers/BotTableController');

const controllers = new Map(); // tableId → TableController
const groupControllers = new Map(); // groupId → TournamentGroupController

function getOrCreateController(tableId, mode, gm, io, tableConfig = {}) {
  if (controllers.has(tableId)) return controllers.get(tableId);
  const ctrl = _createController(mode, tableId, gm, io, tableConfig);
  controllers.set(tableId, ctrl);
  return ctrl;
}

function getController(tableId) {
  return controllers.get(tableId) ?? null;
}

function destroyController(tableId) {
  const ctrl = controllers.get(tableId);
  if (ctrl) { ctrl.destroy(); controllers.delete(tableId); }
}

function _createController(mode, tableId, gm, io, tableConfig = {}) {
  switch (mode) {
    case 'uncoached_cash': return new AutoController(tableId, gm, io);
    case 'tournament':     return new TournamentController(tableId, gm, io);
    case 'bot_cash':       return new BotTableController(tableId, gm, io, tableConfig);
    default:               return new CoachedController(tableId, gm, io);
  }
}

/**
 * SharedState — singleton encapsulating all module-level Maps.
 *
 * Exported as a singleton so every module that requires it gets the same instance.
 * Never replace the Maps — only call .set(), .delete(), .clear() on them.
 */
class SharedState {
  constructor() {
    this.tables                = new Map(); // tableId → SessionManager
    this.activeHands           = new Map(); // tableId → { handId, sessionId }
    this.stableIdMap           = new Map(); // socketId → stableId (UUID)
    this.reconnectTimers       = new Map(); // socketId → { timer, tableId, name, isCoach, configSnapshot }
    this.ghostStacks           = new Map(); // stableId → stack (chip count saved on TTL expiry)
    this.actionTimers          = new Map(); // tableId → { timeout, startedAt, duration, playerId }
    this.pausedTimerRemainders = new Map(); // tableId → { playerId, remainingMs }
    this.equityCache           = new Map(); // tableId → { phase, equities: [{playerId, equity, tieEquity}] }
    this.equitySettings        = new Map(); // tableId → { showToPlayers: false, showRangesToPlayers: false, showHeatmapToPlayers: false }
  }

  /** Lazy SessionManager factory — creates the table if it doesn't exist. */
  getOrCreateTable(tableId) {
    if (!this.tables.has(tableId)) {
      this.tables.set(tableId, new SessionManager(tableId));
    }
    return this.tables.get(tableId);
  }
}

const instance = new SharedState();

function getTableSummaries() {
  return [...instance.tables.entries()].map(([id, sm]) => {
    const state = sm.getState ? sm.getState() : (sm.state ?? {});
    return {
      id,
      playerCount: (state.seated ?? state.players ?? []).length,
      street: state.street ?? null,
      phase: state.phase ?? 'waiting',
    };
  });
}

module.exports = Object.assign(instance, {
  getTableSummaries,
  getOrCreateController,
  getController,
  destroyController,
  groupControllers,
});
