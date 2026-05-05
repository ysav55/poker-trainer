'use strict';

/**
 * Org settings route integration tests.
 *
 * Covers:
 *   GET    /api/admin/org-settings
 *   PUT    /api/admin/org-settings/limits
 *   GET    /api/admin/org-settings/blind-structures
 *   POST   /api/admin/org-settings/blind-structures
 *   PATCH  /api/admin/org-settings/blind-structures/:id
 *   DELETE /api/admin/org-settings/blind-structures/:id
 *   PUT    /api/admin/org-settings/autospawn
 *   PUT    /api/admin/org-settings/leaderboard
 *
 * requirePermission('user:manage') and SettingsService are mocked.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

let mockPermAllowed = true;

jest.mock('../../server/auth/requirePermission.js', () => ({
  requirePermission: jest.fn(() => (req, res, next) => {
    if (!mockPermAllowed) return res.status(403).json({ error: 'forbidden' });
    req.user = req.user ?? { stableId: 'admin-uuid', id: 'admin-uuid', role: 'admin' };
    next();
  }),
  getPlayerPermissions:      jest.fn(),
  invalidatePermissionCache: jest.fn(),
}));

const mockGetOrgSetting = jest.fn();
const mockSetOrgSetting = jest.fn();

jest.mock('../../server/services/SettingsService.js', () => ({
  ORG_SCOPE_ID:     '00000000-0000-0000-0000-000000000001',
  getOrgSetting:    (...args) => mockGetOrgSetting(...args),
  setOrgSetting:    (...args) => mockSetOrgSetting(...args),
  getSchoolSetting: jest.fn(),
  setSchoolSetting: jest.fn(),
  migrateLeaderboardConfig: (val) => val,
  VALID_LEADERBOARD_STATS: [
    'hands_played', 'bb_per_100', 'vpip', 'pfr', 'net_chips', 'win_rate',
    'wtsd', 'wsd', 'three_bet', 'af', 'cbet_flop', 'fold_to_cbet',
    'open_limp_rate', 'cold_call_3bet_rate', 'min_raise_rate', 'overlimp_rate', 'equity_fold_rate',
  ],
}));

jest.mock('../../server/db/repositories/SchoolRepository.js', () => ({
  getOrgGroupPolicy: jest.fn().mockResolvedValue({ enabled: true, max_groups: null, max_players_per_group: null }),
  setOrgGroupPolicy: jest.fn(),
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

const express = require('express');
const request = require('supertest');

function buildApp() {
  const app = express();
  app.use(express.json());
  // Simulate requireAuth middleware already populating req.user (as index.js does)
  app.use((req, res, next) => {
    req.user = { stableId: 'admin-uuid', id: 'admin-uuid', role: 'admin' };
    next();
  });
  const router = require('../../server/routes/admin/orgSettings.js');
  app.use('/api/admin', router);
  return app;
}

const app = buildApp();

beforeEach(() => {
  jest.clearAllMocks();
  mockPermAllowed    = true;
  mockGetOrgSetting.mockResolvedValue(null);  // default: no stored settings
  mockSetOrgSetting.mockResolvedValue(undefined);
});

// ─── GET /api/admin/org-settings ─────────────────────────────────────────────

describe('GET /api/admin/org-settings', () => {
  test('returns 403 when user lacks permission', async () => {
    mockPermAllowed = false;
    const res = await request(app).get('/api/admin/org-settings');
    expect(res.status).toBe(403);
  });

  test('returns all sections with hardcoded defaults when nothing is stored', async () => {
    mockGetOrgSetting.mockResolvedValue(null);

    const res = await request(app).get('/api/admin/org-settings');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('blind_structures');
    expect(res.body).toHaveProperty('platform_limits');
    expect(res.body).toHaveProperty('autospawn');
    expect(res.body).toHaveProperty('leaderboard');

    // Hardcoded defaults
    expect(res.body.platform_limits.trial_days).toBe(7);
    expect(res.body.autospawn.enabled).toBe(false);
    expect(res.body.leaderboard.sort_by).toBe('bb_per_100');
    expect(Array.isArray(res.body.blind_structures)).toBe(true);
    expect(res.body.blind_structures.length).toBe(4);
  });

  test('merges stored settings over defaults', async () => {
    mockGetOrgSetting.mockImplementation(key => {
      if (key === 'org.platform_limits') return Promise.resolve({ trial_days: 14 });
      return Promise.resolve(null);
    });

    const res = await request(app).get('/api/admin/org-settings');
    expect(res.status).toBe(200);
    expect(res.body.platform_limits.trial_days).toBe(14);
    expect(res.body.platform_limits.max_tables_per_student).toBe(4); // default preserved
  });
});

// ─── PUT /api/admin/org-settings/limits ──────────────────────────────────────

describe('PUT /api/admin/org-settings/limits', () => {
  test('returns 403 when user lacks permission', async () => {
    mockPermAllowed = false;
    const res = await request(app).put('/api/admin/org-settings/limits').send({ trial_days: 14 });
    expect(res.status).toBe(403);
  });

  test('saves and returns updated limits', async () => {
    const res = await request(app)
      .put('/api/admin/org-settings/limits')
      .send({ trial_days: 14, trial_hand_limit: 1000 });

    expect(res.status).toBe(200);
    expect(res.body.trial_days).toBe(14);
    expect(res.body.trial_hand_limit).toBe(1000);
    expect(mockSetOrgSetting).toHaveBeenCalledWith('org.platform_limits', expect.objectContaining({
      trial_days: 14,
      trial_hand_limit: 1000,
    }));
  });

  test('preserves unmodified limits', async () => {
    const res = await request(app)
      .put('/api/admin/org-settings/limits')
      .send({ trial_days: 14 });

    expect(res.status).toBe(200);
    // max_tables_per_student should come from hardcoded default
    expect(res.body.max_tables_per_student).toBe(4);
  });
});

// ─── Blind structures ─────────────────────────────────────────────────────────

describe('GET /api/admin/org-settings/blind-structures', () => {
  test('returns default structures when nothing stored', async () => {
    const res = await request(app).get('/api/admin/org-settings/blind-structures');
    expect(res.status).toBe(200);
    expect(res.body.structures.length).toBe(4);
    expect(res.body.structures[0]).toMatchObject({ label: 'Micro', sb: 5, bb: 10 });
  });

  test('returns stored structures when available', async () => {
    const custom = [{ id: 'abc', label: 'Custom', sb: 1, bb: 2, ante: 0 }];
    mockGetOrgSetting.mockResolvedValueOnce({ structures: custom });

    const res = await request(app).get('/api/admin/org-settings/blind-structures');
    expect(res.status).toBe(200);
    expect(res.body.structures).toEqual(custom);
  });
});

describe('POST /api/admin/org-settings/blind-structures', () => {
  test('returns 400 when label is missing', async () => {
    const res = await request(app)
      .post('/api/admin/org-settings/blind-structures')
      .send({ sb: 10, bb: 20 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_label');
  });

  test('adds a structure and returns it with generated id', async () => {
    const res = await request(app)
      .post('/api/admin/org-settings/blind-structures')
      .send({ label: 'Nano', sb: 1, bb: 2, ante: 0 });

    expect(res.status).toBe(201);
    expect(res.body.label).toBe('Nano');
    expect(res.body.id).toBeDefined();
    expect(mockSetOrgSetting).toHaveBeenCalled();
  });
});

describe('PATCH /api/admin/org-settings/blind-structures/:id', () => {
  const STRUCT_ID = 'micro';

  test('returns 404 when structure not found', async () => {
    const res = await request(app)
      .patch('/api/admin/org-settings/blind-structures/nonexistent-id')
      .send({ label: 'Updated' });
    expect(res.status).toBe(404);
  });

  test('updates a structure and returns it', async () => {
    // getOrgSetting returns null → falls back to hardcoded defaults (id='micro' exists)
    const res = await request(app)
      .patch(`/api/admin/org-settings/blind-structures/${STRUCT_ID}`)
      .send({ sb: 10 });

    expect(res.status).toBe(200);
    expect(res.body.sb).toBe(10);
    expect(res.body.id).toBe(STRUCT_ID);
    expect(mockSetOrgSetting).toHaveBeenCalled();
  });
});

describe('DELETE /api/admin/org-settings/blind-structures/:id', () => {
  test('returns 404 when structure not found', async () => {
    const res = await request(app)
      .delete('/api/admin/org-settings/blind-structures/nonexistent-id');
    expect(res.status).toBe(404);
  });

  test('deletes a structure and returns success', async () => {
    const res = await request(app)
      .delete('/api/admin/org-settings/blind-structures/micro');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Saved structures should no longer include 'micro'
    const savedStructures = mockSetOrgSetting.mock.calls[0][1].structures;
    expect(savedStructures.find(s => s.id === 'micro')).toBeUndefined();
  });
});

// ─── PUT /api/admin/org-settings/autospawn ───────────────────────────────────

describe('PUT /api/admin/org-settings/autospawn', () => {
  test('saves and returns autospawn config', async () => {
    const res = await request(app)
      .put('/api/admin/org-settings/autospawn')
      .send({ enabled: true, occupancy_threshold: 75 });

    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(true);
    expect(res.body.occupancy_threshold).toBe(75);
    expect(res.body.default_config).toBe('low'); // default preserved
  });
});

// ─── PUT /api/admin/org-settings/leaderboard ─────────────────────────────────

describe('PUT /api/admin/org-settings/leaderboard', () => {
  test('saves and returns leaderboard config', async () => {
    const res = await request(app)
      .put('/api/admin/org-settings/leaderboard')
      .send({ columns: ['hands_played', 'bb_per_100', 'vpip'], sort_by: 'bb_per_100', update_frequency: 'daily' });

    expect(res.status).toBe(200);
    expect(res.body.columns).toEqual(['hands_played', 'bb_per_100', 'vpip']);
    expect(res.body.sort_by).toBe('bb_per_100');
    expect(res.body.update_frequency).toBe('daily');
  });
});
