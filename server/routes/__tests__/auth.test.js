'use strict';

/**
 * Auth routes — integration-style tests for the new self-registration
 * and password-reset endpoints.
 *
 * Covered:
 *   POST /api/auth/register        — student self-registration + trial setup
 *   POST /api/auth/reset-password  — authenticated own-password reset
 *   POST /api/auth/register-coach  — coach application (admin-approved flow)
 *
 * All DB / external calls are mocked. No real Supabase connection needed.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('bcrypt', () => ({
  hash:    jest.fn(async (plain) => `hashed:${plain}`),
  compare: jest.fn(async (plain, hash) => hash === `hashed:${plain}`),
}));

jest.mock('../../db/repositories/PlayerRepository', () => ({
  findByDisplayName: jest.fn(),
  findById:          jest.fn(),
  createPlayer:      jest.fn(),
  getPrimaryRole:    jest.fn(),
  assignRole:        jest.fn(),
  setPassword:       jest.fn(),
}));

// Minimal chainable supabase mock.
// The real client is used as supabase.from('table').select()....
// We expose a single chain object where every method returns itself.
const mockSupabase = {
  from:   jest.fn(),
  select: jest.fn(),
  update: jest.fn(),
  eq:     jest.fn(),
  single: jest.fn().mockResolvedValue({ data: null, error: null }),
  insert: jest.fn().mockResolvedValue({ data: null, error: null }),
};
mockSupabase.from.mockReturnValue(mockSupabase);
mockSupabase.select.mockReturnValue(mockSupabase);
mockSupabase.update.mockReturnValue(mockSupabase);
mockSupabase.eq.mockReturnValue(mockSupabase);
mockSupabase.insert.mockReturnValue(mockSupabase);

jest.mock('../../db/supabase.js', () => mockSupabase);

// requireAuth shim — tests control req.user via mockCurrentUser
let mockCurrentUser = null;
jest.mock('../../auth/requireAuth.js', () =>
  jest.fn((req, res, next) => {
    if (!mockCurrentUser) return res.status(401).json({ error: 'auth_required', message: 'Login required' });
    req.user = mockCurrentUser;
    next();
  })
);

jest.mock('../../auth/requirePermission.js', () => ({
  getPlayerPermissions:      jest.fn().mockResolvedValue(new Set()),
  invalidatePermissionCache: jest.fn(),
  requirePermission:         jest.fn(() => (req, res, next) => next()),
}));

jest.mock('../../db/repositories/SchoolRepository', () => ({
  findById:       jest.fn(),
  canAddStudent:  jest.fn(),
  searchByName:   jest.fn(),
}));

jest.mock('../../services/SchoolPasswordService', () => ({
  validatePassword: jest.fn(),
  recordUsage:      jest.fn(),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

const express  = require('express');
const request  = require('supertest');
const bcrypt   = require('bcrypt');
const {
  findByDisplayName,
  findById,
  createPlayer,
  getPrimaryRole,
  assignRole,
  setPassword,
} = require('../../db/repositories/PlayerRepository');

// ─── App factory ──────────────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());

  const registerAuthRoutes = require('../../routes/auth.js');
  registerAuthRoutes(app, {
    HandLogger:   { loginRosterPlayer: jest.fn() },
    PlayerRoster: { authenticate: jest.fn() },
    JwtService:   { sign: jest.fn(() => 'signed-jwt-token') },
    authLimiter:  (req, res, next) => next(),
    log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  });

  return app;
}

// Build once; reset mock state in beforeEach instead of rebuilding the app.
const app = buildApp();

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrentUser = null;

  // Re-wire the supabase chain after clearAllMocks() stripped implementations.
  mockSupabase.from.mockReturnValue(mockSupabase);
  mockSupabase.select.mockReturnValue(mockSupabase);
  mockSupabase.update.mockReturnValue(mockSupabase);
  mockSupabase.eq.mockReturnValue(mockSupabase);
  mockSupabase.insert.mockReturnValue(mockSupabase);
  mockSupabase.single.mockResolvedValue({ data: null, error: null });
  mockSupabase.insert.mockResolvedValue({ data: null, error: null });

  // Set safe default return values for all repository mocks.
  findByDisplayName.mockResolvedValue(null);
  findById.mockResolvedValue(null);
  createPlayer.mockResolvedValue('default-uuid');
  getPrimaryRole.mockResolvedValue('solo_student');
  assignRole.mockResolvedValue(undefined);
  setPassword.mockResolvedValue(undefined);

  // SchoolRepository defaults (safe — no school involvement)
  const SchoolRepo = require('../../db/repositories/SchoolRepository');
  SchoolRepo.findById.mockResolvedValue(null);
  SchoolRepo.canAddStudent.mockResolvedValue(true);
});

// ─── POST /api/auth/register ──────────────────────────────────────────────────

describe('POST /api/auth/register', () => {
  test('returns 400 when name is missing', async () => {
    const res = await request(app).post('/api/auth/register').send({ password: 'password123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_name');
  });

  test('returns 400 when name is too short (< 2 chars)', async () => {
    const res = await request(app).post('/api/auth/register').send({ name: 'A', password: 'password123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_name');
  });

  test('returns 400 when password is missing', async () => {
    const res = await request(app).post('/api/auth/register').send({ name: 'Alice' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_password');
  });

  test('returns 400 when password is shorter than 8 characters', async () => {
    const res = await request(app).post('/api/auth/register').send({ name: 'Alice', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_password');
  });

  test('returns 400 when email is present but invalid', async () => {
    const res = await request(app).post('/api/auth/register').send({ name: 'Alice', password: 'password123', email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_email');
  });

  test('returns 409 when display name is already taken', async () => {
    findByDisplayName.mockResolvedValue({ id: 'existing-uuid', display_name: 'Alice' });
    const res = await request(app).post('/api/auth/register').send({ name: 'Alice', password: 'password123' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('name_taken');
  });

  test('returns 201 with token on successful registration', async () => {
    createPlayer.mockResolvedValue('new-player-uuid');
    getPrimaryRole.mockResolvedValue('solo_student');

    const res = await request(app).post('/api/auth/register').send({ name: 'NewPlayer', password: 'strongpass1' });

    expect(res.status).toBe(201);
    expect(res.body.stableId).toBe('new-player-uuid');
    expect(res.body.token).toBe('signed-jwt-token');
  });

  test('hashes password — never stores plaintext', async () => {
    createPlayer.mockResolvedValue('uuid-hash-test');

    await request(app).post('/api/auth/register').send({ name: 'HashCheck', password: 'plaintext99' });

    expect(bcrypt.hash).toHaveBeenCalledWith('plaintext99', 12);
    const createArg = createPlayer.mock.calls[0][0];
    expect(createArg.passwordHash).toBe('hashed:plaintext99');
    expect(createArg.passwordHash).not.toBe('plaintext99');
  });

  test('assigns solo_student role when no coachId supplied', async () => {
    createPlayer.mockResolvedValue('uuid-solo');
    mockSupabase.single.mockResolvedValue({ data: { id: 'role-solo-uuid' }, error: null });

    await request(app).post('/api/auth/register').send({ name: 'SoloPlayer', password: 'strongpass1' });

    expect(assignRole).toHaveBeenCalledWith('uuid-solo', 'role-solo-uuid', null);
  });

  test('assigns coached_student role when coachId is provided', async () => {
    createPlayer.mockResolvedValue('uuid-coached');
    mockSupabase.single.mockResolvedValue({ data: { id: 'role-coached-uuid' }, error: null });

    await request(app).post('/api/auth/register').send({ name: 'CoachStudent', password: 'strongpass1', coachId: 'some-coach-id' });

    expect(assignRole).toHaveBeenCalledWith('uuid-coached', 'role-coached-uuid', null);
  });

  test('response never contains password or hash', async () => {
    createPlayer.mockResolvedValue('uuid-nosecret');

    const res = await request(app).post('/api/auth/register').send({ name: 'NoSecret', password: 'mysecret99' });

    expect(JSON.stringify(res.body)).not.toContain('mysecret99');
    expect(JSON.stringify(res.body)).not.toContain('hashed:');
  });

  test('returns 500 when createPlayer throws', async () => {
    createPlayer.mockRejectedValue(new Error('DB insert failed'));

    const res = await request(app).post('/api/auth/register').send({ name: 'FailUser', password: 'strongpass1' });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('internal_error');
  });
});

// ─── POST /api/auth/reset-password ───────────────────────────────────────────

describe('POST /api/auth/reset-password', () => {
  test('returns 401 when not authenticated', async () => {
    mockCurrentUser = null;
    const res = await request(app).post('/api/auth/reset-password').send({ currentPassword: 'old', newPassword: 'newpassword1' });
    expect(res.status).toBe(401);
  });

  test('returns 400 when currentPassword is missing', async () => {
    mockCurrentUser = { stableId: 'uuid-me', name: 'Alice' };
    const res = await request(app).post('/api/auth/reset-password').send({ newPassword: 'newpassword1' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_password');
  });

  test('returns 400 when newPassword is too short', async () => {
    mockCurrentUser = { stableId: 'uuid-me', name: 'Alice' };
    const res = await request(app).post('/api/auth/reset-password').send({ currentPassword: 'oldpass123', newPassword: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_password');
  });

  test('returns 400 when newPassword equals currentPassword', async () => {
    mockCurrentUser = { stableId: 'uuid-me', name: 'Alice' };
    const res = await request(app).post('/api/auth/reset-password').send({ currentPassword: 'samepass1', newPassword: 'samepass1' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_password');
  });

  test('returns 404 when player profile not found', async () => {
    mockCurrentUser = { stableId: 'uuid-missing', name: 'Ghost' };
    findById.mockResolvedValue(null);

    const res = await request(app).post('/api/auth/reset-password').send({ currentPassword: 'oldpass123', newPassword: 'newpass456' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not_found');
  });

  test('returns 401 when current password is wrong', async () => {
    mockCurrentUser = { stableId: 'uuid-bad-pw', name: 'WrongPass' };
    findById.mockResolvedValue({ id: 'uuid-bad-pw', password_hash: 'hashed:correctpass' });
    bcrypt.compare.mockResolvedValue(false);

    const res = await request(app).post('/api/auth/reset-password').send({ currentPassword: 'wrongpass', newPassword: 'newpassword1' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('invalid_credentials');
  });

  test('returns 200 with success=true on valid reset', async () => {
    mockCurrentUser = { stableId: 'uuid-reset', name: 'ResetUser' };
    findById.mockResolvedValue({ id: 'uuid-reset', password_hash: 'hashed:oldpass123' });
    bcrypt.compare.mockResolvedValue(true);

    const res = await request(app).post('/api/auth/reset-password').send({ currentPassword: 'oldpass123', newPassword: 'newpassword99' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('calls setPassword with hashed new password, never plaintext', async () => {
    mockCurrentUser = { stableId: 'uuid-hash-check', name: 'HashCheck' };
    findById.mockResolvedValue({ id: 'uuid-hash-check', password_hash: 'hashed:currentpass1' });
    bcrypt.compare.mockResolvedValue(true);

    await request(app).post('/api/auth/reset-password').send({ currentPassword: 'currentpass1', newPassword: 'newpassword99' });

    expect(bcrypt.hash).toHaveBeenCalledWith('newpassword99', 12);
    expect(setPassword).toHaveBeenCalledWith('uuid-hash-check', 'hashed:newpassword99');
  });

  test('response body does not contain password or hash', async () => {
    mockCurrentUser = { stableId: 'uuid-nosecret2', name: 'Safe' };
    findById.mockResolvedValue({ id: 'uuid-nosecret2', password_hash: 'hashed:oldpass123' });
    bcrypt.compare.mockResolvedValue(true);

    const res = await request(app).post('/api/auth/reset-password').send({ currentPassword: 'oldpass123', newPassword: 'newpassword99' });

    expect(JSON.stringify(res.body)).not.toContain('oldpass123');
    expect(JSON.stringify(res.body)).not.toContain('newpassword99');
    expect(JSON.stringify(res.body)).not.toContain('hashed:');
  });

  test('returns 500 when setPassword throws', async () => {
    mockCurrentUser = { stableId: 'uuid-err', name: 'ErrUser' };
    findById.mockResolvedValue({ id: 'uuid-err', password_hash: 'hashed:oldpass123' });
    bcrypt.compare.mockResolvedValue(true);
    setPassword.mockRejectedValue(new Error('DB write failed'));

    const res = await request(app).post('/api/auth/reset-password').send({ currentPassword: 'oldpass123', newPassword: 'newpassword99' });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('internal_error');
  });
});

// ─── POST /api/auth/register-coach ───────────────────────────────────────────

describe('POST /api/auth/register-coach', () => {
  test('returns 400 when name is missing', async () => {
    const res = await request(app).post('/api/auth/register-coach').send({ password: 'password123', email: 'coach@example.com' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_name');
  });

  test('returns 400 when password is missing or too short', async () => {
    const res = await request(app).post('/api/auth/register-coach').send({ name: 'NewCoach', password: 'short', email: 'coach@example.com' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_password');
  });

  test('returns 400 when email is missing', async () => {
    const res = await request(app).post('/api/auth/register-coach').send({ name: 'NewCoach', password: 'password123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_email');
  });

  test('returns 400 when email is invalid', async () => {
    const res = await request(app).post('/api/auth/register-coach').send({ name: 'NewCoach', password: 'password123', email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_email');
  });

  test('returns 409 when display name is already taken', async () => {
    findByDisplayName.mockResolvedValue({ id: 'existing-uuid' });
    const res = await request(app).post('/api/auth/register-coach').send({ name: 'ExistingCoach', password: 'password123', email: 'new@example.com' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('name_taken');
  });

  test('returns 202 with pending status on successful application', async () => {
    createPlayer.mockResolvedValue('pending-coach-uuid');

    const res = await request(app).post('/api/auth/register-coach').send({
      name: 'CoachApplicant', password: 'password123', email: 'coach@example.com',
    });

    expect(res.status).toBe(202);
    expect(res.body.status).toBe('pending');
    expect(res.body.message).toMatch(/pending|approval/i);
  });

  test('does NOT return a JWT token (approval required before login)', async () => {
    createPlayer.mockResolvedValue('pending-coach-uuid-2');

    const res = await request(app).post('/api/auth/register-coach').send({
      name: 'CoachApplicant2', password: 'password123', email: 'coach2@example.com',
    });

    expect(res.body.token).toBeUndefined();
  });

  test('response never contains password or hash', async () => {
    createPlayer.mockResolvedValue('pending-secure-uuid');

    const res = await request(app).post('/api/auth/register-coach').send({
      name: 'SecureCoach', password: 'mysecretcoach', email: 'secure@example.com',
    });

    expect(JSON.stringify(res.body)).not.toContain('mysecretcoach');
    expect(JSON.stringify(res.body)).not.toContain('hashed:');
  });

  test('hashes password before storing', async () => {
    createPlayer.mockResolvedValue('uuid-hash-coach');

    await request(app).post('/api/auth/register-coach').send({
      name: 'HashCoach', password: 'plaincoach1', email: 'hash@example.com',
    });

    expect(bcrypt.hash).toHaveBeenCalledWith('plaincoach1', 12);
    const createArg = createPlayer.mock.calls[0][0];
    expect(createArg.passwordHash).toBe('hashed:plaincoach1');
    expect(createArg.passwordHash).not.toBe('plaincoach1');
  });

  test('returns 500 when createPlayer throws', async () => {
    createPlayer.mockRejectedValue(new Error('DB failure'));

    const res = await request(app).post('/api/auth/register-coach').send({
      name: 'FailCoach', password: 'password123', email: 'fail@example.com',
    });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('internal_error');
  });
});

// ─── POST /api/auth/register — school capacity enforcement ───────────────────

describe('POST /api/auth/register — school capacity', () => {
  const SchoolRepo = require('../../db/repositories/SchoolRepository');

  test('returns 404 when schoolId provided but school does not exist', async () => {
    SchoolRepo.findById.mockResolvedValue(null);

    const res = await request(app).post('/api/auth/register').send({
      name: 'SchoolStudent', password: 'password123', schoolId: 'nonexistent-school',
    });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('school_not_found');
  });

  test('returns 409 when school is not active', async () => {
    SchoolRepo.findById.mockResolvedValue({ id: 'school-archived', status: 'archived', max_students: null, students: 0 });

    const res = await request(app).post('/api/auth/register').send({
      name: 'SchoolStudent', password: 'password123', schoolId: 'school-archived',
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('school_inactive');
  });

  test('returns 409 when school is at student capacity', async () => {
    SchoolRepo.findById.mockResolvedValue({ id: 'school-full', status: 'active', max_students: 10, students: 10 });
    SchoolRepo.canAddStudent.mockResolvedValue(false);

    const res = await request(app).post('/api/auth/register').send({
      name: 'FifthStudent', password: 'password123', schoolId: 'school-full',
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('school_at_capacity');
  });

  test('registers successfully when school has capacity', async () => {
    SchoolRepo.findById.mockResolvedValue({ id: 'school-ok', status: 'active', max_students: 100, students: 5 });
    SchoolRepo.canAddStudent.mockResolvedValue(true);
    createPlayer.mockResolvedValue('new-school-player-uuid');
    getPrimaryRole.mockResolvedValue('solo_student');

    const res = await request(app).post('/api/auth/register').send({
      name: 'SchoolOkStudent', password: 'password123', schoolId: 'school-ok',
    });

    expect(res.status).toBe(201);
    expect(res.body.stableId).toBe('new-school-player-uuid');
  });

  test('proceeds normally when no schoolId provided', async () => {
    createPlayer.mockResolvedValue('solo-uuid');
    getPrimaryRole.mockResolvedValue('solo_student');

    const res = await request(app).post('/api/auth/register').send({
      name: 'SoloNoSchool', password: 'password123',
    });

    expect(res.status).toBe(201);
    expect(SchoolRepo.findById).not.toHaveBeenCalled();
    expect(SchoolRepo.canAddStudent).not.toHaveBeenCalled();
  });
});

// ─── POST /api/auth/register with school password ───────────────────────────────

describe('POST /api/auth/register with school password', () => {
  beforeEach(() => {
    // Reset additional mocks for school password tests
    const SchoolRepo = require('../../db/repositories/SchoolRepository');
    const SchoolPasswordService = require('../../services/SchoolPasswordService');

    SchoolRepo.searchByName.mockResolvedValue([]);
    SchoolRepo.findById.mockResolvedValue(null);
    SchoolRepo.canAddStudent.mockResolvedValue(true);
    SchoolPasswordService.validatePassword.mockResolvedValue({ valid: false });
    SchoolPasswordService.recordUsage.mockResolvedValue(undefined);
  });

  test('register without school becomes solo_student', async () => {
    createPlayer.mockResolvedValue('alice-solo-uuid');
    getPrimaryRole.mockResolvedValue('solo_student');
    mockSupabase.single.mockResolvedValue({ data: { id: 'role-solo-uuid' }, error: null });

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'alice_solo',
        password: 'secure123',
        email: 'alice@example.com'
      });

    expect(res.status).toBe(201);
    expect(res.body.role).toBe('solo_student');
    expect(res.body.token).toBeDefined();
    expect(res.body.stableId).toBe('alice-solo-uuid');
  });

  test('register with valid school password becomes coached_student', async () => {
    const SchoolRepo = require('../../db/repositories/SchoolRepository');
    const SchoolPasswordService = require('../../services/SchoolPasswordService');

    SchoolRepo.searchByName.mockResolvedValue([
      {
        id: 'test-school-id',
        name: 'Test School',
        status: 'active',
        max_students: 100,
        students: 5
      }
    ]);

    SchoolRepo.canAddStudent.mockResolvedValue(true);
    SchoolPasswordService.validatePassword.mockResolvedValue({
      valid: true,
      passwordId: 'password-123',
      groupId: null
    });
    SchoolPasswordService.recordUsage.mockResolvedValue(true);

    createPlayer.mockResolvedValue('bob-coached-uuid');
    getPrimaryRole.mockResolvedValue('coached_student');
    mockSupabase.single.mockResolvedValue({ data: { id: 'role-coached-uuid' }, error: null });

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'bob_coached',
        password: 'secure123',
        email: 'bob@example.com',
        schoolName: 'Test School',
        schoolPassword: 'valid_password'
      });

    expect(res.status).toBe(201);
    expect(res.body.role).toBe('coached_student');
    expect(res.body.stableId).toBe('bob-coached-uuid');
    expect(res.body.token).toBeDefined();
  });

  test('require school password when school name provided', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'carol',
        password: 'secure123',
        email: 'carol@example.com',
        schoolName: 'Some School'
        // Missing schoolPassword
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('school_params_mismatch');
  });

  test('reject invalid school name', async () => {
    const SchoolRepo = require('../../db/repositories/SchoolRepository');
    SchoolRepo.searchByName.mockResolvedValue([]);

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'dave',
        password: 'secure123',
        email: 'dave@example.com',
        schoolName: 'Nonexistent School',
        schoolPassword: 'anything'
      });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('school_not_found');
  });

  test('reject expired school password', async () => {
    const SchoolRepo = require('../../db/repositories/SchoolRepository');
    const SchoolPasswordService = require('../../services/SchoolPasswordService');

    SchoolRepo.searchByName.mockResolvedValue([
      {
        id: 'test-school-id',
        name: 'Test School',
        status: 'active'
      }
    ]);

    SchoolPasswordService.validatePassword.mockResolvedValue({
      valid: false,
      error: 'password_expired'
    });

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'eve_expired',
        password: 'secure123',
        email: 'eve@example.com',
        schoolName: 'Test School',
        schoolPassword: 'expired_password'
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('school_password_expired');
  });

  test('reject maxed-out school password', async () => {
    const SchoolRepo = require('../../db/repositories/SchoolRepository');
    const SchoolPasswordService = require('../../services/SchoolPasswordService');

    SchoolRepo.searchByName.mockResolvedValue([
      {
        id: 'test-school-id',
        name: 'Test School',
        status: 'active'
      }
    ]);

    SchoolPasswordService.validatePassword.mockResolvedValue({
      valid: false,
      error: 'password_maxed'
    });

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'frank_maxed',
        password: 'secure123',
        email: 'frank@example.com',
        schoolName: 'Test School',
        schoolPassword: 'maxed_password'
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('school_password_maxed');
  });

  test('reject school password without school name', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'grace',
        password: 'secure123',
        email: 'grace@example.com',
        schoolPassword: 'some_password'
        // Missing schoolName
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('school_params_mismatch');
  });

  test('auto-adds student to group if password specifies groupId', async () => {
    const SchoolRepo = require('../../db/repositories/SchoolRepository');
    const SchoolPasswordService = require('../../services/SchoolPasswordService');

    SchoolRepo.searchByName.mockResolvedValue([
      {
        id: 'test-school-id',
        name: 'Test School',
        status: 'active'
      }
    ]);

    SchoolRepo.canAddStudent.mockResolvedValue(true);
    SchoolPasswordService.validatePassword.mockResolvedValue({
      valid: true,
      passwordId: 'password-123',
      groupId: 'group-abc'
    });
    SchoolPasswordService.recordUsage.mockResolvedValue(true);

    createPlayer.mockResolvedValue('henry-group-uuid');
    getPrimaryRole.mockResolvedValue('coached_student');
    mockSupabase.single.mockResolvedValue({ data: { id: 'role-coached-uuid' }, error: null });

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'henry_group',
        password: 'secure123',
        email: 'henry@example.com',
        schoolName: 'Test School',
        schoolPassword: 'group_password'
      });

    expect(res.status).toBe(201);
    // Verify group insertion was called
    expect(mockSupabase.from).toHaveBeenCalledWith('player_groups');
  });

  test('records password usage in school_password_uses', async () => {
    const SchoolRepo = require('../../db/repositories/SchoolRepository');
    const SchoolPasswordService = require('../../services/SchoolPasswordService');

    SchoolRepo.searchByName.mockResolvedValue([
      {
        id: 'test-school-id',
        name: 'Test School',
        status: 'active'
      }
    ]);

    SchoolRepo.canAddStudent.mockResolvedValue(true);
    SchoolPasswordService.validatePassword.mockResolvedValue({
      valid: true,
      passwordId: 'password-456',
      groupId: null
    });
    SchoolPasswordService.recordUsage.mockResolvedValue(true);

    createPlayer.mockResolvedValue('iris-usage-uuid');
    getPrimaryRole.mockResolvedValue('coached_student');
    mockSupabase.single.mockResolvedValue({ data: { id: 'role-coached-uuid' }, error: null });

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'iris_usage',
        password: 'secure123',
        email: 'iris@example.com',
        schoolName: 'Test School',
        schoolPassword: 'tracked_password'
      });

    expect(res.status).toBe(201);
    expect(SchoolPasswordService.recordUsage).toHaveBeenCalledWith('password-456', 'iris-usage-uuid');
  });

  test('assigns school_id to player profile after registration via password', async () => {
    const SchoolRepo = require('../../db/repositories/SchoolRepository');
    const SchoolPasswordService = require('../../services/SchoolPasswordService');

    SchoolRepo.searchByName.mockResolvedValue([
      {
        id: 'test-school-id-assign',
        name: 'Test School',
        status: 'active'
      }
    ]);

    SchoolRepo.canAddStudent.mockResolvedValue(true);
    SchoolPasswordService.validatePassword.mockResolvedValue({
      valid: true,
      passwordId: 'password-789',
      groupId: null
    });
    SchoolPasswordService.recordUsage.mockResolvedValue(true);

    createPlayer.mockResolvedValue('jack-school-uuid');
    getPrimaryRole.mockResolvedValue('coached_student');
    mockSupabase.single.mockResolvedValue({ data: { id: 'role-coached-uuid' }, error: null });

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'jack_school',
        password: 'secure123',
        email: 'jack@example.com',
        schoolName: 'Test School',
        schoolPassword: 'assigned_password'
      });

    expect(res.status).toBe(201);
    // Verify school_id was updated in player_profiles
    expect(mockSupabase.from).toHaveBeenCalledWith('player_profiles');
  });

  test('rejects inactive school during password enrollment', async () => {
    const SchoolRepo = require('../../db/repositories/SchoolRepository');
    SchoolRepo.searchByName.mockResolvedValue([
      {
        id: 'inactive-school-id',
        name: 'Inactive School',
        status: 'archived'
      }
    ]);

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'kim_inactive',
        password: 'secure123',
        email: 'kim@example.com',
        schoolName: 'Inactive School',
        schoolPassword: 'any_password'
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('school_inactive');
  });

  test('rejects registration when school is at capacity during password enrollment', async () => {
    const SchoolRepo = require('../../db/repositories/SchoolRepository');
    const SchoolPasswordService = require('../../services/SchoolPasswordService');

    SchoolRepo.searchByName.mockResolvedValue([
      {
        id: 'full-school-id',
        name: 'Full School',
        status: 'active',
        max_students: 10,
        students: 10
      }
    ]);

    SchoolPasswordService.validatePassword.mockResolvedValue({
      valid: true,
      passwordId: 'password-full',
      groupId: null
    });

    SchoolRepo.canAddStudent.mockResolvedValue(false);

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'leo_full',
        password: 'secure123',
        email: 'leo@example.com',
        schoolName: 'Full School',
        schoolPassword: 'valid_password'
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('school_at_capacity');
  });

  test('hashes password and never stores plaintext in school password flow', async () => {
    const SchoolRepo = require('../../db/repositories/SchoolRepository');
    const SchoolPasswordService = require('../../services/SchoolPasswordService');

    SchoolRepo.searchByName.mockResolvedValue([
      {
        id: 'test-school-id',
        name: 'Test School',
        status: 'active'
      }
    ]);

    SchoolRepo.canAddStudent.mockResolvedValue(true);
    SchoolPasswordService.validatePassword.mockResolvedValue({
      valid: true,
      passwordId: 'password-hash-test',
      groupId: null
    });
    SchoolPasswordService.recordUsage.mockResolvedValue(true);

    createPlayer.mockResolvedValue('macy-hash-uuid');
    getPrimaryRole.mockResolvedValue('coached_student');
    mockSupabase.single.mockResolvedValue({ data: { id: 'role-coached-uuid' }, error: null });

    await request(app)
      .post('/api/auth/register')
      .send({
        name: 'macy_hash',
        password: 'plaintext_password',
        email: 'macy@example.com',
        schoolName: 'Test School',
        schoolPassword: 'school_password'
      });

    expect(bcrypt.hash).toHaveBeenCalledWith('plaintext_password', 12);
    const createArg = createPlayer.mock.calls[0][0];
    expect(createArg.passwordHash).toBe('hashed:plaintext_password');
    expect(createArg.passwordHash).not.toBe('plaintext_password');
  });

  test('response does not contain password or hash in school password flow', async () => {
    const SchoolRepo = require('../../db/repositories/SchoolRepository');
    const SchoolPasswordService = require('../../services/SchoolPasswordService');

    SchoolRepo.searchByName.mockResolvedValue([
      {
        id: 'test-school-id',
        name: 'Test School',
        status: 'active'
      }
    ]);

    SchoolRepo.canAddStudent.mockResolvedValue(true);
    SchoolPasswordService.validatePassword.mockResolvedValue({
      valid: true,
      passwordId: 'password-nosecret',
      groupId: null
    });
    SchoolPasswordService.recordUsage.mockResolvedValue(true);

    createPlayer.mockResolvedValue('nancy-nosecret-uuid');
    getPrimaryRole.mockResolvedValue('coached_student');
    mockSupabase.single.mockResolvedValue({ data: { id: 'role-coached-uuid' }, error: null });

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'nancy_nosecret',
        password: 'mysecret_password',
        email: 'nancy@example.com',
        schoolName: 'Test School',
        schoolPassword: 'school_secret'
      });

    expect(JSON.stringify(res.body)).not.toContain('mysecret_password');
    expect(JSON.stringify(res.body)).not.toContain('school_secret');
    expect(JSON.stringify(res.body)).not.toContain('hashed:');
  });

  test('sets trialStatus to active for new school-enrolled students', async () => {
    const SchoolRepo = require('../../db/repositories/SchoolRepository');
    const SchoolPasswordService = require('../../services/SchoolPasswordService');

    SchoolRepo.searchByName.mockResolvedValue([
      {
        id: 'test-school-id',
        name: 'Test School',
        status: 'active'
      }
    ]);

    SchoolRepo.canAddStudent.mockResolvedValue(true);
    SchoolPasswordService.validatePassword.mockResolvedValue({
      valid: true,
      passwordId: 'password-trial',
      groupId: null
    });
    SchoolPasswordService.recordUsage.mockResolvedValue(true);

    createPlayer.mockResolvedValue('oscar-trial-uuid');
    getPrimaryRole.mockResolvedValue('coached_student');
    mockSupabase.single.mockResolvedValue({ data: { id: 'role-coached-uuid' }, error: null });

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'oscar_trial',
        password: 'secure123',
        email: 'oscar@example.com',
        schoolName: 'Test School',
        schoolPassword: 'valid_password'
      });

    expect(res.status).toBe(201);
    expect(res.body.trialStatus).toBe('active');
  });

  test('handles internal error from school password validation gracefully', async () => {
    const SchoolRepo = require('../../db/repositories/SchoolRepository');
    const SchoolPasswordService = require('../../services/SchoolPasswordService');

    SchoolRepo.searchByName.mockResolvedValue([
      {
        id: 'test-school-id',
        name: 'Test School',
        status: 'active'
      }
    ]);

    SchoolPasswordService.validatePassword.mockResolvedValue({
      valid: false,
      error: 'internal_error'
    });

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'pete_error',
        password: 'secure123',
        email: 'pete@example.com',
        schoolName: 'Test School',
        schoolPassword: 'any_password'
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('internal_error');
  });
});
