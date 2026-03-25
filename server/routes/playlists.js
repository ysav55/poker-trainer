'use strict';

module.exports = function registerPlaylistRoutes(app, { requireAuth, requireRole, HandLogger }) {
  const requireCoachRole = requireRole('coach');

  // GET /api/playlists
  app.get('/api/playlists', requireAuth, async (req, res) => {
    try {
      const playlists = await HandLogger.getPlaylists({ tableId: req.query.tableId || null });
      res.json({ playlists });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/playlists  (coach only)
  app.post('/api/playlists', requireAuth, requireCoachRole, async (req, res) => {
    try {
      const { name, description = '', tableId = null } = req.body || {};
      if (!name) return res.status(400).json({ error: 'name is required' });
      const playlist = await HandLogger.createPlaylist({ name, description, tableId });
      res.status(201).json(playlist);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/playlists/:playlistId/hands
  app.get('/api/playlists/:playlistId/hands', requireAuth, async (req, res) => {
    try {
      const hands = await HandLogger.getPlaylistHands(req.params.playlistId);
      res.json({ hands });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/playlists/:playlistId/hands  (coach only)
  app.post('/api/playlists/:playlistId/hands', requireAuth, requireCoachRole, async (req, res) => {
    try {
      const { handId } = req.body || {};
      if (!handId) return res.status(400).json({ error: 'handId is required' });
      const entry = await HandLogger.addHandToPlaylist(req.params.playlistId, handId);
      res.status(201).json(entry);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/playlists/:playlistId/hands/:handId  (coach only)
  app.delete('/api/playlists/:playlistId/hands/:handId', requireAuth, requireCoachRole, async (req, res) => {
    try {
      await HandLogger.removeHandFromPlaylist(req.params.playlistId, req.params.handId);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/playlists/:playlistId  (coach only)
  app.delete('/api/playlists/:playlistId', requireAuth, requireCoachRole, async (req, res) => {
    try {
      await HandLogger.deletePlaylist(req.params.playlistId);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
};
