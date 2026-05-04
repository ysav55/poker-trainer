'use strict';

/**
 * requireSchool middleware unit tests.
 *
 * Mocks the Supabase client so no real DB calls are made.
 * The supabase module exports the client directly (module.exports = supabase),
 * so we mock it as an object with a .from().select().eq().single() chain.
 */

// ─── Supabase mock ────────────────────────────────────────────────────────────
jest.mock('../../db/supabase.js', () => {
  const mockSingle = jest.fn();
  const mockEq     = jest.fn().mockReturnValue({ single: mockSingle });
  const mockSelect = jest.fn().mockReturnValue({ eq: mockEq });
  const mockClient = {
    from: jest.fn().mockReturnValue({ select: mockSelect }),
    // Expose inner fns for test assertions
    _mockSelect: mockSelect,
    _mockEq:     mockEq,
    _mockSingle: mockSingle,
  };
  return mockClient;
});

// ─── Module under test ────────────────────────────────────────────────────────

const requireSchool = require('../requireSchool');

// Grab the mocked supabase so we can control responses
const supabase = require('../../db/supabase.js');
const mockSingle = supabase._mockSingle;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal mock Express response. */
function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  // Restore the chain after clearAllMocks
  supabase.from.mockReturnValue({ select: supabase._mockSelect });
  supabase._mockSelect.mockReturnValue({ eq: supabase._mockEq });
  supabase._mockEq.mockReturnValue({ single: supabase._mockSingle });
});

// ─── requireSchool middleware ────────────────────────────────────────────────

describe('requireSchool middleware', () => {
  test('attaches school_id to req.user and calls next()', async () => {
    mockSingle.mockResolvedValueOnce({ data: { school_id: 's-1' }, error: null });
    const req  = { user: { id: 'p1', stableId: 'p1' } };
    const res  = makeRes();
    const next = jest.fn();

    await requireSchool(req, res, next);

    expect(req.user.school_id).toBe('s-1');
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('returns 403 with no_school_assignment when school_id is null', async () => {
    mockSingle.mockResolvedValueOnce({ data: { school_id: null }, error: null });
    const req  = { user: { id: 'p2', stableId: 'p2' } };
    const res  = makeRes();
    const next = jest.fn();

    await requireSchool(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'no_school_assignment' }));
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 if req.user is missing', async () => {
    const req  = {};
    const res  = makeRes();
    const next = jest.fn();

    await requireSchool(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'auth_required' }));
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 if req.user.id and req.user.stableId are both missing', async () => {
    const req  = { user: { name: 'Alice' } };
    const res  = makeRes();
    const next = jest.fn();

    await requireSchool(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('caches the school_id for subsequent calls within TTL', async () => {
    mockSingle.mockResolvedValueOnce({ data: { school_id: 's-1' }, error: null });
    const req1  = { user: { id: 'p3', stableId: 'p3' } };
    const res1  = makeRes();
    const next1 = jest.fn();

    await requireSchool(req1, res1, next1);
    expect(mockSingle).toHaveBeenCalledTimes(1);

    // Second call with same playerId — should hit cache
    const req2  = { user: { id: 'p3', stableId: 'p3' } };
    const res2  = makeRes();
    const next2 = jest.fn();

    await requireSchool(req2, res2, next2);

    // mockSingle called only once (second call hit cache)
    expect(mockSingle).toHaveBeenCalledTimes(1);
    expect(req2.user.school_id).toBe('s-1');
    expect(next2).toHaveBeenCalledTimes(1);
  });

  test('returns 500 if supabase returns an error', async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'db connection failed' } });
    const req  = { user: { id: 'p4', stableId: 'p4' } };
    const res  = makeRes();
    const next = jest.fn();

    await requireSchool(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'school_lookup_failed' }));
    expect(next).not.toHaveBeenCalled();
  });

  test('re-queries Supabase after 5-minute TTL expires', async () => {
    const frozenNow = 1_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(frozenNow);

    // First query
    mockSingle.mockResolvedValueOnce({ data: { school_id: 's-old' }, error: null });
    const req1  = { user: { id: 'p5', stableId: 'p5' } };
    const res1  = makeRes();
    const next1 = jest.fn();
    await requireSchool(req1, res1, next1);
    expect(mockSingle).toHaveBeenCalledTimes(1);

    // Advance clock past TTL (5 min + 1 ms)
    Date.now.mockReturnValue(frozenNow + 5 * 60 * 1000 + 1);

    // Second query — should fetch again
    mockSingle.mockResolvedValueOnce({ data: { school_id: 's-new' }, error: null });
    const req2  = { user: { id: 'p5', stableId: 'p5' } };
    const res2  = makeRes();
    const next2 = jest.fn();
    await requireSchool(req2, res2, next2);

    expect(mockSingle).toHaveBeenCalledTimes(2);
    expect(req2.user.school_id).toBe('s-new');

    jest.restoreAllMocks();
  });

  test('does not re-query before TTL expires', async () => {
    const frozenNow = 2_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(frozenNow);

    mockSingle.mockResolvedValueOnce({ data: { school_id: 's-fresh' }, error: null });
    const req1  = { user: { id: 'p6', stableId: 'p6' } };
    const res1  = makeRes();
    const next1 = jest.fn();
    await requireSchool(req1, res1, next1);

    // Advance by less than TTL (3 min)
    Date.now.mockReturnValue(frozenNow + 3 * 60 * 1000);

    const req2  = { user: { id: 'p6', stableId: 'p6' } };
    const res2  = makeRes();
    const next2 = jest.fn();
    await requireSchool(req2, res2, next2);

    // Still only one DB call
    expect(mockSingle).toHaveBeenCalledTimes(1);
    expect(req2.user.school_id).toBe('s-fresh');

    jest.restoreAllMocks();
  });

  test('__clearCache() method clears the cache for tests', async () => {
    mockSingle.mockResolvedValueOnce({ data: { school_id: 's-clear' }, error: null });
    const req1  = { user: { id: 'p7', stableId: 'p7' } };
    const res1  = makeRes();
    const next1 = jest.fn();
    await requireSchool(req1, res1, next1);

    expect(mockSingle).toHaveBeenCalledTimes(1);

    // Clear cache
    requireSchool.__clearCache();

    // Next call with same playerId should query again
    mockSingle.mockResolvedValueOnce({ data: { school_id: 's-new-clear' }, error: null });
    const req2  = { user: { id: 'p7', stableId: 'p7' } };
    const res2  = makeRes();
    const next2 = jest.fn();
    await requireSchool(req2, res2, next2);

    expect(mockSingle).toHaveBeenCalledTimes(2);
  });
});
