'use strict';

/**
 * Unit tests for server/socket/handlers/replay.js
 *
 * Strategy: register the handler with a mock socket that captures socket.on() calls,
 * then invoke handlers directly. ctx deps (requireCoach, tables, broadcastState, etc.)
 * are all plain mocks — no real server, no real GameManager.
 */

const registerReplay = require('../replay');

// ── helpers ──────────────────────────────────────────────────────────────────

function makeSocket({ isCoach = true, tableId = 'table1' } = {}) {
  const emitted = [];
  const handlers = {};
  return {
    data: { isCoach, tableId },
    emit: (event, payload) => emitted.push({ event, payload }),
    on: (event, handler) => { handlers[event] = handler; },
    _emitted: emitted,
    _handlers: handlers,
  };
}

function makeGm(overrides = {}) {
  return {
    state: { phase: 'waiting', playlist_mode: null },
    loadReplay:       jest.fn().mockReturnValue({ success: true }),
    replayStepForward: jest.fn().mockReturnValue({}),
    replayStepBack:    jest.fn().mockReturnValue({}),
    replayJumpTo:      jest.fn().mockReturnValue({}),
    branchFromReplay:  jest.fn().mockReturnValue({}),
    unBranchToReplay:  jest.fn().mockReturnValue({}),
    exitReplay:        jest.fn().mockReturnValue({}),
    ...overrides,
  };
}

function makeCtx({ gm = makeGm(), tableId = 'table1' } = {}) {
  const tables = new Map();
  if (gm) tables.set(tableId, gm);
  return {
    tables,
    io: { to: jest.fn().mockReturnValue({ emit: jest.fn() }) },
    broadcastState:  jest.fn(),
    sendError:       jest.fn(),
    sendSyncError:   jest.fn(),
    requireCoach: (socket, action) => {
      if (!socket.data.isCoach) {
        socket.emit('error', { message: `Only the coach can ${action}` });
        return true;
      }
      return false;
    },
    HandLogger: {
      getHandDetail: jest.fn().mockResolvedValue({
        hand_id: 1,
        players: [
          { player_id: 'p1', seat: 0, stack_start: 1000, hole_cards: ['As', 'Ks'] },
        ],
        actions: [
          { id: 1, player_id: 'p1', street: 'preflop', action: 'raise', amount: 40, is_reverted: 0 },
        ],
      }),
    },
    advancePlaylist: jest.fn().mockResolvedValue(undefined),
  };
}

// Register handlers and return them keyed by event name
function setup(socketOpts = {}, ctxOpts = {}) {
  const socket = makeSocket(socketOpts);
  const ctx = makeCtx(ctxOpts);
  registerReplay(socket, ctx);
  return { socket, ctx };
}

// ── load_replay ───────────────────────────────────────────────────────────────

