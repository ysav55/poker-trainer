'use strict';

/**
 * AnnouncementRepository unit tests.
 *
 * All Supabase calls are mocked. Tests verify:
 *   - createAnnouncement (inserts, validates, returns row)
 *   - listForPlayer (fetches filtered list, maps read_at)
 *   - markRead (upserts read receipt, idempotent)
 *   - unreadCount (computes visible – read)
 */

// ─── Supabase mock ────────────────────────────────────────────────────────────

const mockChain = {
  from:      jest.fn(),
  select:    jest.fn(),
  insert:    jest.fn(),
  upsert:    jest.fn(),
  eq:        jest.fn(),
  in:        jest.fn(),
  or:        jest.fn(),
  order:     jest.fn(),
  range:     jest.fn(),
  single:    jest.fn(),
};

// All chainable methods return the chain itself by default.
mockChain.from.mockReturnValue(mockChain);
mockChain.select.mockReturnValue(mockChain);
mockChain.insert.mockReturnValue(mockChain);
mockChain.upsert.mockReturnValue(mockChain);
mockChain.eq.mockReturnValue(mockChain);
mockChain.in.mockReturnValue(mockChain);
mockChain.or.mockReturnValue(mockChain);
mockChain.order.mockReturnValue(mockChain);
mockChain.range.mockReturnValue(mockChain);

const mockSupabase = { from: mockChain.from };
jest.mock('../../db/supabase', () => mockSupabase);

// ─── Module under test ────────────────────────────────────────────────────────

const {
  createAnnouncement,
  listForPlayer,
  markRead,
  unreadCount,
} = require('../repositories/AnnouncementRepository');

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  // Re-wire chain after clearAllMocks
  mockChain.from.mockReturnValue(mockChain);
  mockChain.select.mockReturnValue(mockChain);
  mockChain.insert.mockReturnValue(mockChain);
  mockChain.upsert.mockReturnValue(mockChain);
  mockChain.eq.mockReturnValue(mockChain);
  mockChain.in.mockReturnValue(mockChain);
  mockChain.or.mockReturnValue(mockChain);
  mockChain.order.mockReturnValue(mockChain);
  mockChain.range.mockReturnValue(mockChain);
  mockSupabase.from = mockChain.from;
});

// ─── createAnnouncement ───────────────────────────────────────────────────────

describe('createAnnouncement', () => {
  const row = { id: 'ann-1', author_id: 'coach-uuid', target_type: 'all', target_id: null, title: 'Hello', body: 'World', created_at: '2026-04-01T10:00:00Z' };

  test('inserts and returns created row', async () => {
    mockChain.single.mockResolvedValue({ data: row, error: null });
    const result = await createAnnouncement({ authorId: 'coach-uuid', title: 'Hello', body: 'World' });
    expect(result).toEqual(row);
    expect(mockChain.insert).toHaveBeenCalledWith(expect.objectContaining({
      author_id:   'coach-uuid',
      target_type: 'all',
      target_id:   null,
      title:       'Hello',
      body:        'World',
    }));
  });

  test('passes targetType and targetId when provided', async () => {
    mockChain.single.mockResolvedValue({ data: { ...row, target_type: 'individual', target_id: 'player-uuid' }, error: null });
    await createAnnouncement({ authorId: 'coach-uuid', title: 'Hi', body: 'There', targetType: 'individual', targetId: 'player-uuid' });
    expect(mockChain.insert).toHaveBeenCalledWith(expect.objectContaining({
      target_type: 'individual',
      target_id:   'player-uuid',
    }));
  });

  test('trims title and body whitespace', async () => {
    mockChain.single.mockResolvedValue({ data: row, error: null });
    await createAnnouncement({ authorId: 'coach-uuid', title: '  Padded  ', body: '  Text  ' });
    expect(mockChain.insert).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Padded',
      body:  'Text',
    }));
  });

  test('throws when authorId is missing', async () => {
    await expect(createAnnouncement({ title: 'Hi', body: 'There' })).rejects.toThrow('authorId is required');
  });

  test('throws when title is empty', async () => {
    await expect(createAnnouncement({ authorId: 'uuid', title: '', body: 'body' })).rejects.toThrow('title is required');
  });

  test('throws when body is empty', async () => {
    await expect(createAnnouncement({ authorId: 'uuid', title: 'title', body: '' })).rejects.toThrow('body is required');
  });

  test('throws for invalid targetType', async () => {
    await expect(createAnnouncement({ authorId: 'uuid', title: 'title', body: 'body', targetType: 'invalid' })).rejects.toThrow('invalid targetType');
  });

  test('throws on DB error', async () => {
    mockChain.single.mockResolvedValue({ data: null, error: { message: 'insert failed' } });
    await expect(createAnnouncement({ authorId: 'uuid', title: 'title', body: 'body' })).rejects.toThrow('insert failed');
  });
});

