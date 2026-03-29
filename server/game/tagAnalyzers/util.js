'use strict';

/**
 * Shared utilities for tag analyzers.
 * All analyzers import from here — do not duplicate these helpers in analyzer files.
 */

/**
 * Normalize DB action strings to present-tense canonical forms.
 * Shared by all tag analyzers.
 */
function normalizeAction(action) {
  const MAP = { raised: 'raise', folded: 'fold', called: 'call', checked: 'check' };
  return MAP[action] ?? action;
}

/** Shorthand: normalize action field of an action row. */
function norm(actionRow) {
  return normalizeAction(actionRow.action);
}

/**
 * Find the last preflop raiser from a list of preflop actions.
 * @param {object[]} pre — preflop action rows
 * @returns {object|undefined} action row of the last raiser, or undefined
 */
function findLastPFRaiser(pre) {
  return [...pre].reverse().find(a => norm(a) === 'raise');
}

/**
 * Find the index of the last bet or raise in a street's action array.
 * @param {object[]} streetActions
 * @returns {number} index, or -1 if none found
 */
function findLastAggressorIndex(streetActions) {
  for (let i = streetActions.length - 1; i >= 0; i--) {
    if (['raise', 'bet', 'all-in'].includes(norm(streetActions[i]))) return i;
  }
  return -1;
}

/**
 * Find the Nth raiser in a preflop action sequence (1-indexed).
 * @param {object[]} pre — preflop action rows
 * @param {number} n — which raiser to find (1 = open-raiser, 2 = 3-bettor, etc.)
 * @returns {object|null} action row of the Nth raiser, or null if not found
 */
function findNthRaiser(pre, n) {
  let count = 0;
  for (const a of pre) {
    if (norm(a) === 'raise') {
      count++;
      if (count === n) return a;
    }
  }
  return null;
}

/**
 * True if the action is aggressive (bet, raise, or all-in).
 * @param {object} a — action row
 * @returns {boolean}
 */
function isAggressive(a) {
  return ['bet', 'raise', 'all-in'].includes(norm(a));
}

module.exports = { normalizeAction, norm, findLastPFRaiser, findLastAggressorIndex, findNthRaiser, isAggressive };
