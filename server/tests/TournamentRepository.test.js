'use strict';

/**
 * TournamentRepository unit tests.
 *
 * Mocks supabase so no real DB or network calls are made.
 * TournamentRepository uses the raw supabase client directly.
 */

// ─── Supabase mock ────────────────────────────────────────────────────────────

jest.mock('../db/supabase', () => {
  const chain = {};
  chain.from       = jest.fn(() => chain);
  chain.select     = jest.fn(() => chain);
  chain.insert     = jest.fn(() => chain);
  chain.upsert     = jest.fn(() => chain);
  chain.update     = jest.fn(() => chain);
  chain.eq         = jest.fn(() => chain);
  chain.order      = jest.fn(() => chain);
  chain.single     = jest.fn(() => Promise.resolve({ data: null, error: null }));
  chain.maybeSingle = jest.fn(() => Promise.resolve({ data: null, error: null }));
  return chain;
});

// ─── Module under test ────────────────────────────────────────────────────────

const { TournamentRepository } = require('../db/repositories/TournamentRepository');
const supabase = require('../db/supabase');

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  supabase.from.mockReturnValue(supabase);
  supabase.select.mockReturnValue(supabase);
  supabase.insert.mockReturnValue(supabase);
  supabase.upsert.mockReturnValue(supabase);
  supabase.update.mockReturnValue(supabase);
  supabase.eq.mockReturnValue(supabase);
  supabase.order.mockReturnValue(supabase);
  supabase.single.mockResolvedValue({ data: null, error: null });
  supabase.maybeSingle.mockResolvedValue({ data: null, error: null });
});

// ─── createConfig ─────────────────────────────────────────────────────────────

describe('createConfig', () => {
  test('inserts and returns id', async () => {
    const newId = 'cfg-uuid-001';
    supabase.single.mockResolvedValueOnce({ data: { id: newId }, error: null });

    const result = await TournamentRepository.createConfig({
      tableId:       'tbl-1',
      blindSchedule: [{ level: 1, sb: 25, bb: 50, ante: 0, duration_minutes: 20 }],
      startingStack: 5000,
    });

    expect(supabase.from).toHaveBeenCalledWith('tournament_configs');
    expect(supabase.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        table_id:       'tbl-1',
        starting_stack: 5000,
      })
    );
    expect(supabase.select).toHaveBeenCalledWith('id');
    expect(result).toBe(newId);
  });

  test('passes rebuyAllowed and rebuyLevelCap to insert', async () => {
    supabase.single.mockResolvedValueOnce({ data: { id: 'cfg-002' }, error: null });

    await TournamentRepository.createConfig({
      tableId:       'tbl-2',
      blindSchedule: [],
      startingStack: 3000,
      rebuyAllowed:   true,
      rebuyLevelCap:  3,
    });

    const insertArg = supabase.insert.mock.calls[0][0];
    expect(insertArg.rebuy_allowed).toBe(true);
    expect(insertArg.rebuy_level_cap).toBe(3);
  });

  test('throws when supabase returns an error', async () => {
    supabase.single.mockResolvedValueOnce({ data: null, error: { message: 'insert error' } });
    await expect(
      TournamentRepository.createConfig({ tableId: 'tbl-err', blindSchedule: [], startingStack: 1000 })
    ).rejects.toMatchObject({ message: 'insert error' });
  });
});

// ─── getConfig ────────────────────────────────────────────────────────────────

describe('getConfig', () => {
  test('queries by table_id', async () => {
    const fakeConfig = { id: 'cfg-1', table_id: 'tbl-1', starting_stack: 5000 };
    supabase.maybeSingle.mockResolvedValueOnce({ data: fakeConfig, error: null });

    const result = await TournamentRepository.getConfig('tbl-1');

    expect(supabase.from).toHaveBeenCalledWith('tournament_configs');
    expect(supabase.select).toHaveBeenCalledWith('*');
    expect(supabase.eq).toHaveBeenCalledWith('table_id', 'tbl-1');
    expect(result).toEqual(fakeConfig);
  });

  test('returns null when config not found', async () => {
    supabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const result = await TournamentRepository.getConfig('missing-tbl');
    expect(result).toBeNull();
  });

  test('throws when supabase returns an error', async () => {
    supabase.maybeSingle.mockResolvedValueOnce({ data: null, error: { message: 'query error' } });
    await expect(TournamentRepository.getConfig('tbl-err')).rejects.toMatchObject({ message: 'query error' });
  });
});

// ─── recordElimination ────────────────────────────────────────────────────────

describe('recordElimination', () => {
  test('calls upsert with correct fields', async () => {
    supabase.upsert.mockResolvedValueOnce({ error: null });

    await TournamentRepository.recordElimination({
      tableId:           'tbl-1',
      playerId:          'player-001',
      position:          3,
      chipsAtElimination: 0,
    });

    expect(supabase.from).toHaveBeenCalledWith('tournament_standings');
    expect(supabase.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        table_id:             'tbl-1',
        player_id:            'player-001',
        finish_position:      3,
        chips_at_elimination: 0,
      }),
      { onConflict: 'table_id,player_id' }
    );
  });

  test('includes eliminated_at timestamp', async () => {
    supabase.upsert.mockResolvedValueOnce({ error: null });

    const before = new Date().toISOString();
    await TournamentRepository.recordElimination({
      tableId: 'tbl-1', playerId: 'p1', position: 2, chipsAtElimination: 100,
    });
    const after = new Date().toISOString();

    const upsertArg = supabase.upsert.mock.calls[0][0];
    expect(upsertArg.eliminated_at >= before).toBe(true);
    expect(upsertArg.eliminated_at <= after).toBe(true);
  });

  test('throws when supabase returns an error', async () => {
    supabase.upsert.mockResolvedValueOnce({ error: { message: 'upsert failed' } });
    await expect(
      TournamentRepository.recordElimination({ tableId: 'tbl-err', playerId: 'p1', position: 1 })
    ).rejects.toMatchObject({ message: 'upsert failed' });
  });
});

