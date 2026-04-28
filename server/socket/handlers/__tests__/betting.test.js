'use strict';

/**
 * Unit tests for server/socket/handlers/betting.js
 *
 * Strategy: register the handler with a mock socket, invoke the place_bet handler
 * directly, and assert routing behaviour. SharedState.getController is mocked to
 * control which controller (and mode) is returned.
 */

// Mock SharedState so we can inject any controller without a real server
jest.mock('../../../state/SharedState', () => ({
  getController: jest.fn(),
}));
const SharedState = require('../../../state/SharedState');

const registerBetting = require('../betting');

// ── helpers ───────────────────────────────────────────────────────────────────

function makeSocket({ tableId = 'table1', stableId = 'player-uuid', name = 'Alice', isCoach = false } = {}) {
  const emitted = [];
  const handlers = {};
  return {
    id: stableId,
    data: { tableId, stableId, name, isCoach },
    emit: (event, payload) => emitted.push({ event, payload }),
    on: (event, handler) => { handlers[event] = handler; },
    _emitted: emitted,
    _handlers: handlers,
  };
}

/**
 * Make a minimal GameManager stub that produces a showdown phase after placeBet.
 */
function makeGm({ phaseAfterBet = 'showdown', showdownResult = { winners: [] } } = {}) {
  return {
    state: {
      phase: 'river',
      pot: 100,
      players: [{ id: 'player-uuid', seat: 0, stack: 500, name: 'Alice' }],
      dealer_seat: 0,
      replay_mode: { branched: false },
    },
    placeBet: jest.fn().mockReturnValue({}),           // no error
    getPublicState: jest.fn().mockReturnValue({
      phase: phaseAfterBet,
      showdown_result: showdownResult,
    }),
  };
}

function makeCtx({ gm, tableId = 'table1' } = {}) {
  const tables = new Map();
  tables.set(tableId, gm);
  return {
    tables,
    activeHands: new Map(),                             // no hand logging needed
    stableIdMap: new Map(),
    actionTimers: new Map(),
    io: { to: jest.fn().mockReturnValue({ emit: jest.fn() }) },
    broadcastState: jest.fn(),
    sendError: jest.fn(),
    startActionTimer: jest.fn(),
    clearActionTimer: jest.fn(),
    emitEquityUpdate: jest.fn(),
    HandLogger: { recordAction: jest.fn().mockResolvedValue(undefined) },
    log: { error: jest.fn() },
    getPosition: jest.fn().mockReturnValue('BTN'),
  };
}

function setup(socketOpts = {}, gmOpts = {}, ctxOpts = {}) {
  const socket = makeSocket(socketOpts);
  const gm     = makeGm(gmOpts);
  const ctx    = makeCtx({ gm, ...ctxOpts });
  registerBetting(socket, ctx);
  return { socket, ctx, gm };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('betting handler — showdown completion routing', () => {
  afterEach(() => jest.clearAllMocks());

  test('calls _completeHand for uncoached_cash mode', () => {
    const ctrl = {
      getMode: jest.fn().mockReturnValue('uncoached_cash'),
      _completeHand: jest.fn().mockResolvedValue(undefined),
    };
    SharedState.getController.mockReturnValue(ctrl);

    const { socket } = setup();
    socket._handlers['place_bet']({ action: 'call' });

    expect(ctrl._completeHand).toHaveBeenCalledTimes(1);
  });

  test('calls _completeHand for tournament mode (C-15 fix)', () => {
    const ctrl = {
      getMode: jest.fn().mockReturnValue('tournament'),
      _completeHand: jest.fn().mockResolvedValue(undefined),
    };
    SharedState.getController.mockReturnValue(ctrl);

    const { socket } = setup();
    socket._handlers['place_bet']({ action: 'call' });

    expect(ctrl._completeHand).toHaveBeenCalledTimes(1);
  });

  test('does NOT call _completeHand for coached_cash mode', () => {
    const ctrl = {
      getMode: jest.fn().mockReturnValue('coached_cash'),
      _completeHand: jest.fn().mockResolvedValue(undefined),
    };
    SharedState.getController.mockReturnValue(ctrl);

    const { socket } = setup();
    socket._handlers['place_bet']({ action: 'call' });

    expect(ctrl._completeHand).not.toHaveBeenCalled();
  });

  test('does not throw when no controller is registered for the table', () => {
    SharedState.getController.mockReturnValue(null);

    const { socket } = setup();
    expect(() => socket._handlers['place_bet']({ action: 'fold' })).not.toThrow();
  });

  test('_completeHand rejection is silently swallowed', async () => {
    const ctrl = {
      getMode: jest.fn().mockReturnValue('tournament'),
      _completeHand: jest.fn().mockRejectedValue(new Error('boom')),
    };
    SharedState.getController.mockReturnValue(ctrl);

    const { socket } = setup();
    socket._handlers['place_bet']({ action: 'call' });

    // allow microtask queue to drain so the rejection is handled
    await Promise.resolve();
    expect(ctrl._completeHand).toHaveBeenCalledTimes(1);
  });

  test('does not call _completeHand when phase is not showdown', () => {
    const ctrl = {
      getMode: jest.fn().mockReturnValue('tournament'),
      _completeHand: jest.fn().mockResolvedValue(undefined),
    };
    SharedState.getController.mockReturnValue(ctrl);

    const { socket } = setup({}, { phaseAfterBet: 'river', showdownResult: null });
    socket._handlers['place_bet']({ action: 'raise', amount: 50 });

    expect(ctrl._completeHand).not.toHaveBeenCalled();
  });
});
