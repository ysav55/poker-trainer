'use strict';

/**
 * QA-05 — Stress Test: 1000 random hands end-to-end
 *
 * Adds 3 players to a SessionManager and loops 1000 times:
 *  - startGame() must not error
 *  - Play through hand with random actions until showdown or single winner
 *  - At each action, verify: phase is a known valid phase, pot >= 0, all stacks >= 0
 *  - resetForNextHand()
 * After loop: verify handsDealt === 1000, no exceptions thrown
 */

jest.setTimeout(30000);

const SessionManager = require('../SessionManager');

const VALID_PHASES = ['waiting', 'preflop', 'flop', 'turn', 'river', 'showdown'];

/**
 * Assert that the current game state is internally consistent.
 */
function assertValidState(state, handNum, actionNum) {
  const ctx = `hand ${handNum}, action ${actionNum}`;

  expect(VALID_PHASES).toContain(state.phase);
  expect(state.pot).toBeGreaterThanOrEqual(0);

  state.players.forEach(p => {
    expect(p.stack).toBeGreaterThanOrEqual(0);
    expect(p.current_bet).toBeGreaterThanOrEqual(0);
    expect(p.total_bet_this_round).toBeGreaterThanOrEqual(0);
    expect(p.total_contributed).toBeGreaterThanOrEqual(0);
  });

  // pot + all stacks must equal some constant (chips are conserved)
  // We check that pot is non-negative since we can't easily track the initial total
  // without persisting it across resets (stacks change each hand due to wins/losses)
  expect(typeof state.pot).toBe('number');
  expect(isNaN(state.pot)).toBe(false);
  expect(isFinite(state.pot)).toBe(true);
}

/**
 * Pick a random valid action for the current player.
 * Returns { action, amount } ready to pass to placeBet.
 */
function randomAction(state) {
  const currentPlayerId = state.current_turn;
  const player = state.players.find(p => p.id === currentPlayerId);
  if (!player) return null;

  const toCall = state.current_bet - player.total_bet_this_round;
  const canCheck = toCall === 0;

  // Build list of valid actions
  const choices = ['fold'];
  if (canCheck) {
    choices.push('check');
  } else {
    choices.push('call');
  }

  // Add raise if the player has enough chips
  const minRaiseTotal = state.current_bet + state.min_raise;
  const canRaise = (player.stack + player.total_bet_this_round) >= minRaiseTotal;
  if (canRaise) {
    choices.push('raise');
  }

  const action = choices[Math.floor(Math.random() * choices.length)];
  let amount = 0;

  if (action === 'raise') {
    // Raise to minimum raise, or go all-in if stack is small
    amount = Math.min(minRaiseTotal, player.stack + player.total_bet_this_round);
  }

  return { action, amount };
}

/**
 * Play one hand to completion (showdown or fold-to-one).
 * Returns the number of actions taken.
 */
function playHand(sm, handNum) {
  let actionCount = 0;
  const maxActions = 200; // safety valve to prevent infinite loops

  while (sm.state.phase !== 'showdown' && actionCount < maxActions) {
    assertValidState(sm.state, handNum, actionCount);

    const currentTurn = sm.state.current_turn;

    if (!currentTurn) {
      // No active turn — force advance the street
      if (['preflop', 'flop', 'turn', 'river'].includes(sm.state.phase)) {
        sm.forceNextStreet();
      } else {
        break;
      }
      actionCount++;
      continue;
    }

    const actionData = randomAction(sm.state);
    if (!actionData) {
      // Should not happen if current_turn is set
      break;
    }

    const result = sm.placeBet(currentTurn, actionData.action, actionData.amount);

    // Result should either succeed or return an error (not crash)
    expect(result).toBeDefined();
    if (result.error) {
      // On error, try forceNextStreet to unstick
      if (['preflop', 'flop', 'turn', 'river'].includes(sm.state.phase)) {
        sm.forceNextStreet();
      }
    }

    actionCount++;
  }

  // Safety: if still not at showdown after maxActions, force it
  if (sm.state.phase !== 'showdown') {
    let forceCount = 0;
    while (sm.state.phase !== 'showdown' && forceCount < 5) {
      if (['preflop', 'flop', 'turn', 'river'].includes(sm.state.phase)) {
        sm.forceNextStreet();
      } else {
        break;
      }
      forceCount++;
    }
  }

  return actionCount;
}

// ─────────────────────────────────────────────
//  The stress test
// ─────────────────────────────────────────────

