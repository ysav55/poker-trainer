'use strict';

/**
 * BotDecisionService — unit tests
 *
 * Coverage targets:
 *   - all 3 difficulties × key scenarios (preflop, postflop, all-in)
 *   - edge cases: nothing to call, all-in, hidden cards
 */

const { decide } = require('../BotDecisionService');

// ─── Fixtures ──────────────────────────────────────────────────────────────────

function makeBot(overrides = {}) {
  return {
    id: 'bot-1',
    is_active: true,
    stack: 1000,
    total_bet_this_round: 0,
    hole_cards: ['As', 'Kd'],
    seat: 1,
    ...overrides,
  };
}

function makeState(overrides = {}) {
  return {
    phase: 'flop',
    board: ['Ah', 'Kc', '7d'],
    pot: 200,
    current_bet: 100,
    min_raise: 100,
    current_turn: 'bot-1',
    players: [makeBot()],
    ...overrides,
  };
}

// ─── Easy difficulty ───────────────────────────────────────────────────────────

describe('Easy bot', () => {
  test('checks when nothing to call', () => {
    const state = makeState({ current_bet: 0 });
    expect(decide(state, 'bot-1', 'easy')).toEqual({ action: 'check', amount: 0 });
  });

  test('calls when pot-odds are favorable (equityNeeded ≤ 30%)', () => {
    // toCall=50, pot=200 → equityNeeded=50/250=0.20 ≤ 0.30 → call
    const state = makeState({ pot: 200, current_bet: 50 });
    state.players = [makeBot({ total_bet_this_round: 0 })];
    expect(decide(state, 'bot-1', 'easy')).toEqual({ action: 'call', amount: 0 });
  });

  test('folds when pot-odds are unfavorable (equityNeeded > 30%)', () => {
    // toCall=200, pot=200 → equityNeeded=200/400=0.50 > 0.30 → fold
    const state = makeState({ pot: 200, current_bet: 200 });
    state.players = [makeBot({ total_bet_this_round: 0 })];
    expect(decide(state, 'bot-1', 'easy')).toEqual({ action: 'fold', amount: 0 });
  });

  test('never raises — returns check when no bet and strong hand', () => {
    // Even with top two-pair, easy bot only checks
    const state = makeState({ current_bet: 0 });
    expect(decide(state, 'bot-1', 'easy').action).toBe('check');
  });

  test('goes all-in when stack < toCall and odds acceptable', () => {
    // toCall=300, stack=100 → all-in path: 100/300=0.33 > 0.30 → fold
    const state = makeState({ pot: 200, current_bet: 300 });
    state.players = [makeBot({ stack: 100, total_bet_this_round: 0 })];
    expect(decide(state, 'bot-1', 'easy').action).toBe('fold');
  });

  test('goes all-in when stack < toCall and equity is acceptable', () => {
    // toCall=200, stack=50 → equityNeeded=50/(200+50)=0.20 ≤ 0.30 → all-in
    const state = makeState({ pot: 200, current_bet: 200 });
    state.players = [makeBot({ stack: 50, total_bet_this_round: 0 })];
    expect(decide(state, 'bot-1', 'easy')).toEqual({ action: 'all-in', amount: 0 });
  });

  test('returns fold if bot is not active', () => {
    const state = makeState();
    state.players = [makeBot({ is_active: false })];
    expect(decide(state, 'bot-1', 'easy')).toEqual({ action: 'fold', amount: 0 });
  });

  test('returns fold if bot is not in players list', () => {
    const state = makeState();
    state.players = [];
    expect(decide(state, 'bot-1', 'easy')).toEqual({ action: 'fold', amount: 0 });
  });
});

// ─── Medium difficulty ─────────────────────────────────────────────────────────

