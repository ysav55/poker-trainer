'use strict';

/**
 * CJS-compatible stub for poker-odds-calculator (ESM-only package).
 * Used by Jest (CJS test runner) to avoid ESM parse errors.
 * Returns deterministic equal-equity values for all hands.
 */

class MockCardGroup {
  static fromString(str) { return new MockCardGroup(str); }
  constructor(str) { this.str = str; }
}

class MockCard {
  constructor(rank, suit) { this.rank = rank; this.suit = suit; }
}

class MockEquityResult {
  constructor(equity) { this._equity = equity; }
  getEquity() { return this._equity; }
  getWins() { return 0; }
  getTies() { return 0; }
}

class MockOddsResult {
  constructor(n) {
    const share = Math.round(100 / n);
    this.equities = Array.from({ length: n }, () => new MockEquityResult(share));
  }
}

const OddsCalculator = {
  calculate(cardGroups, board) {
    return new MockOddsResult(cardGroups.length);
  },
};

module.exports = { OddsCalculator, CardGroup: MockCardGroup, Card: MockCard };
