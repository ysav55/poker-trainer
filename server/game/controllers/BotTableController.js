'use strict';

/**
 * BotTableController — manages bot players for a Play vs Bot table.
 *
 * Extends AutoController so it inherits:
 *   - canPause/canUndo/canManualCard/canReplay → all false
 *   - auto-start of next hand via onHandComplete
 *
 * Bots are socket.io-client connections that join the room just like humans.
 * They receive game_state events and emit place_bet when it is their turn.
 *
 * Constructor reads bot_count, difficulty, and (optionally) serverUrl from
 * tableConfig.bot_config. Falls back to sensible defaults if not present.
 */

const { AutoController } = require('./AutoController');
const { decide }         = require('../BotDecisionService');
const JwtService         = require('../../auth/JwtService');
const { v4: uuidv4 }     = require('uuid');

// Lazy-load socket.io-client so tests can mock it without side effects.
function _ioClient() {
  return require('socket.io-client');
}

const DEAL_DELAY_MS  = 2500;
const MIN_THINK_MS   = 300;
const MAX_THINK_MS   = 800;
const RECONNECT_GRACE_MS = 15_000;

class BotTableController extends AutoController {
  /**
   * @param {string} tableId
   * @param {object} gm          - GameManager (or SessionManager wrapping one)
   * @param {object} io          - socket.io server instance
   * @param {object} tableConfig - DB table row; reads tableConfig.bot_config
   */
  constructor(tableId, gm, io, tableConfig = {}) {
    super(tableId, gm, io);

    const cfg = tableConfig?.bot_config ?? {};

    this.difficulty = cfg.difficulty  ?? 'easy';
    this.botCount   = cfg.bot_count   ?? 1;
    this.serverUrl  = cfg.serverUrl   ?? `http://localhost:${process.env.PORT ?? 3001}`;

    /** @type {Array<{socket: object, stableId: string, name: string, thinkTimer: ReturnType<setTimeout>|null}>} */
    this._botSockets    = [];
    this._botsSpawned   = false;
    this._gracePauseTimer = null;

    // Spawn bots immediately — they'll connect async and join when ready.
    this._spawnBots();
  }

  getMode() { return 'bot_cash'; }

  // ─── Bot lifecycle ──────────────────────────────────────────────────────────

  /**
   * Create N socket.io-client connections that join the table as bots.
   * Each bot authenticates via a server-signed JWT so it passes the
   * socketAuthMiddleware check in joinRoom.
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
        // Once every bot has joined, try to start the first hand automatically.
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
   * Subsequent hands are triggered by onHandComplete.
   */
  _tryAutoStart() {
    const state = this.gm.state ?? {};
    if (state.phase !== 'waiting') return; // hand already in progress
    const seated = (state.players ?? []).filter(p => p.seat >= 0 && !p.disconnected);
    if (seated.length >= 2) {
      this.gm.startGame().catch?.(() => {});
    }
  }

  /**
   * Called whenever the bot receives a game_state broadcast.
   * Acts only when it is this bot's turn and the game is in a betting round.
   */
  _onGameState(state, socket, botEntry) {
    const BETTING_PHASES = ['preflop', 'flop', 'turn', 'river'];
    if (!BETTING_PHASES.includes(state.phase)) return;
    if (state.current_turn !== socket.id) return;

    // Clear any stale think timer (e.g. game state updated before timer fired)
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

  // ─── TableController overrides ──────────────────────────────────────────────

  async onHandComplete(handResult) {
    this.io.to(this.tableId).emit('hand_complete', handResult);

    setTimeout(async () => {
      if (!this.active) return;
      const state   = this.gm.state ?? this.gm.getState?.() ?? {};
      const players = (state.players ?? []).filter(p => !p.is_coach && p.seat >= 0);
      if (players.length >= 2) {
        await this.gm.startGame();
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
