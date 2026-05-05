'use strict';

/**
 * BotTableController — unit tests
 *
 * socket.io-client is mocked so no network calls happen.
 * Tests verify:
 *   - Constructor does NOT auto-spawn bots
 *   - Constructor reads difficulty from bot_config
 *   - getMode() returns 'bot_cash'
 *   - capability flags are all false
 *   - addBot() creates one bot socket with correct name
 *   - removeBot() disconnects the bot socket and removes from _botSockets
 *   - onPlayerLeave destroys table when no humans remain
 *   - onPlayerLeave pauses bot timers on leave (grace timer)
 *   - onHandComplete emits hand_complete and auto-starts next hand
 *   - _onGameState dispatches decide() and emits place_bet after delay
 *   - _onGameState is skipped when not the bot's turn
 *   - destroy() disconnects all bot sockets
 */

// ─── Mock HandLoggerSupabase (prevents supabase.js from loading) ──────────────

jest.mock('../../../db/HandLoggerSupabase', () => ({
  startHand: jest.fn().mockResolvedValue(undefined),
  endHand:   jest.fn().mockResolvedValue(undefined),
  recordAction: jest.fn().mockResolvedValue(undefined),
}));

// ─── Mock SharedState (prevents TournamentRepository → supabase.js load) ──────

jest.mock('../../../state/SharedState', () => ({
  tables:                new Map(),
  activeHands:           new Map(),
  stableIdMap:           new Map(),
  getOrCreateController: jest.fn(),
  getController:         jest.fn(),
  destroyController:     jest.fn(),
}));

// ─── Mock socket.io-client ────────────────────────────────────────────────────

// We use a module-level array to track all sockets created.
// jest.mock factories can't reference out-of-scope variables, so we use a
// module-factory that creates a fresh mock each time and appends it to a
// global registry accessed via __mockSockets.
const mockSocketRegistry = [];

jest.mock('socket.io-client', () => {
  const registry = global.__botSocketRegistry || (global.__botSocketRegistry = []);
  return jest.fn().mockImplementation(() => {
    const s = {
      on:         jest.fn(),
      emit:       jest.fn(),
      disconnect: jest.fn(),
      id:         'bot-socket-id',
    };
    registry.push(s);
    return s;
  });
});

// Helper to get the most recently created mock socket
function lastMockSocket() {
  const registry = global.__botSocketRegistry || [];
  return registry[registry.length - 1] || null;
}

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
  const room  = { emit: jest.fn() };
  const rooms = new Map();
  return {
    to:      jest.fn().mockReturnValue(room),
    _room:   room,
    sockets: { adapter: { rooms }, sockets: new Map() },
  };
}

