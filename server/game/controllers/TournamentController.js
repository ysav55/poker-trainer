'use strict';

const { AutoController }       = require('./AutoController');
const { BlindSchedule }        = require('./BlindSchedule');
const { TournamentRepository } = require('../../db/repositories/TournamentRepository');
const { TableRepository }      = require('../../db/repositories/TableRepository');

// Role rank for steal validation — higher rank can steal from lower.
// referee rank removed: referees are now per-resource delegates (tournament_referees table),
// not a global role. Management steal is restricted to coach/admin/superadmin.
const ROLE_RANK = { superadmin: 3, admin: 2, coach: 1 };

class TournamentController extends AutoController {
  constructor(tableId, gm, io, config = null) {
    super(tableId, gm, io);
    this.config       = config;
    this.blindSchedule = config ? new BlindSchedule(config.blind_schedule) : null;
    this.levelTimer   = null;
    this.entrantCount  = 0;
    this.reentryCount  = 0;
    this.addonCount    = 0;
    this.resolvedPayoutStructure = null; // set from config at start
    this.groupId        = null;
    this.startedAt      = null;
    this.lateRegMinutes = 0;
    this.lateRegTimer   = null;
    this.lateRegOpen    = false;
    this.addonOpen         = false;
    this.addonDeadlineLevel = 0;

    // ── Management state (in-memory) ──────────────────────────────────────────
    this.managedBy            = null; // stableId of active manager
    this.managerName          = null; // display name for broadcast
    this.managerRole          = null; // role string for rank comparison
    this.managerDisconnectTimer = null; // 10s grace timer handle

    // ── Pause state ───────────────────────────────────────────────────────────
    this.paused                 = false;
    this.pausedLevelRemainingMs = null; // saved level-timer remainder during pause

    // ── Visibility / overlay (in-memory display state) ────────────────────────
    this.managerHandVisible    = true;  // manager sees all hole cards
    this.spectatorHandVisible  = false; // spectators see all hole cards
    this.icmOverlayEnabled     = false;
  }

  // ── Management API ───────────────────────────────────────────────────────────

  /**
   * Attempt to claim management of this tournament.
   * Returns true if claim was granted, false if already managed.
   */
  claimManagement(stableId, name, role) {
    if (this.managedBy && this.managedBy !== stableId) return false;
    this._setManager(stableId, name, role);
    return true;
  }

  /**
   * Release management. Only the current manager can release.
   * `force` bypasses the ownership check (used by disconnect timer).
   */
  releaseManagement(stableId, { force = false } = {}) {
    if (!force && this.managedBy !== stableId) return false;
    clearTimeout(this.managerDisconnectTimer);
    this.managerDisconnectTimer = null;
    this._setManager(null, null, null);
    return true;
  }

  /**
   * Returns true if `challengerRole` outranks the current manager role.
   */
  canSteal(challengerRole) {
    if (!this.managedBy) return true; // orphaned — no steal needed, claim it
    const challenger = ROLE_RANK[challengerRole] ?? 0;
    const current    = ROLE_RANK[this.managerRole] ?? 0;
    return challenger > current;
  }

  /** Force-set the manager and broadcast to the room. */
  _setManager(stableId, name, role) {
    this.managedBy   = stableId;
    this.managerName = name;
    this.managerRole = role;
    this.io.to(this.tableId).emit('tournament:manager_changed', {
      managedBy:   stableId,
      managerName: name,
    });
  }

  /**
   * Handle manager socket disconnect: start 10s grace window.
   * Eligible users in the room see a countdown; if the manager doesn't
   * reconnect within 10s the claim is released.
   */
  onManagerDisconnect(stableId, name) {
    if (this.managedBy !== stableId) return;
    const expiresAt = Date.now() + 10_000;
    this.io.to(this.tableId).emit('tournament:manager_disconnected', {
      managedBy:   stableId,
      managerName: name,
      expiresAt,
    });
    clearTimeout(this.managerDisconnectTimer);
    this.managerDisconnectTimer = setTimeout(() => {
      // Only release if still the same manager (didn't reconnect)
      if (this.managedBy === stableId) {
        this._setManager(null, null, null);
      }
    }, 10_000);
  }

  /**
   * Called when the manager's socket reconnects within the grace window.
   * Cancels the release timer and re-grants management.
   */
  onManagerReconnect(stableId, name, role) {
    if (this.managedBy !== stableId) return;
    clearTimeout(this.managerDisconnectTimer);
    this.managerDisconnectTimer = null;
    // Re-broadcast so all clients know management is active again
    this._setManager(stableId, name, role);
  }

  // ── Pause / Resume ───────────────────────────────────────────────────────────

