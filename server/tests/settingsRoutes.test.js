'use strict';

/**
 * Settings routes integration tests.
 *
 * Covers:
 *   GET    /api/settings/table-defaults
 *   PUT    /api/settings/table-defaults
 *   DELETE /api/settings/table-defaults
 *   GET    /api/settings/presets
 *   POST   /api/settings/presets
 *   PATCH  /api/settings/presets/:id
 *   DELETE /api/settings/presets/:id
 *
 * SettingsService and supabase are mocked — no real DB calls.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

let mockCurrentUser = null;

jest.mock('../auth/requireAuth.js', () =>
  jest.fn((req, res, next) => {
    if (!mockCurrentUser) return res.status(401).json({ error: 'auth_required' });
    req.user = mockCurrentUser;
    next();
  })
);

const mockResolveTableDefaults = jest.fn();
const mockSaveTableDefaults    = jest.fn();
const mockResetTableDefaults   = jest.fn();

jest.mock('../services/SettingsService.js', () => ({
  ORG_SCOPE_ID:          '00000000-0000-0000-0000-000000000001',
  TABLE_DEFAULTS_APP:    {},
  TABLE_DEFAULTS_KEYS:   [],
  resolveTableDefaults:  (...args) => mockResolveTableDefaults(...args),
  saveTableDefaults:     (...args) => mockSaveTableDefaults(...args),
  resetTableDefaults:    (...args) => mockResetTableDefaults(...args),
  getOrgSetting:    jest.fn(),
  setOrgSetting:    jest.fn(),
  getSchoolSetting: jest.fn(),
  setSchoolSetting: jest.fn(),
}));

const mockFindById = jest.fn();
jest.mock('../db/repositories/PlayerRepository.js', () => ({
  findById: (...args) => mockFindById(...args),
}));

// Mock supabase for presets CRUD
const mockFrom = jest.fn();
jest.mock('../db/supabase.js', () => ({ from: (...args) => mockFrom(...args) }));

// ─── Imports ──────────────────────────────────────────────────────────────────

const express = require('express');
const request = require('supertest');

function buildApp() {
  const app = express();
  app.use(express.json());
  const router = require('../routes/settings.js');
  app.use('/api/settings', router);
  return app;
}

const app = buildApp();

// ─── Helpers ──────────────────────────────────────────────────────────────────

const COACH_UUID  = 'cccccccc-0000-0000-0000-000000000001';
const SCHOOL_UUID = 'ssssssss-0000-0000-0000-000000000001';
const ORG_UUID    = '00000000-0000-0000-0000-000000000001';
const PRESET_UUID = 'pppppppp-0000-0000-0000-000000000001';

const coachUser   = { stableId: COACH_UUID,  role: 'coach' };
const adminUser   = { stableId: 'aaaa-0001', role: 'admin' };

/** Builds a chainable Supabase query stub that resolves to { data, error }.
 *  Supports both direct `await chain` (for queries ending at .order()/.eq()/etc.)
 *  and terminal calls like .single() / .maybeSingle(). */
function supaStub(result) {
  const chain = {
    select:      jest.fn().mockReturnThis(),
    insert:      jest.fn().mockReturnThis(),
    update:      jest.fn().mockReturnThis(),
    delete:      jest.fn().mockReturnThis(),
    upsert:      jest.fn().mockReturnThis(),
    eq:          jest.fn().mockReturnThis(),
    order:       jest.fn().mockReturnThis(),
    like:        jest.fn().mockReturnThis(),
    single:      jest.fn().mockResolvedValue(result),
    maybeSingle: jest.fn().mockResolvedValue(result),
    // Thenable: allows `await chain` when no terminal method is called
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrentUser = null;
  mockFindById.mockResolvedValue({ id: COACH_UUID, school_id: SCHOOL_UUID });
});

// ─── GET /api/settings/table-defaults ────────────────────────────────────────

