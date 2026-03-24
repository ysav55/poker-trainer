'use strict';

/**
 * REST API tests — server/index.js Express endpoints
 *
 * Uses supertest against the exported `app` object.
 * HandLoggerSupabase, PlayerRoster, and the Supabase admin client are mocked
 * so tests never touch the real database or Supabase project.
 *
 * Coverage:
 *   GET  /health
 *   GET  /api/hands                       (requires auth)
 *   GET  /api/hands/:handId               (requires auth, 404 path)
 *   GET  /api/players                     (requires auth)
 *   GET  /api/players/:stableId/stats     (requires auth, 404 path)
 *   GET  /api/players/:stableId/hands     (requires auth)
 *   GET  /api/players/:stableId/hover-stats (no auth required)
 *   GET  /api/sessions/current            (no auth required)
 *   GET  /api/sessions/:sessionId/stats   (requires auth)
 *   GET  /api/sessions/:sessionId/report  (requires auth, 404 path)
 *   POST /api/auth/register               (disabled → 410)
 *   POST /api/auth/login                  (roster-based, returns JWT)
 */

// ── Mock HandLoggerSupabase ───────────────────────────────────────────────────
jest.mock('../HandLoggerSupabase', () => {
  const { v4: uuidv4 } = require('uuid');
  const _players = new Map(); // name → stableId

  return {
    startHand:             jest.fn().mockResolvedValue(undefined),
    recordAction:          jest.fn().mockResolvedValue(undefined),
    endHand:               jest.fn().mockResolvedValue(undefined),
    markIncomplete:        jest.fn().mockResolvedValue(undefined),
    analyzeAndTagHand:     jest.fn().mockResolvedValue({ auto_tags: [], mistake_tags: [] }),
    markLastActionReverted:jest.fn().mockResolvedValue(undefined),
    upsertPlayerIdentity:  jest.fn().mockResolvedValue(undefined),
    ensureSession:         jest.fn().mockResolvedValue(undefined),
    updateCoachTags:       jest.fn().mockResolvedValue(undefined),
    getHands:              jest.fn().mockResolvedValue([]),
    getHandDetail:         jest.fn().mockResolvedValue(null),
    getSessionStats:       jest.fn().mockResolvedValue([]),
    getSessionReport:      jest.fn().mockResolvedValue(null),
    getPlayerStats:        jest.fn().mockResolvedValue(null),
    getAllPlayersWithStats: jest.fn().mockResolvedValue([]),
    getPlayerHands:        jest.fn().mockResolvedValue([]),
    getPlayerHoverStats:   jest.fn().mockResolvedValue({ allTime: null, session: null }),
    createPlaylist:        jest.fn().mockResolvedValue({ playlist_id: 'pl1', name: 'test' }),
    getPlaylists:          jest.fn().mockResolvedValue([]),
    getPlaylistHands:      jest.fn().mockResolvedValue([]),
    addHandToPlaylist:     jest.fn().mockResolvedValue({}),
    removeHandFromPlaylist:jest.fn().mockResolvedValue(undefined),
    deletePlaylist:        jest.fn().mockResolvedValue(undefined),
    registerPlayerAccount: jest.fn().mockResolvedValue({ error: 'registration_disabled' }),
    loginPlayerAccount:    jest.fn().mockResolvedValue({ error: 'registration_disabled' }),
    _computePositions:     jest.fn().mockReturnValue(new Map()),
    isRegisteredPlayer:    jest.fn().mockResolvedValue(true),
    loginRosterPlayer: jest.fn(async (name) => {
      const trimmed = name.trim();
      if (!_players.has(trimmed)) _players.set(trimmed, uuidv4());
      return { stableId: _players.get(trimmed), name: trimmed };
    }),
    // Sync JWT verification — returns payload if token is non-empty and not 'invalid-token'
    authenticateToken: jest.fn((token) => {
      if (!token || token === 'invalid-token') return null;
      return { stableId: 'test-stable-id', name: 'TestUser', role: 'student' };
    }),
  };
});

// ── Mock PlayerRoster (used by POST /api/auth/login) ─────────────────────────
jest.mock('../../auth/PlayerRoster', () => ({
  authenticate: jest.fn(async (name, password) => {
    if (name === 'ValidPlayer' && password === 'validpass') {
      return { name: 'ValidPlayer', passwordHash: '<hash>', role: 'student' };
    }
    if (name === 'CoachPlayer' && password === 'coachpass') {
      return { name: 'CoachPlayer', passwordHash: '<hash>', role: 'coach' };
    }
    return null;
  }),
  getRole: jest.fn(() => null),
  load:    jest.fn(),
  reload:  jest.fn(),
}));

