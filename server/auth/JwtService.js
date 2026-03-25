'use strict';

/**
 * JwtService — the single module that owns JSON Web Token operations.
 *
 * No other module should import 'jsonwebtoken' directly.
 * All token signing and verification goes through here.
 */

const jwt = require('jsonwebtoken');

const SECRET = process.env.SESSION_SECRET;

/**
 * Sign a payload and return a signed JWT string.
 * @param {{ stableId: string, name: string, role: string }} payload
 * @returns {string}
 */
function sign(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: '7d' });
}

/**
 * Verify a token string and return the decoded payload.
 * Returns null if the token is missing, expired, or tampered with.
 * @param {string} token
 * @returns {{ stableId: string, name: string, role: string } | null}
 */
function verify(token) {
  if (!token) return null;
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}

module.exports = { sign, verify };
