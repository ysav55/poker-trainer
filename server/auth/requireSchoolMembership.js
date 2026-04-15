'use strict';

/**
 * Middleware factory: Verify user belongs to the specified school.
 * Extracts schoolId from route param or query.
 * Returns 403 if user.school_id doesn't match (unless user is admin).
 * Admins can always access any school; non-admins must match their school_id.
 *
 * Usage:
 *   app.get('/api/settings/school/:school_id', requireSchoolMembership('school_id'), handler)
 *   app.get('/api/schools', requireSchoolMembership('id', 'query'), handler)
 *
 * @param {string} paramName - request param/query key where schoolId is found (default: 'school_id')
 * @param {string} source - 'params' or 'query' (default: 'params')
 * @returns {Function} Express middleware
 */
function requireSchoolMembership(paramName = 'school_id', source = 'params') {
  return (req, res, next) => {
    // Check authentication
    if (!req.user) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    // Extract schoolId from request
    const schoolId = source === 'query' ? req.query[paramName] : req.params[paramName];

    // Verify school ownership
    const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
    const ownsSchool = req.user.school_id === schoolId;

    if (!isAdmin && !ownsSchool) {
      return res.status(403).json({ error: 'forbidden', message: 'You do not belong to this school' });
    }

    // Store schoolId on request for downstream handlers
    req.schoolId = schoolId;
    next();
  };
}

module.exports = { requireSchoolMembership };