// ── Mock supabase admin client ───────────────────────────────────────────────
// Supports the health-check probe (select from player_profiles) and any insert calls.
jest.mock('../supabase', () => {
  const chain = {
    insert:      jest.fn().mockResolvedValue({ data: null, error: null }),
    select:      jest.fn().mockReturnThis(),
    limit:       jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
  };
  return { from: jest.fn(() => chain) };
});

// ── Ensure required env vars are set before index.js is loaded ───────────────
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-for-jest';

// ── Now safe to import the app ────────────────────────────────────────────────
const request = require('supertest');
const { app }  = require('../../index');

// Valid auth header used by all protected endpoints
const AUTH_HEADER = 'Bearer valid-test-token';

// ─────────────────────────────────────────────
//  /health
// ─────────────────────────────────────────────

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('response includes tables count', async () => {
    const res = await request(app).get('/health');
    expect(typeof res.body.tables).toBe('number');
  });
});

// ─────────────────────────────────────────────
//  /api/hands  (requires auth)
// ─────────────────────────────────────────────

describe('GET /api/hands', () => {
  it('returns 401 without auth header', async () => {
    const res = await request(app).get('/api/hands');
    expect(res.status).toBe(401);
  });

  it('returns 200 with hands array and pagination fields', async () => {
    const res = await request(app).get('/api/hands').set('Authorization', AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.hands)).toBe(true);
    expect(typeof res.body.limit).toBe('number');
    expect(typeof res.body.offset).toBe('number');
  });

  it('returns empty array when no hands have been played', async () => {
    const res = await request(app).get('/api/hands').set('Authorization', AUTH_HEADER);
    expect(res.body.hands).toHaveLength(0);
  });

  it('respects limit query parameter (capped at 100)', async () => {
    const res = await request(app).get('/api/hands?limit=5').set('Authorization', AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(5);
  });

  it('caps limit at 100', async () => {
    const res = await request(app).get('/api/hands?limit=999').set('Authorization', AUTH_HEADER);
    expect(res.body.limit).toBe(100);
  });

  it('respects offset query parameter', async () => {
    const res = await request(app).get('/api/hands?offset=10').set('Authorization', AUTH_HEADER);
    expect(res.body.offset).toBe(10);
  });

  it('accepts tableId filter without crashing', async () => {
    const res = await request(app).get('/api/hands?tableId=main-table').set('Authorization', AUTH_HEADER);
    expect(res.status).toBe(200);
  });
});

// ─────────────────────────────────────────────
//  /api/hands/:handId  (requires auth)
// ─────────────────────────────────────────────

describe('GET /api/hands/:handId', () => {
  it('returns 401 without auth header', async () => {
    const res = await request(app).get('/api/hands/some-hand-id');
    expect(res.status).toBe(401);
  });

  it('returns 404 JSON for a non-existent hand', async () => {
    const res = await request(app).get('/api/hands/nonexistent-hand-id').set('Authorization', AUTH_HEADER);
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });

  it('404 body contains an error field', async () => {
    const res = await request(app).get('/api/hands/does-not-exist').set('Authorization', AUTH_HEADER);
    expect(typeof res.body.error).toBe('string');
  });
});

// ─────────────────────────────────────────────
//  /api/players  (requires auth)
// ─────────────────────────────────────────────

