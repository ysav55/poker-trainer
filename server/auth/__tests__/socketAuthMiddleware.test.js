'use strict';

/**
 * socketAuthMiddleware unit tests
 *
 * Verifies that the middleware populates socket.data correctly
 * for valid tokens, expired/tampered tokens, and missing tokens.
 */

// Must stub SESSION_SECRET before requiring JwtService
process.env.SESSION_SECRET = 'test-secret-for-middleware-tests';

const JwtService           = require('../JwtService');
const socketAuthMiddleware = require('../socketAuthMiddleware');

function makeSocket(token) {
  return {
    handshake: { auth: { token: token || '' } },
    data: {},
  };
}

function runMiddleware(socket) {
  return new Promise((resolve, reject) => {
    socketAuthMiddleware(socket, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

describe('socketAuthMiddleware', () => {
  let validToken;

  beforeAll(() => {
    validToken = JwtService.sign({ stableId: 'uuid-123', name: 'Alice', role: 'player' });
  });

  test('populates socket.data for a valid player token', async () => {
    const socket = makeSocket(validToken);
    await runMiddleware(socket);
    expect(socket.data.authenticated).toBe(true);
    expect(socket.data.stableId).toBe('uuid-123');
    expect(socket.data.jwtName).toBe('Alice');
    expect(socket.data.role).toBe('player');
    expect(socket.data.isCoach).toBe(false);
  });

  test('sets isCoach=true for coach role', async () => {
    const coachToken = JwtService.sign({ stableId: 'uuid-coach', name: 'Coach Bob', role: 'coach' });
    const socket = makeSocket(coachToken);
    await runMiddleware(socket);
    expect(socket.data.isCoach).toBe(true);
    expect(socket.data.authenticated).toBe(true);
  });

  test('marks authenticated=false for missing token (spectator path)', async () => {
    const socket = makeSocket('');
    await runMiddleware(socket);
    expect(socket.data.authenticated).toBe(false);
    expect(socket.data.stableId).toBeUndefined();
  });

  test('marks authenticated=false for a tampered token', async () => {
    const socket = makeSocket('Bearer not.a.real.token');
    await runMiddleware(socket);
    expect(socket.data.authenticated).toBe(false);
  });

  test('marks authenticated=false when handshake.auth is missing', async () => {
    const socket = { handshake: {}, data: {} };
    await runMiddleware(socket);
    expect(socket.data.authenticated).toBe(false);
  });

  test('calls next() without error for all cases (never rejects connection)', async () => {
    const cases = ['', 'garbage', validToken];
    for (const token of cases) {
      const socket = makeSocket(token);
      await expect(runMiddleware(socket)).resolves.toBeUndefined();
    }
  });
});
