'use strict';

/**
 * socketGuards unit tests
 *
 * Verifies that requireCoach() blocks non-coaches and passes coaches through.
 */

// socketGuards re-exports requireSocketPermission from socketPermissions, which
// imports requirePermission.js, which imports supabase.js. Mock supabase so the
// module can load in CI without SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.
jest.mock('../../db/supabase.js', () => ({
  from: jest.fn().mockReturnValue({
    select: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ data: [], error: null }) }),
  }),
}));

const { requireCoach } = require('../socketGuards');

function makeSocket(isCoach) {
  const emitted = [];
  return {
    data: { isCoach },
    emit: (event, payload) => emitted.push({ event, payload }),
    _emitted: emitted,
  };
}

describe('requireCoach()', () => {
  test('returns false and emits nothing when socket IS the coach', () => {
    const socket = makeSocket(true);
    const result = requireCoach(socket, 'start the game');
    expect(result).toBe(false);
    expect(socket._emitted).toHaveLength(0);
  });

  test('returns true when socket is NOT the coach', () => {
    const socket = makeSocket(false);
    const result = requireCoach(socket, 'undo');
    expect(result).toBe(true);
  });

  test('emits error event when socket is NOT the coach', () => {
    const socket = makeSocket(false);
    requireCoach(socket, 'adjust stacks');
    expect(socket._emitted).toHaveLength(1);
    expect(socket._emitted[0].event).toBe('error');
  });

  test('error message contains the action string', () => {
    const socket = makeSocket(false);
    requireCoach(socket, 'control replay');
    expect(socket._emitted[0].payload.message).toBe('Only the coach can control replay');
  });

  test('returns false and emits nothing when isCoach is true for various actions', () => {
    const actions = ['start the game', 'deal cards manually', 'reset', 'load replays'];
    for (const action of actions) {
      const socket = makeSocket(true);
      expect(requireCoach(socket, action)).toBe(false);
      expect(socket._emitted).toHaveLength(0);
    }
  });

  test('returns true for non-coach across multiple actions', () => {
    const actions = ['undo', 'pause', 'award the pot', 'exit replay'];
    for (const action of actions) {
      const socket = makeSocket(false);
      expect(requireCoach(socket, action)).toBe(true);
    }
  });

  test('handles undefined isCoach as non-coach', () => {
    const socket = makeSocket(undefined);
    const result = requireCoach(socket, 'start the game');
    expect(result).toBe(true);
  });
});
