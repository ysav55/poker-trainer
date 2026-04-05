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
  getController: jest.fn(),
}));

const { TournamentGroupController } = require('../game/controllers/TournamentGroupController');
const SharedState = require('../state/SharedState');

function makeIo() {
  const emitted = [];
  const to = jest.fn(() => ({
    emit: (event, data) => emitted.push({ event, data }),
  }));
  return { to, emitted };
}

function makeCtrl(groupId = 'grp-1') {
  const { to, emitted } = makeIo();
  const io = { to };
  const ctrl = new TournamentGroupController(groupId, io);
  return { ctrl, io, emitted };
}

describe('TournamentGroupController', () => {
  beforeEach(() => jest.clearAllMocks());

  test('getMode returns tournament_group', () => {
    const { ctrl } = makeCtrl();
    expect(ctrl.getMode()).toBe('tournament_group');
  });

  test('_countActivePlayers sums across tables', async () => {
    const { ctrl } = makeCtrl();
    ctrl.tableIds = ['t1', 't2'];
    SharedState.getController
      .mockReturnValueOnce({ gm: { getState: () => ({ players: [{ stack: 100 }, { stack: 0 }] }) } })
      .mockReturnValueOnce({ gm: { getState: () => ({ players: [{ stack: 200 }] }) } });
    const count = await ctrl._countActivePlayers();
    expect(count).toBe(2); // 1 active from t1 + 1 from t2
  });

  test('onPlayerEliminated records elimination and checks group end', async () => {
    const { ctrl } = makeCtrl();
    ctrl.tableIds = ['t1'];
    // 0 active players remaining → should trigger _endGroup
    SharedState.getController.mockReturnValue({
      gm: { getState: () => ({ players: [] }) },
    });
    const endSpy = jest.spyOn(ctrl, '_endGroup').mockResolvedValue();
    await ctrl.onPlayerEliminated('t1', 'player-1', 0);
    expect(endSpy).toHaveBeenCalled();
  });

  test('destroy clears level timer', () => {
    const { ctrl } = makeCtrl();
    ctrl.levelTimer = setTimeout(() => {}, 9999);
    ctrl.destroy();
    expect(ctrl.levelTimer).toBeNull();
  });
});
