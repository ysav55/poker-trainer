'use strict';

/**
 * Tables Privacy Routes — integration tests for PATCH /privacy and whitelist endpoints.
 *
 * Mocks:
 *   - TableRepository   — all DB methods stubbed
 *   - TableVisibilityService — whitelist operations stubbed
 *   - requirePermission — controllable middleware
 *   - SharedState       — getTableSummaries returns []
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

jest.mock('../../services/TableVisibilityService', () => {
  const mockService = {
    canPlayerSeeTable:    jest.fn(),
    getVisibleTables:     jest.fn(),
    isPlayerWhitelisted:  jest.fn(),
    addToWhitelist:       jest.fn(),
    removeFromWhitelist:  jest.fn(),
    getWhitelist:         jest.fn(),
    addGroupToWhitelist:  jest.fn(),
  };
  return mockService;
});

const mockPermMiddleware = jest.fn((req, res, next) => next());
jest.mock('../../auth/requirePermission', () => ({
  requirePermission:          jest.fn(() => mockPermMiddleware),
  getPlayerPermissions:       jest.fn(),
  invalidatePermissionCache:  jest.fn(),
}));

jest.mock('../../state/SharedState', () => {
  const instance = { tables: new Map() };
  instance.getTableSummaries = jest.fn(() => []);
  return Object.assign(instance, { getTableSummaries: instance.getTableSummaries });
});

// ─── App setup ────────────────────────────────────────────────────────────────

const express    = require('express');
const request    = require('supertest');
const { TableRepository } = require('../../db/repositories/TableRepository');
const TableVisibilityService = require('../../services/TableVisibilityService');
const { getPlayerPermissions } = require('../../auth/requirePermission');
const sharedState = require('../../state/SharedState');

function buildApp({ user = null } = {}) {
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

beforeEach(() => {
  // Clear call history but not implementations
  jest.clearAllMocks();
  mockPermMiddleware.mockImplementation((req, res, next) => next());
  sharedState.getTableSummaries.mockReturnValue([]);
  getPlayerPermissions.mockResolvedValue(new Set());

  // Reset repository mocks to clean state
  TableRepository.getTable.mockReset();
  TableRepository.createTable.mockReset();
  TableRepository.updateTable.mockReset();
  TableRepository.closeTable.mockReset();
  TableRepository.listTables.mockReset();

  // Ensure service mocks don't have stale implementations from previous test
  // but allow new mockResolvedValueOnce calls to work
  if (TableVisibilityService.getWhitelist.getMockImplementation) {
    // Just clear, don't set a default - let tests set it up
    TableVisibilityService.getWhitelist.mockReset();
    TableVisibilityService.addToWhitelist.mockReset();
    TableVisibilityService.removeFromWhitelist.mockReset();
    TableVisibilityService.addGroupToWhitelist.mockReset();
  }

  // Set default return values for service methods that now have structured returns
  TableVisibilityService.removeFromWhitelist.mockResolvedValue({ removed: true, count: 1 });
  TableVisibilityService.addToWhitelist.mockResolvedValue(undefined);
});

// ─── PATCH /api/tables/:id/privacy ────────────────────────────────────────────

describe('PATCH /api/tables/:id/privacy', () => {
  const ownerId = 'owner-uuid';
  const otherId = 'other-uuid';
  const tableId = 'tbl-privacy';
  const playerId1 = 'player-1';
  const playerId2 = 'player-2';

  const existingTable = {
    id: tableId,
    name: 'Test Table',
    created_by: ownerId,
    privacy: 'school',
    status: 'waiting',
  };

  test('returns 401 without auth', async () => {
    const app = buildApp({ user: null });
    const res = await request(app)
      .patch(`/api/tables/${tableId}/privacy`)
      .send({ privacy: 'private' });
    expect(res.status).toBe(401);
  });

  test('returns 403 when requester is not owner', async () => {
    TableRepository.getTable.mockResolvedValueOnce(existingTable);
    getPlayerPermissions.mockResolvedValueOnce(new Set());

    const app = buildApp({ user: { id: otherId } });
    const res = await request(app)
      .patch(`/api/tables/${tableId}/privacy`)
      .send({ privacy: 'private', privateConfig: { whitelistedPlayers: [playerId1] } });

    expect(res.status).toBe(403);
    expect(TableRepository.updateTable).not.toHaveBeenCalled();
  });

  test('returns 404 when table does not exist', async () => {
    TableRepository.getTable.mockResolvedValueOnce(null);

    const app = buildApp({ user: { id: ownerId } });
    const res = await request(app)
      .patch(`/api/tables/${tableId}/privacy`)
      .send({ privacy: 'private' });

    expect(res.status).toBe(404);
  });

  test('returns 400 when switching to private with empty whitelist', async () => {
    TableRepository.getTable.mockResolvedValueOnce(existingTable);
    getPlayerPermissions.mockResolvedValueOnce(new Set());

    const app = buildApp({ user: { id: ownerId } });
    const res = await request(app)
      .patch(`/api/tables/${tableId}/privacy`)
      .send({
        privacy: 'private',
        privateConfig: { whitelistedPlayers: [] }
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_private_config');
    expect(TableRepository.updateTable).not.toHaveBeenCalled();
  });

  test('returns 400 when switching to private with no privateConfig', async () => {
    TableRepository.getTable.mockResolvedValueOnce(existingTable);
    getPlayerPermissions.mockResolvedValueOnce(new Set());

    const app = buildApp({ user: { id: ownerId } });
    const res = await request(app)
      .patch(`/api/tables/${tableId}/privacy`)
      .send({ privacy: 'private' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_private_config');
  });

  test('clears old whitelist when switching from private to another privacy level', async () => {
    const privateTable = { ...existingTable, privacy: 'private' };
    TableRepository.getTable.mockResolvedValueOnce(privateTable);
    getPlayerPermissions.mockResolvedValueOnce(new Set());
    TableVisibilityService.getWhitelist.mockResolvedValueOnce([
      { playerId: playerId2, displayName: 'Old Player' }
    ]);
    TableRepository.getTable.mockResolvedValueOnce({
      ...privateTable,
      privacy: 'school'
    });

    const app = buildApp({ user: { id: ownerId } });
    const res = await request(app)
      .patch(`/api/tables/${tableId}/privacy`)
      .send({ privacy: 'school' });

    expect(res.status).toBe(200);
    expect(TableVisibilityService.removeFromWhitelist).toHaveBeenCalledWith(tableId, playerId2);
  });

  test('adds new whitelisted players when switching to private', async () => {
    TableRepository.getTable.mockResolvedValueOnce(existingTable);
    getPlayerPermissions.mockResolvedValueOnce(new Set());
    TableVisibilityService.getWhitelist.mockResolvedValueOnce([]);
    TableRepository.getTable.mockResolvedValueOnce({
      ...existingTable,
      privacy: 'private'
    });

    const app = buildApp({ user: { id: ownerId } });
    const res = await request(app)
      .patch(`/api/tables/${tableId}/privacy`)
      .send({
        privacy: 'private',
        privateConfig: { whitelistedPlayers: [playerId1, playerId2] }
      });

    expect(res.status).toBe(200);
    expect(TableVisibilityService.addToWhitelist).toHaveBeenCalledWith(tableId, playerId1, ownerId);
    expect(TableVisibilityService.addToWhitelist).toHaveBeenCalledWith(tableId, playerId2, ownerId);
  });

  test('calls addGroupToWhitelist when groupId is provided', async () => {
    const groupId = 'group-1';
    TableRepository.getTable.mockResolvedValueOnce(existingTable);
    getPlayerPermissions.mockResolvedValueOnce(new Set());
    TableVisibilityService.getWhitelist.mockResolvedValueOnce([]);
    TableRepository.getTable.mockResolvedValueOnce({
      ...existingTable,
      privacy: 'private'
    });

    const app = buildApp({ user: { id: ownerId } });
    const res = await request(app)
      .patch(`/api/tables/${tableId}/privacy`)
      .send({
        privacy: 'private',
        privateConfig: { whitelistedPlayers: [playerId1], groupId }
      });

    expect(res.status).toBe(200);
    expect(TableVisibilityService.addGroupToWhitelist).toHaveBeenCalledWith(tableId, groupId, ownerId);
  });

  test('updates privacy and returns updated table', async () => {
    const updatedTable = { ...existingTable, privacy: 'private' };
    TableRepository.getTable.mockResolvedValueOnce(existingTable);
    getPlayerPermissions.mockResolvedValueOnce(new Set());
    TableVisibilityService.getWhitelist.mockResolvedValueOnce([]);
    TableRepository.getTable.mockResolvedValueOnce(updatedTable);

    const app = buildApp({ user: { id: ownerId } });
    const res = await request(app)
      .patch(`/api/tables/${tableId}/privacy`)
      .send({
        privacy: 'private',
        privateConfig: { whitelistedPlayers: [playerId1] }
      });

    expect(res.status).toBe(200);
    expect(res.body.privacy).toBe('private');
    expect(TableRepository.updateTable).toHaveBeenCalledWith(tableId, { privacy: 'private' });
  });

  test('allows admin to update privacy even if not owner', async () => {
    TableRepository.getTable.mockResolvedValueOnce(existingTable);
    getPlayerPermissions.mockResolvedValueOnce(new Set(['admin:access']));
    TableVisibilityService.getWhitelist.mockResolvedValueOnce([]);
    TableRepository.getTable.mockResolvedValueOnce({
      ...existingTable,
      privacy: 'private'
    });

    const app = buildApp({ user: { id: otherId } });
    const res = await request(app)
      .patch(`/api/tables/${tableId}/privacy`)
      .send({
        privacy: 'private',
        privateConfig: { whitelistedPlayers: [playerId1] }
      });

    expect(res.status).toBe(200);
  });

  test('allows switching from private to school', async () => {
    const privateTable = { ...existingTable, privacy: 'private' };
    const schoolTable = { ...existingTable, privacy: 'school' };
    TableRepository.getTable.mockResolvedValueOnce(privateTable);
    getPlayerPermissions.mockResolvedValueOnce(new Set());
    TableVisibilityService.getWhitelist.mockResolvedValueOnce([
      { playerId: playerId1, displayName: 'Player 1' }
    ]);
    TableRepository.getTable.mockResolvedValueOnce(schoolTable);

    const app = buildApp({ user: { id: ownerId } });
    const res = await request(app)
      .patch(`/api/tables/${tableId}/privacy`)
      .send({ privacy: 'school' });

    expect(res.status).toBe(200);
    expect(TableRepository.updateTable).toHaveBeenCalledWith(tableId, { privacy: 'school' });
    expect(TableVisibilityService.removeFromWhitelist).toHaveBeenCalledWith(tableId, playerId1);
  });
});

// ─── POST /api/tables/:id/whitelist ────────────────────────────────────────────

describe('POST /api/tables/:id/whitelist', () => {
  const ownerId = 'owner-uuid';
  const otherId = 'other-uuid';
  const tableId = 'tbl-whitelist';
  const playerId = 'player-to-invite';

  const privateTable = {
    id: tableId,
    name: 'Private Table',
    created_by: ownerId,
    privacy: 'private',
    status: 'waiting',
  };

  const schoolTable = {
    id: tableId,
    name: 'School Table',
    created_by: ownerId,
    privacy: 'school',
    status: 'waiting',
  };

  test('returns 401 without auth', async () => {
    const app = buildApp({ user: null });
    const res = await request(app)
      .post(`/api/tables/${tableId}/whitelist`)
      .send({ playerId });
    expect(res.status).toBe(401);
  });

  test('returns 403 when requester is not owner', async () => {
    TableRepository.getTable.mockResolvedValueOnce(privateTable);
    getPlayerPermissions.mockResolvedValueOnce(new Set());

    const app = buildApp({ user: { id: otherId } });
    const res = await request(app)
      .post(`/api/tables/${tableId}/whitelist`)
      .send({ playerId });

    expect(res.status).toBe(403);
    expect(TableVisibilityService.addToWhitelist).not.toHaveBeenCalled();
  });

  test('returns 404 when table does not exist', async () => {
    TableRepository.getTable.mockResolvedValueOnce(null);

    const app = buildApp({ user: { id: ownerId } });
    const res = await request(app)
      .post(`/api/tables/${tableId}/whitelist`)
      .send({ playerId });

    expect(res.status).toBe(404);
  });

  test('returns 400 when table is not private', async () => {
    TableRepository.getTable.mockResolvedValueOnce(schoolTable);
    getPlayerPermissions.mockResolvedValueOnce(new Set());

    const app = buildApp({ user: { id: ownerId } });
    const res = await request(app)
      .post(`/api/tables/${tableId}/whitelist`)
      .send({ playerId });

    expect(res.status).toBe(400);
    expect(TableVisibilityService.addToWhitelist).not.toHaveBeenCalled();
  });

  test('returns 400 when playerId is missing', async () => {
    TableRepository.getTable.mockResolvedValueOnce(privateTable);
    getPlayerPermissions.mockResolvedValueOnce(new Set());

    const app = buildApp({ user: { id: ownerId } });
    const res = await request(app)
      .post(`/api/tables/${tableId}/whitelist`)
      .send({});

    expect(res.status).toBe(400);
  });

  test('adds player to whitelist and returns updated whitelist', async () => {
    const player1 = { playerId: playerId, displayName: 'Invited Player' };
    const player2 = { playerId: 'player-existing', displayName: 'Existing Player' };

    TableRepository.getTable.mockResolvedValueOnce(privateTable);
    getPlayerPermissions.mockResolvedValueOnce(new Set());
    TableVisibilityService.getWhitelist.mockResolvedValueOnce([player2, player1]);

    const app = buildApp({ user: { id: ownerId } });
    const res = await request(app)
      .post(`/api/tables/${tableId}/whitelist`)
      .send({ playerId });

    expect(res.status).toBe(201);
    expect(TableVisibilityService.addToWhitelist).toHaveBeenCalledWith(tableId, playerId, ownerId);
    expect(res.body.whitelist).toEqual([player2, player1]);
  });

  test('returns 409 when player is already whitelisted', async () => {
    TableRepository.getTable.mockResolvedValueOnce(privateTable);
    getPlayerPermissions.mockResolvedValueOnce(new Set());
    TableVisibilityService.addToWhitelist.mockRejectedValueOnce(
      new Error('Player is already invited to this table')
    );

    const app = buildApp({ user: { id: ownerId } });
    const res = await request(app)
      .post(`/api/tables/${tableId}/whitelist`)
      .send({ playerId });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('conflict');
  });

  test('allows admin to add to whitelist even if not owner', async () => {
    const player1 = { playerId: playerId, displayName: 'Invited Player' };

    TableRepository.getTable.mockResolvedValueOnce(privateTable);
    getPlayerPermissions.mockResolvedValueOnce(new Set(['admin:access']));
    TableVisibilityService.getWhitelist.mockResolvedValueOnce([player1]);

    const app = buildApp({ user: { id: otherId } });
    const res = await request(app)
      .post(`/api/tables/${tableId}/whitelist`)
      .send({ playerId });

    expect(res.status).toBe(201);
  });
});

// ─── DELETE /api/tables/:id/whitelist/:playerId ───────────────────────────────

describe('DELETE /api/tables/:id/whitelist/:playerId', () => {
  const ownerId = 'owner-uuid';
  const otherId = 'other-uuid';
  const tableId = 'tbl-whitelist-del';
  const playerId = 'player-to-remove';

  const privateTable = {
    id: tableId,
    name: 'Private Table',
    created_by: ownerId,
    privacy: 'private',
    status: 'waiting',
  };

  test('returns 401 without auth', async () => {
    const app = buildApp({ user: null });
    const res = await request(app)
      .delete(`/api/tables/${tableId}/whitelist/${playerId}`);
    expect(res.status).toBe(401);
  });

  test('returns 403 when requester is not owner', async () => {
    TableRepository.getTable.mockResolvedValueOnce(privateTable);
    getPlayerPermissions.mockResolvedValueOnce(new Set());

    const app = buildApp({ user: { id: otherId } });
    const res = await request(app)
      .delete(`/api/tables/${tableId}/whitelist/${playerId}`);

    expect(res.status).toBe(403);
    expect(TableVisibilityService.removeFromWhitelist).not.toHaveBeenCalled();
  });

  test('returns 404 when table does not exist', async () => {
    TableRepository.getTable.mockResolvedValueOnce(null);

    const app = buildApp({ user: { id: ownerId } });
    const res = await request(app)
      .delete(`/api/tables/${tableId}/whitelist/${playerId}`);

    expect(res.status).toBe(404);
  });

  test('removes player from whitelist and returns 204', async () => {
    TableRepository.getTable.mockResolvedValueOnce(privateTable);
    getPlayerPermissions.mockResolvedValueOnce(new Set());

    const app = buildApp({ user: { id: ownerId } });
    const res = await request(app)
      .delete(`/api/tables/${tableId}/whitelist/${playerId}`);

    expect(res.status).toBe(204);
    expect(TableVisibilityService.removeFromWhitelist).toHaveBeenCalledWith(tableId, playerId);
  });

  test('returns 404 when whitelist entry does not exist', async () => {
    TableRepository.getTable.mockResolvedValueOnce(privateTable);
    getPlayerPermissions.mockResolvedValueOnce(new Set());
    TableVisibilityService.removeFromWhitelist.mockResolvedValueOnce({ removed: false, count: 0 });

    const app = buildApp({ user: { id: ownerId } });
    const res = await request(app)
      .delete(`/api/tables/${tableId}/whitelist/${playerId}`);

    expect(res.status).toBe(404);
  });

  test('allows admin to remove from whitelist even if not owner', async () => {
    TableRepository.getTable.mockResolvedValueOnce(privateTable);
    getPlayerPermissions.mockResolvedValueOnce(new Set(['admin:access']));

    const app = buildApp({ user: { id: otherId } });
    const res = await request(app)
      .delete(`/api/tables/${tableId}/whitelist/${playerId}`);

    expect(res.status).toBe(204);
  });
});
