'use strict';

/**
 * GameManager — Bug-fix regression tests
 *
 * ISS-13: forceNextStreet no longer double-saves a street snapshot
 * ISS-15: setBlindLevels relaxed to allow bb > sb (not bb >= sb*2)
 * ISS-16: placeBet does NOT save a snapshot when the action is invalid
 */

const GameManager = require('../GameManager');

// ─────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────

/**
 * Build a 2-player game in 'manual' mode (no RNG dealing required for tests).
 * In a 2-player game (dealer_seat=0):
 *   p1 = dealer + BB (bbIdx = dealerIdx = 0)
 *   p2 = SB + UTG (acts first preflop)
 */
function buildGame(n = 2) {
  const gm = new GameManager('test-table');
  for (let i = 0; i < n; i++) {
    gm.addPlayer(`p${i + 1}`, `Player ${i + 1}`);
  }
  gm.startGame('manual');
  return gm;
}

// ─────────────────────────────────────────────
//  ISS-13: forceNextStreet no double snapshot
// ─────────────────────────────────────────────

describe('ISS-13: forceNextStreet no double snapshot', () => {
  test('forceNextStreet adds exactly one street snapshot', () => {
    const gm = buildGame(2);
    const snapshotsBefore = gm.state.street_snapshots.length;
    gm.forceNextStreet();
    expect(gm.state.street_snapshots.length).toBe(snapshotsBefore + 1);
  });

  test('multiple forceNextStreet calls each add exactly one snapshot', () => {
    const gm = buildGame(2);
    // street_snapshots starts at 0 after startGame (startGame resets them)
    expect(gm.state.street_snapshots.length).toBe(0);
    gm.forceNextStreet(); // preflop → flop  (+1 snapshot)
    gm.forceNextStreet(); // flop   → turn   (+1 snapshot)
    expect(gm.state.street_snapshots.length).toBe(2);
  });

  test('forceNextStreet result is { success: true }', () => {
    const gm = buildGame(2);
    const result = gm.forceNextStreet();
    expect(result).toEqual({ success: true });
  });

  test('forceNextStreet from preflop moves to flop', () => {
    const gm = buildGame(2);
    expect(gm.state.phase).toBe('preflop');
    gm.forceNextStreet();
    expect(gm.state.phase).toBe('flop');
  });

  test('forceNextStreet returns error when not in a betting phase', () => {
    const gm = new GameManager('test-table');
    // No game started — phase is 'waiting'
    const result = gm.forceNextStreet();
    expect(result.error).toBeDefined();
  });
});

// ─────────────────────────────────────────────
//  ISS-15: setBlindLevels relaxed validation
// ─────────────────────────────────────────────

describe('ISS-15: setBlindLevels relaxed validation', () => {
  test('10/15 blinds are now accepted (previously rejected by bb < sb*2)', () => {
    const gm = new GameManager('test');
    const result = gm.setBlindLevels(10, 15);
    expect(result.success).toBe(true);
    expect(gm.state.small_blind).toBe(10);
    expect(gm.state.big_blind).toBe(15);
  });

  test('5/8 blinds are accepted', () => {
    const gm = new GameManager('test');
    const result = gm.setBlindLevels(5, 8);
    expect(result.success).toBe(true);
  });

  test('equal blinds are rejected (bb must be > sb)', () => {
    const gm = new GameManager('test');
    const result = gm.setBlindLevels(10, 10);
    expect(result.error).toBeDefined();
  });

  test('sb > bb is rejected', () => {
    const gm = new GameManager('test');
    const result = gm.setBlindLevels(20, 10);
    expect(result.error).toBeDefined();
  });

  test('zero sb is rejected', () => {
    const gm = new GameManager('test');
    const result = gm.setBlindLevels(0, 20);
    expect(result.error).toBeDefined();
  });

  test('negative values are rejected', () => {
    const gm = new GameManager('test');
    const result = gm.setBlindLevels(-5, 10);
    expect(result.error).toBeDefined();
  });

  test('standard 10/20 still accepted', () => {
    const gm = new GameManager('test');
    const result = gm.setBlindLevels(10, 20);
    expect(result.success).toBe(true);
    expect(gm.state.small_blind).toBe(10);
    expect(gm.state.big_blind).toBe(20);
  });

  test('standard 1/2 still accepted', () => {
    const gm = new GameManager('test');
    const result = gm.setBlindLevels(1, 2);
    expect(result.success).toBe(true);
  });
});

// ─────────────────────────────────────────────
//  ISS-16: placeBet no snapshot on invalid action
// ─────────────────────────────────────────────

describe('ISS-16: placeBet no snapshot on invalid action', () => {
  /**
   * In a 2-player manual game:
   *   dealer_seat=0 → p1=dealer/BB, p2=SB/UTG
   *   After startGame: p2 faces a BB of 20, can call, raise, or fold.
   *   current_turn = p2 (UTG)
   *
   * We test that an invalid action (check when facing a bet) does NOT
   * push a snapshot onto history.
   */
  test('invalid check (facing a bet) does NOT add to undo history', () => {
    const gm = buildGame(2);
    const currentTurn = gm.state.current_turn; // p2
    const historyBefore = gm.state.history.length;

    // Attempt an invalid check while p2 faces the BB (current_bet = 20, player.total_bet_this_round = 10 for SB)
    const result = gm.placeBet(currentTurn, 'check');
    expect(result.error).toBeDefined();

    // History must not have grown
    expect(gm.state.history.length).toBe(historyBefore);
  });

  test('valid fold DOES add to undo history', () => {
    const gm = buildGame(2);
    const currentTurn = gm.state.current_turn;
    const historyBefore = gm.state.history.length;

    gm.placeBet(currentTurn, 'fold');
    // A valid action should save a snapshot
    expect(gm.state.history.length).toBe(historyBefore + 1);
  });

  test('unknown action does NOT add to undo history', () => {
    const gm = buildGame(2);
    const currentTurn = gm.state.current_turn;
    const historyBefore = gm.state.history.length;

    const result = gm.placeBet(currentTurn, 'shove');
    expect(result.error).toBeDefined();
    expect(gm.state.history.length).toBe(historyBefore);
  });

  test('action from wrong player does NOT add to undo history', () => {
    const gm = buildGame(2);
    const currentTurn = gm.state.current_turn;
    const otherPlayer = gm.state.players.find(p => p.id !== currentTurn);
    const historyBefore = gm.state.history.length;

    // Other player acts out of turn
    const result = gm.placeBet(otherPlayer.id, 'fold');
    expect(result.error).toBeDefined();
    expect(gm.state.history.length).toBe(historyBefore);
  });

  test('invalid check after a raise does NOT add to undo history', () => {
    const gm = buildGame(2);
    // p2 raises preflop
    const p2 = gm.state.current_turn; // UTG = p2
    gm.placeBet(p2, 'raise', 40); // valid raise

    // now it's p1's turn (BB facing raise of 40)
    const p1 = gm.state.current_turn;
    expect(p1).not.toBe(p2);
    const historyBeforeCheck = gm.state.history.length;

    // p1 tries to check while facing a bet — invalid
    const result = gm.placeBet(p1, 'check');
    expect(result.error).toBeDefined();
    expect(gm.state.history.length).toBe(historyBeforeCheck);
  });
});
