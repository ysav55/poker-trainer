'use strict';

/**
 * Tables API — integration-style tests using supertest.
 *
 * Mocks:
 *   - TableRepository   — all DB methods stubbed
 *   - requirePermission — replaced with a controllable middleware
 *   - SharedState       — getTableSummaries returns []
 *
 * The route file is required after mocks are hoisted.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../db/supabase', () => ({
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  single: jest.fn().mockResolvedValue({ data: { school_id: 'school-1' }, error: null }),
}));

jest.mock('../../db/repositories/TableRepository', () => ({
  TableRepository: {
    createTable:           jest.fn(),
    getTable:              jest.fn(),
    listTables:            jest.fn(),
    closeTable:            jest.fn(),
    updateTable:           jest.fn(),
    countActiveTablesByUser: jest.fn(),
  },
}));

// requirePermission: expose a controllable middleware
const mockPermMiddleware = jest.fn((req, res, next) => next());
jest.mock('../../auth/requirePermission', () => ({
  requirePermission:          jest.fn(() => mockPermMiddleware),
  getPlayerPermissions:       jest.fn(),
  invalidatePermissionCache:  jest.fn(),
}));

// TableVisibilityService mock
jest.mock('../../services/TableVisibilityService', () => ({
  canPlayerSeeTable:    jest.fn(),
  getVisibleTables:     jest.fn(),
  isPlayerWhitelisted:  jest.fn(),
  addToWhitelist:       jest.fn(),
  removeFromWhitelist:  jest.fn(),
  getWhitelist:         jest.fn(),
  addGroupToWhitelist:  jest.fn(),
}));

// SettingsService mock
jest.mock('../../services/SettingsService', () => ({
  getOrgSetting: jest.fn(),
}));

// SharedState — mock the whole module so getTableSummaries is available
jest.mock('../../state/SharedState', () => {
  const instance = { tables: new Map() };
  instance.getTableSummaries = jest.fn(() => []);
  return Object.assign(instance, { getTableSummaries: instance.getTableSummaries });
});

// ─── App setup ────────────────────────────────────────────────────────────────

const express    = require('express');
const request    = require('supertest');
const { TableRepository } = require('../../db/repositories/TableRepository');
const { getPlayerPermissions } = require('../../auth/requirePermission');
const TableVisibilityService = require('../../services/TableVisibilityService');
const SettingsService = require('../../services/SettingsService');
const sharedState = require('../../state/SharedState');

/**
 * Build a minimal Express app for a given user identity.
 * requireAuth is injected manually to avoid loading the full server.
 */
function buildApp({ user = null } = {}) {
  const app = express();
  app.use(express.json());

  // Fake requireAuth: sets req.user or returns 401
  const requireAuth = (req, res, next) => {
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    req.user = user;
    return next();
  };

  const registerTableRoutes = require('../../routes/tables');
  registerTableRoutes(app, { requireAuth });

  return app;
}

beforeEach(() => {
  jest.clearAllMocks();

  // Reset all mocks to clean state
  TableRepository.listTables.mockReset();
  TableRepository.getTable.mockReset();
  TableRepository.createTable.mockReset();
  TableRepository.updateTable.mockReset();
  TableRepository.closeTable.mockReset();
  TableRepository.countActiveTablesByUser.mockReset();

  // Default: permission check passes
  mockPermMiddleware.mockImplementation((req, res, next) => next());
  // Default: no live summaries
  sharedState.getTableSummaries.mockReturnValue([]);
  // Default: listTables returns []
  TableRepository.listTables.mockResolvedValue([]);
  // Default: getTable returns null
  TableRepository.getTable.mockResolvedValue(null);
  // Default: mutations succeed
  TableRepository.createTable.mockResolvedValue(undefined);
  TableRepository.updateTable.mockResolvedValue(undefined);
  TableRepository.closeTable.mockResolvedValue(undefined);
  // Default: user has 0 active tables (under limit)
  TableRepository.countActiveTablesByUser.mockResolvedValue(0);
  // Default: getPlayerPermissions returns empty set
  getPlayerPermissions.mockResolvedValue(new Set());
  // Default: visibility service — allow all visibility checks
  TableVisibilityService.canPlayerSeeTable.mockResolvedValue(true);
  TableVisibilityService.getVisibleTables.mockResolvedValue([]);
  TableVisibilityService.isPlayerWhitelisted.mockResolvedValue(false);
  TableVisibilityService.addToWhitelist.mockResolvedValue(undefined);
  TableVisibilityService.removeFromWhitelist.mockResolvedValue(undefined);
  TableVisibilityService.getWhitelist.mockResolvedValue([]);
  TableVisibilityService.addGroupToWhitelist.mockResolvedValue({ added: 0, skipped: 0 });
  // Default: SettingsService returns no org limits (fallback to 4)
  SettingsService.getOrgSetting.mockResolvedValue(null);
});

