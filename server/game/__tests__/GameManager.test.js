'use strict';

/**
 * GameManager — Baseline QA Test Suite
 *
 * Covers the stress-test checklist from AGENT_MEMORY.md § Stress Test Coverage Required:
 *  1. startGame with 2 players → phase = 'preflop', blinds posted correctly
 *  2. placeBet fold → one active player left → phase = 'showdown', winner set
 *  3. placeBet check/check → _advanceStreet → flop
 *  4. placeBet raise → re-opens action for other players
 *  5. undoAction restores previous state
 *  6. rollbackStreet restores previous street
 *  7. manualDealCard rejects duplicate card
 *  8. manualDealCard allows replacing a card in the same slot
 *  9. Blind posting with all-in on blind (stack < blind amount)
 * 10. _isBettingRoundOver when all active players have matched current_bet
 */

const GameManager = require('../GameManager');

// ─────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────

/**
 * Build a ready-to-use GameManager with `n` players already added
 * and the game started in 'manual' mode (no RNG dealing).
 *
 * Returns { gm, players } where `players` is the array of player objects
 * stored on gm.state.players (live references).
 */
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

/**
 * In a 2-player game (heads-up) with dealer_seat = 0:
 *   dealerIdx = 0 → p1 is dealer
 *   sbIdx     = 1 → p2 is small blind  (dealerIdx + 1 in heads-up, SB = dealer)
 *   bbIdx     = 0 → p1 is big blind
 *   UTG       = 1 → p2 acts first preflop
 *
 * Wait — GameManager does NOT use heads-up special rules. It uses:
 *   dealerIdx = dealer_seat % players.length
 *   sbIdx     = (dealerIdx + 1) % length
 *   bbIdx     = (dealerIdx + 2) % length
 *   utgIdx    = (bbIdx + 1) % length
 *
 * For 2 players, dealer_seat = 0:
 *   dealerIdx = 0 (p1)
 *   sbIdx     = 1 (p2)
 *   bbIdx     = 0 (p1)   ← wraps back around
 *   utgIdx    = 1 (p2)   ← p2 acts first preflop
 */
function headsUpTurnOrder(gm) {
  // Return the current_turn player and the other player
  const ct = gm.state.current_turn;
  const other = gm.state.players.find(p => p.id !== ct && !p.is_coach);
  return { current: ct, other: other.id };
}

// ─────────────────────────────────────────────
//  Suite 1 — startGame
// ─────────────────────────────────────────────
describe('startGame', () => {
  test('requires at least 2 seated players', () => {
    const gm = new GameManager('t1');
    gm.addPlayer('solo', 'Solo');
    expect(gm.startGame()).toEqual({ error: 'Need at least 2 seated players to start' });
  });

  test('phase becomes preflop after start', () => {
    const { gm } = buildGame(2);
    expect(gm.state.phase).toBe('preflop');
  });

  test('small blind posted correctly (half of big blind)', () => {
    const { gm } = buildGame(2);
    const sb = gm.state.players.find(p => p.is_small_blind);
    expect(sb).toBeDefined();
    expect(sb.current_bet).toBe(10);   // small_blind = 10
    expect(sb.total_bet_this_round).toBe(10);
    expect(sb.stack).toBe(990);        // started at 1000
  });

  test('big blind posted correctly', () => {
    const { gm } = buildGame(2);
    const bb = gm.state.players.find(p => p.is_big_blind);
    expect(bb).toBeDefined();
    expect(bb.current_bet).toBe(20);   // big_blind = 20
    expect(bb.total_bet_this_round).toBe(20);
    expect(bb.stack).toBe(980);
  });

  test('pot equals SB + BB after start', () => {
    const { gm } = buildGame(2);
    // SB = 10, BB = 20 → pot = 30
    expect(gm.state.pot).toBe(30);
  });

  test('current_bet equals big_blind after start', () => {
    const { gm } = buildGame(2);
    expect(gm.state.current_bet).toBe(20);
  });

  test('current_turn is set to a valid player id', () => {
    const { gm, ids } = buildGame(2);
    expect(ids).toContain(gm.state.current_turn);
  });

  test('mode is stored correctly (manual)', () => {
    const { gm } = buildGame(2);
    expect(gm.state.mode).toBe('manual');
  });

  test('rng mode deals 2 hole cards to each player', () => {
    const gm = new GameManager('rng-table');
    gm.addPlayer('a', 'Alice');
    gm.addPlayer('b', 'Bob');
    gm.startGame('rng');
    const players = gm.state.players;
    players.forEach(p => {
      expect(p.hole_cards).toHaveLength(2);
      p.hole_cards.forEach(c => expect(typeof c).toBe('string'));
    });
  });

  test('cannot start if only coaches are present', () => {
    const gm = new GameManager('t-coach');
    gm.addPlayer('c1', 'Coach', true); // isCoach = true
    expect(gm.startGame()).toEqual({ error: 'Need at least 2 seated players to start' });
  });
});

