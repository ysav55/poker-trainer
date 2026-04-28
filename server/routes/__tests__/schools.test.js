'use strict';

/**
 * School admin routes tests.
 *
 * Endpoints covered:
 *   GET    /api/admin/schools
 *   POST   /api/admin/schools
 *   GET    /api/admin/schools/:id
 *   PATCH  /api/admin/schools/:id
 *   DELETE /api/admin/schools/:id
 *   GET    /api/admin/schools/:id/members
 *   POST   /api/admin/schools/:id/members
 *   DELETE /api/admin/schools/:id/members/:playerId
 *   GET    /api/admin/schools/:id/features
 *   PUT    /api/admin/schools/:id/features
 *
 * All SchoolRepository and featureGate calls are mocked.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../db/repositories/SchoolRepository', () => ({
  findAll:          jest.fn(),
  findById:         jest.fn(),
  create:           jest.fn(),
  update:           jest.fn(),
  archive:          jest.fn(),
  getMembers:       jest.fn(),
  getMemberCounts:  jest.fn(),
  assignPlayer:     jest.fn(),
  removePlayer:     jest.fn(),
  canAddCoach:      jest.fn(),
  canAddStudent:    jest.fn(),
  getFeatures:      jest.fn(),
  setFeature:       jest.fn(),
  bulkSetFeatures:  jest.fn(),
}));

jest.mock('../../auth/featureGate', () => ({
  invalidatePlayerSchoolCache: jest.fn(),
  invalidateSchoolFeatureCache: jest.fn(),
}));

// requireAuth shim
let mockCurrentUser = null;
jest.mock('../../auth/requireAuth.js', () =>
  jest.fn((req, res, next) => {
    if (!mockCurrentUser) return res.status(401).json({ error: 'auth_required' });
    req.user = mockCurrentUser;
    next();
  })
);

// requirePermission — passes for admin, blocks otherwise
jest.mock('../../auth/requirePermission.js', () => ({
  requirePermission: jest.fn((key) => (req, res, next) => {
    if (req.user?.hasSchoolManage) return next();
    return res.status(403).json({ error: 'Insufficient permissions' });
  }),
  getPlayerPermissions:      jest.fn().mockResolvedValue(new Set()),
  invalidatePermissionCache: jest.fn(),
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

const express  = require('express');
const request  = require('supertest');
const requireAuth = require('../../auth/requireAuth.js');
const SchoolRepo  = require('../../db/repositories/SchoolRepository');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', requireAuth, require('../admin/schools'));
  return app;
}

const app = buildApp();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function asAdmin() {
  mockCurrentUser = { stableId: 'admin-uuid', id: 'admin-uuid', hasSchoolManage: true };
}

function makeSchool(overrides = {}) {
  return {
    id: 'school-1', name: 'Test School', status: 'active',
    max_coaches: null, max_students: null, coaches: 0, students: 0, total: 0,
    ...overrides,
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrentUser = null;
});

// ─── GET /api/admin/schools ───────────────────────────────────────────────────

describe('GET /api/admin/schools', () => {
  test('returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/admin/schools');
    expect(res.status).toBe(401);
  });

  test('returns 403 when missing school:manage permission', async () => {
    mockCurrentUser = { stableId: 'u1', id: 'u1', hasSchoolManage: false };
    const res = await request(app).get('/api/admin/schools');
    expect(res.status).toBe(403);
  });

  test('returns schools list', async () => {
    asAdmin();
    SchoolRepo.findAll.mockResolvedValue([makeSchool()]);
    const res = await request(app).get('/api/admin/schools');
    expect(res.status).toBe(200);
    expect(res.body.schools).toHaveLength(1);
  });

  test('returns 500 on repository error', async () => {
    asAdmin();
    SchoolRepo.findAll.mockRejectedValue(new Error('DB error'));
    const res = await request(app).get('/api/admin/schools');
    expect(res.status).toBe(500);
  });
});

// ─── POST /api/admin/schools ──────────────────────────────────────────────────

describe('POST /api/admin/schools', () => {
  test('returns 400 when name is missing', async () => {
    asAdmin();
    const res = await request(app).post('/api/admin/schools').send({});
    expect(res.status).toBe(400);
  });

  test('creates and returns 201 with school', async () => {
    asAdmin();
    const created = makeSchool({ id: 'new-school', name: 'New School' });
    SchoolRepo.create.mockResolvedValue(created);

    const res = await request(app).post('/api/admin/schools').send({ name: 'New School', maxStudents: 50 });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe('new-school');
    expect(SchoolRepo.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'New School', maxStudents: 50 }));
  });
});

// ─── GET /api/admin/schools/:id ───────────────────────────────────────────────

describe('GET /api/admin/schools/:id', () => {
  test('returns 404 when school not found', async () => {
    asAdmin();
    SchoolRepo.findById.mockResolvedValue(null);
    const res = await request(app).get('/api/admin/schools/missing');
    expect(res.status).toBe(404);
  });

  test('returns school with members and features', async () => {
    asAdmin();
    SchoolRepo.findById.mockResolvedValue(makeSchool());
    SchoolRepo.getMembers.mockResolvedValue([]);
    SchoolRepo.getFeatures.mockResolvedValue({ replay: true, analysis: true });

    const res = await request(app).get('/api/admin/schools/school-1');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('features');
    expect(res.body).toHaveProperty('members');
  });
});

// ─── PATCH /api/admin/schools/:id ────────────────────────────────────────────

describe('PATCH /api/admin/schools/:id', () => {
  test('returns 404 when school not found', async () => {
    asAdmin();
    SchoolRepo.findById.mockResolvedValue(null);
    const res = await request(app).patch('/api/admin/schools/missing').send({ name: 'X' });
    expect(res.status).toBe(404);
  });

  test('updates and returns school', async () => {
    asAdmin();
    SchoolRepo.findById.mockResolvedValue(makeSchool());
    const updated = makeSchool({ name: 'Renamed' });
    SchoolRepo.update.mockResolvedValue(updated);

    const res = await request(app).patch('/api/admin/schools/school-1').send({ name: 'Renamed' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Renamed');
  });
});

// ─── DELETE /api/admin/schools/:id ───────────────────────────────────────────

describe('DELETE /api/admin/schools/:id', () => {
  test('archives school and returns success', async () => {
    asAdmin();
    SchoolRepo.findById.mockResolvedValue(makeSchool());
    SchoolRepo.archive.mockResolvedValue();

    const res = await request(app).delete('/api/admin/schools/school-1');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(SchoolRepo.archive).toHaveBeenCalledWith('school-1');
  });

  test('returns 404 when school not found', async () => {
    asAdmin();
    SchoolRepo.findById.mockResolvedValue(null);
    const res = await request(app).delete('/api/admin/schools/missing');
    expect(res.status).toBe(404);
  });
});

// ─── POST /api/admin/schools/:id/members ─────────────────────────────────────

describe('POST /api/admin/schools/:id/members', () => {
  test('returns 400 when playerId missing', async () => {
    asAdmin();
    SchoolRepo.findById.mockResolvedValue(makeSchool());
    const res = await request(app).post('/api/admin/schools/school-1/members').send({});
    expect(res.status).toBe(400);
  });

  test('returns 404 when school not found', async () => {
    asAdmin();
    SchoolRepo.findById.mockResolvedValue(null);
    const res = await request(app).post('/api/admin/schools/missing/members').send({ playerId: 'p1' });
    expect(res.status).toBe(404);
  });

  test('returns 409 when at student limit', async () => {
    asAdmin();
    SchoolRepo.findById.mockResolvedValue(makeSchool({ max_students: 10, students: 10 }));
    SchoolRepo.canAddStudent.mockResolvedValue(false);

    const res = await request(app)
      .post('/api/admin/schools/school-1/members')
      .send({ playerId: 'new-student', role: 'player' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('at_student_limit');
  });

  test('returns 409 when at coach limit', async () => {
    asAdmin();
    SchoolRepo.findById.mockResolvedValue(makeSchool({ max_coaches: 3 }));
    SchoolRepo.canAddCoach.mockResolvedValue(false);

    const res = await request(app)
      .post('/api/admin/schools/school-1/members')
      .send({ playerId: 'new-coach', role: 'coach' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('at_coach_limit');
  });

  test('assigns player and invalidates cache on success', async () => {
    asAdmin();
    SchoolRepo.findById.mockResolvedValue(makeSchool());
    SchoolRepo.canAddStudent.mockResolvedValue(true);
    SchoolRepo.assignPlayer.mockResolvedValue();

    const { invalidatePlayerSchoolCache } = require('../../auth/featureGate');

    const res = await request(app)
      .post('/api/admin/schools/school-1/members')
      .send({ playerId: 'new-player' });
    expect(res.status).toBe(201);
    expect(invalidatePlayerSchoolCache).toHaveBeenCalledWith('new-player');
  });
});

// ─── DELETE /api/admin/schools/:id/members/:playerId ─────────────────────────

describe('DELETE /api/admin/schools/:id/members/:playerId', () => {
  test('removes player and invalidates cache', async () => {
    asAdmin();
    SchoolRepo.removePlayer.mockResolvedValue();
    const { invalidatePlayerSchoolCache } = require('../../auth/featureGate');

    const res = await request(app).delete('/api/admin/schools/school-1/members/player-9');
    expect(res.status).toBe(200);
    expect(SchoolRepo.removePlayer).toHaveBeenCalledWith('player-9', 'admin-uuid');
    expect(invalidatePlayerSchoolCache).toHaveBeenCalledWith('player-9');
  });
});

// ─── GET /api/admin/schools/:id/features ─────────────────────────────────────

describe('GET /api/admin/schools/:id/features', () => {
  test('returns 404 when school not found', async () => {
    asAdmin();
    SchoolRepo.findById.mockResolvedValue(null);
    const res = await request(app).get('/api/admin/schools/missing/features');
    expect(res.status).toBe(404);
  });

  test('returns features map', async () => {
    asAdmin();
    SchoolRepo.findById.mockResolvedValue(makeSchool());
    SchoolRepo.getFeatures.mockResolvedValue({ replay: true, analysis: false });

    const res = await request(app).get('/api/admin/schools/school-1/features');
    expect(res.status).toBe(200);
    expect(res.body.features.analysis).toBe(false);
  });
});

// ─── PUT /api/admin/schools/:id/features ─────────────────────────────────────

describe('PUT /api/admin/schools/:id/features', () => {
  test('returns 404 when school not found', async () => {
    asAdmin();
    SchoolRepo.findById.mockResolvedValue(null);
    const res = await request(app).put('/api/admin/schools/missing/features').send({ replay: false });
    expect(res.status).toBe(404);
  });

  test('bulk updates features and returns updated map', async () => {
    asAdmin();
    SchoolRepo.findById.mockResolvedValue(makeSchool());
    SchoolRepo.bulkSetFeatures.mockResolvedValue();
    SchoolRepo.getFeatures.mockResolvedValue({ replay: false, analysis: true });

    const { invalidateSchoolFeatureCache } = require('../../auth/featureGate');

    const res = await request(app)
      .put('/api/admin/schools/school-1/features')
      .send({ replay: false, analysis: true });

    expect(res.status).toBe(200);
    expect(res.body.features.replay).toBe(false);
    expect(invalidateSchoolFeatureCache).toHaveBeenCalledWith('school-1');
  });

  test('returns 400 for unknown feature key', async () => {
    asAdmin();
    SchoolRepo.findById.mockResolvedValue(makeSchool());
    SchoolRepo.bulkSetFeatures.mockRejectedValue(new Error('Unknown feature key: bad_key'));

    const res = await request(app)
      .put('/api/admin/schools/school-1/features')
      .send({ bad_key: true });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_feature_key');
  });
});