// ─── GET /api/tables ──────────────────────────────────────────────────────────

describe('GET /api/tables', () => {
  test('returns 401 without auth', async () => {
    const app = buildApp({ user: null });
    const res = await request(app).get('/api/tables');
    expect(res.status).toBe(401);
  });

  test('returns 200 with empty tables array when DB returns nothing', async () => {
    const app = buildApp({ user: { id: 'player-uuid' } });
    const res = await request(app).get('/api/tables');
    expect(res.status).toBe(200);
    expect(res.body.tables).toEqual([]);
  });

  test('returns merged DB + live data', async () => {
    const dbTables = [
      { id: 'tbl-1', name: 'Table 1', status: 'waiting' },
      { id: 'tbl-2', name: 'Table 2', status: 'active' },
    ];
    const liveSummaries = [
      { id: 'tbl-1', playerCount: 3, street: 'flop', phase: 'active' },
    ];
    TableRepository.listTables.mockResolvedValueOnce(dbTables);
    sharedState.getTableSummaries.mockReturnValueOnce(liveSummaries);

    const app = buildApp({ user: { id: 'player-uuid' } });
    const res = await request(app).get('/api/tables');

    expect(res.status).toBe(200);
    const { tables } = res.body;
    expect(tables).toHaveLength(2);

    const t1 = tables.find(t => t.id === 'tbl-1');
    expect(t1.live).toMatchObject({ playerCount: 3, street: 'flop' });

    const t2 = tables.find(t => t.id === 'tbl-2');
    expect(t2.live).toBeNull();
  });

  test('returns 500 when listTables throws', async () => {
    TableRepository.listTables.mockRejectedValueOnce(new Error('DB down'));
    const app = buildApp({ user: { id: 'player-uuid' } });
    const res = await request(app).get('/api/tables');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('internal_error');
  });
});

// ─── POST /api/tables ─────────────────────────────────────────────────────────

describe('POST /api/tables', () => {
  test('returns 401 without auth', async () => {
    const app = buildApp({ user: null });
    const res = await request(app).post('/api/tables').send({ name: 'New Table' });
    expect(res.status).toBe(401);
  });

  test('returns 403 without table:create permission', async () => {
    mockPermMiddleware.mockImplementationOnce((req, res) =>
      res.status(403).json({ error: 'Insufficient permissions' })
    );
    const app = buildApp({ user: { id: 'player-uuid', role: 'player' } });
    const res = await request(app).post('/api/tables').send({ name: 'New Table' });
    expect(res.status).toBe(403);
  });

  test('returns 400 when name is missing', async () => {
    const app = buildApp({ user: { id: 'coach-uuid' } });
    const res = await request(app).post('/api/tables').send({ mode: 'coached_cash' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name/);
  });

  test('returns 201 with the created table id when authorized', async () => {
    const fakeTable = { id: expect.stringContaining('table-'), name: 'New Table', status: 'waiting' };
    TableRepository.getTable.mockResolvedValueOnce(fakeTable);

    const app = buildApp({ user: { id: 'coach-uuid' } });
    const res = await request(app)
      .post('/api/tables')
      .send({ name: 'New Table', mode: 'coached_cash' });

    expect(res.status).toBe(201);
    expect(TableRepository.createTable).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'New Table',
        mode: 'coached_cash',
        createdBy: 'coach-uuid',
      })
    );
  });

  test('generates a unique id prefixed with "table-"', async () => {
    TableRepository.getTable.mockResolvedValueOnce({ id: 'table-123', name: 'X' });
    const app = buildApp({ user: { id: 'coach-uuid' } });
    await request(app).post('/api/tables').send({ name: 'X' });

    const createArg = TableRepository.createTable.mock.calls[0][0];
    expect(createArg.id).toMatch(/^table-\d+$/);
  });

  test('returns 500 when createTable throws', async () => {
    TableRepository.createTable.mockRejectedValueOnce(new Error('insert failed'));
    const app = buildApp({ user: { id: 'coach-uuid' } });
    const res = await request(app).post('/api/tables').send({ name: 'Fail Table' });
    expect(res.status).toBe(500);
  });
});

