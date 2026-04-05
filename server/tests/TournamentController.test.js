'use strict';

/**
 * TournamentController unit tests — no real timers, no real DB.
 *
 * Mocks:
 *   - TournamentRepository (recordElimination, getStandings)
 *   - TableRepository      (closeTable)
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../db/repositories/TournamentRepository', () => ({
  TournamentRepository: {
    recordElimination: jest.fn().mockResolvedValue(undefined),
    getStandings:      jest.fn().mockResolvedValue([]),
    createConfig:      jest.fn().mockResolvedValue('cfg-id'),
    getConfig:         jest.fn().mockResolvedValue(null),
  },
}));

jest.mock('../db/repositories/TableRepository', () => ({
  TableRepository: {
    closeTable:              jest.fn().mockResolvedValue(undefined),
    createTable:             jest.fn().mockResolvedValue(undefined),
    getTable:                jest.fn().mockResolvedValue(null),
    listTables:              jest.fn().mockResolvedValue([]),
    updateTable:             jest.fn().mockResolvedValue(undefined),
    activateScheduledTables: jest.fn().mockResolvedValue([]),
  },
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

const { TournamentController }  = require('../game/controllers/TournamentController');
const { TournamentRepository }  = require('../db/repositories/TournamentRepository');
const { TableRepository }       = require('../db/repositories/TableRepository');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeIo() {
  const room = { emit: jest.fn() };
  return { to: jest.fn().mockReturnValue(room), _room: room };
}

function makeGm(players = []) {
  return {
    getState:       jest.fn().mockReturnValue({ seated: players }),
    startGame:      jest.fn().mockResolvedValue(undefined),
    setBlindLevels: jest.fn(),
    setPlayerInHand: jest.fn(),
  };
}

/** A minimal 3-level blind schedule */
const BLIND_SCHEDULE = [
  { level: 1, sb: 25,  bb: 50,  ante: 0,  duration_minutes: 20 },
  { level: 2, sb: 50,  bb: 100, ante: 10, duration_minutes: 20 },
  { level: 3, sb: 100, bb: 200, ante: 25, duration_minutes: 20 },
];

function makeConfig(schedule = BLIND_SCHEDULE) {
  return { blind_schedule: schedule, starting_stack: 5000 };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});

