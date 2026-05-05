'use strict';

/**
 * tables.js POST /api/tables — table_limit_reached gate.
 *
 * Regression test for the 403 that hit both coach (idopeer) and admin
 * (admin_yonatan) on staging. Commit 8d054a9 added a max_tables_per_student
 * cap that applied indiscriminately to all roles; this test locks in the
 * fix that exempts callers with `table:manage` (coaches) or `admin:access`
 * (admins) from the cap.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

let mockPermAllowed = true;
let mockPermsSet = new Set(['table:create']);

jest.mock('../../server/auth/requirePermission.js', () => ({
  requirePermission: jest.fn(() => (req, res, next) => {
    if (!mockPermAllowed) return res.status(403).json({ error: 'Insufficient permissions' });
    next();
  }),
  getPlayerPermissions:      jest.fn(async () => mockPermsSet),
  invalidatePermissionCache: jest.fn(),
}));

const mockGetOrgSetting = jest.fn();

jest.mock('../../server/services/SettingsService.js', () => ({
  ORG_SCOPE_ID:     '00000000-0000-0000-0000-000000000001',
  getOrgSetting:    (...args) => mockGetOrgSetting(...args),
  setOrgSetting:    jest.fn(),
  getSchoolSetting: jest.fn(),
  setSchoolSetting: jest.fn(),
}));

const mockTableRepo = {
  countActiveTablesByUser: jest.fn(async () => 0),
  createTable:             jest.fn(async () => undefined),
  getTable:                jest.fn(async (id) => ({ id, name: 'X', mode: 'coached_cash', privacy: 'school' })),
  listTables:              jest.fn(async () => []),
  updateTable:             jest.fn(),
  closeTable:              jest.fn(),
  setController:           jest.fn(),
};
const mockInvitedRepo = {
  addInvite:    jest.fn(),
  removeInvite: jest.fn(),
  listInvited:  jest.fn(async () => []),
};
const mockPresetsRepo = {
  list: jest.fn(async () => []),
  save: jest.fn(),
  get:  jest.fn(),
  update: jest.fn(),
  clone: jest.fn(),
  delete: jest.fn(),
};

jest.mock('../../server/db/repositories/TableRepository.js', () => ({
  TableRepository:           mockTableRepo,
  InvitedPlayersRepository:  mockInvitedRepo,
  TablePresetsRepository:    mockPresetsRepo,
}));

jest.mock('../../server/services/TableVisibilityService.js', () => ({
  canPlayerSeeTable: jest.fn(async () => true),
  addToWhitelist:    jest.fn(),
  addGroupToWhitelist: jest.fn(),
  getWhitelist:      jest.fn(async () => []),
  removeFromWhitelist: jest.fn(),
}));

// supabase mock — POST /api/tables reads player_profiles.school_id directly
jest.mock('../../server/db/supabase.js', () => ({
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        single: jest.fn(async () => ({ data: { school_id: 'sch-1' }, error: null })),
      })),
    })),
  })),
}));

jest.mock('../../server/logs/logger.js', () => ({
  error: jest.fn(),
  info:  jest.fn(),
  warn:  jest.fn(),
  trackSocket: jest.fn(),
}));

// ─── Imports & app ────────────────────────────────────────────────────────────

const express = require('express');
const request = require('supertest');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = { id: 'user-uuid', stableId: 'user-uuid', role: 'coach' };
    next();
  });
  const registerTableRoutes = require('../../server/routes/tables.js');
  registerTableRoutes(app, { requireAuth: (_req, _res, next) => next() });
  return app;
}

const app = buildApp();

beforeEach(() => {
  jest.clearAllMocks();
  mockPermAllowed = true;
  mockPermsSet    = new Set(['table:create']);
  mockGetOrgSetting.mockResolvedValue({ max_tables_per_student: 4 });
  mockTableRepo.countActiveTablesByUser.mockResolvedValue(0);
  mockTableRepo.getTable.mockImplementation(async (id) => ({
    id, name: 'My Table', mode: 'coached_cash', privacy: 'school',
  }));
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/tables — table_limit_reached gate', () => {
  test('coach with table:manage bypasses the cap (count=100, still 201)', async () => {
    mockPermsSet = new Set(['table:create', 'table:manage']);
    mockTableRepo.countActiveTablesByUser.mockResolvedValue(100);

    const res = await request(app)
      .post('/api/tables')
      .send({ name: 'Coach table', mode: 'coached_cash', privacy: 'school' });

    expect(res.status).toBe(201);
    expect(mockTableRepo.createTable).toHaveBeenCalled();
    // The gate must short-circuit so the count query may or may not be made.
    // What matters is that no 403 is returned.
  });

  test('admin with admin:access bypasses the cap (count=100, still 201)', async () => {
    mockPermsSet = new Set(['table:create', 'admin:access']);
    mockTableRepo.countActiveTablesByUser.mockResolvedValue(100);

    const res = await request(app)
      .post('/api/tables')
      .send({ name: 'Admin table', mode: 'coached_cash', privacy: 'school' });

    expect(res.status).toBe(201);
    expect(mockTableRepo.createTable).toHaveBeenCalled();
  });

  test('student at the cap gets 403 table_limit_reached', async () => {
    mockPermsSet = new Set(['table:create']); // no table:manage, no admin:access
    mockTableRepo.countActiveTablesByUser.mockResolvedValue(4);

    const res = await request(app)
      .post('/api/tables')
      .send({ name: 'Student table', mode: 'coached_cash', privacy: 'school' });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'table_limit_reached' });
    expect(mockTableRepo.createTable).not.toHaveBeenCalled();
  });

  test('student under the cap is allowed (count=3, 201)', async () => {
    mockPermsSet = new Set(['table:create']);
    mockTableRepo.countActiveTablesByUser.mockResolvedValue(3);

    const res = await request(app)
      .post('/api/tables')
      .send({ name: 'Student table', mode: 'coached_cash', privacy: 'school' });

    expect(res.status).toBe(201);
    expect(mockTableRepo.createTable).toHaveBeenCalled();
  });

  test('coach skips the count query entirely (gate short-circuits)', async () => {
    mockPermsSet = new Set(['table:create', 'table:manage']);

    await request(app)
      .post('/api/tables')
      .send({ name: 'Coach table', mode: 'coached_cash', privacy: 'school' });

    expect(mockTableRepo.countActiveTablesByUser).not.toHaveBeenCalled();
  });

  test('default cap (4) applies when org has no max_tables_per_student set', async () => {
    mockPermsSet = new Set(['table:create']);
    mockGetOrgSetting.mockResolvedValue(null); // no stored setting
    mockTableRepo.countActiveTablesByUser.mockResolvedValue(4);

    const res = await request(app)
      .post('/api/tables')
      .send({ name: 'Student table', mode: 'coached_cash', privacy: 'school' });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'table_limit_reached' });
  });
});
