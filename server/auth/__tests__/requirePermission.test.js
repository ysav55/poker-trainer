'use strict';

/**
 * requirePermission + getPlayerPermissions + invalidatePermissionCache unit tests.
 *
 * Mocks the Supabase client so no real DB calls are made.
 * The supabase module exports the client directly (module.exports = supabase),
 * so we mock it as an object with a .from().select().eq() chain.
 */

// ─── Supabase mock ────────────────────────────────────────────────────────────
// requirePermission.js calls:
//   supabase.from('player_roles').select('...').eq('player_id', playerId)
// The jest.mock factory is hoisted, so it must be self-contained.
// We attach inner mocks to the client object so tests can access them after require().

jest.mock('../../db/supabase.js', () => {
  const mockEq     = jest.fn();
  const mockSelect = jest.fn().mockReturnValue({ eq: mockEq });
  const mockClient = {
    from: jest.fn().mockReturnValue({ select: mockSelect }),
    // Expose inner fns for test assertions
    _mockEq:     mockEq,
    _mockSelect: mockSelect,
  };
  return mockClient;
});

// ─── Modules under test ───────────────────────────────────────────────────────

const {
  getPlayerPermissions,
  invalidatePermissionCache,
  requirePermission,
} = require('../requirePermission');

// Grab the mocked supabase so we can control mockEq responses
const supabase = require('../../db/supabase.js');
const mockEq   = supabase._mockEq;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal mock Express response. */
function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
}

/**
 * Make mockEq resolve once with a Supabase-style { data } payload.
 * Builds a nested structure matching:
 *   player_roles → roles → role_permissions → permissions(key)
 */
function resolvePermissions(permKeys) {
  const data = permKeys.length === 0
    ? []
    : [
        {
          roles: {
            role_permissions: permKeys.map(key => ({
              permissions: { key },
            })),
          },
        },
      ];
  mockEq.mockResolvedValueOnce({ data });
}

beforeEach(() => {
  jest.clearAllMocks();
  // Restore the chain: after clearAllMocks, from() needs to return the same
  // select-chain object. Re-wire because clearAllMocks resets return values.
  supabase.from.mockReturnValue({ select: supabase._mockSelect });
  supabase._mockSelect.mockReturnValue({ eq: supabase._mockEq });
});

// ─── getPlayerPermissions ─────────────────────────────────────────────────────

describe('getPlayerPermissions', () => {
  test('returns a Set of permission keys from a Supabase response', async () => {
    resolvePermissions(['manage_users', 'view_reports']);
    const perms = await getPlayerPermissions('player-get-1');
    expect(perms).toBeInstanceOf(Set);
    expect(perms.has('manage_users')).toBe(true);
    expect(perms.has('view_reports')).toBe(true);
    expect(perms.size).toBe(2);
  });

  test('returns empty Set when Supabase returns null data', async () => {
    mockEq.mockResolvedValueOnce({ data: null });
    const perms = await getPlayerPermissions('player-get-null');
    expect(perms).toBeInstanceOf(Set);
    expect(perms.size).toBe(0);
  });

  test('returns empty Set when Supabase returns empty array', async () => {
    resolvePermissions([]);
    const perms = await getPlayerPermissions('player-get-empty');
    expect(perms).toBeInstanceOf(Set);
    expect(perms.size).toBe(0);
  });

  test('returns cached result on second call — no second Supabase query', async () => {
    resolvePermissions(['edit_hands']);
    const id = 'player-cache-test';

    const first  = await getPlayerPermissions(id);
    const second = await getPlayerPermissions(id);

    // mockEq should have been called exactly once (second call uses cache)
    expect(mockEq).toHaveBeenCalledTimes(1);
    // Both calls return the same Set reference
    expect(second).toBe(first);
  });

  test('re-queries Supabase after 5-minute TTL expires', async () => {
    const id = 'player-ttl-test';
    resolvePermissions(['perm_before_ttl']);

    // Populate cache with a frozen timestamp
    const frozenNow = 1_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(frozenNow);
    await getPlayerPermissions(id);
    expect(mockEq).toHaveBeenCalledTimes(1);

    // Advance clock past TTL (5 min + 1 ms)
    Date.now.mockReturnValue(frozenNow + 5 * 60 * 1000 + 1);
    resolvePermissions(['perm_after_ttl']);

    const perms = await getPlayerPermissions(id);
    expect(mockEq).toHaveBeenCalledTimes(2);
    expect(perms.has('perm_after_ttl')).toBe(true);
    expect(perms.has('perm_before_ttl')).toBe(false);

    jest.restoreAllMocks();
  });

  test('does not re-query before TTL expires', async () => {
    const id = 'player-ttl-still-fresh';
    resolvePermissions(['fresh_perm']);

    const frozenNow = 2_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(frozenNow);
    await getPlayerPermissions(id);

    // Advance by less than TTL
    Date.now.mockReturnValue(frozenNow + 4 * 60 * 1000);
    await getPlayerPermissions(id);
    expect(mockEq).toHaveBeenCalledTimes(1); // still cached

    jest.restoreAllMocks();
  });
});

