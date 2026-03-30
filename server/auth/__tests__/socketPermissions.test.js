'use strict';

/**
 * requireSocketPermission unit tests.
 *
 * socketPermissions.js imports getPlayerPermissions from requirePermission.js.
 * We mock requirePermission.js so no Supabase calls are made.
 */

// ─── Mock requirePermission ───────────────────────────────────────────────────
// socketPermissions.js calls getPlayerPermissions(playerId) from this module.

const mockGetPlayerPermissions = jest.fn();

jest.mock('../requirePermission.js', () => ({
  getPlayerPermissions: mockGetPlayerPermissions,
  invalidatePermissionCache: jest.fn(),
  requirePermission: jest.fn(),
}));

// ─── Module under test ────────────────────────────────────────────────────────

const { requireSocketPermission } = require('../socketPermissions');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal mock socket. */
function makeSocket(playerId) {
  const emitted = [];
  return {
    data: { playerId },
    emit: jest.fn((event, payload) => emitted.push({ event, payload })),
    _emitted: emitted,
  };
}

/** Make getPlayerPermissions resolve with the given permission keys. */
function resolvePermissions(keys) {
  mockGetPlayerPermissions.mockResolvedValueOnce(new Set(keys));
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── requireSocketPermission ──────────────────────────────────────────────────

describe('requireSocketPermission', () => {
  test('returns false and emits "error" when socket.data.playerId is missing', async () => {
    const socket = makeSocket(undefined);

    const result = await requireSocketPermission(socket, 'view_hands');

    expect(result).toBe(false);
    expect(socket.emit).toHaveBeenCalledWith('error', expect.objectContaining({ message: expect.any(String) }));
  });

  test('returns false and emits "error" when socket.data.playerId is null', async () => {
    const socket = makeSocket(null);

    const result = await requireSocketPermission(socket, 'view_hands');

    expect(result).toBe(false);
    expect(socket.emit).toHaveBeenCalledWith('error', expect.objectContaining({ message: expect.any(String) }));
  });

  test('does not call getPlayerPermissions when playerId is missing', async () => {
    const socket = makeSocket(undefined);

    await requireSocketPermission(socket, 'any_perm');

    expect(mockGetPlayerPermissions).not.toHaveBeenCalled();
  });

  test('returns false and emits "error" when player lacks required permission', async () => {
    resolvePermissions(['other_perm']);
    const socket = makeSocket('player-uuid-1');

    const result = await requireSocketPermission(socket, 'admin_only');

    expect(result).toBe(false);
    expect(socket.emit).toHaveBeenCalledWith('error', expect.objectContaining({ message: expect.any(String) }));
  });

  test('error message for insufficient permissions mentions the problem', async () => {
    resolvePermissions([]);
    const socket = makeSocket('player-uuid-2');

    await requireSocketPermission(socket, 'manage_users');

    const [event, payload] = socket.emit.mock.calls[0];
    expect(event).toBe('error');
    expect(payload.message).toMatch(/permission/i);
  });

  test('returns true when player has the required permission', async () => {
    resolvePermissions(['view_hands']);
    const socket = makeSocket('player-uuid-3');

    const result = await requireSocketPermission(socket, 'view_hands');

    expect(result).toBe(true);
    expect(socket.emit).not.toHaveBeenCalled();
  });

  test('returns true when player has all multiple required permissions', async () => {
    resolvePermissions(['perm_x', 'perm_y', 'perm_z']);
    const socket = makeSocket('player-uuid-4');

    const result = await requireSocketPermission(socket, 'perm_x', 'perm_y');

    expect(result).toBe(true);
    expect(socket.emit).not.toHaveBeenCalled();
  });

  test('returns false when player is missing one of multiple required permissions', async () => {
    resolvePermissions(['perm_a']); // missing perm_b
    const socket = makeSocket('player-uuid-5');

    const result = await requireSocketPermission(socket, 'perm_a', 'perm_b');

    expect(result).toBe(false);
    expect(socket.emit).toHaveBeenCalledWith('error', expect.objectContaining({ message: expect.any(String) }));
  });

  test('returns false when player has no permissions at all', async () => {
    resolvePermissions([]);
    const socket = makeSocket('player-uuid-6');

    const result = await requireSocketPermission(socket, 'any_perm');

    expect(result).toBe(false);
  });

  test('calls getPlayerPermissions with the correct playerId', async () => {
    resolvePermissions(['view_hands']);
    const socket = makeSocket('specific-player-id');

    await requireSocketPermission(socket, 'view_hands');

    expect(mockGetPlayerPermissions).toHaveBeenCalledWith('specific-player-id');
  });

  test('emits error only once even for multiple missing permissions', async () => {
    resolvePermissions([]);
    const socket = makeSocket('player-uuid-7');

    await requireSocketPermission(socket, 'perm_a', 'perm_b', 'perm_c');

    expect(socket.emit).toHaveBeenCalledTimes(1);
  });
});
