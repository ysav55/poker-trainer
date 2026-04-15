'use strict';

/**
 * Middleware factory: Verify user belongs to the specified school.
 * Extracts schoolId from route param or query.
 * Returns 400 if schoolId is missing/falsy; 401 if not authenticated; 403 if unauthorized.
 * Admins can always access any school; non-admins must match their school_id.
 *
 * Usage:
 *   app.get('/api/settings/school/:school_id', requireSchoolMembership('school_id'), handler)
 *   app.get('/api/schools', requireSchoolMembership('id', 'query'), handler)
 *
 * @param {string} paramName - request param/query key where schoolId is found (default: 'school_id')
 * @param {string} source - 'params' or 'query' (default: 'params')
 * @requires Authentication (via requireAuth middleware)
 * @returns {Function} Express middleware
 */
function requireSchoolMembership(paramName = 'school_id', source = 'params') {
  return (req, res, next) => {
    // Check authentication
    if (!req.user) {
      return res.status(401).json({ error: 'unauthorized', message: 'Authentication required' });
    }

    // Extract schoolId from request
    const schoolId = source === 'query' ? req.query[paramName] : req.params[paramName];

    // Validate schoolId is present and non-empty
    if (!schoolId) {
      return res.status(400).json({ error: 'bad_request', message: 'schoolId parameter is required' });
    }

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

module.exports = requireSchoolMembership;