describe('load_replay', () => {
  test('happy path: loads hand, broadcasts state, emits replay_loaded', async () => {
    const { socket, ctx } = setup();
    await socket._handlers['load_replay']({ handId: 1 });

    expect(ctx.HandLogger.getHandDetail).toHaveBeenCalledWith(1);
    expect(ctx.broadcastState).toHaveBeenCalledWith('table1');
    const loaded = socket._emitted.find(e => e.event === 'replay_loaded');
    expect(loaded).toBeDefined();
    expect(loaded.payload.handId).toBe(1);
    expect(loaded.payload.actionCount).toBe(1);
  });

  test('non-coach is rejected', async () => {
    const { socket, ctx } = setup({ isCoach: false });
    await socket._handlers['load_replay']({ handId: 1 });

    expect(ctx.HandLogger.getHandDetail).not.toHaveBeenCalled();
    const err = socket._emitted.find(e => e.event === 'error');
    expect(err).toBeDefined();
  });

  test('sendError when no game manager for tableId', async () => {
    const { socket, ctx } = setup({}, { gm: null });
    await socket._handlers['load_replay']({ handId: 1 });

    expect(ctx.sendError).toHaveBeenCalledWith(socket, 'Not in a room');
  });

  test('sendSyncError when phase !== waiting', async () => {
    const gm = makeGm();
    gm.state.phase = 'preflop';
    const { socket, ctx } = setup({}, { gm });
    await socket._handlers['load_replay']({ handId: 1 });

    expect(ctx.sendSyncError).toHaveBeenCalledWith(socket, expect.stringContaining('between hands'));
  });

  test('sendSyncError when hand not found', async () => {
    const ctx = makeCtx();
    ctx.HandLogger.getHandDetail.mockResolvedValue(null);
    const socket = makeSocket();
    registerReplay(socket, ctx);
    await socket._handlers['load_replay']({ handId: 99 });

    expect(ctx.sendSyncError).toHaveBeenCalledWith(socket, expect.stringContaining('99'));
  });

  test('sendSyncError when gm.loadReplay returns error', async () => {
    const gm = makeGm({ loadReplay: jest.fn().mockReturnValue({ error: 'replay conflict' }) });
    const { socket, ctx } = setup({}, { gm });
    await socket._handlers['load_replay']({ handId: 1 });

    expect(ctx.sendSyncError).toHaveBeenCalledWith(socket, 'replay conflict');
  });

  test('sendError on thrown exception', async () => {
    const ctx = makeCtx();
    ctx.HandLogger.getHandDetail.mockRejectedValue(new Error('DB down'));
    const socket = makeSocket();
    registerReplay(socket, ctx);
    await socket._handlers['load_replay']({ handId: 1 });

    expect(ctx.sendError).toHaveBeenCalledWith(socket, expect.stringContaining('DB down'));
  });

  test('counts only non-reverted actions in replay_loaded.actionCount', async () => {
    const ctx = makeCtx();
    ctx.HandLogger.getHandDetail.mockResolvedValue({
      hand_id: 1,
      players: [],
      actions: [
        { id: 1, is_reverted: 0 },
        { id: 2, is_reverted: 1 },
        { id: 3, is_reverted: 0 },
      ],
    });
    const socket = makeSocket();
    registerReplay(socket, ctx);
    await socket._handlers['load_replay']({ handId: 1 });

    const loaded = socket._emitted.find(e => e.event === 'replay_loaded');
    expect(loaded.payload.actionCount).toBe(2);
  });
});

// ── replay_step_forward ───────────────────────────────────────────────────────

describe('replay_step_forward', () => {
  test('happy path: calls gm.replayStepForward and broadcasts state', () => {
    const { socket, ctx } = setup();
    socket._handlers['replay_step_forward']();

    expect(ctx.broadcastState).toHaveBeenCalledWith('table1');
  });

  test('non-coach is rejected', () => {
    const { socket, ctx } = setup({ isCoach: false });
    socket._handlers['replay_step_forward']();

    expect(ctx.broadcastState).not.toHaveBeenCalled();
    const err = socket._emitted.find(e => e.event === 'error');
    expect(err).toBeDefined();
  });

  test('sendError when not in a room', () => {
    const { socket, ctx } = setup({}, { gm: null });
    socket._handlers['replay_step_forward']();

    expect(ctx.sendError).toHaveBeenCalledWith(socket, 'Not in a room');
  });

  test('sendSyncError when gm returns error', () => {
    const gm = makeGm({ replayStepForward: jest.fn().mockReturnValue({ error: 'at end' }) });
    const { socket, ctx } = setup({}, { gm });
    socket._handlers['replay_step_forward']();

    expect(ctx.sendSyncError).toHaveBeenCalledWith(socket, 'at end');
    expect(ctx.broadcastState).not.toHaveBeenCalled();
  });
});

// ── replay_step_back ──────────────────────────────────────────────────────────