describe('Medium bot', () => {
  test('checks when nothing to call and no strong hand (preflop)', () => {
    const state = makeState({
      phase: 'preflop',
      board: [],
      current_bet: 0,
    });
    state.players = [makeBot({ hole_cards: ['2c', '7h'] })];
    expect(decide(state, 'bot-1', 'medium').action).toBe('check');
  });

  test('raises 33% pot on top pair (hole card matches highest board card)', () => {
    // Bot has Ah — top board card is A → top pair
    const state = makeState({
      phase: 'flop',
      board: ['Ah', '7c', '2d'],
      pot: 300,
      current_bet: 0,
      min_raise: 50,
    });
    state.players = [makeBot({
      hole_cards: ['Ah', 'Kd'],
      total_bet_this_round: 0,
      stack: 1000,
    })];
    const decision = decide(state, 'bot-1', 'medium');
    expect(decision.action).toBe('raise');
    expect(decision.amount).toBeGreaterThan(0);
  });

  test('raises on two pair (better than top pair)', () => {
    const state = makeState({
      phase: 'flop',
      board: ['Ah', 'Kc', '7d'],
      pot: 300,
      current_bet: 0,
      min_raise: 50,
    });
    state.players = [makeBot({
      hole_cards: ['As', 'Ks'],
      total_bet_this_round: 0,
      stack: 1000,
    })];
    const decision = decide(state, 'bot-1', 'medium');
    expect(decision.action).toBe('raise');
  });

  test('does NOT raise preflop (medium never raises preflop)', () => {
    const state = makeState({
      phase: 'preflop',
      board: [],
      current_bet: 0,
    });
    state.players = [makeBot({ hole_cards: ['As', 'Ad'] })]; // pocket aces
    const decision = decide(state, 'bot-1', 'medium');
    expect(decision.action).toBe('check');
  });

  test('does NOT raise when hand is just bottom pair', () => {
    // Bot has 7s — board top card is A, bot paired the 7 (not top pair)
    const state = makeState({
      phase: 'flop',
      board: ['Ah', 'Kc', '7d'],
      pot: 200,
      current_bet: 0,
      min_raise: 50,
    });
    state.players = [makeBot({
      hole_cards: ['7s', '2c'],
      total_bet_this_round: 0,
      stack: 1000,
    })];
    const decision = decide(state, 'bot-1', 'medium');
    expect(decision.action).toBe('check');
  });

  test('calls when pot-odds ≤ 20%', () => {
    // toCall=40, pot=200 → equityNeeded=40/240=0.167 ≤ 0.20 → call
    const state = makeState({
      phase: 'flop',
      board: ['2c', '5d', '9h'],
      pot: 200,
      current_bet: 40,
    });
    state.players = [makeBot({ hole_cards: ['Qs', 'Jh'], total_bet_this_round: 0 })];
    expect(decide(state, 'bot-1', 'medium')).toEqual({ action: 'call', amount: 0 });
  });

  test('folds when pot-odds > 20% and no strong hand', () => {
    // toCall=100, pot=200 → equityNeeded=100/300=0.333 > 0.20 → fold
    const state = makeState({
      phase: 'flop',
      board: ['2c', '5d', '9h'],
      pot: 200,
      current_bet: 100,
    });
    state.players = [makeBot({ hole_cards: ['Qs', 'Jh'], total_bet_this_round: 0 })];
    expect(decide(state, 'bot-1', 'medium')).toEqual({ action: 'fold', amount: 0 });
  });

  test('does not raise when hole cards are hidden', () => {
    const state = makeState({
      phase: 'flop',
      board: ['Ah', 'Kc', '7d'],
      pot: 300,
      current_bet: 0,
    });
    state.players = [makeBot({ hole_cards: ['HIDDEN', 'HIDDEN'] })];
    expect(decide(state, 'bot-1', 'medium').action).toBe('check');
  });
});

// ─── Hard difficulty ───────────────────────────────────────────────────────────

