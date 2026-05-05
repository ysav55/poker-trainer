'use strict';

/**
 * SessionQualityService
 *
 * Computes a 0–100 quality score for a single player's session, then
 * stores it in `session_player_stats.quality_score` and `quality_breakdown`.
 *
 * Scoring formula (spec §4 — Session Quality Score):
 *   score = (1 - mistake_rate) * 30
 *         + good_play_rate     * 20
 *         + sizing_accuracy    * 25
 *         + equity_score       * 25
 *   Normalised to 0–100.
 *
 * Public API:
 *   compute(playerId, sessionId)  → { score, breakdown }
 */

const supabase = require('../db/supabase');

// ─── Tag definitions ──────────────────────────────────────────────────────────

const MISTAKE_TAGS   = new Set(['OPEN_LIMP', 'OVERLIMP', 'COLD_CALL_3BET', 'EQUITY_FOLD', 'MIN_RAISE', 'FOLD_TO_PROBE']);
const GOOD_PLAY_TAGS = new Set(['THIN_VALUE_RAISE', 'HERO_CALL', 'VALUE_BACKED', 'EQUITY_BLUFF']);

// Sizing accuracy thresholds per street (as ratio of pot)
const SIZING_RANGES = {
  preflop: null,            // skip preflop sizing (blind structure makes it complex)
  flop:    [0.33, 1.0],
  turn:    [0.33, 1.0],
  river:   [0.50, 1.5],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(v, lo = 0, hi = 1) { return Math.max(lo, Math.min(hi, v)); }

function sizingOk(action, street) {
  if (!SIZING_RANGES[street]) return null; // skip
  if (action.action !== 'bet' && action.action !== 'raise') return null; // only bets/raises
  const pot = action.pot_at_action;
  if (!pot || pot <= 0) return null; // no pot data
  const ratio = action.amount / pot;
  const [lo, hi] = SIZING_RANGES[street];
  return ratio >= lo && ratio <= hi;
}

// ─── Core computation ─────────────────────────────────────────────────────────

async function compute(playerId, sessionId) {
  if (!playerId)  throw new Error('playerId is required');
  if (!sessionId) throw new Error('sessionId is required');

  // ── 1. Get all hand_ids for this player in this session ───────────────────

  const { data: handRows, error: hrErr } = await supabase
    .from('hand_players')
    .select('hand_id')
    .eq('player_id', playerId)
    .in('hand_id',
      // Sub-select: hands that belong to this session
      supabase.from('hands').select('hand_id').eq('session_id', sessionId)
    );

  // Fallback: direct join query if sub-select unsupported
  let handIds;
  if (hrErr || !handRows) {
    const { data: sessionHands, error: shErr } = await supabase
      .from('hands')
      .select('hand_id')
      .eq('session_id', sessionId);
    if (shErr) throw new Error(shErr.message);

    const allHandIds = (sessionHands || []).map(h => h.hand_id);
    if (allHandIds.length === 0) {
      return _store(playerId, sessionId, 0, { mistake_rate: 0, good_play_rate: 0, sizing_accuracy: 0, equity_score: 0 });
    }

    const { data: hp2, error: hp2Err } = await supabase
      .from('hand_players')
      .select('hand_id')
      .eq('player_id', playerId)
      .in('hand_id', allHandIds);
    if (hp2Err) throw new Error(hp2Err.message);
    handIds = (hp2 || []).map(r => r.hand_id);
  } else {
    handIds = (handRows || []).map(r => r.hand_id);
  }

  if (handIds.length === 0) {
    return _store(playerId, sessionId, 0, { mistake_rate: 0, good_play_rate: 0, sizing_accuracy: 0, equity_score: 0 });
  }

  // ── 2. Fetch tags for these hands (player-specific + hand-level) ──────────

  const [{ data: playerTags }, { data: handTags }] = await Promise.all([
    supabase.from('hand_tags').select('tag').in('hand_id', handIds).eq('player_id', playerId),
    supabase.from('hand_tags').select('tag').in('hand_id', handIds).is('player_id', null),
  ]);

  const allTags = [...(playerTags || []).map(t => t.tag), ...(handTags || []).map(t => t.tag)];

  const mistakeCount  = allTags.filter(t => MISTAKE_TAGS.has(t)).length;
  const goodPlayCount = allTags.filter(t => GOOD_PLAY_TAGS.has(t)).length;

  const mistakeRate  = handIds.length > 0 ? clamp(mistakeCount  / handIds.length) : 0;
  const goodPlayRate = handIds.length > 0 ? clamp(goodPlayCount / handIds.length) : 0;

  // ── 3. Fetch actions for sizing accuracy ─────────────────────────────────

  const { data: actions, error: actErr } = await supabase
    .from('hand_actions')
    .select('street, action, amount, pot_at_action')
    .eq('player_id', playerId)
    .in('hand_id', handIds);
  if (actErr) throw new Error(actErr.message);

  let goodSized = 0, totalSized = 0;
  for (const act of (actions || [])) {
    const result = sizingOk(act, act.street);
    if (result === null) continue; // non-bet action or no pot data
    totalSized++;
    if (result) goodSized++;
  }
  const sizingAccuracy = totalSized > 0 ? goodSized / totalSized : 0.5; // neutral if no data

  // ── 4. Equity-weighted decision score ────────────────────────────────────
  // Equity per action is not stored in the current schema (only board equity snapshots
  // are computed, not per-action). We use 0.5 (neutral) as a placeholder so the score
  // is still meaningful from the other three components.
  const equityScore = 0.5;

  // ── 5. Composite score (0–100) ────────────────────────────────────────────

  const raw =
    (1 - mistakeRate)  * 30
    + goodPlayRate     * 20
    + sizingAccuracy   * 25
    + equityScore      * 25;

  const score = Math.round(clamp(raw, 0, 100));

  const breakdown = {
    mistake_rate:    Math.round(mistakeRate   * 1000) / 1000,
    good_play_rate:  Math.round(goodPlayRate  * 1000) / 1000,
    sizing_accuracy: Math.round(sizingAccuracy * 1000) / 1000,
    equity_score:    equityScore,
    hands_counted:   handIds.length,
  };

  return _store(playerId, sessionId, score, breakdown);
}

async function _store(playerId, sessionId, score, breakdown) {
  const { error } = await supabase
    .from('session_player_stats')
    .update({ quality_score: score, quality_breakdown: breakdown })
    .eq('player_id', playerId)
    .eq('session_id', sessionId);

  if (error) throw new Error(error.message);
  return { score, breakdown };
}

module.exports = { compute };
