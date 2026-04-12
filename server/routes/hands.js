'use strict';

module.exports = function registerHandRoutes(app, { requireAuth, HandLogger, EquityService }) {

  // GET /api/hands/tags — distinct tags for the history filter UI
  app.get('/api/hands/tags', requireAuth, async (req, res) => {
    try {
      const tags = await HandLogger.getDistinctHandTags();
      res.json({ tags });
    } catch (err) {
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // GET /api/hands/tables — distinct table IDs for the history filter UI
  app.get('/api/hands/tables', requireAuth, async (req, res) => {
    try {
      const tableIds = await HandLogger.getDistinctTableIds();
      res.json({ tableIds });
    } catch (err) {
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // GET /api/hands/history — filterable hand browser with pagination
  // Query params: playerId, tableId, startDate, endDate, tags (comma-sep),
  //               scenariosOnly, mistakesOnly, limit (max 100), offset
  app.get('/api/hands/history', requireAuth, async (req, res) => {
    try {
      const { user } = req;
      const isCoach = ['coach', 'admin', 'superadmin'].includes(user.role);

      // Students can only view their own hands
      let playerId = req.query.playerId || null;
      if (!isCoach) playerId = user.stableId;

      const tableId      = req.query.tableId   || null;
      const startDate    = req.query.startDate  || null;
      const endDate      = req.query.endDate    || null;
      const tags         = req.query.tags
        ? req.query.tags.split(',').map(t => t.trim()).filter(Boolean)
        : [];
      const scenariosOnly = req.query.scenariosOnly === 'true';
      const mistakesOnly  = req.query.mistakesOnly  === 'true';
      const limit  = Math.min(parseInt(req.query.limit)  || 25, 100);
      const offset = parseInt(req.query.offset) || 0;

      const result = await HandLogger.getHandHistory({
        playerId, tableId, startDate, endDate,
        tags, scenariosOnly, mistakesOnly,
        limit, offset,
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: 'internal_error' });
    }
  });

  /**
   * GET /api/hands — paginated hand list.
   *
   * Query params:
   *   tableId  {string?}  — filter by table ID
   *   limit    {number?}  — max results, default 20, capped at 100
   *   offset   {number?}  — pagination offset, default 0
   *
   * Response: { hands: Hand[], limit: number, offset: number }
   */
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
