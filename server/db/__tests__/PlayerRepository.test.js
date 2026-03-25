'use strict';

/**
 * PlayerRepository unit tests.
 *
 * Mocks supabase and utils so no real DB or network calls are made.
 * getPlayerHoverStats is special — it calls supabase directly (not via q)
 * and reads `.data` from the resolved value, so supabase.then must resolve
 * with the correct shape.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../supabase', () => {
  const chain = {};
  chain.from        = jest.fn(() => chain);
  chain.select      = jest.fn(() => chain);
  chain.insert      = jest.fn(() => chain);
  chain.upsert      = jest.fn(() => chain);
  chain.update      = jest.fn(() => chain);
  chain.delete      = jest.fn(() => chain);
  chain.eq          = jest.fn(() => chain);
  chain.neq         = jest.fn(() => chain);
  chain.in          = jest.fn(() => chain);
  chain.order       = jest.fn(() => chain);
  chain.limit       = jest.fn(() => chain);
  chain.range       = jest.fn(() => chain);
  chain.ilike       = jest.fn(() => chain);
  chain.maybeSingle = jest.fn(() => chain);
  chain.single      = jest.fn(() => chain);
  // Default: resolves with null data and no error (used by q() via .then())
  chain.then = jest.fn((resolve) => resolve({ data: null, error: null }));
  return chain;
});

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

// ─── Module under test ────────────────────────────────────────────────────────

const {
  upsertPlayerIdentity,
  getPlayerStats,
  getAllPlayersWithStats,
  getPlayerHoverStats,
  getPlayerHands,
  loginRosterPlayer,
  isRegisteredPlayer,
} = require('../repositories/PlayerRepository');

const supabase = require('../supabase');
const { q } = require('../utils');

// ─── Helpers ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  q.mockResolvedValue(null);
  // Default chain.then: resolves with null data
  supabase.then.mockImplementation((resolve) => resolve({ data: null, error: null }));
});

/** Make supabase.then resolve with { data, error: null } for getPlayerHoverStats */
function supabaseResolvesWith(data) {
  supabase.then.mockImplementationOnce((resolve) => resolve({ data, error: null }));
}

// ─── upsertPlayerIdentity ─────────────────────────────────────────────────────

describe('upsertPlayerIdentity', () => {
  test('resolves without throwing', async () => {
    await expect(upsertPlayerIdentity('uuid-001', 'Alice')).resolves.not.toThrow();
  });
});

// ─── getPlayerStats ───────────────────────────────────────────────────────────

describe('getPlayerStats', () => {
  test('returns null when player not found', async () => {
    q.mockResolvedValueOnce(null);
    const result = await getPlayerStats('unknown-uuid');
    expect(result).toBeNull();
  });

  test('returns stats object when player exists', async () => {
    q.mockResolvedValueOnce({
      player_id:   'uuid-001',
      display_name: 'Alice',
      total_hands:  10,
      total_wins:   4,
      net_chips:    200,
      vpip_count:   7,
      pfr_count:    5,
    });

    const result = await getPlayerStats('uuid-001');
    expect(result).not.toBeNull();
    expect(result.player_id).toBe('uuid-001');
    expect(result.latest_name).toBe('Alice');
    expect(result.total_hands).toBe(10);
    expect(result.total_wins).toBe(4);
    expect(result.total_net_chips).toBe(200);
    expect(result.vpip_percent).toBe(70); // 7/10 * 100
    expect(result.pfr_percent).toBe(50);  // 5/10 * 100
  });

  test('returns 0 for vpip/pfr when total_hands is 0', async () => {
    q.mockResolvedValueOnce({
      player_id:    'uuid-002',
      display_name: 'Bob',
      total_hands:  0,
      total_wins:   0,
      net_chips:    0,
      vpip_count:   0,
      pfr_count:    0,
    });

    const result = await getPlayerStats('uuid-002');
    expect(result.vpip_percent).toBe(0);
    expect(result.pfr_percent).toBe(0);
  });
});

// ─── getAllPlayersWithStats ────────────────────────────────────────────────────

describe('getAllPlayersWithStats', () => {
  test('returns empty array when q resolves with null', async () => {
    q.mockResolvedValueOnce(null);
    const result = await getAllPlayersWithStats();
    expect(result).toEqual([]);
  });

  test('maps leaderboard rows to player stat objects', async () => {
    q.mockResolvedValueOnce([
      {
        player_id:    'uuid-001',
        display_name: 'Alice',
        total_hands:  5,
        total_wins:   2,
        net_chips:    150,
        vpip_count:   3,
        pfr_count:    2,
        last_hand_at: '2026-01-01T00:00:00Z',
      },
      {
        player_id:    'uuid-002',
        display_name: 'Bob',
        total_hands:  0,
        total_wins:   0,
        net_chips:    -50,
        vpip_count:   0,
        pfr_count:    0,
        last_hand_at: null,
      },
    ]);

    const result = await getAllPlayersWithStats();
    expect(result).toHaveLength(2);
    expect(result[0].stableId).toBe('uuid-001');
    expect(result[0].name).toBe('Alice');
    expect(result[0].vpip_percent).toBe(60); // 3/5*100
    expect(result[1].stableId).toBe('uuid-002');
    expect(result[1].vpip_percent).toBe(0);  // 0 hands
  });
});

// ─── getPlayerHoverStats ─────────────────────────────────────────────────────

