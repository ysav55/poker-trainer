'use strict';

/**
 * tableCleanup coach state tests.
 *
 * Tests that activeCoachLocks and pendingBlinds are cleared when a table closes.
 * Uses Jest fake timers so setInterval fires deterministically.
 * Mocks TableRepository to avoid any real DB calls.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../db/repositories/TableRepository', () => ({
  TableRepository: {
    activateScheduledTables: jest.fn(),
    closeTable: jest.fn(),
    listOrphanedTables: jest.fn(),
  },
  InvitedPlayersRepository: {
    addInvite: jest.fn(),
    removeInvite: jest.fn(),
    listInvited: jest.fn(),
    isInvited: jest.fn(),
  },
  TablePresetsRepository: {
    save: jest.fn(),
    list: jest.fn(),
    get: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    clone: jest.fn(),
  },
}));

jest.mock('../../game/BotConnection', () => ({
  disconnectAllAtTable: jest.fn(),
}));

// ─── Module under test ────────────────────────────────────────────────────────

const { TableRepository } = require('../../db/repositories/TableRepository');
const SharedState = require('../../state/SharedState.js');
const { startTableCleanup, recordTableActivity } = require('../tableCleanup.js');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal mock io with configurable fetchSockets result */
function buildIo(socketsByRoom = {}) {
  return {
    in: jest.fn((room) => ({
      fetchSockets: jest.fn().mockResolvedValue(socketsByRoom[room] ?? []),
    })),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  // Default: activateScheduledTables resolves with empty array
  TableRepository.activateScheduledTables.mockResolvedValue([]);
  // Default: closeTable resolves
  TableRepository.closeTable.mockResolvedValue(undefined);
  // Default: listOrphanedTables resolves with empty array
  TableRepository.listOrphanedTables.mockResolvedValue([]);
  // Clear all shared state Maps
  SharedState.activeCoachLocks.clear();
  SharedState.pendingBlinds.clear();
  SharedState.tableSharedRanges.clear();
  SharedState.tables.clear();
});

