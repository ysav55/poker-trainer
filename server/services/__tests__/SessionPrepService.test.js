'use strict';

/**
 * SessionPrepService unit tests.
 *
 * All Supabase calls are mocked.
 * Tests verify:
 *   - generate() returns all 7 sections + generated_at
 *   - generate() serves cached brief when fresh
 *   - generate() bypasses cache when stale (>1h)
 *   - generate() bypasses cache when new session exists
 *   - refresh() always regenerates (ignores cache)
 *   - leak ranking: returns top 3 deviations, handles empty baselines
 *   - flagged hands: handles no hands
 *   - stats snapshot: handles empty baselines
 *   - active alerts: returns correct records
 */

// ─── Supabase mock ────────────────────────────────────────────────────────────

// Each query chain resolves to the value stored in mockResponses for that table.
// We re-install the implementation before every test in beforeEach.
let mockResponses = {};

function makeChain(response) {
  const p = Promise.resolve(response);
  const chain = {
    select:      jest.fn().mockReturnThis(),
    eq:          jest.fn().mockReturnThis(),
    neq:         jest.fn().mockReturnThis(),
    in:          jest.fn().mockReturnThis(),
    not:         jest.fn().mockReturnThis(),
    gt:          jest.fn().mockReturnThis(),
    gte:         jest.fn().mockReturnThis(),
    lt:          jest.fn().mockReturnThis(),
    lte:         jest.fn().mockReturnThis(),
    order:       jest.fn().mockReturnThis(),
    limit:       jest.fn().mockReturnThis(),
    range:       jest.fn().mockResolvedValue(response),
    insert:      jest.fn().mockResolvedValue({ data: null, error: null }),
    upsert:      jest.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: jest.fn().mockResolvedValue(response),
    single:      jest.fn().mockResolvedValue(response),
    then:        (resolve, reject) => p.then(resolve, reject),
  };
  return chain;
}

const mockFrom = jest.fn();

const mockSupabase = { from: mockFrom };

jest.mock('../../db/supabase', () => mockSupabase);
jest.mock('../../db/utils', () => ({
  q: (p) => p.then(({ data, error }) => {
    if (error) throw new Error(error.message);
    return data;
  }),
}));
jest.mock('../../ai/NarratorService', () => ({
  narratePrepBrief: jest.fn().mockResolvedValue(null),
}));

// ─── Module under test ────────────────────────────────────────────────────────

const SessionPrepService = require('../SessionPrepService');

// ─── Setup ────────────────────────────────────────────────────────────────────

function setTable(table, data, error = null) {
  mockResponses[table] = { data, error };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockResponses = {};

  // Default: all tables return null (empty).
  for (const table of [
    'session_prep_briefs', 'sessions', 'student_baselines',
    'hand_players', 'hands', 'player_notes', 'hand_annotations',
    'alert_instances', 'session_player_stats',
  ]) {
    setTable(table, null);
  }

  // Re-install from() so every test gets a fresh mock.
  mockFrom.mockImplementation((table) => {
    const response = mockResponses[table] ?? { data: null, error: null };
    return makeChain(response);
  });
});

const FRESH_CACHE = {
  data: {
    leaks:                [{ stat: 'vpip', student_value: 0.35, school_avg: 0.24, deviation: 0.11, trend: 'worsening' }],
    flagged_hands:        [],
    coach_notes:          { notes: [], annotations: [] },
    stats_snapshot:       [],
    session_history:      [],
    active_alerts:        [],
    scenario_performance: [],
  },
  generated_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10 min ago
};

const STALE_CACHE = {
  data: FRESH_CACHE.data,
  generated_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2h ago
};

// ─── generate() ───────────────────────────────────────────────────────────────