describe('replay_step_back', () => {
  test('happy path: calls gm.replayStepBack and broadcasts state', () => {
    const { socket, ctx } = setup();
    socket._handlers['replay_step_back']();

    expect(ctx.broadcastState).toHaveBeenCalledWith('table1');
  });

  test('non-coach is rejected', () => {
    const { socket, ctx } = setup({ isCoach: false });
    socket._handlers['replay_step_back']();

    expect(ctx.broadcastState).not.toHaveBeenCalled();
  });

  test('sendError when not in a room', () => {
    const { socket, ctx } = setup({}, { gm: null });
    socket._handlers['replay_step_back']();

    expect(ctx.sendError).toHaveBeenCalledWith(socket, 'Not in a room');
  });

  test('sendSyncError when gm returns error', () => {
    const gm = makeGm({ replayStepBack: jest.fn().mockReturnValue({ error: 'at start' }) });
    const { socket, ctx } = setup({}, { gm });
    socket._handlers['replay_step_back']();

    expect(ctx.sendSyncError).toHaveBeenCalledWith(socket, 'at start');
  });
});

// ── replay_jump_to ────────────────────────────────────────────────────────────

describe('replay_jump_to', () => {
  test('happy path: calls gm.replayJumpTo(cursor) and broadcasts state', () => {
    const gm = makeGm();
    const { socket, ctx } = setup({}, { gm });
    socket._handlers['replay_jump_to']({ cursor: 3 });

    expect(gm.replayJumpTo).toHaveBeenCalledWith(3);
    expect(ctx.broadcastState).toHaveBeenCalledWith('table1');
  });

  test('parses cursor string to integer', () => {
    const gm = makeGm();
    const { socket, ctx } = setup({}, { gm });
    socket._handlers['replay_jump_to']({ cursor: '5' });

    expect(gm.replayJumpTo).toHaveBeenCalledWith(5);
  });

  test('non-coach is rejected', () => {
    const { socket, ctx } = setup({ isCoach: false });
    socket._handlers['replay_jump_to']({ cursor: 2 });

    expect(ctx.broadcastState).not.toHaveBeenCalled();
  });

  test('sendSyncError when cursor is missing', () => {
    const { socket, ctx } = setup();
    socket._handlers['replay_jump_to']({});

    expect(ctx.sendSyncError).toHaveBeenCalledWith(socket, 'cursor is required');
  });

  test('sendSyncError when cursor is null', () => {
    const { socket, ctx } = setup();
    socket._handlers['replay_jump_to']({ cursor: null });

    expect(ctx.sendSyncError).toHaveBeenCalledWith(socket, 'cursor is required');
  });

  test('sendSyncError when gm returns error', () => {
    const gm = makeGm({ replayJumpTo: jest.fn().mockReturnValue({ error: 'out of range' }) });
    const { socket, ctx } = setup({}, { gm });
    socket._handlers['replay_jump_to']({ cursor: 99 });

    expect(ctx.sendSyncError).toHaveBeenCalledWith(socket, 'out of range');
  });
});

// ── replay_branch ─────────────────────────────────────────────────────────────

describe('replay_branch', () => {
  test('happy path: calls branchFromReplay and broadcasts with type', () => {
    const { socket, ctx } = setup();
    socket._handlers['replay_branch']();

    expect(ctx.broadcastState).toHaveBeenCalledWith('table1', expect.objectContaining({ type: 'replay_branched' }));
  });

  test('non-coach is rejected', () => {
    const { socket, ctx } = setup({ isCoach: false });
    socket._handlers['replay_branch']();

    expect(ctx.broadcastState).not.toHaveBeenCalled();
  });

  test('sendError when not in a room', () => {
    const { socket, ctx } = setup({}, { gm: null });
    socket._handlers['replay_branch']();

    expect(ctx.sendError).toHaveBeenCalledWith(socket, 'Not in a room');
  });

  test('sendSyncError when gm returns error', () => {
    const gm = makeGm({ branchFromReplay: jest.fn().mockReturnValue({ error: 'cannot branch' }) });
    const { socket, ctx } = setup({}, { gm });
    socket._handlers['replay_branch']();

    expect(ctx.sendSyncError).toHaveBeenCalledWith(socket, 'cannot branch');
  });
});

