'use strict';

/**
 * Unit tests for server/socket/handlers/playlists.js
 *
 * Strategy: register the handler with a mock socket that captures socket.on() calls,
 * then invoke handlers directly. ctx deps are plain jest mocks — no real server.
 */

// Mock PlaylistExecutionService to avoid real DB calls and control REST drill session state
jest.mock('../../../services/PlaylistExecutionService', () => ({
  getStatus: jest.fn().mockResolvedValue({ active: false }),
}));
const PlaylistExecutionService = require('../../../services/PlaylistExecutionService');

const registerPlaylists = require('../playlists');

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
  const state = { phase: 'waiting', playlist_mode: null };
  const gm = {
    state,
    // Real activatePlaylistMode populates state.playlist_mode; mock must do the same
    // so that the handler can set state.playlist_mode.currentIndex = -1 without throwing.
    activatePlaylistMode: jest.fn().mockImplementation(({ playlistId, hands }) => {
      state.playlist_mode = { playlistId, hands, currentIndex: -1, active: false };
      return { totalHands: hands.length };
    }),
    deactivatePlaylistMode: jest.fn().mockImplementation(() => {
      state.playlist_mode = null;
    }),
    seekPlaylist: jest.fn(),
    ...overrides,
  };
  return gm;
}

const DEFAULT_PLAYLISTS = [{ playlist_id: 'pl1', name: 'TestList' }];

function makeHandLogger(overrides = {}) {
  return {
    updateCoachTags:       jest.fn().mockResolvedValue(undefined),
    getPlaylists:          jest.fn().mockResolvedValue(DEFAULT_PLAYLISTS),
    createPlaylist:        jest.fn().mockResolvedValue({ playlist_id: 'pl2', name: 'New' }),
    addHandToPlaylist:     jest.fn().mockResolvedValue(undefined),
    removeHandFromPlaylist: jest.fn().mockResolvedValue(undefined),
    deletePlaylist:        jest.fn().mockResolvedValue(undefined),
    renamePlaylist:        jest.fn().mockResolvedValue({ playlist_id: 'pl1', name: 'Renamed' }),
    getPlaylistHands:      jest.fn().mockResolvedValue([{ hand_id: 'h1' }]),
    getHandDetail:         jest.fn().mockResolvedValue(null),
    ...overrides,
  };
}

function makeCtx({ gm = makeGm(), tableId = 'table1', HandLogger } = {}) {
  const tables = new Map();
  if (gm) tables.set(tableId, gm);
  const hl = HandLogger || makeHandLogger();
  return {
    tables,
    io: { to: jest.fn().mockReturnValue({ emit: jest.fn() }) },
    broadcastState:  jest.fn(),
    sendError:       jest.fn(),
    requireCoach: (socket, action) => {
      if (!socket.data.isCoach) {
        socket.emit('error', { message: `Only the coach can ${action}` });
        return true;
      }
      return false;
    },
    HandLogger: hl,
    activeNonCoachCount:       jest.fn().mockReturnValue(2),
    findMatchingPlaylistIndex:  jest.fn().mockResolvedValue(0),
    loadScenarioIntoConfig:    jest.fn().mockReturnValue({}),
  };
}

function setup(socketOpts = {}, ctxOpts = {}) {
  const socket = makeSocket(socketOpts);
  const ctx = makeCtx(ctxOpts);
  registerPlaylists(socket, ctx);
  return { socket, ctx };
}

// ── update_hand_tags ──────────────────────────────────────────────────────────

