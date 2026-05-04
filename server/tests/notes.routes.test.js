'use strict';

const request = require('supertest');
const express = require('express');

jest.mock('../db/repositories/HandNotesRepository.js');
jest.mock('../auth/requireAuth.js');
jest.mock('../auth/requireRole.js');
jest.mock('../auth/requireSchool.js');

const repo = require('../db/repositories/HandNotesRepository.js');
const requireAuth = require('../auth/requireAuth.js');
const requireRole = require('../auth/requireRole.js');
const requireSchool = require('../auth/requireSchool.js');

beforeEach(() => {
  jest.clearAllMocks();
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
  require('../routes/notes.js')(app, { requireAuth });
  return app;
}

describe('GET /api/hands/:handId/notes', () => {
  it('returns notes for hand filtered by school', async () => {
    repo.listForHand.mockResolvedValueOnce([
      { id: 'n1', hand_id: 'h1', school_id: 's-1', body: 'hi', author_player_id: 'p1', created_at: 't', updated_at: 't' },
    ]);
    const res = await request(makeApp()).get('/api/hands/h1/notes');
    expect(res.status).toBe(200);
    expect(res.body.notes).toHaveLength(1);
    expect(repo.listForHand).toHaveBeenCalledWith('h1', 's-1');
  });
});

describe('POST /api/hands/:handId/notes', () => {
  it('creates a note with trimmed body', async () => {
    repo.create.mockResolvedValueOnce({ id: 'n1', hand_id: 'h1', school_id: 's-1', body: 'hi', author_player_id: 'coach-1' });
    const res = await request(makeApp()).post('/api/hands/h1/notes').send({ body: '  hi  ' });
    expect(res.status).toBe(201);
    expect(repo.create).toHaveBeenCalledWith('h1', 's-1', 'coach-1', 'hi');
  });

  it('rejects empty body with 400', async () => {
    const res = await request(makeApp()).post('/api/hands/h1/notes').send({ body: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_body');
  });

  it('rejects body > 500 chars with 400', async () => {
    const res = await request(makeApp()).post('/api/hands/h1/notes').send({ body: 'x'.repeat(501) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_body');
  });
});

describe('PATCH /api/notes/:noteId', () => {
  it('updates a note (school-scoped)', async () => {
    repo.update.mockResolvedValueOnce({ id: 'n1', body: 'edited', school_id: 's-1' });
    const res = await request(makeApp()).patch('/api/notes/n1').send({ body: 'edited' });
    expect(res.status).toBe(200);
    expect(repo.update).toHaveBeenCalledWith('n1', 's-1', 'edited');
  });

  it('rejects empty body 400', async () => {
    const res = await request(makeApp()).patch('/api/notes/n1').send({ body: '' });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/notes/:noteId', () => {
  it('deletes a note (school-scoped)', async () => {
    repo.delete.mockResolvedValueOnce(undefined);
    const res = await request(makeApp()).delete('/api/notes/n1');
    expect(res.status).toBe(204);
    expect(repo.delete).toHaveBeenCalledWith('n1', 's-1');
  });
});

describe('POST /api/hands/notes-counts', () => {
  it('returns batched counts for given handIds', async () => {
    const counts = new Map([['h1', 2], ['h2', 1]]);
    repo.batchCounts.mockResolvedValueOnce(counts);
    const res = await request(makeApp()).post('/api/hands/notes-counts').send({ handIds: ['h1', 'h2', 'h3'] });
    expect(res.status).toBe(200);
    expect(res.body.counts).toEqual({ h1: 2, h2: 1 });
  });

  it('rejects when handIds is not an array', async () => {
    const res = await request(makeApp()).post('/api/hands/notes-counts').send({ handIds: 'oops' });
    expect(res.status).toBe(400);
  });
});

describe('Auth integration', () => {
  it('returns 401 when requireAuth fails', async () => {
    requireAuth.mockImplementationOnce((_req, res, _next) => res.status(401).json({ error: 'unauth' }));
    const res = await request(makeApp()).get('/api/hands/h1/notes');
    expect(res.status).toBe(401);
  });

  it('returns 403 when requireSchool rejects (no school assignment)', async () => {
    requireSchool.mockImplementationOnce((_req, res, _next) =>
      res.status(403).json({ error: 'no_school_assignment' }));
    const res = await request(makeApp()).get('/api/hands/h1/notes');
    expect(res.status).toBe(403);
  });
});