// ─── PATCH /api/tables/:id ────────────────────────────────────────────────────

describe('PATCH /api/tables/:id', () => {
  const ownerId = 'owner-uuid';
  const adminId = 'admin-uuid';
  const otherId = 'other-uuid';
  const tableId = 'tbl-99';
  const existingTable = { id: tableId, name: 'Old Name', created_by: ownerId, status: 'waiting' };
  const updatedTable  = { id: tableId, name: 'New Name', created_by: ownerId, status: 'waiting' };

  test('returns 403 when requester is not owner and not admin', async () => {
    TableRepository.getTable.mockResolvedValueOnce(existingTable);
    getPlayerPermissions.mockResolvedValueOnce(new Set()); // no admin:access

    const app = buildApp({ user: { id: otherId } });
    const res = await request(app)
      .patch(`/api/tables/${tableId}`)
      .send({ name: 'Hack' });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not your table/i);
  });

  test('returns 200 when requester is the owner', async () => {
    // First call is assertCanManage → getTable, second call is fetch after update
    TableRepository.getTable
      .mockResolvedValueOnce(existingTable)
      .mockResolvedValueOnce(updatedTable);
    getPlayerPermissions.mockResolvedValueOnce(new Set()); // owner — no extra perms needed

    const app = buildApp({ user: { id: ownerId } });
    const res = await request(app)
      .patch(`/api/tables/${tableId}`)
      .send({ name: 'New Name' });

    expect(res.status).toBe(200);
    expect(TableRepository.updateTable).toHaveBeenCalledWith(tableId, expect.objectContaining({ name: 'New Name' }));
  });

  test('returns 200 when requester is admin (has admin:access)', async () => {
    TableRepository.getTable
      .mockResolvedValueOnce(existingTable)
      .mockResolvedValueOnce(updatedTable);
    getPlayerPermissions.mockResolvedValueOnce(new Set(['admin:access']));

    const app = buildApp({ user: { id: adminId } });
    const res = await request(app)
      .patch(`/api/tables/${tableId}`)
      .send({ name: 'Admin Rename' });

    expect(res.status).toBe(200);
  });

  test('returns 404 when table does not exist', async () => {
    TableRepository.getTable.mockResolvedValueOnce(null);

    const app = buildApp({ user: { id: ownerId } });
    const res = await request(app)
      .patch(`/api/tables/${tableId}`)
      .send({ name: 'Ghost' });

    expect(res.status).toBe(404);
  });

  test('returns 401 without auth', async () => {
    const app = buildApp({ user: null });
    const res = await request(app).patch(`/api/tables/${tableId}`).send({ name: 'X' });
    expect(res.status).toBe(401);
  });
});

// ─── DELETE /api/tables/:id ───────────────────────────────────────────────────

describe('DELETE /api/tables/:id', () => {
  const ownerId = 'owner-uuid';
  const adminId = 'admin-uuid';
  const otherId = 'other-uuid';
  const tableId = 'tbl-del';
  const existingTable = { id: tableId, name: 'To Delete', created_by: ownerId, status: 'waiting' };

  test('returns 403 when requester is not owner or admin', async () => {
    TableRepository.getTable.mockResolvedValueOnce(existingTable);
    getPlayerPermissions.mockResolvedValueOnce(new Set());

    const app = buildApp({ user: { id: otherId } });
    const res = await request(app).delete(`/api/tables/${tableId}`);

    expect(res.status).toBe(403);
  });

  test('returns 204 when requester is the owner', async () => {
    TableRepository.getTable.mockResolvedValueOnce(existingTable);
    getPlayerPermissions.mockResolvedValueOnce(new Set());

    const app = buildApp({ user: { id: ownerId } });
    const res = await request(app).delete(`/api/tables/${tableId}`);

    expect(res.status).toBe(204);
    expect(TableRepository.closeTable).toHaveBeenCalledWith(tableId);
  });

  test('returns 204 when requester is admin', async () => {
    TableRepository.getTable.mockResolvedValueOnce(existingTable);
    getPlayerPermissions.mockResolvedValueOnce(new Set(['admin:access']));

    const app = buildApp({ user: { id: adminId } });
    const res = await request(app).delete(`/api/tables/${tableId}`);

    expect(res.status).toBe(204);
    expect(TableRepository.closeTable).toHaveBeenCalledWith(tableId);
  });

  test('returns 404 when table does not exist', async () => {
    TableRepository.getTable.mockResolvedValueOnce(null);

    const app = buildApp({ user: { id: ownerId } });
    const res = await request(app).delete(`/api/tables/${tableId}`);

    expect(res.status).toBe(404);
  });

  test('returns 401 without auth', async () => {
    const app = buildApp({ user: null });
    const res = await request(app).delete(`/api/tables/${tableId}`);
    expect(res.status).toBe(401);
  });
});