describe('update_hand_tags', () => {
  test('happy path: saves tags and emits hand_tags_saved', async () => {
    const { socket, ctx } = setup();
    await socket._handlers['update_hand_tags']({ handId: 'h1', tags: [] });

    expect(ctx.HandLogger.updateCoachTags).toHaveBeenCalledWith('h1', []);
    const saved = socket._emitted.find(e => e.event === 'hand_tags_saved');
    expect(saved).toBeDefined();
    expect(saved.payload.handId).toBe('h1');
  });

  test('creates playlist for new tag and emits playlist_state', async () => {
    const hl = makeHandLogger({
      getPlaylists: jest.fn().mockResolvedValue([]),   // no existing playlists
      createPlaylist: jest.fn().mockResolvedValue({ playlist_id: 'new-pl', name: 'bluff' }),
    });
    const { socket, ctx } = setup({}, { HandLogger: hl });
    await socket._handlers['update_hand_tags']({ handId: 'h1', tags: ['bluff'] });

    expect(hl.createPlaylist).toHaveBeenCalledWith(expect.objectContaining({ name: 'bluff' }));
    expect(hl.addHandToPlaylist).toHaveBeenCalledWith('new-pl', 'h1');
    const state = socket._emitted.find(e => e.event === 'playlist_state');
    expect(state).toBeDefined();
  });

  test('reuses existing playlist when tag matches', async () => {
    const hl = makeHandLogger({
      getPlaylists: jest.fn().mockResolvedValue([{ playlist_id: 'existing', name: 'bluff' }]),
    });
    const { socket, ctx } = setup({}, { HandLogger: hl });
    await socket._handlers['update_hand_tags']({ handId: 'h1', tags: ['bluff'] });

    expect(hl.createPlaylist).not.toHaveBeenCalled();
    expect(hl.addHandToPlaylist).toHaveBeenCalledWith('existing', 'h1');
  });

  test('non-coach is rejected', async () => {
    const { socket, ctx } = setup({ isCoach: false });
    await socket._handlers['update_hand_tags']({ handId: 'h1', tags: [] });

    expect(ctx.HandLogger.updateCoachTags).not.toHaveBeenCalled();
    const err = socket._emitted.find(e => e.event === 'error');
    expect(err).toBeDefined();
  });

  test('sendError when handId missing', async () => {
    const { socket, ctx } = setup();
    await socket._handlers['update_hand_tags']({ tags: [] });

    expect(ctx.sendError).toHaveBeenCalled();
  });

  test('sendError when tags is not array', async () => {
    const { socket, ctx } = setup();
    await socket._handlers['update_hand_tags']({ handId: 'h1', tags: 'bad' });

    expect(ctx.sendError).toHaveBeenCalled();
  });

  test('sendError on exception', async () => {
    const hl = makeHandLogger({ updateCoachTags: jest.fn().mockRejectedValue(new Error('DB fail')) });
    const { socket, ctx } = setup({}, { HandLogger: hl });
    await socket._handlers['update_hand_tags']({ handId: 'h1', tags: [] });

    expect(ctx.sendError).toHaveBeenCalledWith(socket, expect.stringContaining('DB fail'));
  });
});

// ── create_playlist ───────────────────────────────────────────────────────────

describe('create_playlist', () => {
  test('happy path: creates playlist and emits playlist_state + notification', async () => {
    const { socket, ctx } = setup();
    await socket._handlers['create_playlist']({ name: 'Bluffs', description: 'catch bluffs' });

    expect(ctx.HandLogger.createPlaylist).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Bluffs', description: 'catch bluffs' })
    );
    const state = socket._emitted.find(e => e.event === 'playlist_state');
    const notif = socket._emitted.find(e => e.event === 'notification');
    expect(state).toBeDefined();
    expect(notif).toBeDefined();
    expect(notif.payload.type).toBe('playlist_created');
  });

  test('non-coach is rejected', async () => {
    const { socket, ctx } = setup({ isCoach: false });
    await socket._handlers['create_playlist']({ name: 'X' });

    expect(ctx.HandLogger.createPlaylist).not.toHaveBeenCalled();
  });

  test('sendError when name is empty string', async () => {
    const { socket, ctx } = setup();
    await socket._handlers['create_playlist']({ name: '   ' });

    expect(ctx.sendError).toHaveBeenCalled();
    expect(ctx.HandLogger.createPlaylist).not.toHaveBeenCalled();
  });

  test('sendError when name is missing', async () => {
    const { socket, ctx } = setup();
    await socket._handlers['create_playlist']({});

    expect(ctx.sendError).toHaveBeenCalled();
  });

  test('sendError on exception', async () => {
    const hl = makeHandLogger({ createPlaylist: jest.fn().mockRejectedValue(new Error('constraint')) });
    const { socket, ctx } = setup({}, { HandLogger: hl });
    await socket._handlers['create_playlist']({ name: 'X' });

    expect(ctx.sendError).toHaveBeenCalledWith(socket, expect.stringContaining('constraint'));
  });
});

// ── get_playlists ─────────────────────────────────────────────────────────────

describe('get_playlists', () => {
  test('happy path: emits playlist_state with all playlists', async () => {
    const { socket, ctx } = setup();
    await socket._handlers['get_playlists']();

    const state = socket._emitted.find(e => e.event === 'playlist_state');
    expect(state).toBeDefined();
    expect(state.payload.playlists).toEqual(DEFAULT_PLAYLISTS);
  });

  test('sendError on exception', async () => {
    const hl = makeHandLogger({ getPlaylists: jest.fn().mockRejectedValue(new Error('DB fail')) });
    const { socket, ctx } = setup({}, { HandLogger: hl });
    await socket._handlers['get_playlists']();

    expect(ctx.sendError).toHaveBeenCalledWith(socket, expect.stringContaining('DB fail'));
  });
});

