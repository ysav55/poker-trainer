'use strict';

/**
 * School Settings Routes Integration Tests
 *
 * Tests:
 *   GET /api/settings/school
 *   PUT /api/settings/school/identity
 *   PUT /api/settings/school/table-defaults
 *   PUT /api/settings/school/staking-defaults
 *   PUT /api/settings/school/leaderboard
 *   PUT /api/settings/school/platforms
 *   PUT /api/settings/school/appearance
 *   PUT /api/settings/school/auto-pause-timeout
 */

const express = require('express');
const request = require('supertest');

// ─── Mocks ────────────────────────────────────────────────────────────────────

let mockCurrentUser = null;

jest.mock('../../auth/requireAuth.js', () =>
  jest.fn((req, res, next) => {
    if (!mockCurrentUser) return res.status(401).json({ error: 'auth_required' });
    req.user = mockCurrentUser;
    next();
  })
);

jest.mock('../../auth/requireRole.js', () =>
  jest.fn((role) => {
    return (req, res, next) => {
      const userRoles = [req.user?.role];
      if (req.user?.role === 'admin') userRoles.push('coach');
      if (req.user?.role === 'superadmin') userRoles.push('admin', 'coach');
      if (!userRoles.includes(role)) {
        return res.status(403).json({ error: 'forbidden', message: `Requires role: ${role}` });
      }
      next();
    };
  })
);

const mockGetIdentity = jest.fn();
const mockSetIdentity = jest.fn();
const mockGetTableDefaults = jest.fn();
const mockSetTableDefaults = jest.fn();
const mockGetStakingDefaults = jest.fn();
const mockSetStakingDefaults = jest.fn();
const mockGetLeaderboardConfig = jest.fn();
const mockSetLeaderboardConfig = jest.fn();
const mockGetPlatforms = jest.fn();
const mockSetPlatforms = jest.fn();
const mockGetAppearance = jest.fn();
const mockSetAppearance = jest.fn();
const mockGetAutoPauseTimeout = jest.fn();
const mockSetAutoPauseTimeout = jest.fn();

jest.mock('../../services/SchoolSettingsService.js', () => {
  return jest.fn(() => ({
    getIdentity: mockGetIdentity,
    setIdentity: mockSetIdentity,
    getTableDefaults: mockGetTableDefaults,
    setTableDefaults: mockSetTableDefaults,
    getStakingDefaults: mockGetStakingDefaults,
    setStakingDefaults: mockSetStakingDefaults,
    getLeaderboardConfig: mockGetLeaderboardConfig,
    setLeaderboardConfig: mockSetLeaderboardConfig,
    getPlatforms: mockGetPlatforms,
    setPlatforms: mockSetPlatforms,
    getAppearance: mockGetAppearance,
    setAppearance: mockSetAppearance,
    getAutoPauseTimeout: mockGetAutoPauseTimeout,
    setAutoPauseTimeout: mockSetAutoPauseTimeout,
  }));
});

jest.mock('../../db/supabase.js');

// ─── Build Test App ──────────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());
  const requireAuth = require('../../auth/requireAuth.js');
  const router = require('../school-settings.js');
  app.use('/api/settings/school', requireAuth, router);
  return app;
}

const app = buildApp();

// ─── Helpers ─────────────────────────────────────────────────────────────────

const COACH_ID = 'coach-123';
const SCHOOL_ID = 'school-456';

const defaultIdentity = { name: 'Test School', description: 'A test school' };
const defaultTableDefaults = {
  min_sb: 5,
  max_sb: 50,
  min_bb: 10,
  max_bb: 100,
  min_starting_stack: 1000,
  max_starting_stack: 50000,
};
const defaultStakingDefaults = {
  coach_split_pct: 50,
  makeup_policy: 'carries',
  bankroll_cap: 25000,
  contract_duration_months: 6,
};
const defaultLeaderboardConfig = {
  primary_metric: 'net_chips',
  secondary_metric: 'win_rate',
  update_frequency: 'after_session',
};
const defaultPlatforms = { platforms: ['PokerStars', 'GGPoker'] };
const defaultAppearance = {
  felt_color: '#1e5235',
  primary_color: '#d4af37',
  logo_url: null,
};
const defaultAutoPauseTimeout = { idle_minutes: 15 };

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrentUser = null;

  mockGetIdentity.mockResolvedValue(defaultIdentity);
  mockSetIdentity.mockResolvedValue(defaultIdentity);
  mockGetTableDefaults.mockResolvedValue(defaultTableDefaults);
  mockSetTableDefaults.mockResolvedValue(defaultTableDefaults);
  mockGetStakingDefaults.mockResolvedValue(defaultStakingDefaults);
  mockSetStakingDefaults.mockResolvedValue(defaultStakingDefaults);
  mockGetLeaderboardConfig.mockResolvedValue(defaultLeaderboardConfig);
  mockSetLeaderboardConfig.mockResolvedValue(defaultLeaderboardConfig);
  mockGetPlatforms.mockResolvedValue(defaultPlatforms);
  mockSetPlatforms.mockResolvedValue(defaultPlatforms);
  mockGetAppearance.mockResolvedValue(defaultAppearance);
  mockSetAppearance.mockResolvedValue(defaultAppearance);
  mockGetAutoPauseTimeout.mockResolvedValue(defaultAutoPauseTimeout);
  mockSetAutoPauseTimeout.mockResolvedValue(defaultAutoPauseTimeout);
});

