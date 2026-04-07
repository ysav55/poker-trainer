'use strict';

/**
 * Phase 3 — TournamentController operational controls.
 *
 * Tests:
 *   pause / resume:
 *   - pause() returns true and sets paused flag
 *   - pause() emits tournament:paused with saved remainingMs
 *   - pause() is idempotent (double-pause returns false)
 *   - resume() returns true and clears paused flag
 *   - resume() emits tournament:resumed
 *   - resume() re-emits tournament:time_remaining with remaining time
 *   - resume() restarts the level-advance timer
 *   - resume() is idempotent (double-resume returns false)
 *
 *   eliminatePlayerManual:
 *   - eliminates player by stableId (returns success)
 *   - returns failure for unknown stableId
 *   - returns failure when player already eliminated
 *
 *   setHandVisibility:
 *   - toggling 'manager' emits tournament:hand_visibility_changed
 *   - toggling 'spectator' emits tournament:hand_visibility_changed
 *   - unknown type is a no-op (no emit)
 *
 *   setIcmOverlay:
 *   - emits tournament:icm_overlay_changed with enabled flag
 */

jest.useFakeTimers();

// Mock supabase and repositories so this file runs in CI without DB credentials
jest.mock('../db/supabase', () => ({}));
jest.mock('../db/repositories/TournamentRepository', () => ({ TournamentRepository: {} }));
jest.mock('../db/repositories/TableRepository', () => ({ TableRepository: {} }));

// Mock HandLoggerSupabase so _startHand() doesn't hit the real DB
jest.mock('../db/HandLoggerSupabase', () => ({
  startHand:    jest.fn().mockResolvedValue(undefined),
  endHand:      jest.fn().mockResolvedValue(undefined),
  logAction:    jest.fn().mockResolvedValue(undefined),
}));

// Mock SharedState so _startHand() doesn't require live Maps
jest.mock('../state/SharedState', () => ({
  tables:       new Map(),
  activeHands:  new Map(),
  stableIdMap:  new Map(),
}));

