'use strict';

/**
 * POST/PATCH /api/scenarios — primary_playlist_id behavior.
 * Covers: with playlist_id, without (null), invalid UUID rejected.
 */

const request = require('supertest');
const express = require('express');

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockPermMiddleware = jest.fn((req, res, next) => {
  req.user = { stableId: 'coach-1' };
  next();
});
jest.mock('../../auth/requirePermission', () => ({
  requirePermission: jest.fn(() => mockPermMiddleware),
}));

const mockRepo = {
  createScenario: jest.fn(),
  getScenario:    jest.fn(),
  updateScenario: jest.fn(),
  listScenarios:  jest.fn(),
};
jest.mock('../../db/repositories/ScenarioBuilderRepository', () => mockRepo);

jest.mock('../../state/SharedState', () => ({ tables: new Map() }));
jest.mock('../../services/PlaylistExecutionService', () => ({}));
jest.mock('../../db/HandLoggerSupabase', () => ({}));

function makeApp() {
  const app = express();
  app.use(express.json());
  const router = require('../scenarioBuilder');
  app.use('/api', router);
  return app;
}

const VALID_UUID = '11111111-2222-3333-4444-555555555555';
const BASE_PAYLOAD = {
  name: 'Test Scenario',
  player_count: 6,
  card_mode: 'fixed',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockRepo.createScenario.mockResolvedValue({ id: 's1', name: 'Test Scenario' });
});

// ─── POST /api/scenarios ─────────────────────────────────────────────────────

describe('POST /api/scenarios — primary_playlist_id', () => {
  it('persists primary_playlist_id when provided', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/api/scenarios')
      .send({ ...BASE_PAYLOAD, primary_playlist_id: VALID_UUID });

    expect(res.status).toBe(201);
    expect(mockRepo.createScenario).toHaveBeenCalledWith(
      expect.objectContaining({ primaryPlaylistId: VALID_UUID })
    );
  });

  it('succeeds when primary_playlist_id is omitted (defaults to null)', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/api/scenarios')
      .send(BASE_PAYLOAD);

    expect(res.status).toBe(201);
    expect(mockRepo.createScenario).toHaveBeenCalledWith(
      expect.objectContaining({ primaryPlaylistId: null })
    );
  });

  it('rejects invalid UUID with 400', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/api/scenarios')
      .send({ ...BASE_PAYLOAD, primary_playlist_id: 'not-a-uuid' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/primary_playlist_id/);
    expect(mockRepo.createScenario).not.toHaveBeenCalled();
  });
});

// ─── GET /api/scenarios ──────────────────────────────────────────────────────

describe('GET /api/scenarios — primary_playlist_id in response', () => {
  it('returns primary_playlist_id field per scenario', async () => {
    mockRepo.listScenarios.mockResolvedValue([
      { id: 's1', name: 'A', primary_playlist_id: VALID_UUID },
      { id: 's2', name: 'B', primary_playlist_id: null },
    ]);
    const app = makeApp();
    const res = await request(app).get('/api/scenarios');

    expect(res.status).toBe(200);
    expect(res.body.scenarios).toHaveLength(2);
    expect(res.body.scenarios[0].primary_playlist_id).toBe(VALID_UUID);
    expect(res.body.scenarios[1].primary_playlist_id).toBeNull();
  });
});

// ─── PATCH /api/scenarios/:id ────────────────────────────────────────────────

describe('PATCH /api/scenarios/:id — primary_playlist_id', () => {
  it('rejects invalid UUID with 400', async () => {
    mockRepo.getScenario.mockResolvedValue({ id: 's1', coach_id: 'coach-1' });
    const app = makeApp();
    const res = await request(app)
      .patch('/api/scenarios/s1')
      .send({ primary_playlist_id: 'bogus' });

    expect(res.status).toBe(400);
    expect(mockRepo.updateScenario).not.toHaveBeenCalled();
  });
});
