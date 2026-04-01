'use strict';

/**
 * AnalyzerService unit tests.
 *
 * Tests buildAnalyzerContext and analyzeAndTagHand in isolation by mocking all
 * DB dependencies (supabase, utils, TagRepository) and the analyzer registry.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mock supabase (used by logger and AnalyzerService both — same resolved module)
jest.mock('../../db/supabase', () => {
  const chain = {};
  chain.from        = jest.fn(() => chain);
  chain.select      = jest.fn(() => chain);
  chain.insert      = jest.fn(() => chain);
  chain.eq          = jest.fn(() => chain);
  chain.in          = jest.fn(() => chain);
  chain.order       = jest.fn(() => chain);
  chain.maybeSingle = jest.fn(() => chain);
  // Default: resolves with null (used by logger._persistAsync fire-and-forget)
  chain.then        = jest.fn((resolve) => resolve({ data: null, error: null }));
  return chain;
});

// q is the main DB gateway; we control its return values per test
jest.mock('../../db/utils', () => ({
  q: jest.fn(),
}));

jest.mock('../../db/repositories/TagRepository', () => ({
  replaceAutoTags: jest.fn().mockResolvedValue(undefined),
}));

// Real positions module — keep the actual buildPositionMap logic
jest.mock('../positions', () => ({
  buildPositionMap: jest.fn(() => ({ 'p1': 'BTN', 'p2': 'BB' })),
}));

// HandEvaluator — return a controlled result
jest.mock('../HandEvaluator', () => ({
  evaluate: jest.fn(() => ({ rank: 1, rankName: 'ONE_PAIR', bestFive: [] })),
}));

// Minimal analyzer registry — two stubs so analyzeAndTagHand exercises the loop
jest.mock('../tagAnalyzers/index', () => ({
  ANALYZER_REGISTRY: [
    {
      name:    'StubAnalyzer1',
      analyze: jest.fn(() => [{ tag: 'STUB_TAG', tag_type: 'auto' }]),
    },
    {
      name:    'StubAnalyzer2',
      analyze: jest.fn(() => []),
    },
  ],
}));

// Silence logger stdout during tests — mock just enough to not throw
jest.mock('../../logs/logger', () => ({
  error: jest.fn(),
  warn:  jest.fn(),
  info:  jest.fn(),
  debug: jest.fn(),
}));

// ─── Module under test ────────────────────────────────────────────────────────

const { buildAnalyzerContext, analyzeAndTagHand } = require('../AnalyzerService');
const { q }                = require('../../db/utils');
const { replaceAutoTags }  = require('../../db/repositories/TagRepository');
const { ANALYZER_REGISTRY } = require('../tagAnalyzers/index');
const { evaluate: evaluateHand } = require('../HandEvaluator');

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const HAND_ID = 'hand-test-001';

/** A minimal valid hand row */
const FAKE_HAND = {
  hand_id:     HAND_ID,
  session_id:  'sess-1',
  table_id:    'table-1',
  board:       ['Ah', 'Kd', '2c', '7h', 'Qh'],
  dealer_seat: 0,
};

/** A minimal valid action */
function makeAction(overrides = {}) {
  return {
    id:            1,
    hand_id:       HAND_ID,
    player_id:     'p1',
    player_name:   'Alice',
    street:        'preflop',
    action:        'raise',
    amount:        20,
    pot_at_action: 10,
    is_reverted:   false,
    ...overrides,
  };
}

/** A minimal valid hand_players row */
function makePlayer(overrides = {}) {
  return {
    player_id:  'p1',
    player_name: 'Alice',
    seat:        0,
    hole_cards:  ['Ac', 'Kh'],
    ...overrides,
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  // Default: all three parallel q() calls succeed with reasonable data
  q.mockResolvedValue(null);
  replaceAutoTags.mockResolvedValue(undefined);
});

// ─── buildAnalyzerContext ─────────────────────────────────────────────────────

