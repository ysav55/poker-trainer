'use strict';

/**
 * Tournament Group REST route tests.
 *
 * Endpoints covered:
 *   GET    /api/tournament-groups               — list with filters
 *   GET    /api/tournament-groups/:id           — get detail
 *   POST   /api/tournament-groups               — create
 *   POST   /api/tournament-groups/:id/register  — register player
 *   DELETE /api/tournament-groups/:id/register  — unregister player
 *   PATCH  /api/tournament-groups/:id/start     — start tournament
 *   PATCH  /api/tournament-groups/:id/cancel    — cancel tournament
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../db/repositories/TournamentGroupRepository', () => ({
  TournamentGroupRepository: {
    createGroup:               jest.fn(),
    listGroups:                jest.fn(),
    getGroup:                  jest.fn(),
    getTableIds:               jest.fn(),
    getRegistrations:          jest.fn(),
    getRegistration:           jest.fn(),
    createRegistration:        jest.fn(),
    cancelRegistration:        jest.fn(),
    updateRegistrationStatus:  jest.fn(),
    updateStatus:              jest.fn(),
    getStandings:              jest.fn(),
  },
}));

jest.mock('../../game/controllers/TournamentGroupController', () => ({
  TournamentGroupController: jest.fn().mockImplementation(() => ({
    start:                 jest.fn().mockResolvedValue(undefined),
    assignPlayersToTables: jest.fn().mockResolvedValue(['tbl-1', 'tbl-2']),
    destroy:               jest.fn(),
    config:                null,
  })),
}));

jest.mock('../../db/repositories/ChipBankRepository', () => ({
  ChipBankRepository: {
    applyTransaction: jest.fn(),
  },
}));

jest.mock('../../db/repositories/TableRepository', () => ({
  TableRepository: {},
}));

jest.mock('../../db/repositories/TournamentRepository', () => ({
  TournamentRepository: {},
}));

// requirePermission — controllable middleware (pass-through by default)
const mockPermMiddleware = jest.fn((req, res, next) => next());
jest.mock('../../auth/requirePermission', () => ({
  requirePermission:         jest.fn(() => mockPermMiddleware),
  getPlayerPermissions:      jest.fn(),
  invalidatePermissionCache: jest.fn(),
}));

// SharedState — groupControllers as a real Map so routes can set/get/delete
jest.mock('../../state/SharedState', () => {
  const groupControllers = new Map();
  const tables           = new Map();
  return {
    groupControllers,
    tables,
    getOrCreateController: jest.fn(),
  };
});

// supabase — not used directly by any tested route, but imported at module level
jest.mock('../../db/supabase', () => ({}));

// ─── Module imports ───────────────────────────────────────────────────────────

const express    = require('express');
const request    = require('supertest');

const { TournamentGroupRepository } = require('../../db/repositories/TournamentGroupRepository');
const { TournamentGroupController } = require('../../game/controllers/TournamentGroupController');
const { ChipBankRepository }        = require('../../db/repositories/ChipBankRepository');
const SharedState                   = require('../../state/SharedState');
const { registerTournamentGroupRoutes } = require('../tournamentGroups');

// ─── App builder ─────────────────────────────────────────────────────────────

let mockCurrentUser = null;

function buildApp() {
  const app = express();
  app.use(express.json());

  // Inline requireAuth — reads from mockCurrentUser
  const requireAuth = (req, res, next) => {
    if (!mockCurrentUser) return res.status(401).json({ error: 'Unauthorized' });
    req.user = mockCurrentUser;
    return next();
  };

  // Fake io — to() returns an object with emit()
  app.set('io', {
    to: jest.fn(() => ({ emit: jest.fn() })),
    emit: jest.fn(),
  });

  registerTournamentGroupRoutes(app, { requireAuth });
  return app;
}

const app = buildApp();

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrentUser = null;
  mockPermMiddleware.mockImplementation((req, res, next) => next());

  SharedState.groupControllers.clear();
  SharedState.tables.clear();

  // Safe defaults
  TournamentGroupRepository.listGroups.mockResolvedValue([]);
  TournamentGroupRepository.getGroup.mockResolvedValue(null);
  TournamentGroupRepository.getTableIds.mockResolvedValue([]);
  TournamentGroupRepository.getRegistrations.mockResolvedValue([]);
  TournamentGroupRepository.getRegistration.mockResolvedValue(null);
  TournamentGroupRepository.createRegistration.mockResolvedValue('reg-uuid-1');
  TournamentGroupRepository.cancelRegistration.mockResolvedValue(undefined);
  TournamentGroupRepository.updateRegistrationStatus.mockResolvedValue(undefined);
  TournamentGroupRepository.updateStatus.mockResolvedValue(undefined);
  TournamentGroupRepository.createGroup.mockResolvedValue('grp-uuid-1');
  ChipBankRepository.applyTransaction.mockResolvedValue(undefined);
});

// ─── GET /api/tournament-groups ───────────────────────────────────────────────

describe('GET /api/tournament-groups', () => {
  test('returns 200 with { groups } when authenticated', async () => {
    mockCurrentUser = { stableId: 'player-1', id: 'player-1', role: 'coached_student', schoolId: 'school-1' };
    const fakeGroups = [{ id: 'grp-1', name: 'Saturday Night Tourney', status: 'pending' }];
    TournamentGroupRepository.listGroups.mockResolvedValue(fakeGroups);

    const res = await request(app).get('/api/tournament-groups');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ groups: fakeGroups });
  });

  test('passes status and privacy query params to listGroups', async () => {
    mockCurrentUser = { stableId: 'player-1', id: 'player-1', role: 'coached_student', schoolId: 'school-1' };
    TournamentGroupRepository.listGroups.mockResolvedValue([]);

    const res = await request(app).get('/api/tournament-groups?status=pending&privacy=public');
    expect(res.status).toBe(200);
    expect(TournamentGroupRepository.listGroups).toHaveBeenCalledWith({
      status:   'pending',
      privacy:  'public',
      schoolId: 'school-1',
    });
  });

  test('non-admin uses own schoolId regardless of query param', async () => {
    mockCurrentUser = { stableId: 'player-1', id: 'player-1', role: 'coached_student', schoolId: 'school-1' };
    TournamentGroupRepository.listGroups.mockResolvedValue([]);

    await request(app).get('/api/tournament-groups?schoolId=other-school');
    expect(TournamentGroupRepository.listGroups).toHaveBeenCalledWith(
      expect.objectContaining({ schoolId: 'school-1' })
    );
  });

  test('admin can pass schoolId query param', async () => {
    mockCurrentUser = { stableId: 'admin-1', id: 'admin-1', role: 'admin', schoolId: 'school-1' };
    TournamentGroupRepository.listGroups.mockResolvedValue([]);

    await request(app).get('/api/tournament-groups?schoolId=other-school');
    expect(TournamentGroupRepository.listGroups).toHaveBeenCalledWith(
      expect.objectContaining({ schoolId: 'other-school' })
    );
  });

  test('returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/tournament-groups');
    expect(res.status).toBe(401);
  });
});

// ─── GET /api/tournament-groups/:id ──────────────────────────────────────────

describe('GET /api/tournament-groups/:id', () => {
  test('returns 200 with group, tableIds, and registrations', async () => {
    mockCurrentUser = { stableId: 'player-1', id: 'player-1', role: 'coached_student' };
    const group = { id: 'grp-1', name: 'Test', status: 'pending' };
    TournamentGroupRepository.getGroup.mockResolvedValue(group);
    TournamentGroupRepository.getTableIds.mockResolvedValue(['tbl-1']);
    TournamentGroupRepository.getRegistrations.mockResolvedValue([{ player_id: 'player-1' }]);

    const res = await request(app).get('/api/tournament-groups/grp-1');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      group,
      tableIds:      ['tbl-1'],
      registrations: [{ player_id: 'player-1' }],
    });
  });

  test('returns 404 when group not found', async () => {
    mockCurrentUser = { stableId: 'player-1', id: 'player-1', role: 'coached_student' };
    TournamentGroupRepository.getGroup.mockResolvedValue(null);

    const res = await request(app).get('/api/tournament-groups/no-such-group');
    expect(res.status).toBe(404);
  });
});

// ─── POST /api/tournament-groups ─────────────────────────────────────────────

describe('POST /api/tournament-groups', () => {
  test('returns 201 with groupId when successful', async () => {
    mockCurrentUser = { stableId: 'coach-1', id: 'coach-1', role: 'admin' };
    TournamentGroupRepository.createGroup.mockResolvedValue('new-group-id');

    const res = await request(app)
      .post('/api/tournament-groups')
      .send({ name: 'Grand Prix', buyIn: 500 });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ groupId: 'new-group-id' });
  });

  test('returns 400 when name is missing', async () => {
    mockCurrentUser = { stableId: 'coach-1', id: 'coach-1', role: 'admin' };

    const res = await request(app)
      .post('/api/tournament-groups')
      .send({ buyIn: 100 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name/i);
  });

  test('returns 401 when unauthenticated', async () => {
    const res = await request(app)
      .post('/api/tournament-groups')
      .send({ name: 'Test' });
    expect(res.status).toBe(401);
  });
});

// ─── POST /api/tournament-groups/:id/register ────────────────────────────────

describe('POST /api/tournament-groups/:id/register', () => {
  const pendingGroup = { id: 'grp-1', name: 'Grand Prix', status: 'pending', buy_in: 200 };

  test('returns 201 { registered, buyIn } when successful with buy-in', async () => {
    mockCurrentUser = { stableId: 'player-1', id: 'player-1', role: 'coached_student' };
    TournamentGroupRepository.getGroup.mockResolvedValue(pendingGroup);
    TournamentGroupRepository.createRegistration.mockResolvedValue('reg-1');
    TournamentGroupRepository.getRegistrations.mockResolvedValue([{ player_id: 'player-1' }]);

    const res = await request(app).post('/api/tournament-groups/grp-1/register');
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ registered: true, buyIn: 200 });
  });

  test('calls ChipBankRepository.applyTransaction with correct args', async () => {
    mockCurrentUser = { stableId: 'player-1', id: 'player-1', role: 'coached_student' };
    TournamentGroupRepository.getGroup.mockResolvedValue(pendingGroup);
    TournamentGroupRepository.createRegistration.mockResolvedValue('reg-1');
    TournamentGroupRepository.getRegistrations.mockResolvedValue([]);

    await request(app).post('/api/tournament-groups/grp-1/register');

    expect(ChipBankRepository.applyTransaction).toHaveBeenCalledWith({
      playerId:  'player-1',
      amount:    -200,
      type:      'tournament_entry',
      tableId:   null,
      createdBy: null,
      notes:     `Tournament entry: ${pendingGroup.name}`,
    });
  });

  test('skips chip debit when buy_in is 0', async () => {
    mockCurrentUser = { stableId: 'player-1', id: 'player-1', role: 'coached_student' };
    const freeGroup = { ...pendingGroup, buy_in: 0 };
    TournamentGroupRepository.getGroup.mockResolvedValue(freeGroup);
    TournamentGroupRepository.createRegistration.mockResolvedValue('reg-1');
    TournamentGroupRepository.getRegistrations.mockResolvedValue([]);

    const res = await request(app).post('/api/tournament-groups/grp-1/register');
    expect(res.status).toBe(201);
    expect(ChipBankRepository.applyTransaction).not.toHaveBeenCalled();
  });

  test('returns 409 when DB throws unique constraint error (code 23505)', async () => {
    mockCurrentUser = { stableId: 'player-1', id: 'player-1', role: 'coached_student' };
    TournamentGroupRepository.getGroup.mockResolvedValue(pendingGroup);
    const dupErr = Object.assign(new Error('duplicate key'), { code: '23505' });
    TournamentGroupRepository.createRegistration.mockRejectedValue(dupErr);

    const res = await request(app).post('/api/tournament-groups/grp-1/register');
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already registered/i);
  });

  test('returns 409 when DB throws unique constraint error (message contains "unique")', async () => {
    mockCurrentUser = { stableId: 'player-1', id: 'player-1', role: 'coached_student' };
    TournamentGroupRepository.getGroup.mockResolvedValue(pendingGroup);
    const dupErr = new Error('duplicate UNIQUE constraint violated');
    TournamentGroupRepository.createRegistration.mockRejectedValue(dupErr);

    const res = await request(app).post('/api/tournament-groups/grp-1/register');
    expect(res.status).toBe(409);
  });

  test('returns 400 when group.status is not pending', async () => {
    mockCurrentUser = { stableId: 'player-1', id: 'player-1', role: 'coached_student' };
    TournamentGroupRepository.getGroup.mockResolvedValue({ ...pendingGroup, status: 'running' });

    const res = await request(app).post('/api/tournament-groups/grp-1/register');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not open/i);
  });

  test('returns 402 when ChipBankRepository throws insufficient_funds', async () => {
    mockCurrentUser = { stableId: 'player-1', id: 'player-1', role: 'coached_student' };
    TournamentGroupRepository.getGroup.mockResolvedValue(pendingGroup);
    TournamentGroupRepository.createRegistration.mockResolvedValue('reg-1');
    ChipBankRepository.applyTransaction.mockRejectedValue(new Error('insufficient_funds'));

    const res = await request(app).post('/api/tournament-groups/grp-1/register');
    expect(res.status).toBe(402);
    expect(res.body.error).toMatch(/insufficient/i);
  });

  test('compensates by cancelling registration when chip debit fails', async () => {
    mockCurrentUser = { stableId: 'player-1', id: 'player-1', role: 'coached_student' };
    TournamentGroupRepository.getGroup.mockResolvedValue(pendingGroup);
    TournamentGroupRepository.createRegistration.mockResolvedValue('reg-1');
    ChipBankRepository.applyTransaction.mockRejectedValue(new Error('insufficient_funds'));

    await request(app).post('/api/tournament-groups/grp-1/register');
    expect(TournamentGroupRepository.cancelRegistration).toHaveBeenCalledWith('grp-1', 'player-1');
  });

  test('returns 404 when group not found', async () => {
    mockCurrentUser = { stableId: 'player-1', id: 'player-1', role: 'coached_student' };
    TournamentGroupRepository.getGroup.mockResolvedValue(null);

    const res = await request(app).post('/api/tournament-groups/grp-1/register');
    expect(res.status).toBe(404);
  });

  test('returns 401 when unauthenticated', async () => {
    const res = await request(app).post('/api/tournament-groups/grp-1/register');
    expect(res.status).toBe(401);
  });
});

// ─── DELETE /api/tournament-groups/:id/register ──────────────────────────────

describe('DELETE /api/tournament-groups/:id/register', () => {
  const pendingGroup   = { id: 'grp-1', name: 'Grand Prix', status: 'pending', buy_in: 200 };
  const registration   = { player_id: 'player-1', buy_in_amount: 200 };

  test('returns 200 { unregistered, refunded } when successful', async () => {
    mockCurrentUser = { stableId: 'player-1', id: 'player-1', role: 'coached_student' };
    TournamentGroupRepository.getGroup.mockResolvedValue(pendingGroup);
    TournamentGroupRepository.getRegistration.mockResolvedValue(registration);

    const res = await request(app).delete('/api/tournament-groups/grp-1/register');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ unregistered: true, refunded: 200 });
  });

  test('calls ChipBankRepository refund BEFORE cancelRegistration', async () => {
    mockCurrentUser = { stableId: 'player-1', id: 'player-1', role: 'coached_student' };
    TournamentGroupRepository.getGroup.mockResolvedValue(pendingGroup);
    TournamentGroupRepository.getRegistration.mockResolvedValue(registration);

    const callOrder = [];
    ChipBankRepository.applyTransaction.mockImplementation(() => {
      callOrder.push('refund');
      return Promise.resolve();
    });
    TournamentGroupRepository.cancelRegistration.mockImplementation(() => {
      callOrder.push('cancel');
      return Promise.resolve();
    });

    await request(app).delete('/api/tournament-groups/grp-1/register');
    expect(callOrder).toEqual(['refund', 'cancel']);
  });

  test('calls ChipBankRepository.applyTransaction with correct refund args', async () => {
    mockCurrentUser = { stableId: 'player-1', id: 'player-1', role: 'coached_student' };
    TournamentGroupRepository.getGroup.mockResolvedValue(pendingGroup);
    TournamentGroupRepository.getRegistration.mockResolvedValue(registration);

    await request(app).delete('/api/tournament-groups/grp-1/register');
    expect(ChipBankRepository.applyTransaction).toHaveBeenCalledWith({
      playerId:  'player-1',
      amount:    200,
      type:      'tournament_refund',
      tableId:   null,
      createdBy: null,
      notes:     `Tournament refund: ${pendingGroup.name}`,
    });
  });

  test('skips refund when buy_in_amount is 0', async () => {
    mockCurrentUser = { stableId: 'player-1', id: 'player-1', role: 'coached_student' };
    TournamentGroupRepository.getGroup.mockResolvedValue(pendingGroup);
    TournamentGroupRepository.getRegistration.mockResolvedValue({ ...registration, buy_in_amount: 0 });

    const res = await request(app).delete('/api/tournament-groups/grp-1/register');
    expect(res.status).toBe(200);
    expect(ChipBankRepository.applyTransaction).not.toHaveBeenCalled();
  });

  test('returns 400 when group.status is not pending', async () => {
    mockCurrentUser = { stableId: 'player-1', id: 'player-1', role: 'coached_student' };
    TournamentGroupRepository.getGroup.mockResolvedValue({ ...pendingGroup, status: 'running' });
    TournamentGroupRepository.getRegistration.mockResolvedValue(registration);

    const res = await request(app).delete('/api/tournament-groups/grp-1/register');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cannot unregister/i);
  });

  test('returns 404 when not registered', async () => {
    mockCurrentUser = { stableId: 'player-1', id: 'player-1', role: 'coached_student' };
    TournamentGroupRepository.getGroup.mockResolvedValue(pendingGroup);
    TournamentGroupRepository.getRegistration.mockResolvedValue(null);

    const res = await request(app).delete('/api/tournament-groups/grp-1/register');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not registered/i);
  });

  test('returns 401 when unauthenticated', async () => {
    const res = await request(app).delete('/api/tournament-groups/grp-1/register');
    expect(res.status).toBe(401);
  });
});

// ─── PATCH /api/tournament-groups/:id/start ──────────────────────────────────

describe('PATCH /api/tournament-groups/:id/start', () => {
  const pendingGroup = {
    id: 'grp-1',
    name: 'Grand Prix',
    status: 'pending',
    shared_config: { blind_schedule: [], starting_stack: 10000 },
    late_reg_enabled: false,
    late_reg_minutes: 0,
    payout_structure: [],
  };

  const twoPlayers = [
    { player_id: 'p-1', player_profiles: { display_name: 'Alice' } },
    { player_id: 'p-2', player_profiles: { display_name: 'Bob' } },
  ];

  test('returns 200 { started, tableIds } when successful', async () => {
    mockCurrentUser = { stableId: 'coach-1', id: 'coach-1', role: 'admin' };
    TournamentGroupRepository.getGroup.mockResolvedValue(pendingGroup);
    TournamentGroupRepository.getRegistrations.mockResolvedValue(twoPlayers);

    // TournamentGroupController mock returns ['tbl-1', 'tbl-2'] from assignPlayersToTables
    const res = await request(app).patch('/api/tournament-groups/grp-1/start');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ started: true, tableIds: expect.any(Array) });
  });

  test('stores new controller in SharedState.groupControllers', async () => {
    mockCurrentUser = { stableId: 'coach-1', id: 'coach-1', role: 'admin' };
    TournamentGroupRepository.getGroup.mockResolvedValue(pendingGroup);
    TournamentGroupRepository.getRegistrations.mockResolvedValue(twoPlayers);

    await request(app).patch('/api/tournament-groups/grp-1/start');
    expect(SharedState.groupControllers.has('grp-1')).toBe(true);
  });

  test('returns 400 when fewer than 2 registrations', async () => {
    mockCurrentUser = { stableId: 'coach-1', id: 'coach-1', role: 'admin' };
    TournamentGroupRepository.getGroup.mockResolvedValue(pendingGroup);
    TournamentGroupRepository.getRegistrations.mockResolvedValue([twoPlayers[0]]);

    const res = await request(app).patch('/api/tournament-groups/grp-1/start');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at least 2/i);
  });

  test('returns 400 when group.status is not pending', async () => {
    mockCurrentUser = { stableId: 'coach-1', id: 'coach-1', role: 'admin' };
    TournamentGroupRepository.getGroup.mockResolvedValue({ ...pendingGroup, status: 'running' });
    TournamentGroupRepository.getRegistrations.mockResolvedValue(twoPlayers);

    const res = await request(app).patch('/api/tournament-groups/grp-1/start');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not pending/i);
  });

  test('returns 404 when group not found', async () => {
    mockCurrentUser = { stableId: 'coach-1', id: 'coach-1', role: 'admin' };
    TournamentGroupRepository.getGroup.mockResolvedValue(null);

    const res = await request(app).patch('/api/tournament-groups/grp-1/start');
    expect(res.status).toBe(404);
  });

  test('returns 401 when unauthenticated', async () => {
    const res = await request(app).patch('/api/tournament-groups/grp-1/start');
    expect(res.status).toBe(401);
  });

  test('updates all registrations to seated status', async () => {
    mockCurrentUser = { stableId: 'coach-1', id: 'coach-1', role: 'admin' };
    TournamentGroupRepository.getGroup.mockResolvedValue(pendingGroup);
    TournamentGroupRepository.getRegistrations.mockResolvedValue(twoPlayers);

    await request(app).patch('/api/tournament-groups/grp-1/start');
    expect(TournamentGroupRepository.updateRegistrationStatus).toHaveBeenCalledTimes(2);
    expect(TournamentGroupRepository.updateRegistrationStatus).toHaveBeenCalledWith('grp-1', 'p-1', 'seated');
    expect(TournamentGroupRepository.updateRegistrationStatus).toHaveBeenCalledWith('grp-1', 'p-2', 'seated');
  });
});

// ─── PATCH /api/tournament-groups/:id/cancel ─────────────────────────────────

describe('PATCH /api/tournament-groups/:id/cancel', () => {
  const pendingGroup = { id: 'grp-1', name: 'Grand Prix', status: 'pending' };

  const registrations = [
    { player_id: 'p-1', status: 'registered',  buy_in_amount: 200 },
    { player_id: 'p-2', status: 'seated',       buy_in_amount: 200 },
    { player_id: 'p-3', status: 'cancelled',    buy_in_amount: 200 }, // should be skipped
    { player_id: 'p-4', status: 'registered',   buy_in_amount: 0 },   // no refund needed
  ];

  test('returns 200 { cancelled, refundedCount, failedRefunds } when successful', async () => {
    mockCurrentUser = { stableId: 'coach-1', id: 'coach-1', role: 'admin' };
    TournamentGroupRepository.getGroup.mockResolvedValue(pendingGroup);
    TournamentGroupRepository.getRegistrations.mockResolvedValue(registrations);

    const res = await request(app).patch('/api/tournament-groups/grp-1/cancel');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      cancelled:     true,
      refundedCount: registrations.length,
      failedRefunds: [],
    });
  });

  test('calls ChipBankRepository.applyTransaction for each registered/seated player with buy_in > 0', async () => {
    mockCurrentUser = { stableId: 'coach-1', id: 'coach-1', role: 'admin' };
    TournamentGroupRepository.getGroup.mockResolvedValue(pendingGroup);
    TournamentGroupRepository.getRegistrations.mockResolvedValue(registrations);

    await request(app).patch('/api/tournament-groups/grp-1/cancel');

    // p-1 (registered, 200) and p-2 (seated, 200) get refunds; p-3 (cancelled) and p-4 (0) don't
    expect(ChipBankRepository.applyTransaction).toHaveBeenCalledTimes(2);
    expect(ChipBankRepository.applyTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ playerId: 'p-1', amount: 200, type: 'tournament_refund' })
    );
    expect(ChipBankRepository.applyTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ playerId: 'p-2', amount: 200, type: 'tournament_refund' })
    );
  });

  test('sets group status to cancelled (not finished)', async () => {
    mockCurrentUser = { stableId: 'coach-1', id: 'coach-1', role: 'admin' };
    TournamentGroupRepository.getGroup.mockResolvedValue(pendingGroup);
    TournamentGroupRepository.getRegistrations.mockResolvedValue([]);

    await request(app).patch('/api/tournament-groups/grp-1/cancel');
    expect(TournamentGroupRepository.updateStatus).toHaveBeenCalledWith('grp-1', 'cancelled');
    expect(TournamentGroupRepository.updateStatus).not.toHaveBeenCalledWith('grp-1', 'finished');
  });

  test('can cancel a running tournament', async () => {
    mockCurrentUser = { stableId: 'coach-1', id: 'coach-1', role: 'admin' };
    TournamentGroupRepository.getGroup.mockResolvedValue({ ...pendingGroup, status: 'running' });
    TournamentGroupRepository.getRegistrations.mockResolvedValue([]);

    const res = await request(app).patch('/api/tournament-groups/grp-1/cancel');
    expect(res.status).toBe(200);
  });

  test('returns 400 when group is already cancelled/finished', async () => {
    mockCurrentUser = { stableId: 'coach-1', id: 'coach-1', role: 'admin' };
    TournamentGroupRepository.getGroup.mockResolvedValue({ ...pendingGroup, status: 'cancelled' });

    const res = await request(app).patch('/api/tournament-groups/grp-1/cancel');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cannot be cancelled/i);
  });

  test('continues processing other refunds when one fails; records failedRefund', async () => {
    mockCurrentUser = { stableId: 'coach-1', id: 'coach-1', role: 'admin' };
    TournamentGroupRepository.getGroup.mockResolvedValue(pendingGroup);
    TournamentGroupRepository.getRegistrations.mockResolvedValue([
      { player_id: 'p-1', status: 'registered', buy_in_amount: 200 },
      { player_id: 'p-2', status: 'registered', buy_in_amount: 200 },
    ]);
    // p-1 refund fails, p-2 should still be refunded
    ChipBankRepository.applyTransaction
      .mockRejectedValueOnce(new Error('DB error'))
      .mockResolvedValueOnce(undefined);

    const res = await request(app).patch('/api/tournament-groups/grp-1/cancel');
    expect(res.status).toBe(200);
    expect(res.body.failedRefunds).toEqual(['p-1']);
    expect(ChipBankRepository.applyTransaction).toHaveBeenCalledTimes(2);
  });

  test('destroys and removes group controller when one exists', async () => {
    mockCurrentUser = { stableId: 'coach-1', id: 'coach-1', role: 'admin' };
    TournamentGroupRepository.getGroup.mockResolvedValue(pendingGroup);
    TournamentGroupRepository.getRegistrations.mockResolvedValue([]);

    const mockCtrl = { destroy: jest.fn() };
    SharedState.groupControllers.set('grp-1', mockCtrl);

    await request(app).patch('/api/tournament-groups/grp-1/cancel');
    expect(mockCtrl.destroy).toHaveBeenCalled();
    expect(SharedState.groupControllers.has('grp-1')).toBe(false);
  });

  test('returns 404 when group not found', async () => {
    mockCurrentUser = { stableId: 'coach-1', id: 'coach-1', role: 'admin' };
    TournamentGroupRepository.getGroup.mockResolvedValue(null);

    const res = await request(app).patch('/api/tournament-groups/grp-1/cancel');
    expect(res.status).toBe(404);
  });

  test('returns 401 when unauthenticated', async () => {
    const res = await request(app).patch('/api/tournament-groups/grp-1/cancel');
    expect(res.status).toBe(401);
  });
});