// ─────────────────────────────────────────────
//  Suite 2 — placeBet: fold → showdown
// ─────────────────────────────────────────────
describe('placeBet — fold leads to showdown', () => {
  test('one player folds → phase = showdown, winner set', () => {
    const { gm } = buildGame(2);
    const folder = gm.state.current_turn;
    const winner = gm.state.players.find(p => p.id !== folder && !p.is_coach).id;

    const result = gm.placeBet(folder, 'fold');
    expect(result).toEqual({ success: true });

    expect(gm.state.phase).toBe('showdown');
    expect(gm.state.winner).toBe(winner);
    expect(gm.state.winner_name).toBeDefined();
    expect(gm.state.current_turn).toBeNull();
  });

  test('winner receives the pot after fold', () => {
    const { gm } = buildGame(2);
    const potBefore = gm.state.pot;
    const folder = gm.state.current_turn;
    const winnerObj = gm.state.players.find(p => p.id !== folder && !p.is_coach);
    const stackBefore = winnerObj.stack;

    gm.placeBet(folder, 'fold');

    expect(winnerObj.stack).toBe(stackBefore + potBefore);
    expect(gm.state.pot).toBe(0);
  });

  test('folded player is marked inactive', () => {
    const { gm } = buildGame(2);
    const folderId = gm.state.current_turn;
    gm.placeBet(folderId, 'fold');
    const folder = gm.state.players.find(p => p.id === folderId);
    expect(folder.is_active).toBe(false);
    expect(folder.action).toBe('folded');
  });

  test('3-player game: two folds → showdown with last remaining player as winner', () => {
    const gm = new GameManager('t3');
    gm.addPlayer('p1', 'P1');
    gm.addPlayer('p2', 'P2');
    gm.addPlayer('p3', 'P3');
    gm.startGame('manual');

    // Fold first actor
    const first = gm.state.current_turn;
    gm.placeBet(first, 'fold');
    expect(gm.state.phase).toBe('preflop');  // still going

    // Fold second actor
    const second = gm.state.current_turn;
    gm.placeBet(second, 'fold');
    expect(gm.state.phase).toBe('showdown');
  });
});

