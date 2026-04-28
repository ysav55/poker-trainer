import { describe, it, expect, vi } from 'vitest';
import { seedDefaultPlaylists, DEFAULT_PLAYLISTS } from '../lib/seedPlaylists.js';

describe('seedDefaultPlaylists', () => {
  it('seeds 8 playlists when existing is empty', async () => {
    const fetch = vi.fn().mockImplementation(async (_path, opts) => ({
      playlist_id: 'id-' + JSON.parse(opts.body).name,
      name: JSON.parse(opts.body).name,
    }));
    const { seeded, created } = await seedDefaultPlaylists({ existing: [], fetch });
    expect(seeded).toBe(true);
    expect(created).toHaveLength(8);
    expect(fetch).toHaveBeenCalledTimes(8);
    created.forEach((pl, i) => expect(pl.name).toBe(DEFAULT_PLAYLISTS[i]));
  });

  it('DOES seed when existing playlists do not include seed names', async () => {
    const fetch = vi.fn().mockImplementation(async (_path, opts) => ({
      playlist_id: 'id-' + JSON.parse(opts.body).name,
      name: JSON.parse(opts.body).name,
    }));
    const { seeded, created } = await seedDefaultPlaylists({
      existing: [{ playlist_id: 'x', name: 'My Playlist' }],
      fetch,
    });
    expect(seeded).toBe(true);
    expect(created).toHaveLength(8);
    expect(fetch).toHaveBeenCalledTimes(8);
  });

  it('does NOT seed when existing is missing/null', async () => {
    const fetch = vi.fn();
    const r1 = await seedDefaultPlaylists({ existing: null, fetch });
    const r2 = await seedDefaultPlaylists({ existing: undefined, fetch });
    expect(r1.seeded).toBe(false);
    expect(r2.seeded).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('continues seeding if a POST rejects', async () => {
    let call = 0;
    const fetch = vi.fn().mockImplementation(async () => {
      call += 1;
      if (call === 3) throw new Error('boom');
      return { playlist_id: 'id-' + call, name: 'p' + call };
    });
    const { created } = await seedDefaultPlaylists({ existing: [], fetch });
    expect(fetch).toHaveBeenCalledTimes(8);
    expect(created).toHaveLength(7);
  });
});
