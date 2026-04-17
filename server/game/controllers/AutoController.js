'use strict';

const { TableController } = require('./TableController');

const DEAL_DELAY_MS = 2000;

// Lazy requires to avoid circular deps at module load time
function _SharedState()  { return require('../../state/SharedState'); }
function _HandLogger()   { return require('../../db/HandLoggerSupabase'); }
function _uuidv4()       { const { v4 } = require('uuid'); return v4(); }
function _Analyzer()     { return require('../AnalyzerService'); }
function _log()          { return require('../../logs/logger'); }

class AutoController extends TableController {
  constructor(tableId, gameManager, io, tableConfig = {}) {
    super(tableId, gameManager, io);
    this._handActive = false;

    // Apply table config blinds & starting stack if provided
    const cfg = tableConfig?.config ?? {};
    if (cfg.sb && cfg.bb) {
      this.gm.setBlindLevels?.(cfg.sb, cfg.bb);
    }
    if (cfg.startingStack && this.gm.state?.players) {
      // Apply to any already-seated players (edge case — normally none yet)
      for (const p of this.gm.state.players) {
        if (!p.is_coach) {
          const diff = cfg.startingStack - (p.stack ?? 0);
          if (diff !== 0) this.gm.adjustStack?.(p.id, diff);
        }
      }
    }
    this._tableConfig = cfg;
  }

  getMode() { return 'uncoached_cash'; }

  // ─── Hand lifecycle ─────────────────────────────────────────────────────────

  /**
   * Start a new hand: start GM, log to DB, set activeHands, broadcast state.
   * Called by onHandComplete (auto-deal) and onPlayerJoin (first hand trigger).
   */
  async _startHand() {
    const result = this.gm.startGame();
    if (result?.error) return;

    this._handActive = true;

    const handId    = _uuidv4();
    const ss        = _SharedState();
    const sm        = ss.tables.get(this.tableId);
    const sessionId = sm?.sessionId ?? null;

    const allSeatedPlayers = (this.gm.state.players ?? [])
      .filter(p => !p.is_shadow && !p.is_observer)
      .map(p => ({
        id:       ss.stableIdMap.get(p.id) || p.id,
        name:     p.name,
        seat:     p.seat,
        stack:    p.stack,
        is_coach: p.is_coach,
      }));

    await _HandLogger().startHand({
      handId,
      sessionId,
      tableId:    this.tableId,
      players:    allSeatedPlayers,
      allPlayers: allSeatedPlayers,
      dealerSeat: this.gm.state.dealer_seat,
      smallBlind: this.gm.state.small_blind,
      bigBlind:   this.gm.state.big_blind,
      isScenario: false,
      sessionType: 'live',
      tableMode:  this.getMode(),
    }).catch(() => {});

    ss.activeHands.set(this.tableId, { handId, sessionId });
    this._broadcastState();
  }

  /**
   * Complete the current hand: snapshot state, reset GM, log endHand, trigger auto-deal.
   * Called from betting.js when the hand reaches showdown or fold-win.
   * Guarded by _handActive to prevent double-completion.
   */
  async _completeHand() {
    if (!this._handActive) return;
    this._handActive = false;

    const ss       = _SharedState();
    const handInfo = ss.activeHands.get(this.tableId);
    const sm       = ss.tables.get(this.tableId);
    const stateCopy = handInfo ? JSON.parse(JSON.stringify(this.gm.state)) : null;

    // Reset for next hand (SessionManager wrapper if present)
    if (sm?.resetForNextHand) {
      sm.resetForNextHand();
    } else {
      this.gm.resetForNextHand();
    }

    if (handInfo && stateCopy) {
      const handResult = stateCopy.showdown_result ?? null;
      await this.onHandComplete(handResult);
      _HandLogger().endHand({
        handId:         handInfo.handId,
        state:          stateCopy,
        socketToStable: Object.fromEntries(ss.stableIdMap),
      }).then(() => _Analyzer().analyzeAndTagHand(handInfo.handId))
        .catch(err => _log().error('game', 'hand_completion_failed',
          '[AutoController] endHand or analyzeAndTagHand failed',
          { err, handId: handInfo.handId, tableId: this.tableId }
        ));
      ss.activeHands.delete(this.tableId);
    }

    this._broadcastState();
  }

  /**
   * Emit hand_complete, handle bust detection, then schedule auto-deal.
   */
  async onHandComplete(handResult) {
    this.io.to(this.tableId).emit('hand_complete', handResult);

    // Bust detection: sit out players who have no chips left
    const state  = this.gm.state ?? {};
    const seated = state.players ?? [];
    for (const p of seated) {
      if ((p.stack ?? 0) <= 0 && !p.is_coach) {
        this.io.to(p.id).emit('player_busted', {
          message: 'You have run out of chips.',
        });
        this.gm.setPlayerInHand(p.id, false);
      }
    }

    setTimeout(async () => {
      if (!this.active) return;
      const freshState = this.gm.state ?? {};
      const active = (freshState.players ?? []).filter(
        p => !p.is_coach && p.seat >= 0 && (p.stack ?? 0) > 0 && p.in_hand !== false
      );
      if (active.length >= 2) {
        await this._startHand();
      }
    }, DEAL_DELAY_MS);
  }

  /**
   * Called from joinRoom.js whenever a player sits down.
   * Triggers the first hand automatically when a second eligible player joins.
   */
  async onPlayerJoin(playerId) {
    // Apply configured starting stack to the joining player if they have the default stack
    const ss = _SharedState();
    const socketId = [...ss.stableIdMap.entries()].find(([, sid]) => sid === playerId)?.[0] ?? playerId;
    const player = (this.gm.state?.players ?? []).find(p => p.id === socketId || p.id === playerId);
    if (player && !player.is_coach && this._tableConfig?.startingStack) {
      const diff = this._tableConfig.startingStack - (player.stack ?? 0);
      if (diff !== 0) this.gm.adjustStack?.(socketId, diff);
    }

    if (this._handActive) return;
    const state = this.gm.state ?? {};
    const active = (state.players ?? []).filter(
      p => !p.is_coach && p.seat >= 0 && !p.disconnected && (p.stack ?? 1) > 0
    );
    if (active.length >= 2) {
      await this._startHand();
    }
  }

  // ─── Capability flags ───────────────────────────────────────────────────────
  canPause()      { return false; }
  canUndo()       { return false; }
  canManualCard() { return false; }
  canReplay()     { return false; }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * Broadcast current game state per-socket so each player sees their own hole cards.
   */
  _broadcastState() {
    const room = this.io.sockets.adapter.rooms.get(this.tableId);
    if (!room) return;
    for (const socketId of room) {
      const socket = this.io.sockets.sockets.get(socketId);
      if (!socket) continue;
      socket.emit('game_state', this.gm.getPublicState(socketId, socket.data?.isCoach ?? false));
    }
  }
}

module.exports = { AutoController };
