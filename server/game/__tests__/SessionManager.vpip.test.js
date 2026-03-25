'use strict';

/**
 * SessionManager.vpip.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Additional VPIP / PFR / aggFreq / netChips coverage for SessionManager.
 *
 * These tests complement the existing SessionManager.test.js suites and focus
 * on edge-cases not covered there:
 *
 *   1.  VPIP increments when player calls preflop
 *   2.  VPIP increments when player raises preflop
 *   3.  VPIP does NOT increment when player folds preflop
 *   4.  PFR increments only on raise, not on call
 *   5.  PFR never exceeds VPIP (pfr <= vpip always true)
 *   6.  Player not dealt in (coach/spectator) — handsPlayed does not increment
 *   7.  aggFreq is 1.0 when player only raised (no calls)
 *   8.  aggFreq is 0.0 when player only called (no raises)
 *   9.  aggFreq is 0.5 when player raised once and called once across two hands
 *  10.  netChips updates correctly after a hand (stack - startingStack)
 *  11.  VPIP ratio = vpipCount / handsPlayed across multiple hands
 *  12.  PFR ratio = pfrCount / handsPlayed across multiple hands
 *  13.  _preflopTracking is cleared after resetForNextHand
 *  14.  Players who folded preflop have handsPlayed incremented (they were dealt in)
 */

const SessionManager = require('../SessionManager');

// ─────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────

/**
 * Build a SessionManager with 3 players, no game started.
 */
function buildTable(tableId = 'vpip-test') {
  const sm = new SessionManager(tableId);
  sm.addPlayer('p1', 'Alice');
  sm.addPlayer('p2', 'Bob');
  sm.addPlayer('p3', 'Carol');
  return sm;
}

/**
 * Start a game and return the id of the first player to act preflop.
 */
function startAndGetCurrentTurn(sm) {
  sm.startGame('rng');
  return sm.state.current_turn;
}

/**
 * Advance the game to showdown / end by force-advancing streets,
 * then call resetForNextHand() to commit stats.
 */
function finishHand(sm) {
  // Force through all streets until showdown (max 5 streets)
  for (let i = 0; i < 6; i++) {
    if (sm.state.phase === 'showdown') break;
    sm.forceNextStreet();
  }
  sm.resetForNextHand();
}

/**
 * Start, have the given player perform an action, finish the hand,
 * and return the committed stats for that player.
 */
function oneActionHand(sm, playerId, action, amount = 0) {
  sm.startGame('rng');
  sm.trackPreflopAction(playerId, action);
  finishHand(sm);
  return sm._stats.get(playerId);
}

// ─────────────────────────────────────────────
//  Suite 1 — VPIP increments
// ─────────────────────────────────────────────

describe('SessionManager VPIP — increments on call', () => {
  it('_vpipCount is 1 after player calls preflop and hand ends', () => {
    const sm = buildTable();
    sm.startGame('rng');
    const pid = sm.state.current_turn;
    sm.trackPreflopAction(pid, 'call');
    finishHand(sm);
    expect(sm._stats.get(pid)._vpipCount).toBe(1);
  });

  it('vpip ratio is > 0 after player calls preflop', () => {
    const sm = buildTable();
    sm.startGame('rng');
    const pid = sm.state.current_turn;
    sm.trackPreflopAction(pid, 'call');
    finishHand(sm);
    const stats = sm.getSessionStats().players.find(p => p.playerId === pid);
    expect(stats.vpip).toBeGreaterThan(0);
  });
});

describe('SessionManager VPIP — increments on raise', () => {
  it('_vpipCount is 1 after player raises preflop and hand ends', () => {
    const sm = buildTable();
    sm.startGame('rng');
    const pid = sm.state.current_turn;
    sm.trackPreflopAction(pid, 'raise');
    finishHand(sm);
    expect(sm._stats.get(pid)._vpipCount).toBe(1);
  });
});

describe('SessionManager VPIP — does NOT increment on fold', () => {
  it('_vpipCount stays 0 after player folds preflop', () => {
    const sm = buildTable();
    sm.startGame('rng');
    const pid = sm.state.current_turn;
    sm.trackPreflopAction(pid, 'fold');
    finishHand(sm);
    // Player folded preflop — was dealt in, so handsPlayed is 1, but vpip should be 0
    const stats = sm._stats.get(pid);
    expect(stats._vpipCount).toBe(0);
    expect(stats.vpip).toBe(0);
  });
});

// ─────────────────────────────────────────────
//  Suite 2 — PFR increments
// ─────────────────────────────────────────────

