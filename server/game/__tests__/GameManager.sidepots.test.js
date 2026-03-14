'use strict';

/**
 * GameManager.sidepots.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Integration tests verifying that buildSidePots is correctly wired into
 * GameManager._resolveShowdown().
 *
 * Test suites:
 *   Suite 1: _resolveShowdown with no all-in players (single-pot path)
 *   Suite 2: _resolveShowdown with 2-player all-in scenario
 *   Suite 3: _resolveShowdown with 3-player all-in cascade
 *   Suite 4: total_contributed tracking via placeBet (integration path)
 *   Suite 5: getPublicState exposes side_pots
 *
 * Strategy for direct state manipulation tests:
 *   - Call startGame() to initialise a valid game structure (deals cards, sets phase, etc.)
 *   - Then overwrite gm.state.players[i].stack / total_contributed / is_all_in as needed
 *   - Set gm.state.board to a known 5-card board
 *   - Set hole_cards to known hands
 *   - Call gm._resolveShowdown() directly
 *   - Assert gm.state.showdown_result and player stacks
 */

const GameManager = require('../GameManager');

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Create a GameManager with numPlayers seated and game started in RNG mode.
 * Returns the GameManager instance.
 */
function setupGame(numPlayers = 3) {
  const gm = new GameManager('test');
  for (let i = 0; i < numPlayers; i++) {
    gm.addPlayer(`p${i}`, `Player${i}`);
  }
  gm.startGame('rng');
  return gm;
}

/**
 * Overwrite a player's hole cards and the board with deterministic cards so
 * _resolveShowdown() produces predictable hand evaluations.
 *
 * strongIdx  — index of player who should have the strongest hand (Aces full of Kings)
 * weakIdx    — index of player who should have a weaker hand (low cards, no pair)
 *
 * Board: Ac Ad As 7h 8d
 * Strong player: Ah Kh  → Four Aces
 * Weak player:   2c 3d  → no improvement (high card on board aces dominate but A-trips is weaker than quads)
 *
 * NOTE: when all players share the same board the HAND RANK decides the winner.
 */
function setKnownCards(gm, strongIdx, weakIdx) {
  gm.state.board = ['Ac', 'Ad', 'As', '7h', '8d'];
  gm.state.players[strongIdx].hole_cards = ['Ah', 'Kh']; // Four aces
  gm.state.players[weakIdx].hole_cards   = ['2c', '3d']; // No pair with board
}

/**
 * Set hole cards and board so strongIdx wins and midIdx beats weakIdx but
 * loses to strongIdx. Used for 3-player tests.
 *
 * Board: Ac Ad As 7h 8d
 * strongIdx : Ah Kh  → Four Aces + King kicker
 * midIdx    : Kd Kc  → Full house KKK + AA  (board gives 3×A; hole KK → fullhouse AA-KKK? No.
 *                      Actually best 5 from [Kd,Kc,Ac,Ad,As,7h,8d]:
 *                      → Three Aces (Ac Ad As) + Kd Kc = Full House (Aces full of Kings)
 * weakIdx   : 2c 3d  → Three Aces (Ac Ad As) + 8d 7h  = Two pair… actually just trips/kicker
 *                      Best 5: Ac Ad As 8d 7h = Three of a kind, aces
 *
 * So: strongIdx (four aces) > midIdx (full house) > weakIdx (three of a kind)
 */