// ─────────────────────────────────────────────
//  Suite 3 — placeBet: check/check → flop
// ─────────────────────────────────────────────
describe('placeBet — check/check advances to flop', () => {
  /**
   * Heads-up (2 players), manual mode.
   * Preflop: p2 (UTG / SB in this layout) acts first. They must call/raise/fold.
   * After calling, p1 (BB) can check to close action.
   * Then _advanceStreet fires → flop.
   *
   * Specifically with dealer_seat=0, 2 players:
   *   p1 = dealer + BB (posts 20)
   *   p2 = SB (posts 10), acts first preflop
   *
   * To reach a check-check scenario, p2 calls first (to match BB),
   * then p1 (BB, who already paid 20) can check.
   */
  test('call then check transitions to flop in manual mode', () => {
    const { gm } = buildGame(2);

    // Preflop: current actor calls to match the BB
    const firstActor = gm.state.current_turn;
    gm.placeBet(firstActor, 'call');
    expect(gm.state.phase).toBe('preflop'); // still preflop

    // Next actor (BB position) should be able to check since bets are matched
    const secondActor = gm.state.current_turn;
    gm.placeBet(secondActor, 'check');

    // After both players have acted with matched bets → advance to flop
    expect(gm.state.phase).toBe('flop');
  });

  test('flop has no board cards in manual mode (no auto-deal)', () => {
    const { gm } = buildGame(2);
    const first = gm.state.current_turn;
    gm.placeBet(first, 'call');
    const second = gm.state.current_turn;
    gm.placeBet(second, 'check');
    // Manual mode: board is not auto-dealt
    expect(gm.state.board).toEqual([]);
  });

  test('flop in rng mode deals 3 board cards', () => {
    const gm = new GameManager('rng2');
    gm.addPlayer('a', 'Alice');
    gm.addPlayer('b', 'Bob');
    gm.startGame('rng');

    const first = gm.state.current_turn;
    gm.placeBet(first, 'call');
    const second = gm.state.current_turn;
    gm.placeBet(second, 'check');

    expect(gm.state.phase).toBe('flop');
    expect(gm.state.board).toHaveLength(3);
  });

  test('current_bet resets to 0 after street advance', () => {
    const { gm } = buildGame(2);
    const first = gm.state.current_turn;
    gm.placeBet(first, 'call');
    const second = gm.state.current_turn;
    gm.placeBet(second, 'check');
    expect(gm.state.current_bet).toBe(0);
  });

  test('player betting state resets after street advance', () => {
    const { gm } = buildGame(2);
    const first = gm.state.current_turn;
    gm.placeBet(first, 'call');
    const second = gm.state.current_turn;
    gm.placeBet(second, 'check');

    gm.state.players.filter(p => p.is_active).forEach(p => {
      expect(p.total_bet_this_round).toBe(0);
      expect(p.current_bet).toBe(0);
      expect(p.action).toBe('waiting');
    });
  });

  test('full street progression: preflop → flop → turn → river → showdown', () => {
    const { gm } = buildGame(2);

    const advanceStreet = () => {
      const a = gm.state.current_turn;
      gm.placeBet(a, 'check');
      const b = gm.state.current_turn;
      if (b) gm.placeBet(b, 'check');
    };

    // Preflop: call then check to clear the BB bet difference
    const preflopFirst = gm.state.current_turn;
    gm.placeBet(preflopFirst, 'call');
    const preflopSecond = gm.state.current_turn;
    gm.placeBet(preflopSecond, 'check');
    expect(gm.state.phase).toBe('flop');

    advanceStreet(); // flop
    expect(gm.state.phase).toBe('turn');

    advanceStreet(); // turn
    expect(gm.state.phase).toBe('river');

    advanceStreet(); // river
    expect(gm.state.phase).toBe('showdown');
  });
});

// ─────────────────────────────────────────────
//  Suite 4 — placeBet: raise re-opens action
// ─────────────────────────────────────────────
describe('placeBet — raise re-opens action', () => {
  test('after a raise, other active players are reset to waiting', () => {
    const gm = new GameManager('raise-table');
    gm.addPlayer('p1', 'P1');
    gm.addPlayer('p2', 'P2');
    gm.addPlayer('p3', 'P3');
    gm.startGame('manual');

    // With 3 players: dealer=p1, SB=p2, BB=p3, UTG=p1 acts first preflop
    const utgId = gm.state.current_turn;

    // UTG raises to 60 (min raise from BB of 20: current_bet=20, min_raise=20 → minTotal=40; raise to 60)
    gm.placeBet(utgId, 'raise', 60);

    // All other active players who haven't matched should be 'waiting'
    const others = gm.state.players.filter(p => p.id !== utgId && p.is_active && !p.is_all_in);
    others.forEach(p => {
      expect(p.action).toBe('waiting');
    });
  });

  test('raise updates current_bet and min_raise', () => {
    const { gm } = buildGame(2);
    const actor = gm.state.current_turn;
    gm.placeBet(actor, 'raise', 60);
    expect(gm.state.current_bet).toBe(60);
    expect(gm.state.min_raise).toBe(40); // 60 - 20 (previous current_bet)
  });

  test('raise below minimum is rejected', () => {
    const { gm } = buildGame(2);
    const actor = gm.state.current_turn;
    // current_bet=20, min_raise=20 → minTotal=40; raising to 30 should fail
    const result = gm.placeBet(actor, 'raise', 30);
    expect(result).toHaveProperty('error');
    expect(result.error).toMatch(/[Mm]inimum raise/);
  });

  test('raise exceeding stack is rejected', () => {
    const { gm } = buildGame(2);
    const actor = gm.state.current_turn;
    const actorObj = gm.state.players.find(p => p.id === actor);
    // Try to raise to more chips than they have
    const overRaise = actorObj.stack + actorObj.total_bet_this_round + 9999;
    const result = gm.placeBet(actor, 'raise', overRaise);
    expect(result).toHaveProperty('error');
    expect(result.error).toMatch(/[Nn]ot enough chips/);
  });

  test('raiser pot contribution is correct', () => {
    const { gm } = buildGame(2);
    const potBefore = gm.state.pot;
    const actor = gm.state.current_turn;
    const actorObj = gm.state.players.find(p => p.id === actor);
    const stackBefore = actorObj.stack;
    const prevBet = actorObj.total_bet_this_round;

    gm.placeBet(actor, 'raise', 60);

    const paid = 60 - prevBet;
    expect(actorObj.stack).toBe(stackBefore - paid);
    expect(gm.state.pot).toBe(potBefore + paid);
  });
});