// ── replay_unbranch ───────────────────────────────────────────────────────────

describe('replay_unbranch', () => {
  test('happy path: calls unBranchToReplay and broadcasts with type', () => {
    const { socket, ctx } = setup();
    socket._handlers['replay_unbranch']();

    expect(ctx.broadcastState).toHaveBeenCalledWith('table1', expect.objectContaining({ type: 'replay_unbranced' }));
  });

  test('non-coach is rejected', () => {
    const { socket, ctx } = setup({ isCoach: false });
    socket._handlers['replay_unbranch']();

    expect(ctx.broadcastState).not.toHaveBeenCalled();
  });

  test('sendSyncError when gm returns error', () => {
    const gm = makeGm({ unBranchToReplay: jest.fn().mockReturnValue({ error: 'not branched' }) });
    const { socket, ctx } = setup({}, { gm });
    socket._handlers['replay_unbranch']();

    expect(ctx.sendSyncError).toHaveBeenCalledWith(socket, 'not branched');
  });
});

// ── replay_exit ───────────────────────────────────────────────────────────────

describe('replay_exit', () => {
  test('happy path: exits replay and broadcasts replay_exited', async () => {
    const gm = makeGm({ exitReplay: jest.fn().mockReturnValue({ playlistWasActive: false }) });
    const { socket, ctx } = setup({}, { gm });
    await socket._handlers['replay_exit']();

    expect(gm.exitReplay).toHaveBeenCalled();
    expect(ctx.broadcastState).toHaveBeenCalledWith('table1', expect.objectContaining({ type: 'replay_exited' }));
    expect(ctx.advancePlaylist).not.toHaveBeenCalled();
  });

  test('calls advancePlaylist when playlistWasActive and playlist_mode.active', async () => {
    const gm = makeGm({
      exitReplay: jest.fn().mockReturnValue({ playlistWasActive: true }),
    });
    gm.state.playlist_mode = { active: true };
    const { socket, ctx } = setup({}, { gm });
    await socket._handlers['replay_exit']();

    expect(ctx.advancePlaylist).toHaveBeenCalledWith('table1', gm);
    expect(ctx.broadcastState).not.toHaveBeenCalled();
  });

  test('does NOT call advancePlaylist when playlistWasActive but playlist_mode is inactive', async () => {
    const gm = makeGm({
      exitReplay: jest.fn().mockReturnValue({ playlistWasActive: true }),
    });
    gm.state.playlist_mode = { active: false };
    const { socket, ctx } = setup({}, { gm });
    await socket._handlers['replay_exit']();

    expect(ctx.advancePlaylist).not.toHaveBeenCalled();
    expect(ctx.broadcastState).toHaveBeenCalled();
  });

  test('non-coach is rejected', async () => {
    const { socket, ctx } = setup({ isCoach: false });
    await socket._handlers['replay_exit']();

    expect(ctx.broadcastState).not.toHaveBeenCalled();
  });

  test('sendError when not in a room', async () => {
    const { socket, ctx } = setup({}, { gm: null });
    await socket._handlers['replay_exit']();

    expect(ctx.sendError).toHaveBeenCalledWith(socket, 'Not in a room');
  });

  test('sendSyncError when gm returns error', async () => {
    const gm = makeGm({ exitReplay: jest.fn().mockReturnValue({ error: 'not in replay' }) });
    const { socket, ctx } = setup({}, { gm });
    await socket._handlers['replay_exit']();

    expect(ctx.sendSyncError).toHaveBeenCalledWith(socket, 'not in replay');
  });

  test('sendError on thrown exception', async () => {
    const gm = makeGm({ exitReplay: jest.fn().mockImplementation(() => { throw new Error('crash'); }) });
    const { socket, ctx } = setup({}, { gm });
    await socket._handlers['replay_exit']();

    expect(ctx.sendError).toHaveBeenCalledWith(socket, expect.stringContaining('crash'));
  });
});