describe('GET /api/settings/table-defaults', () => {
  test('returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/settings/table-defaults');
    expect(res.status).toBe(401);
  });

  test('resolves defaults for a coach (uses school_id)', async () => {
    mockCurrentUser = coachUser;
    const fakeDefaults = [{ key: 'table.default_sb', value: 25, source_scope: 'hardcoded' }];
    mockResolveTableDefaults.mockResolvedValueOnce(fakeDefaults);

    const res = await request(app)
      .get('/api/settings/table-defaults')
      .set('Authorization', 'Bearer valid');

    expect(res.status).toBe(200);
    expect(res.body.defaults).toEqual(fakeDefaults);
    expect(res.body.school_id).toBe(SCHOOL_UUID);
    expect(mockResolveTableDefaults).toHaveBeenCalledWith(SCHOOL_UUID);
  });

  test('resolves defaults for admin with null school_id', async () => {
    mockCurrentUser = adminUser;
    mockResolveTableDefaults.mockResolvedValueOnce([]);

    const res = await request(app)
      .get('/api/settings/table-defaults')
      .set('Authorization', 'Bearer valid');

    expect(res.status).toBe(200);
    // Admin gets null school_id; resolveTableDefaults called with null
    expect(mockResolveTableDefaults).toHaveBeenCalledWith(null);
    expect(res.body.school_id).toBeNull();
  });

  test('returns 500 when service throws', async () => {
    mockCurrentUser = coachUser;
    mockResolveTableDefaults.mockRejectedValueOnce(new Error('DB error'));

    const res = await request(app)
      .get('/api/settings/table-defaults')
      .set('Authorization', 'Bearer valid');

    expect(res.status).toBe(500);
  });
});

// ─── PUT /api/settings/table-defaults ────────────────────────────────────────

describe('PUT /api/settings/table-defaults', () => {
  test('returns 401 when unauthenticated', async () => {
    const res = await request(app).put('/api/settings/table-defaults').send({});
    expect(res.status).toBe(401);
  });

  test('returns 400 when settings body is missing', async () => {
    mockCurrentUser = coachUser;
    const res = await request(app)
      .put('/api/settings/table-defaults')
      .set('Authorization', 'Bearer valid')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_body');
  });

  test('coach saves at school scope', async () => {
    mockCurrentUser = coachUser;
    mockSaveTableDefaults.mockResolvedValueOnce(undefined);

    const res = await request(app)
      .put('/api/settings/table-defaults')
      .set('Authorization', 'Bearer valid')
      .send({ settings: { 'table.default_sb': 50 } });

    expect(res.status).toBe(200);
    expect(mockSaveTableDefaults).toHaveBeenCalledWith(
      'school', SCHOOL_UUID, { 'table.default_sb': 50 }
    );
  });

  test('admin saves at org scope', async () => {
    mockCurrentUser = adminUser;
    mockSaveTableDefaults.mockResolvedValueOnce(undefined);

    const res = await request(app)
      .put('/api/settings/table-defaults')
      .set('Authorization', 'Bearer valid')
      .send({ settings: { 'table.default_bb': 100 } });

    expect(res.status).toBe(200);
    expect(mockSaveTableDefaults).toHaveBeenCalledWith(
      'org', ORG_UUID, { 'table.default_bb': 100 }
    );
  });

  test('returns 500 when service throws', async () => {
    mockCurrentUser = coachUser;
    mockSaveTableDefaults.mockRejectedValueOnce(new Error('DB error'));

    const res = await request(app)
      .put('/api/settings/table-defaults')
      .set('Authorization', 'Bearer valid')
      .send({ settings: { 'table.default_sb': 25 } });

    expect(res.status).toBe(500);
  });
});

// ─── DELETE /api/settings/table-defaults ─────────────────────────────────────

describe('DELETE /api/settings/table-defaults', () => {
  test('returns 401 when unauthenticated', async () => {
    const res = await request(app).delete('/api/settings/table-defaults');
    expect(res.status).toBe(401);
  });

  test('coach resets at school scope', async () => {
    mockCurrentUser = coachUser;
    mockResetTableDefaults.mockResolvedValueOnce(undefined);

    const res = await request(app)
      .delete('/api/settings/table-defaults')
      .set('Authorization', 'Bearer valid');

    expect(res.status).toBe(200);
    expect(mockResetTableDefaults).toHaveBeenCalledWith('school', SCHOOL_UUID);
  });

  test('admin resets at org scope', async () => {
    mockCurrentUser = adminUser;
    mockResetTableDefaults.mockResolvedValueOnce(undefined);

    const res = await request(app)
      .delete('/api/settings/table-defaults')
      .set('Authorization', 'Bearer valid');

    expect(res.status).toBe(200);
    expect(mockResetTableDefaults).toHaveBeenCalledWith('org', ORG_UUID);
  });
});

// ─── Presets CRUD ─────────────────────────────────────────────────────────────

