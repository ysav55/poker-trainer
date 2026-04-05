'use strict';

const { BlindSchedule } = require('./BlindSchedule');
const { TournamentGroupRepository } = require('../../db/repositories/TournamentGroupRepository');

class TournamentGroupController {
  constructor(groupId, io) {
    this.groupId      = groupId;
    this.io           = io;
    this.config       = null;
    this.blindSchedule = null;
    this.levelTimer   = null;
    this.tableIds     = []; // tableIds managed by this group
  }

  getMode() { return 'tournament_group'; }

  /**
   * Start the group: set status running, push initial blind level to all tables,
   * start the shared level timer.
   */
  async start(config, tableIds) {
    this.config   = config;
    this.tableIds = tableIds;
    this.blindSchedule = new BlindSchedule(config.blind_schedule ?? config.shared_config?.blind_schedule ?? []);

    await TournamentGroupRepository.updateStatus(this.groupId, 'running');

    const firstLevel = this.blindSchedule.getCurrentLevel();
    if (firstLevel) {
      this.blindSchedule.levelStartTime = Date.now();
      this._applyBlindLevel(firstLevel);
    }

    this._startLevelTimer();

    // Emit group started
    for (const tableId of this.tableIds) {
      this.io.to(tableId).emit('tournament_group:started', { groupId: this.groupId });
    }
  }

  /**
   * Apply a blind level to all managed tables.
   */
  _applyBlindLevel(level) {
    const { getController } = require('../../state/SharedState');
    for (const tableId of this.tableIds) {
      const ctrl = getController(tableId);
      if (ctrl && typeof ctrl.gm?.setBlindLevels === 'function') {
        ctrl.gm.setBlindLevels(level.sb, level.bb);
      }
    }
  }

  _startLevelTimer() {
    const level = this.blindSchedule?.getCurrentLevel();
    if (!level) return;
    const ms = level.duration_minutes * 60_000;

    // Broadcast time remaining to all tables
    for (const tableId of this.tableIds) {
      this.io.to(tableId).emit('tournament:time_remaining', {
        level:       level.level,
        remainingMs: ms,
      });
    }

    this.levelTimer = setTimeout(() => {
      this._advanceLevel().catch(err => {
        for (const tableId of this.tableIds) {
          this.io.to(tableId).emit('notification', {
            type: 'error',
            message: `Failed to advance blind level: ${err.message}`,
          });
        }
      });
    }, ms);
  }

  async _advanceLevel() {
    const next = this.blindSchedule.advance();
    if (!next) {
      for (const tableId of this.tableIds) {
        this.io.to(tableId).emit('tournament:final_level', {
          level: this.blindSchedule.getCurrentLevel(),
        });
      }
      return;
    }

    this._applyBlindLevel(next);

    for (const tableId of this.tableIds) {
      this.io.to(tableId).emit('tournament:blind_up', next);
      this.io.to(tableId).emit('tournament_group:blind_up', { groupId: this.groupId, level: next });
    }

    this._startLevelTimer();
  }

  /**
   * Called by a member TournamentController when a player is eliminated at the table level.
   * Records cross-group position and checks if the entire group tournament is over.
   */
  async onPlayerEliminated(tableId, playerId, chipsAtElim) {
    // Count active players remaining across all tables
    const activeCount = await this._countActivePlayers();
    const position = activeCount + 1;

    try {
      await TournamentGroupRepository.recordElimination({
        groupId: this.groupId,
        playerId,
        position,
        chipsAtElim,
      });
    } catch (err) {
      // Non-fatal
    }

    // Notify all tables of the elimination
    for (const tid of this.tableIds) {
      this.io.to(tid).emit('tournament:elimination', {
        playerId,
        position,
        playerCount: activeCount,
        tableId,
      });
    }

    // Check if final table reached (one table has all remaining players)
    if (this.tableIds.length > 1) {
      const nonEmptyTables = await this._getNonEmptyTableIds();
      if (nonEmptyTables.length === 1) {
        for (const tid of this.tableIds) {
          this.io.to(tid).emit('tournament_group:final_table', {
            finalTableId: nonEmptyTables[0],
          });
        }
      }
    }

    // Check if entire tournament is over
    if (activeCount <= 1) {
      const winnerId = await this._findWinnerId();
      await this._endGroup(winnerId);
    }
  }

