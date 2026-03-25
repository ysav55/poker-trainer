'use strict';

const SessionManager = require('../game/SessionManager');

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
  }

  /** Lazy SessionManager factory — creates the table if it doesn't exist. */
  getOrCreateTable(tableId) {
    if (!this.tables.has(tableId)) {
      this.tables.set(tableId, new SessionManager(tableId));
    }
    return this.tables.get(tableId);
  }
}

module.exports = new SharedState();
