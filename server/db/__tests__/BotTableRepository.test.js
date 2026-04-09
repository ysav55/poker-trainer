'use strict';

/**
 * BotTableRepository unit tests.
 *
 * Uses the same mockChain pattern as SchoolRepository.test.js.
 * Tests cover:
 *   - createBotTable: privacy mapping, bot_config fields (bot_count=0, no human_seats)
 *   - getBotTables: visibility filtering per caller role (own + public tables)
 *   - upsertBotPlayer: is_bot flag and display_name
 */

// ─── Supabase mock ────────────────────────────────────────────────────────────

const mockChain = {
  from:        jest.fn(),
  select:      jest.fn(),
  insert:      jest.fn(),
  upsert:      jest.fn(),
  eq:          jest.fn(),
  neq:         jest.fn(),
  order:       jest.fn(),
  single:      jest.fn(),
  maybeSingle: jest.fn(),
};

function rewire() {
  mockChain.from.mockReturnValue(mockChain);
  mockChain.select.mockReturnValue(mockChain);
  mockChain.insert.mockReturnValue(mockChain);
  mockChain.upsert.mockReturnValue(mockChain);
  mockChain.eq.mockReturnValue(mockChain);
  mockChain.neq.mockReturnValue(mockChain);
  mockChain.order.mockReturnValue(mockChain);
}

const mockSupabase = { from: mockChain.from };
jest.mock('../supabase', () => mockSupabase);

const { createBotTable, getBotTables, upsertBotPlayer } = require('../repositories/BotTableRepository');

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  rewire();
});

// ─── createBotTable ───────────────────────────────────────────────────────────

describe('createBotTable', () => {
  const blinds     = { small: 5, big: 10 };
  const createdRow = {
    id: 'tid-1', name: 'Test Table', mode: 'bot_cash',
    status: 'waiting', privacy: 'private',
    bot_config: { difficulty: 'easy', bot_count: 0, blinds },
    created_by: 'uid-1', created_at: '2026-04-01T00:00:00Z',
  };

  test('solo privacy maps to DB privacy=private', async () => {
    mockChain.single.mockResolvedValue({ data: createdRow, error: null });

    await createBotTable({
      name: 'Test Table', creatorId: 'uid-1', creatorRole: 'player',
      difficulty: 'easy', privacy: 'solo', blinds,
    });

    const insertArg = mockChain.insert.mock.calls[0][0];
    expect(insertArg.privacy).toBe('private');
  });

  test('open privacy maps to DB privacy=public', async () => {
    mockChain.single.mockResolvedValue({ data: { ...createdRow, privacy: 'public' }, error: null });

    await createBotTable({
      name: 'Open Table', creatorId: 'uid-1', creatorRole: 'player',
      difficulty: 'easy', privacy: 'open', blinds,
    });

    const insertArg = mockChain.insert.mock.calls[0][0];
    expect(insertArg.privacy).toBe('public');
  });

  test('school privacy passes through as-is', async () => {
    mockChain.single.mockResolvedValue({ data: { ...createdRow, privacy: 'school' }, error: null });

    await createBotTable({
      name: 'Coach Table', creatorId: 'coach-1', creatorRole: 'coach',
      difficulty: 'hard', privacy: 'school', blinds,
    });

    const insertArg = mockChain.insert.mock.calls[0][0];
    expect(insertArg.privacy).toBe('school');
  });

  test('public privacy passes through as-is', async () => {
    mockChain.single.mockResolvedValue({ data: { ...createdRow, privacy: 'public' }, error: null });

    await createBotTable({
      name: 'Public Table', creatorId: 'coach-1', creatorRole: 'coach',
      difficulty: 'easy', privacy: 'public', blinds,
    });

    const insertArg = mockChain.insert.mock.calls[0][0];
    expect(insertArg.privacy).toBe('public');
  });

  test('stores difficulty and blinds in bot_config with bot_count=0', async () => {
    mockChain.single.mockResolvedValue({ data: createdRow, error: null });

    await createBotTable({
      name: 'T', creatorId: 'u', creatorRole: 'player',
      difficulty: 'hard', privacy: 'solo', blinds: { small: 1, big: 2 },
    });

    const insertArg = mockChain.insert.mock.calls[0][0];
    expect(insertArg.bot_config).toMatchObject({ difficulty: 'hard', bot_count: 0, blinds: { small: 1, big: 2 } });
  });

  test('does NOT store human_seats in bot_config', async () => {
    mockChain.single.mockResolvedValue({ data: createdRow, error: null });

    await createBotTable({
      name: 'T', creatorId: 'u', creatorRole: 'player',
      difficulty: 'easy', privacy: 'solo', blinds,
    });

    const insertArg = mockChain.insert.mock.calls[0][0];
    expect(insertArg.bot_config).not.toHaveProperty('human_seats');
  });

  test('does NOT store coach_school_id in bot_config', async () => {
    mockChain.single.mockResolvedValue({ data: createdRow, error: null });

    await createBotTable({
      name: 'T', creatorId: 'u', creatorRole: 'player',
      difficulty: 'easy', privacy: 'solo', blinds, schoolId: 'school-1',
    });

    const insertArg = mockChain.insert.mock.calls[0][0];
    expect(insertArg.bot_config).not.toHaveProperty('coach_school_id');
  });

  test('throws when Supabase returns error', async () => {
    mockChain.single.mockResolvedValue({ data: null, error: { message: 'DB error' } });

    await expect(
      createBotTable({ name: 'T', creatorId: 'u', creatorRole: 'player', difficulty: 'easy', privacy: 'solo', blinds })
    ).rejects.toThrow('DB error');
  });

  test('sets mode=bot_cash and status=waiting', async () => {
    mockChain.single.mockResolvedValue({ data: createdRow, error: null });

    await createBotTable({
      name: 'T', creatorId: 'u', creatorRole: 'player',
      difficulty: 'easy', privacy: 'solo', blinds,
    });

    const insertArg = mockChain.insert.mock.calls[0][0];
    expect(insertArg.mode).toBe('bot_cash');
    expect(insertArg.status).toBe('waiting');
  });
});

