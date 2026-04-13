'use strict';

jest.mock('../../ScenarioDealer', () => {
  const armIfActive      = jest.fn().mockResolvedValue({ armed: false });
  const completeIfActive = jest.fn().mockResolvedValue({ restored: false });
  return { ScenarioDealer: jest.fn().mockImplementation(() => ({ armIfActive, completeIfActive })) };
});
const { CoachedController } = require('../CoachedController');

beforeEach(() => jest.clearAllMocks());

describe('CoachedController scenario hooks', () => {
  it('exposes a dealer instance', () => {
    const io = { to: () => ({ emit: () => {} }) };
    const ctrl = new CoachedController('t1', {}, io);
    expect(ctrl.dealer).toBeDefined();
  });

  it('onHandComplete calls dealer.completeIfActive before broadcasting', async () => {
    const emit = jest.fn();
    const io = { to: jest.fn().mockReturnValue({ emit }) };
    const ctrl = new CoachedController('t1', { state: { players: [] } }, io);
    await ctrl.onHandComplete({ winner: 'u1' });
    expect(ctrl.dealer.completeIfActive).toHaveBeenCalledWith('t1', ctrl.gm);
    expect(emit).toHaveBeenCalledWith('hand_complete', { winner: 'u1' });
  });
});
