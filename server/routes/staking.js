'use strict';

const express = require('express');
const { requirePermission } = require('../auth/requirePermission.js');
const Repo    = require('../db/repositories/StakingRepository.js');
const Calc    = require('../services/StakingCalcService.js');

const router = express.Router();

// requireAuth is applied at registration in server/index.js.
// Within these routes we do additional per-resource checks.

const canManage = requirePermission('staking:manage');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid(req) {
  return req.user?.stableId ?? req.user?.id;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Verify caller is the coach or player on the contract. */
function assertParty(contract, callerId) {
  if (contract.coach_id !== callerId && contract.player_id !== callerId) {
    throw Object.assign(new Error('forbidden'), { status: 403 });
  }
}

function isCoach(contract, callerId) {
  return contract.coach_id === callerId;
}

// ─── GET /api/staking/contracts ───────────────────────────────────────────────
// Coach: returns their contracts. Player: returns their own contract(s).
router.get('/contracts', async (req, res) => {
  try {
    const me = uid(req);
    const role = req.user?.role;
    const isCoachRole = ['coach', 'admin', 'superadmin'].includes(role);

    const contracts = isCoachRole
      ? await Repo.findContracts({ coachId: me, status: req.query.status || undefined })
      : await Repo.findContracts({ playerId: me, status: req.query.status || undefined });

    // Also allow admin to query by player_id
    if (req.query.player_id && isCoachRole) {
      const byPlayer = await Repo.findContracts({ playerId: req.query.player_id });
      return res.json({ contracts: byPlayer });
    }

    res.json({ contracts });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── POST /api/staking/contracts ─────────────────────────────────────────────
router.post('/contracts', canManage, async (req, res) => {
  try {
    const {
      player_id, coach_split_pct, makeup_policy,
      bankroll_cap, start_date, end_date, notes,
    } = req.body || {};

    if (!player_id)       return res.status(400).json({ error: 'player_id is required' });
    if (coach_split_pct == null) return res.status(400).json({ error: 'coach_split_pct is required' });

    const pct = parseInt(coach_split_pct, 10);
    if (isNaN(pct) || pct < 1 || pct > 99) {
      return res.status(400).json({ error: 'coach_split_pct must be 1–99' });
    }

    const contract = await Repo.createContract({
      coachId:       uid(req),
      playerId:      player_id,
      coachSplitPct: pct,
      makeupPolicy:  makeup_policy  || 'carries',
      bankrollCap:   bankroll_cap   != null ? parseFloat(bankroll_cap)   : null,
      startDate:     start_date     || undefined,
      endDate:       end_date       || null,
      notes:         notes          || null,
      createdBy:     uid(req),
    });
    res.status(201).json(contract);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── PATCH /api/staking/contracts/:id ────────────────────────────────────────
router.patch('/contracts/:id', canManage, async (req, res) => {
  try {
    const contract = await Repo.findContractById(req.params.id);
    if (!contract) return res.status(404).json({ error: 'not_found' });
    if (contract.coach_id !== uid(req)) return res.status(403).json({ error: 'forbidden' });

    const {
      coach_split_pct, makeup_policy, bankroll_cap,
      end_date, auto_renew, notes, status,
    } = req.body || {};
    const fields = {};
    if (coach_split_pct !== undefined) fields.coachSplitPct = parseInt(coach_split_pct, 10);
    if (makeup_policy   !== undefined) fields.makeupPolicy  = makeup_policy;
    if (bankroll_cap    !== undefined) fields.bankrollCap   = bankroll_cap != null ? parseFloat(bankroll_cap) : null;
    if (end_date        !== undefined) fields.endDate       = end_date;
    if (auto_renew      !== undefined) fields.autoRenew     = auto_renew;
    if (notes           !== undefined) fields.notes         = notes;
    if (status          !== undefined) fields.status        = status;

    const updated = await Repo.updateContract(req.params.id, fields, uid(req));
    res.json(updated);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── GET /api/staking/contracts/:id/state ────────────────────────────────────
router.get('/contracts/:id/state', async (req, res) => {
  try {
    const contract = await Repo.findContractById(req.params.id);
    if (!contract) return res.status(404).json({ error: 'not_found' });
    assertParty(contract, uid(req));

    const state = await Calc.computeState(req.params.id);
    res.json(state);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── GET /api/staking/contracts/:id/monthly ──────────────────────────────────
router.get('/contracts/:id/monthly', async (req, res) => {
  try {
    const contract = await Repo.findContractById(req.params.id);
    if (!contract) return res.status(404).json({ error: 'not_found' });
    assertParty(contract, uid(req));

    const breakdown = await Calc.monthlyBreakdown(req.params.id);
    res.json({ breakdown });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── GET /api/staking/contracts/:id/sessions ─────────────────────────────────
router.get('/contracts/:id/sessions', async (req, res) => {
  try {
    const contract = await Repo.findContractById(req.params.id);
    if (!contract) return res.status(404).json({ error: 'not_found' });
    assertParty(contract, uid(req));

    const sessions = await Repo.findSessions(req.params.id, {
      limit:  req.query.limit  != null ? parseInt(req.query.limit,  10) : 25,
      offset: req.query.offset != null ? parseInt(req.query.offset, 10) : 0,
      month:  req.query.month  || undefined,
    });
    res.json({ sessions });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── POST /api/staking/contracts/:id/sessions ────────────────────────────────
router.post('/contracts/:id/sessions', async (req, res) => {
  try {
    const contract = await Repo.findContractById(req.params.id);
    if (!contract) return res.status(404).json({ error: 'not_found' });
    assertParty(contract, uid(req));
    if (contract.status !== 'active' && contract.status !== 'paused') {
      return res.status(400).json({ error: 'contract_not_active' });
    }

    const {
      session_date, platform, game_type, game_format,
      buy_in, cashout, notes, duration_hours,
    } = req.body || {};

    if (!session_date) return res.status(400).json({ error: 'session_date is required' });
    if (!platform)     return res.status(400).json({ error: 'platform is required' });
    if (!game_type)    return res.status(400).json({ error: 'game_type is required' });
    if (buy_in  == null) return res.status(400).json({ error: 'buy_in is required' });
    if (cashout == null) return res.status(400).json({ error: 'cashout is required' });

    // Reject future dates
    const today = new Date().toISOString().slice(0, 10);
    if (session_date > today) {
      return res.status(400).json({ error: 'session_date cannot be in the future' });
    }

    const me = uid(req);
    const role = isCoach(contract, me) ? 'coach' : 'player';

    const session = await Repo.createSession({
      contractId:     req.params.id,
      playerId:       contract.player_id,
      sessionDate:    session_date,
      platform,
      gameType:       game_type,
      gameFormat:     game_format || 'cash',
      buyIn:          parseFloat(buy_in),
      cashout:        parseFloat(cashout),
      reportedBy:     me,
      reportedByRole: role,
      notes:          notes         || null,
      durationHours:  duration_hours != null ? parseFloat(duration_hours) : null,
    });

    // Update contract's total_invested
    await Repo.updateContract(req.params.id, {
      totalInvested: parseFloat(contract.total_invested) + parseFloat(buy_in),
    }, me);

    res.status(201).json(session);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── PATCH /api/staking/sessions/:id ─────────────────────────────────────────
router.patch('/sessions/:id', async (req, res) => {
  try {
    const session = await Repo.findSessionById(req.params.id);
    if (!session) return res.status(404).json({ error: 'not_found' });

    const contract = await Repo.findContractById(session.contract_id);
    assertParty(contract, uid(req));

    const me = uid(req);
    const asCoach = isCoach(contract, me);

    // Players can only edit within 48h of logging
    if (!asCoach && session.reported_by === me) {
      const created = new Date(session.created_at);
      const hours = (Date.now() - created.getTime()) / 3600000;
      if (hours > 48) {
        return res.status(403).json({ error: 'edit_window_expired' });
      }
    } else if (!asCoach) {
      return res.status(403).json({ error: 'forbidden' });
    }

    const {
      session_date, platform, game_type, game_format,
      buy_in, cashout, notes, duration_hours,
    } = req.body || {};

    const fields = {};
    if (session_date    !== undefined) fields.sessionDate   = session_date;
    if (platform        !== undefined) fields.platform      = platform;
    if (game_type       !== undefined) fields.gameType      = game_type;
    if (game_format     !== undefined) fields.gameFormat    = game_format;
    if (buy_in          !== undefined) fields.buyIn         = parseFloat(buy_in);
    if (cashout         !== undefined) fields.cashout       = parseFloat(cashout);
    if (notes           !== undefined) fields.notes         = notes;
    if (duration_hours  !== undefined) fields.durationHours = duration_hours != null ? parseFloat(duration_hours) : null;

    const updated = await Repo.updateSession(req.params.id, fields);
    res.json(updated);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── DELETE /api/staking/sessions/:id ────────────────────────────────────────
router.delete('/sessions/:id', async (req, res) => {
  try {
    const session = await Repo.findSessionById(req.params.id);
    if (!session) return res.status(404).json({ error: 'not_found' });

    const contract = await Repo.findContractById(session.contract_id);
    assertParty(contract, uid(req));

    const me = uid(req);
    const asCoach = isCoach(contract, me);

    if (!asCoach) {
      if (session.reported_by !== me) return res.status(403).json({ error: 'forbidden' });
      const hours = (Date.now() - new Date(session.created_at).getTime()) / 3600000;
      if (hours > 48) return res.status(403).json({ error: 'edit_window_expired' });
    }

    await Repo.updateSession(req.params.id, { status: 'deleted' });
    res.json({ success: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── POST /api/staking/sessions/:id/dispute ──────────────────────────────────
router.post('/sessions/:id/dispute', async (req, res) => {
  try {
    const session = await Repo.findSessionById(req.params.id);
    if (!session) return res.status(404).json({ error: 'not_found' });

    const contract = await Repo.findContractById(session.contract_id);
    assertParty(contract, uid(req));

    await Repo.updateSession(req.params.id, { status: 'disputed' });
    res.json({ success: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── POST /api/staking/sessions/:id/resolve ──────────────────────────────────
router.post('/sessions/:id/resolve', canManage, async (req, res) => {
  try {
    const session = await Repo.findSessionById(req.params.id);
    if (!session) return res.status(404).json({ error: 'not_found' });

    const contract = await Repo.findContractById(session.contract_id);
    if (contract.coach_id !== uid(req)) return res.status(403).json({ error: 'forbidden' });

    const { buy_in, cashout, notes } = req.body || {};
    const fields = {
      status:      'confirmed',
      confirmedBy: uid(req),
      confirmedAt: new Date().toISOString(),
    };
    if (buy_in  != null) fields.buyIn   = parseFloat(buy_in);
    if (cashout != null) fields.cashout = parseFloat(cashout);
    if (notes   != null) fields.notes   = notes;

    const updated = await Repo.updateSession(req.params.id, fields);
    res.json(updated);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── GET /api/staking/contracts/:id/settlements ──────────────────────────────
router.get('/contracts/:id/settlements', async (req, res) => {
  try {
    const contract = await Repo.findContractById(req.params.id);
    if (!contract) return res.status(404).json({ error: 'not_found' });
    assertParty(contract, uid(req));

    const settlements = await Repo.findSettlements(req.params.id);
    res.json({ settlements });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── POST /api/staking/contracts/:id/settlements ─────────────────────────────
router.post('/contracts/:id/settlements', async (req, res) => {
  try {
    const contract = await Repo.findContractById(req.params.id);
    if (!contract) return res.status(404).json({ error: 'not_found' });
    assertParty(contract, uid(req));

    // Cannot have two pending settlements
    const pending = await Repo.findPendingSettlement(req.params.id);
    if (pending) return res.status(409).json({ error: 'settlement_already_pending' });

    const snapshot = await Calc.buildSettlementSnapshot(req.params.id, uid(req), contract);
    const settlement = await Repo.createSettlement(snapshot);
    res.status(201).json(settlement);
  } catch (err) {
    if (err.message === 'no_profit_to_settle') {
      return res.status(400).json({ error: 'no_profit_to_settle', message: 'Player must clear makeup before settlement.' });
    }
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── PATCH /api/staking/settlements/:id/approve ──────────────────────────────
router.patch('/settlements/:id/approve', async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) {
      return res.status(400).json({ error: 'invalid_id', message: 'The provided ID is not valid.' });
    }
    const settlement = await Repo.findSettlementById(req.params.id);
    if (!settlement) return res.status(404).json({ error: 'not_found' });
    if (settlement.status !== 'proposed') {
      return res.status(400).json({ error: 'settlement_not_pending' });
    }

    const contract = await Repo.findContractById(settlement.contract_id);
    assertParty(contract, uid(req));

    const me = uid(req);
    const now = new Date().toISOString();
    const patch = {};

    if (me === contract.coach_id) {
      patch.coachApproved   = true;
      patch.coachApprovedAt = now;
    } else {
      patch.playerApproved   = true;
      patch.playerApprovedAt = now;
    }

    // Check if both will be approved after this patch
    const willCoachApprove  = patch.coachApproved  || settlement.coach_approved;
    const willPlayerApprove = patch.playerApproved || settlement.player_approved;

    if (willCoachApprove && willPlayerApprove) {
      patch.status     = 'approved';
      patch.settledAt  = now;
      patch.makeupAfter = 0;
    }

    const updated = await Repo.updateSettlement(req.params.id, patch);
    res.json(updated);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── PATCH /api/staking/settlements/:id/reject ───────────────────────────────
router.patch('/settlements/:id/reject', async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) {
      return res.status(400).json({ error: 'invalid_id', message: 'The provided ID is not valid.' });
    }
    const settlement = await Repo.findSettlementById(req.params.id);
    if (!settlement) return res.status(404).json({ error: 'not_found' });
    if (settlement.status !== 'proposed') {
      return res.status(400).json({ error: 'settlement_not_pending' });
    }

    const contract = await Repo.findContractById(settlement.contract_id);
    assertParty(contract, uid(req));

    const updated = await Repo.updateSettlement(req.params.id, {
      status: 'rejected',
      notes:  req.body?.reason || null,
    });
    res.json(updated);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── GET /api/staking/contracts/:id/adjustments ──────────────────────────────
router.get('/contracts/:id/adjustments', async (req, res) => {
  try {
    const contract = await Repo.findContractById(req.params.id);
    if (!contract) return res.status(404).json({ error: 'not_found' });
    assertParty(contract, uid(req));

    const adjustments = await Repo.findAdjustments(req.params.id);
    res.json({ adjustments });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── POST /api/staking/contracts/:id/adjustments ─────────────────────────────
router.post('/contracts/:id/adjustments', canManage, async (req, res) => {
  try {
    const contract = await Repo.findContractById(req.params.id);
    if (!contract) return res.status(404).json({ error: 'not_found' });
    if (contract.coach_id !== uid(req)) return res.status(403).json({ error: 'forbidden' });

    const { type, amount, reason } = req.body || {};
    if (!type)   return res.status(400).json({ error: 'type is required' });
    if (amount == null) return res.status(400).json({ error: 'amount is required' });
    if (!reason) return res.status(400).json({ error: 'reason is required' });

    const adjustment = await Repo.createAdjustment({
      contractId: req.params.id,
      type,
      amount:     parseFloat(amount),
      reason,
      createdBy:  uid(req),
    });
    res.status(201).json(adjustment);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── GET /api/staking/overview ────────────────────────────────────────────────
// Returns all active contracts with computed state — coach/admin only.
router.get('/overview', canManage, async (req, res) => {
  try {
    const me = uid(req);
    const contracts = await Repo.findContracts({ coachId: me, status: 'active' });

    const items = await Promise.allSettled(
      contracts.map(async (c) => {
        const state = await Calc.computeState(c.id);
        return { contract: c, state };
      }),
    );

    const results = items
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value)
      .sort((a, b) => {
        // in_makeup first (most negative), then in_profit (highest), then even
        const order = { in_makeup: 0, in_profit: 1, even: 2 };
        if (a.state.status !== b.state.status) {
          return order[a.state.status] - order[b.state.status];
        }
        if (a.state.status === 'in_makeup') {
          return a.state.current_makeup - b.state.current_makeup; // most negative first
        }
        return b.state.profit_above_makeup - a.state.profit_above_makeup; // highest profit first
      });

    res.json({ contracts: results });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