// ─── listForPlayer ────────────────────────────────────────────────────────────

describe('listForPlayer', () => {
  const rows = [
    {
      id: 'ann-2', author_id: 'coach-uuid', target_type: 'all', target_id: null,
      title: 'Session tonight', body: 'Join at 7pm', created_at: '2026-04-01T09:00:00Z',
      announcement_reads: [{ read_at: '2026-04-01T09:30:00Z' }],
    },
    {
      id: 'ann-1', author_id: 'coach-uuid', target_type: 'individual', target_id: 'player-uuid',
      title: 'Good work', body: 'Nice bluff!', created_at: '2026-04-01T08:00:00Z',
      announcement_reads: [],
    },
  ];

  test('returns mapped announcement list with readAt', async () => {
    mockChain.range.mockResolvedValue({ data: rows, error: null });

    const result = await listForPlayer('player-uuid', { limit: 10, offset: 0 });
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: 'ann-2', readAt: '2026-04-01T09:30:00Z' });
    expect(result[1]).toMatchObject({ id: 'ann-1', readAt: null });
  });

  test('returns empty array when no announcements', async () => {
    mockChain.range.mockResolvedValue({ data: null, error: null });
    const result = await listForPlayer('player-uuid');
    expect(result).toEqual([]);
  });

  test('orders by created_at descending', async () => {
    mockChain.range.mockResolvedValue({ data: [], error: null });
    await listForPlayer('player-uuid');
    expect(mockChain.order).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  test('passes range with correct offset', async () => {
    mockChain.range.mockResolvedValue({ data: [], error: null });
    await listForPlayer('player-uuid', { limit: 25, offset: 50 });
    expect(mockChain.range).toHaveBeenCalledWith(50, 74);
  });

  test('throws when playerId is missing', async () => {
    await expect(listForPlayer(null)).rejects.toThrow('playerId is required');
  });

  test('throws on DB error', async () => {
    mockChain.range.mockResolvedValue({ data: null, error: { message: 'query failed' } });
    await expect(listForPlayer('player-uuid')).rejects.toThrow('query failed');
  });
});

// ─── markRead ─────────────────────────────────────────────────────────────────

describe('markRead', () => {
  test('upserts a read receipt', async () => {
    mockChain.upsert.mockResolvedValue({ error: null });
    await markRead('ann-1', 'player-uuid');
    expect(mockChain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ announcement_id: 'ann-1', player_id: 'player-uuid' }),
      { onConflict: 'announcement_id,player_id' }
    );
  });

  test('throws when either id is missing', async () => {
    await expect(markRead(null, 'player-uuid')).rejects.toThrow();
    await expect(markRead('ann-1', null)).rejects.toThrow();
  });

  test('throws on DB error', async () => {
    mockChain.upsert.mockResolvedValue({ error: { message: 'upsert failed' } });
    await expect(markRead('ann-1', 'player-uuid')).rejects.toThrow('upsert failed');
  });
});

// ─── unreadCount ──────────────────────────────────────────────────────────────

describe('unreadCount', () => {
  test('returns visible count minus read count', async () => {
    // First call: all visible announcements
    mockChain.select.mockReturnValueOnce(mockChain);
    mockChain.or.mockResolvedValueOnce({ data: [{ id: 'ann-1' }, { id: 'ann-2' }, { id: 'ann-3' }], error: null });
    // Second call: read announcements (after eq + in)
    mockChain.in.mockResolvedValueOnce({ data: [{ announcement_id: 'ann-1' }], error: null });

    const count = await unreadCount('player-uuid');
    expect(count).toBe(2); // 3 visible - 1 read
  });

  test('returns 0 when no announcements exist', async () => {
    mockChain.or.mockResolvedValueOnce({ data: [], error: null });
    const count = await unreadCount('player-uuid');
    expect(count).toBe(0);
  });

  test('returns 0 when all announcements are read', async () => {
    mockChain.or.mockResolvedValueOnce({ data: [{ id: 'ann-1' }], error: null });
    mockChain.in.mockResolvedValueOnce({ data: [{ announcement_id: 'ann-1' }], error: null });
    const count = await unreadCount('player-uuid');
    expect(count).toBe(0);
  });

  test('throws when playerId is missing', async () => {
    await expect(unreadCount(null)).rejects.toThrow('playerId is required');
  });

  test('throws on DB error (first query)', async () => {
    mockChain.or.mockResolvedValueOnce({ data: null, error: { message: 'DB error' } });
    await expect(unreadCount('player-uuid')).rejects.toThrow('DB error');
  });
});
