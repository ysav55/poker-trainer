'use strict';

/**
 * POST /api/admin/users — creates a user with role and optional coach assignment.
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('bcrypt', () => ({
  hash: jest.fn(async (plain) => `hashed:${plain}`),
}));

jest.mock('../../db/repositories/PlayerRepository', () => ({
  createPlayer:             jest.fn(),
  updatePlayer:             jest.fn(),
  assignRole:               jest.fn(),
  removeRole:               jest.fn(),
  listPlayers:              jest.fn(),
  getPrimaryRole:           jest.fn(),
  findByDisplayName:        jest.fn(),
  findById:                 jest.fn(),
  archivePlayer:            jest.fn(),
  setPassword:              jest.fn(),
}));

// Chainable supabase mock
const mockSupabase = {
  from:        jest.fn().mockReturnThis(),
  select:      jest.fn().mockReturnThis(),
  insert:      jest.fn().mockReturnThis(),
  update:      jest.fn().mockReturnThis(),
  delete:      jest.fn().mockReturnThis(),
  eq:          jest.fn().mockReturnThis(),
  in:          jest.fn().mockReturnThis(),
  single:      jest.fn().mockResolvedValue({ data: { id: 'role-uuid-1' }, error: null }),
  maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
};
jest.mock('../../db/supabase.js', () => mockSupabase);

let mockCurrentUser = null;
jest.mock('../../auth/requireAuth.js', () =>
  jest.fn((req, res, next) => {
    if (!mockCurrentUser) return res.status(401).json({ error: 'auth_required' });
    req.user = mockCurrentUser;
    next();
  })
);

jest.mock('../../auth/requirePermission.js', () => ({
  requirePermission:         jest.fn(() => (req, res, next) => next()),
  invalidatePermissionCache: jest.fn(),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

const express    = require('express');
const request    = require('supertest');
const requireAuth = require('../../auth/requireAuth.js');
const PlayerRepo  = require('../../db/repositories/PlayerRepository');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', requireAuth, require('../admin/users'));
  return app;
}

const app = buildApp();

// ── Fixtures ──────────────────────────────────────────────────────────────────

const adminUser  = { stableId: 'admin-1', id: 'admin-1', role: 'admin' };
const validBody  = { display_name: 'Alice Student', email: 'alice@example.com', password: 'secret123', role: 'coached_student' };

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrentUser = null;
  PlayerRepo.createPlayer.mockResolvedValue('new-player-uuid');
  PlayerRepo.updatePlayer.mockResolvedValue(undefined);
  PlayerRepo.assignRole.mockResolvedValue(undefined);
  PlayerRepo.listPlayers.mockResolvedValue([]);
  mockSupabase.maybeSingle.mockResolvedValue({ data: { id: 'role-uuid-1' }, error: null });
  mockSupabase.delete.mockReturnValue({
    eq: jest.fn().mockResolvedValue({ error: null }),
  });
});

// ── POST /api/admin/users ─────────────────────────────────────────────────────

describe('POST /api/admin/users', () => {
  test('returns 401 when not authenticated', async () => {
    const res = await request(app).post('/api/admin/users').send(validBody);
    expect(res.status).toBe(401);
  });

  test('returns 400 when display_name is missing', async () => {
    mockCurrentUser = adminUser;
    const res = await request(app).post('/api/admin/users').send({
      password: 'secret123',
      role: 'coached_student',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/displayName/i);
  });

  test('returns 400 when password is missing', async () => {
    mockCurrentUser = adminUser;
    const res = await request(app).post('/api/admin/users').send({
      display_name: 'Alice',
      role: 'coached_student',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/password/i);
  });

  test('returns 201 with new user id on success', async () => {
    mockCurrentUser = adminUser;
    const res = await request(app).post('/api/admin/users').send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.id).toBe('new-player-uuid');
    expect(PlayerRepo.createPlayer).toHaveBeenCalledTimes(1);
  });

  test('calls updatePlayer with coachId when coachId is provided in body', async () => {
    mockCurrentUser = adminUser;
    const res = await request(app)
      .post('/api/admin/users')
      .send({ ...validBody, coachId: 'coach-uuid-1' });

    expect(res.status).toBe(201);
    expect(PlayerRepo.updatePlayer).toHaveBeenCalledWith(
      'new-player-uuid',
      { coachId: 'coach-uuid-1' }
    );
  });

  test('does NOT call updatePlayer with coachId when coachId is absent', async () => {
    mockCurrentUser = adminUser;
    await request(app).post('/api/admin/users').send(validBody);

    const coachIdCalls = PlayerRepo.updatePlayer.mock.calls.filter(
      (c) => c[1]?.coachId !== undefined
    );
    expect(coachIdCalls).toHaveLength(0);
  });
});