// ─── GET /api/tables — additional coverage ────────────────────────────────────

describe('GET /api/tables — additional coverage', () => {
  test('returns the list from TableRepository merged with empty live data', async () => {
    const dbTables = [{ id: 'tbl-a', name: 'Alpha', status: 'waiting' }];
    TableRepository.listTables.mockResolvedValueOnce(dbTables);
    sharedState.getTableSummaries.mockReturnValueOnce([]);

    const app = buildApp({ user: { id: 'player-uuid' } });
    const res = await request(app).get('/api/tables');

    expect(res.status).toBe(200);
    expect(res.body.tables).toHaveLength(1);
    expect(res.body.tables[0].id).toBe('tbl-a');
    expect(res.body.tables[0].live).toBeNull();
  });
});

// ─── POST /api/tables — additional coverage ───────────────────────────────────

describe('POST /api/tables — additional coverage', () => {
  test('requires table:create permission and creates table returning 201', async () => {
    // Default: mockPermMiddleware passes
    const fakeTable = { id: 'table-999', name: 'Created Table', status: 'waiting' };
    TableRepository.getTable.mockResolvedValueOnce(fakeTable);

    const app = buildApp({ user: { id: 'coach-uuid' } });
    const res = await request(app)
      .post('/api/tables')
      .send({ name: 'Created Table', mode: 'coached_cash' });

    expect(res.status).toBe(201);
    expect(TableRepository.createTable).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Created Table', createdBy: 'coach-uuid' })
    );
  });

  test('returns 403 for player without table:create permission', async () => {
    mockPermMiddleware.mockImplementationOnce((req, res) =>
      res.status(403).json({ error: 'Insufficient permissions' })
    );
    const app = buildApp({ user: { id: 'player-uuid', role: 'player' } });
    const res = await request(app)
      .post('/api/tables')
      .send({ name: 'Blocked Table' });

    expect(res.status).toBe(403);
    expect(TableRepository.createTable).not.toHaveBeenCalled();
  });
});

// ─── DELETE /api/tables/:id — permission check ────────────────────────────────

describe('DELETE /api/tables/:id — permission guard', () => {
  test('returns 403 for a player without table:manage permission when not the owner', async () => {
    const tableId = 'tbl-guard';
    const existingTable = { id: tableId, name: 'Guard Table', created_by: 'real-owner', status: 'waiting' };

    TableRepository.getTable.mockResolvedValueOnce(existingTable);
    getPlayerPermissions.mockResolvedValueOnce(new Set()); // no admin:access

    const app = buildApp({ user: { id: 'other-player' } });
    const res = await request(app).delete(`/api/tables/${tableId}`);

    expect(res.status).toBe(403);
    expect(TableRepository.closeTable).not.toHaveBeenCalled();
  });

  test('returns 200-series for owner (204 no-content)', async () => {
    const tableId = 'tbl-owner-del';
    const ownerId = 'exact-owner-uuid';
    const existingTable = { id: tableId, name: 'Mine', created_by: ownerId, status: 'waiting' };

    TableRepository.getTable.mockResolvedValueOnce(existingTable);
    getPlayerPermissions.mockResolvedValueOnce(new Set());

    const app = buildApp({ user: { id: ownerId } });
    const res = await request(app).delete(`/api/tables/${tableId}`);

    expect(res.status).toBe(204);
  });
});

// ─── PATCH /api/tables/:id — additional coverage ──────────────────────────────

