'use strict';

const supabase = require('../db/supabase');

module.exports = function registerPlayerRoutes(app, { requireAuth, HandLogger }) {

  // GET /api/players/search?q=name — search players by display_name (prefix match)
  app.get('/api/players/search', requireAuth, async (req, res) => {
    const q = (req.query.q ?? '').trim();
    if (q.length < 2) return res.json({ players: [] });
    try {
      const { data, error } = await supabase
        .from('player_profiles')
        .select('id, display_name, avatar_url')
        .ilike('display_name', `${q}%`)
        .eq('is_bot', false)
        .neq('id', req.user.id)
        .order('display_name')
        .limit(10);
      if (error) throw error;
      res.json({ players: data ?? [] });
    } catch (err) {
      res.status(500).json({ error: 'search_failed' });
    }
  });

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

  // GET /api/players/:stableId/stats?mode=overall|bot|human
  app.get('/api/players/:stableId/stats', requireAuth, async (req, res) => {
    try {
      const rawMode = req.query.mode;
      const mode = ['bot', 'human', 'overall'].includes(rawMode) ? rawMode : 'overall';
      const stats = await HandLogger.getPlayerStatsByMode(req.params.stableId, mode);
      if (!stats) return res.status(404).json({ error: 'Player not found' });
      res.json(stats);
    } catch (err) {
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // GET /api/players?period=7d|30d|all&gameType=cash|tournament|all
  app.get('/api/players', requireAuth, async (req, res) => {
    try {
      const VALID_PERIODS    = ['7d', '30d', 'all'];
      const VALID_GAME_TYPES = ['cash', 'tournament', 'all'];
      const period   = VALID_PERIODS.includes(req.query.period)    ? req.query.period    : 'all';
      const gameType = VALID_GAME_TYPES.includes(req.query.gameType) ? req.query.gameType : 'all';
      const players = await HandLogger.getAllPlayersWithStats({ period, gameType });
      res.json({ players });
    } catch (err) {
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // GET /api/players/:stableId/hands?limit=&offset=&mode=overall|bot|human
  app.get('/api/players/:stableId/hands', requireAuth, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 20, 100);
      const offset = parseInt(req.query.offset) || 0;
      const rawMode = req.query.mode;
      const mode = ['bot', 'human', 'overall'].includes(rawMode) ? rawMode : 'overall';
      const hands = await HandLogger.getPlayerHands(req.params.stableId, { limit, offset, mode });
      res.json({ hands, limit, offset });
    } catch (err) {
      res.status(500).json({ error: 'internal_error' });
    }
  });
};
