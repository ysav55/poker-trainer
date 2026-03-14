'use strict';

/**
 * SidePot.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Comprehensive tests for server/game/SidePotCalculator.js → buildSidePots()
 *
 * Test suites:
 *   Suite 1: No side pots needed (returns [])
 *   Suite 2: Simple 2-player all-in scenarios
 *   Suite 3: 3-player all-in scenarios
 *   Suite 4: Folded player scenarios
 *   Suite 5: Edge cases
 *
 * Verification pattern used throughout:
 *   sum(pot.amount) === sum(player.total_contributed)
 *   (because every chip must land in exactly one pot)
 */

const { buildSidePots } = require('../SidePotCalculator');

// ── Helper ────────────────────────────────────────────────────────────────────

/**
 * Create a minimal mock player object.
 *
 * NOTE on `action`:
 *   SidePotCalculator.hasFolded() checks `is_active === false && action === 'folded'`.
 *   When is_active=false we must also set action='folded' to make the player
 *   truly treated as folded by the calculator.  When is_active=true, action is
 *   not checked by the calculator so we leave it as 'none'.
 */
function makePlayer(id, total_contributed, is_active = true, is_all_in = false) {
  return {
    id,
    total_contributed,
    is_active,
    is_all_in,
    is_coach: false,
    seat: 0,
    // Folded players must have action === 'folded' to be recognised by hasFolded()
    action: is_active ? 'none' : 'folded',
  };
}