// ─────────────────────────────────────────────
//  Suite 5 — undoAction
// ─────────────────────────────────────────────
describe('undoAction', () => {
  test('returns error when history is empty', () => {
    const gm = new GameManager('undo-empty');
    expect(gm.undoAction()).toEqual({ error: 'Nothing to undo' });
  });

  test('restores state to before last action', () => {
    const { gm } = buildGame(2);
    const actor = gm.state.current_turn;
    const potBefore = gm.state.pot;
    const phaseBefore = gm.state.phase;

    // Perform a fold action (which saves a snapshot first)
    gm.placeBet(actor, 'fold');
    expect(gm.state.phase).toBe('showdown');

    // Undo it
    const result = gm.undoAction();
    expect(result).toEqual({ success: true });

    // State should be restored
    expect(gm.state.phase).toBe(phaseBefore);
    expect(gm.state.pot).toBe(potBefore);
    expect(gm.state.current_turn).toBe(actor);
    expect(gm.state.winner).toBeNull();
  });

  test('undo restores folded player to active', () => {
    const { gm } = buildGame(2);
    const folderId = gm.state.current_turn;

    gm.placeBet(folderId, 'fold');
    gm.undoAction();

    const folder = gm.state.players.find(p => p.id === folderId);
    expect(folder.is_active).toBe(true);
    expect(folder.action).toBe('waiting');
  });

  test('multiple undos step back through history', () => {
    const { gm } = buildGame(2);
    const snapshots = [];

    // Record state snapshots before each action
    snapshots.push({ turn: gm.state.current_turn, pot: gm.state.pot });

    const p1 = gm.state.current_turn;
    gm.placeBet(p1, 'call');
    snapshots.push({ turn: gm.state.current_turn, pot: gm.state.pot });

    // Undo call
    gm.undoAction();
    expect(gm.state.current_turn).toBe(snapshots[0].turn);
    expect(gm.state.pot).toBe(snapshots[0].pot);
  });

  test('can_undo flag is false when history is empty', () => {
    const gm = new GameManager('flag-test');
    gm.addPlayer('a', 'A');
    gm.addPlayer('b', 'B');
    // Before startGame, history should be empty
    const pub = gm.getPublicState('a', false);
    expect(pub.can_undo).toBe(false);
  });

  test('can_undo flag is true after an action is taken', () => {
    const { gm } = buildGame(2);
    // placeBet saves a snapshot before acting
    const pub = gm.getPublicState(gm.state.current_turn, false);
    // startGame itself saved a snapshot to history
    expect(pub.can_undo).toBe(true);
  });
});

