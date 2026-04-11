'use strict';

/**
 * coachStudents route tests.
 *
 * Endpoints covered:
 *   GET  /api/coach/students/:id/playlists         — W-2
 *   GET  /api/coach/students/:id/scenario-history  — W-3
 *   GET  /api/coach/students/:id/staking           — W-4
 *   POST /api/coach/students/:id/staking/notes     — W-5
 *
 * Supabase is fully mocked. requireAuth and requireRole are shimmed.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

let mockStudentAccessGranted = true;
jest.mock('../../auth/requireStudentAssignment', () => jest.fn());

const mockFrom = jest.fn();
jest.mock('../../db/supabase', () => ({ from: mockFrom }));

let mockCurrentUser = null;
jest.mock('../../auth/requireAuth.js', () =>
  jest.fn((req, res, next) => {
    if (!mockCurrentUser) return res.status(401).json({ error: 'auth_required' });
    req.user = mockCurrentUser;
    next();
  })
);

jest.mock('../../auth/requireRole.js', () =>
  jest.fn((_minRole) => (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'auth_required' });
    const hierarchy = ['coached_student', 'solo_student', 'coach', 'admin', 'superadmin'];
    const userIdx   = hierarchy.indexOf(req.user.role ?? '');
    const minIdx    = hierarchy.indexOf('coach');
    if (userIdx < minIdx)
      return res.status(403).json({ error: 'forbidden' });
    next();
  })
);

// ─── Imports ──────────────────────────────────────────────────────────────────

const request      = require('supertest');
const express      = require('express');
const requireAuth  = require('../../auth/requireAuth.js');
const requireRole  = require('../../auth/requireRole.js');
const requireStudentAssignment = require('../../auth/requireStudentAssignment');
const coachStudentsRouter = require('../coachStudents');

function buildApp() {
  const app = express();
  app.use(express.json());
  // Mirror how server/index.js mounts this router
  app.use('/api/coach/students', requireAuth, requireRole('coach'), coachStudentsRouter);
  return app;
}

const app = buildApp();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a chainable Supabase query mock.
 * Pass `terminalValue` as the value that resolves when the chain terminates
 * via `.then()`, `.maybeSingle()`, or `.single()`.
 */
function makeChain(response) {
  const chain = {
    select:      jest.fn().mockReturnThis(),
    eq:          jest.fn().mockReturnThis(),
    in:          jest.fn().mockReturnThis(),
    is:          jest.fn().mockReturnThis(),
    not:         jest.fn().mockReturnThis(),
    neq:         jest.fn().mockReturnThis(),
    order:       jest.fn().mockReturnThis(),
    limit:       jest.fn().mockReturnThis(),
    contains:    jest.fn().mockReturnThis(),
    insert:      jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue(response),
    single:      jest.fn().mockResolvedValue(response),
    // allows `await supabase.from(...).select(...)…` without explicit terminal
    then: (resolve, reject) => Promise.resolve(response).then(resolve, reject),
  };
  return chain;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const COACH_USER   = { id: 'coach-uuid',   stableId: 'coach-uuid',   role: 'coach' };
const ADMIN_USER   = { id: 'admin-uuid',   stableId: 'admin-uuid',   role: 'admin' };
const STUDENT_ID   = 'student-uuid-1';

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrentUser = null;
  mockStudentAccessGranted = true;
  requireStudentAssignment.mockImplementation((req, res, next) => {
    if (!mockStudentAccessGranted) {
      return res.status(403).json({ error: 'forbidden', message: 'Student not assigned to you' });
    }
    req.studentId = req.params.id;
    next();
  });
});

// ─── requireStudentAssignment guard ──────────────────────────────────────────

