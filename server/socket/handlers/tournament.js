'use strict';

const bcrypt = require('bcrypt');

/**
 * Tournament socket event handlers.
 *
 * Registered events:
 *   tournament:claim_management   — claim manager seat on orphaned tournament
 *   tournament:release_management — intentionally release manager seat
 *   tournament:steal_management   — steal manager seat with password (rank check)
 *   tournament:move_player        — move a player between tables (MTT)
 *   tournament:request_reentry    — re-entry after elimination
 *   tournament:request_addon      — take an add-on
 */

module.exports = function registerTournamentHandlers(socket, ctx) {
  const { tables, io, requireCoach, sendError } = ctx;

  // ── Helper to get tournament controller for socket's current table ───────────
  function getTournamentCtrl() {
    const tableId = socket.data.tableId;
    if (!tableId) return null;
    const { getController } = require('../../state/SharedState');
    const ctrl = getController(tableId);
    return (ctrl && ctrl.getMode?.() === 'tournament') ? ctrl : null;
  }

  // ── tournament:claim_management ──────────────────────────────────────────────
  // Claim an orphaned tournament. Fails if already managed by someone else.
  socket.on('tournament:claim_management', () => {
    const ctrl = getTournamentCtrl();
    if (!ctrl) return sendError(socket, 'Not a tournament table');
    if (!socket.data.authenticated) return socket.emit('error', { message: 'Unauthorized' });

    const sid  = socket.data.stableId;
    const role = socket.data.role ?? null;
    const name = socket.data.name ?? 'Unknown';

    const granted = ctrl.claimManagement(sid, name, role);
    if (granted) {
      socket.data.isManager = true;
      socket.emit('tournament:claim_result', { granted: true });
    } else {
      socket.emit('tournament:claim_result', {
        granted:     false,
        managedBy:   ctrl.managedBy,
        managerName: ctrl.managerName,
      });
    }
  });

  // ── tournament:release_management ────────────────────────────────────────────
  // Intentionally release management (e.g. manager clicks "Leave").
  socket.on('tournament:release_management', () => {
    const ctrl = getTournamentCtrl();
    if (!ctrl) return;
    const sid = socket.data.stableId;
    ctrl.releaseManagement(sid);
    socket.data.isManager = false;
  });

  // ── tournament:steal_management ──────────────────────────────────────────────
  // Steal management from a lower-ranked manager.
  // Payload: { password }
  // Server verifies challenger's own password + rank > current manager rank.
  socket.on('tournament:steal_management', async ({ password } = {}) => {
    if (!password || typeof password !== 'string') {
      return socket.emit('tournament:steal_result', { granted: false, reason: 'Password required' });
    }

    const ctrl = getTournamentCtrl();
    if (!ctrl) return socket.emit('tournament:steal_result', { granted: false, reason: 'Not a tournament table' });
    if (!socket.data.authenticated) return socket.emit('tournament:steal_result', { granted: false, reason: 'Unauthorized' });

    const sid  = socket.data.stableId;
    const role = socket.data.role ?? null;
    const name = socket.data.name ?? 'Unknown';

    // Rank check
    if (!ctrl.canSteal(role)) {
      return socket.emit('tournament:steal_result', {
        granted: false,
        reason:  `Your role (${role}) cannot override the current manager (${ctrl.managerRole})`,
      });
    }

    // Password verification — load challenger's hash from DB
    try {
      const supabase = require('../../db/supabase');
      const { data: player } = await supabase
        .from('player_profiles')
        .select('password_hash')
        .eq('id', sid)
        .maybeSingle();

      if (!player?.password_hash) {
        return socket.emit('tournament:steal_result', { granted: false, reason: 'Account not found' });
      }

      const valid = await bcrypt.compare(password, player.password_hash);
      if (!valid) {
        return socket.emit('tournament:steal_result', { granted: false, reason: 'Incorrect password' });
      }
    } catch (err) {
      return socket.emit('tournament:steal_result', { granted: false, reason: 'Verification failed' });
    }

    // Notify the previous manager before transferring
    if (ctrl.managedBy && ctrl.managedBy !== sid) {
      io.to(socket.data.tableId).emit('notification', {
        type:    'warning',
        message: `Management was taken over by ${name}`,
      });
    }

    // Force-claim
    ctrl._setManager(sid, name, role);
    socket.data.isManager = true;
    socket.emit('tournament:steal_result', { granted: true });
  });

  /**
   * tournament:move_player
   *
   * Payload: { fromTableId, toTableId, playerId }
   *
   * Moves a seated player from one tournament table's game state to another.
   * The player keeps their current chip stack.
   * Emits 'game_state' to both tables after the move.
   */
  socket.on('tournament:move_player', async (payload) => {
    if (requireCoach(socket, 'move tournament players')) return;

    const { fromTableId, toTableId, playerId } = payload ?? {};
    if (!fromTableId || !toTableId || !playerId) {
      return sendError(socket, 'tournament:move_player requires fromTableId, toTableId, playerId');
    }
    if (fromTableId === toTableId) {
      return sendError(socket, 'fromTableId and toTableId must be different');
    }

    const fromGm = tables.get(fromTableId);
    const toGm   = tables.get(toTableId);

    if (!fromGm) return sendError(socket, `Source table ${fromTableId} not found`);
    if (!toGm)   return sendError(socket, `Target table ${toTableId} not found`);

    const fromState = fromGm.getState ? fromGm.getState() : (fromGm.state ?? {});
    const toState   = toGm.getState   ? toGm.getState()   : (toGm.state   ?? {});

    const allFromPlayers = fromState.seated ?? fromState.players ?? [];
    const playerEntry    = allFromPlayers.find(p => p.id === playerId || p.stable_id === playerId);

    if (!playerEntry) {
      return sendError(socket, `Player ${playerId} not found at table ${fromTableId}`);
    }

    const stack = playerEntry.stack ?? 0;
    const name  = playerEntry.name  ?? 'Unknown';

    // Check target table has an available seat
    const toPlayers = toState.seated ?? toState.players ?? [];
    const takenSeats = new Set(toPlayers.map(p => p.seat));
    let targetSeat = -1;
    for (let s = 0; s <= 8; s++) {
      if (!takenSeats.has(s)) { targetSeat = s; break; }
    }
    if (targetSeat === -1) {
      return sendError(socket, `No available seat at table ${toTableId}`);
    }

    // Remove from source table
    if (typeof fromGm.removePlayer === 'function') {
      fromGm.removePlayer(playerId);
    } else {
      // Fallback: mark as disconnected / out of hand so they don't affect the game
      if (typeof fromGm.setPlayerInHand === 'function') fromGm.setPlayerInHand(playerId, false);
    }

    // Seat at target table
    if (typeof toGm.addPlayer === 'function') {
      toGm.addPlayer(playerId, name, false, playerId, stack);
    } else if (typeof toGm.seatPlayer === 'function') {
      toGm.seatPlayer({ id: playerId, name, seat: targetSeat, stack });
    }

    // Broadcast updated state to both tables
    const broadcastTable = (tableId, gm) => {
      const state = gm.getState ? gm.getState() : (gm.state ?? {});
      io.to(tableId).emit('game_state', { ...state, tableId });
    };

    broadcastTable(fromTableId, fromGm);
    broadcastTable(toTableId,   toGm);

    io.to(socket.data.tableId).emit('notification', {
      type:    'info',
      message: `${name} moved from ${fromTableId} to ${toTableId}`,
    });
  });

  // ── tournament:pause ─────────────────────────────────────────────────────────
  socket.on('tournament:pause', () => {
    if (!socket.data.isManager) return socket.emit('error', { message: 'Not the tournament manager' });
    const ctrl = getTournamentCtrl();
    if (!ctrl) return;
    const ok = ctrl.pause();
    socket.emit('tournament:pause_result', { ok });
  });

  // ── tournament:resume ────────────────────────────────────────────────────────
  socket.on('tournament:resume', () => {
    if (!socket.data.isManager) return socket.emit('error', { message: 'Not the tournament manager' });
    const ctrl = getTournamentCtrl();
    if (!ctrl) return;
    const ok = ctrl.resume();
    socket.emit('tournament:resume_result', { ok });
  });

  // ── tournament:eliminate_player ──────────────────────────────────────────────
  // Payload: { stableId }
  socket.on('tournament:eliminate_player', async ({ stableId } = {}) => {
    if (!socket.data.isManager) return socket.emit('error', { message: 'Not the tournament manager' });
    if (!stableId) return socket.emit('error', { message: 'stableId required' });
    const ctrl = getTournamentCtrl();
    if (!ctrl) return;
    const result = await ctrl.eliminatePlayerManual(stableId);
    socket.emit('tournament:eliminate_result', result);
  });

  // ── tournament:set_hand_visibility ───────────────────────────────────────────
  // Payload: { type: 'manager'|'spectator', value: boolean }
  socket.on('tournament:set_hand_visibility', ({ type, value } = {}) => {
    if (!socket.data.isManager) return socket.emit('error', { message: 'Not the tournament manager' });
    const ctrl = getTournamentCtrl();
    if (!ctrl) return;
    ctrl.setHandVisibility(type, value);
  });

  // ── tournament:set_icm_overlay ───────────────────────────────────────────────
  // Payload: { enabled: boolean }
  socket.on('tournament:set_icm_overlay', ({ enabled } = {}) => {
    if (!socket.data.isManager) return socket.emit('error', { message: 'Not the tournament manager' });
    const ctrl = getTournamentCtrl();
    if (!ctrl) return;
    ctrl.setIcmOverlay(enabled);
  });

  // tournament:request_reentry
  socket.on('tournament:request_reentry', async () => {
    const tableId = socket.data.tableId;
    if (!tableId) return sendError(socket, 'Not in a table');

    const { getController } = require('../../state/SharedState');
    const ctrl = getController(tableId);
    if (!ctrl || ctrl.getMode?.() !== 'tournament') {
      return socket.emit('tournament:reentry_rejected', { reason: 'Not a tournament table' });
    }

    try {
      await ctrl.handleReentry(socket);
    } catch (err) {
      socket.emit('tournament:reentry_rejected', { reason: err.message });
    }
  });

  // tournament:request_addon
  socket.on('tournament:request_addon', async () => {
    const tableId = socket.data.tableId;
    if (!tableId) return sendError(socket, 'Not in a table');

    const { getController } = require('../../state/SharedState');
    const ctrl = getController(tableId);
    if (!ctrl || ctrl.getMode?.() !== 'tournament') {
      return socket.emit('tournament:addon_rejected', { reason: 'Not a tournament table' });
    }

    try {
      await ctrl.handleAddon(socket);
    } catch (err) {
      socket.emit('tournament:addon_rejected', { reason: err.message });
    }
  });
};
