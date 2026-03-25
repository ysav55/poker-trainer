'use strict';

/**
 * AnalyzerService — hand tag analysis pipeline.
 *
 * Extracted from HandLoggerSupabase.js to separate business logic from persistence.
 * Key improvements over the original:
 *   - buildAnalyzerContext: 3 DB queries run concurrently (Promise.all)
 *   - evaluateAt: memoized per playerId+street to avoid redundant hand evaluations
 *   - analyzeAndTagHand: Promise.allSettled gives each analyzer an independent fault boundary
 *   - buildAnalyzerContext failures are caught internally (self-contained error handling)
 *   - TagResult shape is validated before insert
 */

const supabase           = require('../db/supabase');
const { q }              = require('../db/utils');
const { buildPositionMap } = require('./positions');
const { evaluate: evaluateHand } = require('./HandEvaluator');
const { ANALYZER_REGISTRY }      = require('./tagAnalyzers/index');
const { replaceAutoTags }        = require('../db/repositories/TagRepository');
const log                        = require('../logs/logger');

// ─── Context Builder ──────────────────────────────────────────────────────────

/**
 * Build the shared context object consumed by every tag analyzer.
 * Fetches hand, actions, and players in parallel; attaches sizingRatio to each
 * action row; constructs the memoized evaluateAt helper for hand-strength tags.
 *
 * @param {string} handId
 * @returns {object|null} AnalyzerContext, or null if the hand row is missing.
 */
async function buildAnalyzerContext(handId) {
  // Parallel fetch — three independent queries
  const [hand, allActions, handPlayers] = await Promise.all([
    q(supabase.from('hands').select('hand_id, session_id, table_id, started_at, ended_at, board, final_pot, winner_id, winner_name, phase_ended, completed_normally, dealer_seat, is_scenario_hand').eq('hand_id', handId).maybeSingle()),
    q(supabase.from('hand_actions').select('id, hand_id, player_id, player_name, street, action, amount, pot_at_action, position, timestamp, is_manual_scenario, is_reverted').eq('hand_id', handId).order('id', { ascending: true })),
    q(supabase.from('hand_players').select('hand_id, player_id, player_name, seat, hole_cards, is_coach, starting_stack, final_stack').eq('hand_id', handId)),
  ]);

  if (!hand) return null;

  const actions = (allActions || []).filter(a => !a.is_reverted);
  const seated  = (handPlayers || []).filter(p => p.seat >= 0).sort((a, b) => a.seat - b.seat);

  // Attach sizingRatio to each action (null when pot is 0 or unknown)
  const enrichedActions = actions.map(a => ({
    ...a,
    sizingRatio: (a.pot_at_action > 0 && a.amount > 0)
      ? a.amount / a.pot_at_action
      : null,
  }));

  // Group by street
  const byStreet = {};
  for (const a of enrichedActions) {
    if (!byStreet[a.street]) byStreet[a.street] = [];
    byStreet[a.street].push(a);
  }

  // pot entering each street = potAtAction of first action on that street.
  // Fallback: sum all amounts from prior streets (for old rows with null potAtAction).
  const STREETS = ['preflop', 'flop', 'turn', 'river'];
  const potByStreet = {};
  let runningSum = 0;
  for (const street of STREETS) {
    const first = (byStreet[street] || [])[0];
    potByStreet[street] = (first?.pot_at_action ?? null) ?? runningSum;
    for (const a of (byStreet[street] || [])) {
      if (a.amount > 0) runningSum += a.amount;
    }
  }

  const positions  = buildPositionMap(seated, hand.dealer_seat ?? -1);
  const bbPlayerId = (() => {
    if (seated.length < 2) return null;
    const dealerIdx = seated.findIndex(p => p.seat === (hand.dealer_seat ?? -1));
    if (dealerIdx === -1) return null;
    const bbOffset = seated.length === 2 ? 1 : 2;
    return seated[(dealerIdx + bbOffset) % seated.length].player_id;
  })();

  // Build hole-card lookup for evaluateAt
  const holeCardsByPlayer = {};
  for (const p of (handPlayers || [])) {
    if (p.hole_cards?.length >= 2) holeCardsByPlayer[p.player_id] = p.hole_cards;
  }
  const board = hand.board || [];
  const STREET_BOARD_LEN = { preflop: 0, flop: 3, turn: 4, river: 5 };

  // Memoize evaluations — keyed on "playerId:street" to avoid redundant C(7,5) calls
  const evalMemo = new Map();

  /**
   * Evaluate a player's hand strength at a given street.
   * Returns HandResult { rank, rankName, bestFive, ... } or null if data unavailable.
   */
  function evaluateAt(playerId, street) {
    const key = `${playerId}:${street}`;
    if (evalMemo.has(key)) return evalMemo.get(key);

    const holeCards = holeCardsByPlayer[playerId];
    if (!holeCards || holeCards.length < 2) { evalMemo.set(key, null); return null; }
    const boardLen = STREET_BOARD_LEN[street] ?? 0;
    if (board.length < boardLen || boardLen < 3) { evalMemo.set(key, null); return null; }
    try {
      const result = evaluateHand(holeCards, board.slice(0, boardLen));
      evalMemo.set(key, result);
      return result;
    } catch {
      evalMemo.set(key, null);
      return null;
    }
  }

  return {
    hand,
    allActions: allActions || [],
    actions: enrichedActions,
    byStreet,
    seated,
    positions,
    bbPlayerId,
    potByStreet,
    evaluateAt,
    holeCardsByPlayer,
  };
}

