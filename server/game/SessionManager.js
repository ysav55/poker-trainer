/**
 * SessionManager — wraps GameManager to track per-player stats across hands.
 *
 * Usage (drop-in replacement for GameManager in server/index.js):
 *   const sm = new SessionManager(tableId);
 *   sm.startGame(mode)         — captures dealt-in players, delegates to gm
 *   sm.placeBet(id, action, n) — intercepts preflop actions for VPIP/PFR, delegates to gm
 *   sm.resetForNextHand()      — calls endHand() to commit stats, then delegates reset
 *   sm.getSessionStats()       — returns SessionState
 *   sm.state                   — direct access to gm.state
 *   sm.gm                      — underlying GameManager
 *
 * All other GameManager methods are proxied directly.
 */

const GameManager = require('./GameManager');

class SessionManager {
  constructor(tableId) {
    this.gm = new GameManager(tableId);
    this.sessionId = `session_${tableId}_${Date.now()}`;
    this.handsDealt = 0;

    // Map<playerId, StatsEntry> — internal stats with counters
    this._stats = new Map();

    // Map<playerId, number> — stack at session start (first time we see a player)
    this._startingStacks = new Map();

    // Map<playerId, { vpipThisHand, pfrThisHand }> — reset each hand
    this._preflopTracking = new Map();
  }

  // ─────────────────────────────────────────────
  //  Internal helpers
  // ─────────────────────────────────────────────

  /**
   * Ensure a stats entry exists for a player.
   * Captures the starting stack the first time we encounter the player.
   */
  _ensurePlayerStats(player) {
    if (!this._stats.has(player.id)) {
      this._stats.set(player.id, {
        playerId: player.id,
        playerName: player.name,
        handsPlayed: 0,
        handsWon: 0,
        netChips: 0,
        // Ratios (recomputed after each hand)
        vpip: 0,
        pfr: 0,
        wtsd: 0,
        wsd: 0,
        // Internal counters — not exposed in getSessionStats
        _vpipCount: 0,
        _pfrCount: 0,
        _wtsdCount: 0,
        _wsdCount: 0
      });
      this._startingStacks.set(player.id, player.stack);
    }
  }

  // ─────────────────────────────────────────────
  //  Lifecycle hooks
  // ─────────────────────────────────────────────

  /**
   * startGame — delegates to gm, then sets up preflop tracking for dealt-in players.
   */
  startGame(mode = 'rng') {
    const result = this.gm.startGame(mode);
    if (result.error) return result;

    this.gm._gamePlayers().forEach(p => {
      this._ensurePlayerStats(p);
      this._preflopTracking.set(p.id, { vpipThisHand: false, pfrThisHand: false });
    });

    return result;
  }

  /**
   * trackPreflopAction — call/raise preflop counts toward VPIP/PFR.
   * Called internally by placeBet before delegating to gm.
   */
  trackPreflopAction(playerId, action) {
    if (this.gm.state.phase !== 'preflop') return;
    const tracking = this._preflopTracking.get(playerId);
    if (!tracking) return;
    if (action === 'call' || action === 'raise') tracking.vpipThisHand = true;
    if (action === 'raise') tracking.pfrThisHand = true;
  }