// ── add_to_playlist ───────────────────────────────────────────────────────────

describe('add_to_playlist', () => {
  test('happy path: adds hand and emits playlist_state', async () => {
    const { socket, ctx } = setup();
    await socket._handlers['add_to_playlist']({ playlistId: 'pl1', handId: 'h1' });

    expect(ctx.HandLogger.addHandToPlaylist).toHaveBeenCalledWith('pl1', 'h1');
    const state = socket._emitted.find(e => e.event === 'playlist_state');
    expect(state).toBeDefined();
  });

  test('non-coach is rejected', async () => {
    const { socket, ctx } = setup({ isCoach: false });
    await socket._handlers['add_to_playlist']({ playlistId: 'pl1', handId: 'h1' });

    expect(ctx.HandLogger.addHandToPlaylist).not.toHaveBeenCalled();
  });

  test('sendError when playlistId missing', async () => {
    const { socket, ctx } = setup();
    await socket._handlers['add_to_playlist']({ handId: 'h1' });

    expect(ctx.sendError).toHaveBeenCalled();
  });

  test('sendError when handId missing', async () => {
    const { socket, ctx } = setup();
    await socket._handlers['add_to_playlist']({ playlistId: 'pl1' });

    expect(ctx.sendError).toHaveBeenCalled();
  });

  test('sendError on exception', async () => {
    const hl = makeHandLogger({ addHandToPlaylist: jest.fn().mockRejectedValue(new Error('conflict')) });
    const { socket, ctx } = setup({}, { HandLogger: hl });
    await socket._handlers['add_to_playlist']({ playlistId: 'pl1', handId: 'h1' });

    expect(ctx.sendError).toHaveBeenCalledWith(socket, expect.stringContaining('conflict'));
  });
});

// ── remove_from_playlist ──────────────────────────────────────────────────────

describe('remove_from_playlist', () => {
  test('happy path: removes hand and emits playlist_state', async () => {
    const { socket, ctx } = setup();
    await socket._handlers['remove_from_playlist']({ playlistId: 'pl1', handId: 'h1' });

    expect(ctx.HandLogger.removeHandFromPlaylist).toHaveBeenCalledWith('pl1', 'h1');
    const state = socket._emitted.find(e => e.event === 'playlist_state');
    expect(state).toBeDefined();
  });

  test('non-coach is rejected', async () => {
    const { socket, ctx } = setup({ isCoach: false });
    await socket._handlers['remove_from_playlist']({ playlistId: 'pl1', handId: 'h1' });

    expect(ctx.HandLogger.removeHandFromPlaylist).not.toHaveBeenCalled();
  });

  test('sendError when both ids missing', async () => {
    const { socket, ctx } = setup();
    await socket._handlers['remove_from_playlist']({});

    expect(ctx.sendError).toHaveBeenCalled();
  });
});

// ── delete_playlist ───────────────────────────────────────────────────────────

describe('delete_playlist', () => {
  test('happy path: deletes playlist and emits playlist_state + notification', async () => {
    const { socket, ctx } = setup();
    await socket._handlers['delete_playlist']({ playlistId: 'pl1' });

    expect(ctx.HandLogger.deletePlaylist).toHaveBeenCalledWith('pl1');
    const state = socket._emitted.find(e => e.event === 'playlist_state');
    const notif = socket._emitted.find(e => e.event === 'notification');
    expect(state).toBeDefined();
    expect(notif.payload.type).toBe('playlist_deleted');
  });

  test('deactivates playlist mode when deleting active playlist', async () => {
    const gm = makeGm();
    gm.state.playlist_mode = { playlistId: 'pl1' };
    const { socket, ctx } = setup({}, { gm });
    await socket._handlers['delete_playlist']({ playlistId: 'pl1' });

    expect(gm.deactivatePlaylistMode).toHaveBeenCalled();
  });

  test('does not deactivate when deleting a different playlist', async () => {
    const gm = makeGm();
    gm.state.playlist_mode = { playlistId: 'other-pl' };
    const { socket, ctx } = setup({}, { gm });
    await socket._handlers['delete_playlist']({ playlistId: 'pl1' });

    expect(gm.deactivatePlaylistMode).not.toHaveBeenCalled();
  });

  test('non-coach is rejected', async () => {
    const { socket, ctx } = setup({ isCoach: false });
    await socket._handlers['delete_playlist']({ playlistId: 'pl1' });

    expect(ctx.HandLogger.deletePlaylist).not.toHaveBeenCalled();
  });

  test('sendError when playlistId missing', async () => {
    const { socket, ctx } = setup();
    await socket._handlers['delete_playlist']({});

    expect(ctx.sendError).toHaveBeenCalled();
  });
});

