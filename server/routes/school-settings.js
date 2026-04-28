'use strict';

/**
 * School Settings REST Routes — 8 endpoints for school customization.
 *
 * GET  /api/settings/school
 *   Returns all school settings (identity, table defaults, staking defaults, leaderboard,
 *   platforms, appearance, auto-pause timeout) for the authenticated user's school.
 *   Requires: coach role or higher
 *
 * PUT  /api/settings/school/identity
 * PUT  /api/settings/school/table-defaults
 * PUT  /api/settings/school/staking-defaults
 * PUT  /api/settings/school/leaderboard
 * PUT  /api/settings/school/platforms
 * PUT  /api/settings/school/appearance
 * PUT  /api/settings/school/auto-pause-timeout
 *   All write endpoints require: coach role + school membership
 *   Validation errors return 400; auth errors return 401/403
 *
 * Auth: requireAuth (all); requireSchoolMembership (implicitly via req.user.school_id)
 */

const express = require('express');
const SchoolSettingsService = require('../services/SchoolSettingsService');
const requireRole = require('../auth/requireRole');
const supabase = require('../db/supabase');

const router = express.Router();
const service = new SchoolSettingsService(supabase);

// ─── Middleware: Extract schoolId from request (GET from req.user.school_id) ──

function ensureSchoolId(req, res, next) {
  const schoolId = req.user?.school_id;
  if (!schoolId) {
    return res.status(403).json({ error: 'forbidden', message: 'No school assigned to user' });
  }
  req.schoolId = schoolId;
  next();
}

// Apply ensureSchoolId to all routes in this router
router.use(ensureSchoolId);

// ── GET /api/settings/school ───────────────────────────────────────────────────
// Fetch all school settings as a merged object
router.get('/', async (req, res) => {
  try {
    const schoolId = req.schoolId;

    const [identity, tableDefaults, stakingDefaults, leaderboardConfig, platforms, appearance, autoPauseTimeout] =
      await Promise.all([
        service.getIdentity(schoolId),
        service.getTableDefaults(schoolId),
        service.getStakingDefaults(schoolId),
        service.getLeaderboardConfig(schoolId),
        service.getPlatforms(schoolId),
        service.getAppearance(schoolId),
        service.getAutoPauseTimeout(schoolId),
      ]);

    res.json({
      schoolId,
      identity,
      tableDefaults,
      stakingDefaults,
      leaderboardConfig,
      platforms,
      appearance,
      autoPauseTimeout,
    });
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// ── PUT /api/settings/school/identity ──────────────────────────────────────────
// Update school identity (name, description)
router.put('/identity', requireRole('coach'), async (req, res) => {
  try {
    const { name, description } = req.body || {};
    const result = await service.setIdentity(
      req.schoolId,
      { name, description },
      req.user?.id
    );
    res.json(result);
  } catch (err) {
    if (err.message.includes('must be') || err.message.includes('is required') || err.message.includes('cannot be empty')) {
      return res.status(400).json({ error: 'validation_error', message: err.message });
    }
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// ── PUT /api/settings/school/table-defaults ────────────────────────────────────
// Update table defaults (min/max blinds and stacks)
router.put('/table-defaults', requireRole('coach'), async (req, res) => {
  try {
    const { min_sb, max_sb, min_bb, max_bb, min_starting_stack, max_starting_stack } = req.body || {};
    const result = await service.setTableDefaults(
      req.schoolId,
      { min_sb, max_sb, min_bb, max_bb, min_starting_stack, max_starting_stack },
      req.user?.id
    );
    res.json(result);
  } catch (err) {
    if (err.message.includes('must be') || err.message.includes('cannot be empty')) {
      return res.status(400).json({ error: 'validation_error', message: err.message });
    }
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// ── PUT /api/settings/school/staking-defaults ──────────────────────────────────
// Update staking defaults (coach split %, makeup policy, bankroll cap, duration)
router.put('/staking-defaults', requireRole('coach'), async (req, res) => {
  try {
    const { coach_split_pct, makeup_policy, bankroll_cap, contract_duration_months } = req.body || {};
    const result = await service.setStakingDefaults(
      req.schoolId,
      { coach_split_pct, makeup_policy, bankroll_cap, contract_duration_months },
      req.user?.id
    );
    res.json(result);
  } catch (err) {
    if (err.message.includes('must be') || err.message.includes('cannot be empty')) {
      return res.status(400).json({ error: 'validation_error', message: err.message });
    }
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// ── PUT /api/settings/school/leaderboard ───────────────────────────────────────
// Update leaderboard config (primary/secondary metrics, update frequency)
router.put('/leaderboard', requireRole('coach'), async (req, res) => {
  try {
    const { primary_metric, secondary_metric, update_frequency } = req.body || {};
    const result = await service.setLeaderboardConfig(
      req.schoolId,
      { primary_metric, secondary_metric, update_frequency },
      req.user?.id
    );
    res.json(result);
  } catch (err) {
    if (err.message.includes('must be') || err.message.includes('cannot be empty')) {
      return res.status(400).json({ error: 'validation_error', message: err.message });
    }
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// ── PUT /api/settings/school/platforms ─────────────────────────────────────────
// Update platforms list
router.put('/platforms', requireRole('coach'), async (req, res) => {
  try {
    const { platforms } = req.body || {};
    const result = await service.setPlatforms(
      req.schoolId,
      { platforms },
      req.user?.id
    );
    res.json(result);
  } catch (err) {
    if (err.message.includes('must be') || err.message.includes('cannot be empty')) {
      return res.status(400).json({ error: 'validation_error', message: err.message });
    }
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// ── PUT /api/settings/school/appearance ────────────────────────────────────────
// Update appearance settings (felt color, primary color, logo URL)
router.put('/appearance', requireRole('coach'), async (req, res) => {
  try {
    const { felt_color, primary_color, logo_url } = req.body || {};
    const result = await service.setAppearance(
      req.schoolId,
      { felt_color, primary_color, logo_url },
      req.user?.id
    );
    res.json(result);
  } catch (err) {
    if (err.message.includes('must be') || err.message.includes('cannot be empty')) {
      return res.status(400).json({ error: 'validation_error', message: err.message });
    }
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// ── PUT /api/settings/school/auto-pause-timeout ────────────────────────────────
// Update auto-pause idle timeout
router.put('/auto-pause-timeout', requireRole('coach'), async (req, res) => {
  try {
    const { idle_minutes } = req.body || {};
    const result = await service.setAutoPauseTimeout(
      req.schoolId,
      { idle_minutes },
      req.user?.id
    );
    res.json(result);
  } catch (err) {
    if (err.message.includes('must be') || err.message.includes('cannot be empty')) {
      return res.status(400).json({ error: 'validation_error', message: err.message });
    }
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

module.exports = router;
