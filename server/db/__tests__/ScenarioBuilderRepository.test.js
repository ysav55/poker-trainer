'use strict';

/**
 * ScenarioBuilderRepository unit tests.
 * All Supabase calls are mocked — no real DB or network calls made.
 */

// ─── Supabase chain mock ──────────────────────────────────────────────────────
// Must be defined before jest.mock() calls; prefixed with 'mock' as required.

const mockChain = {
  from:     jest.fn(),
  select:   jest.fn(),
  insert:   jest.fn(),
  update:   jest.fn(),
  delete:   jest.fn(),
  upsert:   jest.fn(),
  eq:       jest.fn(),
  neq:      jest.fn(),
  in:       jest.fn(),
  gte:      jest.fn(),
  ilike:    jest.fn(),
  contains: jest.fn(),
  is:       jest.fn(),
  or:       jest.fn(),
  order:    jest.fn(),
  limit:    jest.fn(),
  single:   jest.fn(),
};
// Make every method return the chain itself so calls can be chained arbitrarily
Object.keys(mockChain).forEach(k => {
  mockChain[k].mockReturnValue(mockChain);
});

jest.mock('../supabase', () => mockChain);

// ─── q mock ───────────────────────────────────────────────────────────────────
// We keep q as a real async fn whose return value we control per-test via mockResolvedValue.

const mockQ = jest.fn();
jest.mock('../utils', () => ({ q: mockQ }));

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Set what q resolves to for the next call(s). */
function setQ(value) {
  mockQ.mockResolvedValue(value);
}

/** Set q to resolve to successive values per call. */
function setQSequence(...values) {
  values.forEach((v, i) => {
    if (i === 0) mockQ.mockResolvedValueOnce(v);
    else mockQ.mockResolvedValueOnce(v);
  });
}

// ─── Reset between tests ──────────────────────────────────────────────────────

let repo;
beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  // Restore chain self-returns after clearAllMocks resets them
  Object.keys(mockChain).forEach(k => mockChain[k].mockReturnValue(mockChain));
  // Re-register mocks
  jest.mock('../supabase', () => mockChain);
  jest.mock('../utils', () => ({ q: mockQ }));
  repo = require('../repositories/ScenarioBuilderRepository');
});

// ─── FOLDERS ─────────────────────────────────────────────────────────────────

describe('getFolderTree', () => {
  it('returns empty array when coach has no folders', async () => {
    setQ([]);
    const tree = await repo.getFolderTree('coach-1');
    expect(tree).toEqual([]);
  });

  it('builds a nested tree from flat rows', async () => {
    setQ([
      { id: 'f1', parent_id: null,  name: 'Root',  sort_order: 0 },
      { id: 'f2', parent_id: 'f1', name: 'Child', sort_order: 0 },
    ]);
    const tree = await repo.getFolderTree('coach-1');
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('f1');
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].id).toBe('f2');
  });

  it('handles multiple root folders', async () => {
    setQ([
      { id: 'f1', parent_id: null, name: 'A', sort_order: 0 },
      { id: 'f2', parent_id: null, name: 'B', sort_order: 1 },
    ]);
    const tree = await repo.getFolderTree('coach-1');
    expect(tree).toHaveLength(2);
    expect(tree[0].children).toHaveLength(0);
  });
});

describe('createFolder', () => {
  it('returns created folder', async () => {
    const folder = { id: 'f1', parent_id: null, name: 'Preflop', sort_order: 0 };
    setQ(folder);
    const result = await repo.createFolder({ coachId: 'c1', name: 'Preflop' });
    expect(result).toEqual(folder);
  });
});

describe('updateFolder', () => {
  it('returns updated folder', async () => {
    const updated = { id: 'f1', name: 'Renamed', parent_id: null, sort_order: 0 };
    setQ(updated);
    const result = await repo.updateFolder('f1', { name: 'Renamed' });
    expect(result.name).toBe('Renamed');
  });
});

// ─── SCENARIOS ───────────────────────────────────────────────────────────────