// ── rename_playlist ───────────────────────────────────────────────────────

describe('rename_playlist', () => {
  test('happy path: renames playlist and emits playlist_state + notification', async () => {
    const hl = makeHandLogger({ renamePlaylist: jest.fn().mockResolvedValue({ playlist_id: 'pl1', name: 'Renamed' }) });
    const { socket, ctx } = setup({}, { HandLogger: hl });
    await socket._handlers['rename_playlist']({ playlistId: 'pl1', name: 'Renamed' });

    expect(hl.renamePlaylist).toHaveBeenCalledWith('pl1', 'Renamed');
    const state = socket._emitted.find(e => e.event === 'playlist_state');
    const notif = socket._emitted.find(e => e.event === 'notification');
    expect(state).toBeDefined();
    expect(notif.payload.type).toBe('playlist_renamed');
    expect(notif.payload.message).toContain('Renamed');
  });

  test('trims whitespace from name', async () => {
    const hl = makeHandLogger({ renamePlaylist: jest.fn().mockResolvedValue({ playlist_id: 'pl1', name: 'Trimmed' }) });
    const { socket, ctx } = setup({}, { HandLogger: hl });
    await socket._handlers['rename_playlist']({ playlistId: 'pl1', name: '  Trimmed  ' });

    expect(hl.renamePlaylist).toHaveBeenCalledWith('pl1', 'Trimmed');
  });

  test('non-coach is rejected', async () => {
    const hl = makeHandLogger({ renamePlaylist: jest.fn() });
    const { socket, ctx } = setup({ isCoach: false }, { HandLogger: hl });
    await socket._handlers['rename_playlist']({ playlistId: 'pl1', name: 'New' });

    expect(hl.renamePlaylist).not.toHaveBeenCalled();
  });

  test('sendError when playlistId missing', async () => {
    const { socket, ctx } = setup();
    await socket._handlers['rename_playlist']({ name: 'New' });

    expect(ctx.sendError).toHaveBeenCalled();
  });

  test('sendError when name is missing', async () => {
    const { socket, ctx } = setup();
    await socket._handlers['rename_playlist']({ playlistId: 'pl1' });

    expect(ctx.sendError).toHaveBeenCalled();
  });

  test('sendError when name is empty string', async () => {
    const { socket, ctx } = setup();
    await socket._handlers['rename_playlist']({ playlistId: 'pl1', name: '' });

    expect(ctx.sendError).toHaveBeenCalled();
  });

  test('sendError when name is whitespace only', async () => {
    const { socket, ctx } = setup();
    await socket._handlers['rename_playlist']({ playlistId: 'pl1', name: '   ' });

    expect(ctx.sendError).toHaveBeenCalled();
  });

  test('sendError when name is not a string', async () => {
    const { socket, ctx } = setup();
    await socket._handlers['rename_playlist']({ playlistId: 'pl1', name: 123 });

    expect(ctx.sendError).toHaveBeenCalled();
  });

  test('sendError when name is too long', async () => {
    const { socket, ctx } = setup();
    const longName = 'a'.repeat(101);
    await socket._handlers['rename_playlist']({ playlistId: 'pl1', name: longName });

    expect(ctx.sendError).toHaveBeenCalledWith(socket, expect.stringContaining('too long'));
  });
});

// ── activate_playlist ─────────────────────────────────────────────────────────

