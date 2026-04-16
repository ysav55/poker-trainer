'use strict';

/**
 * Players API — integration-style tests using supertest.
 *
 * Covers GET /api/players/:stableId/stats endpoint:
 *   - Returns zero-state shape when getPlayerStatsByMode returns null (new user)
 *   - Returns real stats when getPlayerStatsByMode returns data
 *   - Returns 401 without auth
 *   - Defaults mode to 'overall' when not specified
 *   - Returns 500 when getPlayerStatsByMode throws
 */

// Mock supabase so that requiring players.js doesn't throw due to missing env vars
jest.mock('../../db/supabase', () => ({}));

// Mock SettingsService
jest.mock('../../services/SettingsService.js', () => ({
  resolveLeaderboardConfig: jest.fn().mockResolvedValue({
    value: { primary_metric: 'net_chips', secondary_metric: 'win_rate', update_frequency: 'after_session' },
    source: 'hardcoded',
  }),
}));

// Mock PlayerRepository
jest.mock('../../db/repositories/PlayerRepository.js', () => ({
  findById: jest.fn().mockResolvedValue({ id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', school_id: 'school-123' }),
}));

const express = require('express');
const request = require('supertest');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PLAYER_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

const ZERO_STATE = {
  hands_played: 0,
  hands_won: 0,
  net_chips: 0,
  vpip: 0,
  pfr: 0,
  wtsd: 0,
  wsd: 0,
  rank: null,
  total_players: null,
  trial_days_left: null,
  hands_left: null,
  trial_status: null,
};

const REAL_STATS = {
  player_id: PLAYER_ID,
  total_hands: 42,
  total_wins: 10,
  total_net_chips: 350,
  vpip_percent: 28,
  pfr_percent: 18,
};

/**
 * Build a minimal Express app with a mock HandLogger and fake requireAuth.
 */
function buildApp({ user = null, getPlayerStatsByMode = jest.fn() } = {}) {
  const app = express();
  app.use(express.json());

  const requireAuth = (req, res, next) => {
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    req.user = user;
    return next();
  };

  const HandLogger = { getPlayerStatsByMode };
  const registerPlayerRoutes = require('../../routes/players');
  registerPlayerRoutes(app, { requireAuth, HandLogger });

  return app;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/players/:stableId/stats', () => {
  test('returns 401 without auth', async () => {
    const app = buildApp({ user: null });
    const res = await request(app).get(`/api/players/${PLAYER_ID}/stats`);
    expect(res.status).toBe(401);
  });

  test('returns 200 with zero-state shape when getPlayerStatsByMode returns null', async () => {
    const mockFn = jest.fn().mockResolvedValue(null);
    const app = buildApp({
      user: { id: PLAYER_ID },
      getPlayerStatsByMode: mockFn,
    });

    const res = await request(app).get(`/api/players/${PLAYER_ID}/stats`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(ZERO_STATE);
    expect(mockFn).toHaveBeenCalledWith(PLAYER_ID, 'overall');
  });

  test('zero-state includes trial_status from req.user.trialStatus', async () => {
    const mockFn = jest.fn().mockResolvedValue(null);
    const app = buildApp({
      user: { id: PLAYER_ID, trialStatus: 'active' },
      getPlayerStatsByMode: mockFn,
    });

    const res = await request(app).get(`/api/players/${PLAYER_ID}/stats`);
    expect(res.status).toBe(200);
    expect(res.body.trial_status).toBe('active');
    expect(res.body.trial_days_left).toBeNull();
    expect(res.body.hands_left).toBeNull();
  });

  test('returns 200 with real stats when getPlayerStatsByMode returns data', async () => {
    const mockFn = jest.fn().mockResolvedValue(REAL_STATS);
    const app = buildApp({
      user: { id: PLAYER_ID },
      getPlayerStatsByMode: mockFn,
    });

    const res = await request(app).get(`/api/players/${PLAYER_ID}/stats?mode=bot`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(REAL_STATS);
    expect(mockFn).toHaveBeenCalledWith(PLAYER_ID, 'bot');
  });

  test('defaults mode to overall when query param is invalid', async () => {
    const mockFn = jest.fn().mockResolvedValue(REAL_STATS);
    const app = buildApp({
      user: { id: PLAYER_ID },
      getPlayerStatsByMode: mockFn,
    });

    const res = await request(app).get(`/api/players/${PLAYER_ID}/stats?mode=invalid`);
    expect(res.status).toBe(200);
    expect(mockFn).toHaveBeenCalledWith(PLAYER_ID, 'overall');
  });

  test('returns 500 when getPlayerStatsByMode throws', async () => {
    const mockFn = jest.fn().mockRejectedValue(new Error('DB down'));
    const app = buildApp({
      user: { id: PLAYER_ID },
      getPlayerStatsByMode: mockFn,
    });

    const res = await request(app).get(`/api/players/${PLAYER_ID}/stats`);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'internal_error' });
  });
});

describe('GET /api/players', () => {
  const SCHOOL_ID = 'school-aaa';

  test('returns 200 with players and leaderboardConfig', async () => {
    const mockPlayers = [
      { stableId: 'player-1', name: 'Alice', net_chips: 500 },
      { stableId: 'player-2', name: 'Bob', net_chips: 300 },
    ];

    const mockLeaderboardConfig = {
      value: { primary_metric: 'net_chips', secondary_metric: 'win_rate', update_frequency: 'after_session' },
      source: 'hardcoded',
    };

    const app = express();
    app.use(express.json());

    const requireAuth = (req, res, next) => {
      req.user = { id: PLAYER_ID, stableId: PLAYER_ID };
      next();
    };

    // Create a minimal test app by bypassing the normal players.js module loading
    // We'll need to refactor players.js to accept SettingsService as a parameter
    const HandLogger = {
      getAllPlayersWithStats: jest.fn().mockResolvedValue(mockPlayers),
      getPlayerStatsByMode: jest.fn(),
    };

    const registerPlayerRoutes = require('../../routes/players');
    registerPlayerRoutes(app, { requireAuth, HandLogger });

    const res = await request(app)
      .get('/api/players?period=7d&gameType=cash');

    expect(res.status).toBe(200);
    expect(res.body.players).toEqual(mockPlayers);
    // Once implemented, the response should include leaderboardConfig
    expect(res.body).toHaveProperty('leaderboardConfig');
    expect(res.body.leaderboardConfig).toHaveProperty('value');
    expect(res.body.leaderboardConfig).toHaveProperty('source');
    expect(res.body.leaderboardConfig.value).toHaveProperty('primary_metric');
    expect(res.body.leaderboardConfig.value).toHaveProperty('secondary_metric');
    expect(res.body.leaderboardConfig.value).toHaveProperty('update_frequency');
  });
});
