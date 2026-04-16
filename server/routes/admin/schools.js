'use strict';

const express = require('express');
const { requirePermission } = require('../../auth/requirePermission.js');
const requireAuth = require('../../auth/requireAuth.js');
const requireRole = require('../../auth/requireRole.js');
const requireSchoolMembership = require('../../auth/requireSchoolMembership.js');
const {
  invalidatePlayerSchoolCache,
  invalidateSchoolFeatureCache,
} = require('../../auth/featureGate.js');
const SchoolRepository = require('../../db/repositories/SchoolRepository.js');
const log = require('../../logs/logger.js');

const router = express.Router();
const canManageSchools = requirePermission('school:manage');

// All routes in this file require school:manage (requireAuth applied at registration in server/index.js).
router.use(canManageSchools);

// ── GET /api/admin/schools ────────────────────────────────────────────────────
router.get('/schools', async (req, res) => {
  try {
    const schools = await SchoolRepository.findAll();
    res.json({ schools });
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

// ── POST /api/admin/schools ───────────────────────────────────────────────────
router.post('/schools', async (req, res) => {
  try {
    const { name, logoUrl, primaryColor, theme, maxCoaches, maxStudents } = req.body || {};
    if (!name || typeof name !== 'string' || name.trim().length < 1)
      return res.status(400).json({ error: 'name is required' });

    const school = await SchoolRepository.create({
      name:         name.trim(),
      logoUrl:      logoUrl      ?? null,
      primaryColor: primaryColor ?? null,
      theme:        theme        ?? {},
      maxCoaches:   maxCoaches   != null ? parseInt(maxCoaches, 10) : null,
      maxStudents:  maxStudents  != null ? parseInt(maxStudents, 10) : null,
      createdBy:    req.user?.stableId ?? req.user?.id ?? null,
    });
    res.status(201).json(school);
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

// ── GET /api/admin/schools/:id ────────────────────────────────────────────────
router.get('/schools/:id', async (req, res) => {
  try {
    const school = await SchoolRepository.findById(req.params.id);
    if (!school) return res.status(404).json({ error: 'not_found' });

    const [members, features] = await Promise.all([
      SchoolRepository.getMembers(req.params.id),
      SchoolRepository.getFeatures(req.params.id),
    ]);
    res.json({ ...school, members, features });
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

// ── PATCH /api/admin/schools/:id ──────────────────────────────────────────────
router.patch('/schools/:id', async (req, res) => {
  try {
    const school = await SchoolRepository.findById(req.params.id);
    if (!school) return res.status(404).json({ error: 'not_found' });

    const { name, logoUrl, primaryColor, theme, maxCoaches, maxStudents, status } = req.body || {};
    const fields = {};
    if (name         !== undefined) fields.name         = name.trim();
    if (logoUrl      !== undefined) fields.logoUrl      = logoUrl;
    if (primaryColor !== undefined) fields.primaryColor = primaryColor;
    if (theme        !== undefined) fields.theme        = theme;
    if (maxCoaches   !== undefined) fields.maxCoaches   = maxCoaches != null ? parseInt(maxCoaches, 10) : null;
    if (maxStudents  !== undefined) fields.maxStudents  = maxStudents != null ? parseInt(maxStudents, 10) : null;
    if (status       !== undefined) fields.status       = status;

    const updated = await SchoolRepository.update(
      req.params.id,
      fields,
      req.user?.stableId ?? req.user?.id ?? null,
    );
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

// ── DELETE /api/admin/schools/:id (soft delete) ───────────────────────────────
router.delete('/schools/:id', async (req, res) => {
  try {
    const school = await SchoolRepository.findById(req.params.id);
    if (!school) return res.status(404).json({ error: 'not_found' });

    await SchoolRepository.archive(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

// ── GET /api/admin/schools/:id/members ────────────────────────────────────────
router.get('/schools/:id/members', async (req, res) => {
  try {
    const members = await SchoolRepository.getMembers(req.params.id, {
      role: req.query.role || undefined,
    });
    res.json({ members });
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

// ── POST /api/admin/schools/:id/members ───────────────────────────────────────
router.post('/schools/:id/members', async (req, res) => {
  try {
    const { playerId, role } = req.body || {};
    if (!playerId) return res.status(400).json({ error: 'playerId is required' });

    const school = await SchoolRepository.findById(req.params.id);
    if (!school) return res.status(404).json({ error: 'not_found' });

    // Capacity enforcement
    const isCoach = role && ['coach', 'admin', 'superadmin'].includes(role);
    if (isCoach) {
      const ok = await SchoolRepository.canAddCoach(req.params.id);
      if (!ok) return res.status(409).json({ error: 'at_coach_limit', message: 'School has reached its coach limit.' });
    } else {
      const ok = await SchoolRepository.canAddStudent(req.params.id);
      if (!ok) return res.status(409).json({ error: 'at_student_limit', message: 'School has reached its student limit.' });
    }

    await SchoolRepository.assignPlayer(
      playerId,
      req.params.id,
      req.user?.stableId ?? req.user?.id ?? null,
    );
    invalidatePlayerSchoolCache(playerId);
    res.status(201).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

// ── DELETE /api/admin/schools/:id/members/:playerId ───────────────────────────
router.delete('/schools/:id/members/:playerId', async (req, res) => {
  try {
    await SchoolRepository.removePlayer(
      req.params.playerId,
      req.user?.stableId ?? req.user?.id ?? null,
    );
    invalidatePlayerSchoolCache(req.params.playerId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

// ── GET /api/admin/schools/:id/features ──────────────────────────────────────
router.get('/schools/:id/features', async (req, res) => {
  try {
    const school = await SchoolRepository.findById(req.params.id);
    if (!school) return res.status(404).json({ error: 'not_found' });

    const features = await SchoolRepository.getFeatures(req.params.id);
    res.json({ features });
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

// ── GET /api/admin/schools/:id/group-policy ──────────────────────────────────
router.get('/schools/:id/group-policy', async (req, res) => {
  try {
    const school = await SchoolRepository.findById(req.params.id);
    if (!school) return res.status(404).json({ error: 'not_found' });

    const policy = await SchoolRepository.getGroupPolicy(req.params.id);
    res.json(policy);
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// ── PUT /api/admin/schools/:id/group-policy ───────────────────────────────────
router.put('/schools/:id/group-policy', async (req, res) => {
  try {
    const school = await SchoolRepository.findById(req.params.id);
    if (!school) return res.status(404).json({ error: 'not_found' });

    const { enabled, max_groups, max_players_per_group } = req.body || {};
    await SchoolRepository.setGroupPolicy(
      req.params.id,
      { enabled, max_groups, max_players_per_group },
      req.user?.stableId ?? req.user?.id ?? null,
    );
    const policy = await SchoolRepository.getGroupPolicy(req.params.id);
    res.json(policy);
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// ── PUT /api/admin/schools/:id/features ──────────────────────────────────────
router.put('/schools/:id/features', async (req, res) => {
  try {
    const school = await SchoolRepository.findById(req.params.id);
    if (!school) return res.status(404).json({ error: 'not_found' });

    const featureMap = req.body || {};
    if (typeof featureMap !== 'object' || Array.isArray(featureMap))
      return res.status(400).json({ error: 'body must be a feature map object' });

    await SchoolRepository.bulkSetFeatures(
      req.params.id,
      featureMap,
      req.user?.stableId ?? req.user?.id ?? null,
    );
    invalidateSchoolFeatureCache(req.params.id);

    const updated = await SchoolRepository.getFeatures(req.params.id);
    res.json({ features: updated });
  } catch (err) {
    if (err.message?.startsWith('Unknown feature key')) {
      return res.status(400).json({ error: 'invalid_feature_key', message: err.message });
    }
    res.status(500).json({ error: 'internal_error' });
  }
});

// ── POST /api/admin/schools/:schoolId/passwords ──────────────────────────────
router.post('/:schoolId/passwords', requireAuth, requireRole('coach'), requireSchoolMembership('schoolId'), async (req, res) => {
  const { schoolId } = req.params;
  const { plainPassword, source, maxUses, expiresAt, groupId } = req.body || {};

  if (!plainPassword || plainPassword.length < 4) {
    return res.status(400).json({ error: 'invalid_password_format', message: 'Password must be at least 4 characters' });
  }
  if (maxUses !== undefined && maxUses <= 0) {
    return res.status(400).json({ error: 'invalid_max_uses', message: 'Max uses must be greater than 0' });
  }
  if (expiresAt && new Date(expiresAt) <= new Date()) {
    return res.status(400).json({ error: 'invalid_expires_at', message: 'Expiry date must be in the future' });
  }

  try {
    const SchoolPasswordService = require('../../services/SchoolPasswordService');
    const password = await SchoolPasswordService.createPassword(
      schoolId,
      plainPassword,
      { source, maxUses: maxUses || 999999, expiresAt, groupId },
      req.user.id
    );
    return res.status(201).json(password);
  } catch (err) {
    log.error('admin', 'password_create_error', `Failed to create password: ${err.message}`, { err });
    return res.status(500).json({ error: 'internal_error' });
  }
});

// ── GET /api/admin/schools/:schoolId/passwords ───────────────────────────────
router.get('/:schoolId/passwords', requireAuth, requireRole('coach'), requireSchoolMembership('schoolId'), async (req, res) => {
  const { schoolId } = req.params;

  try {
    const SchoolPasswordService = require('../../services/SchoolPasswordService');
    const passwords = await SchoolPasswordService.listPasswords(schoolId);
    return res.json({ passwords });
  } catch (err) {
    log.error('admin', 'password_list_error', `Failed to list passwords: ${err.message}`, { err });
    return res.status(500).json({ error: 'internal_error' });
  }
});

// ── PATCH /api/admin/schools/:schoolId/passwords/:passwordId ──────────────────
router.patch('/:schoolId/passwords/:passwordId', requireAuth, requireRole('coach'), requireSchoolMembership('schoolId'), async (req, res) => {
  const { schoolId, passwordId } = req.params;
  const { active } = req.body || {};

  if (typeof active !== 'boolean') {
    return res.status(400).json({ error: 'invalid_active', message: 'active must be a boolean' });
  }

  try {
    const SchoolPasswordService = require('../../services/SchoolPasswordService');
    let password;
    if (active === false) {
      password = await SchoolPasswordService.disablePassword(schoolId, passwordId);
    } else {
      // Re-enable: update active=true
      const supabase = require('../../db/supabase');
      const { data, error } = await supabase
        .from('school_passwords')
        .update({ active: true })
        .eq('id', passwordId)
        .eq('school_id', schoolId)
        .select('id, school_id, source, max_uses, uses_count, expires_at, active, group_id, created_by, created_at')
        .single();
      if (error) throw error;
      password = data;
    }
    return res.json(password);
  } catch (err) {
    log.error('admin', 'password_update_error', `Failed to update password: ${err.message}`, { err });
    return res.status(500).json({ error: 'internal_error' });
  }
});

// ── DELETE /api/admin/schools/:schoolId/passwords/:passwordId ─────────────────
router.delete('/:schoolId/passwords/:passwordId', requireAuth, requireRole('coach'), requireSchoolMembership('schoolId'), async (req, res) => {
  const { schoolId, passwordId } = req.params;

  try {
    const SchoolPasswordService = require('../../services/SchoolPasswordService');
    await SchoolPasswordService.deletePassword(schoolId, passwordId);
    return res.json({ success: true });
  } catch (err) {
    log.error('admin', 'password_delete_error', `Failed to delete password: ${err.message}`, { err });
    return res.status(500).json({ error: 'internal_error' });
  }
});

module.exports = router;