describe('requireStudentAssignment', () => {
  test('returns 403 when student not assigned to requesting coach', async () => {
    mockCurrentUser = COACH_USER;
    mockStudentAccessGranted = false;

    const res = await request(app).get(`/api/coach/students/${STUDENT_ID}/playlists`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('forbidden');
  });

  test('admin bypasses student ownership check', async () => {
    mockCurrentUser = ADMIN_USER;
    mockStudentAccessGranted = true;
    // playlists query returns empty → expect 200 with empty array
    mockFrom.mockReturnValueOnce(makeChain({ data: [], error: null }));

    const res = await request(app).get(`/api/coach/students/${STUDENT_ID}/playlists`);
    expect(res.status).toBe(200);
    expect(res.body.playlists).toEqual([]);
  });

  test('superadmin bypasses student ownership check', async () => {
    mockCurrentUser = { id: 'super-uuid', stableId: 'super-uuid', role: 'superadmin' };
    mockStudentAccessGranted = true;
    mockFrom.mockReturnValueOnce(makeChain({ data: [], error: null }));

    const res = await request(app).get(`/api/coach/students/${STUDENT_ID}/playlists`);
    expect(res.status).toBe(200);
  });
});

// ─── GET /:id/playlists ───────────────────────────────────────────────────────

describe('GET /api/coach/students/:id/playlists', () => {
  beforeEach(() => { mockCurrentUser = COACH_USER; });

  test('returns playlists with id, name, total, played fields', async () => {

    const playlists = [
      { playlist_id: 'pl-1', name: 'Basics',   created_at: '2026-01-01' },
      { playlist_id: 'pl-2', name: 'Advanced', created_at: '2026-01-02' },
    ];
    // playlists query
    mockFrom.mockReturnValueOnce(makeChain({ data: playlists, error: null }));
    // playlist_items query
    mockFrom.mockReturnValueOnce(makeChain({
      data: [
        { playlist_id: 'pl-1' },
        { playlist_id: 'pl-1' },
        { playlist_id: 'pl-2' },
      ],
      error: null,
    }));
    // drill_sessions query
    mockFrom.mockReturnValueOnce(makeChain({
      data: [
        { playlist_id: 'pl-1', items_dealt: 3 },
        { playlist_id: 'pl-1', items_dealt: 2 },
      ],
      error: null,
    }));

    const res = await request(app).get(`/api/coach/students/${STUDENT_ID}/playlists`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.playlists)).toBe(true);
    expect(res.body.playlists).toHaveLength(2);

    const pl1 = res.body.playlists.find(p => p.id === 'pl-1');
    expect(pl1).toMatchObject({ id: 'pl-1', name: 'Basics', total: 2, played: 5 });

    const pl2 = res.body.playlists.find(p => p.id === 'pl-2');
    expect(pl2).toMatchObject({ id: 'pl-2', name: 'Advanced', total: 1, played: 0 });
  });

  test('returns empty array when no playlists exist for coach', async () => {
    // playlists query returns empty
    mockFrom.mockReturnValueOnce(makeChain({ data: [], error: null }));

    const res = await request(app).get(`/api/coach/students/${STUDENT_ID}/playlists`);
    expect(res.status).toBe(200);
    expect(res.body.playlists).toEqual([]);
  });

  test('returns empty array when playlists data is null', async () => {
    mockFrom.mockReturnValueOnce(makeChain({ data: null, error: null }));

    const res = await request(app).get(`/api/coach/students/${STUDENT_ID}/playlists`);
    expect(res.status).toBe(200);
    expect(res.body.playlists).toEqual([]);
  });

  test('returns 500 on playlists DB error', async () => {
    mockFrom.mockReturnValueOnce(makeChain({ data: null, error: { message: 'timeout' } }));

    const res = await request(app).get(`/api/coach/students/${STUDENT_ID}/playlists`);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('internal_error');
  });

  test('returns 500 on playlist_items DB error', async () => {
    // playlists ok
    mockFrom.mockReturnValueOnce(makeChain({
      data: [{ playlist_id: 'pl-1', name: 'Basics', created_at: '2026-01-01' }],
      error: null,
    }));
    // items error
    mockFrom.mockReturnValueOnce(makeChain({ data: null, error: { message: 'items error' } }));

    const res = await request(app).get(`/api/coach/students/${STUDENT_ID}/playlists`);
    expect(res.status).toBe(500);
  });
});

// ─── GET /:id/scenario-history ───────────────────────────────────────────────