  /**
   * Pause the tournament: freeze the level timer and block new hands.
   * Returns false if already paused.
   */
  pause() {
    if (this.paused) return false;
    this.paused = true;

    // Save remaining level time before cancelling the timer
    this.pausedLevelRemainingMs = this.blindSchedule?.getTimeRemainingMs() ?? null;
    clearTimeout(this.levelTimer);
    this.levelTimer = null;

    // Pause the game engine so it won't start a new hand
    this.gm.state.paused = true;

    this.io.to(this.tableId).emit('tournament:paused', {
      pausedLevelRemainingMs: this.pausedLevelRemainingMs,
    });
    return true;
  }

  /**
   * Resume the tournament: restart the level timer with the saved remainder.
   * Returns false if not paused.
   */
  resume() {
    if (!this.paused) return false;
    this.paused = false;
    this.gm.state.paused = false;

    const remainingMs = this.pausedLevelRemainingMs;
    this.pausedLevelRemainingMs = null;

    if (remainingMs !== null && remainingMs > 0) {
      const level = this.blindSchedule?.getCurrentLevel();
      if (level) {
        // Adjust levelStartTime so getTimeRemainingMs() stays accurate going forward
        if (this.blindSchedule) {
          this.blindSchedule.levelStartTime = Date.now() - (level.duration_minutes * 60_000 - remainingMs);
        }
        this.io.to(this.tableId).emit('tournament:time_remaining', {
          level: level.level,
          remainingMs,
        });
        this.levelTimer = setTimeout(() => {
          this._advanceLevel().catch(() => {});
        }, remainingMs);
      }
    }

    this.io.to(this.tableId).emit('tournament:resumed', {});
    return true;
  }

  // ── Manual controls ──────────────────────────────────────────────────────────

  /**
   * Manually eliminate a player by their stableId.
   * Zeroes their stack and runs the standard elimination flow.
   */
  async eliminatePlayerManual(targetStableId) {
    const state = this.gm.getState ? this.gm.getState() : {};
    const player = (state.seated ?? state.players ?? [])
      .find(p => p.stable_id === targetStableId || p.stableId === targetStableId);

    if (!player) return { success: false, reason: 'Player not found' };
    if ((player.stack ?? 0) <= 0) return { success: false, reason: 'Player already eliminated' };

    const stackToRemove = player.stack ?? 0;
    if (typeof this.gm.adjustStack === 'function') {
      this.gm.adjustStack(player.id, -stackToRemove);
    }

    await this._eliminatePlayer(player.id, stackToRemove);
    return { success: true };
  }

  // ── Hand visibility + ICM overlay (in-memory display state) ─────────────────

  /**
   * Toggle what hole cards are visible.
   * type: 'manager' | 'spectator'
   */
  setHandVisibility(type, value) {
    if (type === 'manager') {
      this.managerHandVisible = !!value;
    } else if (type === 'spectator') {
      this.spectatorHandVisible = !!value;
    } else {
      return;
    }
    this.io.to(this.tableId).emit('tournament:hand_visibility_changed', {
      managerHandVisible:   this.managerHandVisible,
      spectatorHandVisible: this.spectatorHandVisible,
    });
  }

  /**
   * Toggle the live ICM equity overlay in the tournament info panel.
   */
  setIcmOverlay(value) {
    this.icmOverlayEnabled = !!value;
    this.io.to(this.tableId).emit('tournament:icm_overlay_changed', {
      enabled: this.icmOverlayEnabled,
    });
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

    this.entrantCount = (this.gm.getState?.() ?? this.gm.state)?.players?.length ?? 0;
    this.resolvedPayoutStructure = config.payout_structure ?? null;

    this.startedAt = Date.now();
    this.lateRegMinutes = config.late_reg_minutes ?? 0;

    if (this.lateRegMinutes > 0) {
      this.lateRegOpen = true;
      this.io.to(this.tableId).emit('tournament:late_reg_open', {
        endsAt: this.startedAt + this.lateRegMinutes * 60_000,
      });
      this.lateRegTimer = setTimeout(() => {
        this.lateRegOpen = false;
        this.io.to(this.tableId).emit('tournament:late_reg_closed', {});
      }, this.lateRegMinutes * 60_000);
    }

    this.addonDeadlineLevel = config.addon_deadline_level ?? 0;
    if (config.addon_allowed && this.addonDeadlineLevel > 0) {
      this.addonOpen = true;
      this.io.to(this.tableId).emit('tournament:addon_open', {
        deadlineLevel: this.addonDeadlineLevel,
        addonStack:    config.addon_stack ?? config.starting_stack ?? 10000,
      });
    }

    this._startLevelTimer();
    await this.gm.startGame();
  }

