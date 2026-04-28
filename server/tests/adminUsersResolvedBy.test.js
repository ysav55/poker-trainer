'use strict';

/**
 * Admin users route — resolved_by audit trail tests.
 *
 * Regression guard for the bug where req.user?.id was used instead of
 * req.user?.stableId, causing resolved_by to always be stored as null.
 *
 * Mocked modules:
 *   - ../../auth/requirePermission.js          — requirePermission passes through; others stubbed
 *   - ../../db/supabase.js                      — Supabase client stubbed
 *   - ../../db/repositories/PlayerRepository.js — setPassword / assignRole / etc. stubbed
 *   - bcrypt                                    — hash stubbed
 */

// ─── Mocks ─────────────────────────────────────────────────────────────────────

let mockCurrentUser = null;

// requirePermission middleware — inject req.user and pass through
jest.mock('../auth/requirePermission.js', () => ({
  requirePermission:         jest.fn(() => (req, res, next) => {
    if (!mockCurrentUser) return res.status(401).json({ error: 'auth_required' });
    req.user = mockCurrentUser;
    next();
  }),
  invalidatePermissionCache: jest.fn(),
  getPlayerPermissions:      jest.fn(),
}));

// Supabase mock — factory returns a static stub; tests call mockSupabaseFrom.mockReturnValue()
// to swap in a fresh chain before each test.
const mockSupabaseFrom = jest.fn();
jest.mock('../db/supabase.js', () => ({
  from: (...args) => mockSupabaseFrom(...args),
}));

jest.mock('../db/repositories/PlayerRepository.js', () => ({
  listPlayers:    jest.fn().mockResolvedValue([]),
  createPlayer:   jest.fn().mockResolvedValue('new-player-id'),
  updatePlayer:   jest.fn().mockResolvedValue(undefined),
  archivePlayer:  jest.fn().mockResolvedValue(undefined),
  setPassword:    jest.fn().mockResolvedValue(undefined),
  assignRole:     jest.fn().mockResolvedValue(undefined),
  removeRole:     jest.fn().mockResolvedValue(undefined),
  getPrimaryRole: jest.fn().mockResolvedValue('coach'),
}));

jest.mock('bcrypt', () => ({
  hash:    jest.fn().mockResolvedValue('hashed-password'),
  compare: jest.fn().mockResolvedValue(true),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Creates a fresh chainable Supabase mock where every method returns `this`,
 * except terminal methods (single, maybeSingle) which resolve with no error.
 * The `update` method records its argument so tests can inspect it.
 */
function makeChain() {
  const chain = {};
  chain.select      = jest.fn().mockReturnValue(chain);
  chain.update      = jest.fn().mockReturnValue(chain);
  chain.delete      = jest.fn().mockReturnValue(chain);
  chain.upsert      = jest.fn().mockReturnValue(chain);
  chain.eq          = jest.fn().mockReturnValue(chain);
  chain.order       = jest.fn().mockReturnValue(chain);
  chain.single      = jest.fn().mockResolvedValue({ data: null, error: null });
  chain.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
  // Make the chain itself thenable so await supabase.from(...).update(...).eq(...).eq(...)
  // resolves rather than hanging.
  chain.then        = jest.fn((resolve) => resolve({ data: null, error: null }));
  return chain;
}

// ─── Imports (after mocks) ────────────────────────────────────────────────────

const express = require('express');
const request = require('supertest');

// ─── App factory ─────────────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());
  const usersRouter = require('../routes/admin/users.js');   // server/routes/admin/users.js
  app.use('/api/admin', usersRouter);
  return app;
}

const app = buildApp();

// ─── Lifecycle ───────────────────────────────────────────────────────────────

let chain;

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrentUser = null;
  // Fresh chain per test
  chain = makeChain();
  mockSupabaseFrom.mockReturnValue(chain);
});

// ─── Tests: resolved_by audit trail ──────────────────────────────────────────

