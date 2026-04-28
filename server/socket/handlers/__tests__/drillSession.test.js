'use strict';

jest.mock('../../../services/PlaylistExecutionService');
const svc = require('../../../services/PlaylistExecutionService');
const registerDrillSession = require('../drillSession');

function makeSocket({ isCoach = true, tableId = 't1' } = {}) {
  const handlers = {};
  const on = (ev, fn) => { handlers[ev] = fn; };
  const emit = jest.fn();
  return {
    on, emit, data: { isCoach, tableId, userId: 'c1' }, _handlers: handlers,
  };
}

const ctx = {
  io: { to: jest.fn().mockReturnValue({ emit: jest.fn() }) },
  requireCoach: (socket) => {
    if (!socket.data.isCoach) { socket.emit('scenario:error', { code: 'forbidden' }); return true; }
    return false;
  },
};

beforeEach(() => {
  jest.resetAllMocks();
  ctx.io.to = jest.fn().mockReturnValue({ emit: jest.fn() });
});

describe('scenario:set_hero', () => {
  it('rejects non-coach', async () => {
    const socket = makeSocket({ isCoach: false });
    registerDrillSession(socket, ctx);
    await socket._handlers['scenario:set_hero']({ tableId: 't1', playerId: 'u2' });
    expect(socket.emit).toHaveBeenCalledWith('scenario:error', { code: 'forbidden' });
  });
  it('calls updateHeroPlayer on the service and broadcasts scenario:progress', async () => {
    svc.updateHeroPlayer = jest.fn().mockResolvedValue({ id: 'ds1', hero_player_id: 'u2' });
    const socket = makeSocket();
    registerDrillSession(socket, ctx);
    await socket._handlers['scenario:set_hero']({ tableId: 't1', playerId: 'u2' });
    expect(svc.updateHeroPlayer).toHaveBeenCalledWith('t1', 'u2');
    expect(ctx.io.to).toHaveBeenCalledWith('t1');
  });
});

describe('scenario:set_mode', () => {
  it('forwards heroMode and autoAdvance to the service', async () => {
    svc.updateMode = jest.fn().mockResolvedValue({ id: 'ds1' });
    const socket = makeSocket();
    registerDrillSession(socket, ctx);
    await socket._handlers['scenario:set_mode']({ tableId: 't1', heroMode: 'per_hand', autoAdvance: true });
    expect(svc.updateMode).toHaveBeenCalledWith('t1', { heroMode: 'per_hand', autoAdvance: true });
  });
});

describe('scenario:request_resume', () => {
  it('calls resume on the service when mode=resume', async () => {
    svc.resume = jest.fn().mockResolvedValue({ id: 'ds1', status: 'active' });
    const socket = makeSocket();
    registerDrillSession(socket, ctx);
    await socket._handlers['scenario:request_resume']({ tableId: 't1', playlistId: 'p1', mode: 'resume' });
    expect(svc.resume).toHaveBeenCalledWith('t1');
  });
});
