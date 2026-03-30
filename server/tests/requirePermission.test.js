'use strict';

/**
 * requirePermission + getPlayerPermissions + invalidatePermissionCache +
 * requireSocketPermission unit tests.
 *
 * Mocks the Supabase client so no real DB calls are made.
 * requirePermission.js calls:
 *   supabase.from('player_roles').select('...').eq('player_id', playerId)
 */

// ─── Supabase mock ────────────────────────────────────────────────────────────

jest.mock('../db/supabase.js', () => {
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
} = require('../auth/requirePermission');

const { requireSocketPermission } = require('../auth/socketPermissions');

const supabase = require('../db/supabase.js');
const mockEq   = supabase._mockEq;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
}

function makeSocket(playerId = 'player-socket-001') {
  return {
    data:  { playerId },
    emit:  jest.fn(),
  };
}

/**
 * Make mockEq resolve once with a Supabase-style { data } payload.
 * Builds the nested structure requirePermission.js expects:
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
  // Re-wire chain after clearAllMocks resets return values
  supabase.from.mockReturnValue({ select: supabase._mockSelect });
  supabase._mockSelect.mockReturnValue({ eq: supabase._mockEq });
});

// ─── getPlayerPermissions ─────────────────────────────────────────────────────

describe('getPlayerPermissions', () => {
  test('returns correct Set from mocked Supabase response', async () => {
    resolvePermissions(['manage_users', 'view_reports']);
    const perms = await getPlayerPermissions('player-gp-001');
    expect(perms).toBeInstanceOf(Set);
    expect(perms.has('manage_users')).toBe(true);
    expect(perms.has('view_reports')).toBe(true);
    expect(perms.size).toBe(2);
  });

  test('uses in-memory cache on second call — Supabase not called again', async () => {
    resolvePermissions(['edit_hands']);
    const id = 'player-cache-gp-002';

    const first  = await getPlayerPermissions(id);
    const second = await getPlayerPermissions(id);

    // mockEq called exactly once (second call uses cache)
    expect(mockEq).toHaveBeenCalledTimes(1);
    // Both calls return the same Set reference
    expect(second).toBe(first);
  });

  test('returns empty Set when Supabase returns null data', async () => {
    mockEq.mockResolvedValueOnce({ data: null });
    const perms = await getPlayerPermissions('player-gp-null');
    expect(perms).toBeInstanceOf(Set);
    expect(perms.size).toBe(0);
  });
});

// ─── invalidatePermissionCache ────────────────────────────────────────────────

describe('invalidatePermissionCache', () => {
  test('forces re-fetch on next call after invalidation', async () => {
    const id = 'player-inv-001';
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

  test('calls next() when user has the permission', async () => {
    const middleware = requirePermission('view_hands');
    resolvePermissions(['view_hands', 'other_perm']);
    const req  = { user: { id: 'player-rp-has' } };
    const res  = makeRes();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('returns 403 when user lacks permission', async () => {
    const middleware = requirePermission('admin_only');
    resolvePermissions(['view_hands']);
    const req  = { user: { id: 'player-rp-lacks' } };
    const res  = makeRes();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Insufficient permissions' })
    );
    expect(next).not.toHaveBeenCalled();
  });
});

// ─── requireSocketPermission ──────────────────────────────────────────────────

describe('requireSocketPermission', () => {
  test('returns true when permission is present', async () => {
    resolvePermissions(['view_hands']);
    const socket = makeSocket('player-sp-001');

    const result = await requireSocketPermission(socket, 'view_hands');

    expect(result).toBe(true);
    expect(socket.emit).not.toHaveBeenCalled();
  });

  test('returns false and emits error event when permission is denied', async () => {
    resolvePermissions(['view_hands']);
    const socket = makeSocket('player-sp-002');

    const result = await requireSocketPermission(socket, 'admin_only');

    expect(result).toBe(false);
    expect(socket.emit).toHaveBeenCalledWith('error', expect.objectContaining({ message: expect.any(String) }));
  });

  test('returns false and emits error when socket.data.playerId is missing', async () => {
    const socket = { data: {}, emit: jest.fn() };

    const result = await requireSocketPermission(socket, 'view_hands');

    expect(result).toBe(false);
    expect(socket.emit).toHaveBeenCalledWith('error', expect.any(Object));
    // Supabase should NOT have been queried
    expect(mockEq).not.toHaveBeenCalled();
  });
});

// ─── requirePermission — multiple required keys ────────────────────────────────

describe('requirePermission with multiple keys', () => {
  test('calls next() when user has ALL required keys', async () => {
    const middleware = requirePermission('view_hands', 'edit_hands');
    resolvePermissions(['view_hands', 'edit_hands', 'extra']);
    const req  = { user: { id: 'player-multi-pass' } };
    const res  = makeRes();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('returns 403 when user is missing one of the required keys', async () => {
    const middleware = requirePermission('view_hands', 'admin_only');
    resolvePermissions(['view_hands']); // has first key but not second
    const req  = { user: { id: 'player-multi-fail' } };
    const res  = makeRes();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Insufficient permissions' })
    );
    expect(next).not.toHaveBeenCalled();
  });
});

// ─── getPlayerPermissions — empty / null data edge cases ─────────────────────

describe('getPlayerPermissions — empty and null Supabase responses', () => {
  test('returns empty Set when Supabase returns empty array', async () => {
    resolvePermissions([]); // helper pushes empty array []
    const perms = await getPlayerPermissions('player-empty-arr');
    expect(perms).toBeInstanceOf(Set);
    expect(perms.size).toBe(0);
  });

  test('returns empty Set when roles is null inside the row (no crash)', async () => {
    // Data row exists but roles is null — exercises the ?? [] fallback
    mockEq.mockResolvedValueOnce({ data: [{ roles: null }] });
    const perms = await getPlayerPermissions('player-null-roles');
    expect(perms).toBeInstanceOf(Set);
    expect(perms.size).toBe(0);
  });

  test('returns empty Set when role_permissions is null inside roles', async () => {
    mockEq.mockResolvedValueOnce({
      data: [{ roles: { role_permissions: null } }],
    });
    const perms = await getPlayerPermissions('player-null-rp');
    expect(perms).toBeInstanceOf(Set);
    expect(perms.size).toBe(0);
  });
});

// ─── requireSocketPermission — multiple required keys ─────────────────────────

describe('requireSocketPermission with multiple keys', () => {
  test('returns true when socket player has all required keys', async () => {
    resolvePermissions(['view_hands', 'edit_hands']);
    const socket = makeSocket('player-sp-multi-pass');

    const result = await requireSocketPermission(socket, 'view_hands', 'edit_hands');

    expect(result).toBe(true);
    expect(socket.emit).not.toHaveBeenCalled();
  });

  test('returns false when socket player is missing one required key', async () => {
    resolvePermissions(['view_hands']); // has view_hands but not edit_hands
    const socket = makeSocket('player-sp-multi-fail');

    const result = await requireSocketPermission(socket, 'view_hands', 'edit_hands');

    expect(result).toBe(false);
    expect(socket.emit).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({ message: expect.any(String) })
    );
  });
});
