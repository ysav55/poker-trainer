'use strict';

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

module.exports = { normalizeAction, norm };
