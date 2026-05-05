'use strict';

/**
 * SessionQualityService unit tests.
 *
 * Tests cover:
 *   - Returns score=0 for empty session (no hands)
 *   - Counts mistake tags correctly
 *   - Counts good-play tags correctly
 *   - Computes sizing accuracy from hand_actions
 *   - Composite score is always in 0-100 range
 *   - Stores quality_score and quality_breakdown in session_player_stats
 *   - Throws when DB query fails
 *   - Throws when missing required params
 */

// ─── Supabase mock ────────────────────────────────────────────────────────────
// Each .from() call returns a FRESH chain with its own _result so concurrent
// Promise.all() queries don't clobber each other.

let _fromQueue = [];
let lastUpdateData = null;

function makeChain(result) {
  const chain = {
    select:  jest.fn().mockReturnThis(),
    eq:      jest.fn().mockReturnThis(),
    in:      jest.fn().mockReturnThis(),
    is:      jest.fn().mockReturnThis(),
    update:  jest.fn((data) => { lastUpdateData = data; return chain; }),
    _result: result,
    then(resolve, reject) {
      return Promise.resolve(this._result).then(resolve, reject);
    },
  };
  return chain;
}

const mockSupabase = {
  from: jest.fn((table) => {
    const idx = _fromQueue.findIndex(q => q.table === table);
    let result;
    if (idx !== -1) {
      result = _fromQueue[idx].response;
      _fromQueue.splice(idx, 1);
    } else {
      result = { data: [], error: null };
    }
    return makeChain(result);
  }),
};

jest.mock('../../db/supabase', () => mockSupabase);

// ─── Module under test ────────────────────────────────────────────────────────

const { compute } = require('../SessionQualityService');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function queue(table, data, error = null) {
  _fromQueue.push({ table, response: { data, error } });
}

/**
 * Queue the exact sequence of from() calls made by compute():
 *
 *  1. from('hands')        — sub-select arg to .in() (evaluated first, result ignored)
 *  2. from('hand_players') — outer query returning [{hand_id}] OR null → triggers fallback
 *
 *  If hand_players returns null, fallback runs:
 *  2b. from('hands')       — fallback: all hands in session
 *  2c. from('hand_players') — fallback: filter by player
 *
 *  3. from('hand_tags')    — player-specific tags (Promise.all branch 1)
 *  4. from('hand_tags')    — hand-level tags     (Promise.all branch 2)
 *  5. from('hand_actions') — bet/action data
 *  6. from('session_player_stats') — update call in _store()
 */
function queueHappyPath({
  handIds     = ['h1', 'h2', 'h3'],
  playerTags  = [],
  handTags    = [],
  actions     = [],
} = {}) {
  const hpRows = handIds.map(id => ({ hand_id: id }));
  queue('hands',               []);        // sub-select (result ignored)
  queue('hand_players',        hpRows);    // primary path returns data
  queue('hand_tags',           playerTags);
  queue('hand_tags',           handTags);
  queue('hand_actions',        actions);
  queue('session_player_stats', null);     // update: { data: null, error: null }
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  _fromQueue = [];
  lastUpdateData = null;
});

// ─── Input validation ─────────────────────────────────────────────────────────

describe('input validation', () => {
  test('throws when playerId is missing', async () => {
    await expect(compute(null, 'sess-1')).rejects.toThrow('playerId is required');
  });

  test('throws when sessionId is missing', async () => {
    await expect(compute('player-uuid', null)).rejects.toThrow('sessionId is required');
  });
});

// ─── Empty session ────────────────────────────────────────────────────────────

describe('empty session', () => {
  test('returns score=0 when player has no hands in session (fallback path)', async () => {
    queue('hands',               []);   // sub-select
    queue('hand_players',        null); // null → triggers fallback
    queue('hands',               []);   // fallback: no hands in session
    queue('session_player_stats', null);

    const { score } = await compute('player-uuid', 'sess-1');
    expect(score).toBe(0);
  });
});

// ─── Mistake tags ─────────────────────────────────────────────────────────────