describe('activate_playlist', () => {
  test('happy path: activates playlist and broadcasts state', async () => {
    const gm = makeGm();
    const { socket, ctx } = setup({}, { gm });
    await socket._handlers['activate_playlist']({ playlistId: 'pl1' });

    expect(ctx.HandLogger.getPlaylistHands).toHaveBeenCalledWith('pl1');
    expect(gm.activatePlaylistMode).toHaveBeenCalled();
    expect(ctx.broadcastState).toHaveBeenCalledWith('table1', expect.objectContaining({ type: 'playlist_activated' }));
  });

  test('emits playlist_state after activation', async () => {
    const { socket, ctx } = setup();
    await socket._handlers['activate_playlist']({ playlistId: 'pl1' });

    const ioToMock = ctx.io.to.mock.results[0]?.value;
    expect(ioToMock.emit).toHaveBeenCalledWith('playlist_state', expect.objectContaining({ playlists: DEFAULT_PLAYLISTS }));
  });

  test('non-coach is rejected', async () => {
    const { socket, ctx } = setup({ isCoach: false });
    await socket._handlers['activate_playlist']({ playlistId: 'pl1' });

    expect(ctx.HandLogger.getPlaylistHands).not.toHaveBeenCalled();
  });

  test('sendError when no game manager', async () => {
    const { socket, ctx } = setup({}, { gm: null });
    await socket._handlers['activate_playlist']({ playlistId: 'pl1' });

    expect(ctx.sendError).toHaveBeenCalledWith(socket, 'Not in a room');
  });

  test('sendError when phase !== waiting', async () => {
    const gm = makeGm();
    gm.state.phase = 'preflop';
    const { socket, ctx } = setup({}, { gm });
    await socket._handlers['activate_playlist']({ playlistId: 'pl1' });

    expect(ctx.sendError).toHaveBeenCalledWith(socket, expect.stringContaining('between hands'));
  });

  test('sendError when playlist is empty', async () => {
    const hl = makeHandLogger({ getPlaylistHands: jest.fn().mockResolvedValue([]) });
    const { socket, ctx } = setup({}, { HandLogger: hl });
    await socket._handlers['activate_playlist']({ playlistId: 'pl1' });

    expect(ctx.sendError).toHaveBeenCalledWith(socket, 'Playlist is empty');
  });

  test('deactivates and sendError when no matching-player-count hands found', async () => {
    const gm = makeGm();
    const ctx = makeCtx({ gm });
    ctx.findMatchingPlaylistIndex = jest.fn().mockResolvedValue(-1);
    const socket = makeSocket();
    registerPlaylists(socket, ctx);
    await socket._handlers['activate_playlist']({ playlistId: 'pl1' });

    expect(gm.deactivatePlaylistMode).toHaveBeenCalled();
    expect(ctx.sendError).toHaveBeenCalledWith(socket, expect.stringContaining('no'));
  });

  test('emits warning notification when loadScenarioIntoConfig returns error', async () => {
    const gm = makeGm();
    const hl = makeHandLogger({ getHandDetail: jest.fn().mockResolvedValue({ hand_id: 'h1' }) });
    const ctx = makeCtx({ gm, HandLogger: hl });
    ctx.loadScenarioIntoConfig = jest.fn().mockReturnValue({ error: 'config error' });
    const socket = makeSocket();
    registerPlaylists(socket, ctx);
    await socket._handlers['activate_playlist']({ playlistId: 'pl1' });

    const ioToMock = ctx.io.to.mock.results[0]?.value;
    expect(ioToMock.emit).toHaveBeenCalledWith('notification', expect.objectContaining({ type: 'warning' }));
  });

  test('sendError when REST drill session is active (conflict guard)', async () => {
    PlaylistExecutionService.getStatus.mockResolvedValueOnce({ active: true });
    const gm = makeGm();
    const { socket, ctx } = setup({}, { gm });
    await socket._handlers['activate_playlist']({ playlistId: 'pl1' });

    expect(ctx.sendError).toHaveBeenCalledWith(socket, expect.stringContaining('drill session'));
    expect(gm.activatePlaylistMode).not.toHaveBeenCalled();
  });

  test('proceeds normally when REST drill session is inactive', async () => {
    PlaylistExecutionService.getStatus.mockResolvedValueOnce({ active: false });
    const gm = makeGm();
    const { socket, ctx } = setup({}, { gm });
    await socket._handlers['activate_playlist']({ playlistId: 'pl1' });

    expect(gm.activatePlaylistMode).toHaveBeenCalled();
  });
});

// ── deactivate_playlist ───────────────────────────────────────────────────────

describe('deactivate_playlist', () => {
  test('happy path: deactivates and broadcasts state', () => {
    const gm = makeGm();
    const { socket, ctx } = setup({}, { gm });
    socket._handlers['deactivate_playlist']();

    expect(gm.deactivatePlaylistMode).toHaveBeenCalled();
    expect(ctx.broadcastState).toHaveBeenCalledWith('table1', expect.objectContaining({ type: 'playlist_deactivated' }));
  });

  test('non-coach is rejected', () => {
    const { socket, ctx } = setup({ isCoach: false });
    socket._handlers['deactivate_playlist']();

    expect(ctx.broadcastState).not.toHaveBeenCalled();
  });

  test('sendError when not in a room', () => {
    const { socket, ctx } = setup({}, { gm: null });
    socket._handlers['deactivate_playlist']();

    expect(ctx.sendError).toHaveBeenCalledWith(socket, 'Not in a room');
  });
});