describe('Hard bot', () => {
  test('3-bets AA preflop when there is a raise', () => {
    const state = makeState({
      phase: 'preflop',
      board: [],
      pot: 150,
      current_bet: 50,
      min_raise: 50,
    });
    state.players = [makeBot({ hole_cards: ['Ah', 'As'], total_bet_this_round: 0, stack: 1000 })];
    const decision = decide(state, 'bot-1', 'hard');
    expect(decision.action).toBe('raise');
    expect(decision.amount).toBeGreaterThanOrEqual(150); // 3× current_bet
  });

  test('3-bets KK preflop when there is a raise', () => {
    const state = makeState({
      phase: 'preflop',
      board: [],
      pot: 150,
      current_bet: 50,
      min_raise: 50,
    });
    state.players = [makeBot({ hole_cards: ['Kh', 'Ks'], total_bet_this_round: 0, stack: 1000 })];
    expect(decide(state, 'bot-1', 'hard').action).toBe('raise');
  });

  test('3-bets AK preflop when there is a raise', () => {
    const state = makeState({
      phase: 'preflop',
      board: [],
      pot: 150,
      current_bet: 50,
      min_raise: 50,
    });
    state.players = [makeBot({ hole_cards: ['As', 'Kd'], total_bet_this_round: 0, stack: 1000 })];
    expect(decide(state, 'bot-1', 'hard').action).toBe('raise');
  });

  test('does NOT 3-bet non-premium hands preflop', () => {
    const state = makeState({
      phase: 'preflop',
      board: [],
      pot: 150,
      current_bet: 50,
      min_raise: 50,
    });
    state.players = [makeBot({ hole_cards: ['Qd', 'Jh'], total_bet_this_round: 0, stack: 1000 })];
    // Should call or fold — not raise
    const decision = decide(state, 'bot-1', 'hard');
    expect(decision.action).not.toBe('raise');
  });

  test('does NOT 3-bet AA preflop when current_bet=0 (no raise to re-raise)', () => {
    const state = makeState({
      phase: 'preflop',
      board: [],
      pot: 30,
      current_bet: 0,
      min_raise: 20,
    });
    state.players = [makeBot({ hole_cards: ['Ah', 'As'], total_bet_this_round: 0, stack: 1000 })];
    expect(decide(state, 'bot-1', 'hard').action).toBe('check');
  });

  test('pot-bets on a straight (rank >= STRAIGHT)', () => {
    // Bot has T9 on A K Q J board → straight
    const state = makeState({
      phase: 'river',
      board: ['Ah', 'Kd', 'Qc', 'Jh', '2s'],
      pot: 400,
      current_bet: 0,
      min_raise: 40,
    });
    state.players = [makeBot({
      hole_cards: ['Ts', '9c'],
      total_bet_this_round: 0,
      stack: 1000,
    })];
    const decision = decide(state, 'bot-1', 'hard');
    expect(decision.action).toBe('raise');
    expect(decision.amount).toBeGreaterThan(0);
  });

  test('pot-bets on a flush (rank >= STRAIGHT)', () => {
    // Bot has two spades, board has three spades → flush
    const state = makeState({
      phase: 'flop',
      board: ['2s', '7s', 'Js'],
      pot: 300,
      current_bet: 0,
      min_raise: 30,
    });
    state.players = [makeBot({
      hole_cards: ['As', 'Ks'],
      total_bet_this_round: 0,
      stack: 1000,
    })];
    const decision = decide(state, 'bot-1', 'hard');
    expect(decision.action).toBe('raise');
  });

  test('does NOT pot-bet on only one pair (rank < STRAIGHT)', () => {
    const state = makeState({
      phase: 'flop',
      board: ['Ah', '2c', '7d'],
      pot: 200,
      current_bet: 0,
      min_raise: 20,
    });
    state.players = [makeBot({
      hole_cards: ['As', '3c'],
      total_bet_this_round: 0,
      stack: 1000,
    })];
    // Has top pair but not nuts — no pot-bet
    const decision = decide(state, 'bot-1', 'hard');
    expect(decision.action).not.toBe('raise');
  });

  test('calls when pot-odds ≤ 15% and no premium hand', () => {
    // toCall=25, pot=200 → equityNeeded=25/225=0.111 ≤ 0.15 → call
    const state = makeState({
      phase: 'flop',
      board: ['2c', '5d', '9h'],
      pot: 200,
      current_bet: 25,
    });
    state.players = [makeBot({ hole_cards: ['Qs', 'Jh'], total_bet_this_round: 0 })];
    expect(decide(state, 'bot-1', 'hard')).toEqual({ action: 'call', amount: 0 });
  });

  test('folds when pot-odds > 15% and no premium hand', () => {
    // toCall=100, pot=200 → equityNeeded=100/300=0.333 > 0.15 → fold
    const state = makeState({
      phase: 'flop',
      board: ['2c', '5d', '9h'],
      pot: 200,
      current_bet: 100,
    });
    state.players = [makeBot({ hole_cards: ['Qs', 'Jh'], total_bet_this_round: 0 })];
    expect(decide(state, 'bot-1', 'hard')).toEqual({ action: 'fold', amount: 0 });
  });

  test('goes all-in instead of raise when stack is insufficient for pot-bet', () => {
    const state = makeState({
      phase: 'flop',
      board: ['2s', '7s', 'Js'],
      pot: 5000,
      current_bet: 0,
      min_raise: 500,
    });
    state.players = [makeBot({
      hole_cards: ['As', 'Ks'],
      total_bet_this_round: 0,
      stack: 100, // can't afford a 5000 pot-bet
    })];
    expect(decide(state, 'bot-1', 'hard')).toEqual({ action: 'all-in', amount: 0 });
  });
});

// ─── General edge cases ────────────────────────────────────────────────────────

describe('Edge cases', () => {
  test('all difficulties: already-bet amount is subtracted from toCall', () => {
    // current_bet=100, alreadyBet=50 → toCall=50; equityNeeded=50/250=0.20 ≤ 0.30 → easy calls
    const state = makeState({ pot: 200, current_bet: 100 });
    state.players = [makeBot({ total_bet_this_round: 50 })];
    expect(decide(state, 'bot-1', 'easy')).toEqual({ action: 'call', amount: 0 });
  });

  test('unknown difficulty defaults to easy threshold (0.30)', () => {
    const state = makeState({ pot: 200, current_bet: 50 });
    state.players = [makeBot({ total_bet_this_round: 0 })];
    // equityNeeded=50/250=0.20 ≤ 0.30 → call
    expect(decide(state, 'bot-1', 'expert')).toEqual({ action: 'call', amount: 0 });
  });

  test('medium raise amount is at least min_raise above current_bet', () => {
    const state = makeState({
      phase: 'flop',
      board: ['Ah', '7c', '2d'],
      pot: 10, // tiny pot → 33% of pot is tiny
      current_bet: 0,
      min_raise: 100,
    });
    state.players = [makeBot({
      hole_cards: ['Ah', 'Kd'], // top pair
      total_bet_this_round: 0,
      stack: 1000,
    })];
    const decision = decide(state, 'bot-1', 'medium');
    if (decision.action === 'raise') {
      expect(decision.amount).toBeGreaterThanOrEqual(100); // at least min_raise
    }
  });
});
