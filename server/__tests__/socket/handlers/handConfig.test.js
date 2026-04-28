'use strict';

/**
 * handConfig.test.js — Phase 2 routing test.
 *
 * Verifies that update_hand_config dispatches to gm.updateHandConfig() when
 * the table is in an explicit config_phase (between hands), and to
 * gm.queueHandConfig() otherwise (mid-hand). The queued path emits a
 * 'config_queued' broadcast type so the v3 sidebar can surface a "Queued for
 * next hand" badge.
 */

const registerHandConfig = require('../../../socket/handlers/handConfig');

function buildCtx(gmState) {
  const tables = new Map();
  const gm = {
    state: gmState,
    updateHandConfig: jest.fn().mockReturnValue({ success: true }),
    queueHandConfig: jest.fn().mockReturnValue({ success: true }),
    openConfigPhase: jest.fn().mockReturnValue({ success: true }),
    updateHandTags: jest.fn(),
  };
  tables.set('t1', gm);
  return {
    tables,
    broadcastState: jest.fn(),
    sendError: jest.fn(),
    sendSyncError: jest.fn(),
    requireCoach: jest.fn().mockReturnValue(false),
    HandLogger: { getHandDetail: jest.fn() },
    loadScenarioIntoConfig: jest.fn(),
    _gm: gm,
  };
}

function buildSocket() {
  return {
    id: 'coach-1',
    data: { tableId: 't1', isCoach: true },
    on: jest.fn(),
    emit: jest.fn(),
  };
}

function getHandler(socket, eventName) {
  const call = socket.on.mock.calls.find(([name]) => name === eventName);
  return call?.[1];
}

describe('update_hand_config — active vs queued routing', () => {
  beforeEach(() => jest.clearAllMocks());

  test('routes to updateHandConfig when config_phase is open (between hands)', () => {
    const ctx = buildCtx({ config_phase: true, phase: 'waiting' });
    const socket = buildSocket();
    registerHandConfig(socket, ctx);
    const handler = getHandler(socket, 'update_hand_config');
    const payload = { mode: 'hybrid', hole_cards: { p1: ['As', 'Kd'] } };

    handler({ config: payload });

    expect(ctx._gm.updateHandConfig).toHaveBeenCalledWith(payload);
    expect(ctx._gm.queueHandConfig).not.toHaveBeenCalled();
    expect(ctx.broadcastState).toHaveBeenCalledWith('t1', expect.objectContaining({ type: 'config_updated' }));
  });

  test('routes to queueHandConfig mid-hand (config_phase=false) and broadcasts config_queued', () => {
    const ctx = buildCtx({ config_phase: false, phase: 'flop' });
    const socket = buildSocket();
    registerHandConfig(socket, ctx);
    const handler = getHandler(socket, 'update_hand_config');
    const payload = { mode: 'hybrid', hole_cards: { p1: ['As', 'Kd'] } };

    handler({ config: payload });

    expect(ctx._gm.queueHandConfig).toHaveBeenCalledWith(payload);
    expect(ctx._gm.updateHandConfig).not.toHaveBeenCalled();
    expect(ctx.broadcastState).toHaveBeenCalledWith('t1', expect.objectContaining({ type: 'config_queued' }));
  });

  test('forwards validation errors from queueHandConfig to sendError', () => {
    const ctx = buildCtx({ config_phase: false, phase: 'turn' });
    ctx._gm.queueHandConfig.mockReturnValue({ error: 'config.mode must be one of: rng, manual, hybrid' });
    const socket = buildSocket();
    registerHandConfig(socket, ctx);
    const handler = getHandler(socket, 'update_hand_config');

    handler({ config: { mode: 'invalid' } });

    expect(ctx.sendError).toHaveBeenCalledWith(socket, expect.stringContaining('mode must be one of'));
    expect(ctx.broadcastState).not.toHaveBeenCalled();
  });

  test('non-coach is gated by requireCoach', () => {
    const ctx = buildCtx({ config_phase: false, phase: 'turn' });
    ctx.requireCoach = jest.fn().mockReturnValue(true);
    const socket = buildSocket();
    registerHandConfig(socket, ctx);
    const handler = getHandler(socket, 'update_hand_config');

    handler({ config: { mode: 'hybrid' } });

    expect(ctx._gm.queueHandConfig).not.toHaveBeenCalled();
    expect(ctx._gm.updateHandConfig).not.toHaveBeenCalled();
  });
});
