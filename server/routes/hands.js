'use strict';

module.exports = function registerHandRoutes(app, { requireAuth, HandLogger }) {

  // GET /api/hands
  app.get('/api/hands', requireAuth, async (req, res) => {
    try {
      const limit  = Math.min(parseInt(req.query.limit)  || 20, 100);
      const offset = parseInt(req.query.offset) || 0;
      const tableId = req.query.tableId || null;
      const hands = await HandLogger.getHands({ tableId, limit, offset });
      res.json({ hands, limit, offset });
    } catch (err) {
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // GET /api/hands/:handId
  app.get('/api/hands/:handId', requireAuth, async (req, res) => {
    try {
      const detail = await HandLogger.getHandDetail(req.params.handId);
      if (!detail) return res.status(404).json({ error: 'Hand not found' });
      res.json(detail);
    } catch (err) {
      res.status(500).json({ error: 'internal_error' });
    }
  });
};
