'use strict';

const request = require('supertest');
const express = require('express');

const mockPermMiddleware = jest.fn((req, res, next) => {
  req.user = { stableId: 'c1', id: 'c1' };
  next();
});
jest.mock('../../auth/requirePermission', () => ({
  requirePermission: jest.fn(() => mockPermMiddleware),
}));

const mockSvc = {
  start:     jest.fn(),
  getStatus: jest.fn(),
};
jest.mock('../../services/PlaylistExecutionService', () => mockSvc);
jest.mock('../../db/repositories/ScenarioBuilderRepository', () => ({}));
jest.mock('../../state/SharedState', () => ({ tables: new Map() }));
jest.mock('../../db/HandLoggerSupabase', () => ({}));

function makeApp() {
  const app = express();
  app.use(express.json());
  const router = require('../scenarioBuilder');
  app.use('/api', router);
  return app;
}

beforeEach(() => jest.clearAllMocks());

describe('POST /api/tables/:tableId/drill — hero fields', () => {
  it('forwards heroMode, heroPlayerId, autoAdvance to the service', async () => {
    mockSvc.start.mockResolvedValue({ session: { id: 'ds1' }, currentScenario: null, items: [], fitCount: 0 });
    const app = makeApp();
    await request(app)
      .post('/api/tables/t1/drill')
      .send({
        playlist_id: 'p1',
        opted_in_players: ['u1', 'u2', 'u3'],
        hero_mode: 'rotate',
        hero_player_id: 'u2',
        auto_advance: true,
      })
      .expect(200);
    expect(mockSvc.start).toHaveBeenCalledWith(expect.objectContaining({
      heroMode: 'rotate', heroPlayerId: 'u2', autoAdvance: true,
    }));
  });

  it('returns 409 with resumable payload when service reports resumable', async () => {
    mockSvc.start.mockResolvedValue({
      resumable: true, priorSessionId: 'ds_old', priorPosition: 5, priorTotal: 10,
    });
    const app = makeApp();
    const res = await request(app).post('/api/tables/t1/drill').send({ playlist_id: 'p1' });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ resumable: true, prior_session_id: 'ds_old', prior_position: 5 });
  });

  it('forwards forceRestart=true to the service', async () => {
    mockSvc.start.mockResolvedValue({ session: { id: 'ds1' }, currentScenario: null, items: [], fitCount: 0 });
    const app = makeApp();
    await request(app).post('/api/tables/t1/drill').send({ playlist_id: 'p1', force_restart: true }).expect(200);
    expect(mockSvc.start).toHaveBeenCalledWith(expect.objectContaining({ forceRestart: true }));
  });
});
