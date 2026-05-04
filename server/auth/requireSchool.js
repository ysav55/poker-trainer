'use strict';

const supabase = require('../db/supabase.js');

// In-memory cache: Map<playerId, { school_id, fetchedAt }>
const cache = new Map();
const SCHOOL_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Express middleware — resolves req.user.school_id from player_profiles.
 * Caches the school_id per playerId with 5-minute TTL.
 * Returns 403 if school_id is null (not assigned to any school).
 * Returns 500 if Supabase lookup fails.
 *
 * Usage: router.get('/notes', requireAuth, requireSchool, handler)
 *
 * @param {Object} req   - Express request (must have req.user from requireAuth)
 * @param {Object} res   - Express response
 * @param {Function} next - Express next
 */
async function requireSchool(req, res, next) {
  const uid = req.user?.id ?? req.user?.stableId;
  if (!uid) {
    return res.status(401).json({ error: 'auth_required' });
  }

  // Check cache
  const cached = cache.get(uid);
  if (cached && Date.now() - cached.fetchedAt < SCHOOL_CACHE_TTL_MS) {
    if (!cached.school_id) {
      return res.status(403).json({ error: 'no_school_assignment', message: 'Your account is not assigned to a school. Contact admin.' });
    }
    req.user.school_id = cached.school_id;
    return next();
  }

  // Query Supabase
  const { data, error } = await supabase
    .from('player_profiles')
    .select('school_id')
    .eq('id', uid)
    .single();

  if (error) {
    return res.status(500).json({ error: 'school_lookup_failed', message: error.message });
  }

  // Cache the result (even if null)
  cache.set(uid, { school_id: data?.school_id ?? null, fetchedAt: Date.now() });

  if (!data?.school_id) {
    return res.status(403).json({ error: 'no_school_assignment', message: 'Your account is not assigned to a school. Contact admin.' });
  }

  req.user.school_id = data.school_id;
  return next();
}

/**
 * Clear the cache (for testing and cache invalidation).
 */
requireSchool.__clearCache = () => cache.clear();

module.exports = requireSchool;