  async _countActivePlayers() {
    const { getController } = require('../../state/SharedState');
    let total = 0;
    for (const tableId of this.tableIds) {
      const ctrl = getController(tableId);
      if (!ctrl) continue;
      const state = ctrl.gm.getState ? ctrl.gm.getState() : {};
      const active = (state.seated ?? state.players ?? []).filter(p => (p.stack ?? 0) > 0 && p.in_hand !== false);
      total += active.length;
    }
    return total;
  }

  async _getNonEmptyTableIds() {
    const { getController } = require('../../state/SharedState');
    return this.tableIds.filter(tableId => {
      const ctrl = getController(tableId);
      if (!ctrl) return false;
      const state = ctrl.gm.getState ? ctrl.gm.getState() : {};
      const active = (state.seated ?? state.players ?? []).filter(p => (p.stack ?? 0) > 0);
      return active.length > 0;
    });
  }

  async _findWinnerId() {
    const { getController } = require('../../state/SharedState');
    for (const tableId of this.tableIds) {
      const ctrl = getController(tableId);
      if (!ctrl) continue;
      const state = ctrl.gm.getState ? ctrl.gm.getState() : {};
      const active = (state.seated ?? state.players ?? []).filter(p => (p.stack ?? 0) > 0);
      if (active.length === 1) return active[0].id ?? null;
    }
    return null;
  }

  async _endGroup(winnerId) {
    clearTimeout(this.levelTimer);
    this.levelTimer = null;

    await TournamentGroupRepository.updateStatus(this.groupId, 'finished');

    const standings = await TournamentGroupRepository.getStandings(this.groupId);
    const winnerRow = standings.find(s => s.player_id === winnerId);
    const winnerName = winnerRow?.player_profiles?.display_name ?? winnerId ?? 'Unknown';

    for (const tableId of this.tableIds) {
      this.io.to(tableId).emit('tournament_group:ended', { groupId: this.groupId, winnerId, winnerName, standings });
    }
  }

  /**
   * Check if any table is under minimum player count and needs balancing.
   */
  async checkBalance() {
    const { getController } = require('../../state/SharedState');
    const minPlayers = this.config?.min_players_per_table ?? 3;
    const underTables = [];

    for (const tableId of this.tableIds) {
      const ctrl = getController(tableId);
      if (!ctrl) continue;
      const state = ctrl.gm.getState ? ctrl.gm.getState() : {};
      const active = (state.seated ?? state.players ?? []).filter(p => (p.stack ?? 0) > 0);
      if (active.length < minPlayers) {
        underTables.push({ tableId, playerCount: active.length });
      }
    }

    if (underTables.length > 0) {
      await TournamentGroupRepository.updateStatus(this.groupId, 'balancing');
      for (const tableId of this.tableIds) {
        this.io.to(tableId).emit('tournament_group:balance_needed', { underTables });
      }
    }

    return underTables;
  }

