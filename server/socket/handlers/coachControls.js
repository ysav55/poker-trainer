'use strict';

const SharedState = require('../../state/SharedState.js');

async function handleApplyBlindsAtNextHand(socket, payload, ack) {
  const { requireCoach } = require('../../auth/socketGuards.js');

  if (requireCoach(socket, 'apply blinds at next hand')) {
    return ack?.({ error: 'coach_only' });
  }
  const { tableId, sb, bb } = payload || {};
  if (!tableId) return ack?.({ error: 'invalid_table' });
  if (!Number.isInteger(sb) || !Number.isInteger(bb) || sb <= 0 || bb <= 0 || sb >= bb) {
    return ack?.({ error: 'invalid_blinds' });
  }
  SharedState.pendingBlinds.set(tableId, {
    sb, bb,
    queuedBy: socket.data.stableId ?? socket.data.userId,
    queuedAt: Date.now(),
  });
  // Broadcast to room so other clients update their banner
  socket.to(tableId).emit('pending_blinds_updated', { sb, bb });
  socket.emit('pending_blinds_updated', { sb, bb });
  return ack?.({ ok: true });
}

async function handleDiscardPendingBlinds(socket, payload, ack) {
  const { requireCoach } = require('../../auth/socketGuards.js');

  if (requireCoach(socket, 'discard pending blinds')) {
    return ack?.({ error: 'coach_only' });
  }
  const { tableId } = payload || {};
  if (!tableId) return ack?.({ error: 'invalid_table' });
  SharedState.pendingBlinds.delete(tableId);
  socket.to(tableId).emit('pending_blinds_updated', null);
  socket.emit('pending_blinds_updated', null);
  return ack?.({ ok: true });
}

