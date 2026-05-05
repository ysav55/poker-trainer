'use strict';

/**
 * coachControls.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for Phase 2 additions on coachControls handler:
 *   • coach:add_bot — spawns a BotConnection, gates by requireCoach + table-full
 *   • coach:kick_player — removes player, cashes out, force-disconnects socket
 *
 * Existing handlers (toggle_pause, set_player_in_hand, etc.) are not exercised
 * here; their behavior is covered by integration smoke tests elsewhere.
 */

jest.mock('../../../game/BotConnection', () => ({
  spawnBot: jest.fn(),
  disconnectAllAtTable: jest.fn(),
  listBotsAtTable: jest.fn().mockReturnValue([]),
}));

jest.mock('../../../db/repositories/ChipBankRepository', () => ({
  cashOut: jest.fn().mockResolvedValue({ success: true }),
}));

const registerCoachControls = require('../../../socket/handlers/coachControls');
const BotConnection = require('../../../game/BotConnection');
const ChipBankRepo = require('../../../db/repositories/ChipBankRepository');

function buildCtx(overrides = {}) {
  const tables = new Map();
  const stableIdMap = new Map();
  const activeHands = new Map();
  const equityCache = new Map();
  const equitySettings = new Map();

  const ctx = {
    tables,
    activeHands,
    stableIdMap,
    equityCache,
    equitySettings,
    io: {
      to: jest.fn().mockReturnValue({ emit: jest.fn() }),
      sockets: { sockets: new Map() },
    },
    broadcastState: jest.fn(),
    sendError: jest.fn(),
    sendSyncError: jest.fn(),
    startActionTimer: jest.fn(),
    clearActionTimer: jest.fn(),
    emitEquityUpdate: jest.fn(),
    requireCoach: jest.fn().mockReturnValue(false), // default: coach passes the gate
    HandLogger: { logStackAdjustment: jest.fn().mockResolvedValue(true), markLastActionReverted: jest.fn().mockResolvedValue(true) },
    log: { info: jest.fn(), error: jest.fn(), trackSocket: jest.fn() },
    ...overrides,
  };
  return ctx;
}

function buildSocket(tableId = 't1') {
  return {
    id: 'coach-socket-1',
    data: { tableId, isCoach: true, name: 'CoachOne', stableId: 'coach-stable-1' },
    on: jest.fn(),
    emit: jest.fn(),
  };
}

function getHandler(socket, eventName) {
  const call = socket.on.mock.calls.find(([name]) => name === eventName);
  if (!call) throw new Error(`Handler not registered: ${eventName}`);
  return call[1];
}

// ─── coach:add_bot ───────────────────────────────────────────────────────────

