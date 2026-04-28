'use strict';

const { requirePermission } = require('../auth/requirePermission.js');

module.exports = function registerAlphaReportRoute(app, { generateAlphaReport, log, requireAuth }) {
  app.get('/api/alpha-report', requireAuth, requirePermission('admin:access'), async (req, res) => {
    try {
      const hours = Math.min(Math.max(parseInt(req.query.hours, 10) || 72, 1), 720);
      const html = await generateAlphaReport(hours);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.send(html);
    } catch (err) {
      log.error('system', 'alpha_report_failed', 'Alpha report generation failed', { err: err.message });
      res.status(500).json({ error: 'report_failed', message: err.message });
    }
  });
};
