'use strict';

const supabase = require('../supabase');

const CONTRACT_COLS = `
  id, coach_id, player_id, status,
  coach_split_pct, player_split_pct, makeup_policy,
  bankroll_cap, total_invested,
  start_date, end_date, auto_renew, notes,
  created_at, updated_at, created_by
`.trim();

const SESSION_COLS = `
  id, contract_id, player_id,
  session_date, platform, game_type, game_format,
  buy_in, cashout,
  reported_by, reported_by_role, notes, duration_hours,
  status, confirmed_by, confirmed_at,
  created_at, updated_at
`.trim();

const SETTLEMENT_COLS = `
  id, contract_id,
  period_start, period_end, sessions_count,
  total_buy_ins, total_cashouts, gross_pnl,
  makeup_before, makeup_after, profit_above_makeup,
  coach_share, player_share,
  proposed_by, proposed_at,
  coach_approved, coach_approved_at,
  player_approved, player_approved_at,
  status, settled_at, notes, created_at
`.trim();

const ADJUSTMENT_COLS = `
  id, contract_id, type, amount, reason, created_by, created_at
`.trim();

// ─── Contracts ────────────────────────────────────────────────────────────────

async function findContracts({ coachId, playerId, status } = {}) {
  let q = supabase.from('staking_contracts').select(CONTRACT_COLS);
  if (coachId)  q = q.eq('coach_id', coachId);
  if (playerId) q = q.eq('player_id', playerId);
  if (status)   q = q.eq('status', status);
  q = q.order('created_at', { ascending: false });
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return enrichContracts(data || []);
}