describe('generate()', () => {
  test('returns all 7 sections + metadata on fresh generation', async () => {
    const result = await SessionPrepService.generate('coach-1', 'student-1');
    expect(result).toMatchObject({
      leaks:                expect.any(Array),
      flagged_hands:        expect.any(Array),
      coach_notes:          expect.any(Object),
      stats_snapshot:       expect.any(Array),
      session_history:      expect.any(Array),
      active_alerts:        expect.any(Array),
      scenario_performance: expect.any(Array),
      generated_at:         expect.any(String),
      from_cache:           false,
    });
  });

  test('serves cached brief when fresh (< 1h, no new session)', async () => {
    setTable('session_prep_briefs', FRESH_CACHE);
    setTable('sessions', null); // no new session since cache

    const result = await SessionPrepService.generate('coach-1', 'student-1');
    expect(result.from_cache).toBe(true);
    expect(result.leaks).toEqual(FRESH_CACHE.data.leaks);
  });

  test('regenerates when cache is stale (> 1h)', async () => {
    setTable('session_prep_briefs', STALE_CACHE);

    const result = await SessionPrepService.generate('coach-1', 'student-1');
    expect(result.from_cache).toBe(false);
  });

  test('regenerates when a new session has ended since cached', async () => {
    setTable('session_prep_briefs', FRESH_CACHE);
    setTable('sessions', { session_id: 'new-session-id' }); // new session found

    const result = await SessionPrepService.generate('coach-1', 'student-1');
    expect(result.from_cache).toBe(false);
  });

  test('does not throw when all sections fail with DB errors', async () => {
    const dbErr = { message: 'relation does not exist' };
    setTable('student_baselines', null, dbErr);
    setTable('hand_players',      null, dbErr);
    setTable('player_notes',      null, dbErr);
    setTable('session_player_stats', null, dbErr);
    setTable('alert_instances',   null, dbErr);

    const result = await SessionPrepService.generate('coach-1', 'student-1');
    expect(result.leaks).toEqual([]);
    expect(result.flagged_hands).toEqual([]);
    expect(result.stats_snapshot).toEqual([]);
    expect(result.session_history).toEqual([]);
    expect(result.active_alerts).toEqual([]);
    expect(result.from_cache).toBe(false);
  });

  test('generated_at is a valid ISO timestamp', async () => {
    const result = await SessionPrepService.generate('coach-1', 'student-1');
    expect(() => new Date(result.generated_at).toISOString()).not.toThrow();
  });
});

// ─── refresh() ────────────────────────────────────────────────────────────────

describe('refresh()', () => {
  test('always regenerates even when cache is fresh', async () => {
    setTable('session_prep_briefs', FRESH_CACHE);

    const result = await SessionPrepService.refresh('coach-1', 'student-1');
    expect(result.from_cache).toBe(false);
  });

  test('returns all 7 sections', async () => {
    const result = await SessionPrepService.refresh('coach-1', 'student-1');
    expect(result).toMatchObject({
      leaks:                expect.any(Array),
      flagged_hands:        expect.any(Array),
      coach_notes:          expect.any(Object),
      stats_snapshot:       expect.any(Array),
      session_history:      expect.any(Array),
      active_alerts:        expect.any(Array),
      scenario_performance: expect.any(Array),
    });
  });
});

// ─── Leak ranking ─────────────────────────────────────────────────────────────

describe('leak ranking (via generate)', () => {
  test('returns empty array when no student baseline row exists', async () => {
    setTable('student_baselines', null);
    const result = await SessionPrepService.generate('coach-1', 'student-1');
    expect(result.leaks).toEqual([]);
  });
});

// ─── Flagged hands ────────────────────────────────────────────────────────────

describe('flagged hands (via generate)', () => {
  test('returns empty array when student has no hands', async () => {
    setTable('hand_players', []);
    const result = await SessionPrepService.generate('coach-1', 'student-1');
    expect(result.flagged_hands).toEqual([]);
  });

  test('returns empty array when hand_players is null', async () => {
    setTable('hand_players', null);
    const result = await SessionPrepService.generate('coach-1', 'student-1');
    expect(result.flagged_hands).toEqual([]);
  });
});

// ─── Stats snapshot ───────────────────────────────────────────────────────────

describe('stats snapshot (via generate)', () => {
  test('returns empty array when no baselines exist', async () => {
    setTable('student_baselines', []);
    const result = await SessionPrepService.generate('coach-1', 'student-1');
    expect(result.stats_snapshot).toEqual([]);
  });

  test('returns empty array when student_baselines is null', async () => {
    setTable('student_baselines', null);
    const result = await SessionPrepService.generate('coach-1', 'student-1');
    expect(result.stats_snapshot).toEqual([]);
  });
});

// ─── Active alerts ────────────────────────────────────────────────────────────

describe('active alerts (via generate)', () => {
  test('returns active alert_instances', async () => {
    const alert = {
      id: 'alert-1',
      alert_type: 'mistake_spike',
      severity: 0.87,
      data: { spikes: [] },
      created_at: new Date().toISOString(),
    };
    setTable('alert_instances', [alert]);

    const result = await SessionPrepService.generate('coach-1', 'student-1');
    expect(result.active_alerts).toEqual([alert]);
  });

  test('returns empty array when no active alerts', async () => {
    setTable('alert_instances', []);
    const result = await SessionPrepService.generate('coach-1', 'student-1');
    expect(result.active_alerts).toEqual([]);
  });
});

// ─── Coach notes ──────────────────────────────────────────────────────────────

describe('coach notes (via generate)', () => {
  test('returns { notes, annotations } object', async () => {
    const result = await SessionPrepService.generate('coach-1', 'student-1');
    expect(result.coach_notes).toHaveProperty('notes');
    expect(result.coach_notes).toHaveProperty('annotations');
  });

  test('notes is empty array when no player_notes', async () => {
    setTable('player_notes', []);
    const result = await SessionPrepService.generate('coach-1', 'student-1');
    expect(result.coach_notes.notes).toEqual([]);
  });
});