// ─── recordElimination — winner record (position=1) ───────────────────────────

describe('recordElimination — winner record', () => {
  test('records position=1 (the tournament winner) correctly', async () => {
    supabase.upsert.mockResolvedValueOnce({ error: null });

    await TournamentRepository.recordElimination({
      tableId:            'tbl-winner',
      playerId:           'player-winner',
      position:           1,
      chipsAtElimination: 15000,
    });

    expect(supabase.from).toHaveBeenCalledWith('tournament_standings');
    expect(supabase.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        table_id:             'tbl-winner',
        player_id:            'player-winner',
        finish_position:      1,
        chips_at_elimination: 15000,
      }),
      { onConflict: 'table_id,player_id' }
    );
  });
});

// ─── getStandings ─────────────────────────────────────────────────────────────

describe('getStandings', () => {
  test('orders by finish_position ascending', async () => {
    const fakeStandings = [
      { finish_position: 1, player_id: 'p1', player_profiles: { display_name: 'Alice' } },
      { finish_position: 2, player_id: 'p2', player_profiles: { display_name: 'Bob' } },
    ];
    supabase.order.mockResolvedValueOnce({ data: fakeStandings, error: null });

    const result = await TournamentRepository.getStandings('tbl-1');

    expect(supabase.from).toHaveBeenCalledWith('tournament_standings');
    expect(supabase.select).toHaveBeenCalledWith('*, player_profiles(display_name)');
    expect(supabase.eq).toHaveBeenCalledWith('table_id', 'tbl-1');
    expect(supabase.order).toHaveBeenCalledWith('finish_position', { ascending: true });
    expect(result).toEqual(fakeStandings);
  });

  test('returns empty array when data is null', async () => {
    supabase.order.mockResolvedValueOnce({ data: null, error: null });
    const result = await TournamentRepository.getStandings('tbl-empty');
    expect(result).toEqual([]);
  });

  test('returns empty array when no players have been recorded yet', async () => {
    // Simulate a tournament that just started — no standings rows at all
    supabase.order.mockResolvedValueOnce({ data: [], error: null });
    const result = await TournamentRepository.getStandings('tbl-fresh');
    expect(result).toEqual([]);
    expect(result).toHaveLength(0);
  });

  test('throws when supabase returns an error', async () => {
    supabase.order.mockResolvedValueOnce({ data: null, error: { message: 'standings error' } });
    await expect(TournamentRepository.getStandings('tbl-err')).rejects.toMatchObject({ message: 'standings error' });
  });
});

// ─── getConfig — null when not found ─────────────────────────────────────────

describe('getConfig — null when no config found', () => {
  test('returns null when maybeSingle resolves with no data (table has no config)', async () => {
    supabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const result = await TournamentRepository.getConfig('tbl-no-config');
    expect(result).toBeNull();
  });

  test('passes the tableId to the eq filter', async () => {
    supabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await TournamentRepository.getConfig('tbl-filter-check');
    expect(supabase.eq).toHaveBeenCalledWith('table_id', 'tbl-filter-check');
  });
});

// ─── addGroupToWhitelist ──────────────────────────────────────────────────────

describe('addGroupToWhitelist', () => {
  test('fetches group members and adds each to whitelist', async () => {
    const groupMembers = [
      { player_id: 'player-1' },
      { player_id: 'player-2' },
      { player_id: 'player-3' },
    ];

    // Mock: fetch group members
    supabase.order.mockResolvedValueOnce({ data: groupMembers, error: null });

    // Mock: addToWhitelist calls (3 calls, no duplicates)
    const addToWhitelistSpy = jest.spyOn(TournamentRepository, 'addToWhitelist')
      .mockResolvedValue(undefined);

    const count = await TournamentRepository.addGroupToWhitelist(
      'tournament-1',
      'group-1',
      'admin-user'
    );

    expect(supabase.from).toHaveBeenCalledWith('player_groups');
    expect(supabase.eq).toHaveBeenCalledWith('group_id', 'group-1');
    expect(addToWhitelistSpy).toHaveBeenCalledTimes(3);
    expect(addToWhitelistSpy).toHaveBeenCalledWith('tournament-1', 'player-1', 'admin-user');
    expect(addToWhitelistSpy).toHaveBeenCalledWith('tournament-1', 'player-2', 'admin-user');
    expect(addToWhitelistSpy).toHaveBeenCalledWith('tournament-1', 'player-3', 'admin-user');
    expect(count).toBe(3);

    addToWhitelistSpy.mockRestore();
  });

  test('returns 0 when group has no members', async () => {
    supabase.order.mockResolvedValueOnce({ data: [], error: null });

    const addToWhitelistSpy = jest.spyOn(TournamentRepository, 'addToWhitelist')
      .mockResolvedValue(undefined);

    const count = await TournamentRepository.addGroupToWhitelist(
      'tournament-1',
      'empty-group',
      'admin-user'
    );

    expect(addToWhitelistSpy).not.toHaveBeenCalled();
    expect(count).toBe(0);

    addToWhitelistSpy.mockRestore();
  });

  test('throws when supabase returns an error', async () => {
    supabase.order.mockResolvedValueOnce({ data: null, error: { message: 'group fetch failed' } });

    await expect(
      TournamentRepository.addGroupToWhitelist('tournament-1', 'group-1', 'admin-user')
    ).rejects.toMatchObject({ message: 'group fetch failed' });
  });
});
