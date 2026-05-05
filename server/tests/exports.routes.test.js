'use strict';

jest.mock('../db/repositories/HandRepository.js');
jest.mock('../auth/requireAuth.js');
jest.mock('../auth/requireRole.js');
jest.mock('../auth/requireSchool.js');

const request = require('supertest');
const express = require('express');

const HandRepository = require('../db/repositories/HandRepository.js');
const requireAuth = require('../auth/requireAuth.js');
const requireRole = require('../auth/requireRole.js');
const requireSchool = require('../auth/requireSchool.js');

beforeEach(() => {
  jest.clearAllMocks();

  // Setup default middleware behavior
  requireAuth.mockImplementation((req, _res, next) => {
    req.user = { id: 'coach-1', stableId: 'coach-1', name: 'Test Coach', role: 'coach' };
    next();
  });

  requireRole.mockImplementation(() => (_req, _res, next) => next());

  requireSchool.mockImplementation((req, _res, next) => {
    req.user.school_id = 's-1';
    next();
  });
});

function makeApp() {
  const app = express();
  app.use(express.json());
  require('../routes/exports.js')(app, { requireAuth });
  return app;
}

describe('GET /api/exports/hands', () => {
  it('returns 400 when tableId is missing', async () => {
    const res = await request(makeApp()).get('/api/exports/hands?format=csv');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_table');
  });

  it('returns 400 when format is invalid', async () => {
    const res = await request(makeApp()).get('/api/exports/hands?tableId=t1&format=pdf');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_format');
  });

  it('returns 400 when no hands found', async () => {
    HandRepository.getHandsForExport.mockResolvedValueOnce([]);
    const res = await request(makeApp()).get('/api/exports/hands?tableId=t1&format=csv');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('no_hands');
  });

  it('returns CSV content with correct headers for format=csv', async () => {
    const mockHands = [
      {
        hand_id: 'h1',
        started_at: '2026-04-30T10:00:00Z',
        phase_ended: 'showdown',
        winner_name: 'Alice',
        final_pot: 100,
        board: ['Ah', 'Kd', '9c'],
        completed_normally: true,
        auto_tags: ['BLUFF_CATCH', 'C_BET'],
      },
    ];
    HandRepository.getHandsForExport.mockResolvedValueOnce(mockHands);

    const res = await request(makeApp()).get('/api/exports/hands?tableId=t1&format=csv');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/hands-t1\.csv/);
    expect(res.text).toMatch(/hand_id,started_at,phase_ended,winner,pot_end,board,auto_tags/);
    expect(res.text).toMatch(/h1/);
    expect(res.text).toMatch(/Alice/);
  });

  it('returns XLSX content with correct headers for format=xlsx', async () => {
    const mockHands = [
      {
        hand_id: 'h1',
        started_at: '2026-04-30T10:00:00Z',
        phase_ended: 'showdown',
        winner_name: 'Alice',
        final_pot: 100,
        board: ['Ah', 'Kd', '9c'],
        completed_normally: true,
        auto_tags: ['BLUFF_CATCH'],
      },
    ];
    HandRepository.getHandsForExport.mockResolvedValueOnce(mockHands);

    const res = await request(makeApp())
      .get('/api/exports/hands?tableId=t1&format=xlsx')
      .buffer(true);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/spreadsheetml|sheet/i);
    expect(res.headers['content-disposition']).toMatch(/hands-t1\.xlsx/);
    expect(res.body).toBeDefined();
  });

  it('defaults to CSV when format is omitted', async () => {
    const mockHands = [
      {
        hand_id: 'h1',
        started_at: '2026-04-30T10:00:00Z',
        phase_ended: 'showdown',
        winner_name: 'Alice',
        final_pot: 100,
        board: ['Ah', 'Kd', '9c'],
        completed_normally: true,
        auto_tags: [],
      },
    ];
    HandRepository.getHandsForExport.mockResolvedValueOnce(mockHands);

    const res = await request(makeApp()).get('/api/exports/hands?tableId=t1');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
  });

  it('calls getHandsForExport with correct school_id and tableId', async () => {
    const mockHands = [
      {
        hand_id: 'h1',
        started_at: '2026-04-30T10:00:00Z',
        phase_ended: 'showdown',
        winner_name: 'Alice',
        final_pot: 100,
        board: [],
        completed_normally: true,
        auto_tags: [],
      },
    ];
    HandRepository.getHandsForExport.mockResolvedValueOnce(mockHands);

    await request(makeApp()).get('/api/exports/hands?tableId=t-special&format=csv');

    expect(HandRepository.getHandsForExport).toHaveBeenCalledWith({
      schoolId: 's-1',
      tableId: 't-special',
      limit: 10000,
    });
  });

  it('returns 401 when requireAuth fails', async () => {
    requireAuth.mockImplementationOnce((_req, res) => res.status(401).json({ error: 'unauth' }));
    const res = await request(makeApp()).get('/api/exports/hands?tableId=t1&format=csv');
    expect(res.status).toBe(401);
  });

  it('returns 403 when requireSchool fails (no school assignment)', async () => {
    requireSchool.mockImplementationOnce((_req, res) => res.status(403).json({ error: 'no_school_assignment' }));
    const res = await request(makeApp()).get('/api/exports/hands?tableId=t1&format=csv');
    expect(res.status).toBe(403);
  });

  it('handles CSV with special characters (commas, quotes)', async () => {
    const mockHands = [
      {
        hand_id: 'h1',
        started_at: '2026-04-30T10:00:00Z',
        phase_ended: 'showdown',
        winner_name: 'Alice "The Ace" Smith',
        final_pot: 100,
        board: ['Ah', 'Kd', '9c'],
        completed_normally: true,
        auto_tags: ['TAG,WITH,COMMAS'],
      },
    ];
    HandRepository.getHandsForExport.mockResolvedValueOnce(mockHands);

    const res = await request(makeApp()).get('/api/exports/hands?tableId=t1&format=csv');

    expect(res.status).toBe(200);
    // CSV escaping: quotes doubled and wrapped in quotes
    expect(res.text).toMatch(/"Alice ""The Ace"" Smith"/);
  });

  it('handles hand with null/undefined values gracefully', async () => {
    const mockHands = [
      {
        hand_id: 'h1',
        started_at: '2026-04-30T10:00:00Z',
        phase_ended: 'fold_to_one',
        winner_name: null,
        final_pot: null,
        board: null,
        completed_normally: false,
        auto_tags: null,
      },
    ];
    HandRepository.getHandsForExport.mockResolvedValueOnce(mockHands);

    const res = await request(makeApp()).get('/api/exports/hands?tableId=t1&format=csv');

    expect(res.status).toBe(200);
    expect(res.text).toBeDefined();
  });

  it('returns 500 on getHandsForExport error', async () => {
    HandRepository.getHandsForExport.mockRejectedValueOnce(new Error('DB connection failed'));

    const res = await request(makeApp()).get('/api/exports/hands?tableId=t1&format=csv');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('export_failed');
  });

  it('coach role is enforced', async () => {
    const app = express();
    app.use(express.json());

    // Mock requireAuth to pass
    requireAuth.mockImplementationOnce((req, _res, next) => {
      req.user = { id: 'student-1', role: 'coached_student' };
      next();
    });

    // Mock requireRole to reject non-coaches
    requireRole.mockImplementationOnce(() => (_req, res) => {
      res.status(403).json({ error: 'requires_coach' });
    });

    require('../routes/exports.js')(app, { requireAuth });

    const res = await request(app).get('/api/exports/hands?tableId=t1&format=csv');
    expect(res.status).toBe(403);
  });
});
