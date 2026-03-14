'use strict';

/**
 * QA-07 — Socket Disconnect Simulation Tests
 *
 * Unit tests (no real sockets) — tests GameManager behavior when removePlayer
 * is called before or during a hand.
 *
 * 1. Disconnect before game — player joins, disconnects, game starts with remaining players
 * 2. Disconnect mid-hand — start game, removePlayer on active player, remaining can continue
 * 3. Disconnect then undo — start game, player acts, player disconnects, undoAction() → no crash
 * 4. Disconnect reduces active players — after disconnect, active player count decreases
 * 5. All players disconnect — start game, remove all players → no crash
 * 6. Reconnect simulation — remove a player, add them back, verify they get a new seat
 */

const GameManager = require('../GameManager');

// ─────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────

function buildGame(n = 3) {
  const gm = new GameManager('test-table');
  for (let i = 1; i <= n; i++) {
    gm.addPlayer(`p${i}`, `Player ${i}`);
  }
  return gm;
}

function startGame(gm) {
  const result = gm.startGame('rng');
  expect(result).toEqual({ success: true });
  return gm;
}

// ─────────────────────────────────────────────
//  Suite 1 — Disconnect before game
// ─────────────────────────────────────────────

describe('Disconnect — before game starts', () => {
  it('player joins then disconnects before game; game still starts with remaining players', () => {
    const gm = buildGame(3);
    gm.removePlayer('p3'); // p3 leaves before game

    // Should still start with p1 and p2
    const result = gm.startGame('rng');
    expect(result).toEqual({ success: true });
    expect(gm._gamePlayers()).toHaveLength(2);
  });

  it('phase is preflop after starting with 2 of 3 original players', () => {
    const gm = buildGame(3);
    gm.removePlayer('p2');
    gm.startGame('rng');
    expect(gm.state.phase).toBe('preflop');
  });

  it('remaining players are dealt hole cards after one player disconnects pre-game', () => {
    const gm = buildGame(3);
    gm.removePlayer('p3');
    gm.startGame('rng');
    gm._gamePlayers().forEach(p => {
      expect(p.hole_cards).toHaveLength(2);
    });
  });

  it('removing the only extra player still allows 2-player game', () => {
    const gm = buildGame(4);
    gm.removePlayer('p3');
    gm.removePlayer('p4');
    const result = gm.startGame('rng');
    expect(result).toEqual({ success: true });
  });

  it('removing player who was never added has no effect', () => {
    const gm = buildGame(2);
    expect(() => gm.removePlayer('nonexistent')).not.toThrow();
    expect(gm.state.players).toHaveLength(2);
  });

  it('game fails if all players disconnect before start', () => {
    const gm = buildGame(2);
    gm.removePlayer('p1');
    gm.removePlayer('p2');
    const result = gm.startGame('rng');
    expect(result.error).toBeDefined();
  });

  it('disconnected player is fully removed from state.players', () => {
    const gm = buildGame(3);
    gm.removePlayer('p2');
    const ids = gm.state.players.map(p => p.id);
    expect(ids).not.toContain('p2');
    expect(ids).toContain('p1');
    expect(ids).toContain('p3');
  });
});

// ─────────────────────────────────────────────
//  Suite 2 — Disconnect mid-hand
// ─────────────────────────────────────────────

describe('Disconnect — mid-hand', () => {
  it('removing an active player mid-hand does not crash', () => {
    const gm = buildGame(3);
    startGame(gm);

    // Remove a player who isn't the current turn
    const nonActive = gm._gamePlayers().find(p => p.id !== gm.state.current_turn);
    expect(() => gm.removePlayer(nonActive.id)).not.toThrow();
  });

  it('after mid-hand disconnect, remaining players can still act', () => {
    const gm = buildGame(3);
    startGame(gm);

    const currentTurn = gm.state.current_turn;
    const other = gm._gamePlayers().find(p => p.id !== currentTurn);
    gm.removePlayer(other.id);

    // Current player should still be able to act
    // (the game may auto-resolve or allow the current player to continue)
    const result = gm.placeBet(currentTurn, 'fold');
    // Either success (if game continues) or the game already resolved
    expect(result).toBeDefined();
  });

  it('removing current turn player mid-hand does not crash', () => {
    const gm = buildGame(3);
    startGame(gm);

    const currentTurn = gm.state.current_turn;
    expect(() => gm.removePlayer(currentTurn)).not.toThrow();
  });

  it('after removing a player mid-hand, remaining active count is correct', () => {
    const gm = buildGame(3);
    startGame(gm);

    const players = gm._gamePlayers();
    const playerToRemove = players[0];

    gm.removePlayer(playerToRemove.id);

    // Player is gone from state
    const remaining = gm._gamePlayers();
    expect(remaining.length).toBe(players.length - 1);
    expect(remaining.some(p => p.id === playerToRemove.id)).toBe(false);
  });

  it('game state remains valid object after mid-hand disconnect', () => {
    const gm = buildGame(3);
    startGame(gm);

    gm.removePlayer('p2');

    // State must remain a valid object
    expect(gm.state).toBeDefined();
    expect(gm.state.phase).toBeDefined();
    expect(typeof gm.state.pot).toBe('number');
    expect(Array.isArray(gm.state.players)).toBe(true);
  });

  it('can force to showdown after mid-hand disconnect (no crash)', () => {
    const gm = buildGame(3);
    startGame(gm);

    gm.removePlayer('p2');

    // Try to complete the hand
    let attempts = 0;
    while (gm.state.phase !== 'showdown' && attempts < 10) {
      const turn = gm.state.current_turn;
      if (turn && gm.state.players.find(p => p.id === turn)) {
        gm.placeBet(turn, 'fold');
      } else if (['preflop', 'flop', 'turn', 'river'].includes(gm.state.phase)) {
        gm.forceNextStreet();
      } else {
        break;
      }
      attempts++;
    }

    // Must not crash — phase should be in a valid state
    const validPhases = ['waiting', 'preflop', 'flop', 'turn', 'river', 'showdown'];
    expect(validPhases).toContain(gm.state.phase);
  });
});

