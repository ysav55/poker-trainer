'use strict';

/**
 * BotTableController — manages bot players for a Play vs Bot table.
 *
 * Extends AutoController so it inherits:
 *   - canPause/canUndo/canManualCard/canReplay → all false
 *
 * Bots are socket.io-client connections that join the room just like humans.
 * They receive game_state events and emit place_bet when it is their turn.
 *
 * Hand lifecycle (fully server-driven — no coach socket required):
 *   1. Once all bots have joined AND ≥2 players are seated, _startHand() is called.
 *   2. _startHand() calls gm.startGame(), logs to HandLogger, and broadcasts state.
 *   3. Bots receive game_state, think, and emit place_bet.
 *   4. When any bot receives game_state with phase='showdown', _completeHand() fires.
 *   5. _completeHand() captures state, resets, emits hand_complete, logs endHand.
 *   6. After DEAL_DELAY_MS, _startHand() is called again for the next hand.
 *
 * Constructor reads bot_count, difficulty, and (optionally) serverUrl from
 * tableConfig.bot_config. Falls back to sensible defaults if not present.
 */

const { AutoController } = require('./AutoController');
const { decide }         = require('../BotDecisionService');
const JwtService         = require('../../auth/JwtService');
const { v4: uuidv4 }     = require('uuid');

// Lazy-load to avoid circular deps at module parse time.
function _ioClient()    { return require('socket.io-client'); }
function _HandLogger()  { return require('../../db/HandLoggerSupabase'); }
function _SharedState() { return require('../../state/SharedState'); }

const DEAL_DELAY_MS      = 2500;
const MIN_THINK_MS       = 300;
const MAX_THINK_MS       = 800;
const RECONNECT_GRACE_MS = 15_000;

class BotTableController extends AutoController {
  /**
   * @param {string} tableId
   * @param {object} gm          - GameManager (raw, from sm.gm ?? sm)
   * @param {object} io          - socket.io server instance
   * @param {object} tableConfig - DB table row; reads tableConfig.bot_config
   */
  constructor(tableId, gm, io, tableConfig = {}) {
    super(tableId, gm, io);

    const cfg = tableConfig?.bot_config ?? {};

    this.difficulty = cfg.difficulty  ?? 'easy';
    this.botCount   = cfg.bot_count   ?? 1;
    this.serverUrl  = cfg.serverUrl   ?? `http://localhost:${process.env.PORT ?? 3001}`;

    /** @type {Array<{socket: object, stableId: string, name: string, thinkTimer: ReturnType<setTimeout>|null, joined: boolean}>} */
    this._botSockets      = [];
    this._botsSpawned     = false;
    this._handActive      = false; // guard: ensures _completeHand runs only once per hand
    this._gracePauseTimer = null;

    // Spawn bots immediately — they'll connect async and join when ready.
    this._spawnBots();
  }

  getMode() { return 'bot_cash'; }

  // ─── Bot lifecycle ──────────────────────────────────────────────────────────

  /**
   * Create N socket.io-client connections that join the table as bots.
   * Each bot authenticates via a server-signed JWT (role='bot') so it passes
   * socketAuthMiddleware and is trusted by the bot_cash visibility check.
   */
  _spawnBots() {
    if (this._botsSpawned) return;
    this._botsSpawned = true;

    const diffLabel = this.difficulty.charAt(0).toUpperCase() + this.difficulty.slice(1);
    const ioClient  = _ioClient();

    for (let i = 0; i < this.botCount; i++) {
      const stableId = uuidv4();
      const name     = this.botCount === 1
        ? `Bot (${diffLabel})`
        : `Bot ${i + 1} (${diffLabel})`;

      const token  = JwtService.sign({ stableId, name, role: 'bot' });
      const socket = ioClient(this.serverUrl, {
        auth:         { token },
        reconnection: false,
        forceNew:     true,
      });

      const botEntry = { socket, stableId, name, thinkTimer: null, joined: false };
      this._botSockets.push(botEntry);

      socket.on('connect', () => {
        socket.emit('join_room', { name, tableId: this.tableId });
      });

      socket.on('room_joined', () => {
        botEntry.joined = true;
        // Once every bot has joined, try to start the first hand.
        if (this._botSockets.every(b => b.joined)) {
          this._tryAutoStart();
        }
      });

      socket.on('game_state', (state) => {
        if (!this.active) return;
        this._onGameState(state, socket, botEntry);
      });

      socket.on('connect_error', (err) => {
        console.error(`[BotTableController] ${name} connect error: ${err.message}`);
      });
    }
  }