// ─── Tests: GET /api/settings/school ──────────────────────────────────────────

describe('GET /api/settings/school', () => {
  test('returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/settings/school');
    expect(res.status).toBe(401);
  });

  test('returns 403 when user has no school assigned', async () => {
    mockCurrentUser = { id: COACH_ID, role: 'coach', school_id: null };
    const res = await request(app).get('/api/settings/school');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('forbidden');
  });

  test('returns all school settings for authenticated coach', async () => {
    mockCurrentUser = { id: COACH_ID, role: 'coach', school_id: SCHOOL_ID };
    const res = await request(app).get('/api/settings/school');
    expect(res.status).toBe(200);
    expect(res.body.schoolId).toBe(SCHOOL_ID);
    expect(res.body.identity).toMatchObject(defaultIdentity);
    expect(res.body.tableDefaults).toMatchObject(defaultTableDefaults);
    expect(res.body.stakingDefaults).toMatchObject(defaultStakingDefaults);
    expect(res.body.leaderboardConfig).toMatchObject(defaultLeaderboardConfig);
    expect(res.body.platforms).toMatchObject(defaultPlatforms);
    expect(res.body.appearance).toMatchObject(defaultAppearance);
    expect(res.body.autoPauseTimeout).toMatchObject(defaultAutoPauseTimeout);
  });

  test('calls all service getter methods with correct schoolId', async () => {
    mockCurrentUser = { id: COACH_ID, role: 'coach', school_id: SCHOOL_ID };
    await request(app).get('/api/settings/school');

    expect(mockGetIdentity).toHaveBeenCalledWith(SCHOOL_ID);
    expect(mockGetTableDefaults).toHaveBeenCalledWith(SCHOOL_ID);
    expect(mockGetStakingDefaults).toHaveBeenCalledWith(SCHOOL_ID);
    expect(mockGetLeaderboardConfig).toHaveBeenCalledWith(SCHOOL_ID);
    expect(mockGetPlatforms).toHaveBeenCalledWith(SCHOOL_ID);
    expect(mockGetAppearance).toHaveBeenCalledWith(SCHOOL_ID);
    expect(mockGetAutoPauseTimeout).toHaveBeenCalledWith(SCHOOL_ID);
  });
});

// ─── Tests: PUT /api/settings/school/identity ────────────────────────────────

describe('PUT /api/settings/school/identity', () => {
  test('returns 401 when unauthenticated', async () => {
    const res = await request(app).put('/api/settings/school/identity').send({ name: 'New' });
    expect(res.status).toBe(401);
  });

  test('returns 403 when user has no school assigned', async () => {
    mockCurrentUser = { id: COACH_ID, role: 'coach', school_id: null };
    const res = await request(app).put('/api/settings/school/identity').send({ name: 'New' });
    expect(res.status).toBe(403);
  });

  test('returns 403 when user is not a coach', async () => {
    mockCurrentUser = { id: COACH_ID, role: 'coached_student', school_id: SCHOOL_ID };
    const res = await request(app).put('/api/settings/school/identity').send({ name: 'New' });
    expect(res.status).toBe(403);
  });

  test('updates identity and returns result', async () => {
    mockCurrentUser = { id: COACH_ID, role: 'coach', school_id: SCHOOL_ID };
    const updatePayload = { name: 'Updated School', description: 'New description' };
    mockSetIdentity.mockResolvedValueOnce(updatePayload);

    const res = await request(app)
      .put('/api/settings/school/identity')
      .send(updatePayload);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject(updatePayload);
    expect(mockSetIdentity).toHaveBeenCalledWith(
      SCHOOL_ID,
      updatePayload,
      COACH_ID
    );
  });

  test('returns 400 on validation error', async () => {
    mockCurrentUser = { id: COACH_ID, role: 'coach', school_id: SCHOOL_ID };
    mockSetIdentity.mockRejectedValueOnce(new Error('name must be 1–100 chars'));

    const res = await request(app)
      .put('/api/settings/school/identity')
      .send({ name: 'x'.repeat(101) });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
    expect(res.body.message).toContain('must be');
  });
});

// ─── Tests: PUT /api/settings/school/table-defaults ──────────────────────────

