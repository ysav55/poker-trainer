'use strict';
const { norm, findNthRaiser } = require('./util');

/**
 * Mistake tags — potentially questionable decisions.
 * All player-specific mistakes include player_id.
 * Hand-level mistakes (UNDO_USED) leave player_id null.
 *
 * Phase 4 additions: LIMP_RERAISE, COLD_CALL_3BET, FOLD_TO_PROBE, OVERLIMP.
 */
const MistakeAnalyzer = {
  name: 'MistakeAnalyzer',
  analyze({ hand, allActions, actions, byStreet, bbPlayerId }) {
    const results = [];
    const pre     = byStreet['preflop'] || [];
    const bb      = hand.big_blind || 20;

    // UNDO_USED: any action was reverted (hand-level, no player_id)
    if ((allActions || []).some(a => a.is_reverted))
      results.push({ tag: 'UNDO_USED', tag_type: 'mistake' });

    // ── OPEN_LIMP: non-BB player calls before any raise ────────────────────
    {
      let anyRaiseSeen = false;
      const firstVoluntary = {};
      for (const a of pre) {
        if (!(a.player_id in firstVoluntary) && ['call', 'raise', 'all-in'].includes(norm(a)))
          firstVoluntary[a.player_id] = { action: norm(a), hadRaiseBefore: anyRaiseSeen };
        if (norm(a) === 'raise') anyRaiseSeen = true;
      }
      if (bbPlayerId) {
        for (const [playerId, info] of Object.entries(firstVoluntary)) {
          if (info.action === 'call' && !info.hadRaiseBefore && playerId !== bbPlayerId) {
            results.push({ tag: 'OPEN_LIMP', tag_type: 'mistake', player_id: playerId });
            break;
          }
        }
      }
    }

    // ── OVERLIMP: called preflop when at least one other limp already in ───
    {
      let limpCount = 0;
      for (const a of pre) {
        if (norm(a) === 'raise') break;
        if (norm(a) === 'call') {
          if (limpCount >= 1 && a.player_id !== bbPlayerId)
            results.push({ tag: 'OVERLIMP', tag_type: 'mistake', player_id: a.player_id });
          limpCount++;
        }
      }
    }

    // ── LIMP_RERAISE: player limped preflop, then raised after a squeeze ───
    {
      const limpers = new Set();
      let firstRaiseSeen = false;
      for (const a of pre) {
        if (!firstRaiseSeen && norm(a) === 'call') limpers.add(a.player_id);
        if (norm(a) === 'raise') {
          if (!firstRaiseSeen) { firstRaiseSeen = true; continue; }
          if (limpers.has(a.player_id))
            results.push({ tag: 'LIMP_RERAISE', tag_type: 'mistake', player_id: a.player_id });
        }
      }
    }

    // ── COLD_CALL_3BET: called a 3-bet with no prior investment ────────────
    {
      const threeBet = findNthRaiser(pre, 2);
      if (threeBet) {
        const threeBetIdx = pre.indexOf(threeBet);
        // Everyone who voluntarily put chips in before the 3-bet is "invested"
        const invested = new Set(
          pre.slice(0, threeBetIdx)
            .filter(a => ['raise', 'call', 'all-in'].includes(norm(a)))
            .map(a => a.player_id)
        );
        for (const b of pre.slice(threeBetIdx + 1)) {
          if (norm(b) === 'raise') break; // 4-bet — not a cold call
          if (norm(b) === 'call' && !invested.has(b.player_id))
            results.push({ tag: 'COLD_CALL_3BET', tag_type: 'mistake', player_id: b.player_id });
        }
      }
    }

    // ── FOLD_TO_PROBE: folded to a bet < 25% pot ────────────────────────────
    for (const street of ['flop', 'turn', 'river']) {
      const streetActions = byStreet[street] || [];
      for (let i = 0; i < streetActions.length; i++) {
        const a = streetActions[i];
        if (norm(a) === 'bet' && a.sizingRatio !== null && a.sizingRatio < 0.25) {
          for (const b of streetActions.slice(i + 1)) {
            if (norm(b) === 'raise') break;
            if (norm(b) === 'fold')
              results.push({ tag: 'FOLD_TO_PROBE', tag_type: 'mistake', player_id: b.player_id, action_id: b.id });
          }
        }
      }
    }

    // ── MIN_RAISE: raised to ≤ 2× the previous bet amount ─────────────────
    outer: for (const street of ['preflop', 'flop', 'turn', 'river']) {
      let lastBetAmount = street === 'preflop' ? bb : 0;
      for (const a of (byStreet[street] || [])) {
        if (norm(a) === 'raise' && a.amount > 0) {
          if (lastBetAmount > 0 && a.amount <= lastBetAmount * 2) {
            results.push({ tag: 'MIN_RAISE', tag_type: 'mistake', player_id: a.player_id, action_id: a.id });
            break outer;
          }
          lastBetAmount = a.amount;
        } else if (norm(a) === 'bet' && a.amount > 0) {
          lastBetAmount = a.amount;
        }
      }
    }

    return results;
  },
};

module.exports = MistakeAnalyzer;
