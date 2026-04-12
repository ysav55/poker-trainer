'use strict';

/**
 * API Integrity Tests
 *
 * Validates fixes from the integration integrity audit:
 *   Issue 1 — Stats empty state: GET /api/players/:id/stats returns 200 with
 *              zero-state shape when getPlayerStatsByMode returns null.
 *   Issue 2 — Tables endpoint auth: GET /api/tables requires authentication.
 *
 * Follows the same pattern as tables.test.js:
 *   - jest.mock() for all DB/state dependencies
 *   - buildApp({ user }) for a minimal Express app with injected requireAuth
 *   - supertest for HTTP assertions
 */

// ─── Mocks (hoisted before any require) ──────────────────────────────────────

// Tables route dependencies
jest.mock('../../db/repositories/TableRepository', () => ({
  TableRepository: {
    createTable: jest.fn(),
    getTable:    jest.fn(),
    listTables:  jest.fn(),
    closeTable:  jest.fn(),
    updateTable: jest.fn(),
  },
}));

jest.mock('../../auth/requirePermission', () => ({
  requirePermission:         jest.fn(() => (req, res, next) => next()),
  getPlayerPermissions:      jest.fn(),
  invalidatePermissionCache: jest.fn(),
}));

jest.mock('../../state/SharedState', () => {
  const instance = { tables: new Map() };
  instance.getTableSummaries = jest.fn(() => []);
  return Object.assign(instance, { getTableSummaries: instance.getTableSummaries });
});

// ─── Shared setup ─────────────────────────────────────────────────────────────

const express   = require('express');
const request   = require('supertest');
const { TableRepository }     = require('../../db/repositories/TableRepository');
const { getPlayerPermissions } = require('../../auth/requirePermission');
const sharedState              = require('../../state/SharedState');