describe('buildAnalyzerContext', () => {

  test('returns null when hand row is missing (q returns null for hands)', async () => {
    // Three concurrent q() calls: hand, allActions, handPlayers
    q.mockResolvedValueOnce(null)  // hand → null (not found)
     .mockResolvedValueOnce([])    // allActions
     .mockResolvedValueOnce([]);   // handPlayers

    const ctx = await buildAnalyzerContext(HAND_ID);
    expect(ctx).toBeNull();
  });

  test('returns a context object when all queries succeed', async () => {
    q.mockResolvedValueOnce(FAKE_HAND)
     .mockResolvedValueOnce([makeAction()])
     .mockResolvedValueOnce([makePlayer()]);

    const ctx = await buildAnalyzerContext(HAND_ID);
    expect(ctx).not.toBeNull();
    expect(ctx.hand).toEqual(FAKE_HAND);
    expect(ctx.allActions).toHaveLength(1);
    expect(ctx.seated).toHaveLength(1);
  });

  test('groups actions by street in byStreet', async () => {
    const actions = [
      makeAction({ id: 1, street: 'preflop', is_reverted: false }),
      makeAction({ id: 2, street: 'preflop', is_reverted: false, action: 'call', amount: 20 }),
      makeAction({ id: 3, street: 'flop',    is_reverted: false, action: 'check', amount: 0 }),
    ];

    q.mockResolvedValueOnce(FAKE_HAND)
     .mockResolvedValueOnce(actions)
     .mockResolvedValueOnce([makePlayer()]);

    const ctx = await buildAnalyzerContext(HAND_ID);
    expect(ctx.byStreet.preflop).toHaveLength(2);
    expect(ctx.byStreet.flop).toHaveLength(1);
    expect(ctx.byStreet.turn).toBeUndefined();
  });

  test('attaches correct sizingRatio when amount and pot_at_action are positive', async () => {
    const action = makeAction({ amount: 50, pot_at_action: 100 });
    q.mockResolvedValueOnce(FAKE_HAND)
     .mockResolvedValueOnce([action])
     .mockResolvedValueOnce([makePlayer()]);

    const ctx = await buildAnalyzerContext(HAND_ID);
    expect(ctx.actions[0].sizingRatio).toBeCloseTo(0.5);
  });

  test('attaches null sizingRatio when pot_at_action is 0', async () => {
    const action = makeAction({ amount: 20, pot_at_action: 0 });
    q.mockResolvedValueOnce(FAKE_HAND)
     .mockResolvedValueOnce([action])
     .mockResolvedValueOnce([makePlayer()]);

    const ctx = await buildAnalyzerContext(HAND_ID);
    expect(ctx.actions[0].sizingRatio).toBeNull();
  });

  test('attaches null sizingRatio when amount is 0', async () => {
    const action = makeAction({ amount: 0, pot_at_action: 100 });
    q.mockResolvedValueOnce(FAKE_HAND)
     .mockResolvedValueOnce([action])
     .mockResolvedValueOnce([makePlayer()]);

    const ctx = await buildAnalyzerContext(HAND_ID);
    expect(ctx.actions[0].sizingRatio).toBeNull();
  });

  test('filters reverted actions from ctx.actions but keeps them in ctx.allActions', async () => {
    const actions = [
      makeAction({ id: 1, is_reverted: false }),
      makeAction({ id: 2, is_reverted: true, action: 'fold' }),
    ];
    q.mockResolvedValueOnce(FAKE_HAND)
     .mockResolvedValueOnce(actions)
     .mockResolvedValueOnce([makePlayer()]);

    const ctx = await buildAnalyzerContext(HAND_ID);
    expect(ctx.allActions).toHaveLength(2); // includes reverted
    expect(ctx.actions).toHaveLength(1);    // excludes reverted
  });

  test('excludes players with seat < 0 from seated', async () => {
    const players = [
      makePlayer({ player_id: 'p1', seat: 0 }),
      makePlayer({ player_id: 'p2', seat: -1 }), // observer / coach without seat
    ];
    q.mockResolvedValueOnce(FAKE_HAND)
     .mockResolvedValueOnce([makeAction()])
     .mockResolvedValueOnce(players);

    const ctx = await buildAnalyzerContext(HAND_ID);
    expect(ctx.seated).toHaveLength(1);
    expect(ctx.seated[0].player_id).toBe('p1');
  });

  // ── evaluateAt ────────────────────────────────────────────────────────────

  describe('evaluateAt helper', () => {
    test('returns null for player without hole cards', async () => {
      const playerNoCards = makePlayer({ player_id: 'p2', hole_cards: [] });
      q.mockResolvedValueOnce(FAKE_HAND)
       .mockResolvedValueOnce([makeAction()])
       .mockResolvedValueOnce([playerNoCards]);

      const ctx = await buildAnalyzerContext(HAND_ID);
      const result = ctx.evaluateAt('p2', 'flop');
      expect(result).toBeNull();
    });

    test('returns null for player with only one hole card', async () => {
      const playerOneCard = makePlayer({ player_id: 'p3', hole_cards: ['Ah'] });
      q.mockResolvedValueOnce(FAKE_HAND)
       .mockResolvedValueOnce([makeAction()])
       .mockResolvedValueOnce([playerOneCard]);

      const ctx = await buildAnalyzerContext(HAND_ID);
      const result = ctx.evaluateAt('p3', 'flop');
      expect(result).toBeNull();
    });

    test('returns null for preflop (board length < 3 required)', async () => {
      q.mockResolvedValueOnce(FAKE_HAND)
       .mockResolvedValueOnce([makeAction()])
       .mockResolvedValueOnce([makePlayer()]);

      const ctx = await buildAnalyzerContext(HAND_ID);
      const result = ctx.evaluateAt('p1', 'preflop');
      expect(result).toBeNull();
      expect(evaluateHand).not.toHaveBeenCalledWith(expect.anything(), expect.anything());
    });

    test('returns HandResult for flop when board has 3+ cards and player has 2 hole cards', async () => {
      const handWithBoard = { ...FAKE_HAND, board: ['Ah', 'Kd', '2c', '7h', 'Qh'] };
      q.mockResolvedValueOnce(handWithBoard)
       .mockResolvedValueOnce([makeAction()])
       .mockResolvedValueOnce([makePlayer()]);

      const ctx = await buildAnalyzerContext(HAND_ID);
      const result = ctx.evaluateAt('p1', 'flop');
      expect(result).not.toBeNull();
      expect(result.rank).toBe(1);
      expect(result.rankName).toBe('ONE_PAIR');
    });

    test('memoizes evaluateAt — same call twice does not double-invoke HandEvaluator', async () => {
      q.mockResolvedValueOnce(FAKE_HAND)
       .mockResolvedValueOnce([makeAction()])
       .mockResolvedValueOnce([makePlayer()]);

      const ctx = await buildAnalyzerContext(HAND_ID);
      ctx.evaluateAt('p1', 'flop');
      ctx.evaluateAt('p1', 'flop');
      expect(evaluateHand).toHaveBeenCalledTimes(1);
    });

    test('returns null for unknown player id', async () => {
      q.mockResolvedValueOnce(FAKE_HAND)
       .mockResolvedValueOnce([makeAction()])
       .mockResolvedValueOnce([makePlayer()]);

      const ctx = await buildAnalyzerContext(HAND_ID);
      const result = ctx.evaluateAt('nonexistent-player', 'flop');
      expect(result).toBeNull();
    });
  });

  // ── bbPlayerId derivation ─────────────────────────────────────────────────

  describe('bbPlayerId', () => {
    test('is null when fewer than 2 seated players', async () => {
      q.mockResolvedValueOnce({ ...FAKE_HAND, dealer_seat: 0 })
       .mockResolvedValueOnce([])
       .mockResolvedValueOnce([makePlayer()]);

      const ctx = await buildAnalyzerContext(HAND_ID);
      expect(ctx.bbPlayerId).toBeNull();
    });

    test('is null when dealer_seat is -1 and no matching seat found', async () => {
      const hand = { ...FAKE_HAND, dealer_seat: -1 };
      q.mockResolvedValueOnce(hand)
       .mockResolvedValueOnce([])
       .mockResolvedValueOnce([
         makePlayer({ player_id: 'p1', seat: 0 }),
         makePlayer({ player_id: 'p2', seat: 1 }),
       ]);

      const ctx = await buildAnalyzerContext(HAND_ID);
      expect(ctx.bbPlayerId).toBeNull();
    });
  });
});

