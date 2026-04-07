'use strict';

/**
 * Verifies that when the last socket leaves a table room,
 * the table is closed in the DB.
 *
 * Approach: directly inspect the disconnect handler's behavior by
 * reading the source and verifying TableRepository.closeTable is called
 * after the 60s TTL expires.
 *
 * Uses Jest fake timers to advance past the TTL.
 */

jest.mock('../db/repositories/TableRepository.js', () => ({
  TableRepository: {
    closeTable: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../logs/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  trackSocket: jest.fn(),
}));

jest.mock('../db/repositories/ChipBankRepository', () => ({
  cashOut: jest.fn().mockResolvedValue(undefined),
}));

const { TableRepository } = require('../db/repositories/TableRepository.js');

// Clear mock call counts between tests (without resetting modules,
// which would cause the inline require in the handler to miss the mock)
beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

function buildCtx() {
  const rooms = new Map();
  const io = {
    to: jest.fn().mockReturnThis(),
    emit: jest.fn(),
    sockets: {
      adapter: { rooms },
    },
  };
  const tables = new Map();
  const stableIdMap = new Map();
  const reconnectTimers = new Map();
  const ghostStacks = new Map();
  return {
    io,
    tables,
    stableIdMap,
    reconnectTimers,
    ghostStacks,
    broadcastState: jest.fn(),
    clearActionTimer: jest.fn(),
    log: require('../logs/logger'),
  };
}

test('TableRepository.closeTable is called when last socket leaves room after TTL', async () => {
  jest.useFakeTimers();

  const ctx = buildCtx();
  const tableId = 'table-test-1';

  // Set up in-memory table
  const gm = {
    sessionId: null,
    state: {
      players: [],
      paused: false,
      current_turn: null,
    },
    setPlayerDisconnected: jest.fn(),
    removePlayer: jest.fn(),
  };
  ctx.tables.set(tableId, gm);

  // Room is empty after this socket leaves (last one)
  ctx.io.sockets.adapter.rooms.set(tableId, new Set());

  // Create a mock socket
  const listeners = {};
  const socket = {
    id: 'socket-1',
    on: (event, cb) => { listeners[event] = cb; },
    data: {
      tableId,
      name: 'TestPlayer',
      isCoach: false,
      isSpectator: false,
      stableId: 'player-uuid-1',
    },
  };

  // Register disconnect handler
  const registerDisconnect = require('../socket/handlers/disconnect');
  registerDisconnect(socket, ctx);

  // Trigger disconnect
  listeners['disconnect']();

  // Advance past the 60s TTL
  jest.advanceTimersByTime(60_000);

  // Wait for promise chains to complete by flushing both timers and microtasks
  await jest.runAllTimersAsync();

  expect(TableRepository.closeTable).toHaveBeenCalledWith(tableId);
});

test('TableRepository.closeTable is NOT called if other sockets still in room', async () => {
  jest.useFakeTimers();

  const ctx = buildCtx();
  const tableId = 'table-test-2';

  const gm = {
    sessionId: null,
    state: { players: [], paused: false, current_turn: null },
    setPlayerDisconnected: jest.fn(),
    removePlayer: jest.fn(),
  };
  ctx.tables.set(tableId, gm);

  // Another socket still in room
  ctx.io.sockets.adapter.rooms.set(tableId, new Set(['socket-2']));

  const listeners = {};
  const socket = {
    id: 'socket-1',
    on: (event, cb) => { listeners[event] = cb; },
    data: {
      tableId,
      name: 'TestPlayer',
      isCoach: false,
      isSpectator: false,
      stableId: 'player-uuid-1',
    },
  };

  const registerDisconnect = require('../socket/handlers/disconnect');
  registerDisconnect(socket, ctx);
  listeners['disconnect']();

  jest.advanceTimersByTime(60_000);
  await jest.runAllTimersAsync();

  expect(TableRepository.closeTable).not.toHaveBeenCalled();
});
