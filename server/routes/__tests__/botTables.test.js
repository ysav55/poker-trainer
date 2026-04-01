'use strict';

/**
 * Bot Tables REST route tests.
 *
 * Endpoints covered:
 *   POST /api/bot-tables  — create bot table
 *   GET  /api/bot-tables  — list visible bot tables
 *
 * All BotTableRepository calls are mocked.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../db/repositories/BotTableRepository', () => ({
  createBotTable: jest.fn(),
  getBotTables:   jest.fn(),
}));

let mockCurrentUser = null;
jest.mock('../../auth/requireAuth.js', () =>
  jest.fn((req, _res, next) => {
    if (!mockCurrentUser) return _res.status(401).json({ error: 'auth_required' });
    req.user = mockCurrentUser;
    next();
  })
);

// ─── Module under test ────────────────────────────────────────────────────────

const request    = require('supertest');
const express    = require('express');
const requireAuth = require('../../auth/requireAuth.js');
const registerBotTableRoutes = require('../botTables');
const BotTableRepo = require('../../db/repositories/BotTableRepository');

function buildApp() {
  const app = express();
  app.use(express.json());
  registerBotTableRoutes(app, { requireAuth });
  return app;
}

const app = buildApp();

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const playerUser = { stableId: 'player-1', name: 'Alice', role: 'player' };
const coachUser  = { stableId: 'coach-1',  name: 'Coach', role: 'coach'  };

const createdTable = {
  id: 'tid-abc', name: 'My Bot Table', mode: 'bot_cash', status: 'waiting',
  privacy: 'private', bot_config: { difficulty: 'easy', human_seats: 2, blinds: { small: 5, big: 10 } },
  created_by: 'player-1', created_at: '2026-04-01T00:00:00Z',
};

const validBody = {
  name: 'My Bot Table',
  difficulty: 'easy',
  humanSeats: 2,
  blinds: { small: 5, big: 10 },
};

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrentUser = null;
  BotTableRepo.createBotTable.mockResolvedValue(createdTable);
  BotTableRepo.getBotTables.mockResolvedValue([createdTable]);
});

// ─── POST /api/bot-tables ─────────────────────────────────────────────────────

describe('POST /api/bot-tables', () => {
  test('returns 401 when not authenticated', async () => {
    const res = await request(app).post('/api/bot-tables').send(validBody);
    expect(res.status).toBe(401);
  });

  test('returns 201 with table on success (player)', async () => {
    mockCurrentUser = playerUser;
    const res = await request(app).post('/api/bot-tables').send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.table).toMatchObject({ id: 'tid-abc', mode: 'bot_cash' });
    expect(BotTableRepo.createBotTable).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'My Bot Table',
        creatorId:   'player-1',
        creatorRole: 'player',
        difficulty:  'easy',
        humanSeats:  2,
        blinds:      { small: 5, big: 10 },
      })
    );
  });

  test('returns 201 with table on success (coach)', async () => {
    mockCurrentUser = coachUser;
    const res = await request(app).post('/api/bot-tables').send(validBody);
    expect(res.status).toBe(201);
    expect(BotTableRepo.createBotTable).toHaveBeenCalledWith(
      expect.objectContaining({ creatorRole: 'coach' })
    );
  });

  test('returns 400 when name is missing', async () => {
    mockCurrentUser = playerUser;
    const res = await request(app).post('/api/bot-tables').send({ ...validBody, name: '' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_name');
  });

  test('returns 400 when difficulty is invalid', async () => {
    mockCurrentUser = playerUser;
    const res = await request(app).post('/api/bot-tables').send({ ...validBody, difficulty: 'extreme' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_difficulty');
  });

  test('returns 400 when humanSeats is out of range', async () => {
    mockCurrentUser = playerUser;
    const res = await request(app).post('/api/bot-tables').send({ ...validBody, humanSeats: 9 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_human_seats');
  });

  test('returns 400 when humanSeats is 0', async () => {
    mockCurrentUser = playerUser;
    const res = await request(app).post('/api/bot-tables').send({ ...validBody, humanSeats: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_human_seats');
  });

  test('returns 400 when blinds are invalid (big < small)', async () => {
    mockCurrentUser = playerUser;
    const res = await request(app).post('/api/bot-tables').send({ ...validBody, blinds: { small: 10, big: 5 } });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_blinds');
  });

  test('returns 400 when blinds are missing', async () => {
    mockCurrentUser = playerUser;
    const { blinds: _b, ...noBlind } = validBody;
    const res = await request(app).post('/api/bot-tables').send(noBlind);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_blinds');
  });

  test('returns 500 on repository error', async () => {
    mockCurrentUser = playerUser;
    BotTableRepo.createBotTable.mockRejectedValue(new Error('DB error'));
    const res = await request(app).post('/api/bot-tables').send(validBody);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('internal_error');
  });

  test('trims whitespace from name', async () => {
    mockCurrentUser = playerUser;
    await request(app).post('/api/bot-tables').send({ ...validBody, name: '  My Table  ' });
    expect(BotTableRepo.createBotTable).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'My Table' })
    );
  });
});

// ─── GET /api/bot-tables ──────────────────────────────────────────────────────

describe('GET /api/bot-tables', () => {
  test('returns 401 when not authenticated', async () => {
    const res = await request(app).get('/api/bot-tables');
    expect(res.status).toBe(401);
  });

  test('returns tables array for authenticated player', async () => {
    mockCurrentUser = playerUser;
    const res = await request(app).get('/api/bot-tables');
    expect(res.status).toBe(200);
    expect(res.body.tables).toHaveLength(1);
    expect(res.body.tables[0]).toMatchObject({ id: 'tid-abc' });
    expect(BotTableRepo.getBotTables).toHaveBeenCalledWith('player-1', 'player');
  });

  test('passes coach role to repository', async () => {
    mockCurrentUser = coachUser;
    await request(app).get('/api/bot-tables');
    expect(BotTableRepo.getBotTables).toHaveBeenCalledWith('coach-1', 'coach');
  });

  test('returns empty array when no tables exist', async () => {
    mockCurrentUser = playerUser;
    BotTableRepo.getBotTables.mockResolvedValue([]);
    const res = await request(app).get('/api/bot-tables');
    expect(res.status).toBe(200);
    expect(res.body.tables).toEqual([]);
  });

  test('returns 500 on repository error', async () => {
    mockCurrentUser = playerUser;
    BotTableRepo.getBotTables.mockRejectedValue(new Error('DB error'));
    const res = await request(app).get('/api/bot-tables');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('internal_error');
  });
});
