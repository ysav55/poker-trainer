'use strict';

/**
 * StakingCalcService
 *
 * Pure computation engine for staking P&L. No DB writes — callers own that.
 * All monetary values are Numbers (no string coercion needed by callers).
 */

const Repo = require('../db/repositories/StakingRepository');

// ─── Core state computation ────────────────────────────────────────────────────

/**
 * Compute the full staking state for a contract as of today.
 *
 * Returns:
 *   {
 *     contract_id, player_id, status,      // 'in_profit' | 'in_makeup' | 'even'
 *     current_makeup,                       // <= 0
 *     profit_above_makeup,                  // >= 0
 *     coach_share, player_share,            // >= 0
 *     gross_pnl, total_buy_ins, total_cashouts,
 *     sessions_count, adjustment_total,
 *     prior_makeup, period_start, period_end
 *   }
 */
async function computeState(contractId) {
  const contract = await Repo.findContractById(contractId);
  if (!contract) throw new Error('contract_not_found');

  // Determine the period start
  const lastSettlement = await Repo.findLastApprovedSettlement(contractId);
  let periodStart;
  let priorMakeup = 0;

  if (lastSettlement) {
    // Day after last settlement
    const d = new Date(lastSettlement.period_end);
    d.setDate(d.getDate() + 1);
    periodStart  = d.toISOString().slice(0, 10);
    priorMakeup  = parseFloat(lastSettlement.makeup_after);
  } else {
    periodStart = contract.start_date;
    priorMakeup = 0;
  }

  // Monthly reset policy
  if (contract.makeup_policy === 'resets_monthly') {
    const today       = new Date();
    const monthStart  = new Date(today.getFullYear(), today.getMonth(), 1)
      .toISOString().slice(0, 10);
    // If prior makeup is from before this month, it resets
    if (periodStart < monthStart) {
      priorMakeup = 0;
      periodStart = monthStart;
    }
  }

  // Fetch confirmed sessions in this period
  const allSessions = await Repo.findAllConfirmedSessions(contractId);
  const sessions = allSessions.filter(s => s.session_date >= periodStart);

  // Fetch adjustments since period start
  const adjustments = await Repo.findAdjustmentsSince(
    contractId,
    periodStart + 'T00:00:00.000Z',
  );

  const totalBuyIns   = sessions.reduce((s, x) => s + parseFloat(x.buy_in), 0);
  const totalCashouts = sessions.reduce((s, x) => s + parseFloat(x.cashout), 0);
  const grossPnl      = totalCashouts - totalBuyIns;
  const adjustTotal   = adjustments.reduce((s, a) => s + parseFloat(a.amount), 0);

  const runningPnl      = grossPnl + adjustTotal;
  const rawMakeup       = priorMakeup + runningPnl;
  const currentMakeup   = Math.min(0, rawMakeup);
  const profitAboveMakeup = Math.max(0, rawMakeup);

  const coachShare  = profitAboveMakeup * (contract.coach_split_pct / 100);
  const playerShare = profitAboveMakeup * (contract.player_split_pct / 100);

  let status;
  if (profitAboveMakeup > 0)    status = 'in_profit';
  else if (currentMakeup < 0)   status = 'in_makeup';
  else                          status = 'even';

  return {
    contract_id:         contractId,
    player_id:           contract.player_id,
    coach_id:            contract.coach_id,
    status,
    current_makeup:      round2(currentMakeup),
    profit_above_makeup: round2(profitAboveMakeup),
    coach_share:         round2(coachShare),
    player_share:        round2(playerShare),
    gross_pnl:           round2(grossPnl),
    total_buy_ins:       round2(totalBuyIns),
    total_cashouts:      round2(totalCashouts),
    sessions_count:      sessions.length,
    adjustment_total:    round2(adjustTotal),
    prior_makeup:        round2(priorMakeup),
    period_start:        periodStart,
    period_end:          new Date().toISOString().slice(0, 10),
  };
}

// ─── Monthly breakdown ─────────────────────────────────────────────────────────

/**
 * Returns monthly P&L breakdown for the chart.
 * [{ month: 'YYYY-MM', net, sessions, buy_ins, cashouts }, ...]
 */
async function monthlyBreakdown(contractId) {
  const sessions = await Repo.findAllConfirmedSessions(contractId);

  const byMonth = {};
  for (const s of sessions) {
    const month = s.session_date.slice(0, 7); // YYYY-MM
    if (!byMonth[month]) {
      byMonth[month] = { month, net: 0, sessions: 0, buy_ins: 0, cashouts: 0 };
    }
    byMonth[month].buy_ins   += parseFloat(s.buy_in);
    byMonth[month].cashouts  += parseFloat(s.cashout);
    byMonth[month].net       += parseFloat(s.cashout) - parseFloat(s.buy_in);
    byMonth[month].sessions  += 1;
  }

  return Object.values(byMonth)
    .map(m => ({
      month:    m.month,
      net:      round2(m.net),
      sessions: m.sessions,
      buy_ins:  round2(m.buy_ins),
      cashouts: round2(m.cashouts),
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

// ─── Settlement snapshot ───────────────────────────────────────────────────────

/**
 * Build the settlement snapshot from the current computed state.
 * Caller is responsible for persisting this via Repo.createSettlement.
 */
async function buildSettlementSnapshot(contractId, proposedById, contract) {
  const state = await computeState(contractId);

  if (state.profit_above_makeup <= 0) {
    throw new Error('no_profit_to_settle');
  }

  const isCoach = proposedById === contract.coach_id;

  return {
    contractId,
    periodStart:        state.period_start,
    periodEnd:          state.period_end,
    sessionsCount:      state.sessions_count,
    totalBuyIns:        state.total_buy_ins,
    totalCashouts:      state.total_cashouts,
    grossPnl:           state.gross_pnl,
    makeupBefore:       state.prior_makeup,
    makeupAfter:        0, // profit cleared makeup
    profitAboveMakeup:  state.profit_above_makeup,
    coachShare:         state.coach_share,
    playerShare:        state.player_share,
    proposedBy:         proposedById,
    coachApproved:      isCoach,
    playerApproved:     !isCoach,
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

module.exports = { computeState, monthlyBreakdown, buildSettlementSnapshot };
