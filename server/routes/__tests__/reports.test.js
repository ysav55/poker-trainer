'use strict';

/**
 * Reports route tests.
 *
 * Endpoints covered:
 *   GET  /api/coach/students/:id/reports
 *   GET  /api/coach/students/:id/reports/:rid
 *   POST /api/coach/students/:id/reports
 *   GET  /api/coach/reports/stable
 *
 * ProgressReportService is fully mocked.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../services/ProgressReportService', () => ({
  generate:       jest.fn(),
  list:           jest.fn(),
  getById:        jest.fn(),
  stableOverview: jest.fn(),
}));

let mockStudentAccessGranted = true;
jest.mock('../../auth/requireStudentAssignment', () => jest.fn());

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
    const hierarchy = ['player', 'student', 'coach', 'moderator', 'admin'];
    const userIdx   = hierarchy.indexOf(req.user?.role ?? '');
    const minIdx    = hierarchy.indexOf(minRole);
    if (userIdx < minIdx) return res.status(403).json({ error: 'forbidden' });
    next();
  })
);

// ─── Module under test ────────────────────────────────────────────────────────

const request      = require('supertest');
const express      = require('express');
const requireAuth  = require('../../auth/requireAuth.js');
const requireRole  = require('../../auth/requireRole.js');
const requireStudentAssignment = require('../../auth/requireStudentAssignment');
const registerReportRoutes    = require('../reports');
const ProgressReportService   = require('../../services/ProgressReportService');

function buildApp() {
  const app = express();
  app.use(express.json());
  registerReportRoutes(app, { requireAuth, requireRole });
  return app;
}

const app = buildApp();

const COACH_USER = { id: 'coach-uuid', stableId: 'coach-uuid', role: 'coach' };
const STUDENT_ID = 'student-uuid';

const SAMPLE_REPORT = {
  id:              'report-1',
  report_type:     'weekly',
  period_start:    '2026-03-24',
  period_end:      '2026-03-30',
  overall_grade:   72,
  period_stats:    {},
  comparison:      [],
  mistake_trends:  [],
  top_hands:       {},
  leak_evolution:  [],
  session_summary: {},
  scenario_results: [],
  created_at:      '2026-04-01T00:00:00Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrentUser = null;
  mockStudentAccessGranted = true;
  requireStudentAssignment.mockImplementation((req, res, next) => {
    if (!mockStudentAccessGranted) {
      return res.status(403).json({ error: 'forbidden', message: 'Student not assigned to you' });
    }
    req.studentId = req.params.id;
    next();
  });
  ProgressReportService.generate.mockResolvedValue(SAMPLE_REPORT);
  ProgressReportService.list.mockResolvedValue([SAMPLE_REPORT]);
  ProgressReportService.getById.mockResolvedValue(SAMPLE_REPORT);
  ProgressReportService.stableOverview.mockResolvedValue({ students: [], avg_grade: null, top_performers: [], concerns: [] });
});

// ─── Auth guards ──────────────────────────────────────────────────────────────

describe('Auth guards', () => {
  test('GET /api/coach/students/:id/reports returns 401 when unauthenticated', async () => {
    const res = await request(app).get(`/api/coach/students/${STUDENT_ID}/reports`);
    expect(res.status).toBe(401);
  });

  test('GET /api/coach/students/:id/reports returns 403 for non-coach', async () => {
    mockCurrentUser = { id: 'p1', role: 'player' };
    const res = await request(app).get(`/api/coach/students/${STUDENT_ID}/reports`);
    expect(res.status).toBe(403);
  });
});

// ─── GET /api/coach/students/:id/reports ─────────────────────────────────────

describe('GET /api/coach/students/:id/reports', () => {
  beforeEach(() => { mockCurrentUser = COACH_USER; });

  test('returns list of reports', async () => {
    const res = await request(app).get(`/api/coach/students/${STUDENT_ID}/reports`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('reports');
    expect(Array.isArray(res.body.reports)).toBe(true);
  });

  test('passes type and limit to service', async () => {
    await request(app).get(`/api/coach/students/${STUDENT_ID}/reports?type=weekly&limit=5`);
    expect(ProgressReportService.list).toHaveBeenCalledWith(
      COACH_USER.id, STUDENT_ID, expect.objectContaining({ type: 'weekly', limit: 5 })
    );
  });

  test('returns 400 for invalid type', async () => {
    const res = await request(app).get(`/api/coach/students/${STUDENT_ID}/reports?type=invalid`);
    expect(res.status).toBe(400);
  });

  test('returns 500 on service error', async () => {
    ProgressReportService.list.mockRejectedValue(new Error('db fail'));
    const res = await request(app).get(`/api/coach/students/${STUDENT_ID}/reports`);
    expect(res.status).toBe(500);
  });
});

// ─── GET /api/coach/students/:id/reports/:rid ────────────────────────────────

describe('GET /api/coach/students/:id/reports/:rid', () => {
  beforeEach(() => { mockCurrentUser = COACH_USER; });

  test('returns report when found', async () => {
    const res = await request(app).get(`/api/coach/students/${STUDENT_ID}/reports/report-1`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('report-1');
  });

  test('returns 404 when report not found', async () => {
    ProgressReportService.getById.mockResolvedValue(null);
    const res = await request(app).get(`/api/coach/students/${STUDENT_ID}/reports/missing`);
    expect(res.status).toBe(404);
  });

  test('returns 500 on service error', async () => {
    ProgressReportService.getById.mockRejectedValue(new Error('db fail'));
    const res = await request(app).get(`/api/coach/students/${STUDENT_ID}/reports/r1`);
    expect(res.status).toBe(500);
  });
});

// ─── POST /api/coach/students/:id/reports ────────────────────────────────────

describe('POST /api/coach/students/:id/reports', () => {
  beforeEach(() => { mockCurrentUser = COACH_USER; });

  test('generates and returns a report', async () => {
    const res = await request(app)
      .post(`/api/coach/students/${STUDENT_ID}/reports`)
      .send({ period_start: '2026-03-24', period_end: '2026-03-30' });
    expect(res.status).toBe(201);
    expect(res.body.overall_grade).toBe(72);
    expect(ProgressReportService.generate).toHaveBeenCalledWith(
      COACH_USER.id, STUDENT_ID, '2026-03-24', '2026-03-30', undefined
    );
  });

  test('passes explicit type to service', async () => {
    await request(app)
      .post(`/api/coach/students/${STUDENT_ID}/reports`)
      .send({ period_start: '2026-03-24', period_end: '2026-03-30', type: 'custom' });
    expect(ProgressReportService.generate).toHaveBeenCalledWith(
      COACH_USER.id, STUDENT_ID, '2026-03-24', '2026-03-30', 'custom'
    );
  });

  test('returns 400 when period_start missing', async () => {
    const res = await request(app)
      .post(`/api/coach/students/${STUDENT_ID}/reports`)
      .send({ period_end: '2026-03-30' });
    expect(res.status).toBe(400);
  });

  test('returns 400 when period_end missing', async () => {
    const res = await request(app)
      .post(`/api/coach/students/${STUDENT_ID}/reports`)
      .send({ period_start: '2026-03-24' });
    expect(res.status).toBe(400);
  });

  test('returns 400 for invalid date strings', async () => {
    const res = await request(app)
      .post(`/api/coach/students/${STUDENT_ID}/reports`)
      .send({ period_start: 'not-a-date', period_end: '2026-03-30' });
    expect(res.status).toBe(400);
  });

  test('returns 400 for invalid type', async () => {
    const res = await request(app)
      .post(`/api/coach/students/${STUDENT_ID}/reports`)
      .send({ period_start: '2026-03-24', period_end: '2026-03-30', type: 'bogus' });
    expect(res.status).toBe(400);
  });

  test('returns 500 on service error', async () => {
    ProgressReportService.generate.mockRejectedValue(new Error('computation failed'));
    const res = await request(app)
      .post(`/api/coach/students/${STUDENT_ID}/reports`)
      .send({ period_start: '2026-03-24', period_end: '2026-03-30' });
    expect(res.status).toBe(500);
  });
});

// ─── GET /api/coach/reports/stable ───────────────────────────────────────────

describe('GET /api/coach/reports/stable', () => {
  beforeEach(() => { mockCurrentUser = COACH_USER; });

  test('returns stable overview', async () => {
    ProgressReportService.stableOverview.mockResolvedValue({
      students:       [{ player_id: 's1', overall_grade: 75 }],
      avg_grade:      75,
      top_performers: [],
      concerns:       [],
    });
    const res = await request(app).get('/api/coach/reports/stable');
    expect(res.status).toBe(200);
    expect(res.body.avg_grade).toBe(75);
    expect(ProgressReportService.stableOverview).toHaveBeenCalledWith(COACH_USER.id);
  });

  test('returns 401 when unauthenticated', async () => {
    mockCurrentUser = null;
    const res = await request(app).get('/api/coach/reports/stable');
    expect(res.status).toBe(401);
  });

  test('returns 500 on service error', async () => {
    ProgressReportService.stableOverview.mockRejectedValue(new Error('fail'));
    const res = await request(app).get('/api/coach/reports/stable');
    expect(res.status).toBe(500);
  });
});

// ─── student assignment guard ─────────────────────────────────────────────────

describe('student assignment guard', () => {
  test('GET /reports returns 403 when student not assigned', async () => {
    mockCurrentUser = { id: 'coach-1', stableId: 'coach-1', role: 'coach' };
    mockStudentAccessGranted = false;
    const res = await request(app).get('/api/coach/students/student-99/reports');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('forbidden');
  });

  test('GET /reports/:rid returns 403 when student not assigned', async () => {
    mockCurrentUser = { id: 'coach-1', stableId: 'coach-1', role: 'coach' };
    mockStudentAccessGranted = false;
    const res = await request(app).get('/api/coach/students/student-99/reports/report-1');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('forbidden');
  });

  test('POST /reports returns 403 when student not assigned', async () => {
    mockCurrentUser = { id: 'coach-1', stableId: 'coach-1', role: 'coach' };
    mockStudentAccessGranted = false;
    const res = await request(app)
      .post('/api/coach/students/student-99/reports')
      .send({ period_start: '2026-01-01', period_end: '2026-01-31' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('forbidden');
  });
});