describe('mistake tags', () => {
  test('no mistakes → mistake_rate = 0, base component = 30', async () => {
    queueHappyPath({ playerTags: [], handTags: [] });
    const { breakdown } = await compute('player-uuid', 'sess-1');
    expect(breakdown.mistake_rate).toBe(0);
  });

  test('one mistake per hand → mistake_rate = 1/3', async () => {
    queueHappyPath({ playerTags: [{ tag: 'OPEN_LIMP' }] });
    const { breakdown } = await compute('player-uuid', 'sess-1'); // 3 hands
    expect(breakdown.mistake_rate).toBeCloseTo(1 / 3, 2);
  });

  test('clamped to 1.0 when more mistakes than hands', async () => {
    queueHappyPath({
      playerTags: [
        { tag: 'OPEN_LIMP' }, { tag: 'OVERLIMP' }, { tag: 'COLD_CALL_3BET' },
        { tag: 'EQUITY_FOLD' }, { tag: 'MIN_RAISE' }, { tag: 'FOLD_TO_PROBE' },
      ],
    });
    const { breakdown } = await compute('player-uuid', 'sess-1');
    expect(breakdown.mistake_rate).toBe(1);
  });

  test('all known mistake tags are counted', async () => {
    const tags = ['OPEN_LIMP', 'OVERLIMP', 'COLD_CALL_3BET', 'EQUITY_FOLD', 'MIN_RAISE', 'FOLD_TO_PROBE'];
    queueHappyPath({ playerTags: tags.map(tag => ({ tag })) });
    const { breakdown } = await compute('player-uuid', 'sess-1');
    expect(breakdown.mistake_rate).toBe(1);
  });
});

// ─── Good play tags ───────────────────────────────────────────────────────────

describe('good play tags', () => {
  test('one good play → good_play_rate = 1/3 for 3 hands', async () => {
    queueHappyPath({ playerTags: [{ tag: 'HERO_CALL' }] });
    const { breakdown } = await compute('player-uuid', 'sess-1');
    expect(breakdown.good_play_rate).toBeCloseTo(1 / 3, 2);
  });

  test('all good play tags are recognised', async () => {
    const tags = ['HERO_CALL', 'THIN_VALUE_RAISE', 'VALUE_BACKED', 'EQUITY_BLUFF'];
    queueHappyPath({ playerTags: tags.map(tag => ({ tag })) });
    const { breakdown } = await compute('player-uuid', 'sess-1');
    expect(breakdown.good_play_rate).toBeGreaterThan(0);
  });

  test('good play tags from hand-level (null player_id) are also counted', async () => {
    queueHappyPath({ handTags: [{ tag: 'HERO_CALL' }, { tag: 'VALUE_BACKED' }] });
    const { breakdown } = await compute('player-uuid', 'sess-1');
    expect(breakdown.good_play_rate).toBeGreaterThan(0);
  });
});

// ─── Sizing accuracy ─────────────────────────────────────────────────────────

describe('sizing accuracy', () => {
  test('all bets within standard range → sizing_accuracy = 1', async () => {
    queueHappyPath({
      actions: [
        { hand_id: 'h1', street: 'flop',  action: 'bet', amount: 40,  pot_at_action: 80  }, // 0.5x ✓
        { hand_id: 'h2', street: 'turn',  action: 'bet', amount: 60,  pot_at_action: 100 }, // 0.6x ✓
        { hand_id: 'h3', street: 'river', action: 'bet', amount: 50,  pot_at_action: 80  }, // 0.625x ✓
      ],
    });
    const { breakdown } = await compute('player-uuid', 'sess-1');
    expect(breakdown.sizing_accuracy).toBe(1);
  });

  test('all bets outside standard range → sizing_accuracy = 0', async () => {
    queueHappyPath({
      actions: [
        { hand_id: 'h1', street: 'flop', action: 'bet', amount: 500, pot_at_action: 80 }, // 6.25x ✗
        { hand_id: 'h2', street: 'flop', action: 'bet', amount: 5,   pot_at_action: 80 }, // 0.06x ✗
      ],
    });
    const { breakdown } = await compute('player-uuid', 'sess-1');
    expect(breakdown.sizing_accuracy).toBe(0);
  });

  test('defaults to 0.5 when no bet/raise actions exist', async () => {
    queueHappyPath({
      actions: [
        { hand_id: 'h1', street: 'preflop', action: 'fold', amount: 0, pot_at_action: 10 },
      ],
    });
    const { breakdown } = await compute('player-uuid', 'sess-1');
    expect(breakdown.sizing_accuracy).toBe(0.5);
  });

  test('skips actions with no pot_at_action data', async () => {
    queueHappyPath({
      actions: [
        { hand_id: 'h1', street: 'flop', action: 'bet', amount: 50, pot_at_action: null },
      ],
    });
    const { breakdown } = await compute('player-uuid', 'sess-1');
    expect(breakdown.sizing_accuracy).toBe(0.5);
  });

  test('preflop bets are skipped (no SIZING_RANGES entry)', async () => {
    queueHappyPath({
      actions: [
        { hand_id: 'h1', street: 'preflop', action: 'raise', amount: 30, pot_at_action: 15 },
      ],
    });
    const { breakdown } = await compute('player-uuid', 'sess-1');
    expect(breakdown.sizing_accuracy).toBe(0.5);
  });
});

