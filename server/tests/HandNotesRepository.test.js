'use strict';

/**
 * HandNotesRepository unit tests.
 *
 * Mocks supabase so no real DB or network calls are made.
 */

// ─── Supabase mock ────────────────────────────────────────────────────────────

jest.mock('../db/supabase', () => {
  const chain = {};
  chain.from     = jest.fn(() => chain);
  chain.select   = jest.fn(() => chain);
  chain.insert   = jest.fn(() => chain);
  chain.update   = jest.fn(() => chain);
  chain.delete   = jest.fn(() => chain);
  chain.eq       = jest.fn(() => chain);
  chain.in       = jest.fn(() => chain);
  chain.order    = jest.fn(() => chain);
  chain.single   = jest.fn(() => Promise.resolve({ data: null, error: null }));
  return chain;
});

// ─── Module under test ────────────────────────────────────────────────────────

const repo = require('../db/repositories/HandNotesRepository');
const supabase = require('../db/supabase');

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  // Re-wire all chain methods after clearAllMocks resets implementations
  supabase.from.mockReturnValue(supabase);
  supabase.select.mockReturnValue(supabase);
  supabase.insert.mockReturnValue(supabase);
  supabase.update.mockReturnValue(supabase);
  supabase.delete.mockReturnValue(supabase);
  supabase.eq.mockReturnValue(supabase);
  supabase.in.mockReturnValue(supabase);
  supabase.order.mockReturnValue(supabase);
  supabase.single.mockResolvedValue({ data: null, error: null });
});

// ─── listForHand ──────────────────────────────────────────────────────────────

describe('HandNotesRepository.listForHand', () => {
  it('queries hand_notes filtered by hand_id and school_id, ordered by created_at', async () => {
    const mockNote = {
      id: 'n1',
      hand_id: 'h1',
      school_id: 's1',
      body: 'test note',
      author_player_id: 'p1',
      created_at: '2026-04-30T00:00:00Z',
      updated_at: '2026-04-30T00:00:00Z',
    };
    supabase.order.mockResolvedValueOnce({
      data: [mockNote],
      error: null,
    });

    const result = await repo.listForHand('h1', 's1');

    expect(supabase.from).toHaveBeenCalledWith('hand_notes');
    expect(supabase.select).toHaveBeenCalled();
    expect(supabase.eq).toHaveBeenCalledWith('hand_id', 'h1');
    expect(result).toHaveLength(1);
    expect(result[0].hand_id).toBe('h1');
    expect(result[0].school_id).toBe('s1');
  });

  it('returns empty array on supabase error', async () => {
    supabase.order.mockResolvedValueOnce({
      data: null,
      error: { message: 'Database error' },
    });

    const result = await repo.listForHand('h1', 's1');

    expect(result).toEqual([]);
  });

  it('returns empty array when data is null', async () => {
    supabase.order.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const result = await repo.listForHand('h1', 's1');

    expect(result).toEqual([]);
  });
});

// ─── create ────────────────────────────────────────────────────────────────────

describe('HandNotesRepository.create', () => {
  it('inserts a note with provided fields', async () => {
    const mockNote = {
      id: 'n1',
      hand_id: 'h1',
      school_id: 's1',
      body: 'new note',
      author_player_id: 'p1',
      created_at: '2026-04-30T00:00:00Z',
      updated_at: '2026-04-30T00:00:00Z',
    };
    supabase.single.mockResolvedValueOnce({
      data: mockNote,
      error: null,
    });

    const result = await repo.create('h1', 's1', 'p1', 'new note');

    expect(supabase.from).toHaveBeenCalledWith('hand_notes');
    expect(supabase.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        hand_id: 'h1',
        school_id: 's1',
        author_player_id: 'p1',
        body: 'new note',
      })
    );
    expect(result.body).toBe('new note');
    expect(result.school_id).toBe('s1');
  });

  it('throws on supabase error', async () => {
    supabase.single.mockResolvedValueOnce({
      data: null,
      error: { message: 'Insert failed' },
    });

    await expect(repo.create('h1', 's1', 'p1', 'note')).rejects.toThrow('Insert failed');
  });
});

// ─── update ────────────────────────────────────────────────────────────────────