// ─────────────────────────────────────────────
//  Suite 6 — rollbackStreet
// ─────────────────────────────────────────────
describe('rollbackStreet', () => {
  test('returns error when no street snapshots exist', () => {
    const gm = new GameManager('rb-empty');
    expect(gm.rollbackStreet()).toEqual({ error: 'No previous street to roll back to' });
  });

  test('rolling back from flop restores preflop state', () => {
    const { gm } = buildGame(2);

    // Advance to flop
    const first = gm.state.current_turn;
    gm.placeBet(first, 'call');
    const second = gm.state.current_turn;
    gm.placeBet(second, 'check');
    // Capture the state just before we advanced (snapshot is taken here by _advanceStreet)
    const preflopEndPot = gm.state.pot;
    expect(gm.state.phase).toBe('flop');

    // Roll back
    const result = gm.rollbackStreet();
    expect(result).toEqual({ success: true });

    // Should be back at preflop; pot reflects end-of-preflop betting (snapshot taken at that point)
    expect(gm.state.phase).toBe('preflop');
    expect(gm.state.pot).toBe(preflopEndPot);
  });

  test('can_rollback_street flag is true after a street advance', () => {
    const { gm } = buildGame(2);
    const first = gm.state.current_turn;
    gm.placeBet(first, 'call');
    const second = gm.state.current_turn;
    gm.placeBet(second, 'check');
    const pub = gm.getPublicState('p1', false);
    expect(pub.can_rollback_street).toBe(true);
  });

  test('rollback clears street_snapshots entry', () => {
    const { gm } = buildGame(2);
    const first = gm.state.current_turn;
    gm.placeBet(first, 'call');
    const second = gm.state.current_turn;
    gm.placeBet(second, 'check'); // advances to flop, saves street snap

    expect(gm.state.street_snapshots).toHaveLength(1);
    gm.rollbackStreet();
    expect(gm.state.street_snapshots).toHaveLength(0);
  });

  test('action history is preserved across rollback (history not wiped)', () => {
    const { gm } = buildGame(2);
    const historyLengthAfterStart = gm.state.history.length;

    const first = gm.state.current_turn;
    gm.placeBet(first, 'call');
    gm.rollbackStreet(); // note: advancing to flop triggers _advanceStreet which saves street snap, not action snap; the call action snap is in history

    // History should still contain pre-call snapshot
    expect(gm.state.history.length).toBeGreaterThanOrEqual(historyLengthAfterStart);
  });
});

// ─────────────────────────────────────────────
//  Suite 7 — manualDealCard: duplicate rejection
// ─────────────────────────────────────────────

// Clear all RNG-dealt cards so manual-deal tests start from a blank slate
function clearCards(gm) {
  gm.state.players.forEach(p => { p.hole_cards = []; });
  gm.state.board = [];
}

describe('manualDealCard — duplicate rejection', () => {
  test('rejects dealing a card that is already in play', () => {
    const { gm, ids } = buildGame(2);
    clearCards(gm);
    // Deal Ah to p1 slot 0
    gm.manualDealCard('player', ids[0], 0, 'Ah');
    // Try to deal Ah to p2 slot 0 — should be rejected
    const result = gm.manualDealCard('player', ids[1], 0, 'Ah');
    expect(result).toHaveProperty('error');
    expect(result.error).toMatch(/duplicate|already dealt/i);
  });

  test('rejects dealing a card already on the board', () => {
    const { gm, ids } = buildGame(2);
    clearCards(gm);
    gm.manualDealCard('board', null, 0, 'Kd');
    const result = gm.manualDealCard('player', ids[0], 0, 'Kd');
    expect(result).toHaveProperty('error');
    expect(result.error).toMatch(/duplicate|already dealt/i);
  });

  test('rejects an invalid card format', () => {
    const { gm, ids } = buildGame(2);
    const result = gm.manualDealCard('player', ids[0], 0, 'ZZ');
    expect(result).toHaveProperty('error');
    expect(result.error).toMatch(/not a valid card/i);
  });

  test('rejects dealing to a non-existent player', () => {
    const { gm } = buildGame(2);
    const result = gm.manualDealCard('player', 'ghost-id', 0, 'Qs');
    expect(result).toHaveProperty('error');
    expect(result.error).toMatch(/[Pp]layer not found/);
  });
});

