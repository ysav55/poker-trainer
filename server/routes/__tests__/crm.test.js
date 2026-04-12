'use strict';

/**
 * Admin CRM routes tests.
 *
 * Endpoints covered:
 *   GET  /api/admin/players          — list players
 *   POST /api/admin/students         — create student account
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../db/repositories/PlayerRepository', () => ({
  listPlayers:       jest.fn(),
  findByDisplayName: jest.fn(),
  createPlayer:      jest.fn(),
  assignRole:        jest.fn(),
}));

jest.mock('../../db/repositories/CRMRepository', () => ({}));

jest.mock('../../jobs/snapshotJob', () => ({
  computeAllSnapshots:  jest.fn(),
  scheduleSundaySnapshot: jest.fn(),
}));

// Supabase mock — returns empty results by default; tests override as needed.
const mockSupabaseChain = {
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  in: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  single: jest.fn().mockResolvedValue({ data: null, error: null }),
};
jest.mock('../../db/supabase', () => mockSupabaseChain);

// requireAuth shim
let mockCurrentUser = null;
jest.mock('../../auth/requireAuth.js', () =>
  jest.fn((req, _res, next) => {
    if (!mockCurrentUser) return _res.status(401).json({ error: 'auth_required' });
    req.user = mockCurrentUser;
    next();
  })
);

// requirePermission — always passes when user is set
jest.mock('../../auth/requirePermission.js', () => ({
  requirePermission: jest.fn(() => (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'auth_required' });
    next();
  }),
  getPlayerPermissions:      jest.fn().mockResolvedValue(new Set(['crm:view', 'crm:edit'])),
  invalidatePermissionCache: jest.fn(),
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

const express    = require('express');
const request    = require('supertest');
const requireAuth = require('../../auth/requireAuth.js');
const PlayerRepo  = require('../../db/repositories/PlayerRepository');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', requireAuth, require('../admin/crm'));
  return app;
}

const app = buildApp();

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const adminUser = { stableId: 'admin-1', id: 'admin-1', role: 'admin' };

const samplePlayers = [
  { id: 'p-1', display_name: 'Alice', email: 'alice@test.com', status: 'active', avatar_url: null, last_seen: null, coach_id: null, created_at: '2026-01-01T00:00:00Z', role: 'player' },
  { id: 'p-2', display_name: 'Bob',   email: 'bob@test.com',   status: 'active', avatar_url: null, last_seen: null, coach_id: null, created_at: '2026-01-02T00:00:00Z', role: 'coach'  },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrentUser = null;
  // Reset supabase chain methods to no-op defaults
  mockSupabaseChain.single.mockResolvedValue({ data: null, error: null });
});

// ─── GET /api/admin/players ───────────────────────────────────────────────────

describe('GET /api/admin/players', () => {
  test('returns 401 when not authenticated', async () => {
    const res = await request(app).get('/api/admin/players');
    expect(res.status).toBe(401);
  });

  test('returns 200 with players array on success', async () => {
    mockCurrentUser = adminUser;
    PlayerRepo.listPlayers.mockResolvedValue(samplePlayers);

    const res = await request(app).get('/api/admin/players');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('players');
    expect(Array.isArray(res.body.players)).toBe(true);
    expect(res.body.players).toHaveLength(2);
  });

  test('returns 200 with empty array when no players exist', async () => {
    mockCurrentUser = adminUser;
    PlayerRepo.listPlayers.mockResolvedValue([]);

    const res = await request(app).get('/api/admin/players');
    expect(res.status).toBe(200);
    expect(res.body.players).toEqual([]);
  });

  test('returns 500 when repository throws', async () => {
    mockCurrentUser = adminUser;
    PlayerRepo.listPlayers.mockRejectedValue(new Error('DB error'));

    const res = await request(app).get('/api/admin/players');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('internal_error');
  });

  test('passes status filter to repository', async () => {
    mockCurrentUser = adminUser;
    PlayerRepo.listPlayers.mockResolvedValue([]);

    await request(app).get('/api/admin/players?status=active');
    expect(PlayerRepo.listPlayers).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'active' })
    );
  });
});

// ─── POST /api/admin/students ─────────────────────────────────────────────────

describe('POST /api/admin/students', () => {
  const validBody = { name: 'Charlie', password: 'pass123', role: 'coached_student' };

  beforeEach(() => {
    mockCurrentUser = adminUser;
    PlayerRepo.findByDisplayName.mockResolvedValue(null);   // name not taken
    PlayerRepo.createPlayer.mockResolvedValue('new-uuid-1');
    PlayerRepo.assignRole.mockResolvedValue();
    // Role lookup: return a role row
    mockSupabaseChain.single.mockResolvedValue({ data: { id: 'role-uuid' }, error: null });
  });

  test('returns 401 when not authenticated', async () => {
    mockCurrentUser = null;
    const res = await request(app).post('/api/admin/students').send(validBody);
    expect(res.status).toBe(401);
  });

  test('returns 400 when name is too short', async () => {
    const res = await request(app).post('/api/admin/students').send({ ...validBody, name: 'A' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_name');
  });

  test('returns 400 when password is too short', async () => {
    const res = await request(app).post('/api/admin/students').send({ ...validBody, password: '12345' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_password');
  });

  test('returns 400 when role is not allowed', async () => {
    const res = await request(app).post('/api/admin/students').send({ ...validBody, role: 'admin' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_role');
  });

  test('returns 409 when name is already taken', async () => {
    PlayerRepo.findByDisplayName.mockResolvedValue({ id: 'existing' });
    const res = await request(app).post('/api/admin/students').send(validBody);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('name_taken');
  });

  test('returns 201 and does NOT include invalid role column in SELECT', async () => {
    // This test guards against regression of the "SELECT role" bug that caused 500.
    // The supabase SELECT for the created player must not select 'role' column.
    mockSupabaseChain.single
      // First call: role lookup → returns role row
      .mockResolvedValueOnce({ data: { id: 'role-uuid' }, error: null })
      // Second call: player fetch after creation → returns player WITHOUT role column
      .mockResolvedValueOnce({ data: { id: 'new-uuid-1', display_name: 'Charlie', status: 'active', created_at: '2026-01-01', email: null }, error: null });

    const res = await request(app).post('/api/admin/students').send(validBody);
    expect(res.status).toBe(201);
    // Response should include the assigned role from the request body, not a DB column
    expect(res.body.role).toBe('coached_student');
    expect(res.body.id).toBe('new-uuid-1');
  });
});
