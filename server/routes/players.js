'use strict';

module.exports = function registerPlayerRoutes(app, { requireAuth, HandLogger }) {

  // GET /api/players/:stableId/hover-stats  (no auth — spectators can see)
  app.get('/api/players/:stableId/hover-stats', async (req, res) => {
    try {
      const { stableId } = req.params;
      const { sessionId } = req.query;
      const stats = await HandLogger.getPlayerHoverStats(stableId, sessionId || null);
      res.json(stats);
    } catch (err) {
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // GET /api/players/:stableId/stats
  app.get('/api/players/:stableId/stats', requireAuth, async (req, res) => {
    try {
      const stats = await HandLogger.getPlayerStats(req.params.stableId);
      if (!stats) return res.status(404).json({ error: 'Player not found' });
      res.json(stats);
    } catch (err) {
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // GET /api/players
  app.get('/api/players', requireAuth, async (req, res) => {
    try {
      const players = await HandLogger.getAllPlayersWithStats();
      res.json({ players });
    } catch (err) {
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // GET /api/players/:stableId/hands
  app.get('/api/players/:stableId/hands', requireAuth, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 20, 100);
      const offset = parseInt(req.query.offset) || 0;
      const hands = await HandLogger.getPlayerHands(req.params.stableId, { limit, offset });
      res.json({ hands, limit, offset });
    } catch (err) {
      res.status(500).json({ error: 'internal_error' });
    }
  });
};
