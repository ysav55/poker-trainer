'use strict';

const { computeIcmPrizes, computeLiveIcmOverlay } = require('../IcmService');

// ─── computeIcmPrizes ─────────────────────────────────────────────────────────

describe('computeIcmPrizes', () => {
  test('1 player gets the full pool', () => {
    const players = [{ playerId: 'p1', chips: 10000 }];
    const payout  = [{ position: 1, percentage: 100 }];
    const prizes  = computeIcmPrizes(players, payout, 10000);

    expect(prizes).toHaveLength(1);
    expect(prizes[0].playerId).toBe('p1');
    expect(prizes[0].chips).toBe(10000);
  });

  test('returns empty array when players array is empty', () => {
    expect(computeIcmPrizes([], [{ position: 1, percentage: 100 }], 10000)).toEqual([]);
  });

  test('2 players equal stacks, winner-takes-all: each gets ~50%', () => {
    const players = [
      { playerId: 'p1', chips: 5000 },
      { playerId: 'p2', chips: 5000 },
    ];
    const payout = [{ position: 1, percentage: 100 }];
    const prizes = computeIcmPrizes(players, payout, 10000);

    const total = prizes.reduce((s, p) => s + p.chips, 0);
    expect(total).toBe(10000);

    // Each should get exactly 5000 (or within 1 chip due to rounding + remainder assignment)
    expect(prizes[0].chips).toBeGreaterThanOrEqual(4999);
    expect(prizes[0].chips).toBeLessThanOrEqual(5001);
    expect(prizes[1].chips).toBeGreaterThanOrEqual(4999);
    expect(prizes[1].chips).toBeLessThanOrEqual(5001);
  });

  test('2 players, chip leader has 2x stack, winner-takes-all: proportional split', () => {
    const players = [
      { playerId: 'leader', chips: 10000 },
      { playerId: 'short',  chips:  5000 },
    ];
    const payout = [{ position: 1, percentage: 100 }];
    const prizes = computeIcmPrizes(players, payout, 15000);

    const leaderPrize = prizes.find(p => p.playerId === 'leader').chips;
    const shortPrize  = prizes.find(p => p.playerId === 'short').chips;
    const total       = leaderPrize + shortPrize;

    expect(total).toBe(15000);

    // Leader has 10/15 = 66.7% of chips → gets ~66.7% of pool
    expect(leaderPrize).toBeGreaterThan(9000);
    expect(leaderPrize).toBeLessThan(11000);
    // Short has 5/15 = 33.3%
    expect(shortPrize).toBeGreaterThan(4000);
    expect(shortPrize).toBeLessThan(6000);
    expect(leaderPrize).toBeGreaterThan(shortPrize);
  });

  test('3 players, top-2 payout 60/40: all 3 get non-zero equity, sum equals totalPool', () => {
    const players = [
      { playerId: 'p1', chips: 15000 },
      { playerId: 'p2', chips: 10000 },
      { playerId: 'p3', chips:  5000 },
    ];
    const payout = [
      { position: 1, percentage: 60 },
      { position: 2, percentage: 40 },
    ];
    const totalPool = 30000;
    const prizes = computeIcmPrizes(players, payout, totalPool);

    expect(prizes).toHaveLength(3);

    const total = prizes.reduce((s, p) => s + p.chips, 0);
    expect(total).toBe(totalPool);

    // All 3 have a chance of finishing 1st or 2nd — should all be > 0
    for (const prize of prizes) {
      expect(prize.chips).toBeGreaterThan(0);
    }
  });

  test('sum of prizes always equals totalPool (remainder correction)', () => {
    // Use an odd totalPool that won't divide evenly at 60/40
    const players = [
      { playerId: 'p1', chips: 7777 },
      { playerId: 'p2', chips: 5555 },
      { playerId: 'p3', chips: 3333 },
    ];
    const payout = [
      { position: 1, percentage: 60 },
      { position: 2, percentage: 40 },
    ];
    const totalPool = 16665; // 7777+5555+3333
    const prizes = computeIcmPrizes(players, payout, totalPool);

    const sum = prizes.reduce((s, p) => s + p.chips, 0);
    expect(sum).toBe(totalPool);
  });

  test('ICM property: short stack gets more than chip-proportion in top-2 payout', () => {
    // Chip leader: 18000 (60%), medium: 9000 (30%), short: 3000 (10%)
    // With top-2 payout, short gets MORE than 10% because any finish in top-2 pays out
    const totalPool = 30000;
    const players = [
      { playerId: 'big',    chips: 18000 },
      { playerId: 'medium', chips:  9000 },
      { playerId: 'short',  chips:  3000 },
    ];
    const payout = [
      { position: 1, percentage: 60 },
      { position: 2, percentage: 40 },
    ];
    const prizes = computeIcmPrizes(players, payout, totalPool);

    const shortPrize = prizes.find(p => p.playerId === 'short').chips;
    const chipProportion = 3000 / 30000; // 10% of chips
    const chipProportionPrize = chipProportion * totalPool; // 3000 "chip-EV"

    // Short stack ICM equity > chip-proportional equity in top-2 multi-payout scenario
    // because there's a 40% payout for 2nd that flattens the distribution
    expect(shortPrize).toBeGreaterThan(chipProportionPrize);
  });

  test('payout positions are sorted correctly regardless of input order', () => {
    const players = [
      { playerId: 'p1', chips: 10000 },
      { playerId: 'p2', chips:  5000 },
    ];
    // Intentionally pass payouts in reverse order
    const payoutReversed = [
      { position: 2, percentage: 40 },
      { position: 1, percentage: 60 },
    ];
    const payoutNormal = [
      { position: 1, percentage: 60 },
      { position: 2, percentage: 40 },
    ];
    const totalPool = 15000;
    const prizesR = computeIcmPrizes(players, payoutReversed, totalPool);
    const prizesN = computeIcmPrizes(players, payoutNormal,   totalPool);

    // Both orderings should produce identical results
    expect(prizesR[0].chips).toBe(prizesN[0].chips);
    expect(prizesR[1].chips).toBe(prizesN[1].chips);
  });
});