describe('GET /api/coach/students/:id/scenario-history', () => {
  beforeEach(() => { mockCurrentUser = COACH_USER; });

  test('returns history array with scenario names', async () => {
    const hands = [
      { hand_id: 'h-1', scenario_id: 'sc-1', created_at: '2026-04-01T10:00:00Z' },
      { hand_id: 'h-2', scenario_id: 'sc-2', created_at: '2026-04-01T09:00:00Z' },
    ];
    // hands query
    mockFrom.mockReturnValueOnce(makeChain({ data: hands, error: null }));
    // hand_players query
    mockFrom.mockReturnValueOnce(makeChain({
      data: [{ hand_id: 'h-1' }, { hand_id: 'h-2' }],
      error: null,
    }));
    // scenarios query
    mockFrom.mockReturnValueOnce(makeChain({
      data: [
        { id: 'sc-1', name: 'Squeeze Play' },
        { id: 'sc-2', name: 'River Bluff' },
      ],
      error: null,
    }));

    const res = await request(app).get(`/api/coach/students/${STUDENT_ID}/scenario-history`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.history)).toBe(true);
    expect(res.body.history).toHaveLength(2);

    const first = res.body.history[0];
    expect(first).toMatchObject({
      id:            'h-1',
      hand_id:       'h-1',
      scenario_name: 'Squeeze Play',
    });
  });

  test('returns empty history when no scenario hands exist', async () => {
    mockFrom.mockReturnValueOnce(makeChain({ data: [], error: null }));

    const res = await request(app).get(`/api/coach/students/${STUDENT_ID}/scenario-history`);
    expect(res.status).toBe(200);
    expect(res.body.history).toEqual([]);
  });

  test('returns empty history when student was not a player in any of the hands', async () => {
    // hands exist
    mockFrom.mockReturnValueOnce(makeChain({
      data: [{ hand_id: 'h-1', scenario_id: 'sc-1', created_at: '2026-04-01' }],
      error: null,
    }));
    // student not in hand_players for any of those hand_ids
    mockFrom.mockReturnValueOnce(makeChain({ data: [], error: null }));

    const res = await request(app).get(`/api/coach/students/${STUDENT_ID}/scenario-history`);
    expect(res.status).toBe(200);
    expect(res.body.history).toEqual([]);
  });

  test('returns 500 on hands DB error', async () => {
    mockFrom.mockReturnValueOnce(makeChain({ data: null, error: { message: 'hands db error' } }));

    const res = await request(app).get(`/api/coach/students/${STUDENT_ID}/scenario-history`);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('internal_error');
  });

  test('scenario_name is null when scenario not found in DB', async () => {
    mockFrom.mockReturnValueOnce(makeChain({
      data: [{ hand_id: 'h-1', scenario_id: 'sc-unknown', created_at: '2026-04-01' }],
      error: null,
    }));
    mockFrom.mockReturnValueOnce(makeChain({ data: [{ hand_id: 'h-1' }], error: null }));
    // scenarios returns empty → name is unknown
    mockFrom.mockReturnValueOnce(makeChain({ data: [], error: null }));

    const res = await request(app).get(`/api/coach/students/${STUDENT_ID}/scenario-history`);
    expect(res.status).toBe(200);
    expect(res.body.history[0].scenario_name).toBeNull();
  });
});

// ─── GET /:id/staking ─────────────────────────────────────────────────────────

describe('GET /api/coach/students/:id/staking', () => {
  beforeEach(() => { mockCurrentUser = COACH_USER; });

  const CONTRACT = {
    id: 'contract-1', coach_id: 'coach-uuid', player_id: STUDENT_ID,
    status: 'active', stake_percent: 80, created_at: '2026-01-01',
  };

  test('returns contract, monthly aggregation, and notes when contract exists', async () => {
    // staking_contracts query
    mockFrom.mockReturnValueOnce(makeChain({ data: [CONTRACT], error: null }));
    // staking_sessions query
    mockFrom.mockReturnValueOnce(makeChain({
      data: [
        { session_date: '2026-04-01', buy_in: '100', cashout: '150', status: 'complete' },
        { session_date: '2026-04-15', buy_in: '200', cashout: '180', status: 'complete' },
        { session_date: '2026-03-10', buy_in: '100', cashout: '120', status: 'complete' },
      ],
      error: null,
    }));
    // staking_notes query
    mockFrom.mockReturnValueOnce(makeChain({
      data: [
        { id: 'n-1', text: 'Good session', created_at: '2026-04-10' },
      ],
      error: null,
    }));

    const res = await request(app).get(`/api/coach/students/${STUDENT_ID}/staking`);
    expect(res.status).toBe(200);
    expect(res.body.contract).toMatchObject({ id: 'contract-1' });
    expect(Array.isArray(res.body.monthly)).toBe(true);
    expect(res.body.monthly).toHaveLength(2); // April and March
    expect(Array.isArray(res.body.notes)).toBe(true);
    expect(res.body.notes[0]).toMatchObject({ id: 'n-1', text: 'Good session' });
  });

  test('monthly aggregation computes net correctly', async () => {
    mockFrom.mockReturnValueOnce(makeChain({ data: [CONTRACT], error: null }));
    mockFrom.mockReturnValueOnce(makeChain({
      data: [
        { session_date: '2026-04-01', buy_in: '100', cashout: '150', status: 'complete' },
        { session_date: '2026-04-02', buy_in: '200', cashout: '100', status: 'complete' },
      ],
      error: null,
    }));
    mockFrom.mockReturnValueOnce(makeChain({ data: [], error: null }));

    const res = await request(app).get(`/api/coach/students/${STUDENT_ID}/staking`);
    expect(res.status).toBe(200);
    const april = res.body.monthly.find(m => m.month === '2026-04');
    expect(april).toBeDefined();
    expect(april.buy_ins).toBeCloseTo(300);
    expect(april.cashouts).toBeCloseTo(250);
    expect(april.net).toBeCloseTo(-50);
  });

  test('returns contract null, empty monthly, empty notes when no active contract', async () => {
    // staking_contracts returns empty array
    mockFrom.mockReturnValueOnce(makeChain({ data: [], error: null }));

    const res = await request(app).get(`/api/coach/students/${STUDENT_ID}/staking`);
    expect(res.status).toBe(200);
    expect(res.body.contract).toBeNull();
    expect(res.body.monthly).toEqual([]);
    expect(res.body.notes).toEqual([]);
  });

  test('returns 500 on staking_contracts DB error', async () => {
    mockFrom.mockReturnValueOnce(makeChain({ data: null, error: { message: 'db failure' } }));

    const res = await request(app).get(`/api/coach/students/${STUDENT_ID}/staking`);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('internal_error');
  });

  test('returns 500 on staking_sessions DB error', async () => {
    mockFrom.mockReturnValueOnce(makeChain({ data: [CONTRACT], error: null }));
    mockFrom.mockReturnValueOnce(makeChain({ data: null, error: { message: 'sessions db error' } }));

    const res = await request(app).get(`/api/coach/students/${STUDENT_ID}/staking`);
    expect(res.status).toBe(500);
  });
});

