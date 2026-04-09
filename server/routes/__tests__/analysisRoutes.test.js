'use strict';

/**
 * Analysis route tests.
 *
 * Endpoints covered:
 *   GET /api/analysis/tags
 *   GET /api/analysis/hands-by-tag
 *
 * Supabase is fully mocked with a chainable builder.
 */

// ── Mocks ──────────────────────────────────────────────────────────────────────

// featureGate — requireFeature always passes in tests
jest.mock('../../auth/featureGate', () => ({
  requireFeature: jest.fn(() => (_req, _res, next) => next()),
}));

// requireAuth shim
let mockCurrentUser = null;
jest.mock('../../auth/requireAuth.js', () =>
  jest.fn((req, res, next) => {
    if (!mockCurrentUser) return res.status(401).json({ error: 'auth_required' });
    req.user = mockCurrentUser;
    next();
  })
);

// ── Chainable Supabase mock ────────────────────────────────────────────────────

// We capture method calls so tests can inspect them.
let chainCalls = [];
let mockResolveValue = { data: [], error: null };

function makeChain() {
  const chain = {
    select:      jest.fn((...args) => { chainCalls.push(['select', args]); return chain; }),
    eq:          jest.fn((...args) => { chainCalls.push(['eq', args]); return chain; }),
    gte:         jest.fn((...args) => { chainCalls.push(['gte', args]); return chain; }),
    lte:         jest.fn((...args) => { chainCalls.push(['lte', args]); return chain; }),
    in:          jest.fn((...args) => { chainCalls.push(['in', args]); return chain; }),
    or:          jest.fn((...args) => { chainCalls.push(['or', args]); return chain; }),
    order:       jest.fn((...args) => { chainCalls.push(['order', args]); return chain; }),
    limit:       jest.fn((...args) => { chainCalls.push(['limit', args]); return chain; }),
    // Thenable — resolves when awaited
    then:        (resolve) => Promise.resolve(mockResolveValue).then(resolve),
  };
  return chain;
}

const mockFrom = jest.fn(() => makeChain());
jest.mock('../../db/supabase', () => ({ from: mockFrom }));

// ── Module setup ───────────────────────────────────────────────────────────────

const request    = require('supertest');
const express    = require('express');
const requireAuth = require('../../auth/requireAuth.js');
const registerAnalysisRoutes = require('../analysis');

function buildApp() {
  const app = express();
  app.use(express.json());
  registerAnalysisRoutes(app, { requireAuth });
  return app;
}

const app = buildApp();

// ── Setup ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  chainCalls = [];
  mockCurrentUser = { stableId: 'coach-1', id: 'coach-1', role: 'coach' };
  // Default: empty result set (no hands)
  mockResolveValue = { data: [], error: null };
  mockFrom.mockImplementation(() => makeChain());
});

// ── GET /api/analysis/tags ─────────────────────────────────────────────────────

