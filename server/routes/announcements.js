'use strict';

/**
 * Announcement REST routes.
 *
 *   POST  /api/announcements            — create (coach/admin)
 *   GET   /api/announcements            — list visible to authenticated user
 *   PATCH /api/announcements/:id/read   — mark as read (own player)
 *   GET   /api/announcements/unread-count — unread badge count
 */

module.exports = function registerAnnouncementRoutes(app, { requireAuth, requireRole }) {
  const {
    createAnnouncement,
    listForPlayer,
    markRead,
    unreadCount,
  } = require('../db/repositories/AnnouncementRepository');

  // ── POST /api/announcements ──────────────────────────────────────────────────
  app.post('/api/announcements', requireAuth, requireRole('coach'), async (req, res) => {
    const { title, body, targetType = 'all', targetId = null } = req.body || {};

    if (!title || typeof title !== 'string' || title.trim().length === 0)
      return res.status(400).json({ error: 'invalid_title', message: 'title is required.' });
    if (!body || typeof body !== 'string' || body.trim().length === 0)
      return res.status(400).json({ error: 'invalid_body', message: 'body is required.' });
    if (!['all', 'group', 'individual'].includes(targetType))
      return res.status(400).json({ error: 'invalid_target_type', message: 'targetType must be all, group, or individual.' });
    if ((targetType === 'individual' || targetType === 'group') && !targetId)
      return res.status(400).json({ error: 'target_id_required', message: 'targetId is required when targetType is individual or group.' });

    const authorId = req.user.stableId || req.user.id;

    try {
      const announcement = await createAnnouncement({ authorId, targetType, targetId, title, body });
      return res.status(201).json({ announcement });
    } catch (err) {
      return res.status(500).json({ error: 'internal_error', message: 'Failed to create announcement.' });
    }
  });

  // ── GET /api/announcements/unread-count ──────────────────────────────────────
  // Must be registered before /:id routes to avoid param collision.
  app.get('/api/announcements/unread-count', requireAuth, async (req, res) => {
    const playerId = req.user.stableId || req.user.id;
    try {
      const count = await unreadCount(playerId);
      return res.json({ playerId, unreadCount: count });
    } catch (err) {
      return res.status(500).json({ error: 'internal_error', message: 'Failed to retrieve unread count.' });
    }
  });

  // ── GET /api/announcements ───────────────────────────────────────────────────
  app.get('/api/announcements', requireAuth, async (req, res) => {
    const playerId = req.user.stableId || req.user.id;
    const limit    = Math.min(parseInt(req.query.limit)  || 50, 200);
    const offset   = parseInt(req.query.offset) || 0;

    try {
      const announcements = await listForPlayer(playerId, { limit, offset });
      return res.json({ announcements, limit, offset });
    } catch (err) {
      return res.status(500).json({ error: 'internal_error', message: 'Failed to retrieve announcements.' });
    }
  });

  // ── PATCH /api/announcements/:id/read ────────────────────────────────────────
  app.patch('/api/announcements/:id/read', requireAuth, async (req, res) => {
    const { id } = req.params;
    const playerId = req.user.stableId || req.user.id;

    try {
      await markRead(id, playerId);
      return res.json({ success: true, announcementId: id, playerId });
    } catch (err) {
      return res.status(500).json({ error: 'internal_error', message: 'Failed to mark announcement as read.' });
    }
  });
};
