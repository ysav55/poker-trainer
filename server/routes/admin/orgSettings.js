'use strict';

const express          = require('express');
const { v4: uuidv4 }   = require('uuid');
const { requirePermission } = require('../../auth/requirePermission.js');
const SchoolRepository = require('../../db/repositories/SchoolRepository.js');
const SettingsService  = require('../../services/SettingsService.js');

const router    = express.Router();
const canManage = requirePermission('user:manage');

// ─── Hardcoded org defaults ───────────────────────────────────────────────────

const DEFAULT_BLIND_STRUCTURES = [
  { id: 'micro',  label: 'Micro',  sb: 5,   bb: 10,  ante: 0   },
  { id: 'low',    label: 'Low',    sb: 25,  bb: 50,  ante: 0   },
  { id: 'medium', label: 'Medium', sb: 100, bb: 200, ante: 25  },
  { id: 'high',   label: 'High',   sb: 500, bb: 1000,ante: 100 },
];

const DEFAULT_PLATFORM_LIMITS = {
  max_tables_per_student: 4,
  max_players_per_table:  9,
  trial_days:             7,
  trial_hand_limit:       500,
};

const DEFAULT_AUTOSPAWN = {
  enabled:              false,
  occupancy_threshold:  60,
  default_config:       'low',
};

