'use strict';

/**
 * playlists.test.js — Phase 4 routing test for branch_to_drill.
 *
 * Verifies the new branch_to_drill event:
 *   • requires handId
 *   • requires either playlistId OR newPlaylistName
 *   • creates a new playlist when only newPlaylistName is given
 *   • adds the hand to the (resolved) playlist via HandLogger
 *   • emits branch_to_drill_saved + playlist_state + notification
 *   • cursor is forwarded to the saved event (currently informational only)
 */

const registerPlaylists = require('../../../socket/handlers/playlists');

function buildCtx({ requireCoach } = {}) {
  const HandLogger = {
    addHandToPlaylist: jest.fn().mockResolvedValue(true),
    createPlaylist:    jest.fn().mockResolvedValue({ playlist_id: 'newly-created-pl', name: 'X' }),
    getPlaylists:      jest.fn().mockResolvedValue([{ playlist_id: 'a', name: 'A', hand_count: 1 }]),
    getPlaylist:       jest.fn().mockResolvedValue({ playlist_id: 'pl-existing', name: 'X', table_id: 't1' }),
    updateCoachTags:   jest.fn().mockResolvedValue(true),
    removeHandFromPlaylist: jest.fn().mockResolvedValue(true),
    deletePlaylist:    jest.fn().mockResolvedValue(true),
    getPlaylistHands:  jest.fn().mockResolvedValue([]),
    getHandDetail:     jest.fn().mockResolvedValue(null),
  };
  return {
    tables: new Map(),
    io: { to: jest.fn().mockReturnValue({ emit: jest.fn() }) },
    broadcastState: jest.fn(),
    sendError: jest.fn(),
    requireCoach: requireCoach ?? jest.fn().mockReturnValue(false),
    HandLogger,
    activeNonCoachCount: jest.fn().mockReturnValue(0),
    findMatchingPlaylistIndex: jest.fn().mockResolvedValue(-1),
    loadScenarioIntoConfig: jest.fn(),
    _HandLogger: HandLogger,
  };
}

function buildSocket(tableId = 't1') {
  return {
    id: 'coach-1',
    data: { tableId, isCoach: true, name: 'Coach', stableId: 's-coach' },
    on: jest.fn(),
    emit: jest.fn(),
  };
}

function getHandler(socket, eventName) {
  const call = socket.on.mock.calls.find(([name]) => name === eventName);
  return call?.[1];
}