  /**
   * Emit time-remaining for the current level and schedule the auto-advance.
   */
  _startLevelTimer() {
    if (this.groupId) return; // level timer managed by group controller
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

    // Close add-on window if we've passed the deadline level
    if (this.addonOpen && this.addonDeadlineLevel > 0 && next.level > this.addonDeadlineLevel) {
      this.addonOpen = false;
      this.io.to(this.tableId).emit('tournament:addon_closed', {});
    }

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
      if (this.groupId) {
        // Table finished but tournament continues at other tables in the group
        // The group controller tracks the overall winner
        return;
      }
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

    // Live ICM overlay
    if (this.config && (this.config.show_icm_overlay || this.config.payout_method === 'icm') && this.resolvedPayoutStructure) {
      const state = this.gm.getState ? this.gm.getState() : {};
      const activePlayers = (state.seated ?? state.players ?? [])
        .filter(p => (p.stack ?? 0) > 0 && p.in_hand !== false)
        .map(p => ({ playerId: p.id, chips: p.stack ?? 0 }));
      const totalPool = this.entrantCount * (this.config.starting_stack ?? 10000);
      try {
        const { computeLiveIcmOverlay } = require('../../services/IcmService');
        const overlay = computeLiveIcmOverlay(activePlayers, this.resolvedPayoutStructure, totalPool);
        this.io.to(this.tableId).emit('tournament:icm_update', { overlay });
      } catch (_) { /* non-fatal */ }
    }

    // Sit the player out of future hands
    this.gm.setPlayerInHand(playerId, false);

    // Notify group controller of cross-table elimination
    if (this.groupId) {
      const { groupControllers } = require('../../state/SharedState');
      const groupCtrl = groupControllers?.get(this.groupId);
      if (groupCtrl) {
        groupCtrl.onPlayerEliminated(this.tableId, playerId, chipsAtElimination).catch(() => {});
      }
    }

    // Offer re-entry if eligible
    if (this.config?.reentry_allowed && this.isLateRegOpen()) {
      const reentryStack = this.config.reentry_stack ?? this.config.starting_stack ?? 10000;
      this.io.to(this.tableId).emit('tournament:reentry_available', {
        playerId,
        reentryStack,
        endsAt: this.startedAt + (this.lateRegMinutes ?? 0) * 60_000,
      });
    }
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

    // Compute and write prizes
    if (this.resolvedPayoutStructure && standings.length > 0) {
      try {
        const { computeIcmPrizes } = require('../../services/IcmService');
        const totalPool = this.entrantCount * (this.config?.starting_stack ?? 10000);

        // Find the matching tier based on entrant count
        const tiers = this.resolvedPayoutStructure; // array of { position, percentage }
        // resolvedPayoutStructure is already the flat [{ position, percentage }] array for this tournament

        if (this.config?.payout_method === 'icm') {
          const activePlayers = standings.map(s => ({
            playerId: s.player_id,
            chips: s.chips_at_elimination ?? 0,
          }));
          const prizes = computeIcmPrizes(activePlayers, tiers, totalPool);
          for (const prize of prizes) {
            await require('../../db/supabase')
              .from('tournament_standings')
              .update({ prize: prize.chips })
              .eq('table_id', this.tableId)
              .eq('player_id', prize.playerId);
          }
        } else {
          // Flat payout: compute 2nd+ first, assign remainder to 1st
          const sorted = [...tiers].sort((a, b) => a.position - b.position);
          const prizes = sorted.map(p => ({
            position: p.position,
            chips: p.position === 1 ? 0 : Math.floor(totalPool * p.percentage / 100),
          }));
          const distributed = prizes.filter(p => p.position > 1).reduce((s, p) => s + p.chips, 0);
          const firstPlace = prizes.find(p => p.position === 1);
          if (firstPlace) firstPlace.chips = totalPool - distributed;

          const supabase = require('../../db/supabase');
          for (const prize of prizes) {
            await supabase
              .from('tournament_standings')
              .update({ prize: prize.chips })
              .eq('table_id', this.tableId)
              .eq('finish_position', prize.position);
          }
        }
      } catch (err) {
        this.io.to(this.tableId).emit('notification', {
          type:    'warning',
          message: `Could not compute prizes: ${err.message}`,
        });
      }
    }

    const winnerRow = standings.find(s => s.player_id === winnerId);
    const winnerName = winnerRow?.player_profiles?.display_name ?? winnerRow?.player_id ?? 'Unknown';
    this.io.to(this.tableId).emit('tournament:ended', { winnerId, winnerName, standings });
  }

