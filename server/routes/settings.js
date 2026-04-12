'use strict';

/**
 * Settings routes — table defaults + quick-pick presets.
 *
 * Table defaults resolution (GET):
 *   Coach/moderator → school override → org default → hardcoded
 *   Admin/superadmin → org default → hardcoded
 *
 * Table defaults write (PUT):
 *   Coach → writes at scope='school', scope_id=caller.school_id
 *   Admin/superadmin → writes at scope='org', scope_id=ORG_SCOPE_ID
 *
 * All endpoints require authentication.
 */

const express          = require('express');
const SettingsService  = require('../services/SettingsService.js');
const supabase         = require('../db/supabase.js');

const router = express.Router();

const ADMIN_ROLES = new Set(['admin', 'superadmin']);

// ─── Helper: get caller's school_id from player_profiles ──────────────────────

async function _callerSchoolId(stableId) {
  const { findById } = require('../db/repositories/PlayerRepository.js');
  const player = await findById(stableId);
  return player?.school_id ?? null;
}

// ─── Helper: resolve scope + scopeId from caller role ─────────────────────────

async function _writeScopeFor(req) {
  if (ADMIN_ROLES.has(req.user.role)) {
    return { scope: 'org', scopeId: SettingsService.ORG_SCOPE_ID };
  }
  const schoolId = await _callerSchoolId(req.user.stableId);
  return {
    scope:   'school',
    scopeId: schoolId ?? req.user.stableId,  // fallback: treat coach as their own school
  };
}

