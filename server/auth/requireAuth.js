'use strict';

const JwtService = require('./JwtService');

/**
 * Express middleware — requires a valid JWT in the Authorization header.
 * On success, attaches the decoded payload to req.user and calls next().
 * On failure, responds 401.
 */
function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'auth_required', message: 'Login required' });
  }
  const payload = JwtService.verify(auth.slice(7));
  if (!payload) {
    return res.status(401).json({ error: 'invalid_token', message: 'Session expired — please log in again' });
  }
  req.user = payload;
  req.user.id = payload.stableId;
  next();
}

module.exports = requireAuth;