// ─── analyzeAndTagHand ────────────────────────────────────────────────────────

describe('analyzeAndTagHand', () => {

  test('returns undefined when buildAnalyzerContext returns null (hand not found)', async () => {
    q.mockResolvedValueOnce(null) // hand
     .mockResolvedValueOnce([])  // allActions
     .mockResolvedValueOnce([]); // handPlayers

    const result = await analyzeAndTagHand(HAND_ID);
    expect(result).toBeUndefined();
  });

  test('returns empty array when there are no actions (walk hand)', async () => {
    q.mockResolvedValueOnce(FAKE_HAND)
     .mockResolvedValueOnce([])   // no actions
     .mockResolvedValueOnce([]);  // no players

    const result = await analyzeAndTagHand(HAND_ID);
    expect(result).toEqual([]);
    expect(replaceAutoTags).not.toHaveBeenCalled();
  });

  test('runs all analyzers and calls replaceAutoTags with valid tag rows', async () => {
    q.mockResolvedValueOnce(FAKE_HAND)
     .mockResolvedValueOnce([makeAction()])
     .mockResolvedValueOnce([makePlayer()]);

    const result = await analyzeAndTagHand(HAND_ID);

    // StubAnalyzer1 returns one STUB_TAG tag
    expect(result).not.toBeUndefined();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);

    const tags = result.map(r => r.tag);
    expect(tags).toContain('STUB_TAG');

    expect(replaceAutoTags).toHaveBeenCalledTimes(1);
    expect(replaceAutoTags).toHaveBeenCalledWith(HAND_ID, expect.any(Array));
  });

  test('deduplicates hand-level tags with the same tag+tag_type', async () => {
    // Make both analyzers return the same hand-level tag
    ANALYZER_REGISTRY[0].analyze.mockReturnValueOnce([
      { tag: 'DUP_TAG', tag_type: 'auto' },
    ]);
    ANALYZER_REGISTRY[1].analyze.mockReturnValueOnce([
      { tag: 'DUP_TAG', tag_type: 'auto' },
    ]);

    q.mockResolvedValueOnce(FAKE_HAND)
     .mockResolvedValueOnce([makeAction()])
     .mockResolvedValueOnce([makePlayer()]);

    const result = await analyzeAndTagHand(HAND_ID);
    const dupTags = result.filter(r => r.tag === 'DUP_TAG');
    expect(dupTags).toHaveLength(1);
  });

  test('skips malformed analyzer results (missing tag or tag_type)', async () => {
    ANALYZER_REGISTRY[0].analyze.mockReturnValueOnce([
      null,                           // null result
      { tag_type: 'auto' },           // missing tag
      { tag: 'VALID', tag_type: 'auto' },
    ]);
    ANALYZER_REGISTRY[1].analyze.mockReturnValueOnce([]);

    q.mockResolvedValueOnce(FAKE_HAND)
     .mockResolvedValueOnce([makeAction()])
     .mockResolvedValueOnce([makePlayer()]);

    const result = await analyzeAndTagHand(HAND_ID);
    expect(result.every(r => typeof r.tag === 'string' && r.tag_type)).toBe(true);
    const validTags = result.filter(r => r.tag === 'VALID');
    expect(validTags).toHaveLength(1);
  });

  test('all output tag rows have hand_id, tag, tag_type fields', async () => {
    ANALYZER_REGISTRY[0].analyze.mockReturnValueOnce([
      { tag: 'TAG_A', tag_type: 'auto' },
      { tag: 'TAG_B', tag_type: 'mistake', player_id: 'p1' },
    ]);
    ANALYZER_REGISTRY[1].analyze.mockReturnValueOnce([]);

    q.mockResolvedValueOnce(FAKE_HAND)
     .mockResolvedValueOnce([makeAction()])
     .mockResolvedValueOnce([makePlayer()]);

    const result = await analyzeAndTagHand(HAND_ID);
    for (const row of result) {
      expect(row).toHaveProperty('hand_id', HAND_ID);
      expect(row).toHaveProperty('tag');
      expect(row).toHaveProperty('tag_type');
    }
  });

  test('sets player_id and action_id to null when not provided by analyzer', async () => {
    ANALYZER_REGISTRY[0].analyze.mockReturnValueOnce([
      { tag: 'HAND_LEVEL_TAG', tag_type: 'auto' },
    ]);
    ANALYZER_REGISTRY[1].analyze.mockReturnValueOnce([]);

    q.mockResolvedValueOnce(FAKE_HAND)
     .mockResolvedValueOnce([makeAction()])
     .mockResolvedValueOnce([makePlayer()]);

    const result = await analyzeAndTagHand(HAND_ID);
    const tag = result.find(r => r.tag === 'HAND_LEVEL_TAG');
    expect(tag.player_id).toBeNull();
    expect(tag.action_id).toBeNull();
  });

  test('does not deduplicate action-level tags (action_id present)', async () => {
    // Two identical tags but with different action_ids should both survive
    ANALYZER_REGISTRY[0].analyze.mockReturnValueOnce([
      { tag: 'SIZING_TAG', tag_type: 'sizing', action_id: 1 },
      { tag: 'SIZING_TAG', tag_type: 'sizing', action_id: 2 },
    ]);
    ANALYZER_REGISTRY[1].analyze.mockReturnValueOnce([]);

    q.mockResolvedValueOnce(FAKE_HAND)
     .mockResolvedValueOnce([makeAction()])
     .mockResolvedValueOnce([makePlayer()]);

    const result = await analyzeAndTagHand(HAND_ID);
    const sizingTags = result.filter(r => r.tag === 'SIZING_TAG');
    expect(sizingTags).toHaveLength(2);
  });

  test('continues running remaining analyzers when one analyzer throws', async () => {
    ANALYZER_REGISTRY[0].analyze.mockImplementationOnce(() => {
      throw new Error('analyzer crashed');
    });
    ANALYZER_REGISTRY[1].analyze.mockReturnValueOnce([
      { tag: 'FALLBACK_TAG', tag_type: 'auto' },
    ]);

    q.mockResolvedValueOnce(FAKE_HAND)
     .mockResolvedValueOnce([makeAction()])
     .mockResolvedValueOnce([makePlayer()]);

    const result = await analyzeAndTagHand(HAND_ID);
    expect(result).not.toBeUndefined();
    const tags = result.map(r => r.tag);
    expect(tags).toContain('FALLBACK_TAG');
    // replaceAutoTags still called despite one analyzer crashing
    expect(replaceAutoTags).toHaveBeenCalled();
  });

  test('returns undefined and does not call replaceAutoTags when buildAnalyzerContext throws', async () => {
    q.mockRejectedValueOnce(new Error('DB connection lost'));

    const result = await analyzeAndTagHand(HAND_ID);
    expect(result).toBeUndefined();
    expect(replaceAutoTags).not.toHaveBeenCalled();
  });
});
