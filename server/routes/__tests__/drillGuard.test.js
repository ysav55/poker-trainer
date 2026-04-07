'use strict';

/**
 * Tests the conflict guard in POST /api/tables/:tableId/drill.
 * When a socket playlist drill is active (gm.state.playlist_mode.active = true),
 * the REST endpoint must return 409 Conflict.
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

// SharedState — default: no active socket drill
const mockTables = new Map();
jest.mock('../../state/SharedState', () => ({ tables: mockTables }));

// PlaylistExecutionService — avoid real DB
jest.mock('../../services/PlaylistExecutionService', () => ({
  start:     jest.fn().mockResolvedValue({ id: 'drill-1', active: true }),
  getStatus: jest.fn().mockResolvedValue({ active: false }),
}));

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

  it('returns 409 when socket playlist drill is active for the table', async () => {
    // Simulate an active socket playlist drill
    mockTables.set(TABLE_ID, {
      state: { playlist_mode: { active: true } },
    });

    const app = makeApp();
    const res = await request(app)
      .post(`/api/tables/${TABLE_ID}/drill`)
      .send({ playlist_id: 'pl-1' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('conflict');
  });

  it('returns 201 and starts drill when no socket drill is active', async () => {
    // No gm entry for this table — no socket drill active
    const app = makeApp();
    const res = await request(app)
      .post(`/api/tables/${TABLE_ID}/drill`)
      .send({ playlist_id: 'pl-1' });

    expect(res.status).toBe(201);
  });

  it('returns 201 when gm exists but playlist_mode is inactive', async () => {
    mockTables.set(TABLE_ID, {
      state: { playlist_mode: { active: false } },
    });

    const app = makeApp();
    const res = await request(app)
      .post(`/api/tables/${TABLE_ID}/drill`)
      .send({ playlist_id: 'pl-1' });

    expect(res.status).toBe(201);
  });

  it('returns 400 when playlist_id is missing', async () => {
    const app = makeApp();
    const res = await request(app)
      .post(`/api/tables/${TABLE_ID}/drill`)
      .send({});

    expect(res.status).toBe(400);
  });
});
