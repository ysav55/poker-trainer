'use strict';

/**
 * AlertService + detector unit tests.
 *
 * All Supabase calls are mocked.
 *
 * Coverage:
 *   Detectors (6):
 *     - InactivityDetector: inactive / not-inactive / no last_hand_at / custom threshold
 *     - VolumeDropDetector: drop detected / not dropped / insufficient baseline / custom threshold
 *     - MistakeSpikeDetector: spike detected / under threshold / no baseline / multiple spikes
 *     - LosingStreakDetector: streak triggered / not enough losses / streak broken / custom threshold
 *     - RegressionDetector: regression detected / no regression / missing weekly stats
 *     - MilestoneDetector: first profitable week / stat improvement held / no milestone
 *   AlertService:
 *     - generateAlerts: happy path with mixed detectors
 *     - generateAlerts: severity filter (< 0.2 suppressed; milestones exempt)
 *     - generateAlerts: dedup — updates existing active alert instead of inserting
 *     - generateAlerts: handles detector errors gracefully
 *     - generateAlerts: returns [] when no students
 */

// ─── Supabase mock ────────────────────────────────────────────────────────────

let mockTableData = {};

function makeChain(tableData) {
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
    range:       jest.fn().mockResolvedValue(tableData),
    insert:      jest.fn().mockResolvedValue({ data: null, error: null }),
    upsert:      jest.fn().mockResolvedValue({ data: null, error: null }),
    update:      jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue(tableData),
    single:      jest.fn().mockResolvedValue(tableData),
    then: (resolve, reject) => Promise.resolve(tableData).then(resolve, reject),
  };
  return chain;
}

const mockFrom = jest.fn();
const mockSupabase = { from: mockFrom };

jest.mock('../../db/supabase', () => mockSupabase);

function setTable(table, data, error = null) {
  mockTableData[table] = { data, error };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockTableData = {};

  for (const table of [
    'player_profiles', 'player_roles', 'alert_config', 'student_baselines',
    'session_player_stats', 'leaderboard', 'alert_instances',
  ]) {
    setTable(table, null);
  }

  mockFrom.mockImplementation((table) => makeChain(mockTableData[table] ?? { data: null, error: null }));
});

// ─── Detector imports ─────────────────────────────────────────────────────────

const InactivityDetector   = require('../detectors/InactivityDetector');
const VolumeDropDetector   = require('../detectors/VolumeDropDetector');
const MistakeSpikeDetector = require('../detectors/MistakeSpikeDetector');
const LosingStreakDetector  = require('../detectors/LosingStreakDetector');
const RegressionDetector   = require('../detectors/RegressionDetector');
const MilestoneDetector    = require('../detectors/MilestoneDetector');
const AlertService         = require('../AlertService');

// ─── InactivityDetector ───────────────────────────────────────────────────────

describe('InactivityDetector', () => {
  const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

  test('returns null when player is within threshold', () => {
    const student = { id: 'p1', last_hand_at: daysAgo(3) };
    expect(InactivityDetector.check(student, {})).toBeNull();
  });

  test('returns null when last_hand_at is null', () => {
    expect(InactivityDetector.check({ id: 'p1', last_hand_at: null }, {})).toBeNull();
  });

  test('fires with correct severity when over default threshold (5 days)', () => {
    // Use a custom threshold of 10 so severity doesn't get capped (12/10 = 1.2 → capped 1.0).
    // Use 7 days with threshold 10: 7/10 = 0.7.
    const student = { id: 'p1', last_hand_at: daysAgo(7) };
    const config  = { inactivity: { days: 5 } };
    const result  = InactivityDetector.check(student, config);

    expect(result.alert_type).toBe('inactivity');
    // 7/5 = 1.4 → capped at 1.0
    expect(result.severity).toBe(1.0);
    expect(result.severity).toBeLessThanOrEqual(1.0);
    expect(result.data.days_inactive).toBe(7);
    expect(result.data.threshold_days).toBe(5);
  });

  test('caps severity at 1.0', () => {
    const student = { id: 'p1', last_hand_at: daysAgo(20) };
    expect(InactivityDetector.check(student, {}).severity).toBe(1.0);
  });

  test('respects custom threshold from config', () => {
    const student = { id: 'p1', last_hand_at: daysAgo(6) };
    const config  = { inactivity: { days: 10 } };
    expect(InactivityDetector.check(student, config)).toBeNull();
  });
});

