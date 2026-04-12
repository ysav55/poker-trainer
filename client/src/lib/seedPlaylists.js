import { apiFetch } from './api';

export const DEFAULT_PLAYLISTS = [
  'Dry Flop Spots',
  'Wet Flop Spots',
  'Paired Boards',
  'Monotone Boards',
  '3-Bet Pots',
  'Squeeze Pots',
  'Single-Raised Pots',
  'Limped Pots',
];

export async function seedDefaultPlaylists({ existing, fetch = apiFetch } = {}) {
  if (!Array.isArray(existing) || existing.length > 0) return { seeded: false, created: [] };
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