const mockIoEmit = jest.fn();
const mockIoTo   = jest.fn(() => ({ emit: mockIoEmit }));
const mockIo     = {
  to: mockIoTo,
  // _broadcastState() reads io.sockets.adapter.rooms.get(tableId) — return an
  // empty Map so the early-return guard fires and no actual broadcast happens.
  sockets: { adapter: { rooms: new Map() }, sockets: new Map() },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePlayer(id, stableId, stack = 5000) {
  return { id, stable_id: stableId, stableId, stack, in_hand: true };
}

function makeGm(players = []) {
  const state = { players, seated: players, paused: false };
  return {
    state,
    getState() { return this.state; },
    setBlindLevels: jest.fn(),
    setPlayerInHand: jest.fn(),
    adjustStack: jest.fn((id, delta) => {
      const p = state.players.find(x => x.id === id);
      if (p) p.stack += delta;
    }),
    startGame: jest.fn().mockResolvedValue(undefined),
  };
}

const { TournamentController } = require('../game/controllers/TournamentController');

// Minimal blind schedule with one level
const BLIND_SCHEDULE = [{ level: 1, sb: 25, bb: 50, ante: 0, duration_minutes: 10 }];

function makeCtrl(tableId = 'tbl', players = []) {
  return new TournamentController(tableId, makeGm(players), mockIo);
}

// ─── pause / resume ───────────────────────────────────────────────────────────

describe('TournamentController — pause / resume', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
  });

  async function startedCtrl(players = []) {
    const ctrl = makeCtrl('t1', players);
    const config = {
      blind_schedule: BLIND_SCHEDULE,
      starting_stack: 10000,
      late_reg_minutes: 0,
      addon_allowed: false,
      addon_deadline_level: 0,
    };
    await ctrl.start(config);
    jest.clearAllMocks(); // reset emit history after start
    return ctrl;
  }

  test('pause() sets paused flag and returns true', async () => {
    const ctrl = await startedCtrl();
    const result = ctrl.pause();
    expect(result).toBe(true);
    expect(ctrl.paused).toBe(true);
  });

  test('pause() sets gm.state.paused = true', async () => {
    const ctrl = await startedCtrl();
    ctrl.pause();
    expect(ctrl.gm.state.paused).toBe(true);
  });

  test('pause() emits tournament:paused', async () => {
    const ctrl = await startedCtrl();
    ctrl.pause();
    expect(mockIoTo).toHaveBeenCalledWith('t1');
    expect(mockIoEmit).toHaveBeenCalledWith('tournament:paused',
      expect.objectContaining({ pausedLevelRemainingMs: expect.any(Number) })
    );
  });

  test('pause() is idempotent — second call returns false', async () => {
    const ctrl = await startedCtrl();
    ctrl.pause();
    const second = ctrl.pause();
    expect(second).toBe(false);
  });

  test('resume() sets paused=false and returns true', async () => {
    const ctrl = await startedCtrl();
    ctrl.pause();
    jest.clearAllMocks();
    const result = ctrl.resume();
    expect(result).toBe(true);
    expect(ctrl.paused).toBe(false);
  });

  test('resume() sets gm.state.paused = false', async () => {
    const ctrl = await startedCtrl();
    ctrl.pause();
    ctrl.resume();
    expect(ctrl.gm.state.paused).toBe(false);
  });

  test('resume() emits tournament:resumed', async () => {
    const ctrl = await startedCtrl();
    ctrl.pause();
    jest.clearAllMocks();
    ctrl.resume();
    expect(mockIoEmit).toHaveBeenCalledWith('tournament:resumed', {});
  });

  test('resume() re-emits tournament:time_remaining', async () => {
    const ctrl = await startedCtrl();
    ctrl.pause();
    jest.clearAllMocks();
    ctrl.resume();
    expect(mockIoEmit).toHaveBeenCalledWith('tournament:time_remaining',
      expect.objectContaining({ remainingMs: expect.any(Number) })
    );
  });

  test('resume() restarts the level-advance timer', async () => {
    const ctrl = await startedCtrl();
    ctrl.pause();

    // Force a specific remaining time for deterministic assertion
    ctrl.pausedLevelRemainingMs = 5_000;
    jest.clearAllMocks();
    ctrl.resume();

    // Advance less than 5s — should NOT have fired _advanceLevel yet
    jest.advanceTimersByTime(4_000);
    // Advance past 5s
    jest.advanceTimersByTime(1_500);
    // _advanceLevel() emits tournament:blind_up when there's a next level.
    // Our schedule has only one level, so it emits tournament:final_level.
    const emittedEvents = mockIoEmit.mock.calls.map(c => c[0]);
    expect(emittedEvents).toContain('tournament:final_level');
  });

  test('resume() is idempotent — double-resume returns false', async () => {
    const ctrl = await startedCtrl();
    ctrl.pause();
    ctrl.resume();
    const second = ctrl.resume();
    expect(second).toBe(false);
  });
});

// ─── eliminatePlayerManual ────────────────────────────────────────────────────

