'use strict';

/**
 * School settings route integration tests.
 *
 * Covers:
 *   GET  /api/settings/school
 *   PUT  /api/settings/school/identity
 *   PUT  /api/settings/school/staking-defaults
 *   GET  /api/settings/school/platforms
 *   PUT  /api/settings/school/platforms
 *   PUT  /api/settings/school/leaderboard
 *
 * PlayerRepository, SchoolRepository, and SettingsService are mocked.
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

const mockFindPlayerById = jest.fn();
const mockFindSchoolById = jest.fn();
const mockUpdateSchool   = jest.fn();

jest.mock('../db/repositories/PlayerRepository.js', () => ({
  findById: (...args) => mockFindPlayerById(...args),
}));

jest.mock('../db/repositories/SchoolRepository.js', () => ({
  findById: (...args) => mockFindSchoolById(...args),
  update:   (...args) => mockUpdateSchool(...args),
}));

const mockGetSchoolSetting = jest.fn();
const mockSetSchoolSetting = jest.fn();

jest.mock('../services/SettingsService.js', () => ({
  ORG_SCOPE_ID:         '00000000-0000-0000-0000-000000000001',
  getOrgSetting:        jest.fn(),
  setOrgSetting:        jest.fn(),
  getSchoolSetting:     (...args) => mockGetSchoolSetting(...args),
  setSchoolSetting:     (...args) => mockSetSchoolSetting(...args),
  resolveTableDefaults: jest.fn(),
  saveTableDefaults:    jest.fn(),
  resetTableDefaults:   jest.fn(),
  TABLE_DEFAULTS_KEYS:  [],
  TABLE_DEFAULTS_APP:   {},
}));

// Supabase mock (needed for presets routes in the same router)
jest.mock('../db/supabase.js', () => ({ from: jest.fn() }));

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

const fakeSchool = { id: SCHOOL_UUID, name: 'Rivera Academy', description: 'Top school', status: 'active' };

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrentUser = null;
  mockFindPlayerById.mockResolvedValue({ id: COACH_UUID, school_id: SCHOOL_UUID });
  mockFindSchoolById.mockResolvedValue(fakeSchool);
  mockGetSchoolSetting.mockResolvedValue(null);
  mockSetSchoolSetting.mockResolvedValue(undefined);
});

// ─── GET /api/settings/school ─────────────────────────────────────────────────

describe('GET /api/settings/school', () => {
  test('returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/settings/school');
    expect(res.status).toBe(401);
  });

  test('returns 403 for student role', async () => {
    mockCurrentUser = { stableId: COACH_UUID, role: 'coached_student' };
    const res = await request(app)
      .get('/api/settings/school')
      .set('Authorization', 'Bearer valid');
    expect(res.status).toBe(403);
  });

  test('returns 404 when coach has no school', async () => {
    mockCurrentUser = { stableId: COACH_UUID, role: 'coach' };
    mockFindPlayerById.mockResolvedValueOnce({ id: COACH_UUID, school_id: null });
    const res = await request(app)
      .get('/api/settings/school')
      .set('Authorization', 'Bearer valid');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('no_school');
  });

  test('returns school settings with defaults for coach', async () => {
    mockCurrentUser = { stableId: COACH_UUID, role: 'coach' };

    const res = await request(app)
      .get('/api/settings/school')
      .set('Authorization', 'Bearer valid');

    expect(res.status).toBe(200);
    expect(res.body.identity).toMatchObject({ id: SCHOOL_UUID, name: 'Rivera Academy' });
    expect(res.body.staking_defaults).toHaveProperty('coach_split_pct', 50);
    expect(Array.isArray(res.body.platforms)).toBe(true);
    expect(res.body.leaderboard).toHaveProperty('primary_metric');
  });

  test('merges stored staking defaults over built-in defaults', async () => {
    mockCurrentUser = { stableId: COACH_UUID, role: 'coach' };
    mockGetSchoolSetting.mockImplementation((_id, key) => {
      if (key === 'school.staking_defaults') return Promise.resolve({ coach_split_pct: 60 });
      return Promise.resolve(null);
    });

    const res = await request(app)
      .get('/api/settings/school')
      .set('Authorization', 'Bearer valid');

    expect(res.status).toBe(200);
    expect(res.body.staking_defaults.coach_split_pct).toBe(60);
  });
});

// ─── PUT /api/settings/school/identity ───────────────────────────────────────

describe('PUT /api/settings/school/identity', () => {
  test('returns 401 when unauthenticated', async () => {
    const res = await request(app).put('/api/settings/school/identity').send({});
    expect(res.status).toBe(401);
  });

  test('returns 400 when no fields provided', async () => {
    mockCurrentUser = { stableId: COACH_UUID, role: 'coach' };
    const res = await request(app)
      .put('/api/settings/school/identity')
      .set('Authorization', 'Bearer valid')
      .send({});
    expect(res.status).toBe(400);
  });

  test('returns 400 when name is too short', async () => {
    mockCurrentUser = { stableId: COACH_UUID, role: 'coach' };
    const res = await request(app)
      .put('/api/settings/school/identity')
      .set('Authorization', 'Bearer valid')
      .send({ name: 'X' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_name');
  });

  test('updates school name and returns identity', async () => {
    mockCurrentUser = { stableId: COACH_UUID, role: 'coach' };
    mockUpdateSchool.mockResolvedValueOnce({ id: SCHOOL_UUID, name: 'New Name', description: 'Top school' });

    const res = await request(app)
      .put('/api/settings/school/identity')
      .set('Authorization', 'Bearer valid')
      .send({ name: 'New Name' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('New Name');
    expect(mockUpdateSchool).toHaveBeenCalledWith(SCHOOL_UUID, { name: 'New Name' }, COACH_UUID);
  });

  test('updates description without changing name', async () => {
    mockCurrentUser = { stableId: COACH_UUID, role: 'coach' };
    mockUpdateSchool.mockResolvedValueOnce({ id: SCHOOL_UUID, name: 'Rivera Academy', description: 'New description' });

    const res = await request(app)
      .put('/api/settings/school/identity')
      .set('Authorization', 'Bearer valid')
      .send({ description: 'New description' });

    expect(res.status).toBe(200);
    expect(mockUpdateSchool).toHaveBeenCalledWith(SCHOOL_UUID, { description: 'New description' }, COACH_UUID);
  });
});

// ─── PUT /api/settings/school/staking-defaults ───────────────────────────────

describe('PUT /api/settings/school/staking-defaults', () => {
  test('saves and returns staking defaults', async () => {
    mockCurrentUser = { stableId: COACH_UUID, role: 'coach' };

    const res = await request(app)
      .put('/api/settings/school/staking-defaults')
      .set('Authorization', 'Bearer valid')
      .send({ coach_split_pct: 60, makeup_policy: 'resets_monthly' });

    expect(res.status).toBe(200);
    expect(res.body.coach_split_pct).toBe(60);
    expect(res.body.makeup_policy).toBe('resets_monthly');
    expect(mockSetSchoolSetting).toHaveBeenCalledWith(
      SCHOOL_UUID, 'school.staking_defaults',
      expect.objectContaining({ coach_split_pct: 60, makeup_policy: 'resets_monthly' })
    );
  });
});

// ─── GET /api/settings/school/platforms ──────────────────────────────────────

describe('GET /api/settings/school/platforms', () => {
  test('returns stored platforms', async () => {
    mockCurrentUser = { stableId: COACH_UUID, role: 'coach' };
    mockGetSchoolSetting.mockResolvedValueOnce({ platforms: ['PokerStars', '888poker'] });

    const res = await request(app)
      .get('/api/settings/school/platforms')
      .set('Authorization', 'Bearer valid');

    expect(res.status).toBe(200);
    expect(res.body.platforms).toEqual(['PokerStars', '888poker']);
  });

  test('returns default platforms when nothing stored', async () => {
    mockCurrentUser = { stableId: COACH_UUID, role: 'coach' };
    const res = await request(app)
      .get('/api/settings/school/platforms')
      .set('Authorization', 'Bearer valid');
    expect(res.status).toBe(200);
    expect(res.body.platforms.length).toBeGreaterThan(0);
  });
});

// ─── PUT /api/settings/school/platforms ──────────────────────────────────────

describe('PUT /api/settings/school/platforms', () => {
  test('returns 400 when platforms is not an array', async () => {
    mockCurrentUser = { stableId: COACH_UUID, role: 'coach' };
    const res = await request(app)
      .put('/api/settings/school/platforms')
      .set('Authorization', 'Bearer valid')
      .send({ platforms: 'PokerStars' });
    expect(res.status).toBe(400);
  });

  test('saves and returns cleaned platforms list', async () => {
    mockCurrentUser = { stableId: COACH_UUID, role: 'coach' };

    const res = await request(app)
      .put('/api/settings/school/platforms')
      .set('Authorization', 'Bearer valid')
      .send({ platforms: ['PokerStars', '  GGPoker  ', ''] });

    expect(res.status).toBe(200);
    expect(res.body.platforms).toEqual(['PokerStars', 'GGPoker']); // empty trimmed out
    expect(mockSetSchoolSetting).toHaveBeenCalledWith(
      SCHOOL_UUID, 'school.platforms', { platforms: ['PokerStars', 'GGPoker'] }
    );
  });
});

// ─── PUT /api/settings/school/leaderboard ────────────────────────────────────

describe('PUT /api/settings/school/leaderboard', () => {
  test('saves and returns leaderboard settings', async () => {
    mockCurrentUser = { stableId: COACH_UUID, role: 'coach' };

    const res = await request(app)
      .put('/api/settings/school/leaderboard')
      .set('Authorization', 'Bearer valid')
      .send({ primary_metric: 'bb_per_100' });

    expect(res.status).toBe(200);
    expect(res.body.primary_metric).toBe('bb_per_100');
    expect(mockSetSchoolSetting).toHaveBeenCalledWith(
      SCHOOL_UUID, 'school.leaderboard',
      expect.objectContaining({ primary_metric: 'bb_per_100' })
    );
  });
});
