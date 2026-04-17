'use strict';

/**
 * TableRepository unit tests.
 *
 * Mocks supabase so no real DB or network calls are made.
 * TableRepository uses the raw supabase client directly (no q() helper).
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../supabase', () => {
  const chain = {};
  chain.from     = jest.fn(() => chain);
  chain.select   = jest.fn(() => chain);
  chain.insert   = jest.fn(() => chain);
  chain.upsert   = jest.fn(() => chain);
  chain.update   = jest.fn(() => chain);
  chain.delete   = jest.fn(() => chain);
  chain.eq       = jest.fn(() => chain);
  chain.neq      = jest.fn(() => chain);
  chain.lte      = jest.fn(() => chain);
  chain.order    = jest.fn(() => chain);
  chain.single   = jest.fn(() => Promise.resolve({ data: null, error: null }));
  // Default: async resolution with no error
  chain.then = undefined; // each test sets what it needs via mockResolvedValue / mockResolvedValueOnce
  return chain;
});

// ─── Module under test ────────────────────────────────────────────────────────

const { TableRepository } = require('../repositories/TableRepository');
const supabase = require('../supabase');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Make the final awaited call on the chain resolve with { data, error: null } */
function resolveWith(data) {
  // The last method in each chain is awaited directly (no .then property on chain).
  // We make the terminal method return a resolved Promise.
  // For most calls the terminal builder is the last chained call that gets awaited.
  // We patch supabase itself to be thenable.
  supabase[Symbol.for('resolveData')] = data;
}

beforeEach(() => {
  jest.clearAllMocks();
  // Re-wire all chain methods to return the chain (clearAllMocks clears implementations)
  supabase.from.mockReturnValue(supabase);
  supabase.select.mockReturnValue(supabase);
  supabase.insert.mockReturnValue(supabase);
  supabase.upsert.mockReturnValue(supabase);
  supabase.update.mockReturnValue(supabase);
  supabase.delete.mockReturnValue(supabase);
  supabase.eq.mockReturnValue(supabase);
  supabase.neq.mockReturnValue(supabase);
  supabase.lte.mockReturnValue(supabase);
  supabase.order.mockReturnValue(supabase);
  // Default: single() resolves with no data
  supabase.single.mockResolvedValue({ data: null, error: null });
});

// ─── createTable ──────────────────────────────────────────────────────────────

describe('createTable', () => {
  test('calls upsert with correct fields and ignoreDuplicates option', async () => {
    supabase.upsert.mockResolvedValueOnce({ error: null });

    await TableRepository.createTable({
      id: 'tbl-1',
      name: 'Test Table',
      mode: 'coached_cash',
      config: { blinds: [1, 2] },
      createdBy: 'user-uuid',
    });

    expect(supabase.from).toHaveBeenCalledWith('tables');
    expect(supabase.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'tbl-1',
        name: 'Test Table',
        mode: 'coached_cash',
        config: { blinds: [1, 2] },
        created_by: 'user-uuid',
      }),
      { onConflict: 'id', ignoreDuplicates: true }
    );
  });

  test('sets status to "waiting" when scheduledFor is not provided', async () => {
    supabase.upsert.mockResolvedValueOnce({ error: null });

    await TableRepository.createTable({ id: 'tbl-2', name: 'No Schedule', createdBy: 'u1' });

    const upsertArg = supabase.upsert.mock.calls[0][0];
    expect(upsertArg.status).toBe('waiting');
    expect(upsertArg.scheduled_for).toBeNull();
  });

  test('sets status to "scheduled" when scheduledFor is provided', async () => {
    supabase.upsert.mockResolvedValueOnce({ error: null });
    const future = '2026-04-01T10:00:00Z';

    await TableRepository.createTable({ id: 'tbl-3', name: 'Scheduled', createdBy: 'u1', scheduledFor: future });

    const upsertArg = supabase.upsert.mock.calls[0][0];
    expect(upsertArg.status).toBe('scheduled');
    expect(upsertArg.scheduled_for).toBe(future);
  });

  test('is idempotent — ignoreDuplicates: true suppresses conflict errors', async () => {
    supabase.upsert.mockResolvedValueOnce({ error: null });

    // Should not throw even when called twice
    await expect(
      TableRepository.createTable({ id: 'tbl-1', name: 'Dup', createdBy: 'u1' })
    ).resolves.toBeUndefined();

    const [, opts] = supabase.upsert.mock.calls[0];
    expect(opts.ignoreDuplicates).toBe(true);
  });

  test('throws when supabase returns an error', async () => {
    supabase.upsert.mockResolvedValueOnce({ error: { message: 'insert failed' } });
    await expect(
      TableRepository.createTable({ id: 'tbl-err', name: 'Fail', createdBy: 'u1' })
    ).rejects.toMatchObject({ message: 'insert failed' });
  });
});

