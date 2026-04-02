/**
 * apiFetch — thin wrapper around fetch that attaches the server-issued JWT
 * from localStorage to every request. All API calls go through Express;
 * no Supabase credentials are ever sent from the browser.
 *
 * Usage:
 *   import { apiFetch } from '../lib/api';
 *   const { hands } = await apiFetch('/api/hands?limit=50');
 */

const API_BASE = import.meta.env.DEV ? 'http://localhost:3001' : '';

export async function apiFetch(path, options = {}) {
  const token = localStorage.getItem('poker_trainer_jwt');
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try { message = (await res.json()).message || message; } catch { /* not JSON */ }
    if (res.status === 401) {
      // Only treat as "session expired" if there was a token — means the token was
      // rejected, not that credentials were wrong on a login attempt.
      const hadToken = !!localStorage.getItem('poker_trainer_jwt');
      localStorage.removeItem('poker_trainer_jwt');
      localStorage.removeItem('poker_trainer_player_id');
      const err = new Error(hadToken ? 'Session expired — please log in again' : message);
      err.status = 401;
      throw err;
    }
    throw new Error(message);
  }
  return res.json();
}
