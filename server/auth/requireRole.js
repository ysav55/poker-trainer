'use strict';

/**
 * Role hierarchy: checking a lower tier also passes for higher tiers.
 * e.g. requireRole('coach') passes for admin and superadmin too.
 */
const ROLE_HIERARCHY = {
  coach:      new Set(['coach', 'admin', 'superadmin']),
  admin:      new Set(['admin', 'superadmin']),
  superadmin: new Set(['superadmin']),
};

/**
 * Express middleware factory — requires the authenticated user to have a specific role
 * (or a higher-ranked role per the hierarchy above).
 * Must be used after requireAuth (depends on req.user being set).
 *
 * Usage: router.post('/admin', requireAuth, requireRole('coach'), handler)
 *
 * @param {string} role  - e.g. 'coach', 'admin'
 * @returns {Function}   - Express middleware
 */
function requireRole(role) {
  return function (req, res, next) {
    const userRole = req.user?.role;
    const allowed  = ROLE_HIERARCHY[role] ?? new Set([role]);
    if (!userRole || !allowed.has(userRole)) {
      return res.status(403).json({ error: 'forbidden', message: `Requires role: ${role}` });
    }
    next();
  };
}

module.exports = requireRole;
