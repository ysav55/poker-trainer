'use strict';

/**
 * Tests the basic guard behaviour of POST /api/tables/:tableId/drill.
 *
 * NOTE (Task 2.3): The socket-playlist conflict guard (SharedState check) was
 * removed from the route handler. Conflict detection now lives in
 * PlaylistExecutionService, which returns { resumable: true, ... } when a
 * resumable session exists. That path is covered by drillHeroFields.test.js.
 */

const request = require('supertest');
const express = require('express');

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockPermMiddleware = jest.fn((req, res, next) => {
  req.user = { stableId: 'coach-id' };
  next();
});
jest.mock('../../auth/requirePermission', () => ({
  requirePermission: jest.fn(() => mockPermMiddleware),
}));

// SharedState — kept to satisfy the module import; guard no longer uses it
const mockTables = new Map();
jest.mock('../../state/SharedState', () => ({ tables: mockTables }));

// PlaylistExecutionService — avoid real DB
const mockSvc = {
  start:     jest.fn().mockResolvedValue({ session: { id: 'drill-1' }, currentScenario: null, items: [], fitCount: 0 }),
  getStatus: jest.fn().mockResolvedValue({ active: false }),
};
jest.mock('../../services/PlaylistExecutionService', () => mockSvc);

// HandLogger, ScenarioBuilderRepository — not needed for this guard test
jest.mock('../../db/HandLoggerSupabase', () => ({}));
jest.mock('../../db/repositories/ScenarioBuilderRepository', () => ({}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeApp() {
  const app = express();
  app.use(express.json());
  const router = require('../scenarioBuilder');
  app.use('/api', router);
  return app;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/tables/:tableId/drill — conflict guard', () => {
  const TABLE_ID = 'table-abc';

  afterEach(() => {
    mockTables.clear();
    jest.clearAllMocks();
  });

  it('returns 200 and starts drill when no socket drill is active', async () => {
    // No gm entry for this table — no socket drill active
    const app = makeApp();
    const res = await request(app)
      .post(`/api/tables/${TABLE_ID}/drill`)
      .send({ playlist_id: 'pl-1' });

    expect(res.status).toBe(200);
  });

  it('returns 200 when gm exists but playlist_mode is inactive', async () => {
    mockTables.set(TABLE_ID, {
      state: { playlist_mode: { active: false } },
    });

    const app = makeApp();
    const res = await request(app)
      .post(`/api/tables/${TABLE_ID}/drill`)
      .send({ playlist_id: 'pl-1' });

    expect(res.status).toBe(200);
  });

  it('returns 409 with resumable payload when service reports resumable', async () => {
    mockSvc.start.mockResolvedValueOnce({
      resumable: true, priorSessionId: 'old-session', priorPosition: 3, priorTotal: 8,
    });

    const app = makeApp();
    const res = await request(app)
      .post(`/api/tables/${TABLE_ID}/drill`)
      .send({ playlist_id: 'pl-1' });

    expect(res.status).toBe(409);
    expect(res.body.resumable).toBe(true);
    expect(res.body.prior_session_id).toBe('old-session');
  });

  it('returns 400 when playlist_id is missing', async () => {
    const app = makeApp();
    const res = await request(app)
      .post(`/api/tables/${TABLE_ID}/drill`)
      .send({});

    expect(res.status).toBe(400);
  });
});