describe('createScenario', () => {
  it('returns inserted scenario', async () => {
    const scenario = {
      id: 's1', coach_id: 'c1', name: 'Test', player_count: 6,
      btn_seat: 0, card_mode: 'fixed', seat_configs: [], stack_configs: [],
      board_mode: 'none', tags: [], play_count: 0, version: 1, is_current: true,
    };
    setQ(scenario);
    const result = await repo.createScenario({ coachId: 'c1', name: 'Test', playerCount: 6 });
    expect(result.id).toBe('s1');
    expect(result.player_count).toBe(6);
  });
});

describe('listScenarios', () => {
  it('returns empty array when none found', async () => {
    setQ([]);
    const results = await repo.listScenarios({ coachId: 'c1' });
    expect(results).toEqual([]);
  });

  it('returns list of scenarios', async () => {
    const rows = [
      { id: 's1', name: 'A', player_count: 6, play_count: 0, is_current: true },
      { id: 's2', name: 'B', player_count: 4, play_count: 3, is_current: true },
    ];
    setQ(rows);
    const results = await repo.listScenarios({ coachId: 'c1' });
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('s1');
  });
});

describe('updateScenario — in-place (play_count === 0)', () => {
  it('patches scenario and returns updated row', async () => {
    const current = {
      id: 's1', play_count: 0, version: 1, is_current: true,
      name: 'Old', tags: [], player_count: 6, btn_seat: 0,
      card_mode: 'fixed', seat_configs: [], stack_configs: [],
      board_mode: 'none', coach_id: 'c1', folder_id: null,
      description: null, board_flop: null, board_turn: null, board_river: null,
      board_texture: null, texture_turn: null, texture_river: null,
      blind_mode: false, is_shareable: false, source_hand_id: null,
    };
    const updated = { ...current, name: 'New Name' };
    setQSequence(current, updated);
    const result = await repo.updateScenario('s1', { name: 'New Name' });
    expect(result.name).toBe('New Name');
  });
});

describe('updateScenario — versioning (play_count > 0)', () => {
  it('creates new version when play_count > 0', async () => {
    const current = {
      id: 's1', play_count: 3, version: 1, is_current: true,
      name: 'Old', tags: [], player_count: 6, btn_seat: 0,
      card_mode: 'fixed', seat_configs: [], stack_configs: [],
      board_mode: 'none', coach_id: 'c1', folder_id: null,
      description: null, board_flop: null, board_turn: null, board_river: null,
      board_texture: null, texture_turn: null, texture_river: null,
      blind_mode: false, is_shareable: false, source_hand_id: null,
    };
    const newScenario = { ...current, id: 's2', name: 'New', version: 1, play_count: 0 };
    const versioned   = { ...newScenario, version: 2, parent_id: 's1' };
    // Sequence: getScenario(s1), update(is_current=false), createScenario insert, update(version+parent), update(playlist_items)
    setQSequence(current, null, newScenario, versioned, null);
    const result = await repo.updateScenario('s1', { name: 'New' });
    expect(result.version).toBe(2);
    expect(result.parent_id).toBe('s1');
  });
});

describe('duplicateScenario', () => {
  it('creates a copy with " (copy)" suffix', async () => {
    const src = {
      id: 's1', name: 'Original', coach_id: 'c1', folder_id: null,
      description: null, tags: [], player_count: 4, btn_seat: 0,
      card_mode: 'fixed', seat_configs: [], stack_configs: [],
      board_mode: 'none', board_flop: null, board_turn: null, board_river: null,
      board_texture: null, texture_turn: null, texture_river: null,
      blind_mode: false, is_shareable: false,
    };
    const copy = { ...src, id: 's2', name: 'Original (copy)', play_count: 0 };
    setQSequence(src, copy);
    const result = await repo.duplicateScenario('s1', 'c1');
    expect(result.name).toBe('Original (copy)');
  });
});

describe('deleteScenario', () => {
  it('calls q twice (playlist_items delete + scenario soft-delete)', async () => {
    setQ(null);
    await repo.deleteScenario('s1');
    expect(mockQ).toHaveBeenCalledTimes(2);
  });
});

describe('getVersionHistory', () => {
  it('returns version rows', async () => {
    const rows = [
      { id: 's1', version: 1, is_current: false, play_count: 5 },
      { id: 's2', version: 2, is_current: true,  play_count: 0 },
    ];
    setQ(rows);
    const result = await repo.getVersionHistory('s2');
    expect(result).toHaveLength(2);
  });
});