/** Sum helper */
function sumContributed(players) {
  return players.reduce((s, p) => s + p.total_contributed, 0);
}
function sumPots(pots) {
  return pots.reduce((s, p) => s + p.amount, 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 1 — No side pots needed
// ─────────────────────────────────────────────────────────────────────────────

describe('Suite 1: No side pots needed', () => {
  test('1. 2 players, neither all-in → returns []', () => {
    const players = [
      makePlayer('P1', 200),
      makePlayer('P2', 200),
    ];
    expect(buildSidePots(players)).toEqual([]);
  });

  test('2. 3 players, none all-in → returns []', () => {
    const players = [
      makePlayer('P1', 100),
      makePlayer('P2', 100),
      makePlayer('P3', 100),
    ];
    expect(buildSidePots(players)).toEqual([]);
  });

  test('3. 1 player (edge case) → returns []', () => {
    const players = [makePlayer('P1', 500)];
    expect(buildSidePots(players)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 2 — Simple 2-player all-in
// ─────────────────────────────────────────────────────────────────────────────

describe('Suite 2: Simple 2-player all-in', () => {
  test('4. P1 all-in for 50, P2 contributed 150 → two pots', () => {
    const players = [
      makePlayer('P1', 50, true, true),   // all-in at 50
      makePlayer('P2', 150, true, false),  // active, 150 total
    ];
    const pots = buildSidePots(players);

    // Expect exactly 2 pots
    expect(pots).toHaveLength(2);

    // Level 50: 50+50 = 100, eligible [P1,P2]
    expect(pots[0].amount).toBe(100);
    expect(pots[0].eligiblePlayerIds).toEqual(expect.arrayContaining(['P1', 'P2']));
    expect(pots[0].eligiblePlayerIds).toHaveLength(2);

    // Level 150: 0+100 = 100, eligible [P2] only
    expect(pots[1].amount).toBe(100);
    expect(pots[1].eligiblePlayerIds).toEqual(['P2']);

    // Chip conservation
    expect(sumPots(pots)).toBe(sumContributed(players));
  });

  test('5. P1 all-in 100, P2 all-in 100 → single pot returned as [] (no split needed)', () => {
    const players = [
      makePlayer('P1', 100, true, true),
      makePlayer('P2', 100, true, true),
    ];
    // Both all-in for same amount → single pot covers all active players → no split
    const pots = buildSidePots(players);
    expect(pots).toEqual([]);
  });

  test('6. P1 all-in for 0 chips → no empty pot created', () => {
    const players = [
      makePlayer('P1', 0, true, true),   // all-in but contributed nothing
      makePlayer('P2', 200, true, false),
    ];
    const pots = buildSidePots(players);
    // No pot should have amount === 0
    pots.forEach(pot => {
      expect(pot.amount).toBeGreaterThan(0);
    });
    // P1 contributed nothing, so total chips = P2's chips
    if (pots.length > 0) {
      expect(sumPots(pots)).toBe(200);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 3 — 3-player scenarios
// ─────────────────────────────────────────────────────────────────────────────

describe('Suite 3: 3-player scenarios', () => {
  test('7. P1 all-in 50, P2 all-in 150, P3 contributed 200 → 3 pots', () => {
    const players = [
      makePlayer('P1', 50, true, true),   // all-in at 50
      makePlayer('P2', 150, true, true),  // all-in at 150
      makePlayer('P3', 200, true, false), // active, 200 total
    ];
    const pots = buildSidePots(players);

    expect(pots).toHaveLength(3);

    // Level 50: 50+50+50=150, eligible [P1,P2,P3]
    expect(pots[0].amount).toBe(150);
    expect(pots[0].eligiblePlayerIds).toEqual(expect.arrayContaining(['P1', 'P2', 'P3']));
    expect(pots[0].eligiblePlayerIds).toHaveLength(3);

    // Level 150: 0+100+100=200, eligible [P2,P3]
    expect(pots[1].amount).toBe(200);
    expect(pots[1].eligiblePlayerIds).toEqual(expect.arrayContaining(['P2', 'P3']));
    expect(pots[1].eligiblePlayerIds).toHaveLength(2);
    expect(pots[1].eligiblePlayerIds).not.toContain('P1');

    // Level 200: 0+0+50=50, eligible [P3] only
    expect(pots[2].amount).toBe(50);
    expect(pots[2].eligiblePlayerIds).toEqual(['P3']);
  });

  test('8. Chip conservation: sum of pot amounts equals total chips contributed', () => {
    const players = [
      makePlayer('P1', 50, true, true),
      makePlayer('P2', 150, true, true),
      makePlayer('P3', 200, true, false),
    ];
    const pots = buildSidePots(players);

    const totalContributed = sumContributed(players); // 50+150+200 = 400
    const totalPots = sumPots(pots);                  // 150+200+50 = 400

    expect(totalContributed).toBe(400);
    expect(totalPots).toBe(totalContributed);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 4 — Folded player scenarios
// ─────────────────────────────────────────────────────────────────────────────

describe('Suite 4: Folded player scenarios', () => {
  test('9. P1 folded (contributed 100), P2 all-in 200, P3 active 300 → P1 not eligible in any pot', () => {
    // P2 is all-in so side pots are triggered. P1 folded — chips flow in but P1 is not eligible.
    const players = [
      makePlayer('P1', 100, false, false), // folded — is_active=false, action='folded' (set by helper)
      makePlayer('P2', 200, true, true),   // all-in at 200
      makePlayer('P3', 300, true, false),  // active
    ];
    const pots = buildSidePots(players);

    // Must produce at least one pot (P2 all-in triggers side-pot calculation)
    expect(pots.length).toBeGreaterThan(0);

    // Chip conservation: all 600 chips must land in a pot
    expect(sumPots(pots)).toBe(sumContributed(players)); // 100+200+300=600

    // P1 (folded) must not appear in any eligiblePlayerIds
    pots.forEach(pot => {
      expect(pot.eligiblePlayerIds).not.toContain('P1');
    });

    // P2 and P3 should be eligible in at least one pot
    const allEligible = pots.flatMap(pot => pot.eligiblePlayerIds);
    expect(allEligible).toContain('P2');
    expect(allEligible).toContain('P3');
  });

  test('9b. Folded player chips flow into pot amounts (chip conservation with all-in present)', () => {
    // P1 folded having put in 100 chips. Those chips must still be counted in pots.
    const players = [
      makePlayer('P1', 100, false, false), // folded
      makePlayer('P2', 200, true, true),   // all-in — triggers side pot calculation
      makePlayer('P3', 300, true, false),
    ];
    const pots = buildSidePots(players);

    // All 600 chips (including P1's folded 100) must be accounted for
    expect(sumPots(pots)).toBe(600);
  });

  test('10. All players fold except 1 → no side-pot split needed → returns []', () => {
    // Only 1 active player: the calculator returns [] since ≤1 player effectively
    // (or a single-pot scenario with no all-ins among non-folded players)
    const players = [
      makePlayer('P1', 100, false, false), // folded
      makePlayer('P2', 100, false, false), // folded
      makePlayer('P3', 100, true, false),  // sole active player, not all-in
    ];
    const pots = buildSidePots(players);
    // No all-in players → no side pots
    expect(pots).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 5 — Edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe('Suite 5: Edge cases', () => {
  test('11. All players all-in for same amount → single pot covering all → returns []', () => {
    const players = [
      makePlayer('P1', 200, true, true),
      makePlayer('P2', 200, true, true),
      makePlayer('P3', 200, true, true),
    ];
    // Single pot, all players eligible → no real split → []
    expect(buildSidePots(players)).toEqual([]);
  });

  test('12. P1 all-in for 1 chip, P2 contributed 1000 → two pots', () => {
    const players = [
      makePlayer('P1', 1, true, true),
      makePlayer('P2', 1000, true, false),
    ];
    const pots = buildSidePots(players);

    expect(pots).toHaveLength(2);

    // Level 1: 1+1=2, eligible [P1,P2]
    expect(pots[0].amount).toBe(2);
    expect(pots[0].eligiblePlayerIds).toEqual(expect.arrayContaining(['P1', 'P2']));
    expect(pots[0].eligiblePlayerIds).toHaveLength(2);

    // Level 1000: 0+999=999, eligible [P2] only
    expect(pots[1].amount).toBe(999);
    expect(pots[1].eligiblePlayerIds).toEqual(['P2']);

    // Chip conservation
    expect(sumPots(pots)).toBe(sumContributed(players)); // 1001
  });

  test('13. 4-way all-in at different levels → correct pot count and amounts', () => {
    // P1 all-in 25, P2 all-in 75, P3 all-in 150, P4 active 200
    const players = [
      makePlayer('P1', 25,  true, true),
      makePlayer('P2', 75,  true, true),
      makePlayer('P3', 150, true, true),
      makePlayer('P4', 200, true, false),
    ];
    const pots = buildSidePots(players);

    // All-in levels: 25, 75, 150. Max: 200.
    // Levels: [25, 75, 150, 200]
    //
    // Level 25:  25+25+25+25       = 100, eligible [P1,P2,P3,P4]
    // Level 75:  0+50+50+50        = 150, eligible [P2,P3,P4]
    // Level 150: 0+0+75+75         = 150, eligible [P3,P4]
    // Level 200: 0+0+0+50          =  50, eligible [P4]

    expect(pots).toHaveLength(4);

    expect(pots[0].amount).toBe(100);
    expect(pots[0].eligiblePlayerIds).toEqual(expect.arrayContaining(['P1', 'P2', 'P3', 'P4']));
    expect(pots[0].eligiblePlayerIds).toHaveLength(4);

    expect(pots[1].amount).toBe(150);
    expect(pots[1].eligiblePlayerIds).toEqual(expect.arrayContaining(['P2', 'P3', 'P4']));
    expect(pots[1].eligiblePlayerIds).toHaveLength(3);
    expect(pots[1].eligiblePlayerIds).not.toContain('P1');

    expect(pots[2].amount).toBe(150);
    expect(pots[2].eligiblePlayerIds).toEqual(expect.arrayContaining(['P3', 'P4']));
    expect(pots[2].eligiblePlayerIds).toHaveLength(2);
    expect(pots[2].eligiblePlayerIds).not.toContain('P1');
    expect(pots[2].eligiblePlayerIds).not.toContain('P2');

    expect(pots[3].amount).toBe(50);
    expect(pots[3].eligiblePlayerIds).toEqual(['P4']);

    // Chip conservation: 25+75+150+200 = 450; 100+150+150+50 = 450
    expect(sumPots(pots)).toBe(450);
    expect(sumPots(pots)).toBe(sumContributed(players));
  });

  test('14. Empty player array → returns []', () => {
    expect(buildSidePots([])).toEqual([]);
  });

  test('15. Null/undefined players → returns []', () => {
    expect(buildSidePots(null)).toEqual([]);
    expect(buildSidePots(undefined)).toEqual([]);
  });

  test('16. Chip conservation invariant holds for all non-trivial scenarios', () => {
    const scenarios = [
      // P1 all-in 50, P2 150
      [makePlayer('P1', 50, true, true), makePlayer('P2', 150, true, false)],
      // P1 all-in 50, P2 all-in 150, P3 200
      [makePlayer('P1', 50, true, true), makePlayer('P2', 150, true, true), makePlayer('P3', 200, true, false)],
      // 4-way
      [makePlayer('P1', 25, true, true), makePlayer('P2', 75, true, true), makePlayer('P3', 150, true, true), makePlayer('P4', 200, true, false)],
    ];

    for (const players of scenarios) {
      const pots = buildSidePots(players);
      expect(sumPots(pots)).toBe(sumContributed(players));
    }
  });

  test('17. Two all-in players at same level, third player contributes more → 2 pots', () => {
    // P1 all-in 100, P2 all-in 100, P3 active 300
    const players = [
      makePlayer('P1', 100, true, true),
      makePlayer('P2', 100, true, true),
      makePlayer('P3', 300, true, false),
    ];
    const pots = buildSidePots(players);

    expect(pots).toHaveLength(2);

    // Level 100: 100+100+100=300, eligible [P1,P2,P3]
    expect(pots[0].amount).toBe(300);
    expect(pots[0].eligiblePlayerIds).toEqual(expect.arrayContaining(['P1', 'P2', 'P3']));

    // Level 300: 0+0+200=200, eligible [P3]
    expect(pots[1].amount).toBe(200);
    expect(pots[1].eligiblePlayerIds).toEqual(['P3']);

    expect(sumPots(pots)).toBe(sumContributed(players)); // 500
  });

  test('18. Pots are returned ordered by ascending contribution level', () => {
    // The first pot should always be the smallest (main pot), last is the most exclusive
    const players = [
      makePlayer('P1', 50,  true, true),
      makePlayer('P2', 150, true, true),
      makePlayer('P3', 200, true, false),
    ];
    const pots = buildSidePots(players);

    // Verify eligible-player-count decreases or stays same (more exclusive pots later)
    for (let i = 1; i < pots.length; i++) {
      expect(pots[i].eligiblePlayerIds.length).toBeLessThanOrEqual(pots[i - 1].eligiblePlayerIds.length);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 6 — hasFolded() detection behaviour (documents implementation detail)
// ─────────────────────────────────────────────────────────────────────────────

describe('Suite 6: hasFolded detection — is_active + action field requirement', () => {
  test('19. Player with is_active=false AND action="folded" is treated as folded (not eligible)', () => {
    // P2 is all-in at a lower level than P3 so two pots are produced (non-trivial case)
    const players = [
      { id: 'P1', total_contributed: 100, is_active: false, is_all_in: false, action: 'folded' },
      makePlayer('P2', 100, true, true),   // all-in at 100
      makePlayer('P3', 200, true, false),  // active at 200 → creates a 2nd pot
    ];
    const pots = buildSidePots(players);

    // Two pots expected — P2 is all-in, P3 contributes more
    expect(pots.length).toBeGreaterThan(0);

    // P1 must not appear in any eligiblePlayerIds
    pots.forEach(pot => {
      expect(pot.eligiblePlayerIds).not.toContain('P1');
    });
  });

  test('20. All-in player (is_active=true, is_all_in=true) is eligible for pots up to their contribution', () => {
    // In real gameplay, all-in players always have is_active=true (only folded players get is_active=false).
    // P1 all-in at 50, P2 active at 150 → two pots; P1 eligible for first pot only.
    const players = [
      { id: 'P1', total_contributed: 50, is_active: true, is_all_in: true, action: 'all-in' },
      makePlayer('P2', 150, true, false),
    ];
    const pots = buildSidePots(players);

    expect(pots).toHaveLength(2);
    expect(pots[0].eligiblePlayerIds).toContain('P1');
    expect(pots[1].eligiblePlayerIds).not.toContain('P1');
    expect(sumPots(pots)).toBe(sumContributed(players));
  });
});
