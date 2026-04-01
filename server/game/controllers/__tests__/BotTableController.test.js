'use strict';

/**
 * BotTableController — unit tests
 *
 * socket.io-client is mocked so no network calls happen.
 * Tests verify:
 *   - Constructor reads difficulty/botCount from bot_config
 *   - getMode() returns 'bot_cash'
 *   - capability flags are all false
 *   - onHandComplete emits hand_complete and auto-starts next hand
 *   - _onGameState dispatches decide() and emits place_bet after delay
 *   - _onGameState is skipped when not the bot's turn
 *   - onPlayerLeave pauses bot timers
 *   - destroy() disconnects all bot sockets
 */

// ─── Mock socket.io-client ────────────────────────────────────────────────────

const mockBotSocket = {
  on:         jest.fn(),
  emit:       jest.fn(),
  disconnect: jest.fn(),
  id:         'bot-socket-id',
};

jest.mock('socket.io-client', () =>
  jest.fn().mockReturnValue(mockBotSocket)
);

// ─── Mock JwtService so sign() doesn't need SESSION_SECRET ───────────────────

jest.mock('../../../auth/JwtService', () => ({
  sign: jest.fn().mockReturnValue('mock-token'),
}));

// ─── Mock BotDecisionService ──────────────────────────────────────────────────

jest.mock('../../BotDecisionService', () => ({
  decide: jest.fn().mockReturnValue({ action: 'call', amount: 0 }),
}));

const { BotTableController } = require('../BotTableController');
const { decide }              = require('../../BotDecisionService');
const ioClientMock            = require('socket.io-client');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeIo() {
  const room = { emit: jest.fn() };
  return { to: jest.fn().mockReturnValue(room), _room: room };
}

function makeGm(playerCount = 2) {
  const players = Array.from({ length: playerCount }, (_, i) => ({
    id: `p${i}`, seat: i, is_coach: false, stack: 1000,
  }));
  return {
    state:     { players, phase: 'waiting' },
    getState:  jest.fn().mockReturnValue({ seated: players }),
    startGame: jest.fn().mockResolvedValue(undefined),
  };
}

function makeTableConfig(overrides = {}) {
  return {
    bot_config: {
      difficulty: 'medium',
      bot_count:  1,
      ...overrides,
    },
  };
}

function makeController(tableConfig = makeTableConfig()) {
  const io  = makeIo();
  const gm  = makeGm();
  const ctrl = new BotTableController('table-bot', gm, io, tableConfig);
  return { ctrl, io, gm };
}

// ─── Capture event handlers registered on the mock socket ─────────────────────

function captureHandlers() {
  /** Returns a Map<event, handler> from mockBotSocket.on calls */
  const handlers = {};
  for (const [event, fn] of mockBotSocket.on.mock.calls) {
    handlers[event] = fn;
  }
  return handlers;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('BotTableController — constructor + identity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('getMode() returns bot_cash', () => {
    const { ctrl } = makeController();
    expect(ctrl.getMode()).toBe('bot_cash');
  });

  test('reads difficulty from bot_config', () => {
    const { ctrl } = makeController(makeTableConfig({ difficulty: 'hard' }));
    expect(ctrl.difficulty).toBe('hard');
  });

  test('reads bot_count from bot_config', () => {
    const { ctrl } = makeController(makeTableConfig({ bot_count: 3 }));
    expect(ctrl.botCount).toBe(3);
  });

  test('defaults difficulty to easy when not set', () => {
    const { ctrl } = makeController({});
    expect(ctrl.difficulty).toBe('easy');
  });

  test('defaults bot_count to 1 when not set', () => {
    const { ctrl } = makeController({});
    expect(ctrl.botCount).toBe(1);
  });

  test('canPause returns false', () => {
    const { ctrl } = makeController();
    expect(ctrl.canPause()).toBe(false);
  });

  test('canUndo returns false', () => {
    const { ctrl } = makeController();
    expect(ctrl.canUndo()).toBe(false);
  });

  test('canManualCard returns false', () => {
    const { ctrl } = makeController();
    expect(ctrl.canManualCard()).toBe(false);
  });

  test('canReplay returns false', () => {
    const { ctrl } = makeController();
    expect(ctrl.canReplay()).toBe(false);
  });

  test('spawns bots immediately — ioClient called once', () => {
    makeController(makeTableConfig({ bot_count: 1 }));
    expect(ioClientMock).toHaveBeenCalledTimes(1);
  });

  test('spawns N bots — ioClient called N times', () => {
    makeController(makeTableConfig({ bot_count: 3 }));
    expect(ioClientMock).toHaveBeenCalledTimes(3);
  });

  test('bot socket registers connect and game_state handlers', () => {
    makeController();
    const registeredEvents = mockBotSocket.on.mock.calls.map(([event]) => event);
    expect(registeredEvents).toContain('connect');
    expect(registeredEvents).toContain('game_state');
  });
});

// ─── onHandComplete ────────────────────────────────────────────────────────────

