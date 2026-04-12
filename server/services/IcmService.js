'use strict';

/**
 * IcmService — Independent Chip Model prize calculations.
 *
 * Malmuth-Harville algorithm:
 *   equity(i) = P(i wins) * payout[0]
 *             + Σ_{j≠i} P(j wins) * equity(i | payouts[1:], stacks without j)
 *
 * This is exact for any player count but exponential — use for ≤9 players.
 * For larger counts use computeLiveIcmOverlay which uses Monte Carlo.
 */

/**
 * Recursive Malmuth-Harville ICM.
 * @param {number[]} stacks - chip counts per player (indexed)
 * @param {number[]} payouts - prize amounts for 1st, 2nd, 3rd... (same length or shorter than stacks)
 * @returns {number[]} equity per player (same length as stacks)
 */
function _icmExact(stacks, payouts) {
  if (payouts.length === 0 || stacks.length === 0) return stacks.map(() => 0);
  if (stacks.length === 1) return [payouts.reduce((a, b) => a + b, 0)];

  const total = stacks.reduce((a, b) => a + b, 0);
  if (total === 0) return stacks.map(() => 0);

  const result = new Array(stacks.length).fill(0);

  for (let i = 0; i < stacks.length; i++) {
    const pWin = stacks[i] / total;
    if (pWin === 0) continue;

    result[i] += pWin * payouts[0];

    if (payouts.length > 1) {
      const remainingStacks = stacks.filter((_, j) => j !== i);
      const subEquities = _icmExact(remainingStacks, payouts.slice(1));

      let k = 0;
      for (let j = 0; j < stacks.length; j++) {
        if (j !== i) {
          result[j] += pWin * subEquities[k++];
        }
      }
    }
  }

  return result;
}

/**
 * Monte Carlo ICM estimate — faster, use for live overlays and large player counts.
 * @param {number[]} stacks
 * @param {number[]} payouts
 * @param {number} iterations
 * @returns {number[]} equity per player
 */
function _icmMonteCarlo(stacks, payouts, iterations = 5000) {
  const n = stacks.length;
  const result = new Array(n).fill(0);
  const places = Math.min(payouts.length, n);

  for (let iter = 0; iter < iterations; iter++) {
    const remaining = [...stacks];
    for (let place = 0; place < places; place++) {
      const total = remaining.reduce((a, b) => a + b, 0);
      if (total === 0) break;
      let rand = Math.random() * total;
      let winner = 0;
      while (winner < n - 1 && rand > remaining[winner]) {
        rand -= remaining[winner];
        winner++;
      }
      result[winner] += payouts[place] / iterations;
      remaining[winner] = 0;
    }
  }

  return result;
}

/**
 * Compute final ICM prize distribution.
 *
 * @param {Array<{playerId: string, chips: number}>} players
 * @param {Array<{position: number, percentage: number}>} payoutStructure
 * @param {number} totalPool  total chips in play
 * @returns {Array<{playerId: string, chips: number}>}
 */
function computeIcmPrizes(players, payoutStructure, totalPool) {
  if (players.length === 0) return [];

  // Build payouts array from percentage structure, sorted by position
  const sorted = [...payoutStructure].sort((a, b) => a.position - b.position);
  const payouts = sorted.map(p => Math.floor(totalPool * p.percentage / 100));
  const trimmed = payouts.slice(0, players.length);

  const stacks = players.map(p => p.chips);
  const equities = _icmExact(stacks, trimmed);

  const prizes = players.map((p, i) => ({
    playerId: p.playerId,
    chips: Math.floor(equities[i]),
  }));

  // Remainder goes to chip leader (avoids rounding loss)
  const distributed = prizes.reduce((s, p) => s + p.chips, 0);
  const remainder = totalPool - distributed;
  if (remainder !== 0) {
    const leaderIdx = players.reduce(
      (best, p, i) => (p.chips > players[best].chips ? i : best), 0
    );
    prizes[leaderIdx].chips += remainder;
  }

  return prizes;
}

/**
 * Compute live ICM equities for educational overlay.
 * Uses Monte Carlo — safe to call after every elimination.
 *
 * @param {Array<{playerId: string, chips: number}>} activePlayers
 * @param {Array<{position: number, percentage: number}>} payoutStructure
 * @param {number} totalPool
 * @returns {Array<{playerId: string, icmChips: number, icmPct: string}>}
 */
function computeLiveIcmOverlay(activePlayers, payoutStructure, totalPool) {
  if (activePlayers.length === 0 || totalPool === 0) return [];

  const sorted = [...payoutStructure].sort((a, b) => a.position - b.position);
  const payouts = sorted.map(p => Math.floor(totalPool * p.percentage / 100));
  // Trim payouts to number of remaining players
  const trimmed = payouts.slice(0, activePlayers.length);

  const stacks = activePlayers.map(p => p.chips);
  const equities = _icmMonteCarlo(stacks, trimmed, 5000);

  return activePlayers.map((p, i) => ({
    playerId: p.playerId,
    icmChips: Math.floor(equities[i]),
    icmPct:   ((equities[i] / totalPool) * 100).toFixed(1),
  }));
}

module.exports = { computeIcmPrizes, computeLiveIcmOverlay };