describe('getPlayerHoverStats', () => {
  test('returns { allTime: null, session: null } when both queries return null', async () => {
    // getPlayerHoverStats does NOT use q(); it awaits supabase chain directly
    // Both parallel supabase calls resolve with { data: null }
    supabase.then
      .mockImplementationOnce((resolve) => resolve({ data: null }))  // leaderboard
      .mockImplementationOnce((resolve) => resolve({ data: null })); // session_player_stats

    const result = await getPlayerHoverStats('uuid-001', 'session-001');
    expect(result).toEqual({ allTime: null, session: null });
  });

  test('returns allTime stats when leaderboard has data', async () => {
    const fakeLeaderboard = { player_id: 'uuid-001', display_name: 'Alice', net_chips: 300 };
    supabase.then
      .mockImplementationOnce((resolve) => resolve({ data: fakeLeaderboard })) // leaderboard
      .mockImplementationOnce((resolve) => resolve({ data: null }));            // session stats

    const result = await getPlayerHoverStats('uuid-001', 'sess-1');
    expect(result.allTime).toEqual(fakeLeaderboard);
    expect(result.session).toBeNull();
  });

  test('returns { allTime: null, session: null } when sessionId is omitted', async () => {
    // Without a sessionId, the second call is Promise.resolve({ data: null })
    // Only one supabase chain call (leaderboard), session is a direct Promise
    supabase.then
      .mockImplementationOnce((resolve) => resolve({ data: null })); // leaderboard

    const result = await getPlayerHoverStats('uuid-001', null);
    expect(result).toEqual({ allTime: null, session: null });
  });
});

// ─── getPlayerHands ───────────────────────────────────────────────────────────

describe('getPlayerHands', () => {
  test('returns empty array when q resolves with null', async () => {
    q.mockResolvedValueOnce(null);
    const result = await getPlayerHands('uuid-001');
    expect(result).toEqual([]);
  });

  test('returns mapped hand objects from hand_players join', async () => {
    q.mockResolvedValueOnce([
      {
        hole_cards:  ['Ac', 'Kh'],
        stack_start: 1000,
        stack_end:   1150,
        is_winner:   true,
        vpip:        true,
        pfr:         true,
        wtsd:        true,
        wsd:         true,
        seat:        0,
        hands: {
          hand_id:     'hand-abc',
          started_at:  '2026-01-01T00:00:00Z',
          ended_at:    '2026-01-01T00:05:00Z',
          final_pot:   300,
          winner_id:   'uuid-001',
          winner_name: 'Alice',
          phase_ended: 'showdown',
          board:       ['Ah', 'Kd', '2c'],
          table_id:    'table-1',
          hand_tags:   [{ tag: 'C_BET', tag_type: 'auto' }],
        },
      },
    ]);

    const result = await getPlayerHands('uuid-001');
    expect(result).toHaveLength(1);
    expect(result[0].hand_id).toBe('hand-abc');
    expect(result[0].hole_cards).toEqual(['Ac', 'Kh']);
    expect(result[0].is_winner).toBe(true);
    expect(result[0].board).toEqual(['Ah', 'Kd', '2c']);
  });

  test('defaults board and hole_cards to [] when null', async () => {
    q.mockResolvedValueOnce([
      {
        hole_cards:  null,
        stack_start: 500,
        stack_end:   null,
        is_winner:   false,
        vpip:        false,
        pfr:         false,
        wtsd:        false,
        wsd:         false,
        seat:        1,
        hands: {
          hand_id: 'hand-xyz', started_at: null, ended_at: null,
          final_pot: 0, winner_id: null, winner_name: null,
          phase_ended: null, board: null, table_id: 'table-1',
          hand_tags: [],
        },
      },
    ]);

    const result = await getPlayerHands('uuid-001');
    expect(result[0].hole_cards).toEqual([]);
    expect(result[0].board).toEqual([]);
  });
});

// ─── loginRosterPlayer ────────────────────────────────────────────────────────

describe('loginRosterPlayer', () => {
  test('returns existing player when found in DB', async () => {
    q.mockResolvedValueOnce({ id: 'uuid-existing', display_name: 'Alice' }); // maybeSingle
    q.mockResolvedValueOnce(null); // update

    const result = await loginRosterPlayer('Alice');
    expect(result.stableId).toBe('uuid-existing');
    expect(result.name).toBe('Alice');
  });

  test('creates new player when not found in DB', async () => {
    q.mockResolvedValueOnce(null); // maybeSingle — not found
    q.mockResolvedValueOnce(null); // insert

    const result = await loginRosterPlayer('NewPlayer');
    expect(result.name).toBe('NewPlayer');
    expect(typeof result.stableId).toBe('string');
    expect(result.stableId.length).toBeGreaterThan(0);
  });

  test('trims whitespace from name', async () => {
    q.mockResolvedValueOnce(null); // not found
    q.mockResolvedValueOnce(null); // insert

    const result = await loginRosterPlayer('  Bob  ');
    expect(result.name).toBe('Bob');
  });
});

// ─── isRegisteredPlayer ───────────────────────────────────────────────────────

describe('isRegisteredPlayer', () => {
  test('returns false when stableId is falsy', async () => {
    expect(await isRegisteredPlayer(null)).toBe(false);
    expect(await isRegisteredPlayer('')).toBe(false);
    expect(await isRegisteredPlayer(undefined)).toBe(false);
  });

  test('returns false when player not found', async () => {
    q.mockResolvedValueOnce(null);
    expect(await isRegisteredPlayer('uuid-001')).toBe(false);
  });

  test('returns false when player exists but is_roster is false', async () => {
    q.mockResolvedValueOnce({ id: 'uuid-001', is_roster: false });
    expect(await isRegisteredPlayer('uuid-001')).toBe(false);
  });

  test('returns true when player exists and is_roster is true', async () => {
    q.mockResolvedValueOnce({ id: 'uuid-001', is_roster: true });
    expect(await isRegisteredPlayer('uuid-001')).toBe(true);
  });
});
