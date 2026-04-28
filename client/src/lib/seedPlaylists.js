import { apiFetch } from './api';

export const DEFAULT_PLAYLISTS = [
  'Dry Flop Spots',
  'Wet Flop Spots',
  'Paired Boards',
  'Monotone Boards',
  'Overpair Boards',
  'Flush Draw Boards',
  'Connected Boards',
  'Two-Pair Spots',
];

export async function seedDefaultPlaylists({ existing, fetch = apiFetch } = {}) {
  if (!Array.isArray(existing)) return { seeded: false, created: [] };
  const alreadySeeded = DEFAULT_PLAYLISTS.every(name => existing.some(p => p.name === name));
  if (alreadySeeded) return { seeded: false, created: [] };
  const created = [];
  for (const name of DEFAULT_PLAYLISTS) {
    try {
      const pl = await fetch('/api/playlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (pl) created.push(pl);
    } catch {
      // continue — one failure shouldn't block the rest
    }
  }
  return { seeded: true, created };
}