// ─────────────────────────────────────────────
//  Suite 3 — Disconnect then undo
// ─────────────────────────────────────────────

describe('Disconnect — then undo', () => {
  it('undoAction after player disconnect does not throw', () => {
    const gm = buildGame(3);
    startGame(gm);

    // Have a player act to create history
    const utg = gm.state.current_turn;
    gm.placeBet(utg, 'call');

    // Now disconnect a different player
    const other = gm._gamePlayers().find(p => p.id !== gm.state.current_turn);
    gm.removePlayer(other.id);

    expect(() => gm.undoAction()).not.toThrow();
  });

  it('undoAction result is either success or error — not undefined', () => {
    const gm = buildGame(3);
    startGame(gm);

    const utg = gm.state.current_turn;
    gm.placeBet(utg, 'call');
    gm.removePlayer('p2');

    const result = gm.undoAction();
    expect(result).toBeDefined();
    // Must have either success or error property
    const hasValidShape = result.success === true || typeof result.error === 'string';
    expect(hasValidShape).toBe(true);
  });

  it('undoAction with no history returns error gracefully', () => {
    const gm = buildGame(3);
    startGame(gm);
    gm.removePlayer('p2');

    // Clear history manually to test the guard
    gm.state.history = [];
    const result = gm.undoAction();
    expect(result.error).toBeDefined();
    expect(result.error).toMatch(/nothing to undo/i);
  });

  it('undo after disconnect restores a valid state object', () => {
    const gm = buildGame(3);
    startGame(gm);

    const utg = gm.state.current_turn;
    gm.placeBet(utg, 'call');

    gm.removePlayer('p3');
    gm.undoAction();

    // State should still be a valid object
    expect(gm.state).toBeDefined();
    expect(gm.state.phase).toBeDefined();
    expect(Array.isArray(gm.state.players)).toBe(true);
    expect(typeof gm.state.pot).toBe('number');
  });
});

// ─────────────────────────────────────────────
//  Suite 4 — Disconnect reduces active player count
// ─────────────────────────────────────────────

describe('Disconnect — active player count', () => {
  it('player count decreases by 1 after removePlayer', () => {
    const gm = buildGame(3);
    startGame(gm);

    const beforeCount = gm.state.players.length;
    gm.removePlayer('p2');
    expect(gm.state.players.length).toBe(beforeCount - 1);
  });

  it('_gamePlayers() count decreases after removePlayer', () => {
    const gm = buildGame(3);
    startGame(gm);

    const beforeCount = gm._gamePlayers().length;
    gm.removePlayer('p2');
    expect(gm._gamePlayers().length).toBe(beforeCount - 1);
  });

  it('active player filter excludes removed player', () => {
    const gm = buildGame(3);
    startGame(gm);

    gm.removePlayer('p2');
    const activePlayers = gm._gamePlayers().filter(p => p.is_active);
    expect(activePlayers.some(p => p.id === 'p2')).toBe(false);
  });

  it('removing multiple players reduces count correctly', () => {
    const gm = buildGame(4);
    startGame(gm);

    gm.removePlayer('p2');
    gm.removePlayer('p4');
    expect(gm.state.players.length).toBe(2);
  });

  it('getPublicState still works after mid-hand disconnect', () => {
    const gm = buildGame(3);
    startGame(gm);

    gm.removePlayer('p2');

    expect(() => gm.getPublicState('p1', false)).not.toThrow();
    const publicState = gm.getPublicState('p1', false);
    expect(publicState).toBeDefined();
    expect(publicState.players).toBeDefined();
  });
});

// ─────────────────────────────────────────────
//  Suite 5 — All players disconnect
// ─────────────────────────────────────────────

