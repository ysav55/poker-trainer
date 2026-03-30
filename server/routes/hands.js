'use strict';

module.exports = function registerHandRoutes(app, { requireAuth, HandLogger, EquityService }) {

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

  // GET /api/hands/:handId/equity
  // Computes equity at each street from recorded hole cards + board.
  // Returns: { streetEquity: { preflop, flop, turn, river }, peakEquity: { [playerId]: number } }
  app.get('/api/hands/:handId/equity', requireAuth, async (req, res) => {
    if (!EquityService) return res.status(501).json({ error: 'EquityService not available' });
    try {
      const detail = await HandLogger.getHandDetail(req.params.handId);
      if (!detail) return res.status(404).json({ error: 'Hand not found' });

      const board = detail.board || [];
      const allPlayers = (detail.players || [])
        .filter(p => Array.isArray(p.hole_cards) && p.hole_cards.length === 2)
        .map(p => ({ id: p.player_id, holeCards: p.hole_cards }));

      if (allPlayers.length < 2) return res.json({ streetEquity: {}, peakEquity: {} });

      const streetEquity = {};
      streetEquity.preflop = EquityService.computeEquity(allPlayers, []);
      if (board.length >= 3) streetEquity.flop  = EquityService.computeEquity(allPlayers, board.slice(0, 3));
      if (board.length >= 4) streetEquity.turn  = EquityService.computeEquity(allPlayers, board.slice(0, 4));
      if (board.length >= 5) streetEquity.river = EquityService.computeEquity(allPlayers, board.slice(0, 5));

      const peakEquity = {};
      Object.values(streetEquity).forEach(equities => {
        equities.forEach(({ playerId, equity }) => {
          if (peakEquity[playerId] == null || equity > peakEquity[playerId]) {
            peakEquity[playerId] = equity;
          }
        });
      });

      res.json({ streetEquity, peakEquity });
    } catch (err) {
      res.status(500).json({ error: 'internal_error' });
    }
  });
};
