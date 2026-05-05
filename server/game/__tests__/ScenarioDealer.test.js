'use strict';

jest.mock('../../services/PlaylistExecutionService');
const svc = require('../../services/PlaylistExecutionService');
const { ScenarioDealer } = require('../ScenarioDealer');

function makeGm({ seats }) {
  return {
    state: {
      players: seats.map(s => ({ id: s.id, seat: s.seat, is_coach: false, disconnected: false, stack: s.stack ?? 100 })),
      dealer_seat: 0,
    },
    adjustStack: jest.fn(),
    openConfigPhase: jest.fn().mockReturnValue({}),
    updateHandConfig: jest.fn().mockReturnValue({}),
  };
}

const io = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) };

beforeEach(() => {
  jest.resetAllMocks();
  io.to = jest.fn().mockReturnValue({ emit: jest.fn() });
});

describe('ScenarioDealer.armIfActive', () => {
  it('no-ops when no active session', async () => {
    svc.getStatus = jest.fn().mockResolvedValue(null);
    const dealer = new ScenarioDealer(io);
    const gm = makeGm({ seats: [{ id: 'u1', seat: 1 }, { id: 'u2', seat: 5 }, { id: 'u3', seat: 7 }] });
    const result = await dealer.armIfActive('t1', gm);
    expect(result.armed).toBe(false);
    expect(gm.updateHandConfig).not.toHaveBeenCalled();
  });

  it('arms a scenario when counts match and hero is seated', async () => {
    svc.getStatus = jest.fn().mockResolvedValue({
      status: 'active', hero_mode: 'sticky', hero_player_id: 'u2',
    });
    svc.getNextScenario = jest.fn().mockResolvedValue({
      id: 'sc1',
      hero_seat: 4, dealer_seat: 3,
      seat_configs: [
        { seat: 3, cards: ['2c', '2d'], stack: 80 },
        { seat: 4, cards: ['As', 'Kd'], stack: 120 },
        { seat: 5, cards: ['9h', '9s'], stack: 100 },
      ],
    });
    const dealer = new ScenarioDealer(io);
    const gm = makeGm({ seats: [{ id: 'u1', seat: 1 }, { id: 'u2', seat: 5 }, { id: 'u3', seat: 7 }] });
    const result = await dealer.armIfActive('t1', gm);
    expect(result.armed).toBe(true);
    expect(gm.openConfigPhase).toHaveBeenCalledTimes(1);
    expect(gm.updateHandConfig).toHaveBeenCalledWith(expect.objectContaining({ mode: 'hybrid' }));
    expect(gm.adjustStack).toHaveBeenCalledWith('u2', 120);
    expect(gm.state.dealer_seat).toBe(1);
  });

  it('emits scenario:skipped and advances when count does not match, then retries', async () => {
    svc.getStatus = jest.fn().mockResolvedValue({ status: 'active', hero_mode: 'sticky', hero_player_id: 'u2' });
    svc.getNextScenario = jest.fn()
      .mockResolvedValueOnce({
        id: 'sc_bad',
        seat_configs: [{ seat: 0 }, { seat: 1 }, { seat: 2 }, { seat: 3 }],
        hero_seat: 0, dealer_seat: 0,
      })
      .mockResolvedValueOnce({
        id: 'sc_ok',
        seat_configs: [
          { seat: 0, cards: ['Ah', 'Ac'], stack: 100 },
          { seat: 1, cards: ['Kh', 'Kc'], stack: 100 },
          { seat: 2, cards: ['Qh', 'Qc'], stack: 100 },
        ],
        hero_seat: 0, dealer_seat: 0,
      });
    svc.advance = jest.fn().mockResolvedValue({ completed: false });
    const dealer = new ScenarioDealer(io);
    const gm = makeGm({ seats: [{ id: 'u1', seat: 1 }, { id: 'u2', seat: 5 }, { id: 'u3', seat: 7 }] });
    const result = await dealer.armIfActive('t1', gm);
    expect(svc.advance).toHaveBeenCalledTimes(1);
    expect(result.armed).toBe(true);
    expect(result.scenarioId).toBe('sc_ok');
  });

  it('emits scenario:exhausted when no eligible scenarios remain', async () => {
    svc.getStatus = jest.fn().mockResolvedValue({ status: 'active', hero_mode: 'sticky', hero_player_id: 'u2' });
    svc.getNextScenario = jest.fn().mockResolvedValue(null);
    const dealer = new ScenarioDealer(io);
    const gm = makeGm({ seats: [{ id: 'u1', seat: 1 }, { id: 'u2', seat: 5 }, { id: 'u3', seat: 7 }] });
    const result = await dealer.armIfActive('t1', gm);
    expect(result.armed).toBe(false);
    expect(result.exhausted).toBe(true);
  });

  it('fails with hero_absent error when sticky hero is not seated', async () => {
    svc.getStatus = jest.fn().mockResolvedValue({ status: 'active', hero_mode: 'sticky', hero_player_id: 'ghost' });
    svc.getNextScenario = jest.fn().mockResolvedValue({
      id: 'sc1', hero_seat: 0, dealer_seat: 0,
      seat_configs: [{ seat: 0 }, { seat: 1 }, { seat: 2 }],
    });
    const dealer = new ScenarioDealer(io);
    const gm = makeGm({ seats: [{ id: 'u1', seat: 1 }, { id: 'u2', seat: 5 }, { id: 'u3', seat: 7 }] });
    const result = await dealer.armIfActive('t1', gm);
    expect(result.armed).toBe(false);
    expect(result.error).toBe('hero_absent');
  });
});

describe('ScenarioDealer.completeIfActive', () => {
  it('restores pre-hand stacks and calls service.advance', async () => {
    svc.getStatus = jest.fn().mockResolvedValue({ status: 'active', hero_mode: 'sticky', hero_player_id: 'u2' });
    svc.getNextScenario = jest.fn().mockResolvedValue({
      id: 'sc1', hero_seat: 4, dealer_seat: 3,
      seat_configs: [
        { seat: 3, cards: ['2c', '2d'], stack: 80 },
        { seat: 4, cards: ['As', 'Kd'], stack: 120 },
        { seat: 5, cards: ['9h', '9s'], stack: 100 },
      ],
    });
    svc.advance = jest.fn().mockResolvedValue({ completed: false });

    const dealer = new ScenarioDealer(io);
    const gm = makeGm({ seats: [
      { id: 'u1', seat: 1, stack: 500 },
      { id: 'u2', seat: 5, stack: 500 },
      { id: 'u3', seat: 7, stack: 500 },
    ]});
    await dealer.armIfActive('t1', gm);
    gm.adjustStack.mockClear();

    await dealer.completeIfActive('t1', gm);
    expect(gm.adjustStack).toHaveBeenCalledWith('u1', 500);
    expect(gm.adjustStack).toHaveBeenCalledWith('u2', 500);
    expect(gm.adjustStack).toHaveBeenCalledWith('u3', 500);
    expect(svc.advance).toHaveBeenCalledWith('t1');
  });
});
