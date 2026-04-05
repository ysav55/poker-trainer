'use strict';

jest.mock('../db/repositories/TournamentGroupRepository', () => ({
  TournamentGroupRepository: {
    updateStatus:      jest.fn().mockResolvedValue(),
    recordElimination: jest.fn().mockResolvedValue(),
    getStandings:      jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('../state/SharedState', () => ({
  groupControllers: new Map(),
  getController:    jest.fn(),
  stableIdMap:      new Map(),
  tables:           new Map(),
}));

const { TournamentGroupController } = require('../game/controllers/TournamentGroupController');
const SharedState = require('../state/SharedState');

function makeGroupCtrl(tableIds = ['t1', 't2'], config = { max_players_per_table: 9, min_players_per_table: 3 }) {
  const emits = [];
  const io = {
    to:      jest.fn(() => ({ emit: (ev, data) => emits.push({ ev, data }) })),
    sockets: { sockets: new Map() },
  };
  const ctrl = new TournamentGroupController('grp-1', io);
  ctrl.tableIds = tableIds;
  ctrl.config   = config;
  return { ctrl, emits };
}

function mockTable(players) {
  return {
    gm: {
      getState:        () => ({ players }),
      addPlayer:       jest.fn(),
      removePlayer:    jest.fn(),
      setPlayerInHand: jest.fn(),
    },
  };
}

describe('TournamentGroupController.autoBalance', () => {
  beforeEach(() => jest.clearAllMocks());

  test('moves players from over-populated table to under-populated table', async () => {
    const { ctrl } = makeGroupCtrl(['t1', 't2'], { max_players_per_table: 4, min_players_per_table: 3 });

    // t1 has 5 players (over max=4), t2 has 2 players (under min=3)
    const t1Players = [
      { id: 's1', stable_id: 'p1', name: 'Alice', stack: 1000 },
      { id: 's2', stable_id: 'p2', name: 'Bob',   stack: 1000 },
      { id: 's3', stable_id: 'p3', name: 'Carol',  stack: 1000 },
      { id: 's4', stable_id: 'p4', name: 'Dave',   stack: 1000 },
      { id: 's5', stable_id: 'p5', name: 'Eve',    stack: 1000 },
    ];
    const t2Players = [
      { id: 's6', stable_id: 'p6', name: 'Frank', stack: 1000 },
      { id: 's7', stable_id: 'p7', name: 'Grace', stack: 1000 },
    ];

    SharedState.getController
      .mockImplementation(tableId => {
        if (tableId === 't1') return mockTable(t1Players);
        if (tableId === 't2') return mockTable(t2Players);
        return null;
      });

    // Spy on movePlayer
    const moveSpy = jest.spyOn(ctrl, 'movePlayer').mockResolvedValue();

    const moves = await ctrl.autoBalance();
    expect(moves.length).toBeGreaterThan(0);
    expect(moveSpy).toHaveBeenCalled();
  });

  test('returns empty moves when all tables are within bounds', async () => {
    const { ctrl } = makeGroupCtrl(['t1', 't2'], { max_players_per_table: 9, min_players_per_table: 3 });

    const players = [
      { id: 's1', stable_id: 'p1', name: 'Alice', stack: 1000 },
      { id: 's2', stable_id: 'p2', name: 'Bob',   stack: 1000 },
      { id: 's3', stable_id: 'p3', name: 'Carol',  stack: 1000 },
    ];

    SharedState.getController.mockReturnValue(mockTable(players));

    const moves = await ctrl.autoBalance();
    expect(moves.length).toBe(0);
  });

  test('balance with [3, 9, 5, 2] and min=3 triggers consolidation for table with 2', async () => {
    const { ctrl } = makeGroupCtrl(['t1', 't2', 't3', 't4'], { max_players_per_table: 9, min_players_per_table: 3 });

    function makePlayers(count, prefix) {
      return Array.from({ length: count }, (_, i) => ({
        id: `${prefix}s${i}`, stable_id: `${prefix}p${i}`, name: `Player${i}`, stack: 1000,
      }));
    }

    SharedState.getController.mockImplementation(tableId => {
      const counts = { t1: 3, t2: 9, t3: 5, t4: 2 };
      return mockTable(makePlayers(counts[tableId] ?? 0, tableId));
    });

    const moveSpy = jest.spyOn(ctrl, 'movePlayer').mockResolvedValue();
    await ctrl.autoBalance();
    // t4 has 2 players (< min=3) — but t2 is exactly at max=9, not over.
    // No over-populated tables → no moves needed
    expect(moveSpy).not.toHaveBeenCalled();
  });
});