beforeEach(() => {
  jest.clearAllMocks();
  sharedState.getTableSummaries.mockReturnValue([]);
  TableRepository.listTables.mockResolvedValue([]);
  TableRepository.getTable.mockResolvedValue(null);
  TableRepository.createTable.mockResolvedValue(undefined);
  TableRepository.updateTable.mockResolvedValue(undefined);
  TableRepository.closeTable.mockResolvedValue(undefined);
  getPlayerPermissions.mockResolvedValue(new Set());
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a minimal Express app for the players route.
 * HandLogger is injected so getPlayerStatsByMode can be mocked per-test.
 */
function buildPlayersApp({ user = null, HandLogger = {} } = {}) {
  const app = express();
  app.use(express.json());

  const requireAuth = (req, res, next) => {
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    req.user = user;
    return next();
  };

  const registerPlayerRoutes = require('../../routes/players');
  registerPlayerRoutes(app, { requireAuth, HandLogger });

  return app;
}

/**
 * Build a minimal Express app for the tables route.
 */
function buildTablesApp({ user = null } = {}) {
  const app = express();
  app.use(express.json());

  const requireAuth = (req, res, next) => {
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    req.user = user;
    return next();
  };

  const registerTableRoutes = require('../../routes/tables');
  registerTableRoutes(app, { requireAuth });

  return app;
}

// ─── Test Group 1: Stats empty state (Issue 1) ───────────────────────────────

describe('GET /api/players/:id/stats — empty state (Issue 1)', () => {
  const playerId = 'player-uuid-001';
  const authUser = { id: 'coach-uuid', trialStatus: null };

  test('returns 200 with zero-state shape when getPlayerStatsByMode returns null', async () => {
    const HandLogger = {
      getPlayerStatsByMode: jest.fn().mockResolvedValue(null),
    };
    const app = buildPlayersApp({ user: authUser, HandLogger });

    const res = await request(app).get(`/api/players/${playerId}/stats`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      hands_played:    0,
      hands_won:       0,
      net_chips:       0,
      vpip:            0,
      pfr:             0,
      wtsd:            0,
      wsd:             0,
      rank:            null,
      total_players:   null,
      trial_days_left: null,
      hands_left:      null,
    });
  });

  test('passes trialStatus from req.user when stats are null', async () => {
    const userWithTrial = { id: 'trial-user', trialStatus: { active: true, daysLeft: 5 } };
    const HandLogger = {
      getPlayerStatsByMode: jest.fn().mockResolvedValue(null),
    };
    const app = buildPlayersApp({ user: userWithTrial, HandLogger });

    const res = await request(app).get(`/api/players/${playerId}/stats`);

    expect(res.status).toBe(200);
    expect(res.body.trial_status).toEqual({ active: true, daysLeft: 5 });
  });

  test('returns 401 without auth', async () => {
    const HandLogger = { getPlayerStatsByMode: jest.fn() };
    const app = buildPlayersApp({ user: null, HandLogger });

    const res = await request(app).get(`/api/players/${playerId}/stats`);

    expect(res.status).toBe(401);
    expect(HandLogger.getPlayerStatsByMode).not.toHaveBeenCalled();
  });

  test('returns actual stats when getPlayerStatsByMode returns data', async () => {
    const fakeStats = {
      hands_played: 42,
      hands_won:    18,
      net_chips:    500,
      vpip:         0.35,
      pfr:          0.22,
      wtsd:         0.28,
      wsd:          0.55,
      rank:         3,
      total_players: 20,
      trial_days_left: null,
      hands_left:   null,
      trial_status: null,
    };
    const HandLogger = {
      getPlayerStatsByMode: jest.fn().mockResolvedValue(fakeStats),
    };
    const app = buildPlayersApp({ user: authUser, HandLogger });

    const res = await request(app).get(`/api/players/${playerId}/stats`);

    expect(res.status).toBe(200);
    expect(res.body.hands_played).toBe(42);
    expect(res.body.rank).toBe(3);
  });

  test('defaults to overall mode when no mode query param provided', async () => {
    const HandLogger = {
      getPlayerStatsByMode: jest.fn().mockResolvedValue(null),
    };
    const app = buildPlayersApp({ user: authUser, HandLogger });

    await request(app).get(`/api/players/${playerId}/stats`);

    expect(HandLogger.getPlayerStatsByMode).toHaveBeenCalledWith(playerId, 'overall');
  });

  test('passes valid mode query param to HandLogger', async () => {
    const HandLogger = {
      getPlayerStatsByMode: jest.fn().mockResolvedValue(null),
    };
    const app = buildPlayersApp({ user: authUser, HandLogger });

    await request(app).get(`/api/players/${playerId}/stats?mode=bot`);

    expect(HandLogger.getPlayerStatsByMode).toHaveBeenCalledWith(playerId, 'bot');
  });

  test('falls back to overall mode for invalid mode values', async () => {
    const HandLogger = {
      getPlayerStatsByMode: jest.fn().mockResolvedValue(null),
    };
    const app = buildPlayersApp({ user: authUser, HandLogger });

    await request(app).get(`/api/players/${playerId}/stats?mode=invalid`);

    expect(HandLogger.getPlayerStatsByMode).toHaveBeenCalledWith(playerId, 'overall');
  });

  test('returns 500 when getPlayerStatsByMode throws', async () => {
    const HandLogger = {
      getPlayerStatsByMode: jest.fn().mockRejectedValue(new Error('DB down')),
    };
    const app = buildPlayersApp({ user: authUser, HandLogger });

    const res = await request(app).get(`/api/players/${playerId}/stats`);

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('internal_error');
  });
});

// ─── Test Group 2: Tables endpoint auth (Issue 2) ────────────────────────────

describe('GET /api/tables — authentication guard (Issue 2)', () => {
  test('returns 401 without auth', async () => {
    const app = buildTablesApp({ user: null });

    const res = await request(app).get('/api/tables');

    expect(res.status).toBe(401);
    expect(TableRepository.listTables).not.toHaveBeenCalled();
  });

  test('returns 200 with authenticated user', async () => {
    const app = buildTablesApp({ user: { id: 'player-uuid' } });

    const res = await request(app).get('/api/tables');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('tables');
    expect(Array.isArray(res.body.tables)).toBe(true);
  });

  test('returns empty tables array when DB and live state are both empty', async () => {
    TableRepository.listTables.mockResolvedValueOnce([]);
    sharedState.getTableSummaries.mockReturnValueOnce([]);

    const app = buildTablesApp({ user: { id: 'player-uuid' } });

    const res = await request(app).get('/api/tables');

    expect(res.status).toBe(200);
    expect(res.body.tables).toEqual([]);
  });

  test('returns tables from DB with null live data when no live summaries', async () => {
    const dbTables = [{ id: 'tbl-1', name: 'Alpha', status: 'waiting' }];
    TableRepository.listTables.mockResolvedValueOnce(dbTables);
    sharedState.getTableSummaries.mockReturnValueOnce([]);

    const app = buildTablesApp({ user: { id: 'player-uuid' } });

    const res = await request(app).get('/api/tables');

    expect(res.status).toBe(200);
    expect(res.body.tables).toHaveLength(1);
    expect(res.body.tables[0].id).toBe('tbl-1');
    expect(res.body.tables[0].live).toBeNull();
  });
});