describe('branch_to_drill handler', () => {
  beforeEach(() => jest.clearAllMocks());

  test('rejects non-coach via requireCoach gate', async () => {
    const ctx = buildCtx({ requireCoach: jest.fn().mockReturnValue(true) });
    const socket = buildSocket();
    registerPlaylists(socket, ctx);
    const handler = getHandler(socket, 'branch_to_drill');

    await handler({ handId: 'h-1', playlistId: 'pl-1' });

    expect(ctx._HandLogger.addHandToPlaylist).not.toHaveBeenCalled();
  });

  test('requires handId', async () => {
    const ctx = buildCtx();
    const socket = buildSocket();
    registerPlaylists(socket, ctx);
    const handler = getHandler(socket, 'branch_to_drill');

    await handler({ playlistId: 'pl-1' });

    expect(ctx.sendError).toHaveBeenCalledWith(socket, 'handId is required');
    expect(ctx._HandLogger.addHandToPlaylist).not.toHaveBeenCalled();
  });

  test('requires either playlistId or newPlaylistName', async () => {
    const ctx = buildCtx();
    const socket = buildSocket();
    registerPlaylists(socket, ctx);
    const handler = getHandler(socket, 'branch_to_drill');

    await handler({ handId: 'h-1' });

    expect(ctx.sendError).toHaveBeenCalledWith(socket, expect.stringContaining('playlistId or newPlaylistName'));
    expect(ctx._HandLogger.addHandToPlaylist).not.toHaveBeenCalled();
  });

  test('rejects empty newPlaylistName', async () => {
    const ctx = buildCtx();
    const socket = buildSocket();
    registerPlaylists(socket, ctx);
    const handler = getHandler(socket, 'branch_to_drill');

    await handler({ handId: 'h-1', newPlaylistName: '   ' });

    expect(ctx.sendError).toHaveBeenCalledWith(socket, 'newPlaylistName cannot be empty');
    expect(ctx._HandLogger.createPlaylist).not.toHaveBeenCalled();
  });

  test('adds to existing playlist when playlistId provided', async () => {
    const ctx = buildCtx();
    const socket = buildSocket();
    registerPlaylists(socket, ctx);
    const handler = getHandler(socket, 'branch_to_drill');

    await handler({ handId: 'h-1', playlistId: 'pl-existing' });

    expect(ctx._HandLogger.createPlaylist).not.toHaveBeenCalled();
    expect(ctx._HandLogger.addHandToPlaylist).toHaveBeenCalledWith('pl-existing', 'h-1');
    expect(socket.emit).toHaveBeenCalledWith('branch_to_drill_saved', expect.objectContaining({
      playlistId: 'pl-existing',
      handId: 'h-1',
      cursor: null,
    }));
  });

  test('creates new playlist when newPlaylistName provided', async () => {
    const ctx = buildCtx();
    const socket = buildSocket();
    registerPlaylists(socket, ctx);
    const handler = getHandler(socket, 'branch_to_drill');

    await handler({ handId: 'h-1', newPlaylistName: 'River Mistakes' });

    expect(ctx._HandLogger.createPlaylist).toHaveBeenCalledWith(expect.objectContaining({
      name: 'River Mistakes',
      tableId: 't1',
    }));
    expect(ctx._HandLogger.addHandToPlaylist).toHaveBeenCalledWith('newly-created-pl', 'h-1');
    expect(socket.emit).toHaveBeenCalledWith('branch_to_drill_saved', expect.objectContaining({
      playlistId: 'newly-created-pl',
      handId: 'h-1',
    }));
  });

  test('forwards numeric cursor; leaves non-numeric as null', async () => {
    const ctx = buildCtx();
    const socket = buildSocket();
    registerPlaylists(socket, ctx);
    const handler = getHandler(socket, 'branch_to_drill');

    await handler({ handId: 'h-1', playlistId: 'pl-1', cursor: 5 });
    expect(socket.emit).toHaveBeenCalledWith('branch_to_drill_saved', expect.objectContaining({ cursor: 5 }));

    socket.emit.mockClear();
    await handler({ handId: 'h-2', playlistId: 'pl-1', cursor: 'flop' });
    expect(socket.emit).toHaveBeenCalledWith('branch_to_drill_saved', expect.objectContaining({ cursor: null }));
  });

  test('emits playlist_state refresh + branched_to_drill notification', async () => {
    const ctx = buildCtx();
    const socket = buildSocket();
    registerPlaylists(socket, ctx);
    const handler = getHandler(socket, 'branch_to_drill');

    await handler({ handId: 'h-1', playlistId: 'pl-existing' });

    expect(socket.emit).toHaveBeenCalledWith('playlist_state', expect.objectContaining({ playlists: expect.any(Array) }));
    expect(socket.emit).toHaveBeenCalledWith('notification', expect.objectContaining({ type: 'branched_to_drill' }));
  });

  test('forwards repository errors to sendError', async () => {
    const ctx = buildCtx();
    ctx._HandLogger.addHandToPlaylist.mockRejectedValueOnce(new Error('db down'));
    const socket = buildSocket();
    registerPlaylists(socket, ctx);
    const handler = getHandler(socket, 'branch_to_drill');

    await handler({ handId: 'h-1', playlistId: 'pl-existing' });

    expect(ctx.sendError).toHaveBeenCalledWith(socket, expect.stringContaining('db down'));
  });

  test('rejects when both playlistId and newPlaylistName provided', async () => {
    const ctx = buildCtx();
    const socket = buildSocket();
    registerPlaylists(socket, ctx);
    const handler = getHandler(socket, 'branch_to_drill');

    await handler({ handId: 'h-1', playlistId: 'pl-1', newPlaylistName: 'Other' });

    expect(ctx.sendError).toHaveBeenCalledWith(socket, expect.stringContaining('not both'));
    expect(ctx._HandLogger.addHandToPlaylist).not.toHaveBeenCalled();
    expect(ctx._HandLogger.createPlaylist).not.toHaveBeenCalled();
  });

  test('rejects playlistId belonging to a different table', async () => {
    const ctx = buildCtx();
    ctx._HandLogger.getPlaylist.mockResolvedValueOnce({
      playlist_id: 'pl-other', name: 'Other table drill', table_id: 'other-table',
    });
    const socket = buildSocket();
    registerPlaylists(socket, ctx);
    const handler = getHandler(socket, 'branch_to_drill');

    await handler({ handId: 'h-1', playlistId: 'pl-other' });

    expect(ctx.sendError).toHaveBeenCalledWith(socket, expect.stringContaining('different table'));
    expect(ctx._HandLogger.addHandToPlaylist).not.toHaveBeenCalled();
  });

  test('allows playlistId with null table_id (legacy global playlist)', async () => {
    const ctx = buildCtx();
    ctx._HandLogger.getPlaylist.mockResolvedValueOnce({
      playlist_id: 'pl-global', name: 'Global', table_id: null,
    });
    const socket = buildSocket();
    registerPlaylists(socket, ctx);
    const handler = getHandler(socket, 'branch_to_drill');

    await handler({ handId: 'h-1', playlistId: 'pl-global' });

    expect(ctx._HandLogger.addHandToPlaylist).toHaveBeenCalledWith('pl-global', 'h-1');
  });

  test('rejects unknown playlistId', async () => {
    const ctx = buildCtx();
    ctx._HandLogger.getPlaylist.mockResolvedValueOnce(null);
    const socket = buildSocket();
    registerPlaylists(socket, ctx);
    const handler = getHandler(socket, 'branch_to_drill');

    await handler({ handId: 'h-1', playlistId: 'pl-missing' });

    expect(ctx.sendError).toHaveBeenCalledWith(socket, 'Playlist not found');
    expect(ctx._HandLogger.addHandToPlaylist).not.toHaveBeenCalled();
  });

  test('rolls back newly-created playlist when addHandToPlaylist fails', async () => {
    const ctx = buildCtx();
    ctx._HandLogger.addHandToPlaylist.mockRejectedValueOnce(new Error('db transient'));
    const socket = buildSocket();
    registerPlaylists(socket, ctx);
    const handler = getHandler(socket, 'branch_to_drill');

    await handler({ handId: 'h-1', newPlaylistName: 'Will Orphan' });

    expect(ctx._HandLogger.createPlaylist).toHaveBeenCalled();
    expect(ctx._HandLogger.deletePlaylist).toHaveBeenCalledWith('newly-created-pl');
    expect(ctx.sendError).toHaveBeenCalledWith(socket, expect.stringContaining('db transient'));
  });

  test('does NOT delete playlist on add-failure when adding to existing playlist', async () => {
    const ctx = buildCtx();
    ctx._HandLogger.addHandToPlaylist.mockRejectedValueOnce(new Error('db transient'));
    const socket = buildSocket();
    registerPlaylists(socket, ctx);
    const handler = getHandler(socket, 'branch_to_drill');

    await handler({ handId: 'h-1', playlistId: 'pl-existing' });

    expect(ctx._HandLogger.deletePlaylist).not.toHaveBeenCalled();
    expect(ctx.sendError).toHaveBeenCalled();
  });
});
