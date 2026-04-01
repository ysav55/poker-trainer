'use strict';

/**
 * Prep Brief route tests.
 *
 * Endpoints covered:
 *   GET  /api/coach/students/:id/prep-brief
 *   POST /api/coach/students/:id/prep-brief/refresh
 *
 * SessionPrepService is fully mocked.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../services/SessionPrepService', () => ({
  generate: jest.fn(),
  refresh:  jest.fn(),
}));

let mockCurrentUser = null;
jest.mock('../../auth/requireAuth.js', () =>
  jest.fn((req, res, next) => {
    if (!mockCurrentUser) return res.status(401).json({ error: 'auth_required' });
    req.user = mockCurrentUser;
    next();
  })
);

jest.mock('../../auth/requireRole.js', () =>
  jest.fn((minRole) => (req, res, next) => {
    const hierarchy = ['player', 'student', 'coach', 'moderator', 'admin', 'superadmin'];
    const userIdx   = hierarchy.indexOf(req.user?.role ?? '');
    const minIdx    = hierarchy.indexOf(minRole);
    if (userIdx < minIdx)
      return res.status(403).json({ error: 'forbidden', message: 'Insufficient role' });
    next();
  })
);

// ─── Module under test ────────────────────────────────────────────────────────

const request  = require('supertest');
const express  = require('express');
const requireAuth = require('../../auth/requireAuth.js');
const requireRole = require('../../auth/requireRole.js');
const registerPrepBriefRoutes = require('../prepBriefs');
const SessionPrepService      = require('../../services/SessionPrepService');

function buildApp() {
  const app = express();
  app.use(express.json());
  registerPrepBriefRoutes(app, { requireAuth, requireRole });
  return app;
}

const SAMPLE_BRIEF = {
  leaks:                [],
  flagged_hands:        [],
  coach_notes:          { notes: [], annotations: [] },
  stats_snapshot:       [],
  session_history:      [],
  active_alerts:        [],
  scenario_performance: [],
  generated_at:         '2026-04-01T12:00:00.000Z',
  from_cache:           false,
};

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrentUser = null;
  SessionPrepService.generate.mockResolvedValue(SAMPLE_BRIEF);
  SessionPrepService.refresh.mockResolvedValue({ ...SAMPLE_BRIEF, from_cache: false });
});

// ─── GET /api/coach/students/:id/prep-brief ───────────────────────────────────

describe('GET /api/coach/students/:id/prep-brief', () => {
  const app = buildApp();

  test('returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/coach/students/student-uuid/prep-brief');
    expect(res.status).toBe(401);
  });

  test('returns 403 for non-coach role', async () => {
    mockCurrentUser = { id: 'player-uuid', role: 'player' };
    const res = await request(app).get('/api/coach/students/student-uuid/prep-brief');
    expect(res.status).toBe(403);
  });

  test('returns 200 with brief for authenticated coach', async () => {
    mockCurrentUser = { id: 'coach-uuid', role: 'coach' };
    const res = await request(app).get('/api/coach/students/student-uuid/prep-brief');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      leaks:           expect.any(Array),
      flagged_hands:   expect.any(Array),
      coach_notes:     expect.any(Object),
      stats_snapshot:  expect.any(Array),
      session_history: expect.any(Array),
      active_alerts:   expect.any(Array),
      generated_at:    expect.any(String),
    });
  });

  test('passes coachId and studentId to SessionPrepService.generate', async () => {
    mockCurrentUser = { id: 'coach-uuid', role: 'coach' };
    await request(app).get('/api/coach/students/student-uuid/prep-brief');
    expect(SessionPrepService.generate).toHaveBeenCalledWith('coach-uuid', 'student-uuid');
  });

  test('uses stableId when id not present on user', async () => {
    mockCurrentUser = { stableId: 'stable-coach-uuid', role: 'coach' };
    await request(app).get('/api/coach/students/student-uuid/prep-brief');
    expect(SessionPrepService.generate).toHaveBeenCalledWith('stable-coach-uuid', 'student-uuid');
  });

  test('admin role also passes (elevated above coach)', async () => {
    mockCurrentUser = { id: 'admin-uuid', role: 'admin' };
    const res = await request(app).get('/api/coach/students/student-uuid/prep-brief');
    expect(res.status).toBe(200);
  });

  test('returns 500 when service throws', async () => {
    mockCurrentUser = { id: 'coach-uuid', role: 'coach' };
    SessionPrepService.generate.mockRejectedValue(new Error('DB unavailable'));
    const res = await request(app).get('/api/coach/students/student-uuid/prep-brief');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('internal_error');
  });

  test('returns from_cache:true when brief is served from cache', async () => {
    mockCurrentUser = { id: 'coach-uuid', role: 'coach' };
    SessionPrepService.generate.mockResolvedValue({ ...SAMPLE_BRIEF, from_cache: true });
    const res = await request(app).get('/api/coach/students/student-uuid/prep-brief');
    expect(res.status).toBe(200);
    expect(res.body.from_cache).toBe(true);
  });
});

// ─── POST /api/coach/students/:id/prep-brief/refresh ─────────────────────────

describe('POST /api/coach/students/:id/prep-brief/refresh', () => {
  const app = buildApp();

  test('returns 401 when unauthenticated', async () => {
    const res = await request(app).post('/api/coach/students/student-uuid/prep-brief/refresh');
    expect(res.status).toBe(401);
  });

  test('returns 403 for non-coach role', async () => {
    mockCurrentUser = { id: 'player-uuid', role: 'player' };
    const res = await request(app).post('/api/coach/students/student-uuid/prep-brief/refresh');
    expect(res.status).toBe(403);
  });

  test('returns 200 with freshly generated brief', async () => {
    mockCurrentUser = { id: 'coach-uuid', role: 'coach' };
    const res = await request(app).post('/api/coach/students/student-uuid/prep-brief/refresh');
    expect(res.status).toBe(200);
    expect(res.body.from_cache).toBe(false);
  });

  test('calls SessionPrepService.refresh (not generate)', async () => {
    mockCurrentUser = { id: 'coach-uuid', role: 'coach' };
    await request(app).post('/api/coach/students/student-uuid/prep-brief/refresh');
    expect(SessionPrepService.refresh).toHaveBeenCalledWith('coach-uuid', 'student-uuid');
    expect(SessionPrepService.generate).not.toHaveBeenCalled();
  });

  test('returns 500 when service throws', async () => {
    mockCurrentUser = { id: 'coach-uuid', role: 'coach' };
    SessionPrepService.refresh.mockRejectedValue(new Error('timeout'));
    const res = await request(app).post('/api/coach/students/student-uuid/prep-brief/refresh');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('internal_error');
  });
});