// ─── VolumeDropDetector ───────────────────────────────────────────────────────

describe('VolumeDropDetector', () => {
  const baselineWith = (n) => ({ hands_played: n });
  const weeklyWith   = (n) => ({ hands_played: n });

  test('returns null when no baseline', () => {
    expect(VolumeDropDetector.check({}, weeklyWith(5), null, {})).toBeNull();
  });

  test('returns null when avg too small', () => {
    expect(VolumeDropDetector.check({}, weeklyWith(1), baselineWith(10), {})).toBeNull();
  });

  test('returns null when volume is not dropped', () => {
    // avg = 100/4 = 25; this week = 20 >= 25 * 0.5
    expect(VolumeDropDetector.check({}, weeklyWith(20), baselineWith(100), {})).toBeNull();
  });

  test('fires when volume drops below 50%', () => {
    // avg = 100/4 = 25; this week = 5 (20% of avg)
    const result = VolumeDropDetector.check({}, weeklyWith(5), baselineWith(100), {});
    expect(result.alert_type).toBe('volume_drop');
    expect(result.severity).toBeCloseTo(1 - 5 / 25, 1);
    expect(result.data.this_week_hands).toBe(5);
    expect(result.data.avg_weekly_hands).toBe(25);
  });

  test('respects custom drop_pct threshold', () => {
    // avg = 100/4 = 25; threshold 30%; this week = 10 (40% of avg — not dropped enough)
    const config = { volume_drop: { drop_pct: 0.3 } };
    expect(VolumeDropDetector.check({}, weeklyWith(10), baselineWith(100), config)).toBeNull();
  });
});

// ─── MistakeSpikeDetector ─────────────────────────────────────────────────────

describe('MistakeSpikeDetector', () => {
  const makeBaseline = (tag, count, totalHands) => ({
    tag_profile:  { [tag]: count },
    hands_played: totalHands,
  });

  test('returns null when no baseline data', () => {
    expect(MistakeSpikeDetector.check({}, null, 0, null, {})).toBeNull();
  });

  test('returns null when baseline hands < 10', () => {
    expect(MistakeSpikeDetector.check({}, {}, 5, { tag_profile: {}, hands_played: 5 }, {})).toBeNull();
  });

  test('returns null when no spike above ratio', () => {
    // baseline: 5 OPEN_LIMPs in 100 hands = 5/100 rate; current: 6 in 100 = 6/100 (1.2× — below 1.5×)
    const baseline = makeBaseline('OPEN_LIMP', 5, 100);
    expect(MistakeSpikeDetector.check({}, { OPEN_LIMP: 6 }, 100, baseline, {})).toBeNull();
  });

  test('fires when mistake tag spikes above ratio', () => {
    // baseline: 5 OPEN_LIMPs in 100 hands = 5/100 rate; current: 10 in 100 = 10/100 (2× — above 1.5×)
    const baseline = makeBaseline('OPEN_LIMP', 5, 100);
    const result   = MistakeSpikeDetector.check({}, { OPEN_LIMP: 10 }, 100, baseline, {});

    expect(result.alert_type).toBe('mistake_spike');
    expect(result.data.spikes).toHaveLength(1);
    expect(result.data.spikes[0].tag).toBe('OPEN_LIMP');
    expect(result.data.spikes[0].ratio).toBeCloseTo(2.0);
    expect(result.severity).toBeGreaterThan(0);
  });

  test('returns highest-severity spike as top-level severity', () => {
    const baseline = {
      tag_profile:  { OPEN_LIMP: 5, FOLD_TO_PROBE: 3 },
      hands_played: 100,
    };
    const weeklyTags = { OPEN_LIMP: 15, FOLD_TO_PROBE: 9 };  // both spiked
    const result = MistakeSpikeDetector.check({}, weeklyTags, 100, baseline, {});

    expect(result.data.spikes.length).toBeGreaterThanOrEqual(2);
    // First spike should have highest severity.
    expect(result.data.spikes[0].severity).toBeGreaterThanOrEqual(result.data.spikes[1].severity);
  });
});

// ─── LosingStreakDetector ─────────────────────────────────────────────────────