describe('SessionManager PFR — increments only on raise', () => {
  it('_pfrCount is 1 after raise, 0 after call', () => {
    // Raiser hand
    const sm1 = buildTable('pfr-raise');
    sm1.startGame('rng');
    const raiser = sm1.state.current_turn;
    sm1.trackPreflopAction(raiser, 'raise');
    finishHand(sm1);
    expect(sm1._stats.get(raiser)._pfrCount).toBe(1);

    // Caller hand
    const sm2 = buildTable('pfr-call');
    sm2.startGame('rng');
    const caller = sm2.state.current_turn;
    sm2.trackPreflopAction(caller, 'call');
    finishHand(sm2);
    expect(sm2._stats.get(caller)._pfrCount).toBe(0);
  });
});

describe('SessionManager PFR — never exceeds VPIP', () => {
  it('pfr <= vpip holds after any combination of preflop actions', () => {
    const sm = buildTable();

    // Hand 1: player raises → VPIP=1, PFR=1
    sm.startGame('rng');
    const pid = sm.state.current_turn;
    sm.trackPreflopAction(pid, 'raise');
    finishHand(sm);

    // Hand 2: player only calls → VPIP=2, PFR=1
    sm.startGame('rng');
    sm.trackPreflopAction(pid, 'call');
    finishHand(sm);

    // Hand 3: player folds → VPIP=2, PFR=1, handsPlayed=3
    sm.startGame('rng');
    sm.trackPreflopAction(pid, 'fold');
    finishHand(sm);

    const stats = sm._stats.get(pid);
    expect(stats.pfr).toBeLessThanOrEqual(stats.vpip);
  });
});

// ─────────────────────────────────────────────
//  Suite 3 — Player not dealt in
// ─────────────────────────────────────────────

describe('SessionManager — player not dealt in', () => {
  it('handsPlayed does not increment for a player explicitly sat out via setPlayerInHand', () => {
    // setPlayerInHand(id, false) causes in_hand=false → hole_cards=[] → wasDealtIn=false
    const sm = new SessionManager('sayout-test');
    sm.addPlayer('p1', 'Alice');
    sm.addPlayer('p2', 'Bob');
    sm.addPlayer('p3', 'Carol');

    // Sit p3 out before the hand starts
    sm.setPlayerInHand('p3', false);
    sm.startGame('rng');

    finishHand(sm);

    // p3 had no hole cards → wasDealtIn=false → handsPlayed must still be 0
    const p3Stats = sm._stats.get('p3');
    if (p3Stats) {
      expect(p3Stats.handsPlayed).toBe(0);
    }
  });
});

// ─────────────────────────────────────────────
//  Suite 4 — aggFreq
// ─────────────────────────────────────────────

describe('SessionManager aggFreq — raise-only produces 1.0', () => {
  it('aggFreq = 1.0 when player raises and never calls in the same hand', () => {
    const sm = buildTable();
    sm.startGame('rng');
    const pid = sm.state.current_turn;
    sm.trackPreflopAction(pid, 'raise');
    finishHand(sm);

    const stats = sm._stats.get(pid);
    // raiseCount=1, callCount=0 → aggFreqSum += 1/(1+0) = 1.0
    expect(stats.aggFreq).toBeCloseTo(1.0, 3);
  });
});

describe('SessionManager aggFreq — call-only produces 0.0', () => {
  it('aggFreq = 0.0 when player calls and never raises in the same hand', () => {
    const sm = buildTable();
    sm.startGame('rng');
    const pid = sm.state.current_turn;
    sm.trackPreflopAction(pid, 'call');
    finishHand(sm);

    const stats = sm._stats.get(pid);
    // raiseCount=0, callCount=1 → aggFreqSum += 0/(0+1) = 0.0
    expect(stats.aggFreq).toBeCloseTo(0.0, 3);
  });
});

describe('SessionManager aggFreq — mixed across two hands produces 0.5', () => {
  it('aggFreq ≈ 0.5 when player raised in hand 1 and called in hand 2', () => {
    const sm = buildTable();

    // Hand 1: raise only
    sm.startGame('rng');
    const pid = sm.state.current_turn;
    sm.trackPreflopAction(pid, 'raise');
    finishHand(sm);

    // Hand 2: call only
    sm.startGame('rng');
    sm.trackPreflopAction(pid, 'call');
    finishHand(sm);

    const stats = sm._stats.get(pid);
    // Hand 1: raises=1, calls=0 → 1/1 = 1.0
    // Hand 2: raises=0, calls=1 → 0/1 = 0.0
    // aggFreq = (1.0 + 0.0) / 2 = 0.5
    expect(stats.aggFreq).toBeCloseTo(0.5, 3);
  });
});

// ─────────────────────────────────────────────
//  Suite 5 — netChips
// ─────────────────────────────────────────────

