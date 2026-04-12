'use strict';

/**
 * TableRepository unit tests.
 *
 * Mocks supabase so no real DB or network calls are made.
 * TableRepository uses the raw supabase client directly (no q() helper).
 */

// ─── Supabase mock ────────────────────────────────────────────────────────────

jest.mock('../db/supabase', () => {
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
  return chain;
});

// ─── Module under test ────────────────────────────────────────────────────────

const { TableRepository } = require('../db/repositories/TableRepository');
const supabase = require('../db/supabase');

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  // Re-wire all chain methods after clearAllMocks resets implementations
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
  supabase.single.mockResolvedValue({ data: null, error: null });
});

// ─── createTable ──────────────────────────────────────────────────────────────

describe('createTable', () => {
  test('calls supabase upsert with correct shape', async () => {
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
        id:         'tbl-1',
        name:       'Test Table',
        mode:       'coached_cash',
        config:     { blinds: [1, 2] },
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

  test('throws when supabase returns an error', async () => {
    supabase.upsert.mockResolvedValueOnce({ error: { message: 'insert failed' } });
    await expect(
      TableRepository.createTable({ id: 'tbl-err', name: 'Fail', createdBy: 'u1' })
    ).rejects.toMatchObject({ message: 'insert failed' });
  });
});

// ─── getTable ─────────────────────────────────────────────────────────────────

describe('getTable', () => {
  test('queries by id, returns the row', async () => {
    const fakeTable = { id: 'tbl-1', name: 'Poker Night', status: 'waiting' };
    supabase.single.mockResolvedValueOnce({ data: fakeTable, error: null });

    const result = await TableRepository.getTable('tbl-1');

    expect(supabase.from).toHaveBeenCalledWith('tables');
    expect(supabase.select).toHaveBeenCalledWith('*');
    expect(supabase.eq).toHaveBeenCalledWith('id', 'tbl-1');
    expect(result).toEqual(fakeTable);
  });

  test('returns null when not found', async () => {
    supabase.single.mockResolvedValueOnce({ data: null, error: null });
    const result = await TableRepository.getTable('missing-id');
    expect(result).toBeNull();
  });
});

// ─── listTables ───────────────────────────────────────────────────────────────

describe('listTables', () => {
  test('returns array from supabase', async () => {
    const fakeTables = [
      { id: 'tbl-1', status: 'waiting' },
      { id: 'tbl-2', status: 'active' },
    ];
    // listTables chains two .order() calls; first returns chain, second resolves
    supabase.order
      .mockReturnValueOnce(supabase)
      .mockResolvedValueOnce({ data: fakeTables, error: null });

    const result = await TableRepository.listTables();

    expect(supabase.from).toHaveBeenCalledWith('tables');
    expect(supabase.neq).toHaveBeenCalledWith('status', 'completed');
    expect(result).toEqual(fakeTables);
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
  test('sets status="completed"', async () => {
    supabase.eq.mockResolvedValueOnce({ error: null });

    await TableRepository.closeTable('tbl-1');

    expect(supabase.from).toHaveBeenCalledWith('tables');
    expect(supabase.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed' })
    );
    expect(supabase.eq).toHaveBeenCalledWith('id', 'tbl-1');
  });

  test('throws when supabase returns an error', async () => {
    supabase.eq.mockResolvedValueOnce({ error: { message: 'update failed' } });
    await expect(TableRepository.closeTable('tbl-err')).rejects.toMatchObject({ message: 'update failed' });
  });
});

// ─── updateTable ──────────────────────────────────────────────────────────────

describe('updateTable', () => {
  test('calls update with provided fields', async () => {
    supabase.eq.mockResolvedValueOnce({ error: null });

    await TableRepository.updateTable('tbl-1', {
      status: 'active',
      name:   'Renamed',
    });

    expect(supabase.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'active', name: 'Renamed' })
    );
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

// ─── getTable — additional edge cases ────────────────────────────────────────

describe('getTable — additional edge cases', () => {
  test('returns null when Supabase returns empty-ish single (data is undefined)', async () => {
    // Some Supabase versions return { data: undefined } for no-row single()
    supabase.single.mockResolvedValueOnce({ data: undefined, error: null });
    const result = await TableRepository.getTable('tbl-undefined');
    // data ?? null → undefined ?? null → null
    expect(result == null).toBe(true);
  });
});

// ─── closeTable — idempotency ─────────────────────────────────────────────────

describe('closeTable — idempotency', () => {
  test('calling closeTable twice on the same id does not throw', async () => {
    supabase.eq.mockResolvedValueOnce({ error: null });
    supabase.eq.mockResolvedValueOnce({ error: null });

    await expect(TableRepository.closeTable('tbl-idem')).resolves.toBeUndefined();
    await expect(TableRepository.closeTable('tbl-idem')).resolves.toBeUndefined();

    expect(supabase.update).toHaveBeenCalledTimes(2);
    expect(supabase.eq).toHaveBeenCalledTimes(2);
  });
});

// ─── updateTable — partial update ─────────────────────────────────────────────

describe('updateTable — partial update', () => {
  test('updates only the provided subset of fields, omitting others', async () => {
    supabase.eq.mockResolvedValueOnce({ error: null });

    await TableRepository.updateTable('tbl-partial', { config: { blinds: [5, 10] } });

    const updateArg = supabase.update.mock.calls[0][0];
    expect(updateArg).toEqual({ config: { blinds: [5, 10] } });
    expect(updateArg).not.toHaveProperty('status');
    expect(updateArg).not.toHaveProperty('name');
    expect(updateArg).not.toHaveProperty('scheduled_for');
  });

  test('maps scheduledFor to scheduled_for column', async () => {
    supabase.eq.mockResolvedValueOnce({ error: null });
    const ts = '2026-05-01T08:00:00Z';

    await TableRepository.updateTable('tbl-sched', { scheduledFor: ts });

    const updateArg = supabase.update.mock.calls[0][0];
    expect(updateArg.scheduled_for).toBe(ts);
    expect(updateArg).not.toHaveProperty('scheduledFor');
  });
});

// ─── listTables — status filter ───────────────────────────────────────────────

describe('listTables — status filter behaviour', () => {
  test('always excludes rows with status="completed" via neq', async () => {
    supabase.order
      .mockReturnValueOnce(supabase)
      .mockResolvedValueOnce({ data: [{ id: 'tbl-active', status: 'active' }], error: null });

    const result = await TableRepository.listTables();

    // The neq call should have excluded completed tables
    expect(supabase.neq).toHaveBeenCalledWith('status', 'completed');
    expect(result).toEqual([{ id: 'tbl-active', status: 'active' }]);
  });

  test('returns only rows that Supabase sends back (filter is DB-side)', async () => {
    // Simulate DB returning only "waiting" rows after the filter is applied
    const waitingOnly = [
      { id: 'tbl-w1', status: 'waiting' },
      { id: 'tbl-w2', status: 'waiting' },
    ];
    supabase.order
      .mockReturnValueOnce(supabase)
      .mockResolvedValueOnce({ data: waitingOnly, error: null });

    const result = await TableRepository.listTables();

    expect(result).toHaveLength(2);
    result.forEach(t => expect(t.status).toBe('waiting'));
  });
});

// ─── activateScheduledTables ──────────────────────────────────────────────────

describe('activateScheduledTables', () => {
  test('updates status from "scheduled" to "waiting" for tables where scheduled_for <= now', async () => {
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
});
