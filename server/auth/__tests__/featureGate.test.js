'use strict';

/**
 * featureGate middleware unit tests.
 *
 * Tests cover:
 *   - requireFeature passes through when feature is enabled (default)
 *   - requireFeature returns 403 when feature is disabled
 *   - Users with no school_id are always allowed through
 *   - Missing setting row defaults to enabled
 *   - Cache is used on repeated calls
 *   - invalidatePlayerSchoolCache / invalidateSchoolFeatureCache helpers
 */

// ─── Supabase mock ────────────────────────────────────────────────────────────

const mockChain = {
  from:        jest.fn(),
  select:      jest.fn(),
  eq:          jest.fn(),
  like:        jest.fn(),
  maybeSingle: jest.fn(),
};

function rewire() {
  mockChain.from.mockReturnValue(mockChain);
  mockChain.select.mockReturnValue(mockChain);
  mockChain.eq.mockReturnValue(mockChain);
  mockChain.like.mockReturnValue(mockChain);
}

jest.mock('../../db/supabase.js', () => ({ from: mockChain.from }));

// ─── Module under test ────────────────────────────────────────────────────────

const {
  requireFeature,
  invalidatePlayerSchoolCache,
  invalidateSchoolFeatureCache,
  getSchoolIdForPlayer,
  isFeatureEnabled,
} = require('../featureGate');

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  rewire();
  // Clear internal caches between tests
  invalidatePlayerSchoolCache('player-1');
  invalidatePlayerSchoolCache('player-no-school');
  invalidateSchoolFeatureCache('school-1');
});

// ─── Express mock helpers ─────────────────────────────────────────────────────

function makeReqRes(userId, schoolOverride) {
  const req = { user: { stableId: userId } };
  const res = {
    status: jest.fn().mockReturnThis(),
    json:   jest.fn().mockReturnThis(),
  };
  const next = jest.fn();
  return { req, res, next };
}

// ─── isFeatureEnabled ─────────────────────────────────────────────────────────

describe('isFeatureEnabled', () => {
  test('returns true when no school_id (schoolId=null)', async () => {
    expect(await isFeatureEnabled(null, 'feature:analysis')).toBe(true);
  });

  test('returns true when setting row does not exist', async () => {
    mockChain.like.mockResolvedValueOnce({ data: [], error: null });
    expect(await isFeatureEnabled('school-1', 'feature:analysis')).toBe(true);
  });

  test('returns false when setting row has enabled=false', async () => {
    mockChain.like.mockResolvedValueOnce({
      data: [{ key: 'feature:analysis', value: { enabled: false } }],
      error: null,
    });
    expect(await isFeatureEnabled('school-1', 'feature:analysis')).toBe(false);
  });

  test('returns true when setting row has enabled=true', async () => {
    mockChain.like.mockResolvedValueOnce({
      data: [{ key: 'feature:analysis', value: { enabled: true } }],
      error: null,
    });
    expect(await isFeatureEnabled('school-1', 'feature:analysis')).toBe(true);
  });
});

// ─── requireFeature middleware ────────────────────────────────────────────────

describe('requireFeature middleware', () => {
  test('calls next() when feature is enabled (no settings row)', async () => {
    const { req, res, next } = makeReqRes('player-1');

    // school lookup
    mockChain.maybeSingle.mockResolvedValueOnce({ data: { school_id: 'school-1' }, error: null });
    // features lookup
    mockChain.like.mockResolvedValueOnce({ data: [], error: null });

    const mw = requireFeature('analysis');
    await mw(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('returns 403 when feature is disabled', async () => {
    const { req, res, next } = makeReqRes('player-1');

    mockChain.maybeSingle.mockResolvedValueOnce({ data: { school_id: 'school-1' }, error: null });
    mockChain.like.mockResolvedValueOnce({
      data: [{ key: 'feature:analysis', value: { enabled: false } }],
      error: null,
    });

    const mw = requireFeature('analysis');
    await mw(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'feature_disabled' }));
  });

  test('calls next() when user has no school (backward compat)', async () => {
    const { req, res, next } = makeReqRes('player-no-school');

    mockChain.maybeSingle.mockResolvedValueOnce({ data: { school_id: null }, error: null });

    const mw = requireFeature('analysis');
    await mw(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  test('returns 401 when req.user is missing', async () => {
    const req = {};
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    const next = jest.fn();

    const mw = requireFeature('analysis');
    await mw(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('fails open (calls next) when supabase lookup throws', async () => {
    const { req, res, next } = makeReqRes('player-1');

    mockChain.maybeSingle.mockRejectedValueOnce(new Error('DB down'));

    const mw = requireFeature('analysis');
    await mw(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  test('accepts "feature:key" prefix format', async () => {
    const { req, res, next } = makeReqRes('player-1');

    mockChain.maybeSingle.mockResolvedValueOnce({ data: { school_id: 'school-1' }, error: null });
    mockChain.like.mockResolvedValueOnce({ data: [], error: null });

    const mw = requireFeature('feature:analysis');
    await mw(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});

// ─── Cache invalidation ───────────────────────────────────────────────────────

describe('cache invalidation', () => {
  test('getSchoolIdForPlayer caches after first call', async () => {
    mockChain.maybeSingle
      .mockResolvedValueOnce({ data: { school_id: 'school-1' }, error: null });

    await getSchoolIdForPlayer('player-cache');
    await getSchoolIdForPlayer('player-cache');

    // Should only hit DB once
    expect(mockChain.maybeSingle).toHaveBeenCalledTimes(1);
    invalidatePlayerSchoolCache('player-cache');
  });

  test('invalidatePlayerSchoolCache causes re-fetch', async () => {
    mockChain.maybeSingle
      .mockResolvedValue({ data: { school_id: 'school-1' }, error: null });

    await getSchoolIdForPlayer('player-inv');
    invalidatePlayerSchoolCache('player-inv');
    await getSchoolIdForPlayer('player-inv');

    expect(mockChain.maybeSingle).toHaveBeenCalledTimes(2);
    invalidatePlayerSchoolCache('player-inv');
  });
});