module.exports = function registerCoachControls(socket, ctx) {
  const { tables, activeHands, stableIdMap, io,
          broadcastState, sendError, sendSyncError, startActionTimer, clearActionTimer,
          equityCache, equitySettings, emitEquityUpdate,
          requireCoach, HandLogger, log } = ctx;

  socket.on('manual_deal_card', ({ targetType, targetId, position, card } = {}) => {
    if (requireCoach(socket, 'deal cards manually')) return;
    const gm = tables.get(socket.data.tableId);
    if (!gm) return sendError(socket, 'Not in a room');
    const result = gm.manualDealCard(targetType, targetId, position, card);
    if (result.error) return sendError(socket, result.error);
    const targetName = targetType === 'board'
      ? 'the board'
      : gm.state.players.find(p => p.id === targetId)?.name || targetId;
    broadcastState(socket.data.tableId, {
      type: 'manual_card',
      message: `Coach dealt ${card} to ${targetName}`
    });
  });

  socket.on('undo_action', () => {
    if (requireCoach(socket, 'undo')) return;
    const gm = tables.get(socket.data.tableId);
    if (!gm) return sendError(socket, 'Not in a room');
    if (gm.state.phase === 'waiting') return sendSyncError(socket, 'Nothing to undo between hands');
    const result = gm.undoAction();
    if (result.error) return sendSyncError(socket, result.error);
    broadcastState(socket.data.tableId, { type: 'undo', message: 'Coach undid the last action' });
    const undoHandInfo = activeHands.get(socket.data.tableId);
    if (undoHandInfo) {
      HandLogger.markLastActionReverted(undoHandInfo.handId).catch(err =>
        log.error('db', 'undo_revert_failed', '[HandLogger] markLastActionReverted', { err, tableId: socket.data.tableId }));
    }
  });

  socket.on('rollback_street', () => {
    if (requireCoach(socket, 'roll back a street')) return;
    const gm = tables.get(socket.data.tableId);
    if (!gm) return sendError(socket, 'Not in a room');
    const result = gm.rollbackStreet();
    if (result.error) {
      sendSyncError(socket, result.error);
      broadcastState(socket.data.tableId);
      return;
    }
    const tableId = socket.data.tableId;
    broadcastState(tableId, { type: 'rollback', message: 'Coach rolled back to the previous street' });
    emitEquityUpdate(tableId);
  });

  socket.on('set_player_in_hand', ({ playerId, inHand } = {}) => {
    if (requireCoach(socket, 'change in-hand status')) return;
    if (!playerId || typeof playerId !== 'string' || !playerId.trim()) return sendError(socket, 'playerId is required');
    if (typeof inHand !== 'boolean') return sendError(socket, 'inHand must be a boolean');
    const tableId = socket.data.tableId;
    const gm = tables.get(tableId);
    if (!gm) return sendError(socket, 'Not in a room');
    const result = gm.setPlayerInHand(playerId, inHand);
    if (result.error) return sendError(socket, result.error);
    broadcastState(tableId);
  });

  socket.on('toggle_pause', () => {
    if (!socket.data.isCoach) {
      return sendSyncError(socket, 'Only the coach can pause');
    }
    const gm = tables.get(socket.data.tableId);
    if (!gm) return sendError(socket, 'Not in a room');
    const tableId = socket.data.tableId;
    const result = gm.togglePause();
    if (result.paused) {
      clearActionTimer(tableId, { saving: true });
    } else {
      startActionTimer(tableId, { resumeRemaining: true });
    }
    broadcastState(tableId, {
      type: result.paused ? 'pause' : 'resume',
      message: result.paused ? 'Coach paused the game' : 'Coach resumed the game'
    });
  });

  socket.on('set_blind_levels', ({ sb, bb } = {}) => {
    if (requireCoach(socket, 'change blind levels')) return;
    const sbN = Number(sb), bbN = Number(bb);
    if (!Number.isFinite(sbN) || !Number.isInteger(sbN) || sbN <= 0) return sendSyncError(socket, 'Invalid blind levels: sb must be a positive integer');
    if (!Number.isFinite(bbN) || !Number.isInteger(bbN) || bbN <= sbN) return sendSyncError(socket, 'Invalid blind levels: bb must be a positive integer greater than sb');
    const gm = tables.get(socket.data.tableId);
    if (!gm) return sendError(socket, 'Not in a room');
    const result = gm.setBlindLevels(sbN, bbN);
    if (result.error) return sendSyncError(socket, result.error);
    broadcastState(socket.data.tableId, { type: 'blind_change', message: `Blinds set to ${sbN}/${bbN}` });
  });

  socket.on('set_mode', ({ mode } = {}) => {
    if (requireCoach(socket, 'set mode')) return;
    const gm = tables.get(socket.data.tableId);
    if (!gm) return sendError(socket, 'Not in a room');
    const ACTIVE_PHASES = new Set(['preflop', 'flop', 'turn', 'river', 'showdown', 'replay']);
    if (ACTIVE_PHASES.has(gm.state.phase)) return sendSyncError(socket, 'Cannot change mode during an active hand');
    const result = gm.setMode(mode);
    if (result.error) return sendSyncError(socket, result.error);
    broadcastState(socket.data.tableId, { type: 'mode_change', message: `Mode switched to ${mode.toUpperCase()}` });
  });

  socket.on('force_next_street', () => {
    if (requireCoach(socket, 'force a street')) return;
    const gm = tables.get(socket.data.tableId);
    if (!gm) return sendError(socket, 'Not in a room');
    const result = gm.forceNextStreet();
    if (result.error) return sendError(socket, result.error);
    const tableId = socket.data.tableId;
    broadcastState(tableId, { type: 'street_advance', message: `Coach advanced to ${gm.state.phase}` });
    emitEquityUpdate(tableId);
    const freshState = gm.getPublicState(socket.id, socket.data.isCoach);
    if (freshState.phase === 'showdown' && freshState.showdown_result) {
      io.to(tableId).emit('showdown_result', freshState.showdown_result);
    }
    startActionTimer(tableId);
  });

  socket.on('award_pot', ({ winnerId } = {}) => {
    if (requireCoach(socket, 'award the pot')) return;
    if (!winnerId || typeof winnerId !== 'string' || !winnerId.trim()) return sendError(socket, 'winnerId is required');
    const gm = tables.get(socket.data.tableId);
    if (!gm) return sendError(socket, 'Not in a room');
    const result = gm.awardPot(winnerId);
    if (result.error) return sendSyncError(socket, result.error);
    const winner = gm.state.players.find(p => p.id === winnerId);
    const tableId = socket.data.tableId;
    broadcastState(tableId, { type: 'pot_awarded', message: `Pot awarded to ${winner?.name}` });
    const freshState = gm.getPublicState(socket.id, socket.data.isCoach);
    if (freshState.phase === 'showdown' && freshState.showdown_result) {
      io.to(tableId).emit('showdown_result', freshState.showdown_result);
    }
    startActionTimer(tableId);
  });

  socket.on('adjust_stack', ({ playerId, amount } = {}) => {
    if (requireCoach(socket, 'adjust stacks')) return;
    if (!playerId || typeof playerId !== 'string' || !playerId.trim()) return sendError(socket, 'playerId is required');
    const amtN = Number(amount);
    if (!Number.isFinite(amtN) || amtN < 0 || !Number.isInteger(amtN)) return sendError(socket, 'amount must be a non-negative integer');
    const gm = tables.get(socket.data.tableId);
    if (!gm) return sendError(socket, 'Not in a room');
    const result = gm.adjustStack(playerId, Number(amount));
    if (result.error) return sendError(socket, result.error);
    const sessionId = gm.state?.session_id;
    const stableId  = stableIdMap.get(playerId) || playerId;
    if (sessionId && stableId && !String(stableId).startsWith('coach_')) {
      HandLogger.logStackAdjustment(sessionId, stableId, Number(amount)).catch(() => {});
    }
    broadcastState(socket.data.tableId);
  });

  // ── Equity visibility toggles ────────────────────────────────────────────

  socket.on('toggle_range_display', () => {
    if (requireCoach(socket, 'toggle range display')) return;
    const tableId = socket.data.tableId;
    const current = equitySettings.get(tableId) || { coach: true, players: false, showToPlayers: false, showRangesToPlayers: false, showHeatmapToPlayers: false };
    const updated = { ...current, showRangesToPlayers: !current.showRangesToPlayers };
    equitySettings.set(tableId, updated);
    io.to(tableId).emit('equity_settings', updated);
  });

  socket.on('toggle_heatmap_display', () => {
    if (requireCoach(socket, 'toggle heatmap display')) return;
    const tableId = socket.data.tableId;
    const current = equitySettings.get(tableId) || { coach: true, players: false, showToPlayers: false, showRangesToPlayers: false, showHeatmapToPlayers: false };
    const updated = { ...current, showHeatmapToPlayers: !current.showHeatmapToPlayers };
    equitySettings.set(tableId, updated);
    io.to(tableId).emit('equity_settings', updated);
  });

  // ── Range sharing ─────────────────────────────────────────────────────────

  socket.on('share_range', ({ handGroups, label } = {}) => {
    if (requireCoach(socket, 'share a range')) return;
    if (!Array.isArray(handGroups)) return sendError(socket, 'handGroups must be an array');
    const tableId = socket.data.tableId;
    io.to(tableId).emit('range_shared', { handGroups, label: label || '', sharedBy: socket.data.name });
  });

  socket.on('clear_shared_range', () => {
    if (requireCoach(socket, 'clear shared range')) return;
    io.to(socket.data.tableId).emit('range_shared', null);
  });

  // ── Coach add-bot (works on coached_cash + uncoached_cash) ──────────────
  socket.on('coach:add_bot', ({ difficulty = 'easy' } = {}) => {
    if (requireCoach(socket, 'add a bot')) return;
    const tableId = socket.data.tableId;
    const gm = tables.get(tableId);
    if (!gm) return sendError(socket, 'Not in a room');
    if (gm.state.players.length >= gm.state.max_players) {
      return sendSyncError(socket, 'Table is full');
    }
    const { spawnBot } = require('../../game/BotConnection');
    const result = spawnBot({
      tableId,
      difficulty,
      onConnectError: (err) => {
        log.error('game', 'coach_add_bot_connect_error',
          `Bot ${result?.name ?? '(unknown)'} failed to connect`, { err, tableId, difficulty });
        socket.emit('notification', {
          type: 'bot_failed',
          message: `Bot failed to connect: ${err?.message || 'unknown error'}`,
        });
      },
    });
    if (result.error) return sendError(socket, result.error);
    log.info('game', 'coach_add_bot', `Coach added bot ${result.name}`, { tableId, difficulty });
    socket.emit('notification', {
      type: 'bot_added',
      message: `Bot ${result.name} joining…`,
    });
    // The bot's join_room flow will broadcast state once it's seated.
  });

  // ── Coach kick player ─────────────────────────────────────────────────
  // Note: 'kicked' is the dedicated kick event (vs the generic 'error' used by
  // joinRoom's duplicate-tab path). Clients can listen for 'kicked' separately
  // to show a friendly toast + navigate to the lobby.
  socket.on('coach:kick_player', ({ playerId } = {}) => {
    if (requireCoach(socket, 'kick a player')) return;
    if (!playerId || typeof playerId !== 'string' || !playerId.trim()) {
      return sendError(socket, 'playerId is required');
    }
    const tableId = socket.data.tableId;
    const gm = tables.get(tableId);
    if (!gm) return sendError(socket, 'Not in a room');
    const player = gm.state.players.find(p => p.id === playerId);
    if (!player) return sendSyncError(socket, 'Player not found at this table');
    if (player.is_coach) return sendSyncError(socket, 'Cannot kick the coach');

    const stack = player.stack ?? 0;
    const stableId = stableIdMap.get(playerId) || playerId;
    const name = player.name || playerId;
    const isBot = player.is_bot === true;

    // If the kicked player is the current actor in a betting round, fold them
    // first so the round advances cleanly via the normal placeBet path. Without
    // this, the action timer's auto-fold lookup fails (player no longer exists)
    // and the round stalls until the next external trigger. See review-pass-1
    // critical issue #1.
    //
    // Paused tables: placeBet refuses with "Game is paused", which would leave
    // current_turn dangling at the removed player. Refuse the kick instead so
    // the coach makes the call to resume first.
    const BETTING_PHASES = new Set(['preflop', 'flop', 'turn', 'river']);
    if (gm.state.current_turn === playerId && BETTING_PHASES.has(gm.state.phase)) {
      if (gm.state.paused) {
        return sendSyncError(socket, 'Resume the game before kicking the active actor');
      }
      clearActionTimer(tableId);
      const foldResult = gm.placeBet(playerId, 'fold');
      if (foldResult.error) {
        log.error('game', 'kick_pre_fold_failed',
          `[coachControls] pre-kick fold failed for ${name}`,
          { err: foldResult.error, tableId, playerId });
        // Continue with removal anyway — better stall recovery than nothing.
      } else {
        // Re-arm the timer for whoever is now on the clock (if any).
        startActionTimer(tableId);
      }
    }

    // Cash out remaining chips before removal so the coach-initiated kick
    // mirrors the natural-disconnect flow but skips the 60s reconnect window.
    // Bots have UUID stableIds but no chip bank — skip them explicitly.
    if (stack > 0 && !player.is_coach && !isBot && !String(stableId).startsWith('coach_')) {
      const ChipBankRepo = require('../../db/repositories/ChipBankRepository');
      ChipBankRepo.cashOut(stableId, stack, tableId).catch(err =>
        log.error('db', 'kick_cash_out_failed', `[coachControls] cashOut failed for kicked ${name}`, { err, tableId, stableId }));
    }

    gm.removePlayer(playerId);
    stableIdMap.delete(playerId);

    // Notify the kicked client and force their socket out of the room. They'll
    // receive 'kicked' and the lobby route will clear their table state.
    const targetSocket = io.sockets.sockets.get(playerId);
    if (targetSocket) {
      targetSocket.emit('kicked', { tableId, by: socket.data.name || 'Coach' });
      try { targetSocket.disconnect(true); } catch { /* ignore */ }
    }

    io.to(tableId).emit('notification', {
      type: 'player_kicked',
      message: `${name} was removed from the table`,
    });
    broadcastState(tableId, { type: 'player_kicked', message: `${name} kicked` });
    log.info('game', 'coach_kick_player', `Coach kicked ${name}`, { tableId, playerId, stableId, isBot });
  });

  // transfer_controller — current coach hands table control to another player
  socket.on('transfer_controller', async ({ toPlayerId } = {}) => {
    if (requireCoach(socket, 'transfer controller')) return;
    if (!toPlayerId || typeof toPlayerId !== 'string') {
      return sendError(socket, 'toPlayerId is required');
    }
    const tableId = socket.data.tableId;
    const gm = tables.get(tableId);
    if (!gm) return sendError(socket, 'Not in a room');

    const { TableRepository } = require('../../db/repositories/TableRepository');
    await TableRepository.setController(tableId, toPlayerId).catch(err =>
      log.error('db', 'set_controller_failed', '[coachControls] setController', { err, tableId })
    );

    io.to(tableId).emit('controller_transferred', {
      toPlayerId,
      byPlayerId: socket.data.stableId,
      byName:     socket.data.name,
    });
    log.info('game', 'controller_transfer', `controller transferred to ${toPlayerId}`, { tableId, by: socket.data.stableId });
  });

  // coach:apply_blinds_at_next_hand — queue a blind delta for application at next hand
  socket.on('coach:apply_blinds_at_next_hand', (payload, ack) =>
    handleApplyBlindsAtNextHand(socket, payload, ack)
  );

  // coach:discard_pending_blinds — cancel the queued blind delta
  socket.on('coach:discard_pending_blinds', (payload, ack) =>
    handleDiscardPendingBlinds(socket, payload, ack)
  );

  // ── Equity visibility per-audience ────────────────────────────────────────

  socket.on('coach:set_coach_equity_visible', (payload, ack) => {
    if (requireCoach(socket, 'set coach equity visibility')) {
      return ack?.({ error: 'coach_only' });
    }
    const { tableId, visible } = payload || {};
    if (!tableId || typeof visible !== 'boolean') {
      return ack?.({ error: 'invalid_payload' });
    }
    const tableIdStr = String(tableId);
    const current = equitySettings.get(tableIdStr) || { coach: true, players: false, showToPlayers: false, showRangesToPlayers: false, showHeatmapToPlayers: false };
    const updated = { ...current, coach: visible };
    equitySettings.set(tableIdStr, updated);
    // Broadcast equity update so clients see new coach visibility state
    emitEquityUpdate(tableIdStr);
    return ack?.({ ok: true });
  });

  socket.on('coach:set_players_equity_visible', (payload, ack) => {
    if (requireCoach(socket, 'set players equity visibility')) {
      return ack?.({ error: 'coach_only' });
    }
    const { tableId, visible } = payload || {};
    if (!tableId || typeof visible !== 'boolean') {
      return ack?.({ error: 'invalid_payload' });
    }
    const tableIdStr = String(tableId);
    const current = equitySettings.get(tableIdStr) || { coach: true, players: false, showToPlayers: false, showRangesToPlayers: false, showHeatmapToPlayers: false };
    const updated = { ...current, coach: current.coach ?? true, players: visible, showToPlayers: visible };
    equitySettings.set(tableIdStr, updated);
    // Broadcast equity update so clients see new players visibility state
    emitEquityUpdate(tableIdStr);
    return ack?.({ ok: true });
  });
};

module.exports.handleApplyBlindsAtNextHand = handleApplyBlindsAtNextHand;
module.exports.handleDiscardPendingBlinds = handleDiscardPendingBlinds;
