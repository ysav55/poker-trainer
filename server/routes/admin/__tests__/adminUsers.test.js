'use strict';

/**
 * Admin Users API — integration-style tests using supertest.
 *
 * Tests the route handlers in server/routes/admin/users.js.
 * We mount the router directly on a minimal Express app to avoid
 * loading the entire server/index.js (which needs socket.io, etc.).
 *
 * Mocked modules:
 *   - bcrypt              — hash() returns predictable 'hashed:<input>'
 *   - PlayerRepository    — all DB methods stubbed
 *   - requirePermission   — replaced with a controllable middleware
 *   - supabase            — for the inline roles lookup in POST /users
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('bcrypt', () => ({
  hash:    jest.fn(async (plain) => `hashed:${plain}`),
  compare: jest.fn(async (a, b) => a === b),
}));

jest.mock('../../../db/repositories/PlayerRepository', () => ({
  listPlayers:   jest.fn(),
  createPlayer:  jest.fn(),
  updatePlayer:  jest.fn(),
  archivePlayer: jest.fn(),
  setPassword:   jest.fn(),
  assignRole:    jest.fn(),
  removeRole:    jest.fn(),
}));

jest.mock('../../../db/supabase.js', () => {
  const chain = {
    from:         jest.fn(),
    select:       jest.fn(),
    eq:           jest.fn(),
    single:       jest.fn(),
    maybeSingle:  jest.fn(),
    delete:       jest.fn(),
  };
  chain.from.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.delete.mockReturnValue(chain);
  // Default: no role found
  chain.single.mockResolvedValue({ data: null, error: null });
  chain.maybeSingle.mockResolvedValue({ data: null, error: null });
  return chain;
});

// requirePermission is hoisted — we expose a jest.fn so individual tests
// can control whether the permission check passes or fails.
const mockPermMiddleware = jest.fn((req, res, next) => next());
jest.mock('../../../auth/requirePermission', () => ({
  requirePermission: jest.fn(() => mockPermMiddleware),
  invalidatePermissionCache: jest.fn(),
}));

// ─── App setup ────────────────────────────────────────────────────────────────

const express    = require('express');
const request    = require('supertest');
const supabase   = require('../../../db/supabase.js');
const bcrypt     = require('bcrypt');
const {
  listPlayers,
  createPlayer,
  updatePlayer,
  archivePlayer,
  setPassword,
  assignRole,
} = require('../../../db/repositories/PlayerRepository');
const { invalidatePermissionCache } = require('../../../auth/requirePermission');

/**
 * Build a fresh mini-app for each test suite to avoid state leakage.
 * We manually inject requireAuth so we can control req.user.
 */
function buildApp({ user = null } = {}) {
  const app = express();
  app.use(express.json());

  // Inject a fake requireAuth that sets req.user from the `user` closure
  app.use((req, res, next) => {
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    req.user = user;
    next();
  });

  // Mount the admin router at /api/admin
  const adminUsersRouter = require('../users');
  app.use('/api/admin', adminUsersRouter);

  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  // Restore default chain behaviour after clearAllMocks
  supabase.from.mockReturnValue(supabase);
  supabase.select.mockReturnValue(supabase);
  supabase.eq.mockReturnValue(supabase);
  supabase.delete.mockReturnValue(supabase);
  supabase.single.mockResolvedValue({ data: null, error: null });
  supabase.maybeSingle.mockResolvedValue({ data: null, error: null });
  // Default: permission check passes
  mockPermMiddleware.mockImplementation((req, res, next) => next());
});

// ─── GET /api/admin/users ─────────────────────────────────────────────────────

describe('GET /api/admin/users', () => {
  test('returns 401 without auth (no user)', async () => {
    const app = buildApp({ user: null });
    const res = await request(app).get('/api/admin/users');
    expect(res.status).toBe(401);
  });

  test('returns 403 without user:manage permission', async () => {
    mockPermMiddleware.mockImplementationOnce((req, res) =>
      res.status(403).json({ error: 'Insufficient permissions' })
    );
    const app = buildApp({ user: { id: 'player-uuid', role: 'player' } });
    const res = await request(app).get('/api/admin/users');
    expect(res.status).toBe(403);
  });

  test('returns 200 with players array when authorized', async () => {
    const fakePlayers = [
      { id: 'uuid-001', display_name: 'Alice', status: 'active', player_roles: [] },
    ];
    listPlayers.mockResolvedValueOnce(fakePlayers);

    const app = buildApp({ user: { id: 'admin-uuid', role: 'admin' } });
    const res = await request(app).get('/api/admin/users');

    expect(res.status).toBe(200);
    expect(res.body.players).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'uuid-001', display_name: 'Alice', status: 'active' }),
      ])
    );
  });

  test('passes status query param to listPlayers', async () => {
    listPlayers.mockResolvedValueOnce([]);
    const app = buildApp({ user: { id: 'admin-uuid' } });
    await request(app).get('/api/admin/users?status=suspended');
    expect(listPlayers).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'suspended' })
    );
  });

  test('returns 500 when listPlayers throws', async () => {
    listPlayers.mockRejectedValueOnce(new Error('DB failure'));
    const app = buildApp({ user: { id: 'admin-uuid' } });
    const res = await request(app).get('/api/admin/users');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('internal_error');
  });
});