describe('coach:add_bot handler', () => {
  beforeEach(() => jest.clearAllMocks());

  test('rejects non-coach via requireCoach gate', () => {
    const ctx = buildCtx({ requireCoach: jest.fn().mockReturnValue(true) });
    const socket = buildSocket();
    registerCoachControls(socket, ctx);
    const handler = getHandler(socket, 'coach:add_bot');

    handler({ difficulty: 'easy' });

    expect(ctx.requireCoach).toHaveBeenCalled();
    expect(BotConnection.spawnBot).not.toHaveBeenCalled();
  });

  test('errors when not in a room', () => {
    const ctx = buildCtx();
    const socket = buildSocket();
    registerCoachControls(socket, ctx);
    const handler = getHandler(socket, 'coach:add_bot');

    handler({ difficulty: 'easy' });

    expect(ctx.sendError).toHaveBeenCalledWith(socket, 'Not in a room');
    expect(BotConnection.spawnBot).not.toHaveBeenCalled();
  });

  test('errors when table is full', () => {
    const ctx = buildCtx();
    const seats = new Array(9).fill(0).map((_, i) => ({ id: `p${i}`, seat: i }));
    ctx.tables.set('t1', { state: { players: seats, max_players: 9 } });
    const socket = buildSocket();
    registerCoachControls(socket, ctx);
    const handler = getHandler(socket, 'coach:add_bot');

    handler({ difficulty: 'easy' });

    expect(ctx.sendSyncError).toHaveBeenCalledWith(socket, 'Table is full');
    expect(BotConnection.spawnBot).not.toHaveBeenCalled();
  });

  test('spawns bot via BotConnection with the requested difficulty', () => {
    const ctx = buildCtx();
    ctx.tables.set('t1', { state: { players: [], max_players: 9 } });
    BotConnection.spawnBot.mockReturnValue({ stableId: 'bot-1', name: 'Bot 1 (Hard)', difficulty: 'hard' });
    const socket = buildSocket();
    registerCoachControls(socket, ctx);
    const handler = getHandler(socket, 'coach:add_bot');

    handler({ difficulty: 'hard' });

    expect(BotConnection.spawnBot).toHaveBeenCalledWith(expect.objectContaining({ tableId: 't1', difficulty: 'hard' }));
    expect(socket.emit).toHaveBeenCalledWith('notification', expect.objectContaining({ type: 'bot_added' }));
  });

  test('defaults difficulty to easy when not provided', () => {
    const ctx = buildCtx();
    ctx.tables.set('t1', { state: { players: [], max_players: 9 } });
    BotConnection.spawnBot.mockReturnValue({ stableId: 'bot-1', name: 'Bot 1 (Easy)', difficulty: 'easy' });
    const socket = buildSocket();
    registerCoachControls(socket, ctx);
    const handler = getHandler(socket, 'coach:add_bot');

    handler({});

    expect(BotConnection.spawnBot).toHaveBeenCalledWith(expect.objectContaining({ tableId: 't1', difficulty: 'easy' }));
  });

  test('onConnectError callback notifies coach + logs', () => {
    const ctx = buildCtx();
    ctx.tables.set('t1', { state: { players: [], max_players: 9 } });
    let capturedHandler;
    BotConnection.spawnBot.mockImplementation((opts) => {
      capturedHandler = opts.onConnectError;
      return { stableId: 'bot-1', name: 'Bot 1 (Easy)', difficulty: 'easy' };
    });
    const socket = buildSocket();
    registerCoachControls(socket, ctx);
    const handler = getHandler(socket, 'coach:add_bot');

    handler({ difficulty: 'easy' });
    capturedHandler(new Error('connection refused'));

    expect(ctx.log.error).toHaveBeenCalledWith(
      'game', 'coach_add_bot_connect_error',
      expect.any(String),
      expect.objectContaining({ tableId: 't1' }),
    );
    expect(socket.emit).toHaveBeenCalledWith(
      'notification',
      expect.objectContaining({ type: 'bot_failed' }),
    );
  });

  test('forwards spawnBot validation errors to sendError', () => {
    const ctx = buildCtx();
    ctx.tables.set('t1', { state: { players: [], max_players: 9 } });
    BotConnection.spawnBot.mockReturnValue({ error: 'difficulty must be one of: easy, medium, hard' });
    const socket = buildSocket();
    registerCoachControls(socket, ctx);
    const handler = getHandler(socket, 'coach:add_bot');

    handler({ difficulty: 'godlike' });

    expect(ctx.sendError).toHaveBeenCalledWith(socket, expect.stringContaining('difficulty must be one of'));
  });
});

// ─── coach:kick_player ───────────────────────────────────────────────────────

