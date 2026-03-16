'use strict';

/**
 * REST API tests — server/index.js Express endpoints
 *
 * Uses supertest against the exported `app` object.
 * The Database module is mocked with an in-memory SQLite instance so
 * tests never touch the real poker_trainer.sqlite file.
 *
 * Coverage:
 *   GET  /health
 *   GET  /api/hands
 *   GET  /api/hands/:handId            (404 path)
 *   GET  /api/players
 *   GET  /api/players/:stableId/stats  (404 path)
 *   GET  /api/players/:stableId/hands
 *   GET  /api/sessions/current
 *   GET  /api/sessions/:sessionId/stats
 *   GET  /api/sessions/:sessionId/report (404 path)
 *   GET  /api/playlists
 *   POST /api/auth/register            (valid + validation errors + duplicate)
 *   POST /api/auth/login               (valid + bad credentials)
 */

// ── Mock Database before anything imports it ─────────────────────────────────
jest.mock('../Database', () => {
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (session_id TEXT PRIMARY KEY, table_id TEXT NOT NULL, started_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS hands (
      hand_id TEXT PRIMARY KEY, session_id TEXT NOT NULL, table_id TEXT NOT NULL,
      started_at INTEGER NOT NULL, ended_at INTEGER, board TEXT,
      final_pot INTEGER DEFAULT 0, winner_id TEXT, winner_name TEXT,
      phase_ended TEXT, completed_normally INTEGER DEFAULT 0,
      auto_tags TEXT, mistake_tags TEXT, coach_tags TEXT,
      dealer_seat INTEGER DEFAULT 0, is_scenario_hand INTEGER DEFAULT 0,
      small_blind INTEGER DEFAULT 0, big_blind INTEGER DEFAULT 0,
      FOREIGN KEY (session_id) REFERENCES sessions(session_id)
    );
    CREATE TABLE IF NOT EXISTS hand_players (
      hand_id TEXT NOT NULL, player_id TEXT NOT NULL, player_name TEXT NOT NULL,
      seat INTEGER, stack_start INTEGER DEFAULT 0, stack_end INTEGER,
      hole_cards TEXT, is_winner INTEGER DEFAULT 0,
      vpip INTEGER DEFAULT 0, pfr INTEGER DEFAULT 0,
      wtsd INTEGER DEFAULT 0, wsd INTEGER DEFAULT 0,
      PRIMARY KEY (hand_id, player_id),
      FOREIGN KEY (hand_id) REFERENCES hands(hand_id)
    );
    CREATE TABLE IF NOT EXISTS hand_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hand_id TEXT NOT NULL, player_id TEXT NOT NULL, player_name TEXT NOT NULL,
      street TEXT NOT NULL, action TEXT NOT NULL, amount INTEGER DEFAULT 0,
      timestamp INTEGER NOT NULL, is_manual_scenario INTEGER DEFAULT 0,
      is_reverted INTEGER DEFAULT 0,
      FOREIGN KEY (hand_id) REFERENCES hands(hand_id)
    );
    CREATE TABLE IF NOT EXISTS playlists (
      playlist_id TEXT PRIMARY KEY, name TEXT NOT NULL,
      description TEXT, table_id TEXT, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS playlist_hands (
      playlist_id TEXT NOT NULL, hand_id TEXT NOT NULL,
      display_order INTEGER NOT NULL DEFAULT 0, added_at INTEGER NOT NULL,
      PRIMARY KEY (playlist_id, hand_id),
      FOREIGN KEY (playlist_id) REFERENCES playlists(playlist_id) ON DELETE CASCADE,
      FOREIGN KEY (hand_id)     REFERENCES hands(hand_id)         ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS player_identities (
      stable_id       TEXT PRIMARY KEY,
      last_known_name TEXT NOT NULL,
      display_name    TEXT,
      email           TEXT UNIQUE,
      password_hash   TEXT,
      last_seen       INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_player_identities_name  ON player_identities(last_known_name);
    CREATE INDEX IF NOT EXISTS idx_hand_players_player     ON hand_players(player_id);
  `);
  return { getDb: () => db, closeDb: () => {} };
});

// ── Now safe to import the app ────────────────────────────────────────────────
const request = require('supertest');
const { app }  = require('../../index');

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
//  /api/hands
// ─────────────────────────────────────────────

describe('GET /api/hands', () => {
  it('returns 200 with hands array and pagination fields', async () => {
    const res = await request(app).get('/api/hands');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.hands)).toBe(true);
    expect(typeof res.body.limit).toBe('number');
    expect(typeof res.body.offset).toBe('number');
  });

  it('returns empty array when no hands have been played', async () => {
    const res = await request(app).get('/api/hands');
    expect(res.body.hands).toHaveLength(0);
  });

  it('respects limit query parameter (capped at 100)', async () => {
    const res = await request(app).get('/api/hands?limit=5');
    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(5);
  });

  it('caps limit at 100', async () => {
    const res = await request(app).get('/api/hands?limit=999');
    expect(res.body.limit).toBe(100);
  });

  it('respects offset query parameter', async () => {
    const res = await request(app).get('/api/hands?offset=10');
    expect(res.body.offset).toBe(10);
  });

  it('accepts tableId filter without crashing', async () => {
    const res = await request(app).get('/api/hands?tableId=main-table');
    expect(res.status).toBe(200);
  });
});

// ─────────────────────────────────────────────
//  /api/hands/:handId
// ─────────────────────────────────────────────

describe('GET /api/hands/:handId', () => {
  it('returns 404 JSON for a non-existent hand', async () => {
    const res = await request(app).get('/api/hands/nonexistent-hand-id');
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });

  it('404 body contains an error field', async () => {
    const res = await request(app).get('/api/hands/does-not-exist');
    expect(typeof res.body.error).toBe('string');
  });
});

// ─────────────────────────────────────────────
//  /api/players
// ─────────────────────────────────────────────

describe('GET /api/players', () => {
  it('returns 200 with a players array', async () => {
    const res = await request(app).get('/api/players');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.players)).toBe(true);
  });

  it('returns empty players list on fresh DB', async () => {
    const res = await request(app).get('/api/players');
    expect(res.body.players).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────
//  /api/players/:stableId/stats
// ─────────────────────────────────────────────

describe('GET /api/players/:stableId/stats', () => {
  it('returns 404 for a player that does not exist', async () => {
    const res = await request(app).get('/api/players/ghost-uuid/stats');
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });
});

// ─────────────────────────────────────────────
//  /api/players/:stableId/hands
// ─────────────────────────────────────────────

describe('GET /api/players/:stableId/hands', () => {
  it('returns 200 with hands array for any stableId', async () => {
    const res = await request(app).get('/api/players/any-uuid/hands');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.hands)).toBe(true);
  });

  it('returns empty hands array for unknown player', async () => {
    const res = await request(app).get('/api/players/unknown-uuid/hands');
    expect(res.body.hands).toHaveLength(0);
  });

  it('respects limit + offset', async () => {
    const res = await request(app).get('/api/players/unknown-uuid/hands?limit=5&offset=2');
    expect(res.body.limit).toBe(5);
    expect(res.body.offset).toBe(2);
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
//  /api/sessions/:sessionId/stats
// ─────────────────────────────────────────────

describe('GET /api/sessions/:sessionId/stats', () => {
  it('returns 200 with empty players for unknown session', async () => {
    const res = await request(app).get('/api/sessions/no-such-session/stats');
    expect(res.status).toBe(200);
    expect(res.body.sessionId).toBe('no-such-session');
    expect(Array.isArray(res.body.players)).toBe(true);
  });
});

// ─────────────────────────────────────────────
//  /api/sessions/:sessionId/report
// ─────────────────────────────────────────────

describe('GET /api/sessions/:sessionId/report', () => {
  it('returns 404 for non-existent session', async () => {
    const res = await request(app).get('/api/sessions/ghost-session/report');
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────
//  /api/playlists
// ─────────────────────────────────────────────

describe('GET /api/playlists', () => {
  it('returns 200 with empty playlists array', async () => {
    const res = await request(app).get('/api/playlists');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.playlists)).toBe(true);
  });

  it('accepts tableId filter', async () => {
    const res = await request(app).get('/api/playlists?tableId=main-table');
    expect(res.status).toBe(200);
  });
});

// ─────────────────────────────────────────────
//  POST /api/auth/register
// ─────────────────────────────────────────────

describe('POST /api/auth/register', () => {
  it('returns 400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'x@x.com', password: 'secret123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_input');
  });

  it('returns 400 when email is missing', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Alice', password: 'secret123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_input');
  });

  it('returns 400 when password is missing', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Alice', email: 'a@b.com' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when password is too short (< 6 chars)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Alice', email: 'a@b.com', password: 'abc' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/6 characters/i);
  });

  it('returns stableId on successful registration', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'TestUser1', email: 'test1@example.com', password: 'password123' });
    expect(res.status).toBe(200);
    expect(typeof res.body.stableId).toBe('string');
    expect(res.body.stableId.length).toBeGreaterThan(0);
  });

  it('returns 409 on duplicate email registration', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ name: 'DupUser', email: 'dup@example.com', password: 'password123' });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'DupUser2', email: 'dup@example.com', password: 'password123' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBeDefined();
  });
});

// ─────────────────────────────────────────────
//  POST /api/auth/login
// ─────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  // Register a user once for login tests
  const TEST_NAME  = 'LoginUser';
  const TEST_EMAIL = 'loginuser@example.com';
  const TEST_PASS  = 'loginpass99';
  let registeredStableId;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: TEST_NAME, email: TEST_EMAIL, password: TEST_PASS });
    registeredStableId = res.body.stableId;
  });

  it('returns 400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: TEST_PASS });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_input');
  });

  it('returns 400 when password is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ name: TEST_NAME });
    expect(res.status).toBe(400);
  });

  it('returns 401 for wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ name: TEST_NAME, password: 'wrongpassword' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
  });

  it('returns 401 for unknown user', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ name: 'NoSuchUser', password: 'anypass' });
    expect(res.status).toBe(401);
  });

  it('returns stableId and name on successful login', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ name: TEST_NAME, password: TEST_PASS });
    expect(res.status).toBe(200);
    expect(res.body.stableId).toBe(registeredStableId);
    expect(res.body.name).toBe(TEST_NAME);
  });
});