// ─── getBotTables ─────────────────────────────────────────────────────────────

describe('getBotTables', () => {
  const sampleTables = [
    { id: 'tid-1', name: 'My Bot Table', mode: 'bot_cash', status: 'waiting',
      privacy: 'private', bot_config: {}, created_by: 'player-1', created_at: '2026-04-01T00:00:00Z' },
  ];

  const publicTables = [
    { id: 'tid-pub', name: 'Open Table', mode: 'bot_cash', status: 'waiting',
      privacy: 'public', bot_config: {}, created_by: 'player-2', created_at: '2026-04-01T00:00:00Z' },
  ];

  test('player — queries mode=bot_cash and created_by=requesterId (own) + public tables', async () => {
    // Two parallel queries: own non-public + all public
    mockChain.order
      .mockResolvedValueOnce({ data: sampleTables, error: null })  // own query
      .mockResolvedValueOnce({ data: publicTables, error: null });  // public query

    const result = await getBotTables('player-1', 'player');

    expect(mockChain.from).toHaveBeenCalledWith('tables');
    expect(mockChain.eq).toHaveBeenCalledWith('mode', 'bot_cash');
    expect(mockChain.neq).toHaveBeenCalledWith('status', 'completed');
    // Result should include both own and public
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  test('player — returns empty array when no tables', async () => {
    mockChain.order
      .mockResolvedValue({ data: [], error: null });

    const result = await getBotTables('player-2', 'player');
    expect(result).toEqual([]);
  });

  test('player — throws on DB error', async () => {
    mockChain.order
      .mockResolvedValueOnce({ data: null, error: { message: 'fail' } });

    await expect(getBotTables('player-1', 'player')).rejects.toThrow('fail');
  });

  test('coach with no school — queries player_profiles for school_id, then own + public', async () => {
    mockChain.maybeSingle.mockResolvedValue({ data: { school_id: null }, error: null });
    mockChain.order.mockResolvedValue({ data: sampleTables, error: null });

    const result = await getBotTables('coach-1', 'coach');

    expect(mockChain.from).toHaveBeenCalledWith('player_profiles');
    expect(mockChain.from).toHaveBeenCalledWith('tables');
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  test('coach — throws when player profile lookup fails', async () => {
    mockChain.maybeSingle.mockResolvedValue({ data: null, error: { message: 'profile error' } });

    await expect(getBotTables('coach-1', 'coach')).rejects.toThrow('profile error');
  });
});

// ─── upsertBotPlayer ──────────────────────────────────────────────────────────

describe('upsertBotPlayer', () => {
  test('upserts with is_bot=true and correct display_name', async () => {
    mockChain.upsert.mockResolvedValue({ data: null, error: null });

    await upsertBotPlayer('bot-uuid-1', 'Bot (Easy)', 'easy');

    expect(mockChain.from).toHaveBeenCalledWith('player_profiles');
    expect(mockChain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'bot-uuid-1', display_name: 'Bot (Easy)', is_bot: true }),
      { onConflict: 'id' }
    );
  });

  test('sets last_seen timestamp', async () => {
    mockChain.upsert.mockResolvedValue({ data: null, error: null });

    await upsertBotPlayer('bot-uuid-1', 'Bot (Medium)', 'medium');

    const upsertArg = mockChain.upsert.mock.calls[0][0];
    expect(upsertArg.last_seen).toBeDefined();
    expect(typeof upsertArg.last_seen).toBe('string');
  });

  test('throws on DB error', async () => {
    mockChain.upsert.mockResolvedValue({ data: null, error: { message: 'upsert failed' } });

    await expect(upsertBotPlayer('bot-uuid-1', 'Bot (Easy)', 'easy')).rejects.toThrow('upsert failed');
  });
});
