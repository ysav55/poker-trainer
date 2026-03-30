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

jest.mock('../../db/repositories/TableRepository', () => ({
  TableRepository: {
    createTable:  jest.fn(),
    getTable:     jest.fn(),
    listTables:   jest.fn(),
    closeTable:   jest.fn(),
    updateTable:  jest.fn(),
  },
}));

// requirePermission: expose a controllable middleware
const mockPermMiddleware = jest.fn((req, res, next) => next());
jest.mock('../../auth/requirePermission', () => ({
  requirePermission:          jest.fn(() => mockPermMiddleware),
  getPlayerPermissions:       jest.fn(),
  invalidatePermissionCache:  jest.fn(),
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
  // Default: getPlayerPermissions returns empty set
  getPlayerPermissions.mockResolvedValue(new Set());
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