describe('HandNotesRepository.update', () => {
  it('updates body and bumps updated_at; school_id guard in WHERE', async () => {
    const updatedNote = {
      id: 'n1',
      hand_id: 'h1',
      school_id: 's1',
      body: 'edited note',
      author_player_id: 'p1',
      created_at: '2026-04-30T00:00:00Z',
      updated_at: '2026-04-30T01:00:00Z',
    };
    supabase.single.mockResolvedValueOnce({
      data: updatedNote,
      error: null,
    });

    const result = await repo.update('n1', 's1', 'edited note');

    expect(supabase.from).toHaveBeenCalledWith('hand_notes');
    expect(supabase.update).toHaveBeenCalled();
    expect(supabase.eq).toHaveBeenCalledWith('id', 'n1');
    expect(supabase.eq).toHaveBeenCalledWith('school_id', 's1');
    expect(result.body).toBe('edited note');
  });

  it('throws on supabase error', async () => {
    supabase.single.mockResolvedValueOnce({
      data: null,
      error: { message: 'Update failed' },
    });

    await expect(repo.update('n1', 's1', 'new body')).rejects.toThrow('Update failed');
  });
});

// ─── delete ────────────────────────────────────────────────────────────────────

describe('HandNotesRepository.delete', () => {
  it('deletes note scoped to school_id', async () => {
    supabase.delete.mockReturnValueOnce(supabase);
    supabase.eq.mockReturnValueOnce(supabase);
    supabase.eq.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    await repo.delete('n1', 's1');

    expect(supabase.from).toHaveBeenCalledWith('hand_notes');
    expect(supabase.delete).toHaveBeenCalled();
    expect(supabase.eq).toHaveBeenCalledWith('id', 'n1');
    expect(supabase.eq).toHaveBeenCalledWith('school_id', 's1');
  });

  it('throws on supabase error', async () => {
    supabase.delete.mockReturnValueOnce(supabase);
    supabase.eq.mockReturnValueOnce(supabase);
    supabase.eq.mockResolvedValueOnce({
      data: null,
      error: { message: 'Delete failed' },
    });

    await expect(repo.delete('n1', 's1')).rejects.toThrow('Delete failed');
  });
});

// ─── countForHand ─────────────────────────────────────────────────────────────

describe('HandNotesRepository.countForHand', () => {
  it('returns count of notes for hand+school', async () => {
    supabase.select.mockReturnValueOnce(supabase);
    supabase.eq.mockReturnValueOnce(supabase);
    supabase.eq.mockResolvedValueOnce({
      count: 3,
      error: null,
    });

    const result = await repo.countForHand('h1', 's1');

    expect(supabase.from).toHaveBeenCalledWith('hand_notes');
    expect(result).toBe(3);
  });

  it('returns 0 on supabase error', async () => {
    supabase.select.mockReturnValueOnce(supabase);
    supabase.eq.mockReturnValueOnce(supabase);
    supabase.eq.mockResolvedValueOnce({
      count: null,
      error: { message: 'Count failed' },
    });

    const result = await repo.countForHand('h1', 's1');

    expect(result).toBe(0);
  });
});

// ─── batchCounts ──────────────────────────────────────────────────────────────

describe('HandNotesRepository.batchCounts', () => {
  it('returns Map<handId, count> for given handIds and school', async () => {
    supabase.eq.mockReturnValueOnce(supabase);
    supabase.in.mockResolvedValueOnce({
      data: [
        { hand_id: 'h1' },
        { hand_id: 'h1' },
        { hand_id: 'h2' },
      ],
      error: null,
    });

    const result = await repo.batchCounts(['h1', 'h2', 'h3'], 's1');

    expect(supabase.from).toHaveBeenCalledWith('hand_notes');
    expect(supabase.select).toHaveBeenCalledWith('hand_id');
    expect(supabase.eq).toHaveBeenCalledWith('school_id', 's1');
    expect(supabase.in).toHaveBeenCalledWith('hand_id', ['h1', 'h2', 'h3']);
    expect(result.get('h1')).toBe(2);
    expect(result.get('h2')).toBe(1);
    expect(result.get('h3')).toBeUndefined();
  });

  it('returns empty Map for empty input array', async () => {
    const result = await repo.batchCounts([], 's1');

    expect(result).toEqual(new Map());
  });

  it('returns empty Map on supabase error', async () => {
    supabase.eq.mockReturnValueOnce(supabase);
    supabase.in.mockResolvedValueOnce({
      data: null,
      error: { message: 'Query failed' },
    });

    const result = await repo.batchCounts(['h1', 'h2'], 's1');

    expect(result).toEqual(new Map());
  });
});