// ─── Composite score ─────────────────────────────────────────────────────────

describe('composite score', () => {
  test('baseline score (no mistakes, no good plays, no sizing data) = 55', async () => {
    // (1-0)*30 + 0*20 + 0.5*25 + 0.5*25 = 55
    queueHappyPath();
    const { score } = await compute('player-uuid', 'sess-1');
    expect(score).toBe(55);
  });

  test('score is always in 0-100 range', async () => {
    queueHappyPath();
    const { score } = await compute('player-uuid', 'sess-1');
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  test('score is an integer', async () => {
    queueHappyPath();
    const { score } = await compute('player-uuid', 'sess-1');
    expect(Number.isInteger(score)).toBe(true);
  });

  test('all good plays + perfect sizing → score ≥ 80', async () => {
    const handIds = Array(10).fill(null).map((_, i) => `h${i}`);
    const goodTags = handIds.map(() => ({ tag: 'THIN_VALUE_RAISE' }));
    const perfectBets = handIds.map(id => ({
      hand_id: id, street: 'flop', action: 'bet', amount: 40, pot_at_action: 80,
    }));

    queue('hands',               []);
    queue('hand_players',        handIds.map(id => ({ hand_id: id })));
    queue('hand_tags',           goodTags);
    queue('hand_tags',           []);
    queue('hand_actions',        perfectBets);
    queue('session_player_stats', null);

    const { score } = await compute('player-uuid', 'sess-1');
    // (1-0)*30 + 1*20 + 1*25 + 0.5*25 = 87.5 → 88
    expect(score).toBeGreaterThanOrEqual(80);
  });
});

// ─── Storage ──────────────────────────────────────────────────────────────────

describe('storage', () => {
  test('stores quality_score and quality_breakdown in session_player_stats', async () => {
    queueHappyPath();
    await compute('player-uuid', 'sess-1');
    expect(lastUpdateData).toMatchObject({
      quality_score:     expect.any(Number),
      quality_breakdown: expect.any(Object),
    });
  });

  test('breakdown includes hands_counted', async () => {
    queueHappyPath();
    const { breakdown } = await compute('player-uuid', 'sess-1');
    expect(breakdown).toHaveProperty('hands_counted', 3);
  });

  test('throws when update returns error', async () => {
    // Queue happy path but with update error
    queue('hands',               []);
    queue('hand_players',        [{ hand_id: 'h1' }]);
    queue('hand_tags',           []);
    queue('hand_tags',           []);
    queue('hand_actions',        []);
    queue('session_player_stats', null); // _result = { data: null, error: null }
    // Override to return error: we need the update chain to resolve with error
    // We'll do this by queuing with an error response
    _fromQueue[_fromQueue.length - 1].response = { data: null, error: { message: 'update failed' } };

    await expect(compute('player-uuid', 'sess-1')).rejects.toThrow('update failed');
  });
});

// ─── DB error handling ────────────────────────────────────────────────────────

describe('error handling', () => {
  test('throws when fallback hands query fails', async () => {
    queue('hands',        []);   // sub-select
    queue('hand_players', null); // null → triggers fallback
    queue('hands',        null, { message: 'DB timeout' }); // fallback fails

    await expect(compute('player-uuid', 'sess-1')).rejects.toThrow('DB timeout');
  });
});
