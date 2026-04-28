'use strict';

jest.mock('../../db/repositories/ScenarioBuilderRepository');
jest.mock('../../db/HandLoggerSupabase');

const repo = require('../../db/repositories/ScenarioBuilderRepository');
const HandLogger = require('../../db/HandLoggerSupabase');
const svc = require('../PlaylistExecutionService');

beforeEach(() => {
  jest.resetAllMocks();
  HandLogger.getPlaylists = jest.fn().mockResolvedValue([
    { playlist_id: 'p1', ordering: 'sequential' },
  ]);
  repo.getActiveDrillSession = jest.fn().mockResolvedValue(null);
  repo.getPausedDrillSession = jest.fn().mockResolvedValue(null);
  repo.getPlaylistItems = jest.fn().mockResolvedValue([
    { id: 'i1', scenario: { id: 's1', player_count: 3 } },
  ]);
  repo.createDrillSession = jest.fn().mockImplementation(async (args) => ({
    id: 'ds1',
    current_position: 0,
    items_total: 1,
    status: 'active',
    ...args,
  }));
  repo.updateDrillSession = jest.fn().mockImplementation(async (_id, patch) => ({ id: 'ds1', ...patch }));
});

describe('PlaylistExecutionService.start with hero fields', () => {
  it('persists heroMode, heroPlayerId, autoAdvance when provided', async () => {
    await svc.start({
      tableId:       't1',
      playlistId:    'p1',
      coachId:       'c1',
      optedInPlayers: ['u1', 'u2', 'u3'],
      seatedCount:    3,
      heroMode:      'rotate',
      heroPlayerId:  'u2',
      autoAdvance:   true,
    });
    expect(repo.createDrillSession).toHaveBeenCalledWith(
      expect.objectContaining({
        heroMode: 'rotate',
        heroPlayerId: 'u2',
        autoAdvance: true,
      }),
    );
  });

  it('defaults heroMode=sticky, autoAdvance=false when omitted', async () => {
    await svc.start({
      tableId: 't1', playlistId: 'p1', coachId: 'c1',
      optedInPlayers: ['u1'], seatedCount: 3,
    });
    expect(repo.createDrillSession).toHaveBeenCalledWith(
      expect.objectContaining({ heroMode: 'sticky', autoAdvance: false }),
    );
  });

  it('returns { resumable: true } when a paused session exists and forceRestart is falsy', async () => {
    repo.getPausedDrillSession = jest.fn().mockResolvedValue({
      id: 'ds_old', playlist_id: 'p1', current_position: 5, items_total: 10, status: 'paused',
    });
    const out = await svc.start({
      tableId: 't1', playlistId: 'p1', coachId: 'c1',
      optedInPlayers: ['u1', 'u2', 'u3'], seatedCount: 3,
    });
    expect(out.resumable).toBe(true);
    expect(out.priorSessionId).toBe('ds_old');
    expect(repo.createDrillSession).not.toHaveBeenCalled();
  });

  it('overrides paused session when forceRestart is true', async () => {
    repo.getPausedDrillSession = jest.fn().mockResolvedValue({
      id: 'ds_old', playlist_id: 'p1', status: 'paused',
    });
    await svc.start({
      tableId: 't1', playlistId: 'p1', coachId: 'c1',
      optedInPlayers: ['u1', 'u2', 'u3'], seatedCount: 3,
      forceRestart: true,
    });
    expect(repo.updateDrillSession).toHaveBeenCalledWith('ds_old', { status: 'cancelled' });
    expect(repo.createDrillSession).toHaveBeenCalled();
  });
});

describe('PlaylistExecutionService.updateHeroPlayer', () => {
  it('updates hero_player_id on the active session', async () => {
    repo.getActiveDrillSession = jest.fn().mockResolvedValue({ id: 'ds1', status: 'active' });
    await svc.updateHeroPlayer('t1', 'u3');
    expect(repo.updateDrillSession).toHaveBeenCalledWith('ds1', { heroPlayerId: 'u3' });
  });
});

describe('PlaylistExecutionService.updateMode', () => {
  it('updates heroMode and autoAdvance on the active session', async () => {
    repo.getActiveDrillSession = jest.fn().mockResolvedValue({ id: 'ds1', status: 'active' });
    await svc.updateMode('t1', { heroMode: 'per_hand', autoAdvance: true });
    expect(repo.updateDrillSession).toHaveBeenCalledWith('ds1', {
      heroMode: 'per_hand', autoAdvance: true,
    });
  });
});