// ─── PLAYLIST ITEMS ───────────────────────────────────────────────────────────

describe('getPlaylistItems', () => {
  it('returns items with nested scenario', async () => {
    const rows = [
      {
        id: 'pi1', playlist_id: 'pl1', scenario_id: 's1', position: 0,
        scenarios: { id: 's1', name: 'Scenario A', player_count: 6, card_mode: 'fixed', tags: [] },
      },
    ];
    setQ(rows);
    const items = await repo.getPlaylistItems('pl1');
    expect(items).toHaveLength(1);
    expect(items[0].scenario.name).toBe('Scenario A');
  });
});

describe('addPlaylistItem — appends at end', () => {
  it('uses last position + 1', async () => {
    const existingMax = [{ position: 2 }];
    const newItem = { id: 'pi2', playlist_id: 'pl1', scenario_id: 's2', position: 3 };
    setQSequence(existingMax, newItem);
    const result = await repo.addPlaylistItem('pl1', 's2');
    expect(result.position).toBe(3);
  });

  it('starts at 0 when playlist is empty', async () => {
    const newItem = { id: 'pi1', playlist_id: 'pl1', scenario_id: 's1', position: 0 };
    setQSequence([], newItem);
    const result = await repo.addPlaylistItem('pl1', 's1');
    expect(result.position).toBe(0);
  });
});

describe('reorderPlaylistItems', () => {
  it('calls q once per item', async () => {
    setQ(null);
    await repo.reorderPlaylistItems('pl1', [
      { id: 'pi1', position: 0 },
      { id: 'pi2', position: 1 },
    ]);
    expect(mockQ).toHaveBeenCalledTimes(2);
  });

  it('no-ops on empty array', async () => {
    await repo.reorderPlaylistItems('pl1', []);
    expect(mockQ).not.toHaveBeenCalled();
  });
});

// ─── DRILL SESSIONS ───────────────────────────────────────────────────────────

describe('createDrillSession', () => {
  it('returns created session', async () => {
    const session = {
      id: 'ds1', table_id: 't1', playlist_id: 'pl1', coach_id: 'c1',
      status: 'active', current_position: 0, items_dealt: 0, items_total: 10,
    };
    setQ(session);
    const result = await repo.createDrillSession({
      tableId: 't1', playlistId: 'pl1', coachId: 'c1', itemsTotal: 10,
    });
    expect(result.id).toBe('ds1');
    expect(result.status).toBe('active');
  });
});

describe('getActiveDrillSession', () => {
  it('returns null when no active session', async () => {
    setQ([]);
    const result = await repo.getActiveDrillSession('t1');
    expect(result).toBeNull();
  });

  it('returns first session from result', async () => {
    setQ([{ id: 'ds1', status: 'active' }]);
    const result = await repo.getActiveDrillSession('t1');
    expect(result.id).toBe('ds1');
  });
});

describe('updateDrillSession', () => {
  it('patches provided fields', async () => {
    const updated = { id: 'ds1', status: 'paused', paused_at: '2026-04-04T00:00:00Z' };
    setQ(updated);
    const result = await repo.updateDrillSession('ds1', {
      status: 'paused',
      pausedAt: '2026-04-04T00:00:00Z',
    });
    expect(result.status).toBe('paused');
  });
});

// ─── PLAYLIST META ────────────────────────────────────────────────────────────

describe('updatePlaylistMeta', () => {
  it('updates new columns and returns row', async () => {
    const updated = { playlist_id: 'pl1', name: 'New', ordering: 'random', advance_mode: 'auto' };
    setQ(updated);
    const result = await repo.updatePlaylistMeta('pl1', { name: 'New', ordering: 'random', advanceMode: 'auto' });
    expect(result.ordering).toBe('random');
    expect(result.advance_mode).toBe('auto');
  });

  it('no-ops and skips DB call when no changes provided', async () => {
    await repo.updatePlaylistMeta('pl1', {});
    expect(mockQ).not.toHaveBeenCalled();
  });
});
