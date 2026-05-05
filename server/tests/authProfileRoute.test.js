'use strict';

/**
 * Auth routes integration tests.
 * Covers: GET/PUT /api/auth/profile, POST /api/auth/verify-password,
 *         POST /api/auth/deactivate
 *
 * Mocked modules:
 *   - ../auth/requireAuth.js             — controllable shim via mockCurrentUser
 *   - ../db/repositories/PlayerRepository — findById, findByDisplayName, updatePlayer stubbed
 *   - bcrypt                              — compare/hash controlled by mockBcryptCompare
 *   - ../auth/requirePermission.js        — getPlayerPermissions stubbed
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

let mockCurrentUser = null;

jest.mock('../auth/requireAuth.js', () =>
  jest.fn((req, res, next) => {
    if (!mockCurrentUser) return res.status(401).json({ error: 'auth_required' });
    req.user = mockCurrentUser;
    next();
  })
);

const mockFindById           = jest.fn();
const mockFindByDisplayName  = jest.fn();
const mockUpdatePlayer       = jest.fn();
const mockArchivePlayer      = jest.fn();

jest.mock('../db/repositories/PlayerRepository', () => ({
  findById:          (...args) => mockFindById(...args),
  findByDisplayName: (...args) => mockFindByDisplayName(...args),
  updatePlayer:      (...args) => mockUpdatePlayer(...args),
  archivePlayer:     (...args) => mockArchivePlayer(...args),
  createPlayer:      jest.fn(),
  getPrimaryRole:    jest.fn(),
  assignRole:        jest.fn(),
  setPassword:       jest.fn(),
  loginRosterPlayer: jest.fn(),
}));

// bcrypt.compare is mocked so tests run instantly (no actual hashing).
const mockBcryptCompare = jest.fn();
jest.mock('bcrypt', () => ({
  compare: (...args) => mockBcryptCompare(...args),
  hash:    jest.fn(async (pw) => `hashed:${pw}`),
}));

jest.mock('../auth/requirePermission.js', () => ({
  getPlayerPermissions:      jest.fn().mockResolvedValue(new Set()),
  invalidatePermissionCache: jest.fn(),
  requirePermission:         jest.fn(() => (req, res, next) => next()),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

const express = require('express');
const request = require('supertest');

// ─── App factory ──────────────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());

  const registerAuthRoutes = require('../routes/auth.js');
  registerAuthRoutes(app, {
    HandLogger:   { loginRosterPlayer: jest.fn() },
    PlayerRoster: { authenticate: jest.fn() },
    JwtService:   { sign: jest.fn(() => 'token'), verify: jest.fn() },
    authLimiter:  (req, res, next) => next(),
    log:          { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  });

  return app;
}

const app = buildApp();

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PLAYER_UUID = 'aaaaaaaa-0000-0000-0000-000000000001';
const OTHER_UUID  = 'bbbbbbbb-0000-0000-0000-000000000002';

const fakePlayer = {
  id:           PLAYER_UUID,
  display_name: 'Coach Rivera',
  email:        'coach@example.com',
  school_id:    null,
};

const fakePlayerWithHash = {
  id:            PLAYER_UUID,
  display_name:  'Coach Rivera',
  email:         'coach@example.com',
  password_hash: '$2b$12$somehash',
  school_id:     null,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrentUser = null;
  mockBcryptCompare.mockResolvedValue(false); // default: wrong password
});

// ─── GET /api/auth/profile ────────────────────────────────────────────────────

describe('GET /api/auth/profile', () => {
  test('returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/auth/profile');
    expect(res.status).toBe(401);
  });

  test('returns 200 with profile fields for authenticated user', async () => {
    mockCurrentUser = { stableId: PLAYER_UUID, name: 'Coach Rivera', role: 'coach' };
    mockFindById.mockResolvedValueOnce(fakePlayer);

    const res = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', 'Bearer valid');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id:           PLAYER_UUID,
      display_name: 'Coach Rivera',
      email:        'coach@example.com',
      role:         'coach',
      school_id:    null,
    });
    // password_hash must NOT be present
    expect(res.body).not.toHaveProperty('password_hash');
  });

  test('returns 404 when player record not found', async () => {
    mockCurrentUser = { stableId: PLAYER_UUID, name: 'Ghost', role: 'player' };
    mockFindById.mockResolvedValueOnce(null);

    const res = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', 'Bearer valid');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not_found');
  });

  test('returns 500 when DB throws', async () => {
    mockCurrentUser = { stableId: PLAYER_UUID, name: 'Coach Rivera', role: 'coach' };
    mockFindById.mockRejectedValueOnce(new Error('DB down'));

    const res = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', 'Bearer valid');

    expect(res.status).toBe(500);
  });

  test('email is null when player has no email', async () => {
    mockCurrentUser = { stableId: PLAYER_UUID, name: 'NoEmail', role: 'player' };
    mockFindById.mockResolvedValueOnce({ ...fakePlayer, email: undefined });

    const res = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', 'Bearer valid');

    expect(res.status).toBe(200);
    expect(res.body.email).toBeNull();
  });
});

// ─── PUT /api/auth/profile ────────────────────────────────────────────────────

describe('PUT /api/auth/profile', () => {
  test('returns 401 when unauthenticated', async () => {
    const res = await request(app).put('/api/auth/profile').send({ display_name: 'New' });
    expect(res.status).toBe(401);
  });

  test('returns 400 when no fields provided', async () => {
    mockCurrentUser = { stableId: PLAYER_UUID, name: 'Coach Rivera', role: 'coach' };

    const res = await request(app)
      .put('/api/auth/profile')
      .set('Authorization', 'Bearer valid')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('no_fields');
  });

  test('returns 400 when display_name is too short', async () => {
    mockCurrentUser = { stableId: PLAYER_UUID, name: 'Coach Rivera', role: 'coach' };

    const res = await request(app)
      .put('/api/auth/profile')
      .set('Authorization', 'Bearer valid')
      .send({ display_name: 'X' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_name');
  });

  test('returns 400 when email is invalid', async () => {
    mockCurrentUser = { stableId: PLAYER_UUID, name: 'Coach Rivera', role: 'coach' };

    const res = await request(app)
      .put('/api/auth/profile')
      .set('Authorization', 'Bearer valid')
      .send({ email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_email');
  });

  test('returns 409 when new display_name is taken by another user', async () => {
    mockCurrentUser = { stableId: PLAYER_UUID, name: 'Coach Rivera', role: 'coach' };
    // Simulate another player with the same name
    mockFindByDisplayName.mockResolvedValueOnce({ id: OTHER_UUID, display_name: 'Taken Name' });

    const res = await request(app)
      .put('/api/auth/profile')
      .set('Authorization', 'Bearer valid')
      .send({ display_name: 'Taken Name' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('name_taken');
  });

  test('allows update when the taken name belongs to the same user (no-op rename)', async () => {
    mockCurrentUser = { stableId: PLAYER_UUID, name: 'Coach Rivera', role: 'coach' };
    // findByDisplayName returns the current user's own record
    mockFindByDisplayName.mockResolvedValueOnce({ id: PLAYER_UUID, display_name: 'Coach Rivera' });
    mockUpdatePlayer.mockResolvedValueOnce(undefined);

    const res = await request(app)
      .put('/api/auth/profile')
      .set('Authorization', 'Bearer valid')
      .send({ display_name: 'Coach Rivera' });

    expect(res.status).toBe(200);
    expect(mockUpdatePlayer).toHaveBeenCalledWith(PLAYER_UUID, { displayName: 'Coach Rivera' });
  });

  test('returns 200 and updates display_name successfully', async () => {
    mockCurrentUser = { stableId: PLAYER_UUID, name: 'Old Name', role: 'coach' };
    mockFindByDisplayName.mockResolvedValueOnce(null); // name not taken
    mockUpdatePlayer.mockResolvedValueOnce(undefined);

    const res = await request(app)
      .put('/api/auth/profile')
      .set('Authorization', 'Bearer valid')
      .send({ display_name: 'New Name' });

    expect(res.status).toBe(200);
    expect(res.body.display_name).toBe('New Name');
    expect(mockUpdatePlayer).toHaveBeenCalledWith(PLAYER_UUID, { displayName: 'New Name' });
  });

  test('returns 200 and updates email successfully', async () => {
    mockCurrentUser = { stableId: PLAYER_UUID, name: 'Coach Rivera', role: 'coach' };
    mockUpdatePlayer.mockResolvedValueOnce(undefined);

    const res = await request(app)
      .put('/api/auth/profile')
      .set('Authorization', 'Bearer valid')
      .send({ email: 'New@Example.COM' });

    expect(res.status).toBe(200);
    // email should be normalised to lowercase
    expect(mockUpdatePlayer).toHaveBeenCalledWith(PLAYER_UUID, { email: 'new@example.com' });
  });

  test('clears email when empty string is sent', async () => {
    mockCurrentUser = { stableId: PLAYER_UUID, name: 'Coach Rivera', role: 'coach' };
    mockUpdatePlayer.mockResolvedValueOnce(undefined);

    const res = await request(app)
      .put('/api/auth/profile')
      .set('Authorization', 'Bearer valid')
      .send({ email: '' });

    expect(res.status).toBe(200);
    expect(mockUpdatePlayer).toHaveBeenCalledWith(PLAYER_UUID, { email: null });
  });

  test('updates both display_name and email in one request', async () => {
    mockCurrentUser = { stableId: PLAYER_UUID, name: 'Old', role: 'coach' };
    mockFindByDisplayName.mockResolvedValueOnce(null);
    mockUpdatePlayer.mockResolvedValueOnce(undefined);

    const res = await request(app)
      .put('/api/auth/profile')
      .set('Authorization', 'Bearer valid')
      .send({ display_name: 'Coach New', email: 'new@coach.com' });

    expect(res.status).toBe(200);
    expect(mockUpdatePlayer).toHaveBeenCalledWith(PLAYER_UUID, {
      displayName: 'Coach New',
      email:       'new@coach.com',
    });
  });

  test('returns 500 when updatePlayer throws', async () => {
    mockCurrentUser = { stableId: PLAYER_UUID, name: 'Coach Rivera', role: 'coach' };
    mockFindByDisplayName.mockResolvedValueOnce(null);
    mockUpdatePlayer.mockRejectedValueOnce(new Error('DB error'));

    const res = await request(app)
      .put('/api/auth/profile')
      .set('Authorization', 'Bearer valid')
      .send({ display_name: 'Coach New' });

    expect(res.status).toBe(500);
  });
});

// ─── POST /api/auth/verify-password ──────────────────────────────────────────

describe('POST /api/auth/verify-password', () => {
  test('returns 401 when unauthenticated', async () => {
    const res = await request(app)
      .post('/api/auth/verify-password')
      .send({ password: 'secret' });
    expect(res.status).toBe(401);
  });

  test('returns 400 when password not provided', async () => {
    mockCurrentUser = { stableId: PLAYER_UUID, name: 'Coach Rivera', role: 'coach' };
    const res = await request(app)
      .post('/api/auth/verify-password')
      .set('Authorization', 'Bearer valid')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_body');
  });

  test('returns 404 when player not found', async () => {
    mockCurrentUser = { stableId: PLAYER_UUID, name: 'Ghost', role: 'coach' };
    mockFindById.mockResolvedValueOnce(null);

    const res = await request(app)
      .post('/api/auth/verify-password')
      .set('Authorization', 'Bearer valid')
      .send({ password: 'secret' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not_found');
  });

  test('returns 401 when password is wrong', async () => {
    mockCurrentUser = { stableId: PLAYER_UUID, name: 'Coach Rivera', role: 'coach' };
    mockFindById.mockResolvedValueOnce(fakePlayerWithHash);
    mockBcryptCompare.mockResolvedValueOnce(false);

    const res = await request(app)
      .post('/api/auth/verify-password')
      .set('Authorization', 'Bearer valid')
      .send({ password: 'wrongpass' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('invalid_credentials');
  });

  test('returns 200 with verified:true when password is correct', async () => {
    mockCurrentUser = { stableId: PLAYER_UUID, name: 'Coach Rivera', role: 'coach' };
    mockFindById.mockResolvedValueOnce(fakePlayerWithHash);
    mockBcryptCompare.mockResolvedValueOnce(true);

    const res = await request(app)
      .post('/api/auth/verify-password')
      .set('Authorization', 'Bearer valid')
      .send({ password: 'correctpass' });

    expect(res.status).toBe(200);
    expect(res.body.verified).toBe(true);
  });
});

// ─── POST /api/auth/deactivate ────────────────────────────────────────────────

describe('POST /api/auth/deactivate', () => {
  test('returns 401 when unauthenticated', async () => {
    const res = await request(app)
      .post('/api/auth/deactivate')
      .send({ password: 'secret' });
    expect(res.status).toBe(401);
  });

  test('returns 400 when password not provided', async () => {
    mockCurrentUser = { stableId: PLAYER_UUID, name: 'Coach Rivera', role: 'coach' };
    const res = await request(app)
      .post('/api/auth/deactivate')
      .set('Authorization', 'Bearer valid')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_body');
  });

  test('returns 401 when password is wrong', async () => {
    mockCurrentUser = { stableId: PLAYER_UUID, name: 'Coach Rivera', role: 'coach' };
    mockFindById.mockResolvedValueOnce(fakePlayerWithHash);
    mockBcryptCompare.mockResolvedValueOnce(false);

    const res = await request(app)
      .post('/api/auth/deactivate')
      .set('Authorization', 'Bearer valid')
      .send({ password: 'wrongpass' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('invalid_credentials');
    expect(mockArchivePlayer).not.toHaveBeenCalled();
  });

  test('returns 200 and archives account when password is correct', async () => {
    mockCurrentUser = { stableId: PLAYER_UUID, name: 'Coach Rivera', role: 'coach' };
    mockFindById.mockResolvedValueOnce(fakePlayerWithHash);
    mockBcryptCompare.mockResolvedValueOnce(true);
    mockArchivePlayer.mockResolvedValueOnce(undefined);

    const res = await request(app)
      .post('/api/auth/deactivate')
      .set('Authorization', 'Bearer valid')
      .send({ password: 'correctpass' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockArchivePlayer).toHaveBeenCalledWith(PLAYER_UUID);
  });

  test('returns 500 when archivePlayer throws', async () => {
    mockCurrentUser = { stableId: PLAYER_UUID, name: 'Coach Rivera', role: 'coach' };
    mockFindById.mockResolvedValueOnce(fakePlayerWithHash);
    mockBcryptCompare.mockResolvedValueOnce(true);
    mockArchivePlayer.mockRejectedValueOnce(new Error('DB error'));

    const res = await request(app)
      .post('/api/auth/deactivate')
      .set('Authorization', 'Bearer valid')
      .send({ password: 'correctpass' });

    expect(res.status).toBe(500);
  });
});
