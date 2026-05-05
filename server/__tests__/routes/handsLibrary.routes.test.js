'use strict';

const request = require('supertest');
const express = require('express');

// Mock HandLoggerSupabase before importing routes
jest.mock('../../db/HandLoggerSupabase.js', () => ({
  searchLibrary: jest.fn(),
}));

jest.mock('../../auth/requireAuth.js', () => {
  return (req, res, next) => {
    req.user = {
      id: 'coach-1',
      stableId: 'coach-1',
      name: 'Test Coach',
      role: 'coach',
    };
    next();
  };
});

jest.mock('../../auth/requireRole.js', () => {
  return () => (_req, _res, next) => next();
});

jest.mock('../../auth/requireSchool.js', () => {
  return (req, res, next) => {
    req.user.school_id = 's-1';
    next();
  };
});

const HandLogger = require('../../db/HandLoggerSupabase.js');
const registerHandRoutes = require('../../routes/hands.js');

describe('GET /api/hands/library', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function makeApp() {
    const app = express();
    app.use(express.json());
    registerHandRoutes(app, { requireAuth: require('../../auth/requireAuth.js'), HandLogger });
    return app;
  }

  it('returns hands filtered by school', async () => {
    HandLogger.searchLibrary.mockResolvedValueOnce({
      hands: [
        {
          hand_id: 'h1',
          winner_name: 'Alice',
          final_pot: 100,
          started_at: '2026-04-30T10:00:00Z',
        },
      ],
      total: 1,
    });

    const res = await request(makeApp()).get('/api/hands/library');

    expect(res.status).toBe(200);
    expect(res.body.hands).toHaveLength(1);
    expect(res.body.hands[0].hand_id).toBe('h1');
    expect(res.body.total).toBe(1);
    expect(HandLogger.searchLibrary).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: 's-1',
        query: '',
        limit: 20,
        offset: 0,
      })
    );
  });

  it('forwards q query param as text filter', async () => {
    HandLogger.searchLibrary.mockResolvedValueOnce({ hands: [], total: 0 });

    await request(makeApp()).get('/api/hands/library?q=alice');

    expect(HandLogger.searchLibrary).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'alice',
      })
    );
  });

  it('forwards range param as comma-separated array', async () => {
    HandLogger.searchLibrary.mockResolvedValueOnce({ hands: [], total: 0 });

    await request(makeApp()).get('/api/hands/library?range=AKo,QQ,JJ');

    expect(HandLogger.searchLibrary).toHaveBeenCalledWith(
      expect.objectContaining({
        rangeFilter: ['AKo', 'QQ', 'JJ'],
      })
    );
  });

  it('handles range param with empty strings gracefully', async () => {
    HandLogger.searchLibrary.mockResolvedValueOnce({ hands: [], total: 0 });

    await request(makeApp()).get('/api/hands/library?range=AKo,,QQ,');

    expect(HandLogger.searchLibrary).toHaveBeenCalledWith(
      expect.objectContaining({
        rangeFilter: ['AKo', 'QQ'], // empty strings filtered out
      })
    );
  });

  it('forwards limit and offset for pagination', async () => {
    HandLogger.searchLibrary.mockResolvedValueOnce({ hands: [], total: 0 });

    await request(makeApp()).get('/api/hands/library?limit=50&offset=20');

    expect(HandLogger.searchLibrary).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 50,
        offset: 20,
      })
    );
  });

  it('defaults limit to 20 and offset to 0', async () => {
    HandLogger.searchLibrary.mockResolvedValueOnce({ hands: [], total: 0 });

    await request(makeApp()).get('/api/hands/library');

    expect(HandLogger.searchLibrary).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 20,
        offset: 0,
      })
    );
  });

  it('returns 500 when searchLibrary throws', async () => {
    HandLogger.searchLibrary.mockRejectedValueOnce(new Error('db connection failed'));

    const res = await request(makeApp()).get('/api/hands/library');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('internal_error');
    expect(res.body.message).toContain('db connection failed');
  });

  it('parses limit and offset as integers', async () => {
    HandLogger.searchLibrary.mockResolvedValueOnce({ hands: [], total: 0 });

    await request(makeApp()).get('/api/hands/library?limit=100&offset=5');

    const call = HandLogger.searchLibrary.mock.calls[0][0];
    expect(typeof call.limit).toBe('number');
    expect(typeof call.offset).toBe('number');
    expect(call.limit).toBe(100);
    expect(call.offset).toBe(5);
  });

  it('combines multiple query params', async () => {
    HandLogger.searchLibrary.mockResolvedValueOnce({ hands: [], total: 0 });

    await request(makeApp()).get('/api/hands/library?q=bob&range=KK,AA&limit=30&offset=10');

    expect(HandLogger.searchLibrary).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: 's-1',
        query: 'bob',
        rangeFilter: ['KK', 'AA'],
        limit: 30,
        offset: 10,
      })
    );
  });
});
