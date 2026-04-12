'use strict';

/**
 * TableRepository / InvitedPlayersRepository / TablePresetsRepository
 * Unit tests for POK-29 additions.
 *
 * All supabase calls are mocked — no real DB required.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../supabase', () => {
  const chain = {};
  chain.from   = jest.fn(() => chain);
  chain.select = jest.fn(() => chain);
  chain.insert = jest.fn(() => chain);
  chain.upsert = jest.fn(() => chain);
  chain.update = jest.fn(() => chain);
  chain.delete = jest.fn(() => chain);
  chain.eq     = jest.fn(() => chain);
  chain.order  = jest.fn(() => chain);
  chain.single = jest.fn(() => Promise.resolve({ data: null, error: null }));
  return chain;
});

const { TableRepository, InvitedPlayersRepository, TablePresetsRepository } =
  require('../repositories/TableRepository');
const supabase = require('../supabase');

beforeEach(() => {
  jest.clearAllMocks();
  supabase.from.mockReturnValue(supabase);
  supabase.select.mockReturnValue(supabase);
  supabase.insert.mockReturnValue(supabase);
  supabase.upsert.mockReturnValue(supabase);
  supabase.update.mockReturnValue(supabase);
  supabase.delete.mockReturnValue(supabase);
  supabase.eq.mockReturnValue(supabase);
  supabase.order.mockReturnValue(supabase);
  supabase.single.mockResolvedValue({ data: null, error: null });
});

// ─── TableRepository — privacy + controller columns ──────────────────────────

describe('TableRepository.createTable — privacy and controllerId', () => {
  test('passes privacy and controller_id to upsert', async () => {
    supabase.upsert.mockResolvedValueOnce({ error: null });

    await TableRepository.createTable({
      id: 'tbl-1',
      name: 'Private Table',
      createdBy: 'coach-uuid',
      privacy: 'private',
      controllerId: 'coach-uuid',
    });

    expect(supabase.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ privacy: 'private', controller_id: 'coach-uuid' }),
      expect.any(Object)
    );
  });

  test('defaults to open privacy when omitted', async () => {
    supabase.upsert.mockResolvedValueOnce({ error: null });

    await TableRepository.createTable({ id: 'tbl-2', name: 'Open', createdBy: 'u1' });

    expect(supabase.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ privacy: 'open', controller_id: null }),
      expect.any(Object)
    );
  });
});

describe('TableRepository.updateTable — privacy and controllerId', () => {
  test('maps privacy to dbPatch', async () => {
    supabase.eq.mockResolvedValueOnce({ error: null });

    await TableRepository.updateTable('tbl-1', { privacy: 'school' });

    expect(supabase.update).toHaveBeenCalledWith(expect.objectContaining({ privacy: 'school' }));
  });

  test('maps controllerId to controller_id in dbPatch', async () => {
    supabase.eq.mockResolvedValueOnce({ error: null });

    await TableRepository.updateTable('tbl-1', { controllerId: 'new-coach' });

    expect(supabase.update).toHaveBeenCalledWith(expect.objectContaining({ controller_id: 'new-coach' }));
  });
});

describe('TableRepository.setController', () => {
  test('updates controller_id on the table', async () => {
    supabase.eq.mockResolvedValueOnce({ error: null });

    await TableRepository.setController('tbl-1', 'coach-uuid');

    expect(supabase.from).toHaveBeenCalledWith('tables');
    expect(supabase.update).toHaveBeenCalledWith({ controller_id: 'coach-uuid' });
    expect(supabase.eq).toHaveBeenCalledWith('id', 'tbl-1');
  });

  test('throws when supabase returns an error', async () => {
    supabase.eq.mockResolvedValueOnce({ error: { message: 'update failed' } });
    await expect(TableRepository.setController('bad', 'u')).rejects.toMatchObject({ message: 'update failed' });
  });
});

// ─── InvitedPlayersRepository ─────────────────────────────────────────────────

describe('InvitedPlayersRepository.addInvite', () => {
  test('upserts to invited_players with ignoreDuplicates', async () => {
    supabase.upsert.mockResolvedValueOnce({ error: null });

    await InvitedPlayersRepository.addInvite('tbl-1', 'player-uuid', 'coach-uuid');

    expect(supabase.from).toHaveBeenCalledWith('invited_players');
    expect(supabase.upsert).toHaveBeenCalledWith(
      { table_id: 'tbl-1', player_id: 'player-uuid', added_by: 'coach-uuid' },
      { onConflict: 'table_id,player_id', ignoreDuplicates: true }
    );
  });

  test('throws on supabase error', async () => {
    supabase.upsert.mockResolvedValueOnce({ error: { message: 'upsert fail' } });
    await expect(InvitedPlayersRepository.addInvite('t', 'p', 'c')).rejects.toMatchObject({ message: 'upsert fail' });
  });
});

describe('InvitedPlayersRepository.removeInvite', () => {
  test('deletes the row matching table_id and player_id', async () => {
    // Two eq() calls: first returns chain, second resolves the await
    supabase.eq.mockReturnValueOnce(supabase).mockResolvedValueOnce({ error: null });

    await InvitedPlayersRepository.removeInvite('tbl-1', 'player-uuid');

    expect(supabase.from).toHaveBeenCalledWith('invited_players');
    expect(supabase.delete).toHaveBeenCalled();
    expect(supabase.eq).toHaveBeenCalledWith('table_id', 'tbl-1');
    expect(supabase.eq).toHaveBeenCalledWith('player_id', 'player-uuid');
  });
});

describe('InvitedPlayersRepository.listInvited', () => {
  test('returns rows ordered by added_at asc', async () => {
    const rows = [
      { player_id: 'p1', added_by: 'c1', added_at: '2026-01-01T00:00:00Z' },
      { player_id: 'p2', added_by: 'c1', added_at: '2026-01-02T00:00:00Z' },
    ];
    supabase.order.mockResolvedValueOnce({ data: rows, error: null });

    const result = await InvitedPlayersRepository.listInvited('tbl-1');

    expect(supabase.from).toHaveBeenCalledWith('invited_players');
    expect(supabase.eq).toHaveBeenCalledWith('table_id', 'tbl-1');
    expect(result).toEqual(rows);
  });

  test('returns empty array when no rows', async () => {
    supabase.order.mockResolvedValueOnce({ data: null, error: null });
    const result = await InvitedPlayersRepository.listInvited('tbl-1');
    expect(result).toEqual([]);
  });
});

describe('InvitedPlayersRepository.isInvited', () => {
  test('returns true when player row is found', async () => {
    supabase.single.mockResolvedValueOnce({ data: { player_id: 'p1' }, error: null });

    const result = await InvitedPlayersRepository.isInvited('tbl-1', 'p1');

    expect(result).toBe(true);
  });

  test('returns false when no row (PGRST116)', async () => {
    supabase.single.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });

    const result = await InvitedPlayersRepository.isInvited('tbl-1', 'unknown');

    expect(result).toBe(false);
  });

  test('throws on non-PGRST116 errors', async () => {
    supabase.single.mockResolvedValueOnce({ data: null, error: { code: 'OTHER', message: 'db error' } });
    await expect(InvitedPlayersRepository.isInvited('t', 'p')).rejects.toMatchObject({ code: 'OTHER' });
  });
});

// ─── TablePresetsRepository ───────────────────────────────────────────────────

describe('TablePresetsRepository.save', () => {
  test('inserts row and returns id', async () => {
    supabase.single.mockResolvedValueOnce({ data: { id: 'preset-uuid' }, error: null });
    supabase.select.mockReturnValue(supabase);

    const result = await TablePresetsRepository.save({
      coachId: 'coach-1',
      name: 'My Preset',
      config: { blinds: [25, 50] },
    });

    expect(supabase.from).toHaveBeenCalledWith('table_presets');
    expect(supabase.insert).toHaveBeenCalledWith({
      coach_id: 'coach-1',
      name: 'My Preset',
      config: { blinds: [25, 50] },
    });
    expect(result).toEqual({ id: 'preset-uuid' });
  });
});

describe('TablePresetsRepository.list', () => {
  test('queries by coach_id and returns presets', async () => {
    const presets = [
      { id: 'p1', name: 'Preset A', config: {}, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    ];
    supabase.order.mockResolvedValueOnce({ data: presets, error: null });

    const result = await TablePresetsRepository.list('coach-1');

    expect(supabase.from).toHaveBeenCalledWith('table_presets');
    expect(supabase.eq).toHaveBeenCalledWith('coach_id', 'coach-1');
    expect(result).toEqual(presets);
  });

  test('returns empty array when no presets', async () => {
    supabase.order.mockResolvedValueOnce({ data: null, error: null });
    const result = await TablePresetsRepository.list('nobody');
    expect(result).toEqual([]);
  });
});

describe('TablePresetsRepository.update', () => {
  test('sends name and config with updated_at, scoped to coach', async () => {
    supabase.eq.mockReturnValueOnce(supabase).mockResolvedValueOnce({ error: null });

    const before = new Date().toISOString();
    await TablePresetsRepository.update('preset-1', 'coach-1', { name: 'Renamed', config: { x: 1 } });
    const after = new Date().toISOString();

    expect(supabase.update).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Renamed', config: { x: 1 } })
    );
    // Check updated_at is a recent ISO string
    const patch = supabase.update.mock.calls[0][0];
    expect(patch.updated_at >= before).toBe(true);
    expect(patch.updated_at <= after).toBe(true);

    expect(supabase.eq).toHaveBeenCalledWith('id', 'preset-1');
    expect(supabase.eq).toHaveBeenCalledWith('coach_id', 'coach-1');
  });
});

describe('TablePresetsRepository.delete', () => {
  test('deletes scoped to coach_id', async () => {
    supabase.eq.mockReturnValueOnce(supabase).mockResolvedValueOnce({ error: null });

    await TablePresetsRepository.delete('preset-1', 'coach-1');

    expect(supabase.from).toHaveBeenCalledWith('table_presets');
    expect(supabase.delete).toHaveBeenCalled();
    expect(supabase.eq).toHaveBeenCalledWith('id', 'preset-1');
    expect(supabase.eq).toHaveBeenCalledWith('coach_id', 'coach-1');
  });
});
