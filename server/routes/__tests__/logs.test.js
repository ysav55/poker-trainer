'use strict';

/**
 * Tests for POST /api/logs/client-error
 *
 * Covers:
 *  1. Returns 204 on valid error payload
 *  2. Inserts correct shape into alpha_logs (level, category, event)
 *  3. Truncates long message / stack / componentStack
 *  4. Returns 204 even when Supabase insert throws (swallowed error)
 *  5. Handles missing body fields gracefully (defaults to 'unknown error')
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Bypass rate-limiter so tests aren't throttled
jest.mock('express-rate-limit', () =>
  jest.fn(() => (_req, _res, next) => next())
);

// Chainable Supabase mock — tracks inserted data for inspection
let lastInsertPayload = null;
let insertShouldThrow = false;

const mockInsert = jest.fn(async (payload) => {
  lastInsertPayload = payload;
  if (insertShouldThrow) throw new Error('supabase boom');
  return { data: null, error: null };
});

const mockFrom = jest.fn(() => ({ insert: mockInsert }));

jest.mock('../../db/supabase', () => ({ from: mockFrom }));

// ─── App setup ────────────────────────────────────────────────────────────────

const express  = require('express');
const request  = require('supertest');
const registerLogRoutes = require('../logs');

function buildApp() {
  const app = express();
  app.use(express.json());
  registerLogRoutes(app);
  return app;
}

const app = buildApp();

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  lastInsertPayload = null;
  insertShouldThrow = false;
  mockFrom.mockImplementation(() => ({ insert: mockInsert }));
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/logs/client-error', () => {

  test('returns 204 on valid error payload', async () => {
    const res = await request(app)
      .post('/api/logs/client-error')
      .send({ message: 'Boom', stack: 'Error: Boom\n  at Foo', componentStack: 'at Bar', boundary: 'AppBoundary' });

    expect(res.status).toBe(204);
  });

  test('inserts into alpha_logs with correct level, category, and event', async () => {
    await request(app)
      .post('/api/logs/client-error')
      .send({ message: 'Test error', stack: 'stack trace', componentStack: 'component trace', boundary: 'MyBoundary' });

    expect(mockFrom).toHaveBeenCalledWith('alpha_logs');
    expect(mockInsert).toHaveBeenCalledTimes(1);

    const payload = lastInsertPayload;
    expect(payload.level).toBe('error');
    expect(payload.category).toBe('client');
    expect(payload.event).toBe('react_error');
    expect(payload.message).toBe('Test error');
    expect(payload.meta.stack).toBe('stack trace');
    expect(payload.meta.componentStack).toBe('component trace');
    expect(payload.meta.boundary).toBe('MyBoundary');
  });

  test('truncates message to 2000 chars', async () => {
    const longMessage = 'x'.repeat(3000);

    await request(app)
      .post('/api/logs/client-error')
      .send({ message: longMessage });

    expect(lastInsertPayload.message).toHaveLength(2000);
  });

  test('truncates stack to 4000 chars', async () => {
    const longStack = 'y'.repeat(5000);

    await request(app)
      .post('/api/logs/client-error')
      .send({ message: 'err', stack: longStack });

    expect(lastInsertPayload.meta.stack).toHaveLength(4000);
  });

  test('truncates componentStack to 2000 chars', async () => {
    const longComponentStack = 'z'.repeat(2500);

    await request(app)
      .post('/api/logs/client-error')
      .send({ message: 'err', componentStack: longComponentStack });

    expect(lastInsertPayload.meta.componentStack).toHaveLength(2000);
  });

  test('returns 204 even when Supabase insert throws', async () => {
    insertShouldThrow = true;

    const res = await request(app)
      .post('/api/logs/client-error')
      .send({ message: 'Boom', stack: 'trace' });

    expect(res.status).toBe(204);
  });

  test('defaults message to "unknown error" when body is empty', async () => {
    await request(app)
      .post('/api/logs/client-error')
      .send({});

    expect(lastInsertPayload.message).toBe('unknown error');
  });

  test('defaults stack and componentStack to empty string when omitted', async () => {
    await request(app)
      .post('/api/logs/client-error')
      .send({ message: 'oops' });

    expect(lastInsertPayload.meta.stack).toBe('');
    expect(lastInsertPayload.meta.componentStack).toBe('');
  });

  test('defaults boundary to "unknown" when omitted', async () => {
    await request(app)
      .post('/api/logs/client-error')
      .send({ message: 'oops' });

    expect(lastInsertPayload.meta.boundary).toBe('unknown');
  });

  test('returns 204 when entire body is absent', async () => {
    const res = await request(app)
      .post('/api/logs/client-error')
      .set('Content-Type', 'application/json')
      .send();

    expect(res.status).toBe(204);
  });
});