// ─── getTable ─────────────────────────────────────────────────────────────────

describe('getTable', () => {
  test('returns the row from supabase single()', async () => {
    const fakeTable = { id: 'tbl-1', name: 'Poker Night', status: 'waiting' };
    supabase.single.mockResolvedValueOnce({ data: fakeTable, error: null });

    const result = await TableRepository.getTable('tbl-1');

    expect(supabase.from).toHaveBeenCalledWith('tables');
    expect(supabase.select).toHaveBeenCalledWith('*');
    expect(supabase.eq).toHaveBeenCalledWith('id', 'tbl-1');
    expect(result).toEqual(fakeTable);
  });

  test('returns null when table is not found', async () => {
    supabase.single.mockResolvedValueOnce({ data: null, error: null });
    const result = await TableRepository.getTable('missing-id');
    expect(result).toBeNull();
  });
});

// ─── listTables ───────────────────────────────────────────────────────────────

describe('listTables', () => {
  test('excludes completed tables and applies correct ordering', async () => {
    const fakeTables = [
      { id: 'tbl-1', status: 'waiting' },
      { id: 'tbl-2', status: 'active' },
    ];
    // listTables calls .order() twice — first returns chain, second resolves
    supabase.order
      .mockReturnValueOnce(supabase)
      .mockResolvedValueOnce({ data: fakeTables, error: null });

    const result = await TableRepository.listTables();

    expect(supabase.from).toHaveBeenCalledWith('tables');
    expect(supabase.neq).toHaveBeenCalledWith('status', 'completed');
    expect(supabase.order).toHaveBeenCalledWith('scheduled_for', { ascending: true, nullsFirst: false });
    expect(result).toEqual(fakeTables);
  });

  test('applies second order by created_at descending', async () => {
    // First order call returns chain, second order call resolves
    supabase.order
      .mockReturnValueOnce(supabase)  // first .order() returns chain
      .mockResolvedValueOnce({ data: [], error: null }); // second .order() resolves

    await TableRepository.listTables();

    expect(supabase.order).toHaveBeenCalledTimes(2);
    expect(supabase.order).toHaveBeenNthCalledWith(2, 'created_at', { ascending: false });
  });

  test('returns empty array when data is null', async () => {
    supabase.order
      .mockReturnValueOnce(supabase)
      .mockResolvedValueOnce({ data: null, error: null });
    const result = await TableRepository.listTables();
    expect(result).toEqual([]);
  });

  test('throws when supabase returns an error', async () => {
    supabase.order
      .mockReturnValueOnce(supabase)
      .mockResolvedValueOnce({ data: null, error: { message: 'query failed' } });
    await expect(TableRepository.listTables()).rejects.toMatchObject({ message: 'query failed' });
  });
});

// ─── closeTable ───────────────────────────────────────────────────────────────

describe('closeTable', () => {
  test('updates status to "completed" and sets closed_at', async () => {
    supabase.eq.mockResolvedValueOnce({ error: null });

    const before = Date.now();
    await TableRepository.closeTable('tbl-1');
    const after = Date.now();

    expect(supabase.from).toHaveBeenCalledWith('tables');
    expect(supabase.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed' })
    );
    expect(supabase.eq).toHaveBeenCalledWith('id', 'tbl-1');

    // closed_at should be a recent ISO string
    const updateArg = supabase.update.mock.calls[0][0];
    const closedAt = new Date(updateArg.closed_at).getTime();
    expect(closedAt).toBeGreaterThanOrEqual(before);
    expect(closedAt).toBeLessThanOrEqual(after);
  });

  test('throws when supabase returns an error', async () => {
    supabase.eq.mockResolvedValueOnce({ error: { message: 'update failed' } });
    await expect(TableRepository.closeTable('tbl-err')).rejects.toMatchObject({ message: 'update failed' });
  });
});

// ─── updateTable ──────────────────────────────────────────────────────────────