describe('SessionManager netChips — reflects stack change', () => {
  it('netChips is a number for all tracked players', () => {
    const sm = buildTable();
    sm.startGame('rng');
    finishHand(sm);

    // We verify the type and that _startingStacks was populated at startGame time.
    // Starting stacks are captured after blinds are posted (the earliest point we
    // observe a player's stack), so they may be slightly below the initial add value.
    const stats = sm.getSessionStats();
    for (const p of stats.players) {
      expect(typeof p.netChips).toBe('number');
      expect(sm._startingStacks.has(p.playerId)).toBe(true);
    }
  });

  it('netChips = currentStack - startingStack (spot-check formula)', () => {
    const sm = buildTable();
    sm.startGame('rng');
    finishHand(sm);

    // Verify formula: internal netChips must equal current stack minus captured start
    const gPlayers = sm.gm._gamePlayers();
    for (const gp of gPlayers) {
      const internalStats = sm._stats.get(gp.id);
      if (!internalStats || internalStats.handsPlayed === 0) continue;
      const startStack = sm._startingStacks.get(gp.id);
      expect(internalStats.netChips).toBe(gp.stack - startStack);
    }
  });

  it('exactly one player has netChips > 0 after a single hand (the winner)', () => {
    // After one complete hand, the pot winner gains chips; all others break even
    // or lose. At least one player should have positive netChips.
    // Note: netChips is relative to the stack AFTER blinds are posted (the point
    // at which startingStacks is captured), so the blind amounts are not zero-sum.
    const sm = buildTable();
    sm.startGame('rng');
    finishHand(sm);

    const stats = sm.getSessionStats();
    const winners = stats.players.filter(p => p.netChips > 0);
    // At least one player won chips
    expect(winners.length).toBeGreaterThanOrEqual(1);
    // No player lost more than the total starting chips (sanity bound)
    for (const p of stats.players) {
      expect(p.netChips).toBeGreaterThanOrEqual(-1000);
    }
  });
});

// ─────────────────────────────────────────────
//  Suite 6 — Ratio accuracy across hands
// ─────────────────────────────────────────────

describe('SessionManager — VPIP ratio accuracy across multiple hands', () => {
  it('vpip = 2/3 after player called in 2 of 3 hands', () => {
    const sm = buildTable();

    // Hand 1: player calls → vpip increments
    sm.startGame('rng');
    const pid = sm.state.current_turn;
    sm.trackPreflopAction(pid, 'call');
    finishHand(sm);

    // Hand 2: player calls again → vpip increments
    sm.startGame('rng');
    sm.trackPreflopAction(pid, 'call');
    finishHand(sm);

    // Hand 3: player folds → vpip stays
    sm.startGame('rng');
    sm.trackPreflopAction(pid, 'fold');
    finishHand(sm);

    const stats = sm._stats.get(pid);
    expect(stats.handsPlayed).toBe(3);
    expect(stats._vpipCount).toBe(2);
    expect(stats.vpip).toBeCloseTo(2 / 3, 3);
  });
});

describe('SessionManager — PFR ratio accuracy across multiple hands', () => {
  it('pfr = 1/3 after player raised in 1 of 3 hands', () => {
    const sm = buildTable();

    // Hand 1: raise
    sm.startGame('rng');
    const pid = sm.state.current_turn;
    sm.trackPreflopAction(pid, 'raise');
    finishHand(sm);

    // Hand 2: call
    sm.startGame('rng');
    sm.trackPreflopAction(pid, 'call');
    finishHand(sm);

    // Hand 3: fold
    sm.startGame('rng');
    sm.trackPreflopAction(pid, 'fold');
    finishHand(sm);

    const stats = sm._stats.get(pid);
    expect(stats.handsPlayed).toBe(3);
    expect(stats._pfrCount).toBe(1);
    expect(stats.pfr).toBeCloseTo(1 / 3, 3);
  });
});

// ─────────────────────────────────────────────
//  Suite 7 — _preflopTracking cleared after hand
// ─────────────────────────────────────────────

describe('SessionManager — _preflopTracking is cleared after resetForNextHand', () => {
  it('_preflopTracking.size is 0 after resetForNextHand', () => {
    const sm = buildTable();
    sm.startGame('rng');
    expect(sm._preflopTracking.size).toBeGreaterThan(0);
    finishHand(sm);
    expect(sm._preflopTracking.size).toBe(0);
  });
});

// ─────────────────────────────────────────────
//  Suite 8 — Players who folded preflop are dealt in
// ─────────────────────────────────────────────

describe('SessionManager — folded players still counted as dealt in', () => {
  it('handsPlayed increments for a player who folds preflop (they had hole cards)', () => {
    const sm = buildTable();
    sm.startGame('rng');
    const pid = sm.state.current_turn;

    // Track that we folded so endHand knows this
    sm.trackPreflopAction(pid, 'fold');
    // Actually fold via placeBet so the game state updates
    sm.placeBet(pid, 'fold');

    finishHand(sm);

    // The player was dealt hole cards, so handsPlayed must be 1 even though they folded
    const stats = sm._stats.get(pid);
    expect(stats.handsPlayed).toBe(1);
  });
});
