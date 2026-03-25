'use strict';

/**
 * Express middleware factory — requires the authenticated user to have a specific role.
 * Must be used after requireAuth (depends on req.user being set).
 *
 * Usage: router.post('/admin', requireAuth, requireRole('coach'), handler)
 *
 * @param {string} role  - e.g. 'coach', 'admin'
 * @returns {Function}   - Express middleware
 */
function requireRole(role) {
  return function (req, res, next) {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ error: 'forbidden', message: `Requires role: ${role}` });
    }
    next();
  };
}

module.exports = requireRole;