describe('TournamentController — eliminatePlayerManual', () => {
  const TournamentRepository = require('../db/repositories/TournamentRepository');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Patch recordElimination to avoid real DB calls in unit tests
  jest.mock('../db/repositories/TournamentRepository', () => ({
    TournamentRepository: {
      recordElimination: jest.fn().mockResolvedValue(undefined),
      getStandings: jest.fn().mockResolvedValue([]),
    },
  }));

  test('eliminates player by stableId — returns success', async () => {
    const player = makePlayer('socket-1', 'stable-1');
    const ctrl = makeCtrl('t2', [player]);

    const result = await ctrl.eliminatePlayerManual('stable-1');
    expect(result).toEqual({ success: true });
    // adjustStack should have been called with a negative delta
    expect(ctrl.gm.adjustStack).toHaveBeenCalledWith('socket-1', -5000);
    // setPlayerInHand called by _eliminatePlayer
    expect(ctrl.gm.setPlayerInHand).toHaveBeenCalledWith('socket-1', false);
  });

  test('returns failure for unknown stableId', async () => {
    const ctrl = makeCtrl('t3', [makePlayer('s1', 'st1')]);
    const result = await ctrl.eliminatePlayerManual('does-not-exist');
    expect(result).toEqual({ success: false, reason: 'Player not found' });
  });

  test('returns failure when player already eliminated (stack=0)', async () => {
    const player = makePlayer('s1', 'st1', 0); // stack already 0
    const ctrl = makeCtrl('t4', [player]);
    const result = await ctrl.eliminatePlayerManual('st1');
    expect(result).toEqual({ success: false, reason: 'Player already eliminated' });
  });
});

// ─── setHandVisibility ────────────────────────────────────────────────────────

describe('TournamentController — setHandVisibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('toggling manager visibility emits tournament:hand_visibility_changed', () => {
    const ctrl = makeCtrl('t5');
    ctrl.setHandVisibility('manager', false);
    expect(mockIoEmit).toHaveBeenCalledWith('tournament:hand_visibility_changed', {
      managerHandVisible:   false,
      spectatorHandVisible: false, // default
    });
  });

  test('toggling spectator visibility emits tournament:hand_visibility_changed', () => {
    const ctrl = makeCtrl('t6');
    ctrl.setHandVisibility('spectator', true);
    expect(mockIoEmit).toHaveBeenCalledWith('tournament:hand_visibility_changed', {
      managerHandVisible:   true, // default
      spectatorHandVisible: true,
    });
  });

  test('unknown type is a no-op (no emit)', () => {
    const ctrl = makeCtrl('t7');
    ctrl.setHandVisibility('invalid', true);
    expect(mockIoEmit).not.toHaveBeenCalled();
  });
});

// ─── start() ─────────────────────────────────────────────────────────────────

describe('TournamentController — start()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
  });

  test('routes through _startHand() instead of calling gm.startGame() directly', async () => {
    const mockGm = {
      state: { players: [], pot: 0, phase: 'waiting', dealer_seat: 0, replay_mode: { branched: false } },
      startGame: jest.fn(),
      setBlindLevels: jest.fn(),
    };
    const ctrl = new TournamentController('t1', mockGm, mockIo);

    // Spy on _startHand — it should be called instead of gm.startGame directly
    const startHandSpy = jest.spyOn(ctrl, '_startHand').mockResolvedValue(undefined);

    await ctrl.start({
      blind_schedule: [{ level: 1, small_blind: 50, big_blind: 100, duration_minutes: 15 }],
      starting_stack: 10000,
      late_reg_minutes: 0,
      addon_allowed: false,
      addon_deadline_level: 0,
    });

    expect(startHandSpy).toHaveBeenCalled();
    expect(mockGm.startGame).not.toHaveBeenCalled();
  });
});

// ─── setIcmOverlay ────────────────────────────────────────────────────────────

describe('TournamentController — setIcmOverlay', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('emits tournament:icm_overlay_changed with enabled=true', () => {
    const ctrl = makeCtrl('t8');
    ctrl.setIcmOverlay(true);
    expect(mockIoEmit).toHaveBeenCalledWith('tournament:icm_overlay_changed', { enabled: true });
    expect(ctrl.icmOverlayEnabled).toBe(true);
  });

  test('emits tournament:icm_overlay_changed with enabled=false', () => {
    const ctrl = makeCtrl('t9');
    ctrl.setIcmOverlay(false);
    expect(mockIoEmit).toHaveBeenCalledWith('tournament:icm_overlay_changed', { enabled: false });
    expect(ctrl.icmOverlayEnabled).toBe(false);
  });
});