function makeGm(playerCount = 2, options = {}) {
  const players = Array.from({ length: playerCount }, (_, i) => ({
    id: `p${i}`, stableId: `stable-p${i}`, seat: i, is_coach: false, stack: 1000,
    disconnected: false,
    ...options.playerOverrides,
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
  /** Returns a map of event → handler from the most recently created mock socket's .on calls */
  const s = lastMockSocket();
  if (!s) return {};
  const handlers = {};
  for (const [event, fn] of s.on.mock.calls) {
    handlers[event] = fn;
  }
  return handlers;
}

// Clear the global socket registry before each test to avoid cross-test pollution
beforeEach(() => {
  if (global.__botSocketRegistry) global.__botSocketRegistry.length = 0;
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('BotTableController — constructor + identity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    if (global.__botSocketRegistry) global.__botSocketRegistry.length = 0;
  });

  test('getMode() returns bot_cash', () => {
    const { ctrl } = makeController();
    expect(ctrl.getMode()).toBe('bot_cash');
  });

  test('reads difficulty from bot_config', () => {
    const { ctrl } = makeController(makeTableConfig({ difficulty: 'hard' }));
    expect(ctrl.difficulty).toBe('hard');
  });

  test('defaults difficulty to easy when not set', () => {
    const { ctrl } = makeController({});
    expect(ctrl.difficulty).toBe('easy');
  });

  test('botCount starts at 0 (no auto-spawn)', () => {
    const { ctrl } = makeController();
    expect(ctrl.botCount).toBe(0);
  });

  test('does NOT spawn bots immediately — ioClient not called on construction', () => {
    makeController();
    expect(ioClientMock).not.toHaveBeenCalled();
  });

  test('_botSockets is empty on construction', () => {
    const { ctrl } = makeController();
    expect(ctrl._botSockets).toHaveLength(0);
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
});

// ─── addBot() ─────────────────────────────────────────────────────────────────

describe('BotTableController — addBot()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    if (global.__botSocketRegistry) global.__botSocketRegistry.length = 0;
  });

  test('addBot() calls ioClient once', () => {
    const { ctrl } = makeController();
    ctrl.addBot();
    expect(ioClientMock).toHaveBeenCalledTimes(1);
  });

  test('addBot() pushes entry to _botSockets', () => {
    const { ctrl } = makeController();
    ctrl.addBot();
    expect(ctrl._botSockets).toHaveLength(1);
  });

  test('addBot() adds stableId to _botStableIds', () => {
    const { ctrl } = makeController();
    ctrl.addBot();
    expect(ctrl._botStableIds.size).toBe(1);
  });

  test('addBot() twice creates 2 bot entries with sequential names', () => {
    const { ctrl } = makeController(makeTableConfig({ difficulty: 'easy' }));
    ctrl.addBot();
    ctrl.addBot();
    expect(ctrl._botSockets).toHaveLength(2);
    expect(ctrl._botSockets[0].name).toMatch(/Bot 1/);
    expect(ctrl._botSockets[1].name).toMatch(/Bot 2/);
  });

  test('bot socket registers connect, room_joined, game_state and connect_error handlers', () => {
    const { ctrl } = makeController();
    ctrl.addBot();
    const registeredEvents = lastMockSocket().on.mock.calls.map(([event]) => event);
    expect(registeredEvents).toContain('connect');
    expect(registeredEvents).toContain('room_joined');
    expect(registeredEvents).toContain('game_state');
    expect(registeredEvents).toContain('connect_error');
  });

  test('bot joins the room when connect fires', () => {
    const { ctrl } = makeController();
    ctrl.addBot();
    const handlers = captureHandlers();
    handlers['connect']();
    expect(lastMockSocket().emit).toHaveBeenCalledWith('join_room', expect.objectContaining({ tableId: 'table-bot' }));
  });
});

// ─── removeBot() ──────────────────────────────────────────────────────────────

describe('BotTableController — removeBot()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    if (global.__botSocketRegistry) global.__botSocketRegistry.length = 0;
  });

  test('removeBot() disconnects the bot socket', () => {
    const { ctrl } = makeController();
    ctrl.addBot();
    const stableId = ctrl._botSockets[0].stableId;
    ctrl.removeBot(stableId);
    expect(lastMockSocket().disconnect).toHaveBeenCalled();
  });

  test('removeBot() removes entry from _botSockets', () => {
    const { ctrl } = makeController();
    ctrl.addBot();
    const stableId = ctrl._botSockets[0].stableId;
    ctrl.removeBot(stableId);
    expect(ctrl._botSockets).toHaveLength(0);
  });

  test('removeBot() removes stableId from _botStableIds', () => {
    const { ctrl } = makeController();
    ctrl.addBot();
    const stableId = ctrl._botSockets[0].stableId;
    ctrl.removeBot(stableId);
    expect(ctrl._botStableIds.has(stableId)).toBe(false);
  });

  test('removeBot() with unknown stableId is a no-op', () => {
    const { ctrl } = makeController();
    expect(() => ctrl.removeBot('nonexistent')).not.toThrow();
  });
});

// ─── onHandComplete ────────────────────────────────────────────────────────────

