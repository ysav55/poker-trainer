'use strict';

/**
 * PlayerRepository — new Auth/RBAC methods unit tests.
 *
 * Tests the methods added in migration 009 / Phase 2:
 *   getPrimaryRole, createPlayer, updatePlayer, archivePlayer,
 *   setPassword, assignRole, removeRole, listPlayers
 *
 * Mocks supabase and utils so no real DB calls are made.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../supabase', () => {
  const chain = {};
  chain.from        = jest.fn(() => chain);
  chain.select      = jest.fn(() => chain);
  chain.insert      = jest.fn(() => chain);
  chain.upsert      = jest.fn(() => chain);
  chain.update      = jest.fn(() => chain);
  chain.delete      = jest.fn(() => chain);
  chain.eq          = jest.fn(() => chain);
  chain.neq         = jest.fn(() => chain);
  chain.in          = jest.fn(() => chain);
  chain.order       = jest.fn(() => chain);
  chain.limit       = jest.fn(() => chain);
  chain.range       = jest.fn(() => chain);
  chain.ilike       = jest.fn(() => chain);
  chain.maybeSingle = jest.fn(() => chain);
  chain.single      = jest.fn(() => chain);
  // Default: resolves with null data and no error (used by q() via .then())
  chain.then = jest.fn((resolve) => resolve({ data: null, error: null }));
  return chain;
});

jest.mock('../utils', () => ({
  q: jest.fn(async (promise) => {
    const result = await promise;
    if (result && result.error) throw new Error(result.error.message || 'DB error');
    return result?.data ?? null;
  }),
  parseTags: jest.fn((tags) => ({
    auto_tags:    (tags || []).filter(t => t.tag_type === 'auto').map(t => t.tag),
    mistake_tags: (tags || []).filter(t => t.tag_type === 'mistake').map(t => t.tag),
    coach_tags:   (tags || []).filter(t => t.tag_type === 'coach').map(t => t.tag),
  })),
}));

// ─── Module under test ────────────────────────────────────────────────────────

const {
  getPrimaryRole,
  createPlayer,
  updatePlayer,
  archivePlayer,
  setPassword,
  assignRole,
  removeRole,
  listPlayers,
  findByDisplayName,
} = require('../repositories/PlayerRepository');

const supabase = require('../supabase');
const { q } = require('../utils');

// ─── Helpers ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  q.mockResolvedValue(null);
  // Default chain.then: resolves with null data
  supabase.then.mockImplementation((resolve) => resolve({ data: null, error: null }));
});

// ─── findByDisplayName ────────────────────────────────────────────────────────

describe('findByDisplayName', () => {
  test('returns player row when found', async () => {
    const fakePlayer = {
      id: 'uuid-001', display_name: 'Alice', email: null,
      status: 'active', password_hash: '$2b$hash', is_roster: true, last_seen: null,
    };
    supabase.then.mockImplementationOnce((resolve) =>
      resolve({ data: fakePlayer, error: null })
    );
    const result = await findByDisplayName('Alice');
    expect(result).toEqual(fakePlayer);
  });

  test('returns null when player not found', async () => {
    supabase.then.mockImplementationOnce((resolve) =>
      resolve({ data: null, error: null })
    );
    const result = await findByDisplayName('Nobody');
    expect(result).toBeNull();
  });
});

// ─── getPrimaryRole ───────────────────────────────────────────────────────────

describe('getPrimaryRole', () => {
  test('returns null when player has no roles', async () => {
    supabase.then.mockImplementationOnce((resolve) =>
      resolve({ data: [], error: null })
    );
    const result = await getPrimaryRole('uuid-001');
    expect(result).toBeNull();
  });

  test('returns null when data is null', async () => {
    supabase.then.mockImplementationOnce((resolve) =>
      resolve({ data: null, error: null })
    );
    const result = await getPrimaryRole('uuid-001');
    expect(result).toBeNull();
  });

  test('returns highest-priority role from the priority list', async () => {
    // Player has 'player' and 'coach' — 'coach' has higher priority
    supabase.then.mockImplementationOnce((resolve) =>
      resolve({
        data: [
          { roles: { name: 'player' } },
          { roles: { name: 'coach'  } },
        ],
        error: null,
      })
    );
    const result = await getPrimaryRole('uuid-001');
    expect(result).toBe('coach');
  });

  test('returns "superadmin" when it is present (highest priority)', async () => {
    supabase.then.mockImplementationOnce((resolve) =>
      resolve({
        data: [
          { roles: { name: 'coach'      } },
          { roles: { name: 'superadmin' } },
          { roles: { name: 'player'     } },
        ],
        error: null,
      })
    );
    const result = await getPrimaryRole('uuid-uuid');
    expect(result).toBe('superadmin');
  });

  test('returns first available role when none match the priority list', async () => {
    supabase.then.mockImplementationOnce((resolve) =>
      resolve({
        data: [{ roles: { name: 'custom_role' } }],
        error: null,
      })
    );
    const result = await getPrimaryRole('uuid-001');
    expect(result).toBe('custom_role');
  });

  test('ignores rows where roles is null', async () => {
    supabase.then.mockImplementationOnce((resolve) =>
      resolve({
        data: [
          { roles: null },
          { roles: { name: 'player' } },
        ],
        error: null,
      })
    );
    const result = await getPrimaryRole('uuid-001');
    expect(result).toBe('player');
  });
});

// ─── createPlayer ─────────────────────────────────────────────────────────────

describe('createPlayer', () => {
  test('returns the new player id', async () => {
    supabase.then.mockImplementationOnce((resolve) =>
      resolve({ data: { id: 'new-uuid-123' }, error: null })
    );
    const id = await createPlayer({
      displayName:  'Bob',
      email:        'bob@test.com',
      passwordHash: '$2b$hash',
      createdBy:    'admin-uuid',
    });
    expect(id).toBe('new-uuid-123');
  });

  test('calls supabase insert with correct field mapping', async () => {
    supabase.then.mockImplementationOnce((resolve) =>
      resolve({ data: { id: 'new-uuid-456' }, error: null })
    );
    await createPlayer({
      displayName:  'Carol',
      email:        'carol@test.com',
      passwordHash: '$2b$yyy',
      createdBy:    'admin-uuid',
    });
    // Verify the insert chain was invoked
    expect(supabase.from).toHaveBeenCalledWith('player_profiles');
    expect(supabase.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        display_name:  'Carol',
        email:         'carol@test.com',
        password_hash: '$2b$yyy',
        created_by:    'admin-uuid',
      })
    );
  });

  test('throws when supabase returns an error', async () => {
    supabase.then.mockImplementationOnce((resolve) =>
      resolve({ data: null, error: { message: 'unique_violation' } })
    );
    await expect(
      createPlayer({ displayName: 'Dup', email: null, passwordHash: 'h', createdBy: null })
    ).rejects.toMatchObject({ message: 'unique_violation' });
  });
});

// ─── updatePlayer ─────────────────────────────────────────────────────────────

describe('updatePlayer', () => {
  test('maps camelCase patch keys to snake_case DB columns', async () => {
    supabase.then.mockImplementationOnce((resolve) =>
      resolve({ data: null, error: null })
    );
    await updatePlayer('uuid-001', {
      displayName: 'NewName',
      email:       'new@test.com',
      status:      'active',
      avatarUrl:   'https://example.com/avatar.png',
    });

    expect(supabase.update).toHaveBeenCalledWith(
      expect.objectContaining({
        display_name: 'NewName',
        email:        'new@test.com',
        status:       'active',
        avatar_url:   'https://example.com/avatar.png',
      })
    );
    expect(supabase.eq).toHaveBeenCalledWith('id', 'uuid-001');
  });

  test('only sends fields that are defined in the patch', async () => {
    supabase.then.mockImplementationOnce((resolve) =>
      resolve({ data: null, error: null })
    );
    await updatePlayer('uuid-002', { status: 'suspended' });

    // The update call should only have status, not display_name etc.
    const callArg = supabase.update.mock.calls[0][0];
    expect(callArg).toHaveProperty('status', 'suspended');
    expect(callArg).not.toHaveProperty('display_name');
    expect(callArg).not.toHaveProperty('email');
    expect(callArg).not.toHaveProperty('avatar_url');
  });

  test('throws when supabase returns an error', async () => {
    supabase.then.mockImplementationOnce((resolve) =>
      resolve({ data: null, error: { message: 'update_failed' } })
    );
    await expect(updatePlayer('uuid-bad', { status: 'archived' })).rejects.toMatchObject({ message: 'update_failed' });
  });
});

// ─── archivePlayer ────────────────────────────────────────────────────────────

describe('archivePlayer', () => {
  test('updates status to "archived"', async () => {
    supabase.then.mockImplementationOnce((resolve) =>
      resolve({ data: null, error: null })
    );
    await archivePlayer('uuid-001');

    expect(supabase.from).toHaveBeenCalledWith('player_profiles');
    expect(supabase.update).toHaveBeenCalledWith({ status: 'archived' });
    expect(supabase.eq).toHaveBeenCalledWith('id', 'uuid-001');
  });

  test('throws when supabase returns an error', async () => {
    supabase.then.mockImplementationOnce((resolve) =>
      resolve({ data: null, error: { message: 'archive_error' } })
    );
    await expect(archivePlayer('uuid-bad')).rejects.toMatchObject({ message: 'archive_error' });
  });
});

// ─── setPassword ──────────────────────────────────────────────────────────────

describe('setPassword', () => {
  test('updates password_hash column', async () => {
    supabase.then.mockImplementationOnce((resolve) =>
      resolve({ data: null, error: null })
    );
    await setPassword('uuid-001', '$2b$12$newhash');

    expect(supabase.from).toHaveBeenCalledWith('player_profiles');
    expect(supabase.update).toHaveBeenCalledWith({ password_hash: '$2b$12$newhash' });
    expect(supabase.eq).toHaveBeenCalledWith('id', 'uuid-001');
  });

  test('throws when supabase returns an error', async () => {
    supabase.then.mockImplementationOnce((resolve) =>
      resolve({ data: null, error: { message: 'password_update_failed' } })
    );
    await expect(setPassword('uuid-bad', 'hash')).rejects.toMatchObject({ message: 'password_update_failed' });
  });
});

// ─── assignRole ───────────────────────────────────────────────────────────────

describe('assignRole', () => {
  test('inserts the correct row into player_roles', async () => {
    supabase.then.mockImplementationOnce((resolve) =>
      resolve({ data: null, error: null })
    );
    await assignRole('player-uuid', 'role-uuid', 'admin-uuid');

    expect(supabase.from).toHaveBeenCalledWith('player_roles');
    expect(supabase.insert).toHaveBeenCalledWith({
      player_id:   'player-uuid',
      role_id:     'role-uuid',
      assigned_by: 'admin-uuid',
    });
  });

  test('throws when supabase returns an error (e.g. duplicate)', async () => {
    supabase.then.mockImplementationOnce((resolve) =>
      resolve({ data: null, error: { message: 'duplicate_role' } })
    );
    await expect(assignRole('p', 'r', 'a')).rejects.toMatchObject({ message: 'duplicate_role' });
  });
});

// ─── removeRole ───────────────────────────────────────────────────────────────

describe('removeRole', () => {
  test('deletes the correct row from player_roles', async () => {
    supabase.then.mockImplementationOnce((resolve) =>
      resolve({ data: null, error: null })
    );
    await removeRole('player-uuid', 'role-uuid');

    expect(supabase.from).toHaveBeenCalledWith('player_roles');
    expect(supabase.delete).toHaveBeenCalled();
    // eq should be called for both player_id and role_id
    expect(supabase.eq).toHaveBeenCalledWith('player_id', 'player-uuid');
    expect(supabase.eq).toHaveBeenCalledWith('role_id', 'role-uuid');
  });

  test('throws when supabase returns an error', async () => {
    supabase.then.mockImplementationOnce((resolve) =>
      resolve({ data: null, error: { message: 'delete_error' } })
    );
    await expect(removeRole('p', 'r')).rejects.toMatchObject({ message: 'delete_error' });
  });
});

// ─── listPlayers ──────────────────────────────────────────────────────────────

describe('listPlayers', () => {
  test('returns empty array when no players found', async () => {
    supabase.then.mockImplementationOnce((resolve) =>
      resolve({ data: [], error: null })
    );
    const result = await listPlayers();
    expect(result).toEqual([]);
  });

  test('returns player rows when found', async () => {
    const fakePlayers = [
      { id: 'uuid-001', display_name: 'Alice', status: 'active' },
      { id: 'uuid-002', display_name: 'Bob',   status: 'active' },
    ];
    supabase.then.mockImplementationOnce((resolve) =>
      resolve({ data: fakePlayers, error: null })
    );
    const result = await listPlayers();
    expect(result).toEqual(fakePlayers);
  });

  test('uses default limit of 50 and offset 0 via range()', async () => {
    supabase.then.mockImplementationOnce((resolve) =>
      resolve({ data: [], error: null })
    );
    await listPlayers();
    // range(0, 49) = offset 0, limit 50
    expect(supabase.range).toHaveBeenCalledWith(0, 49);
  });

  test('respects custom limit and offset', async () => {
    supabase.then.mockImplementationOnce((resolve) =>
      resolve({ data: [], error: null })
    );
    await listPlayers({ limit: 10, offset: 20 });
    expect(supabase.range).toHaveBeenCalledWith(20, 29);
  });

  test('applies status filter when provided', async () => {
    supabase.then.mockImplementationOnce((resolve) =>
      resolve({ data: [], error: null })
    );
    await listPlayers({ status: 'suspended' });
    expect(supabase.eq).toHaveBeenCalledWith('status', 'suspended');
  });

  test('does not call eq with status when status is not provided', async () => {
    supabase.then.mockImplementationOnce((resolve) =>
      resolve({ data: [], error: null })
    );
    await listPlayers();
    // eq should NOT have been called with 'status'
    const eqCalls = supabase.eq.mock.calls;
    const statusCall = eqCalls.find(call => call[0] === 'status');
    expect(statusCall).toBeUndefined();
  });

  test('throws when supabase returns an error', async () => {
    supabase.then.mockImplementationOnce((resolve) =>
      resolve({ data: null, error: { message: 'list_error' } })
    );
    await expect(listPlayers()).rejects.toMatchObject({ message: 'list_error' });
  });
});
