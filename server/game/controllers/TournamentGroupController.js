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

    // Update registration status to busted
    try {
      const { TournamentGroupRepository: Repo } = require('../../db/repositories/TournamentGroupRepository');
      await Repo.updateRegistrationStatus(this.groupId, playerId, 'busted');
    } catch (_) {
      // Non-fatal — registration may not exist (pre-registration tournaments)
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
          this.io.to(tid).emit('tournament_group:final_table', { finalTableId: nonEmptyTables[0] });
        }
      }
    }

    // Check if entire tournament is over
    if (activeCount <= 1) {
      const winnerId = await this._findWinnerId();
      const standings = await this._buildFinalStandings(winnerId);
      await this.distributePrizes(standings);
      return;
    }

    // Trigger rebalancing if any table has ≤ 3 active players
    await this.rebalanceTables();
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

  /**
   * Calculate table count (ceil(n/7)) and assign players round-robin.
   * Creates tables in DB, links them to this group, creates tournament configs,
   * then emits tournament_group:player_assigned to each player's socket.
   */
  async assignPlayersToTables(players, config) {
    const { TableRepository }      = require('../../db/repositories/TableRepository');
    const { TournamentRepository } = require('../../db/repositories/TournamentRepository');
    const supabase                 = require('../../db/supabase');

    const numTables = Math.max(1, Math.ceil(players.length / 7));
    const tableIds  = [];

    for (let i = 0; i < numTables; i++) {
      const tableId = `tournament-group-${this.groupId}-table-${i + 1}`;
      await TableRepository.createTable({
        id:        tableId,
        name:      `${this.config?.name ?? 'Tournament'} — Table ${i + 1}`,
        mode:      'tournament',
        createdBy: this.config?.created_by ?? null,
        config:    { starting_stack: config.startingStack ?? 10000, tournament_group_id: this.groupId },
      });
      await supabase.from('tables').update({ tournament_group_id: this.groupId }).eq('id', tableId);
      await TournamentRepository.createConfig({
        tableId,
        blindSchedule:   config.blindSchedule ?? [],
        startingStack:   config.startingStack  ?? 10000,
        lateRegMinutes:  config.lateRegMinutes ?? 0,
        payoutStructure: config.payoutStructure ?? [],
      });
      tableIds.push(tableId);
    }

    this.tableIds = tableIds;

    // Round-robin seat assignment — emit player_assigned to each player's socket
    const sockets = this.io.sockets.sockets;
    players.forEach((player, idx) => {
      const tableId = tableIds[idx % numTables];

      let socketId = null;
      const { stableIdMap } = require('../../state/SharedState');
      for (const [sid, stableId] of stableIdMap.entries()) {
        if (stableId === player.playerId) { socketId = sid; break; }
      }

      this.io.to(player.playerId).emit('tournament_group:player_assigned', {
        groupId: this.groupId,
        tableId,
        seat:    null,
      });

      if (socketId) {
        const sock = sockets?.get(socketId);
        if (sock) {
          sock.emit('tournament_group:player_assigned', { groupId: this.groupId, tableId, seat: null });
        }
      }
    });

    return tableIds;
  }

  /**
   * Rebalance tables when any table drops to ≤ 3 active players.
   * Moves one player from the largest table to the smallest.
   * Removes empty tables from this.tableIds.
   * Stops when only 1 table remains (final table).
   */
  async rebalanceTables() {
    const { getController } = require('../../state/SharedState');

    if (this.tableIds.length <= 1) return;

    // Build active-player counts per table
    const tableCounts = this.tableIds.map(tableId => {
      const ctrl  = getController(tableId);
      const state = ctrl?.gm?.getState?.() ?? {};
      const active = (state.seated ?? state.players ?? []).filter(p => (p.stack ?? 0) > 0);
      return { tableId, count: active.length, players: active };
    });

    // Remove empty tables
    const emptyTables = tableCounts.filter(t => t.count === 0);
    for (const { tableId } of emptyTables) {
      this.tableIds = this.tableIds.filter(id => id !== tableId);
    }

    if (this.tableIds.length <= 1) return;

    // Re-snapshot after removal
    const activeCounts = this.tableIds.map(tableId => {
      const ctrl  = getController(tableId);
      const state = ctrl?.gm?.getState?.() ?? {};
      const active = (state.seated ?? state.players ?? []).filter(p => (p.stack ?? 0) > 0);
      return { tableId, count: active.length, players: active };
    });

    const underTables = activeCounts.filter(t => t.count <= 3 && t.count > 0);
    if (underTables.length === 0) return;

    const sorted   = [...activeCounts].sort((a, b) => b.count - a.count);
    const largest  = sorted[0];
    const smallest = sorted[sorted.length - 1];

    if (largest.tableId === smallest.tableId) return;

    const playerToMove = largest.players[largest.players.length - 1];
    if (!playerToMove) return;

    const playerId = playerToMove.stable_id ?? playerToMove.id;
    try {
      await this.movePlayer(playerId, largest.tableId, smallest.tableId);

      const { stableIdMap } = require('../../state/SharedState');
      for (const [sid, stableId] of stableIdMap.entries()) {
        if (stableId === playerId) {
          const sock = this.io.sockets.sockets?.get(sid);
          if (sock) {
            sock.emit('tournament_group:rebalance', { newTableId: smallest.tableId, newSeat: null });
          }
          break;
        }
      }
    } catch (err) {
      for (const tableId of this.tableIds) {
        this.io.to(tableId).emit('notification', { type: 'warning', message: `Rebalance failed: ${err.message}` });
      }
    }

    // If largest table is now empty, remove it
    const largestCtrl  = getController(largest.tableId);
    const largestState = largestCtrl?.gm?.getState?.() ?? {};
    const remaining = (largestState.seated ?? largestState.players ?? []).filter(p => (p.stack ?? 0) > 0);
    if (remaining.length === 0) {
      this.tableIds = this.tableIds.filter(id => id !== largest.tableId);
    }
  }

  /**
   * Distribute prizes to top finishers based on payout_structure.
   * prize = totalPool * percentage / 100, rounded down.
   * First place receives any remainder (rounding correction).
   */
  async distributePrizes(finalStandings) {
    const { ChipBankRepository }        = require('../../db/repositories/ChipBankRepository');
    const { TournamentGroupRepository } = require('../../db/repositories/TournamentGroupRepository');

    const group          = await TournamentGroupRepository.getGroup(this.groupId);
    const payoutStructure = group?.payout_structure ?? [];
    const totalPool      = await TournamentGroupRepository.getTotalPrizePool(this.groupId);

    if (totalPool <= 0 || payoutStructure.length === 0) {
      await TournamentGroupRepository.updateStatus(this.groupId, 'finished');
      for (const tableId of this.tableIds) {
        this.io.to(tableId).emit('tournament_group:ended', { groupId: this.groupId, standings: finalStandings });
      }
      return;
    }

    const sorted = [...payoutStructure].sort((a, b) => a.place - b.place);
    const prizes = sorted.map(tier => ({
      place:    tier.place,
      amount:   Math.floor(totalPool * tier.percentage / 100),
      playerId: finalStandings.find(s => s.place === tier.place)?.playerId ?? null,
    }));

    // Give remainder to 1st place (rounding correction)
    const distributed = prizes.reduce((s, p) => s + p.amount, 0);
    const firstPrize  = prizes.find(p => p.place === 1);
    if (firstPrize) firstPrize.amount += (totalPool - distributed);

    for (const prize of prizes) {
      if (!prize.playerId || prize.amount <= 0) continue;
      try {
        const newBalance = await ChipBankRepository.applyTransaction({
          playerId:  prize.playerId,
          amount:    prize.amount,
          type:      'tournament_prize',
          tableId:   null,
          createdBy: null,
          notes:     `Tournament prize — place ${prize.place}`,
        });

        const { stableIdMap } = require('../../state/SharedState');
        for (const [sid, stableId] of stableIdMap.entries()) {
          if (stableId === prize.playerId) {
            const sock = this.io.sockets.sockets?.get(sid);
            if (sock) {
              sock.emit('tournament_group:prize_awarded', { amount: prize.amount, place: prize.place, newBalance });
            }
            break;
          }
        }
      } catch (err) {
        for (const tableId of this.tableIds) {
          this.io.to(tableId).emit('notification', { type: 'warning', message: `Prize credit failed for place ${prize.place}: ${err.message}` });
        }
      }
    }

    await TournamentGroupRepository.updateStatus(this.groupId, 'finished');

    const standings = await TournamentGroupRepository.getStandings(this.groupId);
    for (const tableId of this.tableIds) {
      this.io.to(tableId).emit('tournament_group:ended', { groupId: this.groupId, standings });
    }
  }

  /**
   * Build finalStandings array ordered 1st…nth from DB standings.
   */
  async _buildFinalStandings(winnerId) {
    const standings = await TournamentGroupRepository.getStandings(this.groupId);
    const result = standings
      .filter(s => s.finish_position != null)
      .sort((a, b) => a.finish_position - b.finish_position)
      .map(s => ({ playerId: s.player_id, place: s.finish_position }));

    if (winnerId && !result.find(s => s.place === 1)) {
      result.unshift({ playerId: winnerId, place: 1 });
    }
    return result;
  }

  destroy() {
    clearTimeout(this.levelTimer);
    this.levelTimer = null;
  }
}

module.exports = { TournamentGroupController };