// ─── computeLiveIcmOverlay ───────────────────────────────────────────────────

describe('computeLiveIcmOverlay', () => {
  const payout = [
    { position: 1, percentage: 50 },
    { position: 2, percentage: 30 },
    { position: 3, percentage: 20 },
  ];

  test('returns empty array when activePlayers is empty', () => {
    expect(computeLiveIcmOverlay([], payout, 30000)).toEqual([]);
  });

  test('returns empty array when totalPool is 0', () => {
    const players = [{ playerId: 'p1', chips: 1000 }];
    expect(computeLiveIcmOverlay(players, payout, 0)).toEqual([]);
  });

  test('returns correct length array', () => {
    const players = [
      { playerId: 'p1', chips: 15000 },
      { playerId: 'p2', chips: 10000 },
      { playerId: 'p3', chips:  5000 },
    ];
    const result = computeLiveIcmOverlay(players, payout, 30000);
    expect(result).toHaveLength(3);
  });

  test('each entry has playerId, icmChips, and icmPct fields', () => {
    const players = [
      { playerId: 'alice', chips: 20000 },
      { playerId: 'bob',   chips: 10000 },
    ];
    const result = computeLiveIcmOverlay(players, payout, 30000);
    for (const entry of result) {
      expect(entry).toHaveProperty('playerId');
      expect(entry).toHaveProperty('icmChips');
      expect(entry).toHaveProperty('icmPct');
    }
  });

  test('icmPct values are numeric strings (not NaN)', () => {
    const players = [
      { playerId: 'p1', chips: 10000 },
      { playerId: 'p2', chips: 10000 },
      { playerId: 'p3', chips: 10000 },
    ];
    const result = computeLiveIcmOverlay(players, payout, 30000);
    for (const entry of result) {
      expect(isNaN(parseFloat(entry.icmPct))).toBe(false);
    }
  });

  test('icmPct is formatted to 1 decimal place', () => {
    const players = [{ playerId: 'p1', chips: 10000 }, { playerId: 'p2', chips: 10000 }];
    const result = computeLiveIcmOverlay(players, payout, 20000);
    for (const entry of result) {
      expect(entry.icmPct).toMatch(/^\d+(\.\d)?$/);
    }
  });

  test('sum of icmChips is approximately equal to totalPool (within 1%)', () => {
    const totalPool = 30000;
    const players = [
      { playerId: 'p1', chips: 15000 },
      { playerId: 'p2', chips: 10000 },
      { playerId: 'p3', chips:  5000 },
    ];
    const result = computeLiveIcmOverlay(players, payout, totalPool);
    const sum = result.reduce((s, e) => s + e.icmChips, 0);
    // Monte Carlo + floor rounding: allow 1% tolerance
    expect(Math.abs(sum - totalPool)).toBeLessThan(totalPool * 0.01);
  });

  test('payouts trimmed when more payout positions than active players', () => {
    // 5-position payout but only 3 players remain
    const bigPayout = [
      { position: 1, percentage: 40 },
      { position: 2, percentage: 25 },
      { position: 3, percentage: 20 },
      { position: 4, percentage: 10 },
      { position: 5, percentage:  5 },
    ];
    const players = [
      { playerId: 'p1', chips: 15000 },
      { playerId: 'p2', chips: 10000 },
      { playerId: 'p3', chips:  5000 },
    ];
    // Should not throw — extra payout positions are trimmed
    expect(() => computeLiveIcmOverlay(players, bigPayout, 30000)).not.toThrow();
    const result = computeLiveIcmOverlay(players, bigPayout, 30000);
    expect(result).toHaveLength(3);
  });

  test('player with larger stack gets higher icmChips', () => {
    const players = [
      { playerId: 'big',   chips: 20000 },
      { playerId: 'small', chips:  5000 },
    ];
    const simplePayout = [
      { position: 1, percentage: 70 },
      { position: 2, percentage: 30 },
    ];
    const totalPool = 25000;
    const result = computeLiveIcmOverlay(players, simplePayout, totalPool);
    const bigEntry   = result.find(e => e.playerId === 'big');
    const smallEntry = result.find(e => e.playerId === 'small');
    expect(bigEntry.icmChips).toBeGreaterThan(smallEntry.icmChips);
  });
});