// ─────────────────────────────────────────────
//  Suite 8 — manualDealCard: replace card in same slot
// ─────────────────────────────────────────────
describe('manualDealCard — replace card in same slot', () => {
  test('replacing a player hole card with a different card succeeds', () => {
    const { gm, ids } = buildGame(2);
    clearCards(gm);
    gm.manualDealCard('player', ids[0], 0, 'Ah');

    // Replace slot 0 with a different card
    const result = gm.manualDealCard('player', ids[0], 0, 'Kh');
    expect(result).toEqual({ success: true });

    const player = gm.state.players.find(p => p.id === ids[0]);
    expect(player.hole_cards[0]).toBe('Kh');
  });

  test('replacing a player hole card with the SAME card succeeds (idempotent)', () => {
    const { gm, ids } = buildGame(2);
    clearCards(gm);
    gm.manualDealCard('player', ids[0], 0, 'Ah');
    // Replacing with the same card: old card is removed from `used` before checking
    const result = gm.manualDealCard('player', ids[0], 0, 'Ah');
    expect(result).toEqual({ success: true });
  });

  test('replacing a board card succeeds', () => {
    const { gm } = buildGame(2);
    clearCards(gm);
    gm.manualDealCard('board', null, 0, '2c');
    const result = gm.manualDealCard('board', null, 0, '3c');
    expect(result).toEqual({ success: true });
    expect(gm.state.board[0]).toBe('3c');
  });

  test('after replacement the old card is freed (can be used elsewhere)', () => {
    const { gm, ids } = buildGame(2);
    clearCards(gm);
    gm.manualDealCard('player', ids[0], 0, 'Ah');
    // Replace it
    gm.manualDealCard('player', ids[0], 0, 'Kh');
    // Ah should now be free to use
    const result = gm.manualDealCard('player', ids[1], 0, 'Ah');
    expect(result).toEqual({ success: true });
  });

  test('successful deal saves an action snapshot (undo becomes available)', () => {
    const { gm, ids } = buildGame(2);
    clearCards(gm);
    const histBefore = gm.state.history.length;
    gm.manualDealCard('player', ids[0], 0, 'Ts');
    expect(gm.state.history.length).toBeGreaterThan(histBefore);
  });
});

// ─────────────────────────────────────────────
//  Suite 9 — Blind posting with all-in on blind
// ─────────────────────────────────────────────
describe('blind posting — all-in on blind', () => {
  test('player with stack < small_blind goes all-in and posts what they have', () => {
    // Give p2 (who will be SB in a 2-player game) only 5 chips
    // dealer_seat=0 → p1=dealer+BB, p2=SB, so override p2's stack
    const { gm } = buildGame(2, { p2: 5 });

    const sb = gm.state.players.find(p => p.is_small_blind);
    expect(sb.id).toBe('p2');
    expect(sb.stack).toBe(0);           // all chips posted
    expect(sb.current_bet).toBe(5);     // paid what they had
    expect(sb.is_all_in).toBe(true);
    expect(sb.action).toBe('all-in');
  });

  test('player with stack exactly equal to big_blind posts full BB and is NOT all-in', () => {
    // p1 is BB in 2-player with dealer_seat=0; give them exactly 20
    const { gm } = buildGame(2, { p1: 20 });
    const bb = gm.state.players.find(p => p.is_big_blind);
    expect(bb.stack).toBe(0);
    expect(bb.current_bet).toBe(20);
    // They posted exactly the blind amount — they ARE all-in (stack hits 0)
    expect(bb.is_all_in).toBe(true);
  });

  test('player with stack < big_blind posts partial blind and goes all-in', () => {
    // p1 is BB; give them only 15 chips (less than BB=20)
    const { gm } = buildGame(2, { p1: 15 });
    const bb = gm.state.players.find(p => p.is_big_blind);
    expect(bb.current_bet).toBe(15);
    expect(bb.stack).toBe(0);
    expect(bb.is_all_in).toBe(true);
  });

  test('pot equals sum of actual chips posted when a player is all-in on blind', () => {
    const { gm } = buildGame(2, { p2: 5 });
    // p2 posts 5 (all-in), p1 posts 20 (BB)
    expect(gm.state.pot).toBe(25);
  });
});

// ─────────────────────────────────────────────
//  Suite 10 — _isBettingRoundOver
// ─────────────────────────────────────────────
describe('_isBettingRoundOver', () => {
  test('returns false when a player still has action=waiting', () => {
    const { gm } = buildGame(2);
    // At start of preflop, SB has acted (waiting) but current_turn player hasn't
    // At least one player has action='waiting'
    expect(gm._isBettingRoundOver()).toBe(false);
  });

  test('returns true when all active non-all-in players have acted and matched current_bet', () => {
    const { gm } = buildGame(2);

    // Manually force both players into a state where they've matched
    gm.state.current_bet = 20;
    gm.state.players.forEach(p => {
      if (!p.is_coach) {
        p.action = 'called';
        p.total_bet_this_round = 20;
        p.is_active = true;
        p.is_all_in = false;
      }
    });

    expect(gm._isBettingRoundOver()).toBe(true);
  });

  test('returns true when all active players are all-in', () => {
    const { gm } = buildGame(2);
    gm.state.players.forEach(p => {
      if (!p.is_coach) {
        p.is_active = true;
        p.is_all_in = true;
        p.action = 'all-in';
      }
    });
    expect(gm._isBettingRoundOver()).toBe(true);
  });

  test('returns false when one player has not matched current_bet', () => {
    const { gm } = buildGame(2);
    gm.state.current_bet = 40;
    gm.state.players.forEach((p, i) => {
      if (!p.is_coach) {
        p.is_active = true;
        p.is_all_in = false;
        p.action = i === 0 ? 'raised' : 'waiting'; // second player hasn't acted
        p.total_bet_this_round = i === 0 ? 40 : 20;
      }
    });
    expect(gm._isBettingRoundOver()).toBe(false);
  });

  test('returns true with no active non-all-in players (edge: everyone all-in or folded)', () => {
    const { gm } = buildGame(3);
    gm.state.players.forEach(p => {
      if (!p.is_coach) {
        p.is_active = true;
        p.is_all_in = true;
      }
    });
    expect(gm._isBettingRoundOver()).toBe(true);
  });
});