describe('GET /api/players', () => {
  it('returns 401 without auth header', async () => {
    const res = await request(app).get('/api/players');
    expect(res.status).toBe(401);
  });

  it('returns 200 with a players array', async () => {
    const res = await request(app).get('/api/players').set('Authorization', AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.players)).toBe(true);
  });

  it('returns empty players list on fresh DB', async () => {
    const res = await request(app).get('/api/players').set('Authorization', AUTH_HEADER);
    expect(res.body.players).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────
//  /api/players/:stableId/stats  (requires auth)
// ─────────────────────────────────────────────

describe('GET /api/players/:stableId/stats', () => {
  it('returns 401 without auth header', async () => {
    const res = await request(app).get('/api/players/ghost-uuid/stats');
    expect(res.status).toBe(401);
  });

  it('returns 404 for a player that does not exist', async () => {
    const res = await request(app).get('/api/players/ghost-uuid/stats').set('Authorization', AUTH_HEADER);
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });
});

// ─────────────────────────────────────────────
//  /api/players/:stableId/hands  (requires auth)
// ─────────────────────────────────────────────

describe('GET /api/players/:stableId/hands', () => {
  it('returns 401 without auth header', async () => {
    const res = await request(app).get('/api/players/any-uuid/hands');
    expect(res.status).toBe(401);
  });

  it('returns 200 with hands array for any stableId', async () => {
    const res = await request(app).get('/api/players/any-uuid/hands').set('Authorization', AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.hands)).toBe(true);
  });

  it('returns empty hands array for unknown player', async () => {
    const res = await request(app).get('/api/players/unknown-uuid/hands').set('Authorization', AUTH_HEADER);
    expect(res.body.hands).toHaveLength(0);
  });

  it('respects limit + offset', async () => {
    const res = await request(app).get('/api/players/unknown-uuid/hands?limit=5&offset=2').set('Authorization', AUTH_HEADER);
    expect(res.body.limit).toBe(5);
    expect(res.body.offset).toBe(2);
  });
});

// ─────────────────────────────────────────────
//  /api/players/:stableId/hover-stats  (no auth)
// ─────────────────────────────────────────────

describe('GET /api/players/:stableId/hover-stats', () => {
  it('returns 200 without auth header', async () => {
    const res = await request(app).get('/api/players/any-uuid/hover-stats');
    expect(res.status).toBe(200);
  });

  it('returns allTime and session fields', async () => {
    const res = await request(app).get('/api/players/any-uuid/hover-stats');
    expect(res.body).toHaveProperty('allTime');
    expect(res.body).toHaveProperty('session');
  });

  it('accepts optional sessionId query param', async () => {
    const res = await request(app).get('/api/players/any-uuid/hover-stats?sessionId=test-session');
    expect(res.status).toBe(200);
  });
});

// ─────────────────────────────────────────────
//  /api/sessions/current
// ─────────────────────────────────────────────

describe('GET /api/sessions/current', () => {
  it('returns 200 with players array when no game is running', async () => {
    const res = await request(app).get('/api/sessions/current');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.players)).toBe(true);
  });
});

// ─────────────────────────────────────────────
//  /api/sessions/:sessionId/stats  (requires auth)
// ─────────────────────────────────────────────

describe('GET /api/sessions/:sessionId/stats', () => {
  it('returns 401 without auth header', async () => {
    const res = await request(app).get('/api/sessions/no-such-session/stats');
    expect(res.status).toBe(401);
  });

  it('returns 200 with empty players for unknown session', async () => {
    const res = await request(app).get('/api/sessions/no-such-session/stats').set('Authorization', AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(res.body.sessionId).toBe('no-such-session');
    expect(Array.isArray(res.body.players)).toBe(true);
  });
});

// ─────────────────────────────────────────────
//  /api/sessions/:sessionId/report  (requires auth)
// ─────────────────────────────────────────────

describe('GET /api/sessions/:sessionId/report', () => {
  it('returns 401 without auth header', async () => {
    const res = await request(app).get('/api/sessions/ghost-session/report');
    expect(res.status).toBe(401);
  });

  it('returns 404 for non-existent session', async () => {
    const res = await request(app).get('/api/sessions/ghost-session/report').set('Authorization', AUTH_HEADER);
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────
//  POST /api/auth/register  (disabled → 410)
// ─────────────────────────────────────────────

describe('POST /api/auth/register', () => {
  it('returns 410 for any registration attempt', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Alice', password: 'password1' });
    expect(res.status).toBe(410);
    expect(res.body.error).toBe('registration_disabled');
  });

  it('410 response includes a message about contacting the coach', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({});
    expect(res.status).toBe(410);
    expect(res.body.message).toMatch(/coach|roster/i);
  });
});

// ─────────────────────────────────────────────
//  POST /api/auth/login  (roster-based JWT)
// ─────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  it('returns 400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: 'validpass' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_input');
  });

  it('returns 400 when password is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ name: 'ValidPlayer' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_input');
  });

  it('returns 401 for invalid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ name: 'ValidPlayer', password: 'wrongpass' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('invalid_credentials');
  });

  it('returns 200 with token and stableId for valid student login', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ name: 'ValidPlayer', password: 'validpass' });
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(typeof res.body.stableId).toBe('string');
    expect(res.body.name).toBe('ValidPlayer');
    expect(res.body.role).toBe('student');
  });

  it('returns role coach for coach login', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ name: 'CoachPlayer', password: 'coachpass' });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('coach');
  });

  it('returned token is a non-empty string', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ name: 'ValidPlayer', password: 'validpass' });
    expect(res.body.token.length).toBeGreaterThan(10);
  });
});