describe('PUT /api/settings/school/table-defaults', () => {
  test('updates table defaults and returns result', async () => {
    mockCurrentUser = { id: COACH_ID, role: 'coach', school_id: SCHOOL_ID };
    const updatePayload = {
      min_sb: 10,
      max_sb: 100,
      min_bb: 20,
      max_bb: 200,
      min_starting_stack: 2000,
      max_starting_stack: 100000,
    };
    mockSetTableDefaults.mockResolvedValueOnce(updatePayload);

    const res = await request(app)
      .put('/api/settings/school/table-defaults')
      .send(updatePayload);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject(updatePayload);
    expect(mockSetTableDefaults).toHaveBeenCalledWith(
      SCHOOL_ID,
      updatePayload,
      COACH_ID
    );
  });

  test('returns 400 on validation error', async () => {
    mockCurrentUser = { id: COACH_ID, role: 'coach', school_id: SCHOOL_ID };
    mockSetTableDefaults.mockRejectedValueOnce(new Error('min_sb must be < max_sb'));

    const res = await request(app)
      .put('/api/settings/school/table-defaults')
      .send({ min_sb: 100, max_sb: 50, min_bb: 10, max_bb: 100, min_starting_stack: 1000, max_starting_stack: 50000 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });
});

// ─── Tests: PUT /api/settings/school/staking-defaults ────────────────────────

describe('PUT /api/settings/school/staking-defaults', () => {
  test('updates staking defaults and returns result', async () => {
    mockCurrentUser = { id: COACH_ID, role: 'coach', school_id: SCHOOL_ID };
    const updatePayload = {
      coach_split_pct: 60,
      makeup_policy: 'resets_monthly',
      bankroll_cap: 50000,
      contract_duration_months: 12,
    };
    mockSetStakingDefaults.mockResolvedValueOnce(updatePayload);

    const res = await request(app)
      .put('/api/settings/school/staking-defaults')
      .send(updatePayload);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject(updatePayload);
  });
});

// ─── Tests: PUT /api/settings/school/leaderboard ─────────────────────────────

describe('PUT /api/settings/school/leaderboard', () => {
  test('updates leaderboard config and returns result', async () => {
    mockCurrentUser = { id: COACH_ID, role: 'coach', school_id: SCHOOL_ID };
    const updatePayload = {
      primary_metric: 'bb_per_100',
      secondary_metric: 'win_rate',
      update_frequency: 'daily',
    };
    mockSetLeaderboardConfig.mockResolvedValueOnce(updatePayload);

    const res = await request(app)
      .put('/api/settings/school/leaderboard')
      .send(updatePayload);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject(updatePayload);
  });
});

// ─── Tests: PUT /api/settings/school/platforms ────────────────────────────────

describe('PUT /api/settings/school/platforms', () => {
  test('updates platforms and returns result', async () => {
    mockCurrentUser = { id: COACH_ID, role: 'coach', school_id: SCHOOL_ID };
    const updatePayload = { platforms: ['PokerStars', 'GGPoker', '888poker'] };
    mockSetPlatforms.mockResolvedValueOnce(updatePayload);

    const res = await request(app)
      .put('/api/settings/school/platforms')
      .send(updatePayload);

    expect(res.status).toBe(200);
    expect(res.body.platforms.length).toBe(3);
  });
});

// ─── Tests: PUT /api/settings/school/appearance ──────────────────────────────

describe('PUT /api/settings/school/appearance', () => {
  test('updates appearance and returns result', async () => {
    mockCurrentUser = { id: COACH_ID, role: 'coach', school_id: SCHOOL_ID };
    const updatePayload = {
      felt_color: '#2d5a2d',
      primary_color: '#ffd700',
      logo_url: 'https://example.com/logo.png',
    };
    mockSetAppearance.mockResolvedValueOnce(updatePayload);

    const res = await request(app)
      .put('/api/settings/school/appearance')
      .send(updatePayload);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject(updatePayload);
  });

  test('returns 400 on invalid hex color', async () => {
    mockCurrentUser = { id: COACH_ID, role: 'coach', school_id: SCHOOL_ID };
    mockSetAppearance.mockRejectedValueOnce(new Error('felt_color must be a valid hex color (#RRGGBB)'));

    const res = await request(app)
      .put('/api/settings/school/appearance')
      .send({ felt_color: 'red', primary_color: '#d4af37', logo_url: null });

    expect(res.status).toBe(400);
  });
});

// ─── Tests: PUT /api/settings/school/auto-pause-timeout ────────────────────────

describe('PUT /api/settings/school/auto-pause-timeout', () => {
  test('updates auto-pause timeout and returns result', async () => {
    mockCurrentUser = { id: COACH_ID, role: 'coach', school_id: SCHOOL_ID };
    const updatePayload = { idle_minutes: 30 };
    mockSetAutoPauseTimeout.mockResolvedValueOnce(updatePayload);

    const res = await request(app)
      .put('/api/settings/school/auto-pause-timeout')
      .send(updatePayload);

    expect(res.status).toBe(200);
    expect(res.body.idle_minutes).toBe(30);
  });

  test('returns 400 when idle_minutes is out of range', async () => {
    mockCurrentUser = { id: COACH_ID, role: 'coach', school_id: SCHOOL_ID };
    mockSetAutoPauseTimeout.mockRejectedValueOnce(new Error('idle_minutes must be 5–120'));

    const res = await request(app)
      .put('/api/settings/school/auto-pause-timeout')
      .send({ idle_minutes: 200 });

    expect(res.status).toBe(400);
  });
});
