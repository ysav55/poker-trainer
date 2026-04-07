'use strict';

/**
 * requireRole unit tests.
 *
 * Verifies the hierarchy-aware role check:
 *   - requireRole('coach')  passes for coach, admin, superadmin
 *   - requireRole('admin')  passes for admin and superadmin only
 *   - requireRole('superadmin') passes for superadmin only
 *   - Roles outside the hierarchy map use exact-match
 */

const requireRole = require('../requireRole');

function makeReqRes(role) {
  const req = { user: { role } };
  const res = {
    status: jest.fn().mockReturnThis(),
    json:   jest.fn().mockReturnThis(),
  };
  const next = jest.fn();
  return { req, res, next };
}

describe('requireRole — hierarchy', () => {
  describe("requireRole('coach')", () => {
    const mw = requireRole('coach');

    test('passes for coach', () => {
      const { req, res, next } = makeReqRes('coach');
      mw(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    test('passes for admin', () => {
      const { req, res, next } = makeReqRes('admin');
      mw(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    test('passes for superadmin', () => {
      const { req, res, next } = makeReqRes('superadmin');
      mw(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    test('blocks coached_student', () => {
      const { req, res, next } = makeReqRes('coached_student');
      mw(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });

    test('blocks solo_student', () => {
      const { req, res, next } = makeReqRes('solo_student');
      mw(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });

    test('blocks player', () => {
      const { req, res, next } = makeReqRes('player');
      mw(req, res, next);
      expect(next).not.toHaveBeenCalled();
    });

    test('blocks when req.user is missing', () => {
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();
      mw({}, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe("requireRole('admin')", () => {
    const mw = requireRole('admin');

    test('passes for admin', () => {
      const { req, res, next } = makeReqRes('admin');
      mw(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    test('passes for superadmin', () => {
      const { req, res, next } = makeReqRes('superadmin');
      mw(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    test('blocks coach', () => {
      const { req, res, next } = makeReqRes('coach');
      mw(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe("requireRole('superadmin')", () => {
    const mw = requireRole('superadmin');

    test('passes for superadmin', () => {
      const { req, res, next } = makeReqRes('superadmin');
      mw(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    test('blocks admin', () => {
      const { req, res, next } = makeReqRes('admin');
      mw(req, res, next);
      expect(next).not.toHaveBeenCalled();
    });

    test('blocks coach', () => {
      const { req, res, next } = makeReqRes('coach');
      mw(req, res, next);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('exact-match fallback (roles not in hierarchy map)', () => {
    test("requireRole('coached_student') passes for coached_student only", () => {
      const mw = requireRole('coached_student');

      const { req, res, next } = makeReqRes('coached_student');
      mw(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);

      const { req: req2, res: res2, next: next2 } = makeReqRes('admin');
      mw(req2, res2, next2);
      expect(next2).not.toHaveBeenCalled();
    });

    test("requireRole('solo_student') passes for solo_student only", () => {
      const mw = requireRole('solo_student');

      const { req, res, next } = makeReqRes('solo_student');
      mw(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);

      const { req: req2, res: res2, next: next2 } = makeReqRes('coached_student');
      mw(req2, res2, next2);
      expect(next2).not.toHaveBeenCalled();
    });
  });
});
