'use strict';

const { requirePermission } = require('../auth/requirePermission.js');
const { requireFeature } = require('../auth/featureGate');

module.exports = function registerPlaylistRoutes(app, { requireAuth, HandLogger }) {
  const canManagePlaylists = requirePermission('playlist:manage');
  const gatePlaylists = requireFeature('playlists');

  // GET /api/playlists
  app.get('/api/playlists', requireAuth, gatePlaylists, async (req, res) => {
    try {
      const playlists = await HandLogger.getPlaylists({ tableId: req.query.tableId || null });
      res.json({ playlists });
    } catch (err) {
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // POST /api/playlists  (coach only)
  app.post('/api/playlists', requireAuth, gatePlaylists, canManagePlaylists, async (req, res) => {
    try {
      const { name, description = '', tableId = null } = req.body || {};
      if (!name) return res.status(400).json({ error: 'name is required' });
      const playlist = await HandLogger.createPlaylist({ name, description, tableId });
      res.status(201).json(playlist);
    } catch (err) {
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // GET /api/playlists/:playlistId/hands
  app.get('/api/playlists/:playlistId/hands', requireAuth, gatePlaylists, async (req, res) => {
    try {
      const hands = await HandLogger.getPlaylistHands(req.params.playlistId);
      res.json({ hands });
    } catch (err) {
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // POST /api/playlists/:playlistId/hands  (coach only)
  app.post('/api/playlists/:playlistId/hands', requireAuth, gatePlaylists, canManagePlaylists, async (req, res) => {
    try {
      const { handId } = req.body || {};
      if (!handId) return res.status(400).json({ error: 'handId is required' });
      const entry = await HandLogger.addHandToPlaylist(req.params.playlistId, handId);
      res.status(201).json(entry);
    } catch (err) {
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // DELETE /api/playlists/:playlistId/hands/:handId  (coach only)
  app.delete('/api/playlists/:playlistId/hands/:handId', requireAuth, gatePlaylists, canManagePlaylists, async (req, res) => {
    try {
      await HandLogger.removeHandFromPlaylist(req.params.playlistId, req.params.handId);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // DELETE /api/playlists/:playlistId  (coach only)
  app.delete('/api/playlists/:playlistId', requireAuth, gatePlaylists, canManagePlaylists, async (req, res) => {
    try {
      await HandLogger.deletePlaylist(req.params.playlistId);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'internal_error' });
    }
  });
};
