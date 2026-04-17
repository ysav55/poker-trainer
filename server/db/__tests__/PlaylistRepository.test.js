'use strict';

/**
 * PlaylistRepository unit tests.
 *
 * Mocks supabase and utils so no real DB or network calls are made.
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
  chain.then        = jest.fn((resolve) => resolve({ data: null, error: null }));
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
    sizing_tags:  (tags || []).filter(t => t.tag_type === 'sizing').map(t => t.tag),
    coach_tags:   (tags || []).filter(t => t.tag_type === 'coach').map(t => t.tag),
  })),
}));

// ─── Module under test ────────────────────────────────────────────────────────

const {
  createPlaylist,
  getPlaylists,
  getPlaylistHands,
  addHandToPlaylist,
  removeHandFromPlaylist,
  deletePlaylist,
} = require('../repositories/PlaylistRepository');

const { q } = require('../utils');

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  q.mockResolvedValue(null);
});

// ─── createPlaylist ───────────────────────────────────────────────────────────

describe('createPlaylist', () => {
  test('returns a playlist object with generated playlist_id', async () => {
    const result = await createPlaylist({ name: 'My Playlist' });
    expect(result).toHaveProperty('playlist_id');
    expect(typeof result.playlist_id).toBe('string');
    expect(result.playlist_id.length).toBeGreaterThan(0);
    expect(result.name).toBe('My Playlist');
  });

  test('includes description and table_id when provided', async () => {
    const result = await createPlaylist({
      name:        'Session Hands',
      description: 'Key hands from last session',
      tableId:     'table-001',
    });
    expect(result.description).toBe('Key hands from last session');
    expect(result.table_id).toBe('table-001');
  });

  test('defaults description to empty string and table_id to null when not provided', async () => {
    const result = await createPlaylist({ name: 'Untitled' });
    expect(result.description).toBe('');
    expect(result.table_id).toBeNull();
  });

  test('generates a unique UUID for each call', async () => {
    const r1 = await createPlaylist({ name: 'P1' });
    const r2 = await createPlaylist({ name: 'P2' });
    expect(r1.playlist_id).not.toBe(r2.playlist_id);
  });

  test('resolves without throwing even when DB is mocked to return null', async () => {
    await expect(createPlaylist({ name: 'Test' })).resolves.not.toThrow();
  });
});

// ─── getPlaylists ─────────────────────────────────────────────────────────────

describe('getPlaylists', () => {
  test('returns empty array when q resolves with null', async () => {
    q.mockResolvedValueOnce(null);
    const result = await getPlaylists();
    expect(result).toEqual([]);
  });

  test('returns empty array when q resolves with empty array', async () => {
    q.mockResolvedValueOnce([]);
    const result = await getPlaylists();
    expect(result).toEqual([]);
  });

  test('maps playlists with hand_count from playlist_hands[0].count', async () => {
    q.mockResolvedValueOnce([
      {
        playlist_id: 'pl-001',
        name:        'Bluff Spots',
        description: 'Great bluff hands',
        table_id:    'table-1',
        created_at:  '2026-01-01T00:00:00Z',
        playlist_hands: [{ count: 7 }],
      },
      {
        playlist_id: 'pl-002',
        name:        'Value Hands',
        description: null,
        table_id:    null,
        created_at:  '2026-01-02T00:00:00Z',
        playlist_hands: [],
      },
    ]);

    const result = await getPlaylists();
    expect(result).toHaveLength(2);
    expect(result[0].hand_count).toBe(7);
    expect(result[0].name).toBe('Bluff Spots');
    // playlist_hands sub-array should be stripped
    expect(result[0].playlist_hands).toBeUndefined();
    expect(result[1].hand_count).toBe(0); // empty playlist_hands
  });

  test('defaults hand_count to 0 when playlist_hands is null', async () => {
    q.mockResolvedValueOnce([{
      playlist_id: 'pl-003', name: 'Empty', description: null,
      table_id: null, created_at: null, playlist_hands: null,
    }]);
    const result = await getPlaylists();
    expect(result[0].hand_count).toBe(0);
  });

  test('accepts tableId filter without throwing', async () => {
    q.mockResolvedValueOnce([]);
    const result = await getPlaylists({ tableId: 'table-abc' });
    expect(result).toEqual([]);
  });
});

// ─── getPlaylistHands ─────────────────────────────────────────────────────────

describe('getPlaylistHands', () => {
  test('returns empty array when q resolves with null', async () => {
    q.mockResolvedValueOnce(null);
    const result = await getPlaylistHands('pl-001');
    expect(result).toEqual([]);
  });

  test('maps playlist_hands rows to flat hand objects', async () => {
    q.mockResolvedValueOnce([
      {
        playlist_id:   'pl-001',
        hand_id:       'hand-abc',
        display_order: 0,
        hands: {
          board:       ['Ah', 'Kd', '2c'],
          final_pot:   200,
          winner_name: 'Alice',
          phase_ended: 'showdown',
          hand_tags:   [
            { tag: 'C_BET',      tag_type: 'auto'    },
            { tag: 'OPEN_LIMP',  tag_type: 'mistake'  },
          ],
        },
      },
    ]);

    const result = await getPlaylistHands('pl-001');
    expect(result).toHaveLength(1);
    expect(result[0].hand_id).toBe('hand-abc');
    expect(result[0].board).toEqual(['Ah', 'Kd', '2c']);
    expect(result[0].final_pot).toBe(200);
    expect(result[0].auto_tags).toEqual(['C_BET']); // only auto tags
    expect(result[0].auto_tags).not.toContain('OPEN_LIMP');
  });

  test('returns mistake_tags and sizing_tags, not just auto_tags', async () => {
    q.mockResolvedValueOnce([
      {
        playlist_id:   'pl-001',
        hand_id:       'h-99',
        display_order: 0,
        hands: {
          board:       [],
          final_pot:   200,
          winner_name: 'Alice',
          phase_ended: 'showdown',
          hand_tags:   [
            { tag: 'C_BET',     tag_type: 'auto'    },
            { tag: 'OPEN_LIMP', tag_type: 'mistake' },
            { tag: 'POT_BET',   tag_type: 'sizing'  },
          ],
        },
      },
    ]);

    const result = await getPlaylistHands('pl-001');
    expect(result[0].auto_tags).toEqual(['C_BET']);
    expect(result[0].mistake_tags).toEqual(['OPEN_LIMP']);
    expect(result[0].sizing_tags).toEqual(['POT_BET']);
  });
});

// ─── addHandToPlaylist ────────────────────────────────────────────────────────

describe('addHandToPlaylist', () => {
  test('returns { playlist_id, hand_id, display_order } on success', async () => {
    q.mockResolvedValueOnce([]);    // existing hands query (empty → nextOrder=0)
    q.mockResolvedValueOnce(null);  // upsert

    const result = await addHandToPlaylist('pl-001', 'hand-abc');
    expect(result.playlist_id).toBe('pl-001');
    expect(result.hand_id).toBe('hand-abc');
    expect(result.display_order).toBe(0);
  });

  test('increments display_order after existing hands', async () => {
    q.mockResolvedValueOnce([{ display_order: 4 }]); // one existing hand at order 4
    q.mockResolvedValueOnce(null);                    // upsert

    const result = await addHandToPlaylist('pl-001', 'hand-xyz');
    expect(result.display_order).toBe(5);
  });

  test('resolves without throwing when q returns null for existing query', async () => {
    q.mockResolvedValueOnce(null); // no existing hands
    q.mockResolvedValueOnce(null); // upsert
    const result = await addHandToPlaylist('pl-001', 'hand-new');
    expect(result.display_order).toBe(0);
  });
});

// ─── removeHandFromPlaylist ───────────────────────────────────────────────────

describe('removeHandFromPlaylist', () => {
  test('resolves without throwing when no remaining hands after delete', async () => {
    q.mockResolvedValueOnce(null); // delete
    q.mockResolvedValueOnce([]);   // remaining hands (empty)
    await expect(removeHandFromPlaylist('pl-001', 'hand-abc')).resolves.not.toThrow();
  });

  test('reorders remaining hands after removal', async () => {
    q.mockResolvedValueOnce(null);  // delete
    q.mockResolvedValueOnce([      // remaining hands
      { hand_id: 'hand-1' },
      { hand_id: 'hand-2' },
    ]);
    // Two update calls for reordering
    q.mockResolvedValueOnce(null);
    q.mockResolvedValueOnce(null);

    await expect(removeHandFromPlaylist('pl-001', 'hand-removed')).resolves.not.toThrow();
  });

  test('resolves without throwing when q returns null for remaining', async () => {
    q.mockResolvedValueOnce(null); // delete
    q.mockResolvedValueOnce(null); // remaining — null (treated as empty)
    await expect(removeHandFromPlaylist('pl-001', 'hand-abc')).resolves.not.toThrow();
  });
});

// ─── deletePlaylist ───────────────────────────────────────────────────────────

describe('deletePlaylist', () => {
  test('resolves without throwing', async () => {
    await expect(deletePlaylist('pl-001')).resolves.not.toThrow();
  });

  test('resolves even when q returns null', async () => {
    q.mockResolvedValueOnce(null);
    await expect(deletePlaylist('pl-999')).resolves.not.toThrow();
  });
});
