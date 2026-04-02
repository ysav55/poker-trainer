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

const express = require('express');
const { requirePermission } = require('../../auth/requirePermission.js');
const CRMRepo    = require('../../db/repositories/CRMRepository.js');
const PlayerRepo = require('../../db/repositories/PlayerRepository.js');
const { computeAllSnapshots } = require('../../jobs/snapshotJob.js');

const router = express.Router();

const canView   = requirePermission('crm:view');
const canEdit   = requirePermission('crm:edit');
const canManage = requirePermission('user:manage');

// ─── Player list ──────────────────────────────────────────────────────────────

// GET /api/admin/players
// Lists all players with basic leaderboard stats. Requires crm:view.
router.get('/players', canView, async (req, res) => {
  try {
    const { status, limit, offset } = req.query;
    const players = await PlayerRepo.listPlayers({
      status: status || undefined,
      limit:  limit  ? parseInt(limit,  10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
    });
    res.json({ players });
  } catch (err) {
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

module.exports = router;
