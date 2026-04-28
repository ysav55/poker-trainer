'use strict';

/**
 * Alert route tests.
 *
 * Endpoints covered:
 *   GET  /api/coach/alerts
 *   PATCH /api/coach/alerts/:id
 *   GET  /api/coach/alerts/config
 *   PUT  /api/coach/alerts/config/:alertType
 *
 * AlertService and Supabase are fully mocked.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../services/AlertService', () => ({
  generateAlerts: jest.fn(),
}));

jest.mock('../../ai/NarratorService', () => ({
  narrateAlerts: jest.fn().mockResolvedValue(null),
}));

let mockChainData = null;

function makeChain(response) {
  const chain = {
    select:      jest.fn().mockReturnThis(),
    eq:          jest.fn().mockReturnThis(),
    order:       jest.fn().mockReturnThis(),
    limit:       jest.fn().mockReturnThis(),
    update:      jest.fn().mockReturnThis(),
    upsert:      jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue(response),
    single:      jest.fn().mockResolvedValue(response),
    then:        (resolve, reject) => Promise.resolve(response).then(resolve, reject),
  };
  return chain;
}

const mockFrom = jest.fn();
jest.mock('../../db/supabase', () => ({ from: mockFrom }));

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
    if (userIdx < minIdx)
      return res.status(403).json({ error: 'forbidden' });
    next();
  })
);

// ─── Module under test ────────────────────────────────────────────────────────

const request      = require('supertest');
const express      = require('express');
const requireAuth  = require('../../auth/requireAuth.js');
const requireRole  = require('../../auth/requireRole.js');
const registerAlertRoutes = require('../alerts');
const AlertService = require('../../services/AlertService');

function buildApp() {
  const app = express();
  app.use(express.json());
  registerAlertRoutes(app, { requireAuth, requireRole });
  return app;
}

const SAMPLE_ALERTS = [
  {
    id: 'alert-1', player_id: 'player-1', alert_type: 'inactivity',
    severity: 0.87, data: { days_inactive: 7 }, status: 'active',
    created_at: '2026-04-01T12:00:00Z',
  },
];

const app = buildApp();

// ─── Setup ────────────────────────────────────────────────────────────────────

const COACH_USER = { id: 'coach-uuid', stableId: 'coach-uuid', role: 'coach' };

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrentUser = null;
  mockChainData   = null;
  AlertService.generateAlerts.mockResolvedValue(SAMPLE_ALERTS);
  mockFrom.mockImplementation(() => makeChain({ data: SAMPLE_ALERTS, error: null }));
});

// ─── Auth guards ──────────────────────────────────────────────────────────────

describe('Auth guards', () => {
  test('GET /api/coach/alerts returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/coach/alerts');
    expect(res.status).toBe(401);
  });

  test('GET /api/coach/alerts returns 403 for non-coach role', async () => {
    mockCurrentUser = { id: 'p1', role: 'player' };
    const res = await request(app).get('/api/coach/alerts');
    expect(res.status).toBe(403);
  });
});

// ─── GET /api/coach/alerts ────────────────────────────────────────────────────

describe('GET /api/coach/alerts', () => {
  beforeEach(() => { mockCurrentUser = COACH_USER; });

  test('returns active alerts from DB', async () => {
    const res = await request(app).get('/api/coach/alerts');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('alerts');
    expect(Array.isArray(res.body.alerts)).toBe(true);
  });

  test('calls generateAlerts when ?generate=true', async () => {
    const res = await request(app).get('/api/coach/alerts?generate=true');
    expect(res.status).toBe(200);
    expect(AlertService.generateAlerts).toHaveBeenCalledWith(COACH_USER.id);
    expect(res.body.generated).toBe(true);
  });

  test('returns 500 on DB error', async () => {
    mockFrom.mockImplementation(() => makeChain({ data: null, error: { message: 'db error' } }));
    const res = await request(app).get('/api/coach/alerts');
    expect(res.status).toBe(500);
  });
});

// ─── PATCH /api/coach/alerts/:id ─────────────────────────────────────────────

describe('PATCH /api/coach/alerts/:id', () => {
  beforeEach(() => { mockCurrentUser = COACH_USER; });

  test('returns 400 for invalid status', async () => {
    const res = await request(app)
      .patch('/api/coach/alerts/alert-1')
      .send({ status: 'invalid' });
    expect(res.status).toBe(400);
  });

  test('dismisses an alert successfully', async () => {
    mockFrom.mockImplementation(() => {
      const chain = makeChain({ data: { id: 'alert-1', status: 'dismissed' }, error: null });
      return chain;
    });
    const res = await request(app)
      .patch('/api/coach/alerts/alert-1')
      .send({ status: 'dismissed' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('dismissed');
  });

  test('returns 404 when alert not found for this coach', async () => {
    mockFrom.mockImplementation(() => makeChain({ data: null, error: null }));
    const res = await request(app)
      .patch('/api/coach/alerts/missing-id')
      .send({ status: 'dismissed' });
    expect(res.status).toBe(404);
  });
});

// ─── GET /api/coach/alerts/config ────────────────────────────────────────────

describe('GET /api/coach/alerts/config', () => {
  beforeEach(() => { mockCurrentUser = COACH_USER; });

  test('returns config with 6 default alert types when no overrides', async () => {
    mockFrom.mockImplementation(() => makeChain({ data: [], error: null }));
    const res = await request(app).get('/api/coach/alerts/config');
    expect(res.status).toBe(200);
    expect(res.body.config).toHaveLength(6);
    const types = res.body.config.map(c => c.alert_type);
    expect(types).toContain('inactivity');
    expect(types).toContain('positive_milestone');
  });

  test('merges saved overrides over defaults', async () => {
    const overrides = [
      { alert_type: 'inactivity', enabled: false, threshold: { days: 7 } },
    ];
    mockFrom.mockImplementation(() => makeChain({ data: overrides, error: null }));
    const res = await request(app).get('/api/coach/alerts/config');
    expect(res.status).toBe(200);
    const inactivity = res.body.config.find(c => c.alert_type === 'inactivity');
    expect(inactivity.enabled).toBe(false);
    expect(inactivity.threshold.days).toBe(7);
  });
});

// ─── PUT /api/coach/alerts/config/:alertType ─────────────────────────────────

describe('PUT /api/coach/alerts/config/:alertType', () => {
  beforeEach(() => { mockCurrentUser = COACH_USER; });

  test('returns 400 for unknown alert type', async () => {
    const res = await request(app)
      .put('/api/coach/alerts/config/unknown_type')
      .send({ enabled: false });
    expect(res.status).toBe(400);
  });

  test('upserts config successfully', async () => {
    const saved = { alert_type: 'inactivity', enabled: false, threshold: { days: 7 } };
    mockFrom.mockImplementation(() => makeChain({ data: saved, error: null }));

    const res = await request(app)
      .put('/api/coach/alerts/config/inactivity')
      .send({ enabled: false, threshold: { days: 7 } });

    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(false);
  });
});
