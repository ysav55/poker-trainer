'use strict';

const supabase = require('../db/supabase.js');

// Cache: Map<playerId, schoolId | null>
// schoolId=null means no school assigned (all features enabled).
// schoolId=false means player not found.
const schoolIdCache      = new Map();
const schoolIdCacheTime  = new Map();
const SCHOOL_ID_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Cache: Map<schoolId, Map<featureKey, boolean>>
const featureCache = new Map();
const FEATURE_CACHE_TTL_MS = 60_000; // 1 minute
const featureCacheTimes = new Map();

async function getSchoolIdForPlayer(playerId) {
  if (schoolIdCache.has(playerId)) {
    const age = Date.now() - (schoolIdCacheTime.get(playerId) ?? 0);
    if (age < SCHOOL_ID_CACHE_TTL_MS) return schoolIdCache.get(playerId);
    schoolIdCache.delete(playerId);
    schoolIdCacheTime.delete(playerId);
  }

  const { data } = await supabase
    .from('player_profiles')
    .select('school_id')
    .eq('id', playerId)
    .maybeSingle();

  const schoolId = data?.school_id ?? null;
  schoolIdCache.set(playerId, schoolId);
  schoolIdCacheTime.set(playerId, Date.now());
  return schoolId;
}

async function isFeatureEnabled(schoolId, featureKey) {
  if (!schoolId) return true; // no school = all features enabled

  const now = Date.now();
  const cacheTime = featureCacheTimes.get(schoolId);
  if (cacheTime && now - cacheTime < FEATURE_CACHE_TTL_MS && featureCache.has(schoolId)) {
    const cached = featureCache.get(schoolId);
    return cached.has(featureKey) ? cached.get(featureKey) : true;
  }

  // Reload all features for this school in one query
  const { data } = await supabase
    .from('settings')
    .select('key, value')
    .eq('scope', 'school')
    .eq('scope_id', schoolId)
    .like('key', 'feature:%');

  const map = new Map();
  for (const row of (data || [])) {
    map.set(row.key, row.value?.enabled !== false);
  }
  featureCache.set(schoolId, map);
  featureCacheTimes.set(schoolId, now);

  return map.has(featureKey) ? map.get(featureKey) : true;
}

/**
 * Express middleware factory.
 * requireFeature('analysis') → blocks if feature:analysis is disabled for the
 * user's school. Users without a school are always allowed through.
 */
function requireFeature(shortKey) {
  const featureKey = shortKey.startsWith('feature:') ? shortKey : `feature:${shortKey}`;

  return async (req, res, next) => {
    try {
      const userId = req.user?.stableId ?? req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const schoolId = await getSchoolIdForPlayer(userId);
      const enabled  = await isFeatureEnabled(schoolId, featureKey);

      if (!enabled) {
        return res.status(403).json({
          error:   'feature_disabled',
          message: `This feature (${shortKey}) is not enabled for your school.`,
        });
      }
      return next();
    } catch (err) {
      // On error, fail open (don't block users due to a settings lookup failure)
      return next();
    }
  };
}

/** Invalidate cached school-id for a player (call after school assignment changes). */
function invalidatePlayerSchoolCache(playerId) {
  schoolIdCache.delete(playerId);
  schoolIdCacheTime.delete(playerId);
}

/** Invalidate feature cache for a school (call after feature toggles change). */
function invalidateSchoolFeatureCache(schoolId) {
  featureCache.delete(schoolId);
  featureCacheTimes.delete(schoolId);
}

module.exports = {
  requireFeature,
  invalidatePlayerSchoolCache,
  invalidateSchoolFeatureCache,
  // Exported for testing
  getSchoolIdForPlayer,
  isFeatureEnabled,
};
