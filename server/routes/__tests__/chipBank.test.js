'use strict';

/**
 * Chip Bank REST route tests.
 *
 * Endpoints covered:
 *   GET  /api/players/:id/chip-balance
 *   POST /api/players/:id/chips          (coach reload)
 *   POST /api/players/:id/chip-adjust    (admin adjustment)
 *   GET  /api/players/:id/chip-history
 *
 * All ChipBankRepository calls are mocked.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../db/repositories/ChipBankRepository', () => ({
  getBalance:            jest.fn(),
  getTransactionHistory: jest.fn(),
  reload:                jest.fn(),
  adjustment:            jest.fn(),
}));

// requireAuth shim — tests control req.user via mockCurrentUser
let mockCurrentUser = null;
jest.mock('../../auth/requireAuth.js', () =>
  jest.fn((req, res, next) => {
    if (!mockCurrentUser) return res.status(401).json({ error: 'auth_required', message: 'Login required' });
    req.user = mockCurrentUser;
    next();
  })
);

// requireRole shim — returns a middleware that checks req.user.role
jest.mock('../../auth/requireRole.js', () =>
  jest.fn((minRole) => (req, res, next) => {
    const hierarchy = ['player', 'student', 'coach', 'moderator', 'admin', 'superadmin'];
    const userIdx   = hierarchy.indexOf(req.user?.role ?? '');
    const minIdx    = hierarchy.indexOf(minRole);
    if (userIdx < minIdx)
      return res.status(403).json({ error: 'forbidden', message: 'Insufficient role' });
    next();
  })
);

// ─── Module under test ────────────────────────────────────────────────────────

const request    = require('supertest');
const express    = require('express');
const requireAuth = require('../../auth/requireAuth.js');
const requireRole = require('../../auth/requireRole.js');
const registerChipBankRoutes = require('../chipBank');
const ChipBankRepo = require('../../db/repositories/ChipBankRepository');

function buildApp() {
  const app = express();
  app.use(express.json());
  registerChipBankRoutes(app, { requireAuth, requireRole });
  return app;
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrentUser = null;

  // Safe defaults
  ChipBankRepo.getBalance.mockResolvedValue(500);
  ChipBankRepo.getTransactionHistory.mockResolvedValue([]);
  ChipBankRepo.reload.mockResolvedValue(1000);
  ChipBankRepo.adjustment.mockResolvedValue(800);
});

// ─── GET /api/players/:id/chip-balance ────────────────────────────────────────

describe('GET /api/players/:id/chip-balance', () => {
  const app = buildApp();

  test('returns balance for own profile', async () => {
    mockCurrentUser = { stableId: 'player-uuid-1', id: 'player-uuid-1', role: 'player' };
    ChipBankRepo.getBalance.mockResolvedValue(750);

    const res = await request(app).get('/api/players/player-uuid-1/chip-balance');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ playerId: 'player-uuid-1', balance: 750 });
  });

  test('allows coach to read any player balance', async () => {
    mockCurrentUser = { stableId: 'coach-uuid', id: 'coach-uuid', role: 'coach' };
    ChipBankRepo.getBalance.mockResolvedValue(300);

    const res = await request(app).get('/api/players/other-player-uuid/chip-balance');
    expect(res.status).toBe(200);
    expect(res.body.balance).toBe(300);
  });

  test('returns 403 when player reads another player balance', async () => {
    mockCurrentUser = { stableId: 'player-uuid-1', id: 'player-uuid-1', role: 'player' };

    const res = await request(app).get('/api/players/other-player-uuid/chip-balance');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('forbidden');
  });

  test('returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/players/player-uuid-1/chip-balance');
    expect(res.status).toBe(401);
  });

  test('returns 500 on DB error', async () => {
    mockCurrentUser = { stableId: 'player-uuid-1', id: 'player-uuid-1', role: 'player' };
    ChipBankRepo.getBalance.mockRejectedValue(new Error('DB down'));

    const res = await request(app).get('/api/players/player-uuid-1/chip-balance');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('internal_error');
  });
});

// ─── POST /api/players/:id/chips ─────────────────────────────────────────────

describe('POST /api/players/:id/chips', () => {
  const app = buildApp();

  test('coach can reload chips', async () => {
    mockCurrentUser = { stableId: 'coach-uuid', id: 'coach-uuid', role: 'coach' };
    ChipBankRepo.reload.mockResolvedValue(1500);

    const res = await request(app)
      .post('/api/players/player-uuid-1/chips')
      .send({ amount: 500 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, playerId: 'player-uuid-1', newBalance: 1500 });
    expect(ChipBankRepo.reload).toHaveBeenCalledWith('player-uuid-1', 500, 'coach-uuid', null);
  });

  test('admin can reload chips', async () => {
    mockCurrentUser = { stableId: 'admin-uuid', id: 'admin-uuid', role: 'admin' };
    ChipBankRepo.reload.mockResolvedValue(2000);

    const res = await request(app)
      .post('/api/players/player-uuid-1/chips')
      .send({ amount: 1000, notes: 'bonus' });
    expect(res.status).toBe(200);
    expect(ChipBankRepo.reload).toHaveBeenCalledWith('player-uuid-1', 1000, 'admin-uuid', 'bonus');
  });

  test('regular player cannot reload chips', async () => {
    mockCurrentUser = { stableId: 'player-uuid-1', id: 'player-uuid-1', role: 'player' };

    const res = await request(app)
      .post('/api/players/player-uuid-1/chips')
      .send({ amount: 500 });
    expect(res.status).toBe(403);
  });

  test('returns 400 for zero amount', async () => {
    mockCurrentUser = { stableId: 'coach-uuid', id: 'coach-uuid', role: 'coach' };

    const res = await request(app)
      .post('/api/players/player-uuid-1/chips')
      .send({ amount: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_amount');
  });

  test('returns 400 for negative amount', async () => {
    mockCurrentUser = { stableId: 'coach-uuid', id: 'coach-uuid', role: 'coach' };

    const res = await request(app)
      .post('/api/players/player-uuid-1/chips')
      .send({ amount: -100 });
    expect(res.status).toBe(400);
  });

  test('returns 400 for non-integer amount', async () => {
    mockCurrentUser = { stableId: 'coach-uuid', id: 'coach-uuid', role: 'coach' };

    const res = await request(app)
      .post('/api/players/player-uuid-1/chips')
      .send({ amount: 10.5 });
    expect(res.status).toBe(400);
  });

  test('returns 422 for insufficient_funds', async () => {
    mockCurrentUser = { stableId: 'coach-uuid', id: 'coach-uuid', role: 'coach' };
    ChipBankRepo.reload.mockRejectedValue(new Error('insufficient_funds'));

    const res = await request(app)
      .post('/api/players/player-uuid-1/chips')
      .send({ amount: 100 });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('insufficient_funds');
  });

  test('returns 500 on generic DB error', async () => {
    mockCurrentUser = { stableId: 'coach-uuid', id: 'coach-uuid', role: 'coach' };
    ChipBankRepo.reload.mockRejectedValue(new Error('connection refused'));

    const res = await request(app)
      .post('/api/players/player-uuid-1/chips')
      .send({ amount: 100 });
    expect(res.status).toBe(500);
  });
});

// ─── POST /api/players/:id/chip-adjust ───────────────────────────────────────

describe('POST /api/players/:id/chip-adjust', () => {
  const app = buildApp();

  test('admin can make positive adjustment', async () => {
    mockCurrentUser = { stableId: 'admin-uuid', id: 'admin-uuid', role: 'admin' };
    ChipBankRepo.adjustment.mockResolvedValue(1100);

    const res = await request(app)
      .post('/api/players/player-uuid-1/chip-adjust')
      .send({ amount: 200, notes: 'bonus chips' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, newBalance: 1100 });
    expect(ChipBankRepo.adjustment).toHaveBeenCalledWith('player-uuid-1', 200, 'admin-uuid', 'bonus chips');
  });

  test('admin can make negative adjustment', async () => {
    mockCurrentUser = { stableId: 'admin-uuid', id: 'admin-uuid', role: 'admin' };
    ChipBankRepo.adjustment.mockResolvedValue(800);

    const res = await request(app)
      .post('/api/players/player-uuid-1/chip-adjust')
      .send({ amount: -100 });
    expect(res.status).toBe(200);
    expect(ChipBankRepo.adjustment).toHaveBeenCalledWith('player-uuid-1', -100, 'admin-uuid', null);
  });

  test('coach cannot adjust chips (admin-only)', async () => {
    mockCurrentUser = { stableId: 'coach-uuid', id: 'coach-uuid', role: 'coach' };

    const res = await request(app)
      .post('/api/players/player-uuid-1/chip-adjust')
      .send({ amount: 100 });
    expect(res.status).toBe(403);
  });

  test('returns 400 for zero amount', async () => {
    mockCurrentUser = { stableId: 'admin-uuid', id: 'admin-uuid', role: 'admin' };

    const res = await request(app)
      .post('/api/players/player-uuid-1/chip-adjust')
      .send({ amount: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_amount');
  });

  test('returns 422 for insufficient_funds on large debit', async () => {
    mockCurrentUser = { stableId: 'admin-uuid', id: 'admin-uuid', role: 'admin' };
    ChipBankRepo.adjustment.mockRejectedValue(new Error('insufficient_funds'));

    const res = await request(app)
      .post('/api/players/player-uuid-1/chip-adjust')
      .send({ amount: -99999 });
    expect(res.status).toBe(422);
  });
});

// ─── GET /api/players/:id/chip-history ───────────────────────────────────────

describe('GET /api/players/:id/chip-history', () => {
  const app = buildApp();

  const sampleTxns = [
    { id: 2, amount: -100, type: 'buy_in',  created_at: '2026-04-01T10:00:00Z' },
    { id: 1, amount: 1000, type: 'reload',  created_at: '2026-04-01T09:00:00Z' },
  ];

  test('returns own transaction history', async () => {
    mockCurrentUser = { stableId: 'player-uuid-1', id: 'player-uuid-1', role: 'player' };
    ChipBankRepo.getTransactionHistory.mockResolvedValue(sampleTxns);

    const res = await request(app).get('/api/players/player-uuid-1/chip-history');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ playerId: 'player-uuid-1', transactions: sampleTxns });
  });

  test('coach can read any player history', async () => {
    mockCurrentUser = { stableId: 'coach-uuid', id: 'coach-uuid', role: 'coach' };
    ChipBankRepo.getTransactionHistory.mockResolvedValue(sampleTxns);

    const res = await request(app).get('/api/players/player-uuid-1/chip-history');
    expect(res.status).toBe(200);
    expect(res.body.transactions).toEqual(sampleTxns);
  });

  test('returns 403 when player reads another player history', async () => {
    mockCurrentUser = { stableId: 'player-uuid-1', id: 'player-uuid-1', role: 'player' };

    const res = await request(app).get('/api/players/other-player-uuid/chip-history');
    expect(res.status).toBe(403);
  });

  test('passes limit and offset query params to repository', async () => {
    mockCurrentUser = { stableId: 'player-uuid-1', id: 'player-uuid-1', role: 'player' };
    ChipBankRepo.getTransactionHistory.mockResolvedValue([]);

    const res = await request(app).get('/api/players/player-uuid-1/chip-history?limit=25&offset=50');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ limit: 25, offset: 50 });
    expect(ChipBankRepo.getTransactionHistory).toHaveBeenCalledWith('player-uuid-1', { limit: 25, offset: 50 });
  });

  test('clamps limit to 200 max', async () => {
    mockCurrentUser = { stableId: 'player-uuid-1', id: 'player-uuid-1', role: 'player' };
    ChipBankRepo.getTransactionHistory.mockResolvedValue([]);

    const res = await request(app).get('/api/players/player-uuid-1/chip-history?limit=9999');
    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(200);
  });

  test('defaults to limit=50 offset=0 when not provided', async () => {
    mockCurrentUser = { stableId: 'player-uuid-1', id: 'player-uuid-1', role: 'player' };
    ChipBankRepo.getTransactionHistory.mockResolvedValue([]);

    await request(app).get('/api/players/player-uuid-1/chip-history');
    expect(ChipBankRepo.getTransactionHistory).toHaveBeenCalledWith('player-uuid-1', { limit: 50, offset: 0 });
  });

  test('returns 500 on DB error', async () => {
    mockCurrentUser = { stableId: 'player-uuid-1', id: 'player-uuid-1', role: 'player' };
    ChipBankRepo.getTransactionHistory.mockRejectedValue(new Error('timeout'));

    const res = await request(app).get('/api/players/player-uuid-1/chip-history');
    expect(res.status).toBe(500);
  });

  test('returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/players/player-uuid-1/chip-history');
    expect(res.status).toBe(401);
  });
});