// ─── invalidatePermissionCache ────────────────────────────────────────────────

describe('invalidatePermissionCache', () => {
  test('after invalidation, next call queries Supabase again', async () => {
    const id = 'player-invalidate-test';
    resolvePermissions(['perm_a']);

    // Populate the cache
    await getPlayerPermissions(id);
    expect(mockEq).toHaveBeenCalledTimes(1);

    // Invalidate
    invalidatePermissionCache(id);

    // Set up a new response for the second DB call
    resolvePermissions(['perm_b']);
    const perms = await getPlayerPermissions(id);

    // Supabase was queried a second time
    expect(mockEq).toHaveBeenCalledTimes(2);
    expect(perms.has('perm_b')).toBe(true);
    expect(perms.has('perm_a')).toBe(false);
  });

  test('does not throw when invalidating a player not in cache', () => {
    expect(() => invalidatePermissionCache('no-such-player')).not.toThrow();
  });

  test('invalidate clears cache so next call re-queries even before TTL', async () => {
    const id = 'player-invalidate-ttl';
    const frozenNow = 3_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(frozenNow);

    resolvePermissions(['perm_initial']);
    await getPlayerPermissions(id);
    expect(mockEq).toHaveBeenCalledTimes(1);

    // Invalidate well within TTL window
    invalidatePermissionCache(id);

    resolvePermissions(['perm_refreshed']);
    const perms = await getPlayerPermissions(id);
    expect(mockEq).toHaveBeenCalledTimes(2);
    expect(perms.has('perm_refreshed')).toBe(true);

    jest.restoreAllMocks();
  });
});

// ─── requirePermission middleware ─────────────────────────────────────────────

describe('requirePermission middleware', () => {
  test('returns 401 when req.user is missing', async () => {
    const middleware = requirePermission('manage_users');
    const req  = {};
    const res  = makeRes();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Unauthorized' }));
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 when req.user.id is missing', async () => {
    const middleware = requirePermission('manage_users');
    const req  = { user: { name: 'Alice' } }; // no id
    const res  = makeRes();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Unauthorized' }));
    expect(next).not.toHaveBeenCalled();
  });

  test('calls next() when player has the required permission', async () => {
    const middleware = requirePermission('view_hands');
    resolvePermissions(['view_hands', 'other_perm']);
    const req  = { user: { id: 'player-perm-has' } };
    const res  = makeRes();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('returns 403 when player lacks the required permission', async () => {
    const middleware = requirePermission('admin_only');
    resolvePermissions(['view_hands']);
    const req  = { user: { id: 'player-perm-lacks' } };
    const res  = makeRes();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Insufficient permissions' }));
    expect(next).not.toHaveBeenCalled();
  });

  test('calls next() when all multiple required permissions are present', async () => {
    const middleware = requirePermission('perm_x', 'perm_y');
    resolvePermissions(['perm_x', 'perm_y', 'perm_z']);
    const req  = { user: { id: 'player-multi-has' } };
    const res  = makeRes();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('returns 403 when only some of multiple required permissions are present', async () => {
    const middleware = requirePermission('perm_a', 'perm_b');
    resolvePermissions(['perm_a']); // missing perm_b
    const req  = { user: { id: 'player-multi-partial' } };
    const res  = makeRes();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Insufficient permissions' }));
    expect(next).not.toHaveBeenCalled();
  });

  test('does not call Supabase when req.user is missing (short-circuits)', async () => {
    const middleware = requirePermission('any_perm');
    const req  = {};
    const res  = makeRes();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(mockEq).not.toHaveBeenCalled();
  });
});