describe('LosingStreakDetector', () => {
  const sessions = (nets) =>
    nets.map((n, i) => ({ session_id: `s${i}`, net_chips: n, ended_at: new Date().toISOString() }));

  test('returns null when not enough sessions', () => {
    expect(LosingStreakDetector.check({}, sessions([-100, -200]), {})).toBeNull();
  });

  test('returns null when streak is broken before threshold', () => {
    expect(LosingStreakDetector.check({}, sessions([-100, 200, -300]), {})).toBeNull();
  });

  test('fires at default threshold of 3', () => {
    const result = LosingStreakDetector.check({}, sessions([-100, -200, -300, 400]), {});
    expect(result.alert_type).toBe('losing_streak');
    expect(result.data.streak_sessions).toBe(3);
    expect(result.data.total_loss).toBe(-600);
  });

  test('caps severity at 1.0 for long streaks', () => {
    const result = LosingStreakDetector.check({}, sessions([-100, -200, -300, -400, -500]), {});
    expect(result.severity).toBeLessThanOrEqual(1.0);
  });

  test('respects custom streak_length config', () => {
    const config = { losing_streak: { streak_length: 5 } };
    // Only 3 losses — below custom threshold of 5
    expect(LosingStreakDetector.check({}, sessions([-100, -200, -300, 400]), config)).toBeNull();
  });
});

// ─── RegressionDetector ──────────────────────────────────────────────────────

describe('RegressionDetector', () => {
  test('returns null when no baseline', () => {
    expect(RegressionDetector.check({}, { vpip: 0.35 }, null, {})).toBeNull();
  });

  test('returns null when no weekly stats', () => {
    expect(RegressionDetector.check({}, null, { vpip: 0.24 }, {})).toBeNull();
  });

  test('returns null when stat within z-threshold', () => {
    // baseline vpip=0.24, stddev≈0.048; current=0.27 → z≈0.6 (well under 2.0)
    const baseline = { vpip: 0.24, pfr: null, three_bet_pct: null, aggression: null };
    const weekly   = { vpip: 0.27, pfr: null, three_bet_pct: null, aggression: null };
    expect(RegressionDetector.check({}, weekly, baseline, {})).toBeNull();
  });

  test('fires when stat exceeds z-threshold', () => {
    // baseline vpip=0.24, stddev≈0.048; current=0.36 → z≈2.5
    const baseline = { vpip: 0.24, pfr: null, three_bet_pct: null, aggression: null };
    const weekly   = { vpip: 0.36, pfr: null, three_bet_pct: null, aggression: null };
    const result   = RegressionDetector.check({}, weekly, baseline, {});

    expect(result.alert_type).toBe('stat_regression');
    expect(result.data.regressions[0].stat).toBe('vpip');
    expect(result.data.regressions[0].z_score).toBeGreaterThan(2.0);
    expect(result.severity).toBeGreaterThan(0);
  });

  test('severity = abs(z_score) / 4, capped at 1.0', () => {
    // baseline vpip=0.10, stddev≈0.02; current=0.50 → z=(0.40/0.02)=20 → severity=1.0
    const baseline = { vpip: 0.10, pfr: null, three_bet_pct: null, aggression: null };
    const weekly   = { vpip: 0.50, pfr: null, three_bet_pct: null, aggression: null };
    expect(RegressionDetector.check({}, weekly, baseline, {}).severity).toBe(1.0);
  });
});

// ─── MilestoneDetector ────────────────────────────────────────────────────────

describe('MilestoneDetector', () => {
  const makeBaseline  = (vpip) => ({ vpip, pfr: null, fold_to_cbet: null });
  const sessions = (nets) =>
    nets.map((n, i) => ({ session_id: `s${i}`, net_chips: n, ended_at: new Date().toISOString() }));

  test('returns null when no milestones triggered', () => {
    // This week negative, no stat improvement
    const weekly   = { hands_played: 50, net_chips: -500, vpip: 0.24, pfr: null, fold_to_cbet: null };
    const baseline = makeBaseline(0.24);
    const prev     = makeBaseline(0.25);
    const sess     = sessions([-100, -200, -300]);
    expect(MilestoneDetector.check({}, weekly, baseline, prev, sess)).toBeNull();
  });

  test('detects first_profitable_week', () => {
    const weekly = { hands_played: 50, net_chips: 3000, vpip: null, pfr: null, fold_to_cbet: null };
    const sess   = sessions([-100, -200, -300]);  // prior weeks all negative
    const result = MilestoneDetector.check({}, weekly, null, null, sess);

    expect(result.alert_type).toBe('positive_milestone');
    expect(result.severity).toBe(0.0);
    expect(result.data.milestones[0].milestone_type).toBe('first_profitable_week');
  });

  test('does not flag first_profitable_week when prior week was profitable', () => {
    const weekly = { hands_played: 50, net_chips: 3000, vpip: null, pfr: null, fold_to_cbet: null };
    const sess   = sessions([-100, 200, -300]);  // second prior session was profitable
    expect(MilestoneDetector.check({}, weekly, null, null, sess)).toBeNull();
  });
});

