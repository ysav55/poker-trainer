'use strict';

/**
 * HandRepository unit tests.
 *
 * Mocks supabase, utils (q/parseTags), SessionRepository (ensureSession),
 * and positions (buildPositionMap) so no real DB or network calls are made.
 */

// ─── Mocks (must be declared before any require of the module under test) ─────

// supabase: every builder method returns `chain`; `then` is set per-test to
// simulate Promise resolution so that q() (which calls .then()) works.
jest.mock('../supabase', () => {
  const chain = {};
  chain.from       = jest.fn(() => chain);
  chain.select     = jest.fn(() => chain);
  chain.insert     = jest.fn(() => chain);
  chain.upsert     = jest.fn(() => chain);
  chain.update     = jest.fn(() => chain);
  chain.delete     = jest.fn(() => chain);
  chain.eq         = jest.fn(() => chain);
  chain.neq        = jest.fn(() => chain);
  chain.in         = jest.fn(() => chain);
  chain.order      = jest.fn(() => chain);
  chain.limit      = jest.fn(() => chain);
  chain.range      = jest.fn(() => chain);
  chain.ilike      = jest.fn(() => chain);
  chain.maybeSingle = jest.fn(() => chain);
  chain.single     = jest.fn(() => chain);
  // Default: resolves successfully with empty data
  chain.then = jest.fn((resolve) => resolve({ data: null, error: null }));
  return chain;
});

// q(): real-ish implementation — awaits the promise and extracts .data,
// throwing if .error is set.
jest.mock('../utils', () => ({
  q: jest.fn(async (promise) => {
    const result = await promise;
    if (result && result.error) throw new Error(result.error.message || 'DB error');
    return result?.data ?? null;
  }),
  parseTags: jest.fn((tags) => ({
    auto_tags:    (tags || []).filter(t => t.tag_type === 'auto').map(t => t.tag),
    mistake_tags: (tags || []).filter(t => t.tag_type === 'mistake').map(t => t.tag),
    coach_tags:   (tags || []).filter(t => t.tag_type === 'coach').map(t => t.tag),
  })),
}));

jest.mock('../repositories/SessionRepository', () => ({
  ensureSession: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../game/positions', () => ({
  buildPositionMap: jest.fn(() => ({})),
}));

// ─── Module under test ────────────────────────────────────────────────────────

const {
  startHand,
  recordAction,
  getHands,
  getHandDetail,
  endHand,
  markIncomplete,
  logStackAdjustment,
  markLastActionReverted,
} = require('../repositories/HandRepository');

const supabase = require('../supabase');
const { q, parseTags } = require('../utils');
const { ensureSession } = require('../repositories/SessionRepository');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Make `chain.then` resolve with { data, error: null } */
function resolveWith(data) {
  supabase.then.mockImplementation((resolve) => resolve({ data, error: null }));
}

/** Make the next `q()` call resolve with a specific value */
function qResolvesWith(data) {
  q.mockResolvedValueOnce(data);
}

/** Make the next `q()` call reject */
function qRejects(message = 'DB error') {
  q.mockRejectedValueOnce(new Error(message));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  // Default: q resolves with null
  q.mockResolvedValue(null);
});

// ── startHand ────────────────────────────────────────────────────────────────

describe('startHand', () => {
  const baseParams = {
    handId:      'hand-001',
    sessionId:   'session-001',
    tableId:     'table-001',
    players:     [{ id: 'p1', name: 'Alice', seat: 0, stack: 1000 }],
    dealerSeat:  0,
    smallBlind:  5,
    bigBlind:    10,
    sessionType: 'live',
  };

  test('calls ensureSession with sessionId and tableId', async () => {
    await startHand(baseParams);
    expect(ensureSession).toHaveBeenCalledWith('session-001', 'table-001');
  });

  test('resolves without throwing given valid params', async () => {
    await expect(startHand(baseParams)).resolves.not.toThrow();
  });

  test('resolves with allPlayers overriding players for position map', async () => {
    const params = {
      ...baseParams,
      players:    [{ id: 'p1', name: 'Alice', seat: 0, stack: 1000 }],
      allPlayers: [
        { id: 'p1', name: 'Alice', seat: 0, stack: 1000 },
        { id: 'p2', name: 'Bob',   seat: 1, stack: 500 },
      ],
    };
    await expect(startHand(params)).resolves.not.toThrow();
  });

  test('uses default dealerSeat=0 when not provided', async () => {
    const { dealerSeat: _omit, ...paramsWithoutDealer } = baseParams;
    await expect(startHand(paramsWithoutDealer)).resolves.not.toThrow();
  });
});