describe('PATCH /api/tables/:id — additional coverage', () => {
  test('updates table and returns 200', async () => {
    const tableId   = 'tbl-patch';
    const ownerId   = 'patch-owner';
    const existing  = { id: tableId, name: 'Old', created_by: ownerId, status: 'waiting' };
    const updated   = { id: tableId, name: 'Updated', created_by: ownerId, status: 'waiting' };

    TableRepository.getTable
      .mockResolvedValueOnce(existing)  // assertCanManage fetch
      .mockResolvedValueOnce(updated);  // after-update fetch
    getPlayerPermissions.mockResolvedValueOnce(new Set());

    const app = buildApp({ user: { id: ownerId } });
    const res = await request(app)
      .patch(`/api/tables/${tableId}`)
      .send({ name: 'Updated' });

    expect(res.status).toBe(200);
    expect(TableRepository.updateTable).toHaveBeenCalledWith(
      tableId,
      expect.objectContaining({ name: 'Updated' })
    );
  });

  test('returns 500 when updateTable throws', async () => {
    const tableId  = 'tbl-err-patch';
    const ownerId  = 'patch-err-owner';
    const existing = { id: tableId, name: 'Err', created_by: ownerId, status: 'waiting' };

    TableRepository.getTable.mockResolvedValueOnce(existing);
    getPlayerPermissions.mockResolvedValueOnce(new Set());
    TableRepository.updateTable.mockRejectedValueOnce(new Error('update failed'));

    const app = buildApp({ user: { id: ownerId } });
    const res = await request(app)
      .patch(`/api/tables/${tableId}`)
      .send({ name: 'Failing' });

    expect(res.status).toBe(500);
  });
});

// ─── POST /api/tables — max_tables_per_student enforcement ──────────────────────

describe('POST /api/tables — max_tables_per_student enforcement', () => {
  test('returns 403 when user exceeds max_tables_per_student limit', async () => {
    // Mock SettingsService to return limit of 1
    SettingsService.getOrgSetting.mockResolvedValueOnce({
      max_tables_per_student: 1,
    });

    // Mock TableRepository to show user already has 1 active table
    TableRepository.countActiveTablesByUser.mockResolvedValueOnce(1);

    const app = buildApp({ user: { id: 'user-123' } });
    const res = await request(app)
      .post('/api/tables')
      .send({
        name: 'Exceed Limit Table',
        mode: 'uncoached_cash',
        config: {},
      });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'table_limit_reached' });
    expect(TableRepository.createTable).not.toHaveBeenCalled();
  });

  test('allows table creation when under limit', async () => {
    // Mock SettingsService to return limit of 4
    SettingsService.getOrgSetting.mockResolvedValueOnce({
      max_tables_per_student: 4,
    });

    // Mock TableRepository to show user has 2 active tables
    TableRepository.countActiveTablesByUser.mockResolvedValueOnce(2);

    // Mock successful table creation
    const fakeTable = { id: 'table-1', name: 'Under Limit Table', status: 'waiting' };
    TableRepository.getTable.mockResolvedValueOnce(fakeTable);

    const app = buildApp({ user: { id: 'user-456' } });
    const res = await request(app)
      .post('/api/tables')
      .send({
        name: 'Under Limit Table',
        mode: 'uncoached_cash',
        config: {},
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(TableRepository.createTable).toHaveBeenCalled();
  });

  test('uses fallback limit of 4 if org settings not set', async () => {
    // Mock SettingsService to return null (no setting)
    SettingsService.getOrgSetting.mockResolvedValueOnce(null);

    // Mock TableRepository to show user already has 4 active tables (at fallback limit)
    TableRepository.countActiveTablesByUser.mockResolvedValueOnce(4);

    const app = buildApp({ user: { id: 'user-789' } });
    const res = await request(app)
      .post('/api/tables')
      .send({
        name: 'Fallback Limit Table',
        mode: 'uncoached_cash',
        config: {},
      });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'table_limit_reached' });
    expect(TableRepository.createTable).not.toHaveBeenCalled();
  });

  test('allows table creation when at limit boundary (one under max)', async () => {
    // Mock SettingsService to return limit of 3
    SettingsService.getOrgSetting.mockResolvedValueOnce({
      max_tables_per_student: 3,
    });

    // Mock TableRepository to show user has 2 active tables (one under limit)
    TableRepository.countActiveTablesByUser.mockResolvedValueOnce(2);

    const fakeTable = { id: 'table-2', name: 'Boundary Table', status: 'waiting' };
    TableRepository.getTable.mockResolvedValueOnce(fakeTable);

    const app = buildApp({ user: { id: 'user-boundary' } });
    const res = await request(app)
      .post('/api/tables')
      .send({
        name: 'Boundary Table',
        mode: 'uncoached_cash',
        config: {},
      });

    expect(res.status).toBe(201);
    expect(TableRepository.createTable).toHaveBeenCalled();
  });
});