describe('BotTableController — onHandComplete', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    if (global.__botSocketRegistry) global.__botSocketRegistry.length = 0;
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.clearAllMocks();
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
    if (global.__botSocketRegistry) global.__botSocketRegistry.length = 0;
    decide.mockReturnValue({ action: 'call', amount: 0 });
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.clearAllMocks();
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
    ctrl.addBot(); // spawn one bot first

    const handlers = captureHandlers();
    const gameStateHandler = handlers['game_state'];
    expect(gameStateHandler).toBeDefined();

    gameStateHandler(buildGameState());

    // Not yet — within think window
    expect(lastMockSocket().emit).not.toHaveBeenCalledWith('place_bet', expect.anything());

    // Advance past max think delay (800ms)
    jest.advanceTimersByTime(1000);
    await Promise.resolve();

    expect(lastMockSocket().emit).toHaveBeenCalledWith('place_bet', { action: 'call', amount: 0 });
  });

  test('calls decide() with correct arguments', async () => {
    const { ctrl } = makeController(makeTableConfig({ difficulty: 'hard' }));
    ctrl.addBot();
    const handlers = captureHandlers();

    const state = buildGameState();
    handlers['game_state'](state);

    jest.advanceTimersByTime(1000);
    await Promise.resolve();

    expect(decide).toHaveBeenCalledWith(state, 'bot-socket-id', 'hard');
  });

  test('does NOT emit when it is NOT the bot\'s turn', async () => {
    const { ctrl } = makeController();
    ctrl.addBot();
    const handlers = captureHandlers();

    const state = buildGameState({ current_turn: 'other-player-id' });
    handlers['game_state'](state);

    jest.advanceTimersByTime(1000);
    await Promise.resolve();

    expect(lastMockSocket().emit).not.toHaveBeenCalledWith('place_bet', expect.anything());
  });

  test('does NOT emit when phase is not a betting phase', async () => {
    const { ctrl } = makeController();
    ctrl.addBot();
    const handlers = captureHandlers();

    handlers['game_state'](buildGameState({ phase: 'waiting' }));
    handlers['game_state'](buildGameState({ phase: 'showdown' }));

    jest.advanceTimersByTime(1000);
    await Promise.resolve();

    expect(lastMockSocket().emit).not.toHaveBeenCalledWith('place_bet', expect.anything());
  });

  test('does NOT emit when controller is destroyed before timer fires', async () => {
    const { ctrl } = makeController();
    ctrl.addBot();
    const handlers = captureHandlers();

    handlers['game_state'](buildGameState());
    ctrl.active = false;

    jest.advanceTimersByTime(1000);
    await Promise.resolve();

    expect(lastMockSocket().emit).not.toHaveBeenCalledWith('place_bet', expect.anything());
  });
});

// ─── onPlayerLeave + human-count watcher ─────────────────────────────────────

describe('BotTableController — onPlayerLeave', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    if (global.__botSocketRegistry) global.__botSocketRegistry.length = 0;
    decide.mockReturnValue({ action: 'call', amount: 0 });
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  test('clears bot think timers when a player leaves', async () => {
    const { ctrl } = makeController();
    ctrl.addBot();
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

    expect(lastMockSocket().emit).not.toHaveBeenCalledWith('place_bet', expect.anything());
  });

  test('emits table:closed and destroys when no humans remain immediately', async () => {
    const io  = makeIo();
    // GM has 1 player (the bot itself — stableId in _botStableIds)
    const gm  = makeGm(0); // no players
    const ctrl = new BotTableController('table-bot', gm, io, makeTableConfig());
    ctrl.addBot();

    // Manually add the bot's stableId as if it joined
    // (in real flow joinRoom sets is_bot on the player object)
    gm.state.players = [{ id: 'bot-socket-id', stableId: ctrl._botSockets[0].stableId, seat: 0, disconnected: false }];

    const destroySpy = jest.spyOn(ctrl, 'destroy');
    await ctrl.onPlayerLeave('some-human');

    expect(io._room.emit).toHaveBeenCalledWith('table:closed', { reason: 'no_humans' });
    expect(destroySpy).toHaveBeenCalled();
  });

  test('does NOT destroy when at least one human (non-bot) remains', async () => {
    const io  = makeIo();
    const gm  = makeGm(2); // 2 players: one human, one bot
    const ctrl = new BotTableController('table-bot', gm, io, makeTableConfig());
    ctrl.addBot();

    // Mark only the second player as a bot
    const botStableId = ctrl._botSockets[0].stableId;
    gm.state.players[1].stableId = botStableId;
    ctrl._botStableIds.add(botStableId);

    const destroySpy = jest.spyOn(ctrl, 'destroy');
    await ctrl.onPlayerLeave('human-1');

    expect(destroySpy).not.toHaveBeenCalled();
  });
});

// ─── destroy ──────────────────────────────────────────────────────────────────

describe('BotTableController — destroy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    if (global.__botSocketRegistry) global.__botSocketRegistry.length = 0;
  });

  test('sets active to false', () => {
    const { ctrl } = makeController();
    ctrl.destroy();
    expect(ctrl.active).toBe(false);
  });

  test('disconnects all bot sockets added via addBot()', () => {
    const { ctrl } = makeController();
    ctrl.addBot();
    jest.clearAllMocks(); // reset disconnect call count
    ctrl.destroy();
    expect(lastMockSocket().disconnect).toHaveBeenCalled();
  });

  test('clears _botSockets after destroy', () => {
    const { ctrl } = makeController();
    ctrl.addBot();
    ctrl.destroy();
    expect(ctrl._botSockets).toHaveLength(0);
  });

  test('clears _botStableIds after destroy', () => {
    const { ctrl } = makeController();
    ctrl.addBot();
    ctrl.destroy();
    expect(ctrl._botStableIds.size).toBe(0);
  });
});