describe('updateTable', () => {
  test('maps camelCase patch keys to snake_case correctly', async () => {
    supabase.eq.mockResolvedValueOnce({ error: null });

    await TableRepository.updateTable('tbl-1', {
      status: 'active',
      name: 'Renamed',
      config: { ante: 5 },
      scheduledFor: '2026-05-01T18:00:00Z',
    });

    expect(supabase.update).toHaveBeenCalledWith({
      status: 'active',
      name: 'Renamed',
      config: { ante: 5 },
      scheduled_for: '2026-05-01T18:00:00Z',
    });
    expect(supabase.eq).toHaveBeenCalledWith('id', 'tbl-1');
  });

  test('only sends fields that are defined — omits undefined keys', async () => {
    supabase.eq.mockResolvedValueOnce({ error: null });

    await TableRepository.updateTable('tbl-1', { name: 'Only Name' });

    const updateArg = supabase.update.mock.calls[0][0];
    expect(updateArg).toEqual({ name: 'Only Name' });
    expect(updateArg).not.toHaveProperty('status');
    expect(updateArg).not.toHaveProperty('config');
    expect(updateArg).not.toHaveProperty('scheduled_for');
  });

  test('throws when supabase returns an error', async () => {
    supabase.eq.mockResolvedValueOnce({ error: { message: 'update error' } });
    await expect(
      TableRepository.updateTable('tbl-err', { status: 'paused' })
    ).rejects.toMatchObject({ message: 'update error' });
  });
});

// ─── activateScheduledTables ──────────────────────────────────────────────────

describe('activateScheduledTables', () => {
  test('calls update with status="waiting", filters by status="scheduled" and lte scheduled_for', async () => {
    const activated = [{ id: 'tbl-sched', name: 'Scheduled Table' }];
    supabase.select.mockResolvedValueOnce({ data: activated, error: null });

    const result = await TableRepository.activateScheduledTables();

    expect(supabase.from).toHaveBeenCalledWith('tables');
    expect(supabase.update).toHaveBeenCalledWith({ status: 'waiting' });
    expect(supabase.eq).toHaveBeenCalledWith('status', 'scheduled');
    expect(supabase.lte).toHaveBeenCalledWith(
      'scheduled_for',
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/)
    );
    expect(supabase.select).toHaveBeenCalledWith('id, name');
    expect(result).toEqual(activated);
  });

  test('returns empty array when data is null', async () => {
    supabase.select.mockResolvedValueOnce({ data: null, error: null });
    const result = await TableRepository.activateScheduledTables();
    expect(result).toEqual([]);
  });

  test('throws when supabase returns an error', async () => {
    supabase.select.mockResolvedValueOnce({ data: null, error: { message: 'activate failed' } });
    await expect(TableRepository.activateScheduledTables()).rejects.toMatchObject({ message: 'activate failed' });
  });

  test('lte timestamp is close to now', async () => {
    supabase.select.mockResolvedValueOnce({ data: [], error: null });

    const before = new Date().toISOString();
    await TableRepository.activateScheduledTables();
    const after = new Date().toISOString();

    const lteArg = supabase.lte.mock.calls[0][1];
    expect(lteArg >= before).toBe(true);
    expect(lteArg <= after).toBe(true);
  });
});

// ─── countActiveTablesByUser ──────────────────────────────────────────────────

describe('countActiveTablesByUser', () => {
  test('should count active tables created by a user', async () => {
    // The final neq call resolves with count
    supabase.neq.mockResolvedValueOnce({ count: 2, error: null });

    const count = await TableRepository.countActiveTablesByUser('user1');

    expect(supabase.from).toHaveBeenCalledWith('tables');
    expect(supabase.select).toHaveBeenCalledWith('id', { count: 'exact', head: true });
    expect(supabase.eq).toHaveBeenCalledWith('created_by', 'user1');
    expect(supabase.neq).toHaveBeenCalledWith('status', 'closed');
    expect(count).toBe(2);
  });

  test('should return 0 if user has no active tables', async () => {
    supabase.neq.mockResolvedValueOnce({ count: 0, error: null });

    const count = await TableRepository.countActiveTablesByUser('nonexistent-user');

    expect(count).toBe(0);
  });

  test('should not count closed tables', async () => {
    supabase.neq.mockResolvedValueOnce({ count: 0, error: null });

    const count = await TableRepository.countActiveTablesByUser('user1');

    expect(count).toBe(0);
    expect(supabase.neq).toHaveBeenCalledWith('status', 'closed');
  });

  test('throws when supabase returns an error', async () => {
    supabase.neq.mockResolvedValueOnce({ error: { message: 'query failed' } });

    await expect(TableRepository.countActiveTablesByUser('user1')).rejects.toMatchObject({
      message: 'query failed',
    });
  });
});