describe('BotTableController — onHandComplete', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('emits hand_complete to the table room', async () => {
    const { ctrl, io } = makeController();
    await ctrl.onHandComplete({ handId: 'h1' });
    expect(io.to).toHaveBeenCalledWith('table-bot');
    expect(io._room.emit).toHaveBeenCalledWith('hand_complete', { handId: 'h1' });
  });

  test('calls gm.startGame after DEAL_DELAY when ≥ 2 non-coach players', async () => {
    const { ctrl, gm } = makeController();
    await ctrl.onHandComplete({ handId: 'h2' });
    expect(gm.startGame).not.toHaveBeenCalled();

    jest.advanceTimersByTime(3000);
    await Promise.resolve();

    expect(gm.startGame).toHaveBeenCalledTimes(1);
  });

  test('does NOT call gm.startGame when active=false', async () => {
    const { ctrl, gm } = makeController();
    await ctrl.onHandComplete({ handId: 'h3' });
    ctrl.active = false;

    jest.advanceTimersByTime(3000);
    await Promise.resolve();

    expect(gm.startGame).not.toHaveBeenCalled();
  });

  test('does NOT call gm.startGame when fewer than 2 seated players', async () => {
    const io  = makeIo();
    const gm  = makeGm(1); // only 1 player
    const ctrl = new BotTableController('table-bot', gm, io, makeTableConfig());
    await ctrl.onHandComplete({ handId: 'h4' });

    jest.advanceTimersByTime(3000);
    await Promise.resolve();

    expect(gm.startGame).not.toHaveBeenCalled();
  });
});

// ─── _onGameState + decide dispatch ───────────────────────────────────────────

describe('BotTableController — _onGameState action dispatch', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    decide.mockReturnValue({ action: 'call', amount: 0 });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function buildGameState(overrides = {}) {
    return {
      phase:        'flop',
      current_turn: 'bot-socket-id',
      players:      [{ id: 'bot-socket-id', is_active: true }],
      pot:          200,
      current_bet:  50,
      board:        ['Ah', 'Kc', '7d'],
      ...overrides,
    };
  }

  test('emits place_bet after think delay when it is the bot\'s turn', async () => {
    const { ctrl } = makeController();

    const handlers = captureHandlers();
    const gameStateHandler = handlers['game_state'];
    expect(gameStateHandler).toBeDefined();

    gameStateHandler(buildGameState());

    // Not yet — within think window
    expect(mockBotSocket.emit).not.toHaveBeenCalledWith('place_bet', expect.anything());

    // Advance past max think delay (800ms)
    jest.advanceTimersByTime(1000);
    await Promise.resolve();

    expect(mockBotSocket.emit).toHaveBeenCalledWith('place_bet', { action: 'call', amount: 0 });
  });

  test('calls decide() with correct arguments', async () => {
    const { ctrl } = makeController(makeTableConfig({ difficulty: 'hard' }));
    const handlers = captureHandlers();

    const state = buildGameState();
    handlers['game_state'](state);

    jest.advanceTimersByTime(1000);
    await Promise.resolve();

    expect(decide).toHaveBeenCalledWith(state, 'bot-socket-id', 'hard');
  });

  test('does NOT emit when it is NOT the bot\'s turn', async () => {
    const { ctrl } = makeController();
    const handlers = captureHandlers();

    const state = buildGameState({ current_turn: 'other-player-id' });
    handlers['game_state'](state);

    jest.advanceTimersByTime(1000);
    await Promise.resolve();

    expect(mockBotSocket.emit).not.toHaveBeenCalledWith('place_bet', expect.anything());
  });

  test('does NOT emit when phase is not a betting phase', async () => {
    const { ctrl } = makeController();
    const handlers = captureHandlers();

    handlers['game_state'](buildGameState({ phase: 'waiting' }));
    handlers['game_state'](buildGameState({ phase: 'showdown' }));

    jest.advanceTimersByTime(1000);
    await Promise.resolve();

    expect(mockBotSocket.emit).not.toHaveBeenCalledWith('place_bet', expect.anything());
  });

  test('does NOT emit when controller is destroyed before timer fires', async () => {
    const { ctrl } = makeController();
    const handlers = captureHandlers();

    handlers['game_state'](buildGameState());
    ctrl.active = false;

    jest.advanceTimersByTime(1000);
    await Promise.resolve();

    expect(mockBotSocket.emit).not.toHaveBeenCalledWith('place_bet', expect.anything());
  });
});

// ─── onPlayerLeave + timer pause ──────────────────────────────────────────────

describe('BotTableController — onPlayerLeave', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    decide.mockReturnValue({ action: 'call', amount: 0 });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('clears bot think timers when a player leaves', async () => {
    const { ctrl } = makeController();
    const handlers = captureHandlers();

    // Prime a think timer
    handlers['game_state']({
      phase: 'flop', current_turn: 'bot-socket-id',
      players: [{ id: 'bot-socket-id', is_active: true }],
      pot: 200, current_bet: 50, board: ['Ah', 'Kc', '7d'],
    });

    await ctrl.onPlayerLeave('human-1');

    // After grace period, place_bet should NOT have been emitted (timer was cleared)
    jest.advanceTimersByTime(1000);
    await Promise.resolve();

    expect(mockBotSocket.emit).not.toHaveBeenCalledWith('place_bet', expect.anything());
  });
});

// ─── destroy ──────────────────────────────────────────────────────────────────

describe('BotTableController — destroy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('sets active to false', () => {
    const { ctrl } = makeController();
    ctrl.destroy();
    expect(ctrl.active).toBe(false);
  });

  test('disconnects all bot sockets', () => {
    makeController(makeTableConfig({ bot_count: 2 }));
    // Re-create to capture fresh disconnect calls
    jest.clearAllMocks();
    const { ctrl } = makeController(makeTableConfig({ bot_count: 1 }));
    ctrl.destroy();
    expect(mockBotSocket.disconnect).toHaveBeenCalled();
  });

  test('clears _botSockets after destroy', () => {
    const { ctrl } = makeController();
    ctrl.destroy();
    expect(ctrl._botSockets).toHaveLength(0);
  });
});
