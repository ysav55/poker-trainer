'use strict';

/**
 * BotDecisionService
 *
 * Stateless: decide(gameState, botId, difficulty) => { action, amount }
 *
 * Difficulty strategies:
 *   easy   — Call if equity needed ≤ 30%, else fold. Never raises.
 *   medium — Call if equity needed ≤ 20%; raise 33% pot on top pair+.
 *   hard   — Call if equity needed ≤ 15%; 3-bet AA/KK/AK preflop; pot-bet on nuts (straight+).
 *
 * Pot-odds: equityNeeded = callAmount / (pot + callAmount)
 *   Lower threshold = tighter caller (calls only cheap spots).
 *   Higher threshold = looser caller (calls more spots).
 *
 * Bots see only their own hole cards — matching human visibility rules.
 */

const { evaluate, HAND_RANKS } = require('./HandEvaluator');

// Rank characters in ascending order (index = numeric value)
const RANK_ORDER = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const rankVal = r => RANK_ORDER.indexOf(r);

// Max equity-needed fraction at which each difficulty will call.
const CALL_THRESHOLDS = { easy: 0.30, medium: 0.20, hard: 0.15 };

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Decide the bot's next action.
 *
 * @param {object} gameState  - Public game state from getPublicState()
 * @param {string} botId      - Socket ID of the bot player
 * @param {string} difficulty - 'easy' | 'medium' | 'hard'
 * @returns {{ action: 'fold'|'check'|'call'|'raise'|'all-in', amount: number }}
 */
function decide(gameState, botId, difficulty) {
  const { phase, players, pot, current_bet, min_raise, board } = gameState;

  const bot = players.find(p => p.id === botId);
  if (!bot || !bot.is_active) return { action: 'fold', amount: 0 };

  const alreadyBet = bot.total_bet_this_round ?? 0;
  const toCall     = Math.max(0, (current_bet ?? 0) - alreadyBet);
  const threshold  = CALL_THRESHOLDS[difficulty] ?? CALL_THRESHOLDS.easy;

  // ── 1. Nothing to call: check or optionally raise ────────────────────────
  if (toCall === 0) {
    if (difficulty !== 'easy') {
      const raise = _tryRaise(phase, board, bot, pot, current_bet, min_raise, difficulty);
      if (raise) return raise;
    }
    return { action: 'check', amount: 0 };
  }

  // ── 2. Cannot afford full call → all-in if pot odds are acceptable ────────
  if (toCall >= bot.stack) {
    const equityNeeded = bot.stack / (pot + bot.stack);
    return equityNeeded <= threshold
      ? { action: 'all-in', amount: 0 }
      : { action: 'fold', amount: 0 };
  }

  // ── 3. Raise first (medium/hard only) ────────────────────────────────────
  if (difficulty !== 'easy') {
    const raise = _tryRaise(phase, board, bot, pot, current_bet, min_raise, difficulty);
    if (raise) return raise;
  }

  // ── 4. Call / fold ────────────────────────────────────────────────────────
  const equityNeeded = toCall / (pot + toCall);
  return equityNeeded <= threshold
    ? { action: 'call', amount: 0 }
    : { action: 'fold', amount: 0 };
}

// ─── Raise logic ─────────────────────────────────────────────────────────────

function _tryRaise(phase, board, bot, pot, current_bet, min_raise, difficulty) {
  const holeCards = bot.hole_cards;
  if (!holeCards || holeCards.some(c => c === 'HIDDEN')) return null;

  if (difficulty === 'medium') return _mediumRaise(phase, board, holeCards, bot, pot, current_bet, min_raise);
  if (difficulty === 'hard')   return _hardRaise(phase, board, holeCards, bot, pot, current_bet, min_raise);
  return null;
}

/**
 * Medium: raise 33% pot on top pair+.
 * No preflop raises (board needed for top-pair detection).
 */
function _mediumRaise(phase, board, holeCards, bot, pot, current_bet, min_raise) {
  if (phase === 'preflop' || !board || board.length < 3) return null;

  const hand = _safeEvaluate(holeCards, board);
  if (!hand) return null;

  const qualifies = hand.rank >= HAND_RANKS.TWO_PAIR ||
    (hand.rank === HAND_RANKS.ONE_PAIR && _hasTopPair(holeCards, board));

  if (!qualifies) return null;

  return _buildRaise(bot, pot, current_bet, min_raise, 0.33);
}

/**
 * Hard: 3-bet AA/KK/AK preflop; pot-bet on nuts (straight or better).
 */
function _hardRaise(phase, board, holeCards, bot, pot, current_bet, min_raise) {
  if (phase === 'preflop') {
    if (!_isPremiumHand(holeCards) || (current_bet ?? 0) === 0) return null;
    // 3-bet = raise to 3× current bet
    const threeBet  = Math.max(3 * current_bet, current_bet + (min_raise ?? current_bet));
    const totalCost = threeBet - (bot.total_bet_this_round ?? 0);
    if (totalCost > bot.stack) return { action: 'all-in', amount: 0 };
    return { action: 'raise', amount: threeBet };
  }

  if (!board || board.length < 3) return null;

  const hand = _safeEvaluate(holeCards, board);
  if (!hand || hand.rank < HAND_RANKS.STRAIGHT) return null;

  // Pot-sized bet: call amount is already folded into pot for sizing
  return _buildRaise(bot, pot, current_bet, min_raise, 1.0);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a raise action of `fraction` × pot above the current bet.
 * Falls back to all-in if the bot can't afford it.
 */
function _buildRaise(bot, pot, current_bet, min_raise, fraction) {
  const raiseBy  = Math.round(pot * fraction);
  const raiseTo  = (current_bet ?? 0) + Math.max(raiseBy, min_raise ?? 0);
  const totalCost = raiseTo - (bot.total_bet_this_round ?? 0);

  if (totalCost >= bot.stack) return { action: 'all-in', amount: 0 };
  return { action: 'raise', amount: raiseTo };
}

/**
 * True when one of the bot's hole cards matches the highest-ranked board card.
 * Callers must have already confirmed hand.rank === ONE_PAIR.
 */
function _hasTopPair(holeCards, board) {
  const topBoardRank = board.reduce((best, card) => {
    const v = rankVal(card[0]);
    return v > rankVal(best) ? card[0] : best;
  }, '2');
  return holeCards.some(c => c[0] === topBoardRank);
}

/**
 * Pocket Aces, Pocket Kings, or Ace-King.
 */
function _isPremiumHand(holeCards) {
  if (holeCards.length < 2) return false;
  const [r1, r2] = [holeCards[0][0], holeCards[1][0]];
  if (r1 === r2) return r1 === 'A' || r1 === 'K';           // AA or KK
  return (r1 === 'A' && r2 === 'K') || (r1 === 'K' && r2 === 'A'); // AK
}

/**
 * Evaluate the best 5-card hand from holeCards + board.
 * Returns null on invalid input or error.
 */
function _safeEvaluate(holeCards, board) {
  if (!holeCards || holeCards.length < 2) return null;
  if (!board || board.length < 3)         return null;
  if (holeCards.some(c => c === 'HIDDEN')) return null;
  try {
    return evaluate(holeCards, board);
  } catch {
    return null;
  }
}

module.exports = { decide };
