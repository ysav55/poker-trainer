'use strict';

module.exports = function registerJoinRoom(socket, ctx) {
  const { tables, stableIdMap, reconnectTimers, ghostStacks, io,
          broadcastState, sendError,
          HandLogger, log } = ctx;

  socket.on('join_room', async ({ name, isSpectator: payloadSpectator = false, tableId = 'main-table' } = {}) => {
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return sendError(socket, 'Name is required');
    }
    const trimmedName = name.trim();

    if (!payloadSpectator) {
      if (!socket.data.authenticated) {
        return sendError(socket, 'Authentication required — please log in');
      }
    }

    let isCoach  = socket.data.isCoach  || false;
    let stableId = socket.data.stableId || '';

    // Lazy-create the table
    if (!tables.has(tableId)) {
      const SessionManager = require('../../game/SessionManager');
      tables.set(tableId, new SessionManager(tableId));
    }
    const gm = tables.get(tableId);

    const resolvedStableId = (stableId && typeof stableId === 'string' && stableId.length > 0)
      ? stableId
      : socket.id;
    stableIdMap.set(socket.id, resolvedStableId);

    // Fetch table mode before deciding coach status.
    // In uncoached_cash and tournament modes every authenticated user is a regular
    // seated player — nobody holds the special coach (dealer-control) role.
    const { TableRepository } = require('../../db/repositories/TableRepository.js');
    const tableRow = await TableRepository.getTable(tableId).catch(() => null);
    const mode = tableRow?.mode ?? 'coached_cash';

    // Upsert table record so it's discoverable via GET /api/tables
    TableRepository.createTable({
      id: tableId,
      name: tableId,  // display name defaults to tableId; coach can rename via PATCH
      mode,
      createdBy: resolvedStableId,
    }).catch(() => {}); // fire-and-forget; ignore if already exists (upsert is idempotent)

    // In non-coached modes all non-spectators are regular players — no coach role.
    if (mode !== 'coached_cash') {
      isCoach = false;
    }

    // Instantiate controller and emit table_config
    const { getOrCreateController } = require('../../state/SharedState');
    const sm = tables.get(tableId);
    if (sm) {
      getOrCreateController(tableId, mode, sm.gm ?? sm, io);
    }
    socket.emit('table_config', { mode });

    HandLogger.upsertPlayerIdentity(resolvedStableId, trimmedName).catch(err =>
      log.error('db', 'upsert_identity_failed', '[HandLogger] upsertPlayerIdentity', { err, tableId, playerId: resolvedStableId }));

    // Kick duplicate tab
    for (const [existingSocketId, existingStableId] of stableIdMap.entries()) {
      if (existingSocketId !== socket.id && existingStableId === resolvedStableId) {
        const oldSocket = io.sockets.sockets.get(existingSocketId);
        if (oldSocket) {
          oldSocket.emit('error', { message: 'Logged in from another window — disconnecting this session.' });
          oldSocket.disconnect(true);
        }
        stableIdMap.delete(existingSocketId);
        log.warn('socket', 'duplicate_login', `${trimmedName} joined from second window — old socket kicked`, { tableId, stableId: resolvedStableId });
        break;
      }
    }

    // Reconnect path
    let isReconnect = false;
    let savedReconnectEntry = null;
    for (const [oldSocketId, entry] of reconnectTimers.entries()) {
      if (entry.tableId === tableId && entry.name === trimmedName) {
        // Only enforce coach/player mismatch in coached_cash; in other modes everyone
        // is a regular player regardless of JWT role.
        if (mode === 'coached_cash') {
          if (entry.isCoach && !isCoach) return sendError(socket, 'This seat belongs to the coach — rejoin as Coach');
          if (!entry.isCoach && isCoach) return sendError(socket, 'This seat belongs to a player — rejoin without coach flag');
        }
        savedReconnectEntry = entry;
        clearTimeout(entry.timer);
        reconnectTimers.delete(oldSocketId);
        gm.removePlayer(oldSocketId);
        isReconnect = true;
        log.info('socket', 'player_reconnect', `${trimmedName} rejoined, cancelled TTL`, { tableId, name: trimmedName });
        console.log(`[reconnect] ${trimmedName} rejoined, cancelled TTL for old socket ${oldSocketId}`);
        break;
      }
    }

    const joinAsSpectator = (reason) => {
      socket.data.tableId = tableId;
      socket.data.isCoach = false;
      socket.data.isSpectator = true;
      socket.data.name = trimmedName;
      socket.join(tableId);
      socket.emit('room_joined', { playerId: socket.id, isCoach: false, isSpectator: true, name: trimmedName, tableId });
      if (reason) socket.emit('notification', { type: 'spectator', message: reason });
      const publicState = gm.getPublicState(socket.id, false);
      socket.emit('game_state', publicState);
      log.info('game', 'player_join', `${trimmedName} joined as spectator`, { tableId, name: trimmedName, role: 'spectator' });
      console.log(`[spectator] ${trimmedName} joined ${tableId} as spectator (${reason || 'explicit'})`);
    };

    if (payloadSpectator && !isCoach) { joinAsSpectator(''); return; }

    // In coached_cash: if a coach already controls the table, newcomer coaches become players.
    if (mode === 'coached_cash' && isCoach && !isReconnect) {
      const existingCoach = gm.state.players.find(p => p.is_coach);
      if (existingCoach) {
        isCoach = false;
        socket.emit('notification', { type: 'info', message: `Session is managed by ${existingCoach.name} — you are joining as a player` });
      }
    }

    const result = gm.addPlayer(socket.id, trimmedName, isCoach, resolvedStableId);
    if (result.error) return sendError(socket, result.error);

    if (ghostStacks.has(resolvedStableId)) {
      gm.adjustStack(socket.id, ghostStacks.get(resolvedStableId));
      ghostStacks.delete(resolvedStableId);
    }

    if (isReconnect && savedReconnectEntry?.configSnapshot) {
      gm.state.config_phase = savedReconnectEntry.configSnapshot.config_phase;
      gm.state.config = savedReconnectEntry.configSnapshot.config;
    }

    socket.data.tableId = tableId;
    socket.data.isCoach = isCoach;
    socket.data.isSpectator = false;
    socket.data.name = trimmedName;
    socket.data.stableId = resolvedStableId;
    socket.join(tableId);

    socket.emit('room_joined', { playerId: socket.id, isCoach, isSpectator: false, name: trimmedName, tableId });
    broadcastState(tableId, { type: 'join', message: `${trimmedName} ${isCoach ? '(Coach)' : ''} joined the table` });
    log.info('game', 'player_join', `${trimmedName} joined`, { tableId, name: trimmedName, role: isCoach ? 'coach' : 'player', playerId: resolvedStableId });
    log.trackSocket('join_room', tableId, resolvedStableId, { name: trimmedName, isCoach });
    console.log(`[join] ${trimmedName} (coach=${isCoach}, mode=${mode}) → ${tableId}`);
  });
};
