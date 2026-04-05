'use strict';

/**
 * GET /api/auth/permissions — route integration tests.
 *
 * Mounts only the auth routes on a minimal Express app (no socket.io, no full
 * server bootstrap).  requireAuth and getPlayerPermissions are both mocked so
 * no real JWT validation or DB calls occur.
 *
 * Mocked modules:
 *   - ../auth/requirePermission.js  — getPlayerPermissions stubbed
 *   - ../auth/requireAuth.js         — replaced with a controllable shim
 *                                      (user injected via module-level variable)
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Control which user (if any) requireAuth sets on req.user.
// Tests set this variable before issuing a request.
// Must be prefixed with 'mock' so Jest's hoisted factory can access it.
let mockCurrentUser = null;

jest.mock('../auth/requireAuth.js', () =>
  jest.fn((req, res, next) => {
    if (!mockCurrentUser) {
      return res.status(401).json({ error: 'auth_required', message: 'Login required' });
    }
    req.user = mockCurrentUser;
    next();
  })
);

jest.mock('../auth/requirePermission.js', () => ({
  getPlayerPermissions:      jest.fn(),
  invalidatePermissionCache: jest.fn(),
  requirePermission:         jest.fn(() => (req, res, next) => next()),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

const express              = require('express');
const request              = require('supertest');
const { getPlayerPermissions } = require('../auth/requirePermission.js');

// ─── App factory ──────────────────────────────────────────────────────────────

/**
 * Build a fresh Express app with the auth routes mounted.
 * Stub dependencies that are not relevant to the permissions endpoint.
 */
function buildApp() {
  const app = express();
  app.use(express.json());

  const registerAuthRoutes = require('../routes/auth.js');
  registerAuthRoutes(app, {
    HandLogger:   {},
    PlayerRoster: {},
    JwtService:   {},
    authLimiter:  (req, res, next) => next(),
    log:          { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  });

  return app;
}

// Build once — routes are stateless, so a single instance is fine for all tests.
const app = buildApp();

// ─── Helpers ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrentUser = null;
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/auth/permissions', () => {
  test('returns 401 when no auth token is provided', async () => {
    // mockCurrentUser is null — requireAuth mock responds 401
    const res = await request(app).get('/api/auth/permissions');
    expect(res.status).toBe(401);
  });

  test('returns 401 for an invalid/expired token', async () => {
    // mockCurrentUser still null — our shim always 401s when null
    const res = await request(app)
      .get('/api/auth/permissions')
      .set('Authorization', 'Bearer bad-token');
    expect(res.status).toBe(401);
  });

  test('returns 200 with a permissions array for an authenticated user', async () => {
    mockCurrentUser = { id: 'player-uuid-001', role: 'coach' };
    getPlayerPermissions.mockResolvedValueOnce(new Set(['view_hands', 'manage_playlists']));

    const res = await request(app)
      .get('/api/auth/permissions')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('permissions');
    expect(Array.isArray(res.body.permissions)).toBe(true);
  });

  test('permissions array matches what getPlayerPermissions returns', async () => {
    mockCurrentUser = { id: 'player-uuid-002', role: 'admin' };
    const fakePerms = new Set(['view_hands', 'manage_playlists', 'admin:access']);
    getPlayerPermissions.mockResolvedValueOnce(fakePerms);

    const res = await request(app)
      .get('/api/auth/permissions')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    // Order from a Set spread may vary — sort both sides for a stable comparison
    expect(res.body.permissions.sort()).toEqual([...fakePerms].sort());
  });

  test('calls getPlayerPermissions with the authenticated req.user.id', async () => {
    const userId = 'player-uuid-xyz';
    mockCurrentUser = { id: userId, role: 'player' };
    getPlayerPermissions.mockResolvedValueOnce(new Set(['some_perm']));

    await request(app)
      .get('/api/auth/permissions')
      .set('Authorization', 'Bearer valid-token');

    expect(getPlayerPermissions).toHaveBeenCalledWith(userId, 'player');
  });

  test('returns empty permissions array when user has no permissions', async () => {
    mockCurrentUser = { id: 'player-uuid-003', role: 'player' };
    getPlayerPermissions.mockResolvedValueOnce(new Set());

    const res = await request(app)
      .get('/api/auth/permissions')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.permissions).toEqual([]);
  });

  test('returns 500 when getPlayerPermissions throws', async () => {
    mockCurrentUser = { id: 'player-uuid-004', role: 'player' };
    getPlayerPermissions.mockRejectedValueOnce(new Error('DB failure'));

    const res = await request(app)
      .get('/api/auth/permissions')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/permission/i);
  });
});