describe('GET /api/analysis/tags', () => {
  test('returns 401 when not authenticated', async () => {
    mockCurrentUser = null;
    const res = await request(app).get('/api/analysis/tags');
    expect(res.status).toBe(401);
  });

  test('returns 200 with totalHands=0 and tags=[] when no hands exist', async () => {
    const res = await request(app).get('/api/analysis/tags');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ totalHands: 0, tags: [] });
  });

  test('returns 200 with aggregated tags when hands exist', async () => {
    // First call: hand_players/hands query → returns hand_ids
    // Second call: hand_tags query → returns tags
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // getHandIds — returns hand_id set
        const chain = makeChain();
        chain.then = (resolve) => Promise.resolve({
          data: [{ hand_id: 'h1' }, { hand_id: 'h2' }],
          error: null,
        }).then(resolve);
        return chain;
      }
      // hand_tags query
      const chain = makeChain();
      chain.then = (resolve) => Promise.resolve({
        data: [
          { tag: 'OPEN_LIMP', tag_type: 'mistake', hand_id: 'h1' },
          { tag: 'OPEN_LIMP', tag_type: 'mistake', hand_id: 'h2' },
          { tag: 'C_BET',     tag_type: 'auto',    hand_id: 'h1' },
        ],
        error: null,
      }).then(resolve);
      return chain;
    });

    const res = await request(app).get('/api/analysis/tags');
    expect(res.status).toBe(200);
    expect(res.body.totalHands).toBe(2);
    expect(res.body.tags.length).toBe(2);

    const openLimp = res.body.tags.find(t => t.tag === 'OPEN_LIMP');
    expect(openLimp).toBeTruthy();
    expect(openLimp.count).toBe(2);
    expect(openLimp.pct).toBe(100);
  });

  test('passes gameType=cash → .in("table_mode", [...]) on hands query', async () => {
    const inCalls = [];
    mockFrom.mockImplementation(() => {
      const chain = makeChain();
      // Override .in to capture calls
      chain.in = jest.fn((...args) => {
        inCalls.push(args);
        chainCalls.push(['in', args]);
        return chain;
      });
      chain.then = (resolve) => Promise.resolve({ data: [], error: null }).then(resolve);
      return chain;
    });

    const res = await request(app).get('/api/analysis/tags?gameType=cash');
    expect(res.status).toBe(200);

    // Verify that .in was called with table_mode and cash modes
    const tableModeCall = inCalls.find(
      args => args[0] === 'table_mode' || args[0] === 'hands.table_mode'
    );
    expect(tableModeCall).toBeTruthy();
    // The value array should contain the cash modes
    const modes = tableModeCall[1];
    expect(modes).toContain('coached_cash');
    expect(modes).toContain('uncoached_cash');
    expect(modes).toContain('bot_cash');
  });

  test('passes gameType=tournament → .in("table_mode", ["tournament"])', async () => {
    const inCalls = [];
    mockFrom.mockImplementation(() => {
      const chain = makeChain();
      chain.in = jest.fn((...args) => {
        inCalls.push(args);
        return chain;
      });
      chain.then = (resolve) => Promise.resolve({ data: [], error: null }).then(resolve);
      return chain;
    });

    const res = await request(app).get('/api/analysis/tags?gameType=tournament');
    expect(res.status).toBe(200);

    const tableModeCall = inCalls.find(
      args => args[0] === 'table_mode' || args[0] === 'hands.table_mode'
    );
    expect(tableModeCall).toBeTruthy();
    expect(tableModeCall[1]).toContain('tournament');
    expect(tableModeCall[1]).not.toContain('coached_cash');
  });

  test('applies tagType filter when tagType param is set', async () => {
    let callCount = 0;
    const eqCalls = [];
    mockFrom.mockImplementation(() => {
      callCount++;
      const chain = makeChain();
      chain.eq = jest.fn((...args) => {
        eqCalls.push(args);
        return chain;
      });
      if (callCount === 1) {
        // getHandIds call
        chain.then = (resolve) => Promise.resolve({
          data: [{ hand_id: 'h1' }],
          error: null,
        }).then(resolve);
      } else {
        // hand_tags call
        chain.then = (resolve) => Promise.resolve({
          data: [{ tag: 'OPEN_LIMP', tag_type: 'mistake', hand_id: 'h1' }],
          error: null,
        }).then(resolve);
      }
      return chain;
    });

    const res = await request(app).get('/api/analysis/tags?tagType=mistake');
    expect(res.status).toBe(200);

    // Verify that .eq('tag_type', 'mistake') was called at some point
    const tagTypeEq = eqCalls.find(args => args[0] === 'tag_type' && args[1] === 'mistake');
    expect(tagTypeEq).toBeTruthy();
  });

  test('does not apply table_mode filter when gameType is omitted', async () => {
    const inCalls = [];
    mockFrom.mockImplementation(() => {
      const chain = makeChain();
      chain.in = jest.fn((...args) => {
        inCalls.push(args);
        return chain;
      });
      chain.then = (resolve) => Promise.resolve({ data: [], error: null }).then(resolve);
      return chain;
    });

    const res = await request(app).get('/api/analysis/tags');
    expect(res.status).toBe(200);

    const tableModeCall = inCalls.find(
      args => args[0] === 'table_mode' || args[0] === 'hands.table_mode'
    );
    expect(tableModeCall).toBeUndefined();
  });
});

// ── GET /api/analysis/hands-by-tag ────────────────────────────────────────────

describe('GET /api/analysis/hands-by-tag', () => {
  test('returns 400 when tag param is missing', async () => {
    const res = await request(app).get('/api/analysis/hands-by-tag');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('tag is required');
  });

  test('returns 200 with empty hands array when no hands found', async () => {
    const res = await request(app).get('/api/analysis/hands-by-tag?tag=OPEN_LIMP');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ hands: [] });
  });

  test('passes gameType through to getHandIds', async () => {
    const inCalls = [];
    mockFrom.mockImplementation(() => {
      const chain = makeChain();
      chain.in = jest.fn((...args) => {
        inCalls.push(args);
        return chain;
      });
      chain.then = (resolve) => Promise.resolve({ data: [], error: null }).then(resolve);
      return chain;
    });

    const res = await request(app).get('/api/analysis/hands-by-tag?tag=OPEN_LIMP&gameType=cash');
    expect(res.status).toBe(200);

    const tableModeCall = inCalls.find(
      args => args[0] === 'table_mode' || args[0] === 'hands.table_mode'
    );
    expect(tableModeCall).toBeTruthy();
    expect(tableModeCall[1]).toContain('coached_cash');
  });
});