// ─── POST /api/admin/users ────────────────────────────────────────────────────

describe('POST /api/admin/users', () => {
  test('returns 400 when displayName is missing', async () => {
    const app = buildApp({ user: { id: 'admin-uuid' } });
    const res = await request(app)
      .post('/api/admin/users')
      .send({ password: 'secret' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/displayName/);
  });

  test('returns 400 when password is missing', async () => {
    const app = buildApp({ user: { id: 'admin-uuid' } });
    const res = await request(app)
      .post('/api/admin/users')
      .send({ displayName: 'NewPlayer' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/password/);
  });

  test('creates user and returns 201 with new id', async () => {
    createPlayer.mockResolvedValueOnce('new-uuid-999');
    // No role row found — assignRole won't be called
    supabase.single.mockResolvedValueOnce({ data: null, error: null });

    const app = buildApp({ user: { id: 'admin-uuid' } });
    const res = await request(app)
      .post('/api/admin/users')
      .send({ displayName: 'NewPlayer', password: 'mypassword', role: 'player' });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe('new-uuid-999');
  });

  test('hashes password — never stores plaintext', async () => {
    createPlayer.mockResolvedValueOnce('new-uuid-abc');
    supabase.single.mockResolvedValueOnce({ data: null, error: null });

    const app = buildApp({ user: { id: 'admin-uuid' } });
    await request(app)
      .post('/api/admin/users')
      .send({ displayName: 'Bob', password: 'plaintext123' });

    expect(bcrypt.hash).toHaveBeenCalledWith('plaintext123', 12);
    // createPlayer should receive the hash, not the plaintext
    const createCall = createPlayer.mock.calls[0][0];
    expect(createCall.passwordHash).toBe('hashed:plaintext123');
    expect(createCall.passwordHash).not.toBe('plaintext123');
  });

  test('assigns role and invalidates cache when role row is found', async () => {
    createPlayer.mockResolvedValueOnce('new-uuid-xyz');
    supabase.single.mockResolvedValueOnce({ data: { id: 'role-uuid-coach' }, error: null });
    assignRole.mockResolvedValueOnce(undefined);

    const app = buildApp({ user: { id: 'admin-uuid' } });
    await request(app)
      .post('/api/admin/users')
      .send({ displayName: 'Coach', password: 'pass', role: 'coach' });

    expect(assignRole).toHaveBeenCalledWith('new-uuid-xyz', 'role-uuid-coach', 'admin-uuid');
    expect(invalidatePermissionCache).toHaveBeenCalledWith('new-uuid-xyz');
  });

  test('returns 500 when createPlayer throws', async () => {
    createPlayer.mockRejectedValueOnce(new Error('insert failed'));

    const app = buildApp({ user: { id: 'admin-uuid' } });
    const res = await request(app)
      .post('/api/admin/users')
      .send({ displayName: 'Fail', password: 'pass' });

    expect(res.status).toBe(500);
  });
});

// ─── DELETE /api/admin/users/:id ──────────────────────────────────────────────

describe('DELETE /api/admin/users/:id', () => {
  test('archives the user (sets status = "archived")', async () => {
    archivePlayer.mockResolvedValueOnce(undefined);
    const app = buildApp({ user: { id: 'admin-uuid' } });

    const res = await request(app).delete('/api/admin/users/target-uuid');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(archivePlayer).toHaveBeenCalledWith('target-uuid');
  });

  test('returns 401 without auth', async () => {
    const app = buildApp({ user: null });
    const res = await request(app).delete('/api/admin/users/target-uuid');
    expect(res.status).toBe(401);
  });

  test('returns 403 when permission middleware rejects', async () => {
    mockPermMiddleware.mockImplementationOnce((req, res) =>
      res.status(403).json({ error: 'Insufficient permissions' })
    );
    const app = buildApp({ user: { id: 'player-uuid', role: 'player' } });
    const res = await request(app).delete('/api/admin/users/target-uuid');
    expect(res.status).toBe(403);
  });

  test('returns 500 when archivePlayer throws', async () => {
    archivePlayer.mockRejectedValueOnce(new Error('archive failed'));
    const app = buildApp({ user: { id: 'admin-uuid' } });
    const res = await request(app).delete('/api/admin/users/target-uuid');
    expect(res.status).toBe(500);
  });
});

// ─── POST /api/admin/users/:id/reset-password ─────────────────────────────────

describe('POST /api/admin/users/:id/reset-password', () => {
  test('returns 400 when password is missing', async () => {
    const app = buildApp({ user: { id: 'admin-uuid' } });
    const res = await request(app)
      .post('/api/admin/users/uuid-001/reset-password')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/password/);
  });

  test('hashes new password — never returns or stores plaintext', async () => {
    setPassword.mockResolvedValueOnce(undefined);
    const app = buildApp({ user: { id: 'admin-uuid' } });

    const res = await request(app)
      .post('/api/admin/users/uuid-001/reset-password')
      .send({ password: 'newplaintext' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // bcrypt.hash was called with the plaintext and 12 rounds
    expect(bcrypt.hash).toHaveBeenCalledWith('newplaintext', 12);

    // setPassword received the hash, not the plaintext
    expect(setPassword).toHaveBeenCalledWith('uuid-001', 'hashed:newplaintext');

    // Response body does NOT contain the password or hash
    expect(JSON.stringify(res.body)).not.toContain('newplaintext');
    expect(JSON.stringify(res.body)).not.toContain('hashed:');
  });

  test('returns 401 without auth', async () => {
    const app = buildApp({ user: null });
    const res = await request(app)
      .post('/api/admin/users/uuid-001/reset-password')
      .send({ password: 'x' });
    expect(res.status).toBe(401);
  });

  test('returns 500 when setPassword throws', async () => {
    setPassword.mockRejectedValueOnce(new Error('DB error'));
    const app = buildApp({ user: { id: 'admin-uuid' } });
    const res = await request(app)
      .post('/api/admin/users/uuid-001/reset-password')
      .send({ password: 'pass' });
    expect(res.status).toBe(500);
  });
});

// ─── GET /api/admin/users/:id ─────────────────────────────────────────────────

describe('GET /api/admin/users/:id', () => {
  // Wire eq().maybeSingle() for this test group
  beforeEach(() => {
    supabase.eq.mockReturnValue({
      maybeSingle: supabase.maybeSingle,
      eq: supabase.eq,
    });
  });

  test('returns 200 with player data when found', async () => {
    const fakeProfile = {
      id: 'uuid-player-001',
      display_name: 'Alice',
      email: 'alice@example.com',
      status: 'active',
    };
    supabase.maybeSingle.mockResolvedValueOnce({ data: fakeProfile, error: null });

    const app = buildApp({ user: { id: 'admin-uuid' } });
    const res = await request(app).get('/api/admin/users/uuid-player-001');

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('uuid-player-001');
    expect(res.body.display_name).toBe('Alice');
  });

  test('returns 404 when player is not found', async () => {
    supabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const app = buildApp({ user: { id: 'admin-uuid' } });
    const res = await request(app).get('/api/admin/users/uuid-missing');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not_found');
  });

  test('returns 500 when supabase returns an error', async () => {
    supabase.maybeSingle.mockResolvedValueOnce({ data: null, error: { message: 'DB down' } });

    const app = buildApp({ user: { id: 'admin-uuid' } });
    const res = await request(app).get('/api/admin/users/uuid-err');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('internal_error');
  });

  test('returns 401 without auth', async () => {
    const app = buildApp({ user: null });
    const res = await request(app).get('/api/admin/users/uuid-001');
    expect(res.status).toBe(401);
  });
});

// ─── PUT /api/admin/users/:id ─────────────────────────────────────────────────

describe('PUT /api/admin/users/:id', () => {
  test('updates user fields and returns 200 with success=true', async () => {
    updatePlayer.mockResolvedValueOnce(undefined);

    const app = buildApp({ user: { id: 'admin-uuid' } });
    const res = await request(app)
      .put('/api/admin/users/uuid-update-001')
      .send({ displayName: 'Updated Name', status: 'suspended' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(updatePlayer).toHaveBeenCalledWith(
      'uuid-update-001',
      expect.objectContaining({ displayName: 'Updated Name', status: 'suspended' })
    );
  });

  test('only includes fields that are present in the request body', async () => {
    updatePlayer.mockResolvedValueOnce(undefined);

    const app = buildApp({ user: { id: 'admin-uuid' } });
    await request(app)
      .put('/api/admin/users/uuid-partial')
      .send({ displayName: 'Partial Update' });

    const patchArg = updatePlayer.mock.calls[0][1];
    expect(patchArg).toHaveProperty('displayName', 'Partial Update');
    expect(patchArg).not.toHaveProperty('email');
    expect(patchArg).not.toHaveProperty('status');
    expect(patchArg).not.toHaveProperty('avatarUrl');
  });

  test('returns 401 without auth', async () => {
    const app = buildApp({ user: null });
    const res = await request(app).put('/api/admin/users/uuid-001').send({ displayName: 'X' });
    expect(res.status).toBe(401);
  });

  test('returns 500 when updatePlayer throws', async () => {
    updatePlayer.mockRejectedValueOnce(new Error('update failed'));

    const app = buildApp({ user: { id: 'admin-uuid' } });
    const res = await request(app)
      .put('/api/admin/users/uuid-fail')
      .send({ displayName: 'Fail' });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('internal_error');
  });
});

// ─── POST /api/admin/users/:id/roles ─────────────────────────────────────────

describe('POST /api/admin/users/:id/roles', () => {
  const { removeRole } = require('../../../db/repositories/PlayerRepository');

  beforeEach(() => {
    // Restore eq to return chain (not maybeSingle override from GET tests)
    supabase.eq.mockReturnValue(supabase);
    supabase.single.mockResolvedValue({ data: null, error: null });
  });

  test('returns 400 when action is missing', async () => {
    const app = buildApp({ user: { id: 'admin-uuid' } });
    const res = await request(app)
      .post('/api/admin/users/uuid-001/roles')
      .send({ role: 'coach' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/action/);
  });

  test('returns 400 when role is missing', async () => {
    const app = buildApp({ user: { id: 'admin-uuid' } });
    const res = await request(app)
      .post('/api/admin/users/uuid-001/roles')
      .send({ action: 'assign' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/role/);
  });

  test('returns 400 when action is not assign or remove', async () => {
    const app = buildApp({ user: { id: 'admin-uuid' } });
    const res = await request(app)
      .post('/api/admin/users/uuid-001/roles')
      .send({ action: 'delete', role: 'coach' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/assign.*remove|remove.*assign/i);
  });

  test('returns 404 when role name not found in DB', async () => {
    supabase.single.mockResolvedValueOnce({ data: null, error: null }); // no role row

    const app = buildApp({ user: { id: 'admin-uuid' } });
    const res = await request(app)
      .post('/api/admin/users/uuid-001/roles')
      .send({ action: 'assign', role: 'nonexistent_role' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('role_not_found');
  });

  test('assigns role and invalidates cache when action=assign', async () => {
    supabase.single.mockResolvedValueOnce({ data: { id: 'role-uuid-coach' }, error: null });
    assignRole.mockResolvedValueOnce(undefined);

    const app = buildApp({ user: { id: 'admin-uuid' } });
    const res = await request(app)
      .post('/api/admin/users/uuid-target/roles')
      .send({ action: 'assign', role: 'coach' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(assignRole).toHaveBeenCalledWith('uuid-target', 'role-uuid-coach', 'admin-uuid');
    expect(invalidatePermissionCache).toHaveBeenCalledWith('uuid-target');
  });

  test('removes role and invalidates cache when action=remove', async () => {
    supabase.single.mockResolvedValueOnce({ data: { id: 'role-uuid-player' }, error: null });
    removeRole.mockResolvedValueOnce(undefined);

    const app = buildApp({ user: { id: 'admin-uuid' } });
    const res = await request(app)
      .post('/api/admin/users/uuid-target/roles')
      .send({ action: 'remove', role: 'player' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(removeRole).toHaveBeenCalledWith('uuid-target', 'role-uuid-player');
    expect(invalidatePermissionCache).toHaveBeenCalledWith('uuid-target');
  });

  test('returns 401 without auth', async () => {
    const app = buildApp({ user: null });
    const res = await request(app)
      .post('/api/admin/users/uuid-001/roles')
      .send({ action: 'assign', role: 'coach' });
    expect(res.status).toBe(401);
  });

  test('returns 500 when assignRole throws', async () => {
    supabase.single.mockResolvedValueOnce({ data: { id: 'role-uuid-err' }, error: null });
    assignRole.mockRejectedValueOnce(new Error('assign failed'));

    const app = buildApp({ user: { id: 'admin-uuid' } });
    const res = await request(app)
      .post('/api/admin/users/uuid-fail/roles')
      .send({ action: 'assign', role: 'coach' });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('internal_error');
  });
});
