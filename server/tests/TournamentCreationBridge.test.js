'use strict';

/**
 * Phase 1 — Tournament Creation Bridge tests.
 *
 * Verifies that POST /api/admin/tournaments:
 *   1. Creates a tables row (System A)
 *   2. Creates a tournament_configs row with all v2 fields
 *   3. Creates a tournaments row (System B registry) linked via table_id
 *   4. Returns { tableId, configId, tournamentId }
 *   5. Rejects invalid input with 4xx
 *   6. Appoints a referee when refPlayerId is provided
 */

// ─── Mocks (must precede all requires) ───────────────────────────────────────

let mockCurrentUser = { id: 'user-uuid', stableId: 'user-uuid', role: 'admin' };

jest.mock('../auth/requireAuth.js', () =>
  jest.fn((req, _res, next) => { req.user = mockCurrentUser; next(); })
);

jest.mock('../auth/requirePermission.js', () => ({
  requirePermission: () => (_req, _res, next) => next(),
  getPlayerPermissions: jest.fn().mockResolvedValue(new Set()),
  invalidatePermissionCache: jest.fn(),
}));

jest.mock('../auth/featureGate.js', () => ({
  requireFeature: () => (_req, _res, next) => next(),
}));

jest.mock('../auth/tournamentAuth.js', () => ({
  requireTournamentAccess: () => (_req, _res, next) => next(),
  canManageTournament: jest.fn().mockResolvedValue(true),
}));

const mockCreateTable           = jest.fn().mockResolvedValue(undefined);
const mockCreateConfig          = jest.fn().mockResolvedValue('mock-config-id');
const mockCreateLinkedTournament = jest.fn().mockResolvedValue('mock-tournament-id');

jest.mock('../db/repositories/TableRepository.js', () => ({
  TableRepository:         { createTable: (...a) => mockCreateTable(...a) },
  InvitedPlayersRepository: { addInvite: jest.fn(), removeInvite: jest.fn(), listInvited: jest.fn(), isInvited: jest.fn() },
  TablePresetsRepository:   { save: jest.fn(), list: jest.fn(), get: jest.fn(), update: jest.fn(), delete: jest.fn(), clone: jest.fn() },
}));

jest.mock('../db/repositories/TournamentRepository.js', () => ({
  TournamentRepository: {
    createConfig:           (...a) => mockCreateConfig(...a),
    createLinkedTournament: (...a) => mockCreateLinkedTournament(...a),
    getConfig:              jest.fn().mockResolvedValue(null),
    getStandings:           jest.fn().mockResolvedValue([]),
  },
}));

const mockSupabaseInsert = jest.fn().mockResolvedValue({ data: null, error: null });
const mockSupabaseFrom   = jest.fn(() => ({ insert: mockSupabaseInsert }));
jest.mock('../db/supabase', () => ({ from: (...a) => mockSupabaseFrom(...a) }));

jest.mock('../services/IcmService.js', () => ({
  computeIcmPrizes: jest.fn().mockReturnValue([]),
}));

// ─── App setup (after mocks) ──────────────────────────────────────────────────

const express  = require('express');
const request  = require('supertest');
const adminRouter = require('../routes/admin/tournaments');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRouter);
  return app;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const VALID_BODY = {
  name:             'Test Tournament',
  blindSchedule:    [{ level: 1, sb: 25, bb: 50, ante: 0, duration_minutes: 20 }],
  startingStack:    10000,
  rebuyAllowed:     false,
  addonAllowed:     false,
  payoutStructure:  [{ position: 1, percentage: 60 }, { position: 2, percentage: 40 }],
  payoutMethod:     'flat',
  showIcmOverlay:   true,
  dealThreshold:    3,
  minPlayers:       6,
  scheduledStartAt: '2030-01-01T18:00:00.000Z',
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/admin/tournaments — bridge creation', () => {
  let app;
  beforeAll(() => { app = buildApp(); });
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateTable.mockResolvedValue(undefined);
    mockCreateConfig.mockResolvedValue('mock-config-id');
    mockCreateLinkedTournament.mockResolvedValue('mock-tournament-id');
    mockSupabaseInsert.mockResolvedValue({ data: null, error: null });
    mockSupabaseFrom.mockReturnValue({ insert: mockSupabaseInsert });
  });

  test('returns 201 with tableId, configId, tournamentId', async () => {
    const res = await request(app).post('/api/admin/tournaments').send(VALID_BODY);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      tableId:      expect.stringMatching(/^tournament-\d+$/),
      configId:     'mock-config-id',
      tournamentId: 'mock-tournament-id',
    });
  });

  test('creates a tables row with mode=tournament', async () => {
    await request(app).post('/api/admin/tournaments').send(VALID_BODY);
    expect(mockCreateTable).toHaveBeenCalledWith(expect.objectContaining({
      mode:      'tournament',
      name:      'Test Tournament',
      createdBy: 'user-uuid',
    }));
  });

  test('creates tournament_configs with all v2 fields', async () => {
    await request(app).post('/api/admin/tournaments').send(VALID_BODY);
    expect(mockCreateConfig).toHaveBeenCalledWith(expect.objectContaining({
      blindSchedule:    VALID_BODY.blindSchedule,
      startingStack:    10000,
      payoutStructure:  VALID_BODY.payoutStructure,
      payoutMethod:     'flat',
      showIcmOverlay:   true,
      dealThreshold:    3,
      minPlayers:       6,
      scheduledStartAt: '2030-01-01T18:00:00.000Z',
    }));
  });

  test('creates linked tournaments row with tableId set', async () => {
    const res = await request(app).post('/api/admin/tournaments').send(VALID_BODY);
    expect(mockCreateLinkedTournament).toHaveBeenCalledWith(expect.objectContaining({
      tableId:          res.body.tableId,
      name:             'Test Tournament',
      minPlayers:       6,
      scheduledStartAt: '2030-01-01T18:00:00.000Z',
    }));
  });

  test('rejects missing name with 400', async () => {
    const res = await request(app).post('/api/admin/tournaments').send({ ...VALID_BODY, name: '' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('name is required');
  });

  test('rejects empty blindSchedule with 400', async () => {
    const res = await request(app).post('/api/admin/tournaments').send({ ...VALID_BODY, blindSchedule: [] });
    expect(res.status).toBe(400);
  });

  test('appoints referee when refPlayerId is provided', async () => {
    await request(app).post('/api/admin/tournaments').send({ ...VALID_BODY, refPlayerId: 'ref-uuid' });
    expect(mockSupabaseFrom).toHaveBeenCalledWith('tournament_referees');
    expect(mockSupabaseInsert).toHaveBeenCalledWith(expect.objectContaining({
      player_id: 'ref-uuid',
      active:    true,
    }));
  });
});