describe('coach:kick_player handler', () => {
  beforeEach(() => jest.clearAllMocks());

  test('rejects non-coach via requireCoach gate', () => {
    const ctx = buildCtx({ requireCoach: jest.fn().mockReturnValue(true) });
    const socket = buildSocket();
    registerCoachControls(socket, ctx);
    const handler = getHandler(socket, 'coach:kick_player');

    handler({ playerId: 'victim-1' });

    expect(ctx.broadcastState).not.toHaveBeenCalled();
    expect(ChipBankRepo.cashOut).not.toHaveBeenCalled();
  });

  test('rejects missing playerId', () => {
    const ctx = buildCtx();
    const socket = buildSocket();
    registerCoachControls(socket, ctx);
    const handler = getHandler(socket, 'coach:kick_player');

    handler({});

    expect(ctx.sendError).toHaveBeenCalledWith(socket, 'playerId is required');
  });

  test('errors when player is not at the table', () => {
    const ctx = buildCtx();
    ctx.tables.set('t1', { state: { players: [{ id: 'other-1', name: 'Other', stack: 100 }] }, removePlayer: jest.fn() });
    const socket = buildSocket();
    registerCoachControls(socket, ctx);
    const handler = getHandler(socket, 'coach:kick_player');

    handler({ playerId: 'ghost-1' });

    expect(ctx.sendSyncError).toHaveBeenCalledWith(socket, 'Player not found at this table');
  });

  test('refuses to kick the coach', () => {
    const ctx = buildCtx();
    const removePlayer = jest.fn();
    ctx.tables.set('t1', {
      state: { players: [{ id: 'coach-1', name: 'TheCoach', stack: 0, is_coach: true }] },
      removePlayer,
    });
    const socket = buildSocket();
    registerCoachControls(socket, ctx);
    const handler = getHandler(socket, 'coach:kick_player');

    handler({ playerId: 'coach-1' });

    expect(ctx.sendSyncError).toHaveBeenCalledWith(socket, 'Cannot kick the coach');
    expect(removePlayer).not.toHaveBeenCalled();
  });

  test('removes player, cashes out remaining stack, force-disconnects socket', () => {
    const ctx = buildCtx();
    const removePlayer = jest.fn();
    ctx.tables.set('t1', {
      state: { players: [{ id: 'victim-1', name: 'Victim', stack: 850 }] },
      removePlayer,
    });
    ctx.stableIdMap.set('victim-1', 'stable-victim');

    const targetSocketEmit = jest.fn();
    const targetSocketDisconnect = jest.fn();
    ctx.io.sockets.sockets.set('victim-1', { emit: targetSocketEmit, disconnect: targetSocketDisconnect });

    const socket = buildSocket();
    registerCoachControls(socket, ctx);
    const handler = getHandler(socket, 'coach:kick_player');

    handler({ playerId: 'victim-1' });

    expect(removePlayer).toHaveBeenCalledWith('victim-1');
    expect(ChipBankRepo.cashOut).toHaveBeenCalledWith('stable-victim', 850, 't1');
    expect(targetSocketEmit).toHaveBeenCalledWith('kicked', expect.objectContaining({ tableId: 't1' }));
    expect(targetSocketDisconnect).toHaveBeenCalledWith(true);
    expect(ctx.broadcastState).toHaveBeenCalledWith('t1', expect.objectContaining({ type: 'player_kicked' }));
  });

  test('skips cashOut for zero-stack victim', () => {
    const ctx = buildCtx();
    ctx.tables.set('t1', {
      state: { players: [{ id: 'victim-1', name: 'Broke', stack: 0 }] },
      removePlayer: jest.fn(),
    });
    ctx.stableIdMap.set('victim-1', 'stable-broke');

    const socket = buildSocket();
    registerCoachControls(socket, ctx);
    const handler = getHandler(socket, 'coach:kick_player');

    handler({ playerId: 'victim-1' });

    expect(ChipBankRepo.cashOut).not.toHaveBeenCalled();
  });

  test('skips cashOut for coach-prefixed stableIds (legacy coach seats)', () => {
    const ctx = buildCtx();
    ctx.tables.set('t1', {
      state: { players: [{ id: 'shadow-1', name: 'CoachShadow', stack: 100 }] },
      removePlayer: jest.fn(),
    });
    ctx.stableIdMap.set('shadow-1', 'coach_legacy');

    const socket = buildSocket();
    registerCoachControls(socket, ctx);
    const handler = getHandler(socket, 'coach:kick_player');

    handler({ playerId: 'shadow-1' });

    expect(ChipBankRepo.cashOut).not.toHaveBeenCalled();
  });

  test('skips cashOut for kicked bots (UUID stableId but is_bot=true)', () => {
    const ctx = buildCtx();
    ctx.tables.set('t1', {
      state: { players: [{ id: 'bot-1', name: 'Bot 1 (Easy)', stack: 1000, is_bot: true }] },
      removePlayer: jest.fn(),
    });
    ctx.stableIdMap.set('bot-1', '550e8400-e29b-41d4-a716-446655440000');

    const socket = buildSocket();
    registerCoachControls(socket, ctx);
    const handler = getHandler(socket, 'coach:kick_player');

    handler({ playerId: 'bot-1' });

    expect(ChipBankRepo.cashOut).not.toHaveBeenCalled();
  });

  test('folds active actor before kicking — clears timer + advances round', () => {
    const ctx = buildCtx();
    const placeBet = jest.fn().mockReturnValue({ success: true });
    const removePlayer = jest.fn();
    ctx.tables.set('t1', {
      state: {
        players: [{ id: 'victim-1', name: 'Victim', stack: 500 }],
        current_turn: 'victim-1',
        phase: 'turn',
      },
      placeBet,
      removePlayer,
    });
    ctx.stableIdMap.set('victim-1', 'stable-victim');

    const socket = buildSocket();
    registerCoachControls(socket, ctx);
    const handler = getHandler(socket, 'coach:kick_player');

    handler({ playerId: 'victim-1' });

    // The pre-kick fold path runs before removal so the round advances cleanly.
    expect(ctx.clearActionTimer).toHaveBeenCalledWith('t1');
    expect(placeBet).toHaveBeenCalledWith('victim-1', 'fold');
    expect(ctx.startActionTimer).toHaveBeenCalledWith('t1');
    expect(removePlayer).toHaveBeenCalledWith('victim-1');
  });

  test('does NOT pre-fold when kicked player is not the current actor', () => {
    const ctx = buildCtx();
    const placeBet = jest.fn();
    ctx.tables.set('t1', {
      state: {
        players: [{ id: 'victim-1', name: 'Victim', stack: 500 }],
        current_turn: 'someone-else',
        phase: 'flop',
      },
      placeBet,
      removePlayer: jest.fn(),
    });

    const socket = buildSocket();
    registerCoachControls(socket, ctx);
    const handler = getHandler(socket, 'coach:kick_player');

    handler({ playerId: 'victim-1' });

    expect(placeBet).not.toHaveBeenCalled();
    expect(ctx.clearActionTimer).not.toHaveBeenCalled();
  });

  test('refuses to kick active actor while paused (would dangle current_turn)', () => {
    const ctx = buildCtx();
    const placeBet = jest.fn();
    const removePlayer = jest.fn();
    ctx.tables.set('t1', {
      state: {
        players: [{ id: 'victim-1', name: 'Victim', stack: 500 }],
        current_turn: 'victim-1',
        phase: 'flop',
        paused: true,
      },
      placeBet,
      removePlayer,
    });

    const socket = buildSocket();
    registerCoachControls(socket, ctx);
    const handler = getHandler(socket, 'coach:kick_player');

    handler({ playerId: 'victim-1' });

    expect(ctx.sendSyncError).toHaveBeenCalledWith(socket, expect.stringContaining('Resume the game'));
    expect(placeBet).not.toHaveBeenCalled();
    expect(removePlayer).not.toHaveBeenCalled();
  });

  test('continues with removal when placeBet(fold) returns an error (does not re-arm timer)', () => {
    const ctx = buildCtx();
    const placeBet = jest.fn().mockReturnValue({ error: 'some odd state' });
    const removePlayer = jest.fn();
    ctx.tables.set('t1', {
      state: {
        players: [{ id: 'victim-1', name: 'Victim', stack: 0 }],
        current_turn: 'victim-1',
        phase: 'turn',
        paused: false,
      },
      placeBet,
      removePlayer,
    });

    const socket = buildSocket();
    registerCoachControls(socket, ctx);
    const handler = getHandler(socket, 'coach:kick_player');

    handler({ playerId: 'victim-1' });

    expect(placeBet).toHaveBeenCalledWith('victim-1', 'fold');
    expect(ctx.startActionTimer).not.toHaveBeenCalled();
    expect(removePlayer).toHaveBeenCalledWith('victim-1');
    expect(ctx.log.error).toHaveBeenCalledWith('game', 'kick_pre_fold_failed', expect.any(String), expect.any(Object));
  });

  test('does NOT pre-fold when phase is waiting/showdown', () => {
    const ctx = buildCtx();
    const placeBet = jest.fn();
    ctx.tables.set('t1', {
      state: {
        players: [{ id: 'victim-1', name: 'Victim', stack: 500 }],
        current_turn: 'victim-1',
        phase: 'waiting',
      },
      placeBet,
      removePlayer: jest.fn(),
    });

    const socket = buildSocket();
    registerCoachControls(socket, ctx);
    const handler = getHandler(socket, 'coach:kick_player');

    handler({ playerId: 'victim-1' });

    expect(placeBet).not.toHaveBeenCalled();
  });
});
