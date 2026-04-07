'use strict';

/**
 * AlertService — unit tests
 *
 * Verifies that generateAlerts(coachId) only processes students whose
 * coach_id matches the given coachId. Students belonging to other coaches
 * must never appear in the result set.
 */

// ─── Supabase mock ─────────────────────────────────────────────────────────────
// We build a chainable mock that tracks every call so we can assert which
// filters were applied to which tables.

const mockFrom = jest.fn();

jest.mock('../db/supabase.js', () => ({
  from: (...args) => mockFrom(...args),
}));

// ─── Detector mocks ────────────────────────────────────────────────────────────
// Prevent real detector logic from running — they are not under test here.

jest.mock('../services/detectors/InactivityDetector',   () => ({ check: jest.fn().mockReturnValue(null) }));
jest.mock('../services/detectors/VolumeDropDetector',   () => ({ check: jest.fn().mockReturnValue(null) }));
jest.mock('../services/detectors/MistakeSpikeDetector', () => ({ check: jest.fn().mockReturnValue(null) }));
jest.mock('../services/detectors/LosingStreakDetector',  () => ({ check: jest.fn().mockReturnValue(null) }));
jest.mock('../services/detectors/RegressionDetector',   () => ({ check: jest.fn().mockReturnValue(null) }));
jest.mock('../services/detectors/MilestoneDetector',    () => ({ check: jest.fn().mockReturnValue(null) }));

// ─── Module under test ─────────────────────────────────────────────────────────

const { generateAlerts } = require('../services/AlertService');

// ─── Test data ─────────────────────────────────────────────────────────────────

const COACH_A = 'coach-a-uuid';
const COACH_B = 'coach-b-uuid';

const STUDENTS_COACH_A = [
  { id: 'student-a1', display_name: 'Alice', last_seen: null },
  { id: 'student-a2', display_name: 'Andy',  last_seen: null },
];

const STUDENTS_COACH_B = [
  { id: 'student-b1', display_name: 'Bob',   last_seen: null },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a chainable Supabase query builder that ultimately resolves to `result`.
 * Tracks `.eq()` calls so we can assert which filters were applied.
 */
function makeQueryBuilder(result) {
  const eqCalls = [];
  const inCalls = [];

  const builder = {
    select:      jest.fn().mockReturnThis(),
    in:          jest.fn((...args) => { inCalls.push(args); return builder; }),
    eq:          jest.fn((...args) => { eqCalls.push(args); return builder; }),
    order:       jest.fn().mockReturnThis(),
    limit:       jest.fn().mockReturnThis(),
    range:       jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    // Expose for assertions
    _eqCalls: eqCalls,
    _inCalls: inCalls,
    // Resolve the terminal await — the top-level query returns this
    then: (resolve) => resolve(result),
  };

  return builder;
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('AlertService.generateAlerts — student scoping', () => {
  let playerProfilesBuilder;

  beforeEach(() => {
    jest.clearAllMocks();

    // Track the player_profiles query builder so we can inspect its .eq() calls.
    playerProfilesBuilder = null;

    mockFrom.mockImplementation((tableName) => {
      switch (tableName) {
        case 'player_roles': {
          // Return all student-role rows (both coaches' students share the same roles table).
          const allStudentIds = [...STUDENTS_COACH_A, ...STUDENTS_COACH_B].map(s => s.id);
          return makeQueryBuilder({
            data: allStudentIds.map(id => ({ player_id: id, roles: { name: 'coached_student' } })),
            error: null,
          });
        }

        case 'player_profiles': {
          // Capture the builder so we can inspect coach_id filter later.
          // Resolve with only coach-A students — simulating the DB honouring the coach_id filter.
          playerProfilesBuilder = makeQueryBuilder({
            data:  STUDENTS_COACH_A,
            error: null,
          });
          return playerProfilesBuilder;
        }

        case 'alert_config':
          return makeQueryBuilder({ data: [], error: null });

        case 'student_baselines':
          return makeQueryBuilder({ data: null, error: null });

        case 'session_player_stats':
          return makeQueryBuilder({ data: [], error: null });

        case 'leaderboard':
          return makeQueryBuilder({ data: null, error: null });

        case 'alert_instances':
          return makeQueryBuilder({ data: [], error: null });

        default:
          return makeQueryBuilder({ data: [], error: null });
      }
    });
  });

  test('calls player_profiles query with .eq("coach_id", coachId)', async () => {
    await generateAlerts(COACH_A);

    expect(playerProfilesBuilder).not.toBeNull();

    const coachIdFilter = playerProfilesBuilder._eqCalls.find(
      ([col]) => col === 'coach_id'
    );

    expect(coachIdFilter).toBeDefined();
    expect(coachIdFilter[1]).toBe(COACH_A);
  });

  test('does NOT pass coach-B id when called with coach-A id', async () => {
    await generateAlerts(COACH_A);

    expect(playerProfilesBuilder).not.toBeNull();

    const coachIdFilter = playerProfilesBuilder._eqCalls.find(
      ([col]) => col === 'coach_id'
    );

    // The filter value must be coach-A, never coach-B.
    expect(coachIdFilter?.[1]).not.toBe(COACH_B);
  });

  test('returns only alerts for coach-A students when called with coach-A id', async () => {
    // Override player_profiles to return coach-A students only (as filtered by DB).
    // Override alert_instances (final fetch) to return an alert for student-a1.
    mockFrom.mockImplementation((tableName) => {
      if (tableName === 'player_roles') {
        const allIds = [...STUDENTS_COACH_A, ...STUDENTS_COACH_B].map(s => s.id);
        return makeQueryBuilder({
          data: allIds.map(id => ({ player_id: id, roles: { name: 'coached_student' } })),
          error: null,
        });
      }
      if (tableName === 'player_profiles') {
        playerProfilesBuilder = makeQueryBuilder({ data: STUDENTS_COACH_A, error: null });
        return playerProfilesBuilder;
      }
      if (tableName === 'alert_instances') {
        return makeQueryBuilder({
          data: [
            { id: 'alert-1', player_id: 'student-a1', alert_type: 'inactivity', severity: 0.8, data: {}, created_at: new Date().toISOString(), status: 'active' },
          ],
          error: null,
        });
      }
      return makeQueryBuilder({ data: [], error: null });
    });

    const alerts = await generateAlerts(COACH_A);

    const playerIds = alerts.map(a => a.player_id);

    // All returned alerts belong to coach-A students.
    for (const pid of playerIds) {
      expect(STUDENTS_COACH_A.map(s => s.id)).toContain(pid);
    }

    // No coach-B students appear in the alerts.
    for (const bStudent of STUDENTS_COACH_B) {
      expect(playerIds).not.toContain(bStudent.id);
    }
  });

  test('returns empty array when coach has no students', async () => {
    mockFrom.mockImplementation((tableName) => {
      if (tableName === 'player_roles') {
        return makeQueryBuilder({ data: [], error: null });
      }
      if (tableName === 'alert_config') {
        return makeQueryBuilder({ data: [], error: null });
      }
      return makeQueryBuilder({ data: [], error: null });
    });

    const alerts = await generateAlerts(COACH_A);
    expect(alerts).toEqual([]);
  });
});
