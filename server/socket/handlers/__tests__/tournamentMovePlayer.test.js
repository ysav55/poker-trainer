'use strict';

/**
 * tournament:move_player — C-17 regression test.
 *
 * Verifies that GameManager.addPlayer is called with positional arguments,
 * NOT an object. The bug was:
 *   toGm.addPlayer({ id: playerId, name, seat: targetSeat, stack })
 * which landed the entire object in `socketId`, leaving name/isCoach/stableId
 * all undefined.
 *
 * Fix is:
 *   toGm.addPlayer(playerId, name, false, playerId, stack)
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSocket(overrides = {}) {
  return {
    id: 'socket-coach-1',
    data: { role: 'coach', tableId: 'referee-room' },
    on:   jest.fn(),
    emit: jest.fn(),
    join: jest.fn(),
    ...overrides,
  };
}

function makeIo() {
  const roomEmit = jest.fn();
  return {
    to:       jest.fn(() => ({ emit: roomEmit })),
    _roomEmit: roomEmit,
  };
}

/**
 * Build a minimal GM double that records addPlayer calls.
 */
function makeGm(players = []) {
  return {
    addPlayer:    jest.fn(),
    removePlayer: jest.fn(),
    getState:     () => ({ seated: [...players] }),
  };
}

function makeCtx({ tables, io, requireCoach, sendError }) {
  return {
    tables,
    io,
    requireCoach: requireCoach ?? jest.fn(() => false), // false = "not blocked"
    sendError:    sendError    ?? ((sock, msg) => sock.emit('error', { message: msg })),
  };
}

/**
 * Register the tournament socket handlers and return an async helper
 * that fires a named event as if received from the client.
 */
function registerHandlers(socket, ctx) {
  const handlers = {};
  socket.on.mockImplementation((event, fn) => { handlers[event] = fn; });

  const registerTournamentHandlers = require('../tournament');
  registerTournamentHandlers(socket, ctx);

  return async (event, payload) => {
    if (!handlers[event]) throw new Error(`No handler registered for '${event}'`);
    await handlers[event](payload);
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('tournament:move_player', () => {
  const PLAYER_ID    = 'player-uuid-abc123';
  const PLAYER_NAME  = 'Alice';
  const PLAYER_STACK = 4500;
  const FROM_TABLE   = 'table-A';
  const TO_TABLE     = 'table-B';

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('calls toGm.addPlayer with positional args (not an object)', async () => {
    const socket = makeSocket();
    const io     = makeIo();
    const tables = new Map();

    const fromGm = makeGm([
      { id: PLAYER_ID, name: PLAYER_NAME, seat: 2, stack: PLAYER_STACK },
    ]);
    const toGm = makeGm([
      { id: 'other-player', name: 'Bob', seat: 0, stack: 5000 },
    ]);

    tables.set(FROM_TABLE, fromGm);
    tables.set(TO_TABLE,   toGm);

    const ctx  = makeCtx({ tables, io });
    const fire = registerHandlers(socket, ctx);

    await fire('tournament:move_player', {
      fromTableId: FROM_TABLE,
      toTableId:   TO_TABLE,
      playerId:    PLAYER_ID,
    });

    // addPlayer must be called exactly once on the destination GM
    expect(toGm.addPlayer).toHaveBeenCalledTimes(1);

    const [arg0, arg1, arg2, arg3, arg4] = toGm.addPlayer.mock.calls[0];

    // arg0 = socketId — must be the player UUID string, NOT an object
    expect(typeof arg0).toBe('string');
    expect(arg0).toBe(PLAYER_ID);

    // arg1 = name
    expect(arg1).toBe(PLAYER_NAME);

    // arg2 = isCoach — always false for moved players
    expect(arg2).toBe(false);

    // arg3 = stableId — same as socketId in tournament context
    expect(arg3).toBe(PLAYER_ID);

    // arg4 = stack
    expect(arg4).toBe(PLAYER_STACK);
  });

  it('removes the player from the source GM', async () => {
    const socket = makeSocket();
    const io     = makeIo();
    const tables = new Map();

    const fromGm = makeGm([
      { id: PLAYER_ID, name: PLAYER_NAME, seat: 1, stack: PLAYER_STACK },
    ]);
    const toGm = makeGm([]);
    tables.set(FROM_TABLE, fromGm);
    tables.set(TO_TABLE,   toGm);

    const ctx  = makeCtx({ tables, io });
    const fire = registerHandlers(socket, ctx);

    await fire('tournament:move_player', {
      fromTableId: FROM_TABLE,
      toTableId:   TO_TABLE,
      playerId:    PLAYER_ID,
    });

    expect(fromGm.removePlayer).toHaveBeenCalledWith(PLAYER_ID);
  });

  it('emits game_state to both tables after the move', async () => {
    const socket = makeSocket();
    const io     = makeIo();
    const tables = new Map();

    const fromGm = makeGm([
      { id: PLAYER_ID, name: PLAYER_NAME, seat: 3, stack: PLAYER_STACK },
    ]);
    const toGm = makeGm([]);
    tables.set(FROM_TABLE, fromGm);
    tables.set(TO_TABLE,   toGm);

    const ctx  = makeCtx({ tables, io });
    const fire = registerHandlers(socket, ctx);

    await fire('tournament:move_player', {
      fromTableId: FROM_TABLE,
      toTableId:   TO_TABLE,
      playerId:    PLAYER_ID,
    });

    const toCalls = io.to.mock.calls.map(c => c[0]);
    expect(toCalls).toContain(FROM_TABLE);
    expect(toCalls).toContain(TO_TABLE);
    // Verify the emitted event is 'game_state', not some other event
    expect(io._roomEmit).toHaveBeenCalledWith('game_state', expect.objectContaining({ tableId: FROM_TABLE }));
    expect(io._roomEmit).toHaveBeenCalledWith('game_state', expect.objectContaining({ tableId: TO_TABLE }));
  });

  it('sends an error when fromTableId is missing', async () => {
    const socket = makeSocket();
    const io     = makeIo();
    const tables = new Map();

    const ctx  = makeCtx({ tables, io });
    const fire = registerHandlers(socket, ctx);

    await fire('tournament:move_player', { toTableId: TO_TABLE, playerId: PLAYER_ID });

    expect(socket.emit).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({ message: expect.any(String) }),
    );
  });
});