// ── GET /api/settings/table-defaults ─────────────────────────────────────────
// Returns resolved defaults + source_scope per key.
router.get('/table-defaults', async (req, res) => {
  try {
    const schoolId = ADMIN_ROLES.has(req.user.role)
      ? null
      : await _callerSchoolId(req.user.stableId);

    const defaults = await SettingsService.resolveTableDefaults(schoolId);
    return res.json({ defaults, school_id: schoolId });
  } catch (err) {
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// ── PUT /api/settings/table-defaults ─────────────────────────────────────────
// Body: { settings: { 'table.key': value, … } }
router.put('/table-defaults', async (req, res) => {
  const { settings: patch } = req.body || {};
  if (!patch || typeof patch !== 'object' || Array.isArray(patch))
    return res.status(400).json({ error: 'invalid_body', message: 'settings object required.' });

  try {
    const { scope, scopeId } = await _writeScopeFor(req);
    await SettingsService.saveTableDefaults(scope, scopeId, patch);
    return res.json({ success: true, scope, scope_id: scopeId });
  } catch (err) {
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// ── DELETE /api/settings/table-defaults ───────────────────────────────────────
// Remove all overrides at caller's scope → reverts to inherited values.
router.delete('/table-defaults', async (req, res) => {
  try {
    const { scope, scopeId } = await _writeScopeFor(req);
    await SettingsService.resetTableDefaults(scope, scopeId);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// ── GET /api/settings/presets ─────────────────────────────────────────────────
// List quick-pick presets for the authenticated user.
router.get('/presets', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('table_presets')
      .select('id, name, config, created_at, updated_at')
      .eq('coach_id', req.user.stableId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return res.json({ presets: data ?? [] });
  } catch (err) {
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// ── POST /api/settings/presets ────────────────────────────────────────────────
// Body: { name, config }
router.post('/presets', async (req, res) => {
  const { name, config } = req.body || {};
  if (!name || typeof name !== 'string' || name.trim().length === 0)
    return res.status(400).json({ error: 'invalid_name', message: 'name is required.' });
  if (!config || typeof config !== 'object')
    return res.status(400).json({ error: 'invalid_config', message: 'config object is required.' });

  try {
    const { data, error } = await supabase
      .from('table_presets')
      .insert({ coach_id: req.user.stableId, name: name.trim(), config })
      .select('id, name, config, created_at, updated_at')
      .single();
    if (error) throw error;
    return res.status(201).json(data);
  } catch (err) {
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// ── PATCH /api/settings/presets/:id ──────────────────────────────────────────
// Body: { name?, config? }
router.patch('/presets/:id', async (req, res) => {
  const { id } = req.params;
  const { name, config } = req.body || {};

  if (!name && !config)
    return res.status(400).json({ error: 'no_fields', message: 'Provide name or config to update.' });

  const patch = { updated_at: new Date().toISOString() };
  if (name   !== undefined) patch.name   = String(name).trim();
  if (config !== undefined) patch.config = config;

  try {
    const { data, error } = await supabase
      .from('table_presets')
      .update(patch)
      .eq('id', id)
      .eq('coach_id', req.user.stableId)   // ownership guard
      .select('id, name, config, created_at, updated_at')
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'not_found' });
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// ── DELETE /api/settings/presets/:id ─────────────────────────────────────────
router.delete('/presets/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('table_presets')
      .delete()
      .eq('id', req.params.id)
      .eq('coach_id', req.user.stableId)   // ownership guard
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'not_found' });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// ─── School Settings ──────────────────────────────────────────────────────────
// Coaches manage their own school via these endpoints.
// Admin/superadmin use /api/admin/schools/:id directly.

const SCHOOL_ROLES = new Set(['coach', 'admin', 'superadmin']);

async function _callerSchool(stableId) {
  const { findById: findPlayer } = require('../db/repositories/PlayerRepository.js');
  const { findById: findSchool } = require('../db/repositories/SchoolRepository.js');
  const player = await findPlayer(stableId);
  if (!player?.school_id) return null;
  return findSchool(player.school_id);
}

// ── GET /api/settings/school ──────────────────────────────────────────────────
// Returns: { identity, staking_defaults, platforms, leaderboard }
router.get('/school', async (req, res) => {
  if (!SCHOOL_ROLES.has(req.user.role))
    return res.status(403).json({ error: 'forbidden' });

  try {
    const school = await _callerSchool(req.user.stableId);
    if (!school) return res.status(404).json({ error: 'no_school', message: 'No school assigned.' });

    const [stakingDefaults, platforms, leaderboard] = await Promise.all([
      SettingsService.getSchoolSetting(school.id, 'school.staking_defaults'),
      SettingsService.getSchoolSetting(school.id, 'school.platforms'),
      SettingsService.getSchoolSetting(school.id, 'school.leaderboard'),
    ]);

    return res.json({
      identity: { id: school.id, name: school.name, description: school.description ?? '' },
      staking_defaults: {
        coach_split_pct:           50,
        makeup_policy:             'carries',
        bankroll_cap:              25000,
        contract_duration_months:  6,
        ...(stakingDefaults ?? {}),
      },
      platforms: platforms?.platforms ?? ['PokerStars', 'GGPoker', 'Live Games'],
      leaderboard: {
        primary_metric:   'net_chips',
        secondary_metric: 'win_rate',
        update_frequency: 'after_session',
        ...(leaderboard ?? {}),
      },
    });
  } catch (err) {
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// ── PUT /api/settings/school/identity ────────────────────────────────────────
// Body: { name?, description? }
router.put('/school/identity', async (req, res) => {
  if (!SCHOOL_ROLES.has(req.user.role))
    return res.status(403).json({ error: 'forbidden' });

  const { name, description } = req.body || {};
  if (!name && description === undefined)
    return res.status(400).json({ error: 'no_fields', message: 'Provide name or description.' });
  if (name !== undefined && (typeof name !== 'string' || name.trim().length < 2))
    return res.status(400).json({ error: 'invalid_name', message: 'Name must be at least 2 characters.' });

  try {
    const school = await _callerSchool(req.user.stableId);
    if (!school) return res.status(404).json({ error: 'no_school' });

    const { update } = require('../db/repositories/SchoolRepository.js');
    const patch = {};
    if (name        !== undefined) patch.name        = name.trim();
    if (description !== undefined) patch.description = description;

    const updated = await update(school.id, patch, req.user.stableId);
    return res.json({ id: updated.id, name: updated.name, description: updated.description ?? '' });
  } catch (err) {
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// ── PUT /api/settings/school/staking-defaults ─────────────────────────────────
// Body: { coach_split_pct?, makeup_policy?, bankroll_cap?, contract_duration_months? }
router.put('/school/staking-defaults', async (req, res) => {
  if (!SCHOOL_ROLES.has(req.user.role))
    return res.status(403).json({ error: 'forbidden' });

  try {
    const school = await _callerSchool(req.user.stableId);
    if (!school) return res.status(404).json({ error: 'no_school' });

    const current = await SettingsService.getSchoolSetting(school.id, 'school.staking_defaults') ?? {};
    const { coach_split_pct, makeup_policy, bankroll_cap, contract_duration_months } = req.body || {};
    const updated = {
      ...current,
      ...(coach_split_pct           !== undefined && { coach_split_pct:           Number(coach_split_pct) }),
      ...(makeup_policy             !== undefined && { makeup_policy:             String(makeup_policy) }),
      ...(bankroll_cap              !== undefined && { bankroll_cap:              Number(bankroll_cap) }),
      ...(contract_duration_months  !== undefined && { contract_duration_months:  Number(contract_duration_months) }),
    };
    await SettingsService.setSchoolSetting(school.id, 'school.staking_defaults', updated);
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// ── GET /api/settings/school/platforms ───────────────────────────────────────
router.get('/school/platforms', async (req, res) => {
  if (!SCHOOL_ROLES.has(req.user.role))
    return res.status(403).json({ error: 'forbidden' });

  try {
    const school = await _callerSchool(req.user.stableId);
    if (!school) return res.status(404).json({ error: 'no_school' });

    const stored = await SettingsService.getSchoolSetting(school.id, 'school.platforms');
    return res.json({ platforms: stored?.platforms ?? ['PokerStars', 'GGPoker', 'Live Games'] });
  } catch (err) {
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// ── PUT /api/settings/school/platforms ───────────────────────────────────────
// Body: { platforms: string[] }
router.put('/school/platforms', async (req, res) => {
  if (!SCHOOL_ROLES.has(req.user.role))
    return res.status(403).json({ error: 'forbidden' });

  const { platforms } = req.body || {};
  if (!Array.isArray(platforms))
    return res.status(400).json({ error: 'invalid_platforms', message: 'platforms must be an array.' });

  try {
    const school = await _callerSchool(req.user.stableId);
    if (!school) return res.status(404).json({ error: 'no_school' });

    const clean = platforms.map(p => String(p).trim()).filter(Boolean);
    await SettingsService.setSchoolSetting(school.id, 'school.platforms', { platforms: clean });
    return res.json({ platforms: clean });
  } catch (err) {
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// ── PUT /api/settings/school/leaderboard ─────────────────────────────────────
// Body: { primary_metric?, secondary_metric?, update_frequency? }
router.put('/school/leaderboard', async (req, res) => {
  if (!SCHOOL_ROLES.has(req.user.role))
    return res.status(403).json({ error: 'forbidden' });

  try {
    const school = await _callerSchool(req.user.stableId);
    if (!school) return res.status(404).json({ error: 'no_school' });

    const current = await SettingsService.getSchoolSetting(school.id, 'school.leaderboard') ?? {};
    const { primary_metric, secondary_metric, update_frequency } = req.body || {};
    const updated = {
      ...current,
      ...(primary_metric   !== undefined && { primary_metric:   String(primary_metric) }),
      ...(secondary_metric !== undefined && { secondary_metric: String(secondary_metric) }),
      ...(update_frequency !== undefined && { update_frequency: String(update_frequency) }),
    };
    await SettingsService.setSchoolSetting(school.id, 'school.leaderboard', updated);
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

module.exports = router;