  /**
   * endHand — commit hand stats.
   * Called automatically by resetForNextHand() before delegating the reset.
   */
  endHand() {
    const state = this.gm.state;
    const showdownResult = state.showdown_result;

    this.handsDealt++;

    this.gm._gamePlayers().forEach(p => {
      this._ensurePlayerStats(p);
      const stats = this._stats.get(p.id);
      stats.playerName = p.name;

      // Only count players who were dealt in (have 2 hole cards)
      const wasDealtIn = Array.isArray(p.hole_cards) && p.hole_cards.length === 2;
      if (!wasDealtIn) return;

      stats.handsPlayed++;

      // VPIP / PFR
      const preflopInfo = this._preflopTracking.get(p.id);
      if (preflopInfo) {
        if (preflopInfo.vpipThisHand) stats._vpipCount++;
        if (preflopInfo.pfrThisHand) stats._pfrCount++;
      }

      if (showdownResult) {
        // WTSD — was the player still active at showdown?
        if (p.is_active) {
          stats._wtsdCount++;

          // WSD — did they win at showdown (main pot or any side pot)?
          const wonMain = showdownResult.winners.some(w => w.playerId === p.id);
          const wonSide = (showdownResult.sidePotResults || []).some(spr =>
            spr.winners.some(w => w.playerId === p.id)
          );
          if (wonMain || wonSide) {
            stats._wsdCount++;
            stats.handsWon++;
          }
        }
      } else {
        // Fold-to-one path: no showdown_result, winner set directly on state
        if (state.winner === p.id) {
          stats.handsWon++;
        }
      }

      // Recompute ratios
      stats.vpip = stats.handsPlayed > 0 ? stats._vpipCount / stats.handsPlayed : 0;
      stats.pfr  = stats.handsPlayed > 0 ? stats._pfrCount  / stats.handsPlayed : 0;
      stats.wtsd = stats.handsPlayed > 0 ? stats._wtsdCount / stats.handsPlayed : 0;
      stats.wsd  = stats._wtsdCount  > 0 ? stats._wsdCount  / stats._wtsdCount  : 0;

      // netChips = current stack − starting stack (session-anchored)
      const startStack = this._startingStacks.get(p.id) ?? 1000;
      stats.netChips = p.stack - startStack;
    });

    this._preflopTracking.clear();
  }

  /**
   * resetForNextHand — commits stats, then resets game state.
   */
  resetForNextHand() {
    this.endHand();
    return this.gm.resetForNextHand();
  }

  // ─────────────────────────────────────────────
  //  Public stats API
  // ─────────────────────────────────────────────

  /**
   * getSessionStats — returns the current SessionState.
   * Ratios rounded to 3 decimal places.
   */
  getSessionStats() {
    const players = Array.from(this._stats.values()).map(s => ({
      playerId: s.playerId,
      playerName: s.playerName,
      handsPlayed: s.handsPlayed,
      handsWon: s.handsWon,
      netChips: s.netChips,
      vpip: Math.round(s.vpip * 1000) / 1000,
      pfr:  Math.round(s.pfr  * 1000) / 1000,
      wtsd: Math.round(s.wtsd * 1000) / 1000,
      wsd:  Math.round(s.wsd  * 1000) / 1000
    }));

    return {
      sessionId: this.sessionId,
      handsDealt: this.handsDealt,
      players
    };
  }

  // ─────────────────────────────────────────────
  //  GameManager proxy methods
  // ─────────────────────────────────────────────

  addPlayer(socketId, name, isCoach = false) {
    return this.gm.addPlayer(socketId, name, isCoach);
  }

  removePlayer(socketId) {
    return this.gm.removePlayer(socketId);
  }

  getPublicState(requesterId, isCoach) {
    return this.gm.getPublicState(requesterId, isCoach);
  }

  /**
   * placeBet — intercepts preflop actions for VPIP/PFR tracking, then delegates.
   */
  placeBet(playerId, action, amount = 0) {
    this.trackPreflopAction(playerId, action);
    return this.gm.placeBet(playerId, action, amount);
  }

  forceNextStreet() { return this.gm.forceNextStreet(); }
  awardPot(winnerId) { return this.gm.awardPot(winnerId); }
  undoAction() { return this.gm.undoAction(); }
  rollbackStreet() { return this.gm.rollbackStreet(); }
  togglePause() { return this.gm.togglePause(); }
  setMode(mode) { return this.gm.setMode(mode); }
  setBlindLevels(sb, bb) { return this.gm.setBlindLevels(sb, bb); }
  adjustStack(playerId, amount) { return this.gm.adjustStack(playerId, amount); }
  manualDealCard(targetType, targetId, position, card) {
    return this.gm.manualDealCard(targetType, targetId, position, card);
  }
  openConfigPhase() { return this.gm.openConfigPhase(); }
  updateHandConfig(config) { return this.gm.updateHandConfig(config); }

  // Direct state access
  get state() { return this.gm.state; }
}

module.exports = SessionManager;
