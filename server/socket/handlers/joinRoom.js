'use strict';

module.exports = function registerJoinRoom(socket, ctx) {
  const { tables, stableIdMap, reconnectTimers, ghostStacks, io,
          broadcastState, sendError,
          HandLogger, log } = ctx;

  socket.on('join_room', async ({ name, isSpectator: payloadSpectator = false, tableId = 'main-table', buyInAmount } = {}) => {
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
    const { TableRepository, InvitedPlayersRepository } = require('../../db/repositories/TableRepository.js');
    const tableRow = await TableRepository.getTable(tableId).catch(() => null);
    const mode    = tableRow?.mode    ?? 'coached_cash';
    const privacy = tableRow?.privacy ?? 'open';

    // Upsert table record so it's discoverable via GET /api/tables
    TableRepository.createTable({
      id: tableId,
      name: tableId,  // display name defaults to tableId; coach can rename via PATCH
      mode,
      createdBy: resolvedStableId,
    }).catch(() => {}); // fire-and-forget; ignore if already exists (upsert is idempotent)

    // Bot cash table visibility enforcement.
    // Bot sockets (spawned by BotTableController) bypass this check — they connect
    // server-side and are implicitly trusted. Only human joins are gated here.
    // Visibility rules:
    //   privacy=private  — solo-created: only the creator may join as a human player
    //   privacy=school   — coach-created: creator + same-school members may join
    if (mode === 'bot_cash') {
      // Bot sockets (spawned by BotTableController, role='bot') are implicitly trusted
      // and bypass all human visibility checks below.
      if (!socket.data.isBot) {
        if (!socket.data.authenticated || !stableId || stableId.length === 0) {
          return sendError(socket, 'Authentication required to join a bot table');
        }
        const creatorId = tableRow?.created_by ?? null;
        if (privacy === 'private') {
          if (resolvedStableId !== creatorId) {
            return sendError(socket, 'This bot table is private — only the creator can join');
          }
        } else if (privacy === 'school') {
          if (resolvedStableId !== creatorId) {
            const supabase = require('../../db/supabase');
            const [reqRes, creatorRes] = await Promise.all([
              supabase.from('player_profiles').select('school_id').eq('id', resolvedStableId).maybeSingle(),
              supabase.from('player_profiles').select('school_id').eq('id', creatorId).maybeSingle(),
            ]);
            const reqSchool     = reqRes.data?.school_id     ?? null;
            const creatorSchool = creatorRes.data?.school_id ?? null;
            if (!reqSchool || reqSchool !== creatorSchool) {
              return sendError(socket, "This bot table is only visible to the coach's students");
            }
          }
        }
      }
    }

    // In non-coached modes all non-spectators are regular players — no coach role.
    if (mode !== 'coached_cash') {
      isCoach = false;
    }

    // Instantiate controller and emit table_config
    const { getOrCreateController } = require('../../state/SharedState');
    const sm = tables.get(tableId);
    if (sm) {
      getOrCreateController(tableId, mode, sm.gm ?? sm, io, tableRow);
    }
    socket.emit('table_config', { mode });

    HandLogger.upsertPlayerIdentity(resolvedStableId, trimmedName).catch(err =>
      log.error('db', 'upsert_identity_failed', '[HandLogger] upsertPlayerIdentity', { err, tableId, playerId: resolvedStableId }));

    // Privacy enforcement — private tables only admit invited players (coaches bypass).
    // Skipped for bot_cash tables, which have their own visibility enforcement above.
    if (mode !== 'bot_cash' && privacy === 'private' && !isCoach && socket.data.authenticated && resolvedStableId && resolvedStableId !== socket.id) {
      const invited = await InvitedPlayersRepository.isInvited(tableId, resolvedStableId).catch(() => false);
      if (!invited) {
        return sendError(socket, 'This table is private — you need an invitation to join');
      }
    }

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

    // Chip bank buy-in — deduct from bank if player provides an amount and has a stableId
    if (
      !isCoach &&
      socket.data.authenticated &&
      resolvedStableId &&
      resolvedStableId !== socket.id &&
      Number.isInteger(buyInAmount) && buyInAmount > 0
    ) {
      const ChipBankRepo = require('../../db/repositories/ChipBankRepository');
      const balance = await ChipBankRepo.getBalance(resolvedStableId).catch(() => null);
      if (balance !== null) {
        if (balance < buyInAmount)
          return sendError(socket, `Insufficient chip balance — you have ${balance} chips (requested ${buyInAmount}).`);
        ChipBankRepo.buyIn(resolvedStableId, buyInAmount, tableId).catch(err =>
          log.error('db', 'chip_buy_in_failed', `chipBuyIn failed for ${trimmedName}`, { err, tableId, playerId: resolvedStableId }));
        socket.data.buyInAmount = buyInAmount;
      }
    }

    const result = gm.addPlayer(socket.id, trimmedName, isCoach, resolvedStableId);
    if (result.error) return sendError(socket, result.error);

    // Override initial stack with buyInAmount if set
    if (socket.data.buyInAmount && socket.data.buyInAmount > 0) {
      const currentPlayer = gm.state.players.find(p => p.id === socket.id);
      if (currentPlayer) {
        const diff = socket.data.buyInAmount - (currentPlayer.stack || 0);
        if (diff !== 0) gm.adjustStack(socket.id, diff);
      }
    }

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