// ─── Analyzer Runner ──────────────────────────────────────────────────────────

/**
 * Run all 9 analyzers against the hand, then atomically replace auto/mistake/sizing tags.
 * Self-contained: catches buildAnalyzerContext failures internally.
 *
 * @param {string} handId
 * @returns {Array|undefined} inserted tagRows, or undefined on early exit
 */
async function analyzeAndTagHand(handId) {
  // Self-contained error isolation around context assembly
  let ctx;
  try {
    ctx = await buildAnalyzerContext(handId);
  } catch (err) {
    log.error('db', 'analyzer_context_failed', '[AnalyzerService] buildAnalyzerContext failed', { err, handId });
    return;
  }
  if (!ctx) return;

  // Fast path: skip analysis for hands with no actions (walks, abandoned hands)
  if (ctx.allActions.length === 0) return [];

  // Run all analyzers in parallel — each has an independent fault boundary
  const settled = await Promise.allSettled(
    ANALYZER_REGISTRY.map(analyzer => Promise.resolve().then(() => analyzer.analyze(ctx)))
  );

  const rawResults = [];
  for (let i = 0; i < settled.length; i++) {
    const result = settled[i];
    if (result.status === 'fulfilled') {
      rawResults.push(...(result.value || []));
    } else {
      log.error('db', 'analyzer_failed', `[AnalyzerService] ${ANALYZER_REGISTRY[i].name} threw`, { err: result.reason, handId });
    }
  }

  // Validate TagResult shape + deduplicate
  const seen    = new Set();
  const tagRows = [];
  for (const r of rawResults) {
    // Shape validation: skip malformed results
    if (!r || typeof r.tag !== 'string' || !r.tag_type) continue;

    // Dedup hand-level and player-level tags; action-level tags are never deduped
    if (r.action_id == null) {
      const key = r.player_id
        ? `${r.tag_type}::${r.tag}::${r.player_id}`
        : `${r.tag_type}::${r.tag}`;
      if (seen.has(key)) continue;
      seen.add(key);
    }
    tagRows.push({
      hand_id:   handId,
      tag:       r.tag,
      tag_type:  r.tag_type,
      player_id: r.player_id ?? null,
      action_id: r.action_id ?? null,
    });
  }

  await replaceAutoTags(handId, tagRows);
  return tagRows;
}

module.exports = { buildAnalyzerContext, analyzeAndTagHand };
