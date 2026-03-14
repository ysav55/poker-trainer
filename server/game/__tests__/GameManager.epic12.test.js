'use strict';

/**
 * GameManager — Epic 12 tests
 *
 * Coach now always gets a real seat (>= 0) and plays like any other player.
 * addPlayer signature: addPlayer(socketId, name, isCoach = false, stableId = null)
 */

const GameManager = require('../GameManager');

function buildGame(n = 2) {
  const gm = new GameManager('test-table');
  for (let i = 0; i < n; i++) {
    gm.addPlayer(`p${i + 1}`, `Player ${i + 1}`);
  }
  return gm;
}

// ─────────────────────────────────────────────
//  addPlayer — Epic 12 behaviour
// ─────────────────────────────────────────────

describe('addPlayer — Epic 12 changes', () => {
  test('coach always gets a real seat (>= 0)', () => {
    const gm = new GameManager('test');
    gm.addPlayer('coach1', 'Coach', true);
    const coach = gm.state.players.find(p => p.is_coach);
    expect(coach).toBeDefined();
    expect(coach.seat).toBeGreaterThanOrEqual(0);
  });

  test('regular player gets a real seat (>= 0)', () => {
    const gm = new GameManager('test');
    gm.addPlayer('p1', 'Alice', false);
    const p = gm.state.players[0];
    expect(p.seat).toBeGreaterThanOrEqual(0);
  });

  test('player object has in_hand = true by default', () => {
    const gm = new GameManager('test');
    gm.addPlayer('p1', 'Alice');
    expect(gm.state.players[0].in_hand).toBe(true);
  });

  test('player object has disconnected = false by default', () => {
    const gm = new GameManager('test');
    gm.addPlayer('p1', 'Alice');
    expect(gm.state.players[0].disconnected).toBe(false);
  });

  test('stableId is stored on player object when passed', () => {
    const gm = new GameManager('test');
    gm.addPlayer('socket-abc', 'Alice', false, 'stable-uuid-123');
    const p = gm.state.players[0];
    expect(p.stableId).toBe('stable-uuid-123');
  });

  test('stableId defaults to socketId when not passed', () => {
    const gm = new GameManager('test');
    gm.addPlayer('p1', 'Alice');
    expect(gm.state.players[0].stableId).toBe('p1');
  });

  test('duplicate socketId is rejected', () => {
    const gm = new GameManager('test');
    gm.addPlayer('p1', 'Alice');
    const result = gm.addPlayer('p1', 'Alice duplicate');
    expect(result.error).toBeDefined();
  });

  test('table is full after 9 players', () => {
    const gm = new GameManager('test');
    for (let i = 0; i < 9; i++) {
      const r = gm.addPlayer(`p${i + 1}`, `Player ${i + 1}`);
      expect(r.success).toBe(true);
    }
    const result = gm.addPlayer('p10', 'Player 10');
    expect(result.error).toBeDefined();
  });
});

// ─────────────────────────────────────────────
//  setPlayerInHand
// ─────────────────────────────────────────────

describe('setPlayerInHand', () => {
  test('sets in_hand to false', () => {
    const gm = buildGame(2);
    const result = gm.setPlayerInHand('p1', false);
    expect(result.success).toBe(true);
    expect(gm.state.players.find(p => p.id === 'p1').in_hand).toBe(false);
  });

  test('sets in_hand back to true', () => {
    const gm = buildGame(2);
    gm.setPlayerInHand('p1', false);
    gm.setPlayerInHand('p1', true);
    expect(gm.state.players.find(p => p.id === 'p1').in_hand).toBe(true);
  });

  test('returns error for unknown playerId', () => {
    const gm = buildGame(2);
    const result = gm.setPlayerInHand('nonexistent', false);
    expect(result.error).toBeDefined();
  });
});

// ─────────────────────────────────────────────
//  setPlayerDisconnected
// ─────────────────────────────────────────────

describe('setPlayerDisconnected', () => {
  test('marks player as disconnected', () => {
    const gm = buildGame(2);
    const result = gm.setPlayerDisconnected('p1', true);
    expect(result.success).toBe(true);
    expect(gm.state.players.find(p => p.id === 'p1').disconnected).toBe(true);
  });

  test('clears disconnected flag on reconnect', () => {
    const gm = buildGame(2);
    gm.setPlayerDisconnected('p1', true);
    gm.setPlayerDisconnected('p1', false);
    expect(gm.state.players.find(p => p.id === 'p1').disconnected).toBe(false);
  });

  test('returns error for unknown socketId', () => {
    const gm = buildGame(2);
    const result = gm.setPlayerDisconnected('nonexistent', true);
    expect(result.error).toBeDefined();
  });
});

// ─────────────────────────────────────────────
//  in_hand exclusion from dealing
// ─────────────────────────────────────────────

describe('in_hand exclusion from dealing', () => {
  test('excluded player (in_hand=false) does not receive hole cards on startGame', () => {
    const gm = buildGame(3);
    gm.setPlayerInHand('p1', false);
    gm.startGame('rng');
    const p1 = gm.state.players.find(p => p.id === 'p1');
    expect(p1.hole_cards.length).toBe(0);
  });

  test('included players still receive hole cards', () => {
    const gm = buildGame(3);
    gm.setPlayerInHand('p1', false);
    gm.startGame('rng');
    const p2 = gm.state.players.find(p => p.id === 'p2');
    expect(p2.hole_cards.length).toBe(2);
  });

  test('in_hand flag resets to true after hand starts', () => {
    const gm = buildGame(3);
    gm.setPlayerInHand('p1', false);
    gm.startGame('rng');
    expect(gm.state.players.find(p => p.id === 'p1').in_hand).toBe(true);
  });
});