async function findContractById(id) {
  const { data, error } = await supabase
    .from('staking_contracts')
    .select(CONTRACT_COLS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const enriched = await enrichContracts([data]);
  return enriched[0];
}

async function createContract({
  coachId, playerId, coachSplitPct,
  makeupPolicy = 'carries', bankrollCap = null,
  startDate, endDate = null, autoRenew = false,
  notes = null, createdBy,
}) {
  const playerSplitPct = 100 - coachSplitPct;
  const { data, error } = await supabase
    .from('staking_contracts')
    .insert({
      coach_id:        coachId,
      player_id:       playerId,
      coach_split_pct: coachSplitPct,
      player_split_pct: playerSplitPct,
      makeup_policy:   makeupPolicy,
      bankroll_cap:    bankrollCap,
      start_date:      startDate || new Date().toISOString().slice(0, 10),
      end_date:        endDate,
      auto_renew:      autoRenew,
      notes,
      created_by:      createdBy,
    })
    .select(CONTRACT_COLS)
    .single();
  if (error) throw new Error(error.message);
  const enriched = await enrichContracts([data]);
  return enriched[0];
}

async function updateContract(id, fields, updatedBy) {
  const patch = { updated_at: new Date().toISOString() };
  if (fields.coachSplitPct !== undefined) {
    patch.coach_split_pct  = fields.coachSplitPct;
    patch.player_split_pct = 100 - fields.coachSplitPct;
  }
  if (fields.makeupPolicy  !== undefined) patch.makeup_policy  = fields.makeupPolicy;
  if (fields.bankrollCap   !== undefined) patch.bankroll_cap   = fields.bankrollCap;
  if (fields.endDate       !== undefined) patch.end_date       = fields.endDate;
  if (fields.autoRenew     !== undefined) patch.auto_renew     = fields.autoRenew;
  if (fields.notes         !== undefined) patch.notes          = fields.notes;
  if (fields.status        !== undefined) patch.status         = fields.status;
  if (fields.totalInvested !== undefined) patch.total_invested = fields.totalInvested;

  const { data, error } = await supabase
    .from('staking_contracts')
    .update(patch)
    .eq('id', id)
    .select(CONTRACT_COLS)
    .single();
  if (error) throw new Error(error.message);
  const enriched = await enrichContracts([data]);
  return enriched[0];
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

async function findSessions(contractId, { limit = 25, offset = 0, month } = {}) {
  let q = supabase
    .from('staking_sessions')
    .select(SESSION_COLS)
    .eq('contract_id', contractId)
    .neq('status', 'deleted')
    .order('session_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (month) {
    // month = 'YYYY-MM'
    const [y, m] = month.split('-');
    const start = `${y}-${m}-01`;
    const end   = new Date(Number(y), Number(m), 0).toISOString().slice(0, 10);
    q = q.gte('session_date', start).lte('session_date', end);
  }

  if (limit > 0) q = q.range(offset, offset + limit - 1);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data || []).map(addNet);
}

async function findAllConfirmedSessions(contractId) {
  const { data, error } = await supabase
    .from('staking_sessions')
    .select(SESSION_COLS)
    .eq('contract_id', contractId)
    .eq('status', 'confirmed')
    .order('session_date', { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map(addNet);
}

async function findSessionById(id) {
  const { data, error } = await supabase
    .from('staking_sessions')
    .select(SESSION_COLS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? addNet(data) : null;
}

async function createSession({
  contractId, playerId,
  sessionDate, platform, gameType, gameFormat = 'cash',
  buyIn, cashout, reportedBy, reportedByRole,
  notes = null, durationHours = null,
}) {
  const { data, error } = await supabase
    .from('staking_sessions')
    .insert({
      contract_id:      contractId,
      player_id:        playerId,
      session_date:     sessionDate,
      platform,
      game_type:        gameType,
      game_format:      gameFormat,
      buy_in:           buyIn,
      cashout,
      reported_by:      reportedBy,
      reported_by_role: reportedByRole,
      notes,
      duration_hours:   durationHours,
      status:           'confirmed',
    })
    .select(SESSION_COLS)
    .single();
  if (error) throw new Error(error.message);
  return addNet(data);
}

async function updateSession(id, fields) {
  const patch = { updated_at: new Date().toISOString() };
  if (fields.sessionDate    !== undefined) patch.session_date    = fields.sessionDate;
  if (fields.platform       !== undefined) patch.platform        = fields.platform;
  if (fields.gameType       !== undefined) patch.game_type       = fields.gameType;
  if (fields.gameFormat     !== undefined) patch.game_format     = fields.gameFormat;
  if (fields.buyIn          !== undefined) patch.buy_in          = fields.buyIn;
  if (fields.cashout        !== undefined) patch.cashout         = fields.cashout;
  if (fields.notes          !== undefined) patch.notes           = fields.notes;
  if (fields.durationHours  !== undefined) patch.duration_hours  = fields.durationHours;
  if (fields.status         !== undefined) patch.status          = fields.status;
  if (fields.confirmedBy    !== undefined) patch.confirmed_by    = fields.confirmedBy;
  if (fields.confirmedAt    !== undefined) patch.confirmed_at    = fields.confirmedAt;

  const { data, error } = await supabase
    .from('staking_sessions')
    .update(patch)
    .eq('id', id)
    .select(SESSION_COLS)
    .single();
  if (error) throw new Error(error.message);
  return addNet(data);
}

// ─── Settlements ──────────────────────────────────────────────────────────────

async function findSettlements(contractId) {
  const { data, error } = await supabase
    .from('staking_settlements')
    .select(SETTLEMENT_COLS)
    .eq('contract_id', contractId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

async function findLastApprovedSettlement(contractId) {
  const { data, error } = await supabase
    .from('staking_settlements')
    .select(SETTLEMENT_COLS)
    .eq('contract_id', contractId)
    .eq('status', 'approved')
    .order('settled_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function findPendingSettlement(contractId) {
  const { data, error } = await supabase
    .from('staking_settlements')
    .select(SETTLEMENT_COLS)
    .eq('contract_id', contractId)
    .eq('status', 'proposed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function findSettlementById(id) {
  const { data, error } = await supabase
    .from('staking_settlements')
    .select(SETTLEMENT_COLS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function createSettlement(fields) {
  const { data, error } = await supabase
    .from('staking_settlements')
    .insert({
      contract_id:         fields.contractId,
      period_start:        fields.periodStart,
      period_end:          fields.periodEnd,
      sessions_count:      fields.sessionsCount,
      total_buy_ins:       fields.totalBuyIns,
      total_cashouts:      fields.totalCashouts,
      gross_pnl:           fields.grossPnl,
      makeup_before:       fields.makeupBefore,
      makeup_after:        fields.makeupAfter,
      profit_above_makeup: fields.profitAboveMakeup,
      coach_share:         fields.coachShare,
      player_share:        fields.playerShare,
      proposed_by:         fields.proposedBy,
      coach_approved:      fields.coachApproved  || false,
      player_approved:     fields.playerApproved || false,
    })
    .select(SETTLEMENT_COLS)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function updateSettlement(id, fields) {
  const patch = {};
  if (fields.coachApproved    !== undefined) patch.coach_approved     = fields.coachApproved;
  if (fields.coachApprovedAt  !== undefined) patch.coach_approved_at  = fields.coachApprovedAt;
  if (fields.playerApproved   !== undefined) patch.player_approved    = fields.playerApproved;
  if (fields.playerApprovedAt !== undefined) patch.player_approved_at = fields.playerApprovedAt;
  if (fields.status           !== undefined) patch.status             = fields.status;
  if (fields.settledAt        !== undefined) patch.settled_at         = fields.settledAt;
  if (fields.makeupAfter      !== undefined) patch.makeup_after       = fields.makeupAfter;
  if (fields.notes            !== undefined) patch.notes              = fields.notes;

  const { data, error } = await supabase
    .from('staking_settlements')
    .update(patch)
    .eq('id', id)
    .select(SETTLEMENT_COLS)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// ─── Adjustments ──────────────────────────────────────────────────────────────

async function findAdjustments(contractId) {
  const { data, error } = await supabase
    .from('staking_adjustments')
    .select(ADJUSTMENT_COLS)
    .eq('contract_id', contractId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

async function findAdjustmentsSince(contractId, sinceDate) {
  const { data, error } = await supabase
    .from('staking_adjustments')
    .select(ADJUSTMENT_COLS)
    .eq('contract_id', contractId)
    .gte('created_at', sinceDate)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

async function createAdjustment({ contractId, type, amount, reason, createdBy }) {
  const { data, error } = await supabase
    .from('staking_adjustments')
    .insert({ contract_id: contractId, type, amount, reason, created_by: createdBy })
    .select(ADJUSTMENT_COLS)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function addNet(session) {
  return { ...session, net: parseFloat(session.cashout) - parseFloat(session.buy_in) };
}

/** Attach display_name to contracts as player_name / coach_name. */
async function enrichContracts(contracts) {
  if (!contracts.length) return contracts;

  const ids = [...new Set(contracts.flatMap(c => [c.player_id, c.coach_id]))];
  const { data } = await supabase
    .from('player_profiles')
    .select('id, display_name')
    .in('id', ids);

  const byId = {};
  for (const p of data || []) byId[p.id] = p.display_name;

  return contracts.map(c => ({
    ...c,
    player_name: byId[c.player_id] || null,
    coach_name:  byId[c.coach_id]  || null,
  }));
}

module.exports = {
  // Contracts
  findContracts, findContractById, createContract, updateContract, enrichContracts,
  // Sessions
  findSessions, findAllConfirmedSessions, findSessionById,
  createSession, updateSession,
  // Settlements
  findSettlements, findLastApprovedSettlement, findPendingSettlement,
  findSettlementById, createSettlement, updateSettlement,
  // Adjustments
  findAdjustments, findAdjustmentsSince, createAdjustment,
};
