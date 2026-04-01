'use strict';

/**
 * BotTableRepository unit tests.
 *
 * Uses the same mockChain pattern as SchoolRepository.test.js.
 * Tests cover:
 *   - createBotTable: privacy rules per creator role, bot_config fields
 *   - getBotTables: visibility filtering per caller role
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
    bot_config: { difficulty: 'easy', human_seats: 2, blinds },
    created_by: 'uid-1', created_at: '2026-04-01T00:00:00Z',
  };

  test('solo player — privacy=private, no coach_school_id', async () => {
    mockChain.single.mockResolvedValue({ data: createdRow, error: null });

    const result = await createBotTable({
      name: 'Test Table', creatorId: 'uid-1', creatorRole: 'player',
      difficulty: 'easy', humanSeats: 2, blinds, schoolId: null,
    });

    expect(mockChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'bot_cash', privacy: 'private' })
    );
    // No coach_school_id when schoolId is null
    const insertArg = mockChain.insert.mock.calls[0][0];
    expect(insertArg.bot_config).not.toHaveProperty('coach_school_id');
    expect(result).toEqual(createdRow);
  });

  test('coached player — privacy=private with coach_school_id in bot_config', async () => {
    mockChain.single.mockResolvedValue({ data: { ...createdRow }, error: null });

    await createBotTable({
      name: 'Test Table', creatorId: 'uid-2', creatorRole: 'player',
      difficulty: 'medium', humanSeats: 3, blinds, schoolId: 'school-1',
    });

    const insertArg = mockChain.insert.mock.calls[0][0];
    expect(insertArg.privacy).toBe('private');
    expect(insertArg.bot_config).toMatchObject({ coach_school_id: 'school-1' });
  });

  test('coach — privacy=school', async () => {
    mockChain.single.mockResolvedValue({ data: { ...createdRow, privacy: 'school' }, error: null });

    await createBotTable({
      name: 'Coach Table', creatorId: 'coach-1', creatorRole: 'coach',
      difficulty: 'hard', humanSeats: 4, blinds, schoolId: 'school-1',
    });

    const insertArg = mockChain.insert.mock.calls[0][0];
    expect(insertArg.privacy).toBe('school');
  });

  test('stores difficulty and human_seats in bot_config', async () => {
    mockChain.single.mockResolvedValue({ data: createdRow, error: null });

    await createBotTable({
      name: 'T', creatorId: 'u', creatorRole: 'player',
      difficulty: 'hard', humanSeats: 6, blinds: { small: 1, big: 2 },
    });

    const insertArg = mockChain.insert.mock.calls[0][0];
    expect(insertArg.bot_config).toMatchObject({ difficulty: 'hard', human_seats: 6, blinds: { small: 1, big: 2 } });
  });

  test('throws when Supabase returns error', async () => {
    mockChain.single.mockResolvedValue({ data: null, error: { message: 'DB error' } });

    await expect(
      createBotTable({ name: 'T', creatorId: 'u', creatorRole: 'player', difficulty: 'easy', humanSeats: 1, blinds })
    ).rejects.toThrow('DB error');
  });

  test('sets mode=bot_cash and status=waiting', async () => {
    mockChain.single.mockResolvedValue({ data: createdRow, error: null });

    await createBotTable({
      name: 'T', creatorId: 'u', creatorRole: 'player',
      difficulty: 'easy', humanSeats: 1, blinds,
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

  test('player — queries mode=bot_cash and created_by=requesterId', async () => {
    mockChain.order.mockResolvedValue({ data: sampleTables, error: null });

    const result = await getBotTables('player-1', 'player');

    expect(mockChain.from).toHaveBeenCalledWith('tables');
    expect(mockChain.eq).toHaveBeenCalledWith('mode', 'bot_cash');
    expect(mockChain.neq).toHaveBeenCalledWith('status', 'completed');
    expect(mockChain.eq).toHaveBeenCalledWith('created_by', 'player-1');
    expect(result).toEqual(sampleTables);
  });

  test('player — returns empty array when no tables', async () => {
    mockChain.order.mockResolvedValue({ data: [], error: null });

    const result = await getBotTables('player-2', 'player');
    expect(result).toEqual([]);
  });

  test('player — throws on DB error', async () => {
    mockChain.order.mockResolvedValue({ data: null, error: { message: 'fail' } });

    await expect(getBotTables('player-1', 'player')).rejects.toThrow('fail');
  });

  test('coach with no school — queries player_profiles for school_id, then own tables', async () => {
    // Both paths now end with .order() as the terminal call
    mockChain.maybeSingle.mockResolvedValue({ data: { school_id: null }, error: null });
    mockChain.order.mockResolvedValue({ data: sampleTables, error: null });

    const result = await getBotTables('coach-1', 'coach');

    expect(mockChain.from).toHaveBeenCalledWith('player_profiles');
    expect(mockChain.from).toHaveBeenCalledWith('tables');
    expect(result).toEqual(sampleTables);
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
