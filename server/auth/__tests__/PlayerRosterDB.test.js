'use strict';

/**
 * PlayerRoster (DB-backed) unit tests.
 *
 * The DB-backed version delegates to:
 *   - PlayerRepository.findByDisplayName(name)
 *   - PlayerRepository.getPrimaryRole(id)
 *   - bcrypt.compare(password, hash)
 *
 * All three are mocked so no real DB or crypto work occurs.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../db/repositories/PlayerRepository', () => ({
  findByDisplayName: jest.fn(),
  getPrimaryRole:    jest.fn(),
}));

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
}));

// ─── Modules under test ───────────────────────────────────────────────────────

const PlayerRoster = require('../PlayerRoster');
const { findByDisplayName, getPrimaryRole } = require('../../db/repositories/PlayerRepository');
const bcrypt = require('bcrypt');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** A valid player_profiles row that passes all checks. */
function validPlayer(overrides = {}) {
  return {
    id:            'uuid-alice',
    display_name:  'Alice',
    password_hash: '$2b$12$fakehash',
    status:        'active',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── authenticate() ───────────────────────────────────────────────────────────

describe('authenticate()', () => {

  test('returns null when name is null or empty', async () => {
    expect(await PlayerRoster.authenticate(null, 'pass')).toBeNull();
    expect(await PlayerRoster.authenticate('',   'pass')).toBeNull();
    expect(findByDisplayName).not.toHaveBeenCalled();
  });

  test('returns null when password is null or empty', async () => {
    expect(await PlayerRoster.authenticate('Alice', null)).toBeNull();
    expect(await PlayerRoster.authenticate('Alice', ''  )).toBeNull();
    expect(findByDisplayName).not.toHaveBeenCalled();
  });

  test('returns null when findByDisplayName returns null (player not found)', async () => {
    findByDisplayName.mockResolvedValueOnce(null);
    expect(await PlayerRoster.authenticate('Nobody', 'pass')).toBeNull();
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  test('returns null when player has no password_hash (null)', async () => {
    findByDisplayName.mockResolvedValueOnce(validPlayer({ password_hash: null }));
    expect(await PlayerRoster.authenticate('Alice', 'pass')).toBeNull();
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  test('returns null when player has no password_hash (undefined)', async () => {
    const player = validPlayer();
    delete player.password_hash;
    findByDisplayName.mockResolvedValueOnce(player);
    expect(await PlayerRoster.authenticate('Alice', 'pass')).toBeNull();
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  test('returns null when status is "suspended"', async () => {
    findByDisplayName.mockResolvedValueOnce(validPlayer({ status: 'suspended' }));
    expect(await PlayerRoster.authenticate('Alice', 'pass')).toBeNull();
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  test('returns null when status is "archived"', async () => {
    findByDisplayName.mockResolvedValueOnce(validPlayer({ status: 'archived' }));
    expect(await PlayerRoster.authenticate('Alice', 'pass')).toBeNull();
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  test('returns null when bcrypt.compare returns false (wrong password)', async () => {
    findByDisplayName.mockResolvedValueOnce(validPlayer());
    bcrypt.compare.mockResolvedValueOnce(false);
    expect(await PlayerRoster.authenticate('Alice', 'wrongpass')).toBeNull();
    expect(getPrimaryRole).not.toHaveBeenCalled();
  });

  test('returns { id, name, role } when all checks pass', async () => {
    findByDisplayName.mockResolvedValueOnce(validPlayer());
    bcrypt.compare.mockResolvedValueOnce(true);
    getPrimaryRole.mockResolvedValueOnce('coach');

    const result = await PlayerRoster.authenticate('Alice', 'correctpass');
    expect(result).toEqual({ id: 'uuid-alice', name: 'Alice', role: 'coach' });
  });

  test('uses getPrimaryRole result for the role field', async () => {
    findByDisplayName.mockResolvedValueOnce(validPlayer());
    bcrypt.compare.mockResolvedValueOnce(true);
    getPrimaryRole.mockResolvedValueOnce('superadmin');

    const result = await PlayerRoster.authenticate('Alice', 'pass');
    expect(result.role).toBe('superadmin');
  });

  test('falls back to "coached_student" when getPrimaryRole returns null', async () => {
    findByDisplayName.mockResolvedValueOnce(validPlayer());
    bcrypt.compare.mockResolvedValueOnce(true);
    getPrimaryRole.mockResolvedValueOnce(null);

    const result = await PlayerRoster.authenticate('Alice', 'pass');
    expect(result.role).toBe('coached_student');
  });

  test('calls findByDisplayName with trimmed name', async () => {
    findByDisplayName.mockResolvedValueOnce(null);
    await PlayerRoster.authenticate('  Alice  ', 'pass');
    expect(findByDisplayName).toHaveBeenCalledWith('Alice');
  });

  test('calls getPrimaryRole with the player id', async () => {
    findByDisplayName.mockResolvedValueOnce(validPlayer({ id: 'uuid-999' }));
    bcrypt.compare.mockResolvedValueOnce(true);
    getPrimaryRole.mockResolvedValueOnce('player');

    await PlayerRoster.authenticate('Alice', 'pass');
    expect(getPrimaryRole).toHaveBeenCalledWith('uuid-999');
  });

  test('status "active" is not rejected', async () => {
    findByDisplayName.mockResolvedValueOnce(validPlayer({ status: 'active' }));
    bcrypt.compare.mockResolvedValueOnce(true);
    getPrimaryRole.mockResolvedValueOnce('player');

    const result = await PlayerRoster.authenticate('Alice', 'pass');
    expect(result).not.toBeNull();
  });

  test('status null is not rejected (new accounts without explicit status)', async () => {
    findByDisplayName.mockResolvedValueOnce(validPlayer({ status: null }));
    bcrypt.compare.mockResolvedValueOnce(true);
    getPrimaryRole.mockResolvedValueOnce('player');

    const result = await PlayerRoster.authenticate('Alice', 'pass');
    expect(result).not.toBeNull();
  });

});

// ─── load() / reload() / getRole() ───────────────────────────────────────────

describe('load()', () => {
  test('is a no-op and does not throw', () => {
    expect(() => PlayerRoster.load()).not.toThrow();
  });
});

describe('reload()', () => {
  test('is a no-op and does not throw', () => {
    expect(() => PlayerRoster.reload()).not.toThrow();
  });
});

describe('getRole()', () => {
  test('always returns null (stub for backward compat)', () => {
    expect(PlayerRoster.getRole('Alice')).toBeNull();
    expect(PlayerRoster.getRole('anyone')).toBeNull();
    expect(PlayerRoster.getRole(null)).toBeNull();
  });
});
