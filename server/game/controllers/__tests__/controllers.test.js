'use strict';

/**
 * Unit tests for CoachedController, AutoController, TournamentController,
 * and the TableController base class.
 */

// ─── Repository mocks (needed by TournamentController) ───────────────────────

jest.mock('../../../db/repositories/TournamentRepository', () => ({
  TournamentRepository: {
    recordElimination: jest.fn().mockResolvedValue(undefined),
    getStandings:      jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('../../../db/repositories/TableRepository', () => ({
  TableRepository: {
    closeTable: jest.fn().mockResolvedValue(undefined),
  },
}));

// ─── AutoController lazy-require mocks ────────────────────────────────────────

jest.mock('../../../state/SharedState', () => ({
  tables:      new Map(),
  activeHands: new Map(),
  stableIdMap: new Map(),
}));

jest.mock('../../../db/HandLoggerSupabase', () => ({
  startHand: jest.fn().mockResolvedValue(undefined),
  endHand:   jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../game/AnalyzerService', () => ({
  analyzeAndTagHand: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../logs/logger', () => ({
  error: jest.fn(),
  info:  jest.fn(),
  debug: jest.fn(),
}));

jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

const { TournamentRepository } = require('../../../db/repositories/TournamentRepository');
const { TableRepository }      = require('../../../db/repositories/TableRepository');

const { CoachedController }    = require('../CoachedController');
const { AutoController }       = require('../AutoController');
const { TournamentController } = require('../TournamentController');
const { TableController }      = require('../TableController');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeIo() {
  const room = { emit: jest.fn() };
  return { to: jest.fn().mockReturnValue(room), _room: room };
}

function makePlayer(i, overrides = {}) {
  return { id: `player-${i}`, name: `P${i}`, stack: 1000, in_hand: true, seat: i - 1, is_coach: false, ...overrides };
}

function makeGm(seatedCount = 2, playerOverrides = []) {
  const players = Array.from({ length: seatedCount }, (_, i) => makePlayer(i + 1, playerOverrides[i] ?? {}));
  const state = { players, seated: players };
  return {
    state,
    getState: jest.fn().mockReturnValue(state),
    startGame: jest.fn().mockReturnValue({}),
    setPlayerInHand: jest.fn(),
    resetForNextHand: jest.fn(),
    adjustStack: jest.fn(),
    setBlinds: jest.fn().mockReturnValue({ success: true }),
    getPublicState: jest.fn().mockReturnValue({}),
  };
}

// ─── CoachedController ────────────────────────────────────────────────────────

describe('CoachedController', () => {
  let ctrl, io, gm;

  beforeEach(() => {
    jest.clearAllMocks();
    io = makeIo();
    gm = makeGm();
    ctrl = new CoachedController('table-1', gm, io);
  });

  test('getMode returns coached_cash', () => {
    expect(ctrl.getMode()).toBe('coached_cash');
  });

  test('onHandComplete emits hand_complete to the table room', async () => {
    const result = { handId: 'h1' };
    await ctrl.onHandComplete(result);

    expect(io.to).toHaveBeenCalledWith('table-1');
    expect(io._room.emit).toHaveBeenCalledWith('hand_complete', result);
  });

  test('onHandComplete does NOT call gm.startGame', async () => {
    await ctrl.onHandComplete({ handId: 'h2' });
    expect(gm.startGame).not.toHaveBeenCalled();
  });
});

// ─── AutoController ───────────────────────────────────────────────────────────

describe('AutoController', () => {
  let ctrl, io, gm;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    // Reset SharedState maps between tests
    const ss = require('../../../state/SharedState');
    ss.tables.clear();
    ss.activeHands.clear();
    ss.stableIdMap.clear();

    io = makeIo();
    gm = makeGm(2);
    ctrl = new AutoController('table-2', gm, io);
    // Spy on _startHand by default — full _startHand requires IO infrastructure
    // not available in unit tests. Individual tests override this spy as needed.
    jest.spyOn(ctrl, '_startHand').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  test('getMode returns uncoached_cash', () => {
    expect(ctrl.getMode()).toBe('uncoached_cash');
  });

  test('onHandComplete emits hand_complete to the table room', async () => {
    const result = { handId: 'h3' };
    await ctrl.onHandComplete(result);
    expect(io.to).toHaveBeenCalledWith('table-2');
    expect(io._room.emit).toHaveBeenCalledWith('hand_complete', result);
  });

  test('onHandComplete schedules _startHand after 2s when 2+ active players remain', async () => {
    await ctrl.onHandComplete({ handId: 'h4' });
    expect(ctrl._startHand).not.toHaveBeenCalled();

    jest.advanceTimersByTime(2000);
    await Promise.resolve();

    expect(ctrl._startHand).toHaveBeenCalledTimes(1);
  });

  test('onHandComplete does NOT call _startHand if active=false when timer fires', async () => {
    await ctrl.onHandComplete({ handId: 'h5' });
    ctrl.active = false;

    jest.advanceTimersByTime(2000);
    await Promise.resolve();

    expect(ctrl._startHand).not.toHaveBeenCalled();
  });

  test('onHandComplete does NOT call _startHand if fewer than 2 eligible players', async () => {
    gm.state.players = [makePlayer(1)];

    await ctrl.onHandComplete({ handId: 'h6' });

    jest.advanceTimersByTime(2000);
    await Promise.resolve();

    expect(ctrl._startHand).not.toHaveBeenCalled();
  });

  test('bust detection: sits out players with stack <= 0 and emits player_busted', async () => {
    const bustedSocket = { emit: jest.fn() };
    io.to = jest.fn((id) => id === 'player-1' ? bustedSocket : { emit: jest.fn() });

    gm.state.players = [
      makePlayer(1, { stack: 0 }),   // busted
      makePlayer(2, { stack: 500 }), // healthy
    ];

    await ctrl.onHandComplete({ handId: 'h-bust' });

    expect(gm.setPlayerInHand).toHaveBeenCalledWith('player-1', false);
    expect(bustedSocket.emit).toHaveBeenCalledWith('player_busted', expect.objectContaining({
      message: expect.any(String),
    }));
    // Healthy player should NOT be sat out
    expect(gm.setPlayerInHand).not.toHaveBeenCalledWith('player-2', false);
  });

  test('bust detection: coaches are never sat out even if stack is 0', async () => {
    gm.state.players = [
      makePlayer(1, { stack: 0, is_coach: true }),
      makePlayer(2, { stack: 500 }),
    ];

    await ctrl.onHandComplete({ handId: 'h-coach-bust' });

    expect(gm.setPlayerInHand).not.toHaveBeenCalled();
  });

  test('onPlayerJoin triggers _startHand when 2 eligible players seated', async () => {
    ctrl._handActive = false;
    await ctrl.onPlayerJoin('player-1');
    expect(ctrl._startHand).toHaveBeenCalledTimes(1);
  });

  test('onPlayerJoin does NOT trigger _startHand when hand is already active', async () => {
    ctrl._handActive = true;
    await ctrl.onPlayerJoin('player-1');
    expect(ctrl._startHand).not.toHaveBeenCalled();
  });

  test('onPlayerJoin does NOT trigger _startHand when fewer than 2 eligible players', async () => {
    gm.state.players = [makePlayer(1)];
    ctrl._handActive = false;
    await ctrl.onPlayerJoin('player-1');
    expect(ctrl._startHand).not.toHaveBeenCalled();
  });

  test('canPause returns false', () => {
    expect(ctrl.canPause()).toBe(false);
  });

  test('canUndo returns false', () => {
    expect(ctrl.canUndo()).toBe(false);
  });

  test('canManualCard returns false', () => {
    expect(ctrl.canManualCard()).toBe(false);
  });

  test('canReplay returns false', () => {
    expect(ctrl.canReplay()).toBe(false);
  });

  test('_completeHand logs error when analyzeAndTagHand rejects', async () => {
    jest.useRealTimers();
    const log = require('../../../logs/logger');
    const HandLogger = require('../../../db/HandLoggerSupabase');
    const AnalyzerService = require('../../../game/AnalyzerService');

    const ss = require('../../../state/SharedState');
    const handId = 'hand-err-test';
    ss.activeHands.set('table-2', { handId, sessionId: null });

    HandLogger.endHand.mockResolvedValueOnce(undefined);
    AnalyzerService.analyzeAndTagHand.mockRejectedValueOnce(new Error('DB write failed'));

    // Mock io.sockets.adapter.rooms for _broadcastState call
    io.sockets = {
      adapter: { rooms: new Map() },
      sockets: new Map(),
    };

    ctrl._handActive = true;

    await ctrl._completeHand();

    // Wait for the floating promise chain to settle
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(log.error).toHaveBeenCalledWith(
      'game',
      'hand_completion_failed',
      expect.stringContaining('AutoController'),
      expect.objectContaining({ handId })
    );

    jest.useFakeTimers();
  });
});

// ─── TournamentController ─────────────────────────────────────────────────────

describe('TournamentController', () => {
  let ctrl, io, gm;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    io = makeIo();
    gm = makeGm(2);
    ctrl = new TournamentController('table-3', gm, io);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  test('getMode returns tournament', () => {
    expect(ctrl.getMode()).toBe('tournament');
  });

  test('inherits AutoController behavior: emits hand_complete', async () => {
    const result = { handId: 'h7' };
    ctrl._startHand = jest.fn().mockResolvedValue(undefined);
    await ctrl.onHandComplete(result);
    expect(io.to).toHaveBeenCalledWith('table-3');
    expect(io._room.emit).toHaveBeenCalledWith('hand_complete', result);
  });

  test('inherits AutoController behavior: schedules _startHand after 2s', async () => {
    ctrl._startHand = jest.fn().mockResolvedValue(undefined);
    await ctrl.onHandComplete({ handId: 'h8' });
    expect(ctrl._startHand).not.toHaveBeenCalled();

    jest.advanceTimersByTime(2000);
    await Promise.resolve();

    expect(ctrl._startHand).toHaveBeenCalledTimes(1);
  });

  test('stores config passed to constructor', () => {
    const cfg = { maxPlayers: 9 };
    const tc = new TournamentController('table-cfg', gm, io, cfg);
    expect(tc.config).toEqual(cfg);
  });
});

// ─── TableController base ─────────────────────────────────────────────────────

describe('TableController', () => {
  let ctrl, io, gm;

  beforeEach(() => {
    io = makeIo();
    gm = makeGm();
    ctrl = new TableController('table-base', gm, io);
  });

  test('active is true on construction', () => {
    expect(ctrl.active).toBe(true);
  });

  test('destroy sets active to false', () => {
    ctrl.destroy();
    expect(ctrl.active).toBe(false);
  });

  test('onHandComplete throws not-implemented', async () => {
    await expect(ctrl.onHandComplete({})).rejects.toThrow(/onHandComplete not implemented/);
  });

  test('getMode throws not-implemented', () => {
    expect(() => ctrl.getMode()).toThrow(/getMode not implemented/);
  });
});

// ─── TournamentController — extended edge cases ───────────────────────────────

describe('TournamentController — _advanceLevel at final level', () => {
  let ctrl, io, gm;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    io = makeIo();
    gm = Object.assign(makeGm(2), {
      setBlindLevels: jest.fn(),
    });
    const cfg = {
      blind_schedule: [
        { level: 1, sb: 25, bb: 50, ante: 0, duration_minutes: 20 },
      ],
    };
    ctrl = new TournamentController('table-adv', gm, io, cfg);
    // Initialise the blindSchedule so _advanceLevel can be called
    ctrl.blindSchedule = ctrl.config
      ? new (require('../BlindSchedule').BlindSchedule)(ctrl.config.blind_schedule)
      : null;
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  test('_advanceLevel emits tournament:final_level when already at final level', async () => {
    // Single-level schedule — already at final, advance() returns null
    await ctrl._advanceLevel();

    expect(io.to).toHaveBeenCalledWith('table-adv');
    expect(io._room.emit).toHaveBeenCalledWith(
      'tournament:final_level',
      expect.objectContaining({ level: expect.any(Object) })
    );
  });

  test('_advanceLevel does NOT call setBlindLevels when already at final level', async () => {
    await ctrl._advanceLevel();
    expect(gm.setBlindLevels).not.toHaveBeenCalled();
  });
});

describe('TournamentController — destroy clears levelTimer', () => {
  let ctrl, io, gm;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    io = makeIo();
    gm = Object.assign(makeGm(2), { setBlindLevels: jest.fn() });
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  test('destroy() clears levelTimer — startGame is NOT called after timer fires', async () => {
    ctrl = new TournamentController('table-destroy', gm, io);
    // Manually set a timer so we can verify it gets cleared
    ctrl.levelTimer = setTimeout(() => gm.startGame(), 5000);

    ctrl.destroy();

    // Advance time — startGame must NOT be called
    jest.advanceTimersByTime(10_000);
    await Promise.resolve();

    expect(gm.startGame).not.toHaveBeenCalled();
    expect(ctrl.levelTimer).toBeNull();
    expect(ctrl.active).toBe(false);
  });
});

describe('TournamentController — onHandComplete ends tournament when all bust', () => {
  let ctrl, io, gm;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    TournamentRepository.recordElimination.mockResolvedValue(undefined);
    TournamentRepository.getStandings.mockResolvedValue([]);
    TableRepository.closeTable.mockResolvedValue(undefined);
    io = makeIo();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  test('calls _endTournament when all players have stack=0', async () => {
    // All players busted — stack <= 0
    const bustedPlayers = [
      { id: 'p1', stack: 0, in_hand: true },
      { id: 'p2', stack: 0, in_hand: true },
    ];
    gm = {
      getState:        jest.fn().mockReturnValue({ seated: bustedPlayers }),
      startGame:       jest.fn().mockResolvedValue(undefined),
      setPlayerInHand: jest.fn(),
    };
    ctrl = new TournamentController('table-bust', gm, io);

    await ctrl.onHandComplete({ handId: 'h-all-bust' });

    // _endTournament calls TableRepository.closeTable
    expect(TableRepository.closeTable).toHaveBeenCalledWith('table-bust');
    // Tournament ended — no new game started
    jest.advanceTimersByTime(5000);
    await Promise.resolve();
    expect(gm.startGame).not.toHaveBeenCalled();
  });

  test('calls _endTournament when exactly 1 player has stack > 0', async () => {
    const players = [
      { id: 'winner', stack: 5000, in_hand: true },
      { id: 'loser',  stack: 0,    in_hand: true },
    ];
    gm = {
      getState:        jest.fn().mockReturnValue({ seated: players }),
      startGame:       jest.fn().mockResolvedValue(undefined),
      setPlayerInHand: jest.fn(),
    };
    ctrl = new TournamentController('table-winner', gm, io);

    await ctrl.onHandComplete({ handId: 'h-one-left' });

    // winner should be recorded as position 1
    expect(TournamentRepository.recordElimination).toHaveBeenCalledWith(
      expect.objectContaining({ playerId: 'winner', position: 1 })
    );
    // Table should be closed
    expect(TableRepository.closeTable).toHaveBeenCalledWith('table-winner');
    // tournament:ended emitted with winnerId
    expect(io._room.emit).toHaveBeenCalledWith(
      'tournament:ended',
      expect.objectContaining({ winnerId: 'winner' })
    );
    // No new game started
    jest.advanceTimersByTime(5000);
    await Promise.resolve();
    expect(gm.startGame).not.toHaveBeenCalled();
  });
});
