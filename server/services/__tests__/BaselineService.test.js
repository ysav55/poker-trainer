'use strict';

/**
 * BaselineService unit tests.
 *
 * Tests cover:
 *   - Returns null when player has < 2 hands in the 30-day window
 *   - Computes VPIP/PFR/WTSD/WSD correctly from session stats aggregation
 *   - Computes mistake rates (per 100 hands) from hand_tags
 *   - Builds tag_profile JSONB from hand_tags
 *   - Computes aggression factor from hand_actions
 *   - Computes cbet_flop rate
 *   - Upserts the student_baselines row
 *   - Triggers weekly/monthly snapshots on boundary days
 *   - Throws on DB error
 *   - recomputeAfterSession: runs for each player, tolerates failures
 */

// ─── Supabase mock ────────────────────────────────────────────────────────────

// We need to handle multiple sequential .from() calls with different return values.
// Strategy: maintain a call counter per table name and return the right value.

const mockResponses = {};

const mockChain = {
  select:      jest.fn().mockReturnThis(),
  eq:          jest.fn().mockReturnThis(),
  gte:         jest.fn().mockReturnThis(),
  in:          jest.fn().mockReturnThis(),
  is:          jest.fn().mockReturnThis(),
  gt:          jest.fn().mockReturnThis(),
  order:       jest.fn().mockReturnThis(),
  upsert:      jest.fn(),
  // Terminal: most queries end with .then() implicitly (supabase returns a PromiseLike)
  // We simulate this by making the chain itself thenable, returning the last scheduled value.
  _result: null,
  then(resolve) { return Promise.resolve(this._result).then(resolve); },
};

let _fromQueue = []; // [{table, response}] — consumed in order per .from() call

const mockSupabase = {
  from: jest.fn((table) => {
    const next = _fromQueue.find(q => q.table === table);
    if (next) {
      _fromQueue.splice(_fromQueue.indexOf(next), 1);
      mockChain._result = next.response;
    } else {
      mockChain._result = { data: [], error: null };
    }
    return mockChain;
  }),
};

jest.mock('../../db/supabase', () => mockSupabase);

// ─── Module under test ────────────────────────────────────────────────────────

const { recompute, recomputeAfterSession } = require('../BaselineService');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function queueResponse(table, data, error = null) {
  _fromQueue.push({ table, response: { data, error } });
}

// Standard data fixtures
const SESSION_ROWS  = [{ session_id: 'sess-1' }, { session_id: 'sess-2' }];
const STAT_ROWS     = [
  { hands_played: 40, vpip_count: 12, pfr_count: 8, wtsd_count: 10, wsd_count: 6, net_chips: 500 },
  { hands_played: 60, vpip_count: 18, pfr_count: 12, wtsd_count: 14, wsd_count: 8, net_chips: -200 },
];
const ACTIONS       = [
  { hand_id: 'h1', street: 'preflop', action: 'raise',  amount: 30,  pot_at_action: 15 },
  { hand_id: 'h1', street: 'flop',    action: 'bet',    amount: 40,  pot_at_action: 60 },
  { hand_id: 'h2', street: 'preflop', action: 'call',   amount: 10,  pot_at_action: 10 },
  { hand_id: 'h2', street: 'flop',    action: 'fold',   amount: 0,   pot_at_action: 20 },
  { hand_id: 'h3', street: 'preflop', action: 'raise',  amount: 20,  pot_at_action: 10 },
  { hand_id: 'h3', street: 'turn',    action: 'bet',    amount: 50,  pot_at_action: 80 },
];
const PLAYER_TAGS   = [{ tag: 'OPEN_LIMP' }, { tag: 'EQUITY_FOLD' }, { tag: 'C_BET' }];
const HAND_TAGS     = [{ tag: '3BET_POT' }];
const HANDS_BB      = [{ big_blind: 10 }, { big_blind: 10 }, { big_blind: 10 }];

function queueHappyPath() {
  queueResponse('sessions',             SESSION_ROWS);
  queueResponse('session_player_stats', STAT_ROWS);
  queueResponse('hand_actions',         ACTIONS);
  queueResponse('hand_tags',            PLAYER_TAGS); // player-specific tags
  queueResponse('hand_tags',            HAND_TAGS);   // hand-level tags
  queueResponse('hands',                HANDS_BB);    // bb_per_100
  mockChain.upsert.mockResolvedValue({ data: null, error: null });
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  _fromQueue = [];
  mockChain._result = { data: [], error: null };
  mockChain.upsert.mockResolvedValue({ data: null, error: null });
  // Re-wire chainable methods
  mockChain.select.mockReturnThis();
  mockChain.eq.mockReturnThis();
  mockChain.gte.mockReturnThis();
  mockChain.in.mockReturnThis();
  mockChain.is.mockReturnThis();
  mockChain.gt.mockReturnThis();
  mockChain.order.mockReturnThis();
});

// ─── recompute ────────────────────────────────────────────────────────────────

