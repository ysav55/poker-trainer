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

describe('buildLiveData — review mapping', () => {
  // Without an explicit override, the fixture's review.loaded=true would leak
  // into live mode and show a mocked hand. Live mode must surface real
  // replay_mode state instead.
  it('replay_mode inactive → review.loaded=false (no fixture leak)', () => {
    const hookState = liveHookState({ players: [{ id: 'p1', stableId: 'u1', name: 'A', stack: 1000 }] });
    const data = buildLiveData({ hookState, user: null, playlist: { playlists: [] } });
    expect(data.review.loaded).toBe(false);
    expect(data.review.handId).toBeNull();
    expect(data.review.cursor).toBe(-1);
  });

  it('replay_mode active → review carries handId, cursor, totalActions, branched, board', () => {
    const hookState = liveHookState({
      players: [{ id: 'p1', stableId: 'u1', name: 'A', stack: 1000 }],
      board: ['Ks', '9d', '4c', '2h'],
      replay_mode: {
        active: true,
        cursor: 5,
        total_actions: 12,
        source_hand_id: 'hand-uuid-xyz',
        branched: false,
      },
    });
    const data = buildLiveData({ hookState, user: null, playlist: { playlists: [] } });
    expect(data.review.loaded).toBe(true);
    expect(data.review.handId).toBe('hand-uuid-xyz');
    expect(data.review.cursor).toBe(5);
    expect(data.review.totalActions).toBe(12);
    expect(data.review.branched).toBe(false);
    expect(data.review.board).toEqual(['Ks', '9d', '4c', '2h']);
  });

  it('replay_mode branched=true propagates to review.branched', () => {
    const hookState = liveHookState({
      players: [{ id: 'p1', stableId: 'u1', name: 'A', stack: 1000 }],
      replay_mode: { active: true, cursor: 2, total_actions: 8, source_hand_id: 'h-1', branched: true },
    });
    const data = buildLiveData({ hookState, user: null, playlist: { playlists: [] } });
    expect(data.review.branched).toBe(true);
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

describe('buildLiveData — status priority chain', () => {
  function input({ paused = false, replayActive = false, drillActive = false, scenario = false } = {}) {
    return {
      hookState: {
        gameState: {
          phase: 'waiting',
          paused,
          is_scenario: scenario,
          hand_id: null,
          actions: [],
          players: [{ id: 'p1', stableId: 'u1', name: 'A', stack: 1000 }],
          ...(drillActive ? { playlist_mode: { active: true, playlistId: 'pl1', currentIndex: 0, totalHands: 1 } } : {}),
          ...(replayActive ? { replay_mode: { active: true, source_hand_id: 'h1', cursor: 0, total_actions: 1, branched: false } } : {}),
        },
        actionTimer: { secondsLeft: 0, totalSeconds: 0 },
        equityData: { showToPlayers: false, players: {} },
        myId: 'me',
      },
      user: { stable_id: 'me' },
      playlist: { playlists: [] },
    };
  }

  it('returns "live" when nothing else is true', () => {
    expect(buildLiveData(input()).status).toBe('live');
  });
  it('"paused" wins over "live"', () => {
    expect(buildLiveData(input({ paused: true })).status).toBe('paused');
  });
  it('"scenario" wins over "paused" and "live"', () => {
    expect(buildLiveData(input({ paused: true, scenario: true })).status).toBe('scenario');
  });
  it('"drill" wins over "scenario", "paused", "live"', () => {
    expect(buildLiveData(input({ drillActive: true, scenario: true, paused: true })).status).toBe('drill');
  });
  it('"review" wins over everything', () => {
    expect(buildLiveData(input({ replayActive: true, drillActive: true, scenario: true, paused: true })).status).toBe('review');
  });
});

describe('buildLiveData — actions_log', () => {
  it('returns empty array when gameState has no actions', () => {
    const out = buildLiveData({
      hookState: {
        gameState: { phase: 'waiting', paused: false, is_scenario: false, hand_id: null, actions: [], players: [{ id: 'p1', stableId: 'u1', name: 'A', stack: 1000 }] },
        actionTimer: {},
        equityData: { showToPlayers: false, players: {} },
        myId: 'me',
        replayState: { active: false },
      },
      user: { stable_id: 'me' },
      playlist: { playlists: [], active: null },
    });
    expect(out.actions_log).toEqual([]);
  });

  it('maps gameState.actions into actions_log shape (newest first)', () => {
    const actions = [
      { street: 'preflop', player_id: 'p1', player: 'Alice', action: 'call', amount: 20 },
      { street: 'preflop', player_id: 'p2', player: 'Bob',   action: 'raise', amount: 60 },
      { street: 'flop',    player_id: 'p1', player: 'Alice', action: 'check' },
    ];
    const out = buildLiveData({
      hookState: {
        gameState: { phase: 'flop', paused: false, is_scenario: false, hand_id: 'h1', actions, players: [{ id: 'p1', stableId: 'u1', name: 'A', stack: 1000 }] },
        actionTimer: {},
        equityData: { showToPlayers: false, players: {} },
        myId: 'me',
        replayState: { active: false },
      },
      user: { stable_id: 'me' },
      playlist: { playlists: [], active: null },
    });
    // Newest first, so flop check is index 0
    expect(out.actions_log[0]).toMatchObject({ street: 'flop', who: 'Alice', act: 'check' });
    expect(out.actions_log[1]).toMatchObject({ street: 'preflop', who: 'Bob', act: 'raise', amt: 60 });
    expect(out.actions_log).toHaveLength(3);
  });
});

describe('buildLiveData — notes_counts', () => {
  it('returns empty record by default (populated by TabHistory mount)', () => {
    const out = buildLiveData({
      hookState: {
        gameState: { phase: 'waiting', paused: false, is_scenario: false, hand_id: null, actions: [], players: [{ id: 'p1', stableId: 'u1', name: 'A', stack: 1000 }] },
        actionTimer: {},
        equityData: { showToPlayers: false, players: {} },
        myId: 'me',
        replayState: { active: false },
      },
      user: { stable_id: 'me' },
      playlist: { playlists: [], active: null },
    });
    expect(out.notes_counts).toEqual({});
  });
});

describe('buildLiveData — pending_blinds', () => {
  it('passes through gameState.pending_blinds', () => {
    const out = buildLiveData({
      hookState: {
        gameState: { phase: 'flop', paused: false, is_scenario: false, hand_id: 'h1', actions: [], pending_blinds: { sb: 25, bb: 50, queuedAt: 100 }, players: [{ id: 'p1', stableId: 'u1', name: 'A', stack: 1000 }] },
        actionTimer: {},
        equityData: { showToPlayers: false, players: {} },
        myId: 'me',
        replayState: { active: false },
      },
      user: { stable_id: 'me' },
      playlist: { playlists: [], active: null },
    });
    expect(out.pending_blinds).toMatchObject({ sb: 25, bb: 50 });
  });

  it('returns null when no pending', () => {
    const out = buildLiveData({
      hookState: {
        gameState: { phase: 'flop', paused: false, is_scenario: false, hand_id: 'h1', actions: [], pending_blinds: null, players: [{ id: 'p1', stableId: 'u1', name: 'A', stack: 1000 }] },
        actionTimer: {},
        equityData: { showToPlayers: false, players: {} },
        myId: 'me',
        replayState: { active: false },
      },
      user: { stable_id: 'me' },
      playlist: { playlists: [], active: null },
    });
    expect(out.pending_blinds).toBeNull();
  });

  it('returns null when gameState has no pending_blinds field', () => {
    const out = buildLiveData({
      hookState: {
        gameState: { phase: 'flop', paused: false, is_scenario: false, hand_id: 'h1', actions: [], players: [{ id: 'p1', stableId: 'u1', name: 'A', stack: 1000 }] },
        actionTimer: {},
        equityData: { showToPlayers: false, players: {} },
        myId: 'me',
        replayState: { active: false },
      },
      user: { stable_id: 'me' },
      playlist: { playlists: [], active: null },
    });
    expect(out.pending_blinds).toBeNull();
  });
});

describe('buildLiveData — equity_visibility', () => {
  it('passes through equityData.equity_visibility', () => {
    const out = buildLiveData({
      hookState: {
        gameState: { phase: 'flop', paused: false, is_scenario: false, hand_id: 'h1', actions: [], players: [{ id: 'p1', stableId: 'u1', name: 'A', stack: 1000 }] },
        actionTimer: {},
        equityData: { showToPlayers: true, players: {}, equity_visibility: { coach: true, players: true } },
        myId: 'me',
        replayState: { active: false },
      },
      user: { stable_id: 'me' },
      playlist: { playlists: [], active: null },
    });
    expect(out.equity_visibility).toMatchObject({ coach: true, players: true });
  });

  it('falls back to {coach:true, players:false} when missing', () => {
    const out = buildLiveData({
      hookState: {
        gameState: { phase: 'flop', paused: false, is_scenario: false, hand_id: 'h1', actions: [], players: [{ id: 'p1', stableId: 'u1', name: 'A', stack: 1000 }] },
        actionTimer: {},
        equityData: { showToPlayers: false, players: {} },
        myId: 'me',
        replayState: { active: false },
      },
      user: { stable_id: 'me' },
      playlist: { playlists: [], active: null },
    });
    expect(out.equity_visibility).toEqual({ coach: true, players: false });
  });
});
