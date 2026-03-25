'use strict';

module.exports = function registerSessionRoutes(app, { requireAuth, HandLogger, tables, generateHTMLReport }) {

  // GET /api/sessions/:sessionId/stats
  app.get('/api/sessions/:sessionId/stats', requireAuth, async (req, res) => {
    try {
      const stats = await HandLogger.getSessionStats(req.params.sessionId);
      res.json({ sessionId: req.params.sessionId, players: stats });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/sessions/:sessionId/report
  app.get('/api/sessions/:sessionId/report', requireAuth, async (req, res) => {
    try {
      const reportData = await HandLogger.getSessionReport(req.params.sessionId);
      if (!reportData) return res.status(404).send('Session not found');
      const html = generateHTMLReport(reportData);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; script-src 'none'");
      res.send(html);
    } catch (err) {
      res.status(500).send(`<pre>Report error: ${err.message}</pre>`);
    }
  });

  // GET /api/sessions/current — live in-memory session stats for main-table
  // IMPORTANT: this route must be registered BEFORE /api/sessions/:sessionId/stats
  // to avoid Express matching 'current' as a sessionId param.
  // In server/index.js register sessions routes BEFORE the parameterised ones.
  // Actually Express matches routes in registration order, and 'current' is a literal
  // path segment so it beats /:sessionId when registered first. Handled correctly here.
  app.get('/api/sessions/current', requireAuth, (req, res) => {
    try {
      const gm = tables.get('main-table');
      if (!gm) return res.json({ players: [] });
      const stats = gm.getSessionStats();
      res.json(stats);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
};