afterEach(() => {
  jest.clearAllTimers();
  jest.clearAllMocks();
  jest.useRealTimers();
  SharedState.activeCoachLocks.clear();
  SharedState.pendingBlinds.clear();
  SharedState.tableSharedRanges.clear();
  SharedState.tables.clear();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('tableCleanup — coach state cleanup', () => {
  const FIVE_MINUTES_MS  = 5  * 60 * 1000;
  const THIRTY_ONE_MIN_MS = 31 * 60 * 1000;

  test('clears coach lock when idle table is evicted', async () => {
    const tableId = 'tbl-with-lock';
    // Set up coach lock
    SharedState.activeCoachLocks.set(tableId, 'coach-stable-id');

    // Create a minimal mock table in the passed-in tables Map
    const tables = new Map([[tableId, { sessionId: null, state: { players: [] } }]]);

    // No sockets in the room (idle)
    const io = buildIo({ [tableId]: [] });

    // Record activity now, then advance time past threshold
    recordTableActivity(tableId);
    startTableCleanup(io, tables);

    // Let startup activation run
    await Promise.resolve();
    await Promise.resolve();

    // Advance time past the 30-minute idle threshold
    jest.advanceTimersByTime(THIRTY_ONE_MIN_MS);

    // Wait for async interval body to complete
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // Verify: coach lock should be cleared
    expect(SharedState.activeCoachLocks.has(tableId)).toBe(false);
    expect(TableRepository.closeTable).toHaveBeenCalledWith(tableId);
  });

  test('clears pending blinds when idle table is evicted', async () => {
    const tableId = 'tbl-with-blinds';
    // Set up pending blinds
    SharedState.pendingBlinds.set(tableId, {
      sb: 25,
      bb: 50,
      queuedBy: 'coach-stable-id',
      queuedAt: Date.now(),
    });

    // Create a minimal mock table in the passed-in tables Map
    const tables = new Map([[tableId, { sessionId: null, state: { players: [] } }]]);

    // No sockets in the room (idle)
    const io = buildIo({ [tableId]: [] });

    // Record activity now, then advance time past threshold
    recordTableActivity(tableId);
    startTableCleanup(io, tables);

    // Let startup activation run
    await Promise.resolve();
    await Promise.resolve();

    // Advance time past the 30-minute idle threshold
    jest.advanceTimersByTime(THIRTY_ONE_MIN_MS);

    // Wait for async interval body to complete
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // Verify: pending blinds should be cleared
    expect(SharedState.pendingBlinds.has(tableId)).toBe(false);
    expect(TableRepository.closeTable).toHaveBeenCalledWith(tableId);
  });

  test('clears both coach lock and pending blinds together', async () => {
    const tableId = 'tbl-both';
    // Set up both coach lock and pending blinds
    SharedState.activeCoachLocks.set(tableId, 'coach-stable-id');
    SharedState.pendingBlinds.set(tableId, {
      sb: 10,
      bb: 20,
      queuedBy: 'coach-stable-id',
      queuedAt: Date.now(),
    });

    // Create a minimal mock table in the passed-in tables Map
    const tables = new Map([[tableId, { sessionId: null, state: { players: [] } }]]);

    // No sockets in the room (idle)
    const io = buildIo({ [tableId]: [] });

    // Record activity now, then advance time past threshold
    recordTableActivity(tableId);
    startTableCleanup(io, tables);

    // Let startup activation run
    await Promise.resolve();
    await Promise.resolve();

    // Advance time past the 30-minute idle threshold
    jest.advanceTimersByTime(THIRTY_ONE_MIN_MS);

    // Wait for async interval body to complete
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // Verify: both should be cleared
    expect(SharedState.activeCoachLocks.has(tableId)).toBe(false);
    expect(SharedState.pendingBlinds.has(tableId)).toBe(false);
    expect(TableRepository.closeTable).toHaveBeenCalledWith(tableId);
  });

  test('preserves coach state for active tables', async () => {
    const tableId = 'tbl-active';
    // Set up coach lock on an active table
    SharedState.activeCoachLocks.set(tableId, 'coach-stable-id');
    SharedState.pendingBlinds.set(tableId, { sb: 25, bb: 50, queuedBy: 'coach-stable-id', queuedAt: Date.now() });

    // Create a mock table in the passed-in tables Map
    const tables = new Map([[tableId, { sessionId: null, state: { players: [] } }]]);

    // 1 active socket — table is not idle
    const io = buildIo({ [tableId]: [{ id: 's1' }] });

    startTableCleanup(io, tables);
    await Promise.resolve();
    await Promise.resolve();

    // Clear any setup mocks
    TableRepository.activateScheduledTables.mockClear();

    // Advance time past the idle threshold
    jest.advanceTimersByTime(THIRTY_ONE_MIN_MS);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // Verify: coach state should NOT be cleared (table is still active)
    expect(SharedState.activeCoachLocks.has(tableId)).toBe(true);
    expect(SharedState.pendingBlinds.has(tableId)).toBe(true);
    expect(TableRepository.closeTable).not.toHaveBeenCalled();
  });

  test('clears shared ranges when idle table is evicted', async () => {
    const tableId = 'tbl-with-ranges';
    // Set up shared ranges
    SharedState.tableSharedRanges.set(tableId, {
      groups: ['AKo', 'QQ'],
      label: 'BTN open',
      broadcastedAt: Date.now(),
    });

    // Create a minimal mock table in the passed-in tables Map
    const tables = new Map([[tableId, { sessionId: null, state: { players: [] } }]]);

    // No sockets in the room (idle)
    const io = buildIo({ [tableId]: [] });

    // Record activity now, then advance time past threshold
    recordTableActivity(tableId);
    startTableCleanup(io, tables);

    // Let startup activation run
    await Promise.resolve();
    await Promise.resolve();

    // Advance time past the 30-minute idle threshold
    jest.advanceTimersByTime(THIRTY_ONE_MIN_MS);

    // Wait for async interval body to complete
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // Verify: shared ranges should be cleared
    expect(SharedState.tableSharedRanges.has(tableId)).toBe(false);
    expect(TableRepository.closeTable).toHaveBeenCalledWith(tableId);
  });

  test('preserves shared ranges for active tables', async () => {
    const tableId = 'tbl-ranges-active';
    // Set up shared ranges on an active table
    SharedState.tableSharedRanges.set(tableId, {
      groups: ['AKo', 'QQ'],
      label: 'BTN open',
      broadcastedAt: Date.now(),
    });

    // Create a mock table in the passed-in tables Map
    const tables = new Map([[tableId, { sessionId: null, state: { players: [] } }]]);

    // 1 active socket — table is not idle
    const io = buildIo({ [tableId]: [{ id: 's1' }] });

    startTableCleanup(io, tables);
    await Promise.resolve();
    await Promise.resolve();

    // Clear any setup mocks
    TableRepository.activateScheduledTables.mockClear();

    // Advance time past the idle threshold
    jest.advanceTimersByTime(THIRTY_ONE_MIN_MS);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // Verify: shared ranges should NOT be cleared (table is still active)
    expect(SharedState.tableSharedRanges.has(tableId)).toBe(true);
    expect(TableRepository.closeTable).not.toHaveBeenCalled();
  });
});