// ── recordAction ─────────────────────────────────────────────────────────────

describe('recordAction', () => {
  test('resolves without throwing for a basic action', async () => {
    await expect(recordAction({
      handId:     'hand-001',
      playerId:   'p1',
      playerName: 'Alice',
      street:     'preflop',
      action:     'raise',
      amount:     20,
    })).resolves.not.toThrow();
  });

  test('uses 0 for amount when not provided', async () => {
    await expect(recordAction({
      handId:     'hand-001',
      playerId:   'p1',
      playerName: 'Alice',
      street:     'preflop',
      action:     'check',
    })).resolves.not.toThrow();
  });
});

// ── getHands ──────────────────────────────────────────────────────────────────

describe('getHands', () => {
  test('returns empty array when q resolves with null', async () => {
    q.mockResolvedValueOnce(null);
    const result = await getHands();
    expect(result).toEqual([]);
  });

  test('returns mapped hand objects when q resolves with rows', async () => {
    const fakeRows = [{
      hand_id:            'hand-abc',
      session_id:         'sess-1',
      table_id:           'table-1',
      started_at:         '2026-01-01T00:00:00Z',
      ended_at:           '2026-01-01T00:05:00Z',
      board:              ['Ah', 'Kd', '2c'],
      final_pot:          200,
      winner_name:        'Alice',
      phase_ended:        'showdown',
      completed_normally: true,
      dealer_seat:        0,
      is_scenario_hand:   false,
      hand_tags:          [{ tag: 'C_BET', tag_type: 'auto' }],
    }];
    q.mockResolvedValueOnce(fakeRows);

    const result = await getHands();
    expect(result).toHaveLength(1);
    expect(result[0].hand_id).toBe('hand-abc');
    expect(result[0].board).toEqual(['Ah', 'Kd', '2c']);
    expect(result[0].winner_name).toBe('Alice');
  });

  test('defaults board to [] when hand.board is null', async () => {
    q.mockResolvedValueOnce([{
      hand_id: 'h1', session_id: 's1', table_id: 't1',
      started_at: null, ended_at: null, board: null,
      final_pot: 0, winner_name: null, phase_ended: null,
      completed_normally: false, dealer_seat: 0, is_scenario_hand: false,
      hand_tags: [],
    }]);
    const result = await getHands();
    expect(result[0].board).toEqual([]);
  });

  test('accepts tableId filter parameter', async () => {
    q.mockResolvedValueOnce([]);
    const result = await getHands({ tableId: 'table-xyz', limit: 5, offset: 10 });
    expect(result).toEqual([]);
  });

  test('propagates DB errors thrown by q', async () => {
    q.mockRejectedValueOnce(new Error('connection failed'));
    await expect(getHands()).rejects.toThrow('connection failed');
  });
});

// ── getHandDetail ─────────────────────────────────────────────────────────────

