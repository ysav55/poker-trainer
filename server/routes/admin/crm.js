'use strict';

/**
 * server/routes/admin/crm.js
 *
 * Admin CRM API for the Player CRM feature (Phase 2 Item 8).
 * Mounted at /api/admin by server/index.js (behind requireAuth).
 *
 * Permission model:
 *   GET  routes — requirePermission('crm:view')
 *   POST/PUT     — requirePermission('crm:edit')
 *   POST /snapshots/compute — requirePermission('user:manage')  (admin-only)
 */

const bcrypt  = require('bcrypt');
const express = require('express');
const { requirePermission } = require('../../auth/requirePermission.js');
const CRMRepo    = require('../../db/repositories/CRMRepository.js');
const PlayerRepo = require('../../db/repositories/PlayerRepository.js');
const supabase   = require('../../db/supabase.js');
const { computeAllSnapshots } = require('../../jobs/snapshotJob.js');

const router = express.Router();

const canView   = requirePermission('crm:view');
const canEdit   = requirePermission('crm:edit');
const canManage = requirePermission('user:manage');

// ─── Player list ──────────────────────────────────────────────────────────────

// GET /api/admin/players
// Lists all players with basic leaderboard stats. Requires crm:view.
router.get('/players', canView, async (req, res) => {
  console.log('[CRM /players] HANDLER CALLED - permissions check passed');
  try {
    const { status, limit, offset } = req.query;
    const players = await PlayerRepo.listPlayers({
      status: status || undefined,
      limit:  limit  ? parseInt(limit,  10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
    });
    res.json({ players });
  } catch (err) {
    console.error('[crm] GET /players error:', err.message ?? err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// ─── Full CRM view ────────────────────────────────────────────────────────────

// GET /api/admin/players/:id/crm
// Full CRM summary: profile + latest session stats + tags + upcoming sessions.
router.get('/players/:id/crm', canView, async (req, res) => {
  try {
    const summary = await CRMRepo.getPlayerCRMSummary(req.params.id);
    if (!summary) return res.status(404).json({ error: 'player_not_found' });
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

// ─── Notes ────────────────────────────────────────────────────────────────────

// GET /api/admin/players/:id/notes
router.get('/players/:id/notes', canView, async (req, res) => {
  try {
    const { limit, offset } = req.query;
    const notes = await CRMRepo.getNotes(req.params.id, {
      limit:  limit  ? parseInt(limit,  10) : 20,
      offset: offset ? parseInt(offset, 10) : 0,
    });
    res.json({ notes });
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/admin/players/:id/notes
router.post('/players/:id/notes', canEdit, async (req, res) => {
  try {
    const { content, noteType = 'general' } = req.body || {};
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'content is required' });
    }
    const VALID_TYPES = ['general', 'session_review', 'goal', 'weakness'];
    if (!VALID_TYPES.includes(noteType)) {
      return res.status(400).json({ error: `noteType must be one of: ${VALID_TYPES.join(', ')}` });
    }
    const id = await CRMRepo.createNote(
      req.params.id,
      req.user.id,
      content.trim(),
      noteType
    );
    res.status(201).json({ id });
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

// ─── Tags ─────────────────────────────────────────────────────────────────────

// GET /api/admin/players/:id/tags
router.get('/players/:id/tags', canView, async (req, res) => {
  try {
    const tags = await CRMRepo.getPlayerTags(req.params.id);
    res.json({ tags });
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

// PUT /api/admin/players/:id/tags
// Replaces all tags for the player. Body: { tags: string[] }
router.put('/players/:id/tags', canEdit, async (req, res) => {
  try {
    const { tags } = req.body || {};
    if (!Array.isArray(tags)) {
      return res.status(400).json({ error: 'tags must be an array of strings' });
    }
    // Validate each tag is a non-empty string
    const sanitised = tags
      .filter(t => typeof t === 'string' && t.trim().length > 0)
      .map(t => t.trim());

    await CRMRepo.setPlayerTags(req.params.id, sanitised, req.user.id);
    res.json({ tags: sanitised });
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

// ─── Coaching Sessions ────────────────────────────────────────────────────────

// GET /api/admin/players/:id/schedule
router.get('/players/:id/schedule', canView, async (req, res) => {
  try {
    const { status } = req.query;
    const sessions = await CRMRepo.getCoachingSessions(req.params.id, {
      status: status || undefined,
    });
    res.json({ sessions });
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/admin/players/:id/schedule
router.post('/players/:id/schedule', canEdit, async (req, res) => {
  try {
    const { scheduledAt, durationMinutes = 60, notes = null } = req.body || {};
    if (!scheduledAt) {
      return res.status(400).json({ error: 'scheduledAt is required (ISO timestamp)' });
    }
    const id = await CRMRepo.createCoachingSession({
      playerId:        req.params.id,
      coachId:         req.user.id,
      scheduledAt,
      durationMinutes: parseInt(durationMinutes, 10) || 60,
      notes:           notes || null,
    });
    res.status(201).json({ id });
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

// PUT /api/admin/players/:id/schedule/:sid
router.put('/players/:id/schedule/:sid', canEdit, async (req, res) => {
  try {
    const { status } = req.body || {};
    const VALID_STATUSES = ['scheduled', 'completed', 'cancelled'];
    if (!status || !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
    }
    await CRMRepo.updateSessionStatus(req.params.sid, status);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

// ─── Snapshots ────────────────────────────────────────────────────────────────

// GET /api/admin/players/:id/snapshots
router.get('/players/:id/snapshots', canView, async (req, res) => {
  try {
    const { limit } = req.query;
    const snapshots = await CRMRepo.getSnapshots(req.params.id, {
      limit: limit ? parseInt(limit, 10) : 12,
    });
    res.json({ snapshots });
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

// GET /api/admin/players/:id/game-sessions
// Game session history for a player (from session_player_stats).
router.get('/players/:id/game-sessions', canView, async (req, res) => {
  try {
    const { limit, offset } = req.query;
    const sessions = await CRMRepo.getPlayerGameSessions(req.params.id, {
      limit:  limit  ? parseInt(limit,  10) : 20,
      offset: offset ? parseInt(offset, 10) : 0,
    });
    res.json({ sessions });
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

// PUT /api/admin/players/:id/notes/:noteId
router.put('/players/:id/notes/:noteId', canEdit, async (req, res) => {
  try {
    const { content, noteType } = req.body || {};
    if (content !== undefined && !String(content).trim()) {
      return res.status(400).json({ error: 'content cannot be empty' });
    }
    const VALID_TYPES = ['general', 'session_review', 'goal', 'weakness'];
    if (noteType !== undefined && !VALID_TYPES.includes(noteType)) {
      return res.status(400).json({ error: `noteType must be one of: ${VALID_TYPES.join(', ')}` });
    }
    await CRMRepo.updateNote(
      req.params.noteId,
      req.params.id,
      { content: content !== undefined ? String(content).trim() : undefined, noteType }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/admin/snapshots/compute
// Manually triggers snapshot computation for all active players. Admin only.
router.post('/snapshots/compute', canManage, async (req, res) => {
  try {
    // Run async — respond immediately so the HTTP request does not time out.
    computeAllSnapshots().catch(err =>
      console.error('[crm] snapshot compute error:', err.message)
    );
    res.json({ started: true });
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

// ─── Student creation ─────────────────────────────────────────────────────────

// POST /api/admin/students
// Admin creates a student account directly (no email verification needed).
// Body: { name, password, email?, role?, schoolId?, groupIds? }
router.post('/students', canEdit, async (req, res) => {
  const { name, password, email, role = 'coached_student', schoolId, groupIds = [] } = req.body || {};

  if (!name || typeof name !== 'string' || name.trim().length < 2)
    return res.status(400).json({ error: 'invalid_name', message: 'Name must be at least 2 characters.' });
  if (!password || typeof password !== 'string' || password.length < 6)
    return res.status(400).json({ error: 'invalid_password', message: 'Password must be at least 6 characters.' });
  if (email && (typeof email !== 'string' || !email.includes('@')))
    return res.status(400).json({ error: 'invalid_email', message: 'Email is not valid.' });

  const allowedRoles = ['coached_student', 'solo_student'];
  if (!allowedRoles.includes(role))
    return res.status(400).json({ error: 'invalid_role', message: `Role must be one of: ${allowedRoles.join(', ')}.` });

  try {
    // Uniqueness check
    const existing = await PlayerRepo.findByDisplayName(name.trim());
    if (existing)
      return res.status(409).json({ error: 'name_taken', message: 'That name is already registered.' });

    const passwordHash = await bcrypt.hash(password, 12);
    const createdBy    = req.user?.stableId ?? req.user?.id ?? null;

    const newId = await PlayerRepo.createPlayer({
      displayName: name.trim(),
      email:       email ? email.trim().toLowerCase() : undefined,
      passwordHash,
      createdBy,
    });

    // Assign role
    const { data: roleRow } = await supabase
      .from('roles').select('id').eq('name', role).single();
    if (roleRow?.id)
      await PlayerRepo.assignRole(newId, roleRow.id, createdBy);

    // Assign school if provided
    if (schoolId) {
      await supabase.from('player_profiles').update({ school_id: schoolId }).eq('id', newId);
    }

    // Assign groups if provided
    if (Array.isArray(groupIds) && groupIds.length > 0) {
      const rows = groupIds.map((gid) => ({ player_id: newId, group_id: gid }));
      await supabase.from('player_groups').insert(rows);
    }

    const { data: player } = await supabase
      .from('player_profiles')
      .select('id, display_name, status, created_at, email')
      .eq('id', newId)
      .single();

    res.status(201).json(player ? { ...player, role } : { id: newId, display_name: name.trim(), role, status: 'active' });
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// ─── Player groups ────────────────────────────────────────────────────────────

// GET /api/admin/players/:id/groups
router.get('/players/:id/groups', canView, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('player_groups')
      .select('group_id, added_at, groups(id, name, color, school_id)')
      .eq('player_id', req.params.id);

    if (error) throw error;
    const groups = (data ?? []).map((r) => ({ ...r.groups, added_at: r.added_at }));
    res.json({ groups });
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

module.exports = router;