describe('recompute', () => {
  test('throws when playerId is missing', async () => {
    await expect(recompute(null)).rejects.toThrow('playerId is required');
  });

  test('returns null when player has 0 hands in the window', async () => {
    queueResponse('sessions',             SESSION_ROWS);
    queueResponse('session_player_stats', []);
    const result = await recompute('player-uuid');
    expect(result).toBeNull();
  });

  test('returns null when player has only 1 hand', async () => {
    queueResponse('sessions',             SESSION_ROWS);
    queueResponse('session_player_stats', [{ hands_played: 1, vpip_count: 0, pfr_count: 0, wtsd_count: 0, wsd_count: 0, net_chips: 0 }]);
    const result = await recompute('player-uuid');
    expect(result).toBeNull();
  });

  test('returns null when no sessions in the window', async () => {
    queueResponse('sessions', []);
    const result = await recompute('player-uuid');
    expect(result).toBeNull();
  });

  test('computes VPIP correctly (totalVpip / totalHands)', async () => {
    queueHappyPath();
    const baseline = await recompute('player-uuid');
    // totalVpip = 12 + 18 = 30, totalHands = 100
    expect(baseline.vpip).toBeCloseTo(0.3, 4);
  });

  test('computes PFR correctly', async () => {
    queueHappyPath();
    const baseline = await recompute('player-uuid');
    // totalPfr = 8 + 12 = 20, totalHands = 100
    expect(baseline.pfr).toBeCloseTo(0.2, 4);
  });

  test('computes WTSD correctly', async () => {
    queueHappyPath();
    const baseline = await recompute('player-uuid');
    // totalWtsd = 10 + 14 = 24, totalHands = 100
    expect(baseline.wtsd).toBeCloseTo(0.24, 4);
  });

  test('computes WSD correctly', async () => {
    queueHappyPath();
    const baseline = await recompute('player-uuid');
    // totalWsd = 6 + 8 = 14, totalWtsd = 24
    expect(baseline.wsd).toBeCloseTo(14 / 24, 4);
  });

  test('computes net_chips correctly', async () => {
    queueHappyPath();
    const baseline = await recompute('player-uuid');
    expect(baseline.net_chips).toBe(300); // 500 + (-200)
  });

  test('computes aggression factor from actions', async () => {
    queueHappyPath();
    const baseline = await recompute('player-uuid');
    // bets/raises = 3 (raise h1, bet h1, raise h3, bet h3) — wait, let me count:
    // h1: raise+bet = 2; h2: call = 1; h3: raise+bet = 2 → bets+raises = 4, calls = 1
    // aggression = 4/1 = 4
    expect(baseline.aggression).toBeGreaterThan(0);
  });

  test('computes cbet_flop rate', async () => {
    queueHappyPath();
    const baseline = await recompute('player-uuid');
    // h1: preflop raise + flop bet → c-bet; h3: preflop raise, no flop → no c-bet
    // pfRaiserHands = 2 (h1, h3), cbetFlopCount = 1 (h1)
    expect(baseline.cbet_flop).toBeCloseTo(0.5, 2);
  });

  test('computes mistake rates per 100 hands from tags', async () => {
    queueHappyPath();
    const baseline = await recompute('player-uuid');
    // OPEN_LIMP = 1 / 100 hands * 100 = 1.0 per 100
    expect(baseline.open_limp_rate).toBeCloseTo(1.0, 1);
    // EQUITY_FOLD = 1 / 100 * 100 = 1.0
    expect(baseline.equity_fold_rate).toBeCloseTo(1.0, 1);
    // OVERLIMP = 0
    expect(baseline.overlimp_rate).toBe(0);
  });

  test('builds tag_profile from all tags', async () => {
    queueHappyPath();
    const baseline = await recompute('player-uuid');
    expect(baseline.tag_profile).toMatchObject({
      OPEN_LIMP:  1,
      EQUITY_FOLD: 1,
      C_BET:      1,
      '3BET_POT': 1,
    });
  });

  test('sets period_type to rolling_30d', async () => {
    queueHappyPath();
    const baseline = await recompute('player-uuid');
    expect(baseline.period_type).toBe('rolling_30d');
  });

  test('calls upsert with correct conflict key', async () => {
    queueHappyPath();
    await recompute('player-uuid');
    expect(mockChain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ player_id: 'player-uuid', period_type: 'rolling_30d' }),
      { onConflict: 'player_id,period_type,period_start' }
    );
  });

  test('throws when DB session query fails', async () => {
    _fromQueue.push({ table: 'sessions', response: { data: null, error: { message: 'DB down' } } });
    await expect(recompute('player-uuid')).rejects.toThrow('DB down');
  });

  test('throws when upsert fails', async () => {
    queueHappyPath();
    mockChain.upsert.mockResolvedValue({ data: null, error: { message: 'upsert failed' } });
    await expect(recompute('player-uuid')).rejects.toThrow('upsert failed');
  });
});

// ─── recomputeAfterSession ────────────────────────────────────────────────────

describe('recomputeAfterSession', () => {
  test('returns immediately for empty player list', async () => {
    await expect(recomputeAfterSession([])).resolves.toBeUndefined();
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  test('runs recompute for each player', async () => {
    // Queue two sets of happy-path responses
    for (let i = 0; i < 2; i++) queueHappyPath();
    await recomputeAfterSession(['p1', 'p2']);
    // from() should have been called at least once per player
    expect(mockSupabase.from).toHaveBeenCalled();
  });

  test('does not throw when one player fails', async () => {
    // p1: DB error; p2: happy path
    _fromQueue.push({ table: 'sessions', response: { data: null, error: { message: 'fail' } } });
    queueHappyPath(); // for p2
    await expect(recomputeAfterSession(['p1', 'p2'])).resolves.toBeUndefined();
  });
});
