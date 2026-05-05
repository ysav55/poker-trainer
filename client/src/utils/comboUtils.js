/**
 * comboUtils.js — Bridge between hand-matrix hand group strings and [[c1,c2]] combos.
 *
 * Hand group strings (from @holdem-poker-tools/hand-matrix):
 *   'AA'   — pocket pair (6 combos)
 *   'AKs'  — suited (4 combos)
 *   'AKo'  — offsuit (12 combos)
 */

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const SUITS = ['s', 'h', 'd', 'c'];

/**
 * handGroupToCombos(handGroup) — expand a hand group string to its individual combos.
 * Returns an array of [c1, c2] pairs (e.g. ['As', 'Kh']).
 *
 * @param {string} handGroup — e.g. 'AKs', 'AKo', 'AA', 'T9s'
 * @returns {string[][]}
 */
export function handGroupToCombos(handGroup) {
  if (!handGroup || handGroup.length < 2) return [];

  const r1 = handGroup[0];
  const r2 = handGroup[1];
  const qualifier = handGroup[2] ?? null; // 's', 'o', or null (pair)

  if (!RANKS.includes(r1) || !RANKS.includes(r2)) return [];

  // Pocket pair
  if (r1 === r2) {
    const combos = [];
    for (let i = 0; i < SUITS.length; i++) {
      for (let j = i + 1; j < SUITS.length; j++) {
        combos.push([`${r1}${SUITS[i]}`, `${r2}${SUITS[j]}`]);
      }
    }
    return combos; // 6 combos
  }

  // Suited
  if (qualifier === 's') {
    return SUITS.map(suit => [`${r1}${suit}`, `${r2}${suit}`]); // 4 combos
  }

  // Offsuit (default)
  const combos = [];
  for (const s1 of SUITS) {
    for (const s2 of SUITS) {
      if (s1 !== s2) {
        combos.push([`${r1}${s1}`, `${r2}${s2}`]);
      }
    }
  }
  return combos; // 12 combos
}

/**
 * comboToHandGroup([c1, c2]) — determine the hand group string for a specific combo.
 *
 * @param {string[]} combo — e.g. ['As', 'Kh']
 * @returns {string} — e.g. 'AKo'
 */
export function comboToHandGroup([c1, c2]) {
  if (!c1 || !c2) return '';
  const r1 = c1[0];
  const r2 = c2[0];
  const s1 = c1[1];
  const s2 = c2[1];

  // Sort by rank index so higher rank is always first
  const i1 = RANKS.indexOf(r1);
  const i2 = RANKS.indexOf(r2);
  const [highRank, lowRank, highSuit, lowSuit] =
    i1 <= i2 ? [r1, r2, s1, s2] : [r2, r1, s2, s1];

  if (highRank === lowRank) return `${highRank}${lowRank}`; // pocket pair
  const qualifier = highSuit === lowSuit ? 's' : 'o';
  return `${highRank}${lowRank}${qualifier}`;
}

/**
 * selectedHandGroupsToComboArray(Set<string>) → [[c1,c2], ...]
 * Expands a Set of hand group strings to all individual combos.
 *
 * @param {Set<string>} handGroups
 * @returns {string[][]}
 */
export function selectedHandGroupsToComboArray(handGroups) {
  return [...handGroups].flatMap(handGroupToCombos);
}

/**
 * comboArrayToHandGroups([[c1,c2], ...]) → Set<string>
 * Converts an array of individual combos to their hand group Set.
 *
 * @param {string[][]} combos
 * @returns {Set<string>}
 */
export function comboArrayToHandGroups(combos) {
  return new Set(combos.map(comboToHandGroup));
}