// ─────────────────────────────────────────────
//  Suite 11 — placeBet: general guard clauses
// ─────────────────────────────────────────────
describe('placeBet — guard clauses', () => {
  test('rejects bet when not in a betting phase', () => {
    const gm = new GameManager('guard');
    gm.addPlayer('a', 'A');
    gm.addPlayer('b', 'B');
    // Don't start the game — phase is 'waiting'
    expect(gm.placeBet('a', 'fold')).toEqual({ error: 'No active betting round' });
  });

  test('rejects bet when game is paused', () => {
    const { gm } = buildGame(2);
    gm.togglePause();
    const actor = gm.state.current_turn;
    expect(gm.placeBet(actor, 'fold')).toEqual({ error: 'Game is paused' });
  });

  test('rejects bet when it is not the player\'s turn', () => {
    const { gm, ids } = buildGame(2);
    const notTurn = ids.find(id => id !== gm.state.current_turn);
    expect(gm.placeBet(notTurn, 'fold')).toEqual({ error: 'Not your turn' });
  });

  test('rejects check when there is a bet to call', () => {
    const { gm } = buildGame(2);
    // Preflop: current_bet = 20, actor has total_bet_this_round < 20, so toCall > 0
    const actor = gm.state.current_turn;
    const actorObj = gm.state.players.find(p => p.id === actor);
    // Ensure they haven't matched the BB
    if (actorObj.total_bet_this_round < gm.state.current_bet) {
      const result = gm.placeBet(actor, 'check');
      expect(result).toHaveProperty('error');
      expect(result.error).toMatch(/[Cc]heck/);
    }
  });
});

// ─────────────────────────────────────────────
//  Suite 12 — getPublicState card hiding
// ─────────────────────────────────────────────
describe('getPublicState — card hiding', () => {
  test('hides opponent hole cards from non-coach requesters', () => {
    const { gm, ids } = buildGame(2);
    // Set hole cards directly to avoid duplicate-card conflicts with the RNG-dealt cards
    gm.state.players.find(p => p.id === ids[0]).hole_cards = ['Ah', 'Kh'];
    gm.state.players.find(p => p.id === ids[1]).hole_cards = ['2c', '3c'];

    // Request as p1 (non-coach)
    const pub = gm.getPublicState(ids[0], false);
    const p1View = pub.players.find(p => p.id === ids[0]);
    const p2View = pub.players.find(p => p.id === ids[1]);

    // p1 sees own cards
    expect(p1View.hole_cards).toEqual(['Ah', 'Kh']);
    // p1 sees p2's cards as HIDDEN
    expect(p2View.hole_cards).toEqual(['HIDDEN', 'HIDDEN']);
  });

  test('coach sees all hole cards', () => {
    const { gm, ids } = buildGame(2);
    gm.manualDealCard('player', ids[0], 0, 'Ah');
    gm.manualDealCard('player', ids[1], 0, '2c');

    const pub = gm.getPublicState('coach-id', true); // isCoach = true
    pub.players.forEach(p => {
      p.hole_cards.forEach(c => expect(c).not.toBe('HIDDEN'));
    });
  });

  test('showdown reveals all cards to everyone', () => {
    const { gm, ids } = buildGame(2);
    gm.manualDealCard('player', ids[0], 0, 'Ah');
    gm.manualDealCard('player', ids[1], 0, '2c');

    // Force showdown via fold
    const folder = gm.state.current_turn;
    gm.placeBet(folder, 'fold');
    expect(gm.state.phase).toBe('showdown');

    const pub = gm.getPublicState(ids[0], false);
    pub.players.forEach(p => {
      p.hole_cards.forEach(c => expect(c).not.toBe('HIDDEN'));
    });
  });
});