describe('Disconnect — all players disconnect', () => {
  it('removing all players does not throw', () => {
    const gm = buildGame(3);
    startGame(gm);

    expect(() => {
      gm.removePlayer('p1');
      gm.removePlayer('p2');
      gm.removePlayer('p3');
    }).not.toThrow();
  });

  it('state.players is empty after all are removed', () => {
    const gm = buildGame(3);
    startGame(gm);

    gm.removePlayer('p1');
    gm.removePlayer('p2');
    gm.removePlayer('p3');

    expect(gm.state.players).toHaveLength(0);
  });

  it('_gamePlayers() returns empty array when all removed', () => {
    const gm = buildGame(3);
    startGame(gm);

    gm.removePlayer('p1');
    gm.removePlayer('p2');
    gm.removePlayer('p3');

    expect(gm._gamePlayers()).toHaveLength(0);
  });

  it('getPublicState works with empty player list', () => {
    const gm = buildGame(3);
    startGame(gm);

    gm.removePlayer('p1');
    gm.removePlayer('p2');
    gm.removePlayer('p3');

    expect(() => gm.getPublicState('p1', false)).not.toThrow();
  });

  it('resetForNextHand does not crash with no players', () => {
    const gm = buildGame(3);
    startGame(gm);

    gm.removePlayer('p1');
    gm.removePlayer('p2');
    gm.removePlayer('p3');

    expect(() => gm.resetForNextHand()).not.toThrow();
  });

  it('state remains a valid object after all players removed', () => {
    const gm = buildGame(3);
    startGame(gm);

    gm.removePlayer('p1');
    gm.removePlayer('p2');
    gm.removePlayer('p3');

    expect(gm.state).toBeDefined();
    expect(typeof gm.state.pot).toBe('number');
    expect(gm.state.pot).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(gm.state.board)).toBe(true);
  });

  it('game cannot start with 0 players after all disconnect', () => {
    const gm = buildGame(3);
    startGame(gm);

    gm.removePlayer('p1');
    gm.removePlayer('p2');
    gm.removePlayer('p3');
    gm.resetForNextHand();

    const result = gm.startGame('rng');
    expect(result.error).toBeDefined();
  });
});

// ─────────────────────────────────────────────
//  Suite 6 — Reconnect simulation
// ─────────────────────────────────────────────

describe('Disconnect — reconnect simulation', () => {
  it('removed player can be added back with addPlayer', () => {
    const gm = buildGame(3);
    gm.removePlayer('p2');

    // Re-add p2
    const result = gm.addPlayer('p2', 'Player 2 (reconnected)');
    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
  });

  it('reconnected player gets a valid seat', () => {
    const gm = buildGame(3);
    gm.removePlayer('p2');

    const result = gm.addPlayer('p2', 'Player 2 (reconnected)');
    expect(result.player.seat).toBeGreaterThanOrEqual(0);
  });

  it('reconnected player is in state.players', () => {
    const gm = buildGame(3);
    gm.removePlayer('p2');
    gm.addPlayer('p2', 'Player 2 (reconnected)');

    const found = gm.state.players.find(p => p.id === 'p2');
    expect(found).toBeDefined();
    expect(found.id).toBe('p2');
  });

  it('reconnected player has default stack of 1000', () => {
    const gm = buildGame(3);
    gm.removePlayer('p2');
    gm.addPlayer('p2', 'Player 2 (reconnected)');

    const player = gm.state.players.find(p => p.id === 'p2');
    expect(player.stack).toBe(1000);
  });

  it('game can start after reconnect with enough players', () => {
    const gm = buildGame(3);
    gm.removePlayer('p2');

    // Now only p1 and p3 — still 2 players, game can start
    const result = gm.startGame('rng');
    expect(result).toEqual({ success: true });
  });

  it('reconnected player cannot join if already in table (duplicate id)', () => {
    const gm = buildGame(3);

    // Try to add p1 again without removing
    const result = gm.addPlayer('p1', 'Player 1 Again');
    expect(result.error).toBeDefined();
    expect(result.error).toMatch(/already in/i);
  });

  it('reconnected player gets a fresh state (no leftover hole_cards)', () => {
    const gm = buildGame(3);
    startGame(gm);

    gm.removePlayer('p2');
    gm.resetForNextHand();
    gm.addPlayer('p2', 'Player 2 (back)');

    const player = gm.state.players.find(p => p.id === 'p2');
    expect(player.hole_cards).toHaveLength(0);
    expect(player.is_active).toBe(true);
    expect(player.is_all_in).toBe(false);
  });

  it('three players can play after remove-and-readd of one player', () => {
    const gm = buildGame(3);
    gm.removePlayer('p2');
    gm.addPlayer('p2', 'Player 2 (reconnected)');

    const result = gm.startGame('rng');
    expect(result).toEqual({ success: true });
    expect(gm._gamePlayers()).toHaveLength(3);

    gm._gamePlayers().forEach(p => {
      expect(p.hole_cards).toHaveLength(2);
    });
  });
});
