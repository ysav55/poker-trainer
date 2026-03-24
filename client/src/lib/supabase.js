/**
 * Supabase client — REMOVED.
 *
 * The browser no longer has direct database access. All data flows
 * through the Express server, which holds the service-role key.
 *
 * If you see this error, a component still imports from this file.
 * Replace that import with apiFetch from '../lib/api'.
 */

export const supabase = new Proxy(
  {},
  {
    get(_, prop) {
      throw new Error(
        `[supabase] Direct DB access is disabled. ` +
        `Attempted to access supabase.${String(prop)} — use apiFetch() instead.`
      );
    },
  }
);