function setKnownCards3(gm, strongIdx, midIdx, weakIdx) {
  gm.state.board = ['Ac', 'Ad', 'As', '7h', '8d'];
  gm.state.players[strongIdx].hole_cards = ['Ah', 'Kh']; // Four Aces
  gm.state.players[midIdx].hole_cards    = ['Kd', 'Kc']; // Full house A-A-A-K-K
  gm.state.players[weakIdx].hole_cards   = ['2c', '3d']; // Three aces (2/3 kickers)
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 1 — _resolveShowdown with no all-in players (single-pot path)
// ─────────────────────────────────────────────────────────────────────────────

describe('Suite 1: _resolveShowdown with no all-in players (single-pot path)', () => {
  test('1. side_pots stays [] when no player is all-in', () => {
    const gm = setupGame(2);

    // Both players active, not all-in; pot = 150
    gm.state.pot = 150;
    gm.state.players.forEach(p => { p.is_all_in = false; });
    setKnownCards(gm, 0, 1);

    gm._resolveShowdown();

    expect(gm.state.side_pots).toEqual([]);
  });

  test('2. single winner gets full pot when no all-in players', () => {
    const gm = setupGame(2);
    const initialStackWinner = gm.state.players[0].stack;

    gm.state.pot = 200;
    gm.state.players.forEach(p => { p.is_all_in = false; });
    setKnownCards(gm, 0, 1); // player 0 wins (four aces)

    gm._resolveShowdown();

    expect(gm.state.pot).toBe(0);
    expect(gm.state.showdown_result).not.toBeNull();
    expect(gm.state.showdown_result.sidePotResults).toBeUndefined();
    expect(gm.state.showdown_result.winners[0].playerId).toBe('p0');
    expect(gm.state.showdown_result.potAwarded).toBe(200);
    expect(gm.state.players[0].stack).toBe(initialStackWinner + 200);
  });

  test('3. showdown_result has no sidePotResults on single-pot path', () => {
    const gm = setupGame(2);

    gm.state.pot = 100;
    gm.state.players.forEach(p => { p.is_all_in = false; });
    setKnownCards(gm, 0, 1);

    gm._resolveShowdown();

    const result = gm.state.showdown_result;
    expect(result).not.toBeNull();
    expect(result.sidePotResults).toBeUndefined();
    expect(result.splitPot).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 2 — _resolveShowdown with 2-player all-in scenario
// ─────────────────────────────────────────────────────────────────────────────

describe('Suite 2: _resolveShowdown with 2-player all-in scenario', () => {
  /**
   * Scenario:
   *   Player A (p0): all-in for 50, total_contributed=50, stack=0
   *   Player B (p1): all-in for 100, total_contributed=100, stack=0
   *   Pot = 150
   *
   *   buildSidePots produces:
   *     main pot:  { amount: 100, eligiblePlayerIds: ['p0','p1'] }  (50 each)
   *     side pot:  { amount: 50,  eligiblePlayerIds: ['p1'] }       (B's extra 50)
   */
  function setup2PlayerAllIn(gm) {
    const [pA, pB] = gm.state.players;

    pA.stack            = 0;
    pA.total_contributed = 50;
    pA.is_all_in        = true;
    pA.is_active        = true;
    pA.action           = 'all-in';

    pB.stack            = 0;
    pB.total_contributed = 100;
    pB.is_all_in        = true;
    pB.is_active        = true;
    pB.action           = 'all-in';

    gm.state.pot = 150;
  }

  test('4. side_pots is non-empty when all-in players have different contributions', () => {
    const gm = setupGame(2);
    setup2PlayerAllIn(gm);
    setKnownCards(gm, 0, 1); // p0 wins (four aces)

    gm._resolveShowdown();

    expect(gm.state.side_pots).toHaveLength(2);
  });

  test('5. sidePotResults present on showdown_result when side pots exist', () => {
    const gm = setupGame(2);
    setup2PlayerAllIn(gm);
    setKnownCards(gm, 0, 1);

    gm._resolveShowdown();

    const result = gm.state.showdown_result;
    expect(result).not.toBeNull();
    expect(Array.isArray(result.sidePotResults)).toBe(true);
    expect(result.sidePotResults.length).toBeGreaterThan(0);
  });

  test('6. when stronger player (p0) wins: p0 gets main pot, p1 gets side pot', () => {
    // p0 has four aces (strongest), p1 has trash hand
    // main pot (100): p0 wins → p0 gets 100
    // side pot (50):  only p1 eligible → p1 gets 50
    const gm = setupGame(2);
    setup2PlayerAllIn(gm);
    setKnownCards(gm, 0, 1); // p0 = strong

    gm._resolveShowdown();

    // p0 wins main pot of 100
    expect(gm.state.players[0].stack).toBe(100);
    // p1 wins side pot of 50 (only eligible player)
    expect(gm.state.players[1].stack).toBe(50);
    // All chips accounted for (pot drained)
    expect(gm.state.pot).toBe(0);
  });

  test('7. when weaker player (p1) wins: p1 wins all 150 (main+side)', () => {
    // p1 has four aces, p0 has trash
    // main pot (100): p1 wins → p1 gets 100
    // side pot (50):  only p1 eligible → p1 gets 50
    const gm = setupGame(2);
    setup2PlayerAllIn(gm);
    setKnownCards(gm, 1, 0); // p1 = strong

    gm._resolveShowdown();

    expect(gm.state.players[0].stack).toBe(0);
    expect(gm.state.players[1].stack).toBe(150);
    expect(gm.state.pot).toBe(0);
  });

  test('8. chip conservation: sum of stacks after showdown equals pre-showdown pot', () => {
    const gm = setupGame(2);
    setup2PlayerAllIn(gm);
    setKnownCards(gm, 0, 1);

    const potBefore = gm.state.pot; // 150

    gm._resolveShowdown();

    const stackSum = gm.state.players[0].stack + gm.state.players[1].stack;
    expect(stackSum).toBe(potBefore);
    expect(gm.state.pot).toBe(0);
  });

  test('9. side_pots structure: main pot eligible includes both players', () => {
    const gm = setupGame(2);
    setup2PlayerAllIn(gm);
    setKnownCards(gm, 0, 1);

    gm._resolveShowdown();

    const sidePots = gm.state.side_pots;
    // First pot (main): both players eligible
    const mainPot = sidePots[0];
    expect(mainPot.amount).toBe(100);
    expect(mainPot.eligiblePlayerIds).toEqual(expect.arrayContaining(['p0', 'p1']));
    expect(mainPot.eligiblePlayerIds).toHaveLength(2);

    // Second pot (side): only p1 eligible (contributed more)
    const sidePot = sidePots[1];
    expect(sidePot.amount).toBe(50);
    expect(sidePot.eligiblePlayerIds).toEqual(['p1']);
  });

  test('10. potAwarded in showdown_result equals total pot', () => {
    const gm = setupGame(2);
    setup2PlayerAllIn(gm);
    setKnownCards(gm, 0, 1);

    gm._resolveShowdown();

    expect(gm.state.showdown_result.potAwarded).toBe(150);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 3 — _resolveShowdown with 3-player all-in cascade
// ─────────────────────────────────────────────────────────────────────────────

describe('Suite 3: _resolveShowdown with 3-player all-in cascade', () => {
  /**
   * Scenario:
   *   Player A (p0): total_contributed=30, is_all_in=true,  stack=0
   *   Player B (p1): total_contributed=60, is_all_in=true,  stack=0
   *   Player C (p2): total_contributed=90, is_all_in=false, stack=0 (called, not all-in)
   *   Pot = 180
   *
   *   buildSidePots produces:
   *     pot0: level 30  → amount= 30*3      = 90,  eligible [p0,p1,p2]
   *     pot1: level 60  → amount= (60-30)*2 = 60,  eligible [p1,p2]
   *     pot2: level 90  → amount= (90-60)*1 = 30,  eligible [p2]
   */
  function setup3PlayerCascade(gm) {
    const [pA, pB, pC] = gm.state.players;

    pA.stack             = 0;
    pA.total_contributed = 30;
    pA.is_all_in         = true;
    pA.is_active         = true;
    pA.action            = 'all-in';

    pB.stack             = 0;
    pB.total_contributed = 60;
    pB.is_all_in         = true;
    pB.is_active         = true;
    pB.action            = 'all-in';

    pC.stack             = 0;
    pC.total_contributed = 90;
    pC.is_all_in         = false;
    pC.is_active         = true;
    pC.action            = 'called';

    gm.state.pot = 180;
  }

  test('11. three side pots produced for cascade all-in scenario', () => {
    const gm = setupGame(3);
    setup3PlayerCascade(gm);
    setKnownCards3(gm, 0, 1, 2);

    gm._resolveShowdown();

    expect(gm.state.side_pots).toHaveLength(3);
  });

  test('12. pot amounts are correct: 90 / 60 / 30', () => {
    const gm = setupGame(3);
    setup3PlayerCascade(gm);
    setKnownCards3(gm, 0, 1, 2);

    gm._resolveShowdown();

    const [pot0, pot1, pot2] = gm.state.side_pots;
    expect(pot0.amount).toBe(90);
    expect(pot1.amount).toBe(60);
    expect(pot2.amount).toBe(30);
  });

  test('13. eligible player sets are correct for each pot', () => {
    const gm = setupGame(3);
    setup3PlayerCascade(gm);
    setKnownCards3(gm, 0, 1, 2);

    gm._resolveShowdown();

    const [pot0, pot1, pot2] = gm.state.side_pots;

    // pot0: all three eligible
    expect(pot0.eligiblePlayerIds).toEqual(expect.arrayContaining(['p0', 'p1', 'p2']));
    expect(pot0.eligiblePlayerIds).toHaveLength(3);

    // pot1: p1 and p2 eligible, not p0
    expect(pot1.eligiblePlayerIds).toEqual(expect.arrayContaining(['p1', 'p2']));
    expect(pot1.eligiblePlayerIds).toHaveLength(2);
    expect(pot1.eligiblePlayerIds).not.toContain('p0');

    // pot2: only p2 eligible
    expect(pot2.eligiblePlayerIds).toEqual(['p2']);
  });

  test('14. p0 wins main pot (90), p1 wins middle pot (60), p2 wins side pot (30)', () => {
    // p0 = four aces (strongest) → wins pot0 (90)
    // p1 = full house (medium)   → wins pot1 among {p1,p2} (60)
    // p2 = three of a kind       → sole eligible for pot2 (30)
    const gm = setupGame(3);
    setup3PlayerCascade(gm);
    setKnownCards3(gm, 0, 1, 2);

    gm._resolveShowdown();

    expect(gm.state.players[0].stack).toBe(90);
    expect(gm.state.players[1].stack).toBe(60);
    expect(gm.state.players[2].stack).toBe(30);
    expect(gm.state.pot).toBe(0);
  });

  test('15. chip conservation: total stacks after showdown equals pre-showdown pot', () => {
    const gm = setupGame(3);
    setup3PlayerCascade(gm);
    setKnownCards3(gm, 0, 1, 2);

    const potBefore = gm.state.pot; // 180

    gm._resolveShowdown();

    const stackSum = gm.state.players.reduce((s, p) => s + p.stack, 0);
    expect(stackSum).toBe(potBefore);
    expect(gm.state.pot).toBe(0);
  });

  test('16. showdown_result.sidePotResults has an entry for each side pot', () => {
    const gm = setupGame(3);
    setup3PlayerCascade(gm);
    setKnownCards3(gm, 0, 1, 2);

    gm._resolveShowdown();

    const { sidePotResults } = gm.state.showdown_result;
    expect(Array.isArray(sidePotResults)).toBe(true);
    expect(sidePotResults).toHaveLength(3);
  });

  test('17. each sidePotResult entry has potAmount, eligiblePlayerIds, and winners', () => {
    const gm = setupGame(3);
    setup3PlayerCascade(gm);
    setKnownCards3(gm, 0, 1, 2);

    gm._resolveShowdown();

    for (const entry of gm.state.showdown_result.sidePotResults) {
      expect(typeof entry.potAmount).toBe('number');
      expect(Array.isArray(entry.eligiblePlayerIds)).toBe(true);
      expect(Array.isArray(entry.winners)).toBe(true);
      expect(entry.winners.length).toBeGreaterThan(0);
    }
  });

  test('18. weakest player (p2) wins only the pot they are exclusively eligible for', () => {
    // When p0 has the best hand, p0 wins pot0 (90).
    // p1 wins pot1 among {p1,p2} if p1 beats p2.
    // p2 is the sole eligible player for pot2, so p2 always wins pot2.
    const gm = setupGame(3);
    setup3PlayerCascade(gm);
    setKnownCards3(gm, 0, 1, 2);

    gm._resolveShowdown();

    // p2 must have won at least 30 (the pot they're the sole eligible for)
    expect(gm.state.players[2].stack).toBeGreaterThanOrEqual(30);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 4 — total_contributed tracking via placeBet (integration path)
// ─────────────────────────────────────────────────────────────────────────────

describe('Suite 4: total_contributed tracking via placeBet', () => {
  /**
   * After startGame with 2 players:
   *   players[0] = dealer (no blind)   → BUT with 2 players, dealer IS small blind
   *   Actually with 2 players: dealer = p0, SB = p1 (dealerIdx=0, sbIdx=1, bbIdx=0)
   *   Wait — with 2 players: dealerIdx=0, sbIdx=1, bbIdx=0.
   *   So p0 is dealer+BB and p1 is SB.
   *
   *   After startGame:
   *     p0 (BB):  total_contributed = 20 (big_blind)
   *     p1 (SB):  total_contributed = 10 (small_blind)
   *
   *   NOTE: with 2 players the turn order may vary. Let's verify by checking
   *   which players have SB/BB flags and check their total_contributed.
   */

  test('19. small blind player has total_contributed = small_blind after startGame', () => {
    const gm = setupGame(2);

    const sbPlayer = gm.state.players.find(p => p.is_small_blind);
    expect(sbPlayer).toBeDefined();
    expect(sbPlayer.total_contributed).toBe(gm.state.small_blind);
  });

  test('20. big blind player has total_contributed = big_blind after startGame', () => {
    const gm = setupGame(2);

    const bbPlayer = gm.state.players.find(p => p.is_big_blind);
    expect(bbPlayer).toBeDefined();
    expect(bbPlayer.total_contributed).toBe(gm.state.big_blind);
  });

  test('21. total_contributed increments correctly after a call', () => {
    const gm = setupGame(2);

    // Identify UTG player (current_turn) — they need to call or raise
    const utgId = gm.state.current_turn;
    const utg = gm.state.players.find(p => p.id === utgId);

    const contributedBefore = utg.total_contributed;

    // UTG calls
    const result = gm.placeBet(utgId, 'call');
    expect(result.error).toBeUndefined();

    const toCall = gm.state.big_blind - contributedBefore;
    expect(utg.total_contributed).toBe(contributedBefore + toCall);
  });

  test('22. total_contributed accumulates across streets (not reset per street)', () => {
    const gm = setupGame(2);

    const utgId = gm.state.current_turn;
    const utg = gm.state.players.find(p => p.id === utgId);

    // Preflop: UTG calls
    gm.placeBet(utgId, 'call');
    const afterPreflopCall = utg.total_contributed;

    // Now it's the BB/SB player's turn; they check
    const otherId = gm.state.current_turn;
    if (otherId) {
      gm.placeBet(otherId, 'check');
    }

    // Advance to flop — total_contributed should NOT reset
    expect(utg.total_contributed).toBe(afterPreflopCall);
  });

  test('23. total_contributed after a raise equals the raised amount (from zero pre-blind)', () => {
    // Use 3 players so UTG has contributed 0 before raising
    const gm = setupGame(3);

    const utgId = gm.state.current_turn;
    const utg = gm.state.players.find(p => p.id === utgId);

    // UTG has not posted a blind (3 players: dealer, SB, BB; UTG = 4th seat wrap = player[0])
    const priorContrib = utg.total_contributed; // should be 0 for non-blind player

    // UTG raises to 40 (min_raise=20, current_bet=20, so min total = 40)
    const raiseResult = gm.placeBet(utgId, 'raise', 40);
    if (!raiseResult.error) {
      // total_contributed should reflect the chips placed: 40 - priorContrib
      expect(utg.total_contributed).toBe(priorContrib + (40 - priorContrib));
    }
    // If UTG has prior_contrib > 0 (i.e., they posted a blind), the chips paid = 40 - priorContrib
  });

  test('24. total_contributed is 0 for all players before startGame', () => {
    const gm = new GameManager('test');
    gm.addPlayer('p0', 'Player0');
    gm.addPlayer('p1', 'Player1');

    // Before startGame, total_contributed should be 0
    gm.state.players.forEach(p => {
      expect(p.total_contributed).toBe(0);
    });
  });

  test('25. total_contributed resets to 0 at startGame (new hand)', () => {
    const gm = setupGame(2);

    // After first hand starts, blinds are posted
    gm.state.players.forEach(p => {
      expect(p.total_contributed).toBeGreaterThanOrEqual(0);
    });

    // Advance to showdown by forcing streets — set minimal board and call/check
    // Instead, just verify reset happens on resetForNextHand
    gm.resetForNextHand();
    gm.state.players.forEach(p => {
      expect(p.total_contributed).toBe(0);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 5 — getPublicState exposes side_pots
// ─────────────────────────────────────────────────────────────────────────────

describe('Suite 5: getPublicState exposes side_pots', () => {
  test('26. getPublicState returns side_pots as empty array before showdown', () => {
    const gm = setupGame(2);
    const state = gm.getPublicState('p0', false);
    expect(Array.isArray(state.side_pots)).toBe(true);
    expect(state.side_pots).toEqual([]);
  });

  test('27. getPublicState returns non-empty side_pots after all-in showdown', () => {
    const gm = setupGame(2);

    // Set up all-in scenario
    const [pA, pB] = gm.state.players;

    pA.stack             = 0;
    pA.total_contributed = 50;
    pA.is_all_in         = true;
    pA.is_active         = true;
    pA.action            = 'all-in';

    pB.stack             = 0;
    pB.total_contributed = 100;
    pB.is_all_in         = true;
    pB.is_active         = true;
    pB.action            = 'all-in';

    gm.state.pot = 150;
    setKnownCards(gm, 0, 1);

    gm._resolveShowdown();

    const publicState = gm.getPublicState('p0', false);
    expect(Array.isArray(publicState.side_pots)).toBe(true);
    expect(publicState.side_pots.length).toBeGreaterThan(0);
  });

  test('28. getPublicState side_pots contains eligiblePlayerIds and amount', () => {
    const gm = setupGame(2);

    const [pA, pB] = gm.state.players;

    pA.stack             = 0;
    pA.total_contributed = 50;
    pA.is_all_in         = true;
    pA.is_active         = true;
    pA.action            = 'all-in';

    pB.stack             = 0;
    pB.total_contributed = 100;
    pB.is_all_in         = true;
    pB.is_active         = true;
    pB.action            = 'all-in';

    gm.state.pot = 150;
    setKnownCards(gm, 0, 1);

    gm._resolveShowdown();

    const { side_pots } = gm.getPublicState('p0', false);
    for (const pot of side_pots) {
      expect(typeof pot.amount).toBe('number');
      expect(pot.amount).toBeGreaterThan(0);
      expect(Array.isArray(pot.eligiblePlayerIds)).toBe(true);
    }
  });

  test('29. getPublicState side_pots is visible to coach and regular players alike', () => {
    const gm = setupGame(2);

    const [pA, pB] = gm.state.players;

    pA.stack             = 0;
    pA.total_contributed = 50;
    pA.is_all_in         = true;
    pA.is_active         = true;
    pA.action            = 'all-in';

    pB.stack             = 0;
    pB.total_contributed = 100;
    pB.is_all_in         = true;
    pB.is_active         = true;
    pB.action            = 'all-in';

    gm.state.pot = 150;
    setKnownCards(gm, 0, 1);

    gm._resolveShowdown();

    const coachState  = gm.getPublicState('coach', true);
    const playerState = gm.getPublicState('p0', false);

    expect(coachState.side_pots).toEqual(playerState.side_pots);
  });

  test('30. side_pots resets to [] after resetForNextHand', () => {
    const gm = setupGame(2);

    const [pA, pB] = gm.state.players;

    pA.stack             = 0;
    pA.total_contributed = 50;
    pA.is_all_in         = true;
    pA.is_active         = true;
    pA.action            = 'all-in';

    pB.stack             = 0;
    pB.total_contributed = 100;
    pB.is_all_in         = true;
    pB.is_active         = true;
    pB.action            = 'all-in';

    gm.state.pot = 150;
    setKnownCards(gm, 0, 1);

    gm._resolveShowdown();

    // Confirm side_pots is populated
    expect(gm.state.side_pots.length).toBeGreaterThan(0);

    // Reset for next hand
    gm.resetForNextHand();

    const publicState = gm.getPublicState('p0', false);
    expect(publicState.side_pots).toEqual([]);
  });
});
