'use strict';

/**
 * BaselineService.test.js
 *
 * Tests for the 3-bet percentage calculation fix (Task C-6).
 *
 * The bug: 3-bet% always shows 0% because the action query filters by player_id,
 * so it only sees the focal player's actions, not opponent raises.
 *
 * The fix: Fetch ALL preflop actions (no player_id filter), order by id,
 * and check if focal player raised AFTER an opponent's initial raise.
 */

const mockFrom = jest.fn();

jest.mock('../db/supabase.js', () => ({
  from: (...args) => mockFrom(...args),
}));

const { recompute } = require('../services/BaselineService');

// ─── Helper: Build a chainable query builder ──────────────────────────────────

function makeQueryBuilder(result) {
  const builder = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    gt: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    not: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: result, error: null }),
    then: (resolve) => resolve({ data: result, error: null }),
  };
  return builder;
}

/**
 * Create a mock query builder that simulates filtering by player_id.
 * This is used for hand_actions queries where the real code does .eq('player_id', playerId).
 */
function makeFocusedActionBuilder(allActions, focalPlayerId) {
  const eqCalls = [];
  const builder = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn(function(field, value) {
      eqCalls.push({ field, value });
      return builder;
    }),
    in: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    gt: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    not: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    then: (resolve) => {
      // Filter actions based on the eq calls (simulate real Supabase behavior)
      const playerIdFilter = eqCalls.find(c => c.field === 'player_id');
      if (playerIdFilter && playerIdFilter.value !== focalPlayerId) {
        resolve({ data: [], error: null });
      } else if (playerIdFilter && playerIdFilter.value === focalPlayerId) {
        // Return only the focal player's actions (this is the BUG)
        const filtered = allActions.filter(a => a.player_id === focalPlayerId);
        resolve({ data: filtered, error: null });
      } else {
        // No player_id filter, return all actions
        resolve({ data: allActions, error: null });
      }
    },
  };
  return builder;
}

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('BaselineService.recompute — 3-bet percentage', () => {
  const FOCAL_PLAYER = 'focal-player-uuid';
  const OPPONENT_A = 'opponent-a-uuid';
  const OPPONENT_B = 'opponent-b-uuid';
  const SESSION_ID = 'session-uuid';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should count 3-bet when focal player raises after opponent opens', async () => {
    /**
     * Hand 1: Focal player reraises opponent's open.
     * - Opponent A raises (first raiser)
     * - Focal player reraises (3-bet) ✓
     *
     * BEFORE FIX: only sees focal player's raise, count=1, opps=1, but logic is broken
     * AFTER FIX: should properly count 1 3-bet opportunity where focal player did 3-bet
     */

    const HAND_ID_1 = 'hand-1-uuid';
    const allActions = [
      {
        id: 1,
        hand_id: HAND_ID_1,
        player_id: OPPONENT_A,
        street: 'preflop',
        action: 'raise',
      },
      {
        id: 2,
        hand_id: HAND_ID_1,
        player_id: FOCAL_PLAYER,
        street: 'preflop',
        action: 'raise',
      },
    ];

    mockFrom.mockImplementation((table) => {
      if (table === 'sessions') {
        return makeQueryBuilder([{ session_id: SESSION_ID }]);
      }
      if (table === 'session_player_stats') {
        return makeQueryBuilder([
          {
            hands_played: 10,
            vpip_count: 1,
            pfr_count: 1,
            wtsd_count: 0,
            wsd_count: 0,
            net_chips: 50,
          },
        ]);
      }
      if (table === 'hand_actions') {
        // Use the focused action builder that simulates the real filter
        return makeFocusedActionBuilder(allActions, FOCAL_PLAYER);
      }
      if (table === 'hand_tags') {
        return makeQueryBuilder([]);
      }
      if (table === 'hands') {
        return makeQueryBuilder([{ big_blind: 2 }]);
      }
      if (table === 'student_baselines') {
        return {
          ...makeQueryBuilder(null),
          upsert: jest.fn().mockResolvedValue({ error: null }),
        };
      }
      return makeQueryBuilder([]);
    });

    const baseline = await recompute(FOCAL_PLAYER);

    expect(baseline).not.toBeNull();
    // BUG: currently this shows 0 because the code only sees focal player's raise (count=1)
    // and the logic counts: raisesBefore=1, threeBetOpps++, but raisesBefore < 2 so threeBetCount stays 0
    // AFTER FIX: should properly count this as 1 3-bet (focal player raised after opponent opened)
    expect(baseline.three_bet_pct).toBe(1); // 1 out of 1 opportunity
  });

  it('should NOT count 3-bet when focal player limps first', async () => {
    /**
     * Hand 2: Focal player limps, opponent raises (not a 3-bet for focal player).
     * - Focal player calls (limp)
     * - Opponent A raises
     * - Focal player folds
     *
     * BEFORE FIX: doesn't see opponent's raise, so threeBetOpps=0, threeBetPct stays null
     * AFTER FIX: should properly count 1 3-bet opportunity where focal player did NOT 3-bet
     */

    const HAND_ID_2 = 'hand-2-uuid';
    const allActions = [
      {
        id: 1,
        hand_id: HAND_ID_2,
        player_id: FOCAL_PLAYER,
        street: 'preflop',
        action: 'call',
      },
      {
        id: 2,
        hand_id: HAND_ID_2,
        player_id: OPPONENT_A,
        street: 'preflop',
        action: 'raise',
      },
      {
        id: 3,
        hand_id: HAND_ID_2,
        player_id: FOCAL_PLAYER,
        street: 'preflop',
        action: 'fold',
      },
    ];

    mockFrom.mockImplementation((table) => {
      if (table === 'sessions') {
        return makeQueryBuilder([{ session_id: SESSION_ID }]);
      }
      if (table === 'session_player_stats') {
        return makeQueryBuilder([
          {
            hands_played: 10,
            vpip_count: 1,
            pfr_count: 0,
            wtsd_count: 0,
            wsd_count: 0,
            net_chips: -10,
          },
        ]);
      }
      if (table === 'hand_actions') {
        // Use the focused action builder
        return makeFocusedActionBuilder(allActions, FOCAL_PLAYER);
      }
      if (table === 'hand_tags') {
        return makeQueryBuilder([]);
      }
      if (table === 'hands') {
        return makeQueryBuilder([{ big_blind: 2 }]);
      }
      if (table === 'student_baselines') {
        return {
          ...makeQueryBuilder(null),
          upsert: jest.fn().mockResolvedValue({ error: null }),
        };
      }
      return makeQueryBuilder([]);
    });

    const baseline = await recompute(FOCAL_PLAYER);

    expect(baseline).not.toBeNull();
    // BUG: currently shows null because focal player only did call/fold, no raises seen
    // threeBetOpps stays 0, so threeBetPct = null
    // AFTER FIX: should properly count 1 3-bet opportunity where focal player did NOT 3-bet
    expect(baseline.three_bet_pct).toBe(0);
  });

  it('should handle multiple hands with mixed 3-bet scenarios', async () => {
    /**
     * Mixed hands:
     * - Hand 1: Opponent opens, focal player reraises (3-bet) ✓
     * - Hand 2: Focal player limps, opponent raises, focal player folds (no 3-bet)
     *
     * AFTER FIX: 3-bet % = 0.5 (1 out of 2 opportunities)
     */

    const HAND_ID_1 = 'hand-1-uuid';
    const HAND_ID_2 = 'hand-2-uuid';
    const allActions = [
      // Hand 1: opponent opens, focal player reraises
      {
        id: 1,
        hand_id: HAND_ID_1,
        player_id: OPPONENT_A,
        street: 'preflop',
        action: 'raise',
      },
      {
        id: 2,
        hand_id: HAND_ID_1,
        player_id: FOCAL_PLAYER,
        street: 'preflop',
        action: 'raise',
      },
      // Hand 2: focal player limps, opponent raises
      {
        id: 3,
        hand_id: HAND_ID_2,
        player_id: FOCAL_PLAYER,
        street: 'preflop',
        action: 'call',
      },
      {
        id: 4,
        hand_id: HAND_ID_2,
        player_id: OPPONENT_B,
        street: 'preflop',
        action: 'raise',
      },
      {
        id: 5,
        hand_id: HAND_ID_2,
        player_id: FOCAL_PLAYER,
        street: 'preflop',
        action: 'fold',
      },
    ];

    mockFrom.mockImplementation((table) => {
      if (table === 'sessions') {
        return makeQueryBuilder([{ session_id: SESSION_ID }]);
      }
      if (table === 'session_player_stats') {
        return makeQueryBuilder([
          {
            hands_played: 20,
            vpip_count: 2,
            pfr_count: 1,
            wtsd_count: 0,
            wsd_count: 0,
            net_chips: 40,
          },
        ]);
      }
      if (table === 'hand_actions') {
        return makeFocusedActionBuilder(allActions, FOCAL_PLAYER);
      }
      if (table === 'hand_tags') {
        return makeQueryBuilder([]);
      }
      if (table === 'hands') {
        return makeQueryBuilder([{ big_blind: 2 }]);
      }
      if (table === 'student_baselines') {
        return {
          ...makeQueryBuilder(null),
          upsert: jest.fn().mockResolvedValue({ error: null }),
        };
      }
      return makeQueryBuilder([]);
    });

    const baseline = await recompute(FOCAL_PLAYER);

    expect(baseline).not.toBeNull();
    // AFTER FIX: should be 0.5 (1 out of 2 3-bet opportunities)
    expect(baseline.three_bet_pct).toBe(0.5);
  });
});
