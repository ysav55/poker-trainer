'use strict';

const { AutoController }       = require('./AutoController');
const { BlindSchedule }        = require('./BlindSchedule');
const { TournamentRepository } = require('../../db/repositories/TournamentRepository');
const { TableRepository }      = require('../../db/repositories/TableRepository');

class TournamentController extends AutoController {
  constructor(tableId, gm, io, config = null) {
    super(tableId, gm, io);
    this.config       = config;
    this.blindSchedule = config ? new BlindSchedule(config.blind_schedule) : null;
    this.levelTimer   = null;
  }

  getMode() { return 'tournament'; }

  /**
   * Start the tournament: load blind schedule, set first level blinds,
   * start the level countdown timer, then deal the first hand.
   */
  async start(config) {
    this.config       = config;
    this.blindSchedule = new BlindSchedule(config.blind_schedule);

    const firstLevel = this.blindSchedule.getCurrentLevel();
    if (firstLevel) {
      // Set initial blinds on the game manager
      this.gm.setBlindLevels(firstLevel.sb, firstLevel.bb);
      this.blindSchedule.levelStartTime = Date.now();
    }

    this._startLevelTimer();
    await this.gm.startGame();
  }

  /**
   * Emit time-remaining for the current level and schedule the auto-advance.
   */
  _startLevelTimer() {
    const level = this.blindSchedule?.getCurrentLevel();
    if (!level) return;

    const ms = level.duration_minutes * 60_000;

    this.io.to(this.tableId).emit('tournament:time_remaining', {
      level:       level.level,
      remainingMs: ms,
    });

    this.levelTimer = setTimeout(() => {
      this._advanceLevel().catch(err => {
        this.io.to(this.tableId).emit('notification', {
          type:    'error',
          message: `Failed to advance blind level: ${err.message}`,
        });
      });
    }, ms);
  }

  /**
   * Move to the next blind level, update GM blinds, and emit tournament:blind_up.
   * If already at the final level, emits tournament:final_level instead.
   */
  async _advanceLevel() {
    const next = this.blindSchedule.advance();
    if (!next) {
      // Already at the final level — just notify
      this.io.to(this.tableId).emit('tournament:final_level', {
        level: this.blindSchedule.getCurrentLevel(),
      });
      return;
    }

    // Apply new blinds to the game engine
    this.gm.setBlindLevels(next.sb, next.bb);

    this.io.to(this.tableId).emit('tournament:blind_up', next);

    // Restart the timer for the new level
    this._startLevelTimer();
  }

  /**
   * Called after every hand completes.
   * 1. Detect newly eliminated players (stack <= 0).
   * 2. Check if tournament is over (≤ 1 active player).
   * 3. Otherwise delegate to AutoController to auto-deal the next hand.
   */
  async onHandComplete(handResult) {
    const state = this.gm.getState ? this.gm.getState() : {};
    const allSeated = state.seated ?? state.players ?? [];

    // Eliminate anyone who busted out
    const bustOuts = allSeated.filter(p => (p.stack ?? 0) <= 0);
    for (const p of bustOuts) {
      await this._eliminatePlayer(p.id, p.stack ?? 0);
    }

    // Re-read state after eliminations (setPlayerInHand mutates state by reference)
    const freshState = this.gm.getState ? this.gm.getState() : {};
    const activePlayers = (freshState.seated ?? freshState.players ?? [])
      .filter(p => (p.stack ?? 0) > 0 && p.in_hand !== false);

    if (activePlayers.length <= 1) {
      const winnerId = activePlayers[0]?.id ?? null;
      await this._endTournament(winnerId);
      return;
    }

    // Keep playing — AutoController handles the 2-second delay + startGame
    await super.onHandComplete(handResult);
  }

  /**
   * Record a player elimination, emit the event, and mark them out of future hands.
   */
  async _eliminatePlayer(playerId, chipsAtElimination) {
    const state = this.gm.getState ? this.gm.getState() : {};
    const activeBefore = (state.seated ?? state.players ?? [])
      .filter(p => (p.stack ?? 0) > 0 && p.id !== playerId);
    // Position = number of still-active players + 1 (e.g. last survivor = 1, 2nd-to-last = 2…)
    const position = activeBefore.length + 1;

    try {
      await TournamentRepository.recordElimination({
        tableId:          this.tableId,
        playerId,
        position,
        chipsAtElimination,
      });
    } catch (err) {
      // Non-fatal — DB error shouldn't crash the game
      this.io.to(this.tableId).emit('notification', {
        type:    'warning',
        message: `Could not save elimination record: ${err.message}`,
      });
    }

    this.io.to(this.tableId).emit('tournament:elimination', {
      playerId,
      position,
      playerCount: activeBefore.length,
    });

    // Sit the player out of future hands
    this.gm.setPlayerInHand(playerId, false);
  }

  /**
   * End the tournament: record the winner, close the table, emit final standings.
   */
  async _endTournament(winnerId) {
    clearTimeout(this.levelTimer);
    this.levelTimer = null;

    if (winnerId) {
      const state = this.gm.getState ? this.gm.getState() : {};
      const winner = (state.seated ?? state.players ?? []).find(p => p.id === winnerId);
      const winnerChips = winner?.stack ?? 0;

      try {
        await TournamentRepository.recordElimination({
          tableId:          this.tableId,
          playerId:         winnerId,
          position:         1,
          chipsAtElimination: winnerChips,
        });
      } catch (err) {
        this.io.to(this.tableId).emit('notification', {
          type:    'warning',
          message: `Could not save winner record: ${err.message}`,
        });
      }
    }

    try {
      await TableRepository.closeTable(this.tableId);
    } catch (err) {
      this.io.to(this.tableId).emit('notification', {
        type:    'warning',
        message: `Could not close table: ${err.message}`,
      });
    }

    let standings = [];
    try {
      standings = await TournamentRepository.getStandings(this.tableId);
    } catch (_) {
      // Non-fatal
    }

    this.io.to(this.tableId).emit('tournament:ended', { winnerId, standings });
  }

  /**
   * Clean up level timer when the controller is destroyed.
   */
  destroy() {
    clearTimeout(this.levelTimer);
    this.levelTimer = null;
    super.destroy();
  }
}

module.exports = { TournamentController };