  /**
   * Move a single player from one table to another.
   * @param {string} playerId — stable UUID of the player
   * @param {string} fromTableId
   * @param {string} toTableId
   */
  async movePlayer(playerId, fromTableId, toTableId) {
    const SharedState = require('../../state/SharedState');
    const fromCtrl = SharedState.getController(fromTableId);
    const toCtrl   = SharedState.getController(toTableId);

    if (!fromCtrl || !toCtrl) throw new Error(`Controller not found for ${fromTableId} or ${toTableId}`);

    // Find player in source table state
    const fromState = fromCtrl.gm.getState ? fromCtrl.gm.getState() : {};
    const allPlayers = fromState.seated ?? fromState.players ?? [];
    const playerEntry = allPlayers.find(p => p.stable_id === playerId || p.id === playerId);
    if (!playerEntry) throw new Error(`Player ${playerId} not found at ${fromTableId}`);

    const stack = playerEntry.stack ?? 0;
    const name  = playerEntry.name  ?? 'Unknown';

    // Find the current socketId for this stable player
    let socketId = null;
    for (const [sid, stableId] of SharedState.stableIdMap.entries()) {
      if (stableId === playerId) { socketId = sid; break; }
    }

    // Remove from source
    if (typeof fromCtrl.gm.removePlayer === 'function') {
      fromCtrl.gm.removePlayer(playerEntry.id);
    }

    // Seat at target — use socketId if found, else playerId as fallback
    const effectiveSocketId = socketId ?? playerId;
    if (typeof toCtrl.gm.addPlayer === 'function') {
      toCtrl.gm.addPlayer(effectiveSocketId, name, false, playerId, stack);
    }

    // Re-enable for next hand at new table
    if (typeof toCtrl.gm.setPlayerInHand === 'function') {
      toCtrl.gm.setPlayerInHand(effectiveSocketId, true);
    }

    // Broadcast updated state to both tables
    const broadcastTableState = (tableId, gm) => {
      const state = gm.getState ? gm.getState() : {};
      this.io.to(tableId).emit('game_state', { ...state, tableId });
    };
    broadcastTableState(fromTableId, fromCtrl.gm);
    broadcastTableState(toTableId,   toCtrl.gm);

    // Notify the moved player
    if (socketId) {
      const sockets = this.io.sockets.sockets;
      const sock = sockets?.get(socketId);
      if (sock) {
        sock.emit('tournament:moved_to_table', {
          newTableId: toTableId,
          tableLabel: `Table ${this.tableIds.indexOf(toTableId) + 1}`,
        });
      }
    }

    this.io.to(fromTableId).emit('notification', {
      type: 'info',
      message: `${name} has been moved to another table`,
    });
  }

  /**
   * Auto-balance: redistribute players from over/under-populated tables.
   * Algorithm: move players from tables with > max to tables with < min,
   * prioritising tables that need the most help.
   */
  async autoBalance() {
    const SharedState = require('../../state/SharedState');
    const max = this.config?.max_players_per_table ?? 9;
    const min = this.config?.min_players_per_table ?? 3;

    // Snapshot current player counts
    const tableData = this.tableIds.map(tableId => {
      const ctrl = SharedState.getController(tableId);
      if (!ctrl) return { tableId, players: [] };
      const state = ctrl.gm.getState ? ctrl.gm.getState() : {};
      const players = (state.seated ?? state.players ?? []).filter(p => (p.stack ?? 0) > 0);
      return { tableId, players };
    });

    // Tables with too few players (donors receive from tables with extras)
    const needMore = tableData.filter(t => t.players.length > 0 && t.players.length < min);
    const hasExtra = tableData.filter(t => t.players.length > max);

    const moves = [];

    // Move from over-populated to under-populated
    for (const source of hasExtra) {
      for (const target of needMore) {
        while (source.players.length > max && target.players.length < min) {
          const player = source.players.pop();
          target.players.push(player);
          moves.push({ playerId: player.stable_id ?? player.id, fromTableId: source.tableId, toTableId: target.tableId });
        }
      }
    }

    // Execute moves sequentially (300ms apart for animation effect)
    for (const move of moves) {
      try {
        await this.movePlayer(move.playerId, move.fromTableId, move.toTableId);
      } catch (err) {
        this.io.to(this.tableIds[0]).emit('notification', {
          type: 'warning',
          message: `Could not move player: ${err.message}`,
        });
      }
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    return moves;
  }

  destroy() {
    clearTimeout(this.levelTimer);
    this.levelTimer = null;
  }
}

module.exports = { TournamentGroupController };
