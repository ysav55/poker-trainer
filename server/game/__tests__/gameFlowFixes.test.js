'use strict';

/**
 * gameFlowFixes.test.js
 *
 * Test suite for Issue A: Mid-Hand Join Spectator Flow
 * Validates that players joining mid-hand are marked as spectators (in_hand=false)
 */

const GameManager = require('../GameManager');

// ─────────────────────────────────────────────
//  Helper: Create a ready-to-use GameManager
// ─────────────────────────────────────────────
function buildGame(n = 2, stackOverrides = {}) {
  const gm = new GameManager('test-table');
  const ids = [];
  for (let i = 0; i < n; i++) {
    const id = `p${i + 1}`;
    gm.addPlayer(id, `Player ${i + 1}`);
    ids.push(id);
  }

  // Apply any stack overrides BEFORE startGame so blind-posting uses them
  for (const [id, stack] of Object.entries(stackOverrides)) {
    const p = gm.state.players.find(pl => pl.id === id);
    if (p) p.stack = stack;
  }

  const result = gm.startGame('manual');
  expect(result).toEqual({ success: true });

  return { gm, ids, players: gm.state.players };
}

// ─────────────────────────────────────────────
//  Test Suite
// ─────────────────────────────────────────────
describe('Issue A: Mid-Hand Join Spectator Flow', () => {

  test('Player joining mid-hand should be marked as spectator', () => {
    // Start a game with 2 players and hand in progress
    const { gm } = buildGame(2);

    // Verify hand is in progress (phase is preflop)
    expect(gm.state.phase).toBe('preflop');

    // Simulate a new player joining during the hand
    const result = gm.addPlayer('new-player', 'Alice');
    expect(result.success).toBe(true);

    // Check: player is seated but NOT in hand
    const newPlayer = gm.state.players.find(p => p.id === 'new-player');
    expect(newPlayer).toBeDefined();
    expect(newPlayer.in_hand).toBe(false); // CRITICAL: should be false mid-hand
  });

  test('resetForNextHand() auto-rejoins sitting-out players with chips', () => {
    // Start a game with 2 players
    const { gm } = buildGame(2);

    // Add a player who was sitting out (in_hand = false)
    gm.addPlayer('p3', 'Bob');
    const p3 = gm.state.players.find(p => p.id === 'p3');
    p3.in_hand = false; // Sitting out
    p3.stack = 100; // Has chips

    // Verify the player is sitting out before reset
    expect(p3.in_hand).toBe(false);

    // Reset for next hand
    const resetResult = gm.resetForNextHand();
    expect(resetResult.success).toBe(true);

    // Check: player is back in next hand (phase = waiting)
    expect(gm.state.phase).toBe('waiting');
    const p3After = gm.state.players.find(p => p.id === 'p3');
    expect(p3After.in_hand).toBe(true); // AUTO-REJOINED
  });

});