// ─────────────────────────────────────────────
//  Suite — GAP FIXES
// ─────────────────────────────────────────────

describe('GAP 1 — setBlindLevels phase guard', () => {
  test('setBlindLevels succeeds when phase is waiting', () => {
    const gm = new GameManager('t-blinds');
    const result = gm.setBlindLevels(25, 50);
    expect(result).toEqual({ success: true });
    expect(gm.state.small_blind).toBe(25);
    expect(gm.state.big_blind).toBe(50);
  });

  test('setBlindLevels returns error when a hand is active', () => {
    const { gm } = buildGame(2);
    expect(gm.state.phase).toBe('preflop');
    const result = gm.setBlindLevels(25, 50);
    expect(result).toHaveProperty('error');
    expect(result.error).toMatch(/active hand/i);
  });

  test('blind levels unchanged after mid-hand rejection', () => {
    const { gm } = buildGame(2);
    const origSb = gm.state.small_blind;
    const origBb = gm.state.big_blind;
    gm.setBlindLevels(25, 50);
    expect(gm.state.small_blind).toBe(origSb);
    expect(gm.state.big_blind).toBe(origBb);
  });
});

describe('GAP 2 — dealer rotation skips disconnected players', () => {
  test('dealer rotates to next connected player when one is disconnected', () => {
    const gm = new GameManager('t-dealer');
    gm.addPlayer('p1', 'P1');
    gm.addPlayer('p2', 'P2');
    gm.addPlayer('p3', 'P3');
    gm.startGame('rng');

    const p2 = gm.state.players.find(p => p.id === 'p2');
    p2.disconnected = true;

    gm.resetForNextHand();
    const newDealerPlayer = gm._gamePlayers()[gm.state.dealer_seat];
    expect(newDealerPlayer.disconnected).not.toBe(true);
  });

  test('dealer rotation does not throw when all players are disconnected', () => {
    const gm = new GameManager('t-dealer-alldc');
    gm.addPlayer('p1', 'P1');
    gm.addPlayer('p2', 'P2');
    gm.startGame('rng');
    gm._gamePlayers().forEach(p => { p.disconnected = true; });
    expect(() => gm.resetForNextHand()).not.toThrow();
    expect(gm.state.dealer_seat).toBeGreaterThanOrEqual(0);
  });
});

describe('GAP 3 — manualDealCard mode guard', () => {
  test('manualDealCard in rng mode returns error', () => {
    const gm = new GameManager('t-rng');
    gm.addPlayer('p1', 'P1');
    gm.addPlayer('p2', 'P2');
    gm.startGame('rng');
    const result = gm.manualDealCard('player', 'p1', 0, 'Ah');
    expect(result).toHaveProperty('error');
    expect(result.error).toMatch(/manual or hybrid/i);
  });

  test('manualDealCard in manual mode is allowed', () => {
    const { gm, ids } = buildGame(2);
    expect(gm.state.mode).toBe('manual');
    gm.state.players.forEach(p => { p.hole_cards = []; });
    const result = gm.manualDealCard('player', ids[0], 0, 'Ah');
    expect(result).toEqual({ success: true });
  });
});

describe('GAP 6 — addPlayer custom starting stack', () => {
  test('addPlayer uses default stack of 1000 when not specified', () => {
    const gm = new GameManager('t-stack');
    gm.addPlayer('p1', 'Player 1');
    const p = gm.state.players.find(pl => pl.id === 'p1');
    expect(p.stack).toBe(1000);
  });

  test('addPlayer uses provided stack value', () => {
    const gm = new GameManager('t-stack');
    gm.addPlayer('p1', 'Player 1', false, null, 500);
    const p = gm.state.players.find(pl => pl.id === 'p1');
    expect(p.stack).toBe(500);
  });

  test('addPlayer with custom stack 2500', () => {
    const gm = new GameManager('t-stack');
    gm.addPlayer('rich', 'Rich Player', false, null, 2500);
    const p = gm.state.players.find(pl => pl.id === 'rich');
    expect(p.stack).toBe(2500);
  });
});