const DEFAULT_LEADERBOARD = {
  columns:          ['hands_played', 'bb_per_100', 'vpip', 'pfr'],
  sort_by:          'bb_per_100',
  update_frequency: 'after_session',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getStructures() {
  const stored = await SettingsService.getOrgSetting('org.blind_structures');
  return stored?.structures ?? DEFAULT_BLIND_STRUCTURES;
}

async function saveStructures(structures) {
  await SettingsService.setOrgSetting('org.blind_structures', { structures });
}

// ── GET /api/admin/org-settings ───────────────────────────────────────────────
// Returns all org settings in one payload.
router.get('/org-settings', canManage, async (req, res) => {
  try {
    const [structures, limits, autospawn, leaderboard] = await Promise.all([
      getStructures(),
      SettingsService.getOrgSetting('org.platform_limits'),
      SettingsService.getOrgSetting('org.autospawn'),
      SettingsService.getOrgSetting('org.leaderboard'),
    ]);
    return res.json({
      blind_structures: structures,
      platform_limits:  { ...DEFAULT_PLATFORM_LIMITS, ...(limits ?? {}) },
      autospawn:        { ...DEFAULT_AUTOSPAWN,        ...(autospawn ?? {}) },
      leaderboard:      { ...DEFAULT_LEADERBOARD, ...(SettingsService.migrateLeaderboardConfig(leaderboard) ?? {}) },
    });
  } catch (err) {
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// ── PUT /api/admin/org-settings/limits ────────────────────────────────────────
// Body: { max_tables_per_student?, max_players_per_table?, trial_days?, trial_hand_limit? }
router.put('/org-settings/limits', canManage, async (req, res) => {
  const { max_tables_per_student, max_players_per_table, trial_days, trial_hand_limit } = req.body || {};
  try {
    const current = await SettingsService.getOrgSetting('org.platform_limits') ?? {};
    const updated = {
      ...DEFAULT_PLATFORM_LIMITS,
      ...current,
      ...(max_tables_per_student !== undefined && { max_tables_per_student: Number(max_tables_per_student) }),
      ...(max_players_per_table  !== undefined && { max_players_per_table:  Number(max_players_per_table) }),
      ...(trial_days             !== undefined && { trial_days:             Number(trial_days) }),
      ...(trial_hand_limit       !== undefined && { trial_hand_limit:       Number(trial_hand_limit) }),
    };
    await SettingsService.setOrgSetting('org.platform_limits', updated);
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// ── GET /api/admin/org-settings/blind-structures ──────────────────────────────
router.get('/org-settings/blind-structures', canManage, async (req, res) => {
  try {
    return res.json({ structures: await getStructures() });
  } catch (err) {
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// ── POST /api/admin/org-settings/blind-structures ─────────────────────────────
// Body: { label, sb, bb, ante }
router.post('/org-settings/blind-structures', canManage, async (req, res) => {
  const { label, sb, bb, ante } = req.body || {};
  if (!label || typeof label !== 'string' || label.trim().length === 0)
    return res.status(400).json({ error: 'invalid_label', message: 'label is required.' });

  try {
    const structures = await getStructures();
    const newEntry = { id: uuidv4(), label: label.trim(), sb: Number(sb) || 0, bb: Number(bb) || 0, ante: Number(ante) || 0 };
    await saveStructures([...structures, newEntry]);
    return res.status(201).json(newEntry);
  } catch (err) {
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// ── PATCH /api/admin/org-settings/blind-structures/:id ───────────────────────
// Body: { label?, sb?, bb?, ante? }
router.patch('/org-settings/blind-structures/:id', canManage, async (req, res) => {
  const { id } = req.params;
  const { label, sb, bb, ante } = req.body || {};
  try {
    const structures = await getStructures();
    const idx = structures.findIndex(s => s.id === id);
    if (idx === -1) return res.status(404).json({ error: 'not_found' });

    const updated = {
      ...structures[idx],
      ...(label !== undefined && { label: String(label).trim() }),
      ...(sb    !== undefined && { sb:    Number(sb) }),
      ...(bb    !== undefined && { bb:    Number(bb) }),
      ...(ante  !== undefined && { ante:  Number(ante) }),
    };
    structures[idx] = updated;
    await saveStructures(structures);
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// ── DELETE /api/admin/org-settings/blind-structures/:id ──────────────────────
router.delete('/org-settings/blind-structures/:id', canManage, async (req, res) => {
  const { id } = req.params;
  try {
    const structures = await getStructures();
    const filtered = structures.filter(s => s.id !== id);
    if (filtered.length === structures.length) return res.status(404).json({ error: 'not_found' });
    await saveStructures(filtered);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// ── PUT /api/admin/org-settings/autospawn ─────────────────────────────────────
// Body: { enabled?, occupancy_threshold?, default_config? }
router.put('/org-settings/autospawn', canManage, async (req, res) => {
  const { enabled, occupancy_threshold, default_config } = req.body || {};
  try {
    const current = await SettingsService.getOrgSetting('org.autospawn') ?? {};
    const updated = {
      ...DEFAULT_AUTOSPAWN,
      ...current,
      ...(enabled              !== undefined && { enabled:              Boolean(enabled) }),
      ...(occupancy_threshold  !== undefined && { occupancy_threshold:  Number(occupancy_threshold) }),
      ...(default_config       !== undefined && { default_config:       String(default_config) }),
    };
    await SettingsService.setOrgSetting('org.autospawn', updated);
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// ── PUT /api/admin/org-settings/leaderboard ───────────────────────────────────
// Body: { columns?, sort_by?, update_frequency? }
router.put('/org-settings/leaderboard', canManage, async (req, res) => {
  const { columns, sort_by, update_frequency } = req.body || {};
  const { VALID_LEADERBOARD_STATS } = SettingsService;
  try {
    const current = await SettingsService.getOrgSetting('org.leaderboard') ?? {};
    const updated = { ...DEFAULT_LEADERBOARD, ...current };

    if (columns !== undefined) {
      if (!Array.isArray(columns) || columns.length === 0 || columns.length > 8) {
        return res.status(400).json({ error: 'columns must be an array of 1-8 stat names' });
      }
      const invalid = columns.filter(c => !VALID_LEADERBOARD_STATS.includes(c));
      if (invalid.length > 0) {
        return res.status(400).json({ error: `Invalid stat names: ${invalid.join(', ')}` });
      }
      updated.columns = [...new Set(columns)];
    }
    if (sort_by !== undefined) {
      if (!VALID_LEADERBOARD_STATS.includes(sort_by)) {
        return res.status(400).json({ error: `Invalid sort_by: ${sort_by}` });
      }
      updated.sort_by = sort_by;
    }
    if (update_frequency !== undefined) {
      updated.update_frequency = String(update_frequency);
    }
    // Ensure sort_by is in columns
    if (!updated.columns.includes(updated.sort_by)) {
      updated.sort_by = updated.columns[0];
    }
    // Remove legacy fields
    delete updated.primary_metric;
    delete updated.secondary_metric;

    await SettingsService.setOrgSetting('org.leaderboard', updated);
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// ── GET /api/admin/org-settings/groups ───────────────────────────────────────
// Returns the org-level group policy defaults.
router.get('/org-settings/groups', canManage, async (req, res) => {
  try {
    const policy = await SchoolRepository.getOrgGroupPolicy();
    res.json(policy);
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// ── PUT /api/admin/org-settings/groups ───────────────────────────────────────
// Sets the org-level group policy defaults.
// Body: { enabled: bool, max_groups: int|null, max_players_per_group: int|null }
router.put('/org-settings/groups', canManage, async (req, res) => {
  try {
    const { enabled, max_groups, max_players_per_group } = req.body || {};
    await SchoolRepository.setOrgGroupPolicy(
      { enabled, max_groups, max_players_per_group },
      req.user?.stableId ?? req.user?.id ?? null,
    );
    const policy = await SchoolRepository.getOrgGroupPolicy();
    res.json(policy);
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

module.exports = router;