describe('GET /api/settings/presets', () => {
  test('returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/settings/presets');
    expect(res.status).toBe(401);
  });

  test('returns presets list for authenticated user', async () => {
    mockCurrentUser = coachUser;
    const fakePresets = [{ id: PRESET_UUID, name: 'Deep Stack', config: {}, created_at: '2026-01-01' }];
    const stub = supaStub({ data: fakePresets, error: null });
    mockFrom.mockReturnValueOnce(stub);

    const res = await request(app)
      .get('/api/settings/presets')
      .set('Authorization', 'Bearer valid');

    expect(res.status).toBe(200);
    expect(res.body.presets).toEqual(fakePresets);
  });
});

describe('POST /api/settings/presets', () => {
  test('returns 401 when unauthenticated', async () => {
    const res = await request(app).post('/api/settings/presets').send({});
    expect(res.status).toBe(401);
  });

  test('returns 400 when name is missing', async () => {
    mockCurrentUser = coachUser;
    const res = await request(app)
      .post('/api/settings/presets')
      .set('Authorization', 'Bearer valid')
      .send({ config: {} });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_name');
  });

  test('returns 400 when config is missing', async () => {
    mockCurrentUser = coachUser;
    const res = await request(app)
      .post('/api/settings/presets')
      .set('Authorization', 'Bearer valid')
      .send({ name: 'My Preset' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_config');
  });

  test('creates preset and returns 201', async () => {
    mockCurrentUser = coachUser;
    const newPreset = { id: PRESET_UUID, name: 'My Preset', config: { sb: 25 }, created_at: '2026-01-01', updated_at: '2026-01-01' };
    const stub = supaStub({ data: newPreset, error: null });
    mockFrom.mockReturnValueOnce(stub);

    const res = await request(app)
      .post('/api/settings/presets')
      .set('Authorization', 'Bearer valid')
      .send({ name: 'My Preset', config: { sb: 25 } });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'My Preset' });
  });
});

describe('PATCH /api/settings/presets/:id', () => {
  test('returns 401 when unauthenticated', async () => {
    const res = await request(app).patch(`/api/settings/presets/${PRESET_UUID}`).send({});
    expect(res.status).toBe(401);
  });

  test('returns 400 when no fields provided', async () => {
    mockCurrentUser = coachUser;
    const res = await request(app)
      .patch(`/api/settings/presets/${PRESET_UUID}`)
      .set('Authorization', 'Bearer valid')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('no_fields');
  });

  test('returns 404 when preset not found or not owned', async () => {
    mockCurrentUser = coachUser;
    const stub = supaStub({ data: null, error: null });
    mockFrom.mockReturnValueOnce(stub);

    const res = await request(app)
      .patch(`/api/settings/presets/${PRESET_UUID}`)
      .set('Authorization', 'Bearer valid')
      .send({ name: 'Updated' });

    expect(res.status).toBe(404);
  });

  test('updates preset and returns 200', async () => {
    mockCurrentUser = coachUser;
    const updated = { id: PRESET_UUID, name: 'Updated', config: {}, created_at: '2026-01-01', updated_at: '2026-01-02' };
    const stub = supaStub({ data: updated, error: null });
    mockFrom.mockReturnValueOnce(stub);

    const res = await request(app)
      .patch(`/api/settings/presets/${PRESET_UUID}`)
      .set('Authorization', 'Bearer valid')
      .send({ name: 'Updated' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated');
  });
});

describe('DELETE /api/settings/presets/:id', () => {
  test('returns 401 when unauthenticated', async () => {
    const res = await request(app).delete(`/api/settings/presets/${PRESET_UUID}`);
    expect(res.status).toBe(401);
  });

  test('returns 404 when preset not found or not owned', async () => {
    mockCurrentUser = coachUser;
    const stub = supaStub({ data: null, error: null });
    mockFrom.mockReturnValueOnce(stub);

    const res = await request(app)
      .delete(`/api/settings/presets/${PRESET_UUID}`)
      .set('Authorization', 'Bearer valid');

    expect(res.status).toBe(404);
  });

  test('deletes preset and returns 200', async () => {
    mockCurrentUser = coachUser;
    const stub = supaStub({ data: { id: PRESET_UUID }, error: null });
    mockFrom.mockReturnValueOnce(stub);

    const res = await request(app)
      .delete(`/api/settings/presets/${PRESET_UUID}`)
      .set('Authorization', 'Bearer valid');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