afterEach(() => {
  jest.useRealTimers();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('TournamentController', () => {

  // ── getMode ───────────────────────────────────────────────────────────────

  test('getMode() returns "tournament"', () => {
    const io  = makeIo();
    const gm  = makeGm();
    const ctrl = new TournamentController('tbl-1', gm, io);
    expect(ctrl.getMode()).toBe('tournament');
  });

  // ── start() ───────────────────────────────────────────────────────────────

  describe('start()', () => {
    test('calls setBlindLevels with correct sb/bb from blind schedule', async () => {
      const io   = makeIo();
      const gm   = makeGm();
      const ctrl = new TournamentController('tbl-1', gm, io);
      const cfg  = makeConfig();

      await ctrl.start(cfg);

      expect(gm.setBlindLevels).toHaveBeenCalledWith(
        BLIND_SCHEDULE[0].sb,
        BLIND_SCHEDULE[0].bb
      );
    });

    test('calls gm.startGame()', async () => {
      const io   = makeIo();
      const gm   = makeGm();
      const ctrl = new TournamentController('tbl-1', gm, io);

      await ctrl.start(makeConfig());

      expect(gm.startGame).toHaveBeenCalledTimes(1);
    });
  });

  // ── _advanceLevel() ───────────────────────────────────────────────────────

  describe('_advanceLevel()', () => {
    test('calls setBlindLevels with next level values', async () => {
      const io   = makeIo();
      const gm   = makeGm();
      const ctrl = new TournamentController('tbl-1', gm, io);
      await ctrl.start(makeConfig());

      jest.clearAllMocks(); // clear the start() calls
      // Re-wire gm mocks after clearAllMocks
      gm.setBlindLevels.mockClear();
      io.to.mockReturnValue(io._room);

      await ctrl._advanceLevel();

      expect(gm.setBlindLevels).toHaveBeenCalledWith(
        BLIND_SCHEDULE[1].sb,
        BLIND_SCHEDULE[1].bb
      );
    });

    test('emits tournament:blind_up', async () => {
      const io   = makeIo();
      const gm   = makeGm();
      const ctrl = new TournamentController('tbl-1', gm, io);
      await ctrl.start(makeConfig());

      // Reset emit tracking after start
      io._room.emit.mockClear();

      await ctrl._advanceLevel();

      expect(io.to).toHaveBeenCalledWith('tbl-1');
      expect(io._room.emit).toHaveBeenCalledWith('tournament:blind_up', expect.objectContaining({
        level: BLIND_SCHEDULE[1].level,
        sb:    BLIND_SCHEDULE[1].sb,
        bb:    BLIND_SCHEDULE[1].bb,
      }));
    });
  });

  // ── _eliminatePlayer() ────────────────────────────────────────────────────

  describe('_eliminatePlayer()', () => {
    test('calls TournamentRepository.recordElimination', async () => {
      const io   = makeIo();
      const gm   = makeGm([{ id: 'p2', stack: 1000 }]); // only p2 still active
      const ctrl = new TournamentController('tbl-1', gm, io);

      await ctrl._eliminatePlayer('p1', 0);

      expect(TournamentRepository.recordElimination).toHaveBeenCalledWith(
        expect.objectContaining({
          tableId:  'tbl-1',
          playerId: 'p1',
        })
      );
    });

    test('emits tournament:elimination', async () => {
      const io   = makeIo();
      const gm   = makeGm([{ id: 'p2', stack: 1000 }]);
      const ctrl = new TournamentController('tbl-1', gm, io);

      await ctrl._eliminatePlayer('p1', 0);

      expect(io.to).toHaveBeenCalledWith('tbl-1');
      expect(io._room.emit).toHaveBeenCalledWith('tournament:elimination', expect.objectContaining({
        playerId: 'p1',
      }));
    });
  });

  // ── _endTournament() ──────────────────────────────────────────────────────

  describe('_endTournament()', () => {
    test('calls TableRepository.closeTable', async () => {
      const io   = makeIo();
      const gm   = makeGm([]);
      const ctrl = new TournamentController('tbl-1', gm, io);

      await ctrl._endTournament(null);

      expect(TableRepository.closeTable).toHaveBeenCalledWith('tbl-1');
    });

    test('emits tournament:ended with winnerId', async () => {
      const io       = makeIo();
      const gm       = makeGm([]);
      const ctrl     = new TournamentController('tbl-1', gm, io);
      const winnerId = 'winner-uuid';

      await ctrl._endTournament(winnerId);

      expect(io.to).toHaveBeenCalledWith('tbl-1');
      expect(io._room.emit).toHaveBeenCalledWith('tournament:ended', expect.objectContaining({
        winnerId,
      }));
    });

    test('emits tournament:ended with winnerName from standings', async () => {
      const { TournamentRepository } = require('../db/repositories/TournamentRepository');
      TournamentRepository.getStandings.mockResolvedValueOnce([
        {
          player_id: 'winner-uuid',
          finish_position: 1,
          player_profiles: { display_name: 'Alice' },
        },
      ]);

      const io       = makeIo();
      const gm       = makeGm([]);
      const ctrl     = new TournamentController('tbl-1', gm, io);

      await ctrl._endTournament('winner-uuid');

      expect(io._room.emit).toHaveBeenCalledWith('tournament:ended', expect.objectContaining({
        winnerId:   'winner-uuid',
        winnerName: 'Alice',
      }));
    });

    test('emits winnerName as Unknown when standings are empty', async () => {
      const { TournamentRepository } = require('../db/repositories/TournamentRepository');
      TournamentRepository.getStandings.mockResolvedValueOnce([]);

      const io   = makeIo();
      const gm   = makeGm([]);
      const ctrl = new TournamentController('tbl-1', gm, io);

      await ctrl._endTournament('missing-uuid');

      expect(io._room.emit).toHaveBeenCalledWith('tournament:ended', expect.objectContaining({
        winnerName: 'Unknown',
      }));
    });
  });

  // ── destroy() ─────────────────────────────────────────────────────────────

  describe('destroy()', () => {
    test('clears the levelTimer so it does not fire', async () => {
      const io   = makeIo();
      const gm   = makeGm();
      const ctrl = new TournamentController('tbl-1', gm, io);
      await ctrl.start(makeConfig());

      // levelTimer is set after start
      expect(ctrl.levelTimer).not.toBeNull();

      ctrl.destroy();

      // After destroy, levelTimer should be null
      expect(ctrl.levelTimer).toBeNull();

      // Advance time past the full level duration — _advanceLevel should NOT fire
      gm.setBlindLevels.mockClear();
      jest.advanceTimersByTime(25 * 60_000);
      await Promise.resolve();

      // setBlindLevels was cleared and should not have been called by the timer
      expect(gm.setBlindLevels).not.toHaveBeenCalled();
    });
  });
});
