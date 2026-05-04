'use strict';

jest.mock('../db/repositories/TableRepository.js', () => ({
  TableRepository: {
    activateScheduledTables: jest.fn().mockResolvedValue([]),
    closeTable: jest.fn().mockResolvedValue(undefined),
    listOrphanedTables: jest.fn().mockResolvedValue([]),
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

jest.mock('../game/BotConnection', () => ({
  disconnectAllAtTable: jest.fn(),
}));

jest.mock('../logs/logger', () => ({ error: jest.fn() }));

const { TableRepository } = require('../db/repositories/TableRepository.js');

afterEach(() => {
  jest.clearAllMocks();
  jest.clearAllTimers();
  jest.useRealTimers();
});

/**
 * Flush all pending microtasks (resolved promises) without advancing timers further.
 * This is needed because the setInterval callback is async — advanceTimersByTime
 * triggers it synchronously, but its awaited internals run as microtasks.
 */
async function flushPromises() {
  // Multiple passes to resolve chains of awaits
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

test('listOrphanedTables is called during each cleanup interval', async () => {
  jest.useFakeTimers();
  const io = {
    in: jest.fn().mockReturnValue({ fetchSockets: jest.fn().mockResolvedValue([]) }),
  };
  const tables = new Map();

  const { startTableCleanup } = require('../lifecycle/tableCleanup.js');
  startTableCleanup(io, tables);

  jest.advanceTimersByTime(5 * 60 * 1000);
  await flushPromises();

  expect(TableRepository.listOrphanedTables).toHaveBeenCalled();
});

test('orphaned DB tables not in memory are closed', async () => {
  const OLD_DATE = new Date(Date.now() - 31 * 60 * 1000).toISOString();
  TableRepository.listOrphanedTables.mockResolvedValue([
    { id: 'orphan-1', created_at: OLD_DATE },
    { id: 'orphan-2', created_at: OLD_DATE },
  ]);

  jest.useFakeTimers();
  const io = {
    in: jest.fn().mockReturnValue({ fetchSockets: jest.fn().mockResolvedValue([]) }),
  };
  const tables = new Map(); // empty — orphans have no in-memory entry

  const { startTableCleanup } = require('../lifecycle/tableCleanup.js');
  startTableCleanup(io, tables);

  jest.advanceTimersByTime(5 * 60 * 1000);
  await flushPromises();

  expect(TableRepository.closeTable).toHaveBeenCalledWith('orphan-1');
  expect(TableRepository.closeTable).toHaveBeenCalledWith('orphan-2');
});

test('tables present in memory are NOT closed even if listed as orphans', async () => {
  const OLD_DATE = new Date(Date.now() - 31 * 60 * 1000).toISOString();
  TableRepository.listOrphanedTables.mockResolvedValue([
    { id: 'active-table', created_at: OLD_DATE },
  ]);

  jest.useFakeTimers();
  // Simulate an active socket in the room so the idle-eviction loop
  // does NOT evict the table — this isolates the orphan-cleanup path.
  const io = {
    in: jest.fn().mockReturnValue({
      fetchSockets: jest.fn().mockResolvedValue([{ id: 'socket-1' }]),
    }),
  };
  const tables = new Map();
  tables.set('active-table', {}); // this table IS in memory with active sockets

  const { startTableCleanup } = require('../lifecycle/tableCleanup.js');
  startTableCleanup(io, tables);

  jest.advanceTimersByTime(5 * 60 * 1000);
  await flushPromises();

  // Should NOT be closed by the orphan path because it was in memory at
  // the start of the interval (knownTableIds guards against this)
  expect(TableRepository.closeTable).not.toHaveBeenCalledWith('active-table');
});