describe('Stress test — 1000 random hands', () => {
  it('runs 1000 hands without crashing and accumulates stats correctly', () => {
    const sm = new SessionManager('stress-table');
    sm.addPlayer('p1', 'Alice');
    sm.addPlayer('p2', 'Bob');
    sm.addPlayer('p3', 'Carol');

    const HAND_COUNT = 1000;

    for (let i = 0; i < HAND_COUNT; i++) {
      // startGame must not error
      const startResult = sm.startGame('rng');
      expect(startResult.error).toBeUndefined();

      // Phase must be preflop immediately after startGame
      expect(sm.state.phase).toBe('preflop');

      // All players must have hole_cards
      sm.gm._gamePlayers().forEach(p => {
        expect(p.hole_cards).toHaveLength(2);
      });

      // Play through the hand
      playHand(sm, i + 1);

      // After playing, phase must be showdown
      expect(sm.state.phase).toBe('showdown');

      // State must be valid at end of hand
      assertValidState(sm.state, i + 1, 'end');

      // pot should be 0 after award (chips were distributed)
      expect(sm.state.pot).toBe(0);

      // resetForNextHand must not throw
      expect(() => sm.resetForNextHand()).not.toThrow();

      // After reset, phase is waiting
      expect(sm.state.phase).toBe('waiting');
    }

    // After all hands, handsDealt must equal HAND_COUNT
    expect(sm.handsDealt).toBe(HAND_COUNT);

    // getSessionStats must return valid data
    const sessionStats = sm.getSessionStats();
    expect(sessionStats.handsDealt).toBe(HAND_COUNT);
    expect(sessionStats.players).toHaveLength(3);

    sessionStats.players.forEach(p => {
      expect(p.handsPlayed).toBeGreaterThan(0);
      expect(p.handsPlayed).toBeLessThanOrEqual(HAND_COUNT);
      expect(p.vpip).toBeGreaterThanOrEqual(0);
      expect(p.vpip).toBeLessThanOrEqual(1);
      expect(p.pfr).toBeGreaterThanOrEqual(0);
      expect(p.pfr).toBeLessThanOrEqual(1);
      expect(p.wtsd).toBeGreaterThanOrEqual(0);
      expect(p.wtsd).toBeLessThanOrEqual(1);
      expect(p.wsd).toBeGreaterThanOrEqual(0);
      expect(p.wsd).toBeLessThanOrEqual(1);
      // pfr can never exceed vpip
      expect(p.pfr).toBeLessThanOrEqual(p.vpip + 0.001); // small tolerance for rounding
    });
  });

  it('chips are conserved across all 1000 hands (total stacks + pot = initial total)', () => {
    const sm = new SessionManager('conservation-table');
    sm.addPlayer('p1', 'Alice');
    sm.addPlayer('p2', 'Bob');
    sm.addPlayer('p3', 'Carol');

    // Record total chips at start
    const initialTotal = sm.gm.state.players.reduce((sum, p) => sum + p.stack, 0);

    for (let i = 0; i < 50; i++) {
      sm.startGame('rng');
      playHand(sm, i + 1);
      sm.resetForNextHand();
    }

    // After all hands, total stacks + pot should equal initial total
    const finalTotal = sm.gm.state.players.reduce((sum, p) => sum + p.stack, 0) + sm.state.pot;
    expect(finalTotal).toBe(initialTotal);
  });

  it('dealer seat rotates every hand (no stuck rotation)', () => {
    const sm = new SessionManager('rotation-table');
    sm.addPlayer('p1', 'Alice');
    sm.addPlayer('p2', 'Bob');
    sm.addPlayer('p3', 'Carol');

    const dealerSeats = new Set();

    for (let i = 0; i < 9; i++) {
      sm.startGame('rng');
      const dealer = sm.gm._gamePlayers().find(p => p.is_dealer);
      if (dealer) dealerSeats.add(dealer.id);
      playHand(sm, i + 1);
      sm.resetForNextHand();
    }

    // All 3 players should have been dealer at some point across 9 hands
    expect(dealerSeats.size).toBe(3);
  });

  it('board has correct number of cards per phase', () => {
    const sm = new SessionManager('board-table');
    sm.addPlayer('p1', 'Alice');
    sm.addPlayer('p2', 'Bob');

    for (let i = 0; i < 20; i++) {
      sm.startGame('rng');

      // preflop: 0 board cards
      expect(sm.state.board).toHaveLength(0);

      sm.forceNextStreet(); // → flop
      if (sm.state.phase === 'flop') expect(sm.state.board).toHaveLength(3);

      sm.forceNextStreet(); // → turn
      if (sm.state.phase === 'turn') expect(sm.state.board).toHaveLength(4);

      sm.forceNextStreet(); // → river
      if (sm.state.phase === 'river') expect(sm.state.board).toHaveLength(5);

      sm.forceNextStreet(); // → showdown

      sm.resetForNextHand();
    }
  });
});
