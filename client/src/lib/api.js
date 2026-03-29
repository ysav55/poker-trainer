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
    if (res.status === 401) {
      localStorage.removeItem('poker_trainer_jwt');
      localStorage.removeItem('poker_trainer_player_id');
      const err = new Error('Session expired — please log in again');
      err.status = 401;
      throw err;
    }
    let message = `HTTP ${res.status}`;
    try { message = (await res.json()).message || message; } catch { /* not JSON */ }
    throw new Error(message);
  }
  return res.json();
}