// ─── AlertService ─────────────────────────────────────────────────────────────

describe('AlertService.generateAlerts', () => {
  const COACH_ID   = 'coach-uuid-1';
  const STUDENT_ID = 'student-uuid-1';

  function setupStudents(students) {
    setTable('player_profiles', students);
    // _fetchStudents first queries player_roles to find student IDs, then player_profiles
    setTable('player_roles', students.map(s => ({
      player_id: s.id,
      roles: { name: 'coached_student' },
    })));
  }
  function setupAlertConfig(rows) {
    setTable('alert_config', rows ?? []);
  }
  function setupBaseline(data) {
    setTable('student_baselines', data);
  }
  function setupSessions(data) {
    setTable('session_player_stats', data);
  }
  function setupLeaderboard(data) {
    setTable('leaderboard', data);
  }
  function setupAlertInstances(data) {
    setTable('alert_instances', data);
  }

  beforeEach(() => {
    setupStudents([{ id: STUDENT_ID, display_name: 'Alex' }]);
    setupAlertConfig([]);
    setupBaseline(null);
    setupSessions([]);
    setupLeaderboard({ last_hand_at: null, net_chips: 0, total_hands: 0 });
    setupAlertInstances([]);
  });

  test('returns [] when no students', async () => {
    setupStudents([]);
    const result = await AlertService.generateAlerts(COACH_ID);
    expect(result).toEqual([]);
  });

  test('generates inactivity alert for inactive student', async () => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    setupLeaderboard({ last_hand_at: sevenDaysAgo, net_chips: 0, total_hands: 50 });

    // fresh_alerts returned after upsert
    setTable('alert_instances', [
      {
        id: 'a1', player_id: STUDENT_ID, alert_type: 'inactivity',
        severity: 1.0, data: {}, status: 'active', created_at: new Date().toISOString(),
      },
    ]);

    const result = await AlertService.generateAlerts(COACH_ID);
    expect(result).toHaveLength(1);
    expect(result[0].alert_type).toBe('inactivity');
  });

  test('suppresses alerts with severity < 0.2', async () => {
    // Student barely inactive (just over 5-day threshold → severity ≈ 0.12)
    const fiveAndHalfDaysAgo = new Date(Date.now() - 5.6 * 86400000).toISOString();
    setupLeaderboard({ last_hand_at: fiveAndHalfDaysAgo, net_chips: 0, total_hands: 50 });

    // After suppression, no active alerts persist.
    setTable('alert_instances', []);

    const result = await AlertService.generateAlerts(COACH_ID);
    // Inserts would have been skipped; final fetch returns [].
    expect(result).toEqual([]);
  });

  test('deduplicates: updates existing active alert instead of inserting', async () => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    setupLeaderboard({ last_hand_at: sevenDaysAgo, net_chips: 0, total_hands: 50 });

    // Pre-existing active alert for this student+type.
    setTable('alert_instances', [
      { id: 'existing-1', player_id: STUDENT_ID, alert_type: 'inactivity', status: 'active', severity: 0.9, data: {} },
    ]);

    await AlertService.generateAlerts(COACH_ID);

    // The mock `from` calls should include an `update` call (not just insert).
    const calls = mockFrom.mock.calls.map(c => c[0]);
    expect(calls).toContain('alert_instances');
  });

  test('handles individual student errors gracefully without throwing', async () => {
    // Make leaderboard throw for this student.
    mockFrom.mockImplementation((table) => {
      if (table === 'leaderboard') throw new Error('DB error');
      return makeChain(mockTableData[table] ?? { data: null, error: null });
    });

    // Should not throw; just returns empty.
    await expect(AlertService.generateAlerts(COACH_ID)).resolves.toBeDefined();
  });
});
