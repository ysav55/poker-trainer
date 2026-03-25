'use strict';

/**
 * requireAuth middleware unit tests.
 *
 * Verifies that valid JWTs pass through (calling next() and attaching req.user),
 * and that invalid / missing tokens are rejected with 401.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../JwtService', () => ({
  verify: jest.fn(),
}));

// ─── Module under test ────────────────────────────────────────────────────────

const requireAuth = require('../requireAuth');
const { verify }  = require('../JwtService');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal mock Express response that tracks status/json calls. */
function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('requireAuth middleware', () => {

  // ── Happy path ─────────────────────────────────────────────────────────────

  describe('valid token', () => {
    test('calls next() for a valid token', () => {
      verify.mockReturnValueOnce({ stableId: 'u1', name: 'Alice', role: 'student' });
      const req  = { headers: { authorization: 'Bearer valid-token' } };
      const res  = makeRes();
      const next = jest.fn();

      requireAuth(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    test('attaches decoded payload to req.user', () => {
      const payload = { stableId: 'u1', name: 'Alice', role: 'student' };
      verify.mockReturnValueOnce(payload);
      const req  = { headers: { authorization: 'Bearer valid-token' } };
      const res  = makeRes();
      const next = jest.fn();

      requireAuth(req, res, next);

      expect(req.user).toEqual(payload);
    });

    test('passes the token string (without "Bearer ") to JwtService.verify', () => {
      verify.mockReturnValueOnce({ stableId: 'u2', name: 'Bob', role: 'coach' });
      const req  = { headers: { authorization: 'Bearer my-secret-token' } };
      const res  = makeRes();
      const next = jest.fn();

      requireAuth(req, res, next);

      expect(verify).toHaveBeenCalledWith('my-secret-token');
    });

    test('works for coach role', () => {
      verify.mockReturnValueOnce({ stableId: 'c1', name: 'Coach', role: 'coach' });
      const req  = { headers: { authorization: 'Bearer coach-token' } };
      const res  = makeRes();
      const next = jest.fn();

      requireAuth(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user.role).toBe('coach');
    });
  });

  // ── Missing / malformed Authorization header ────────────────────────────────

  describe('missing or malformed Authorization header', () => {
    test('returns 401 when no Authorization header is present', () => {
      const req  = { headers: {} };
      const res  = makeRes();
      const next = jest.fn();

      requireAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'auth_required' }));
      expect(next).not.toHaveBeenCalled();
    });

    test('returns 401 when Authorization header is empty string', () => {
      const req  = { headers: { authorization: '' } };
      const res  = makeRes();
      const next = jest.fn();

      requireAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    test('returns 401 when Authorization does not start with "Bearer "', () => {
      const req  = { headers: { authorization: 'Basic dXNlcjpwYXNz' } };
      const res  = makeRes();
      const next = jest.fn();

      requireAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'auth_required' }));
      expect(next).not.toHaveBeenCalled();
    });

    test('returns 401 for "Bearer" with no trailing space/token', () => {
      const req  = { headers: { authorization: 'Bearer' } };
      const res  = makeRes();
      const next = jest.fn();

      requireAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });
  });

  // ── Invalid token ───────────────────────────────────────────────────────────

  describe('invalid token', () => {
    test('returns 401 when JwtService.verify returns null', () => {
      verify.mockReturnValueOnce(null);
      const req  = { headers: { authorization: 'Bearer expired-or-tampered-token' } };
      const res  = makeRes();
      const next = jest.fn();

      requireAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'invalid_token' }));
      expect(next).not.toHaveBeenCalled();
    });

    test('returns 401 when JwtService.verify returns undefined', () => {
      verify.mockReturnValueOnce(undefined);
      const req  = { headers: { authorization: 'Bearer bad-token' } };
      const res  = makeRes();
      const next = jest.fn();

      requireAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    test('does not attach req.user when token is invalid', () => {
      verify.mockReturnValueOnce(null);
      const req  = { headers: { authorization: 'Bearer invalid' } };
      const res  = makeRes();
      const next = jest.fn();

      requireAuth(req, res, next);

      expect(req.user).toBeUndefined();
    });

    test('response message mentions "log in" for invalid token', () => {
      verify.mockReturnValueOnce(null);
      const req  = { headers: { authorization: 'Bearer stale-token' } };
      const res  = makeRes();
      const next = jest.fn();

      requireAuth(req, res, next);

      const jsonArg = res.json.mock.calls[0][0];
      expect(jsonArg.message).toMatch(/log in/i);
    });
  });

  // ── Synchronous guard ───────────────────────────────────────────────────────

  describe('synchronous execution', () => {
    test('middleware is synchronous — next is called before any await', () => {
      // requireAuth should call next() synchronously (no async)
      verify.mockReturnValueOnce({ stableId: 'u3', name: 'Carol', role: 'student' });
      const req  = { headers: { authorization: 'Bearer sync-token' } };
      const res  = makeRes();
      let nextCalledSync = false;
      const next = jest.fn(() => { nextCalledSync = true; });

      requireAuth(req, res, next);

      expect(nextCalledSync).toBe(true);
    });
  });
});