  /**
   * Handle a re-entry request from a player who has been eliminated.
   */
  async handleReentry(socket) {
    const playerId = socket.data.stableId;
    if (!playerId) {
      socket.emit('tournament:reentry_rejected', { reason: 'Not authenticated' });
      return;
    }

    if (!this.config?.reentry_allowed) {
      socket.emit('tournament:reentry_rejected', { reason: 'Re-entry is not allowed in this tournament' });
      return;
    }

    if (!this.isLateRegOpen()) {
      socket.emit('tournament:reentry_rejected', { reason: 'Late registration window has closed' });
      return;
    }

    // Check re-entry limit
    const supabase = require('../../db/supabase');
    const { data: existingRow } = await supabase
      .from('tournament_reentries')
      .select('reentry_count')
      .eq('table_id', this.tableId)
      .eq('player_id', playerId)
      .maybeSingle();

    const currentCount = existingRow?.reentry_count ?? 0;
    const limit = this.config.reentry_limit ?? 0; // 0 = unlimited

    if (limit > 0 && currentCount >= limit) {
      socket.emit('tournament:reentry_rejected', { reason: `Re-entry limit (${limit}) reached` });
      return;
    }

    // Upsert reentry record
    try {
      await supabase
        .from('tournament_reentries')
        .upsert({
          table_id:      this.tableId,
          player_id:     playerId,
          reentry_count: currentCount + 1,
        }, { onConflict: 'table_id,player_id' });
    } catch (err) {
      socket.emit('tournament:reentry_rejected', { reason: `DB error: ${err.message}` });
      return;
    }

    this.reentryCount++;

    // Re-seat the player: adjust their stack back to re-entry amount
    const reentryStack = this.config.reentry_stack ?? this.config.starting_stack ?? 10000;
    const state = this.gm.getState ? this.gm.getState() : {};
    const playerEntry = (state.seated ?? state.players ?? []).find(p => p.id === socket.id || p.stable_id === playerId);
    if (playerEntry) {
      // Player still seated but with 0 stack — restore it
      const diff = reentryStack - (playerEntry.stack ?? 0);
      if (diff !== 0 && typeof this.gm.adjustStack === 'function') {
        this.gm.adjustStack(playerEntry.id, diff);
      }
      // Re-enable them for future hands
      this.gm.setPlayerInHand(playerEntry.id, true);
    }

    socket.emit('tournament:reentry_confirmed', { reentryStack, reentryNumber: currentCount + 1 });
    this.io.to(this.tableId).emit('notification', {
      type: 'info',
      message: `${socket.data.name ?? 'Player'} has re-entered`,
    });
  }

  /**
   * Handle an add-on request from a player during the add-on window.
   */
  async handleAddon(socket) {
    const playerId = socket.data.stableId;
    if (!playerId) {
      socket.emit('tournament:addon_rejected', { reason: 'Not authenticated' });
      return;
    }

    if (!this.config?.addon_allowed || !this.addonOpen) {
      socket.emit('tournament:addon_rejected', { reason: 'Add-on is not available' });
      return;
    }

    const supabase = require('../../db/supabase');
    // Check if already taken
    const { data: existing } = await supabase
      .from('tournament_addons')
      .select('id')
      .eq('table_id', this.tableId)
      .eq('player_id', playerId)
      .maybeSingle();

    if (existing) {
      socket.emit('tournament:addon_rejected', { reason: 'You have already taken your add-on' });
      return;
    }

    const addonStack = this.config.addon_stack ?? this.config.starting_stack ?? 10000;

    try {
      await supabase
        .from('tournament_addons')
        .insert({ table_id: this.tableId, player_id: playerId, chips_added: addonStack });
    } catch (err) {
      socket.emit('tournament:addon_rejected', { reason: `DB error: ${err.message}` });
      return;
    }

    this.addonCount++;

    // Give chips to the player
    const state = this.gm.getState ? this.gm.getState() : {};
    const playerEntry = (state.seated ?? state.players ?? []).find(p => p.id === socket.id || p.stable_id === playerId);
    if (playerEntry && typeof this.gm.adjustStack === 'function') {
      this.gm.adjustStack(playerEntry.id, addonStack);
    }

    socket.emit('tournament:addon_confirmed', { chipsAdded: addonStack });
    this.io.to(this.tableId).emit('notification', {
      type: 'info',
      message: `${socket.data.name ?? 'Player'} took the add-on (+${addonStack.toLocaleString()} chips)`,
    });
  }

  /**
   * Returns true if late registration is currently open.
   */
  isLateRegOpen() {
    if (!this.lateRegOpen) return false;
    if (this.lateRegMinutes <= 0) return false;
    const elapsed = Date.now() - (this.startedAt ?? 0);
    return elapsed < this.lateRegMinutes * 60_000;
  }

  /**
   * Clean up level timer when the controller is destroyed.
   */
  destroy() {
    clearTimeout(this.lateRegTimer);
    this.lateRegTimer = null;
    clearTimeout(this.levelTimer);
    this.levelTimer = null;
    clearTimeout(this.managerDisconnectTimer);
    this.managerDisconnectTimer = null;
    super.destroy();
  }
}

module.exports = { TournamentController };
