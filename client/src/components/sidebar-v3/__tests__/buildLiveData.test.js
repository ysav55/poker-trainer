import { describe, it, expect } from 'vitest';
import { buildLiveData } from '../buildLiveData';
import { SIDEBAR_V3_DATA } from '../data';

// Minimal hookState scaffold — adapter rejects only when gameState.players
// isn't an array (early-return to fixture). Everything below is the live path.
function liveHookState({ playlist_mode, players = [], ...gsOverrides } = {}) {
  return {
    gameState: {
      hand_number: 42,
      phase: 'flop',
      pot: 200,
      side_pots: [],
      current_turn: null,
      current_bet: 0,
      min_raise: 0,
      big_blind: 20,
      small_blind: 10,
      board: ['Ks', '9d', '4c'],
      paused: false,
      is_scenario: false,
      players,
      pending_hand_config: false,
      ...(playlist_mode ? { playlist_mode } : {}),
      ...gsOverrides,
    },
    actionTimer: { playerId: null, duration: 25000, startedAt: null },
    equityData: { showToPlayers: false, equities: [], colors: {} },
  };
}

describe('buildLiveData — playlist mapping', () => {
  it('maps server playlist_id → v3 id; hand_count → count; defaults description', () => {
    const hookState = liveHookState({ players: [{ id: 'p1', stableId: 'u1', name: 'A', stack: 1000 }] });
    const playlist = {
      playlists: [
        { playlist_id: 'pl-1', name: 'Mistake Spots', description: 'review', hand_count: 5 },
        { playlist_id: 'pl-2', name: 'Homework',      hand_count: 0 }, // missing description
      ],
    };
    const data = buildLiveData({ hookState, user: null, playlist });
    expect(data.playlists).toEqual([
      { id: 'pl-1', name: 'Mistake Spots', description: 'review', count: 5, scenarios: [] },
      { id: 'pl-2', name: 'Homework',      description: '',       count: 0, scenarios: [] },
    ]);
  });

  it('produces empty array when playlist arg is omitted (no mock leak)', () => {
    const hookState = liveHookState({ players: [{ id: 'p1', stableId: 'u1', name: 'A', stack: 1000 }] });
    const data = buildLiveData({ hookState, user: null });
    expect(data.playlists).toEqual([]);
  });
});

describe('buildLiveData — drillSession mapping', () => {
  it('inactive playlist_mode → drillSession.active=false with zero defaults', () => {
    const hookState = liveHookState({
      players: [{ id: 'p1', stableId: 'u1', name: 'A', stack: 1000 }],
      playlist_mode: { active: false, playlistId: null, currentIndex: 0, totalHands: 0 },
    });
    const data = buildLiveData({ hookState, user: null, playlist: { playlists: [] } });
    expect(data.drillSession.active).toBe(false);
    expect(data.drillSession.handsDone).toBe(0);
    expect(data.drillSession.handsTotal).toBe(0);
  });

  it('active playlist_mode → looks up scenarioName from playlists by playlist_id', () => {
    const hookState = liveHookState({
      players: [{ id: 'p1', stableId: 'u1', name: 'A', stack: 1000 }],
      playlist_mode: { active: true, playlistId: 'pl-2', currentIndex: 3, totalHands: 8 },
      phase: 'turn',
      board: ['Ks', '9d', '4c', '2h'],
    });
    const playlist = {
      playlists: [
        { playlist_id: 'pl-1', name: 'Other', hand_count: 5 },
        { playlist_id: 'pl-2', name: 'Weekly Homework', hand_count: 8 },
      ],
    };
    const data = buildLiveData({ hookState, user: null, playlist });
    expect(data.drillSession.active).toBe(true);
    expect(data.drillSession.playlistId).toBe('pl-2');
    expect(data.drillSession.scenarioName).toBe('Weekly Homework');
    expect(data.drillSession.handsDone).toBe(3);
    expect(data.drillSession.handsTotal).toBe(8);
    expect(data.drillSession.currentSpot).toContain('turn');
  });

  it('active playlist_mode with unknown playlistId → falls back to "Active drill"', () => {
    const hookState = liveHookState({
      players: [{ id: 'p1', stableId: 'u1', name: 'A', stack: 1000 }],
      playlist_mode: { active: true, playlistId: 'pl-missing', currentIndex: 0, totalHands: 5 },
    });
    const data = buildLiveData({ hookState, user: null, playlist: { playlists: [] } });
    expect(data.drillSession.scenarioName).toBe('Active drill');
  });

  it('honestly reports zero results (no fabricated correct/mistake/uncertain)', () => {
    const hookState = liveHookState({
      players: [{ id: 'p1', stableId: 'u1', name: 'A', stack: 1000 }],
      playlist_mode: { active: true, playlistId: 'pl-1', currentIndex: 5, totalHands: 10 },
    });
    const data = buildLiveData({
      hookState, user: null,
      playlist: { playlists: [{ playlist_id: 'pl-1', name: 'X', hand_count: 10 }] },
    });
    expect(data.drillSession.results).toEqual({ correct: 0, mistake: 0, uncertain: 0 });
  });
});

describe('buildLiveData — review override', () => {
  // The fixture review.loaded=true would otherwise leak into live mode and
  // show a mocked hand instead of the placeholder when a coach clicks a real
  // hand. Live mode must return loaded=false so TabReview's placeholder can fire.
  it('forces review.loaded=false in live mode (no fixture leak)', () => {
    const hookState = liveHookState({ players: [{ id: 'p1', stableId: 'u1', name: 'A', stack: 1000 }] });
    const data = buildLiveData({ hookState, user: null, playlist: { playlists: [] } });
    expect(data.review.loaded).toBe(false);
    expect(data.review.handNumber).toBeNull();
    expect(data.review.streets).toEqual([]);
  });
});

describe('buildLiveData — null safety', () => {
  it('returns the fixture verbatim when gameState.players is missing', () => {
    const data = buildLiveData({ hookState: { gameState: null }, user: null });
    expect(data).toBe(SIDEBAR_V3_DATA);
  });

  it('returns the fixture verbatim when hookState is null', () => {
    const data = buildLiveData({ hookState: null, user: null });
    expect(data).toBe(SIDEBAR_V3_DATA);
  });

  it('does not crash on missing actionTimer / equityData', () => {
    const hookState = {
      gameState: {
        phase: 'waiting',
        pot: 0,
        board: [],
        players: [{ id: 'p1', stableId: 'u1', name: 'A', stack: 1000 }],
      },
    };
    expect(() => buildLiveData({ hookState, user: null })).not.toThrow();
    const data = buildLiveData({ hookState, user: null });
    expect(data.actionTimer).toBeDefined();
    expect(data.equityData).toBeDefined();
  });
});