  /**
   * Start the first hand once all bots and at least one human are seated.
   * Subsequent hands are triggered by _completeHand → onHandComplete.
   */
  _tryAutoStart() {
    const state  = this.gm.state ?? {};
    if (state.phase !== 'waiting') return;
    const seated = (state.players ?? []).filter(p => p.seat >= 0 && !p.disconnected);
    if (seated.length >= 2) {
      this._startHand().catch(err => console.error('[BotTableController] _startHand error:', err));
    }
  }

  /**
   * Start a new hand: mutate GM state, log to HandLogger, broadcast to all sockets.
   */
  async _startHand() {
    const result = this.gm.startGame();
    if (result?.error) return;

    this._handActive = true;

    const handId    = uuidv4();
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
    });

    ss.activeHands.set(this.tableId, { handId, sessionId });
    this._broadcastState();
  }

  /**
   * Called whenever the bot receives a game_state broadcast.
   * Acts only when it is this bot's turn and the game is in a betting round.
   * Also detects showdown to trigger hand completion (once per hand).
   */
  _onGameState(state, socket, botEntry) {
    // Detect hand completion via showdown — trigger reset once
    if (state.phase === 'showdown') {
      this._completeHand().catch(() => {});
      return;
    }

    const BETTING_PHASES = ['preflop', 'flop', 'turn', 'river'];
    if (!BETTING_PHASES.includes(state.phase)) return;
    if (state.current_turn !== socket.id) return;

    // Clear any stale think timer
    if (botEntry.thinkTimer) {
      clearTimeout(botEntry.thinkTimer);
      botEntry.thinkTimer = null;
    }

    const delay = MIN_THINK_MS + Math.floor(Math.random() * (MAX_THINK_MS - MIN_THINK_MS + 1));

    botEntry.thinkTimer = setTimeout(() => {
      botEntry.thinkTimer = null;
      if (!this.active) return;
      // Re-check turn ownership after the delay (another player may have acted)
      if (state.current_turn !== socket.id) return;

      const decision = decide(state, socket.id, this.difficulty);
      socket.emit('place_bet', decision);
    }, delay);
  }

  /**
   * Complete the current hand: save state snapshot, reset GM, emit hand_complete,
   * log endHand to DB. Called once per hand (guarded by _handActive flag).
   */
  async _completeHand() {
    if (!this._handActive) return;
    this._handActive = false;

    const ss       = _SharedState();
    const handInfo = ss.activeHands.get(this.tableId);
    const sm       = ss.tables.get(this.tableId);
    const stateCopy = handInfo ? JSON.parse(JSON.stringify(this.gm.state)) : null;

    // Reset game state (use SessionManager if available so session stats are committed)
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
      }).catch(() => {});
      ss.activeHands.delete(this.tableId);
    }

    this._broadcastState();
  }

  // ─── TableController overrides ──────────────────────────────────────────────

  async onHandComplete(handResult) {
    this.io.to(this.tableId).emit('hand_complete', handResult);

    setTimeout(async () => {
      if (!this.active) return;
      const state   = this.gm.state ?? {};
      const players = (state.players ?? []).filter(p => !p.is_coach && p.seat >= 0);
      if (players.length >= 2) {
        await this._startHand();
      }
    }, DEAL_DELAY_MS);
  }

  async onPlayerLeave(_playerId) {
    // Pause bot think-timers during the reconnect grace window.
    this._pauseBotTimers();
    if (this._gracePauseTimer) clearTimeout(this._gracePauseTimer);
    this._gracePauseTimer = setTimeout(() => {
      this._gracePauseTimer = null;
      // Grace window expired — bots resume responding to future game_state events.
    }, RECONNECT_GRACE_MS);
  }

  destroy() {
    this._teardown();
    super.destroy();
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * Broadcast the current game state to every socket in the table room.
   * Used after startGame() and after resetForNextHand() since those mutate
   * state without going through a socket handler that would call broadcastState().
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

  _pauseBotTimers() {
    for (const entry of this._botSockets) {
      if (entry.thinkTimer) {
        clearTimeout(entry.thinkTimer);
        entry.thinkTimer = null;
      }
    }
  }

  _teardown() {
    this._pauseBotTimers();
    for (const entry of this._botSockets) {
      try { entry.socket.disconnect(); } catch { /* ignore */ }
    }
    this._botSockets = [];

    if (this._gracePauseTimer) {
      clearTimeout(this._gracePauseTimer);
      this._gracePauseTimer = null;
    }
  }
}

module.exports = { BotTableController };