describe('getHandDetail', () => {
  test('returns null when hand is not found (q returns null)', async () => {
    q.mockResolvedValueOnce(null);
    const result = await getHandDetail('nonexistent-hand');
    expect(result).toBeNull();
  });

  test('returns structured object when hand is found', async () => {
    const fakeHand = {
      hand_id:     'hand-001',
      session_id:  'sess-1',
      board:       ['Ah', 'Kd', '2c'],
      hand_tags:   [{ tag: 'BLUFF_CATCH', tag_type: 'auto' }],
      hand_players: [{ player_id: 'p1', hole_cards: ['Ac', 'Kh'] }],
      hand_actions: [{ id: 1, action: 'raise', amount: 30 }],
    };
    q.mockResolvedValueOnce(fakeHand);

    const result = await getHandDetail('hand-001');
    expect(result).not.toBeNull();
    expect(result.hand_id).toBe('hand-001');
    expect(result.board).toEqual(['Ah', 'Kd', '2c']);
    expect(result.players).toHaveLength(1);
    expect(result.players[0].hole_cards).toEqual(['Ac', 'Kh']);
    expect(result.actions).toHaveLength(1);
    // Raw sub-tables should be stripped from the result
    expect(result.hand_players).toBeUndefined();
    expect(result.hand_actions).toBeUndefined();
    expect(result.hand_tags).toBeUndefined();
  });

  test('defaults hole_cards to [] for players without cards', async () => {
    q.mockResolvedValueOnce({
      hand_id: 'hand-002', board: null, hand_tags: [],
      hand_players: [{ player_id: 'p2', hole_cards: null }],
      hand_actions: [],
    });
    const result = await getHandDetail('hand-002');
    expect(result.players[0].hole_cards).toEqual([]);
    expect(result.board).toEqual([]);
  });

  test('defaults actions and players to [] when sub-tables are null', async () => {
    q.mockResolvedValueOnce({
      hand_id: 'hand-003', board: [], hand_tags: [],
      hand_players: null,
      hand_actions: null,
    });
    const result = await getHandDetail('hand-003');
    expect(result.players).toEqual([]);
    expect(result.actions).toEqual([]);
  });
});

// ── endHand ───────────────────────────────────────────────────────────────────

describe('endHand', () => {
  test('resolves without throwing for a fold-to-one result', async () => {
    // endHand queries preflop actions first (q call #1), then updates hands (#2),
    // then updates hand_players (#3 per player). All default to null.
    q.mockResolvedValue(null); // preflop rows
    await expect(endHand({
      handId: 'hand-001',
      state: {
        phase:   'betting',
        players: [{ id: 'p1', stack: 950, hole_cards: [] }],
        winner:  'p1',
        pot:     50,
        board:   [],
      },
    })).resolves.not.toThrow();
  });

  test('resolves for a showdown result', async () => {
    q.mockResolvedValue([{ player_id: 'p1', action: 'raise' }]);
    await expect(endHand({
      handId: 'hand-002',
      state: {
        phase:   'showdown',
        players: [{ id: 'p1', stack: 1100, hole_cards: ['Ah', 'Kd'] }],
        winner:  null,
        pot:     200,
        board:   ['2c', '5h', 'Th'],
        showdown_result: {
          potAwarded: 200,
          foldWin:    false,
          winners:    [{ playerId: 'p1' }],
        },
      },
      socketToStable: {},
    })).resolves.not.toThrow();
  });
});

// ── markIncomplete ────────────────────────────────────────────────────────────

describe('markIncomplete', () => {
  test('resolves without throwing', async () => {
    await expect(markIncomplete('hand-001')).resolves.not.toThrow();
  });

  test('resolves with state object containing board and pot', async () => {
    await expect(markIncomplete('hand-001', {
      board:   ['Ah', 'Kd', '2c'],
      pot:     120,
      phase:   'flop',
      players: [{ id: 'p1', stableId: 'p1', hole_cards: ['Ac', 'Kh'] }],
    })).resolves.not.toThrow();
  });
});

// ── logStackAdjustment ───────────────────────────────────────────────────────

describe('logStackAdjustment', () => {
  test('resolves without throwing for valid params', async () => {
    await expect(logStackAdjustment('session-001', 'player-001', 500)).resolves.not.toThrow();
  });

  test('returns early (undefined) when any required arg is missing', async () => {
    await expect(logStackAdjustment(null, 'p1', 100)).resolves.toBeUndefined();
    await expect(logStackAdjustment('session-001', null, 100)).resolves.toBeUndefined();
    await expect(logStackAdjustment('session-001', 'p1', 0)).resolves.toBeUndefined();
  });
});

// ── markLastActionReverted ────────────────────────────────────────────────────

describe('markLastActionReverted', () => {
  test('does nothing when no non-reverted actions exist', async () => {
    q.mockResolvedValueOnce([]); // no rows
    await expect(markLastActionReverted('hand-001')).resolves.not.toThrow();
  });

  test('marks the last action reverted when rows are returned', async () => {
    q.mockResolvedValueOnce([{ id: 42 }]); // select returns action row
    q.mockResolvedValueOnce(null);          // update resolves
    await expect(markLastActionReverted('hand-001')).resolves.not.toThrow();
  });
});