describe('POST /api/admin/users/:id/reset-password — resolved_by audit trail', () => {
  const TARGET_PLAYER_ID = 'target-player-uuid';

  test('stores resolved_by from req.user.stableId (real JWT field)', async () => {
    const adminStableId = 'admin-stable-uuid-001';
    mockCurrentUser = { stableId: adminStableId, role: 'admin' };

    const res = await request(app)
      .post(`/api/admin/users/${TARGET_PLAYER_ID}/reset-password`)
      .send({ password: 'newSecure123' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify the update call on password_reset_requests carries resolved_by = adminStableId
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ resolved_by: adminStableId })
    );
  });

  test('resolved_by is NOT null when stableId is present (regression: req.user.id was undefined)', async () => {
    // Before the fix, req.user?.id was undefined → resolved_by would be null/undefined.
    const adminStableId = 'admin-stable-uuid-002';
    // id is intentionally absent — mirrors real JWT payload
    mockCurrentUser = { stableId: adminStableId, role: 'admin' };

    await request(app)
      .post(`/api/admin/users/${TARGET_PLAYER_ID}/reset-password`)
      .send({ password: 'anotherPass99' });

    // Find the update call that includes resolved_by
    const updateCalls = chain.update.mock.calls;
    const resetUpdateCall = updateCalls.find(([args]) => 'resolved_by' in args);
    expect(resetUpdateCall).toBeDefined();
    expect(resetUpdateCall[0].resolved_by).toBe(adminStableId);
    expect(resetUpdateCall[0].resolved_by).not.toBeNull();
    expect(resetUpdateCall[0].resolved_by).not.toBeUndefined();
  });

  test('returns 400 when password is missing', async () => {
    mockCurrentUser = { stableId: 'admin-uuid', role: 'admin' };

    const res = await request(app)
      .post(`/api/admin/users/${TARGET_PLAYER_ID}/reset-password`)
      .send({});

    expect(res.status).toBe(400);
  });

  test('returns 401 when not authenticated', async () => {
    // mockCurrentUser remains null — requirePermission mock returns 401
    const res = await request(app)
      .post(`/api/admin/users/${TARGET_PLAYER_ID}/reset-password`)
      .send({ password: 'somepass' });

    expect(res.status).toBe(401);
  });
});

// ─── Tests: assignedBy in role mutations ─────────────────────────────────────

describe('PATCH /api/admin/users/:id/role — assignedBy audit trail', () => {
  const TARGET_PLAYER_ID = 'target-player-uuid';

  test('passes stableId as assignedBy when changing role', async () => {
    const adminStableId = 'admin-stable-uuid-003';
    mockCurrentUser = { stableId: adminStableId, role: 'admin' };

    const { assignRole } = require('../db/repositories/PlayerRepository.js');

    // resolveRoleId calls supabase.from('roles').select('id').eq('name', ...).maybeSingle()
    chain.maybeSingle.mockResolvedValueOnce({ data: { id: 'role-uuid-coach' }, error: null });

    const res = await request(app)
      .patch(`/api/admin/users/${TARGET_PLAYER_ID}/role`)
      .send({ role: 'coach' });

    expect(res.status).toBe(200);
    expect(assignRole).toHaveBeenCalledWith(
      TARGET_PLAYER_ID,
      'role-uuid-coach',
      adminStableId  // must not be null/undefined
    );
  });

  test('assignedBy is not null/undefined when id absent from JWT', async () => {
    const adminStableId = 'admin-stable-uuid-004';
    // No `id` field — simulates a real JWT where only stableId is set
    mockCurrentUser = { stableId: adminStableId, role: 'admin' };

    const { assignRole } = require('../db/repositories/PlayerRepository.js');
    chain.maybeSingle.mockResolvedValueOnce({ data: { id: 'role-uuid-solo' }, error: null });

    await request(app)
      .patch(`/api/admin/users/${TARGET_PLAYER_ID}/role`)
      .send({ role: 'solo_student' });

    const lastCall = assignRole.mock.calls[assignRole.mock.calls.length - 1];
    expect(lastCall[2]).toBe(adminStableId);
    expect(lastCall[2]).not.toBeNull();
    expect(lastCall[2]).not.toBeUndefined();
  });
});