// ─── POST /:id/staking/notes ──────────────────────────────────────────────────

describe('POST /api/coach/students/:id/staking/notes', () => {
  beforeEach(() => { mockCurrentUser = COACH_USER; });

  const CONTRACT = { id: 'contract-1' };
  const NEW_NOTE = { id: 'note-new', text: 'Watch bet sizing', created_at: '2026-04-10T12:00:00Z' };

  test('returns 201 with created note on success', async () => {
    // staking_contracts lookup
    mockFrom.mockReturnValueOnce(makeChain({ data: [CONTRACT], error: null }));
    // insert note
    mockFrom.mockReturnValueOnce(makeChain({ data: NEW_NOTE, error: null }));

    const res = await request(app)
      .post(`/api/coach/students/${STUDENT_ID}/staking/notes`)
      .send({ text: 'Watch bet sizing' });

    expect(res.status).toBe(201);
    expect(res.body.note).toMatchObject({ id: 'note-new', text: 'Watch bet sizing' });
  });

  test('trims whitespace from text', async () => {
    mockFrom.mockReturnValueOnce(makeChain({ data: [CONTRACT], error: null }));
    mockFrom.mockReturnValueOnce(makeChain({ data: { id: 'n-2', text: 'Trimmed', created_at: '2026-04-10' }, error: null }));

    const res = await request(app)
      .post(`/api/coach/students/${STUDENT_ID}/staking/notes`)
      .send({ text: '  Trimmed  ' });

    expect(res.status).toBe(201);
  });

  test('returns 400 when text is empty string', async () => {
    const res = await request(app)
      .post(`/api/coach/students/${STUDENT_ID}/staking/notes`)
      .send({ text: '' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });

  test('returns 400 when text is whitespace only', async () => {
    const res = await request(app)
      .post(`/api/coach/students/${STUDENT_ID}/staking/notes`)
      .send({ text: '   ' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });

  test('returns 400 when text field is missing from body', async () => {
    const res = await request(app)
      .post(`/api/coach/students/${STUDENT_ID}/staking/notes`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });

  test('returns 404 when no active or paused contract exists', async () => {
    // contracts returns empty
    mockFrom.mockReturnValueOnce(makeChain({ data: [], error: null }));

    const res = await request(app)
      .post(`/api/coach/students/${STUDENT_ID}/staking/notes`)
      .send({ text: 'Some note' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('no_contract');
  });

  test('returns 500 on insert DB error', async () => {
    mockFrom.mockReturnValueOnce(makeChain({ data: [CONTRACT], error: null }));
    mockFrom.mockReturnValueOnce(makeChain({ data: null, error: { message: 'insert failed' } }));

    const res = await request(app)
      .post(`/api/coach/students/${STUDENT_ID}/staking/notes`)
      .send({ text: 'Some note' });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('internal_error');
  });

  test('returns 500 on contracts DB error', async () => {
    mockFrom.mockReturnValueOnce(makeChain({ data: null, error: { message: 'db down' } }));

    const res = await request(app)
      .post(`/api/coach/students/${STUDENT_ID}/staking/notes`)
      .send({ text: 'Some note' });

    expect(res.status).toBe(500);
  });
});
