'use strict';

/**
 * JwtService unit tests
 *
 * Verifies that sign() and verify() behave correctly for all token states.
 * Uses a fixed test secret — no dependency on environment variables.
 */

// Set secret before the module is loaded
process.env.SESSION_SECRET = 'test-secret-for-jwt-service';

const JwtService = require('../JwtService');

describe('JwtService', () => {

  const payload = { stableId: 'uuid-123', name: 'Alice', role: 'student' };

  // ── sign() ─────────────────────────────────────────────────────────────────

  describe('sign()', () => {
    test('returns a non-empty string', () => {
      const token = JwtService.sign(payload);
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
    });

    test('produces a three-part JWT (header.payload.signature)', () => {
      const token = JwtService.sign(payload);
      expect(token.split('.')).toHaveLength(3);
    });
  });

  // ── verify() ───────────────────────────────────────────────────────────────

  describe('verify()', () => {
    test('returns the payload for a valid token', () => {
      const token = JwtService.sign(payload);
      const result = JwtService.verify(token);
      expect(result).toMatchObject(payload);
    });

    test('returns null for null input', () => {
      expect(JwtService.verify(null)).toBeNull();
    });

    test('returns null for undefined input', () => {
      expect(JwtService.verify(undefined)).toBeNull();
    });

    test('returns null for an empty string', () => {
      expect(JwtService.verify('')).toBeNull();
    });

    test('returns null for a tampered token', () => {
      const token = JwtService.sign(payload);
      const tampered = token.slice(0, -5) + 'XXXXX';
      expect(JwtService.verify(tampered)).toBeNull();
    });

    test('returns null for a token signed with a different secret', () => {
      const jwt = require('jsonwebtoken');
      const foreignToken = jwt.sign(payload, 'completely-different-secret');
      expect(JwtService.verify(foreignToken)).toBeNull();
    });

    test('returns null for a completely invalid string', () => {
      expect(JwtService.verify('not.a.token')).toBeNull();
    });
  });

  // ── round-trip ─────────────────────────────────────────────────────────────

  describe('round-trip', () => {
    test('sign then verify preserves stableId, name, and role', () => {
      const cases = [
        { stableId: 'aaa-111', name: 'Bob',   role: 'coach'   },
        { stableId: 'bbb-222', name: 'Carol', role: 'student' },
      ];
      for (const p of cases) {
        const result = JwtService.verify(JwtService.sign(p));
        expect(result.stableId).toBe(p.stableId);
        expect(result.name).toBe(p.name);
        expect(result.role).toBe(p.role);
      }
    });
  });

});
