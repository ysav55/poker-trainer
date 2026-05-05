'use strict';

const requireRole = require('../auth/requireRole.js');
const requireSchool = require('../auth/requireSchool.js');
const HandRepository = require('../db/repositories/HandRepository.js');
const { streamCsv } = require('../lib/csvExport.js');
const { streamXlsx } = require('../lib/xlsxExport.js');

/**
 * Register hand export routes.
 * GET /api/exports/hands — download hands as CSV or XLSX
 *
 * @param {Object} app - Express app
 * @param {Object} deps - Dependencies { requireAuth }
 */
module.exports = function registerExportRoutes(app, { requireAuth }) {
  const coachOnly = requireRole('coach');

  /**
   * GET /api/exports/hands
   * Query params:
   *   - tableId (required): table ID to export
   *   - format (optional): 'csv' or 'xlsx' (default 'csv')
   *
   * Returns: streamed attachment (CSV or Excel file)
   * Auth: requireAuth + requireRole('coach') + requireSchool
   */
  app.get('/api/exports/hands', requireAuth, coachOnly, requireSchool, async (req, res) => {
    const { tableId, format = 'csv' } = req.query;

    // Validate inputs
    if (!tableId) {
      return res.status(400).json({ error: 'invalid_table', message: 'tableId query param is required' });
    }

    if (!['csv', 'xlsx'].includes(format)) {
      return res.status(400).json({ error: 'invalid_format', message: 'format must be "csv" or "xlsx"' });
    }

    try {
      // Fetch hands for this table (school-scoped by getHandsForExport)
      const hands = await HandRepository.getHandsForExport({
        schoolId: req.user.school_id,
        tableId,
        limit: 10000,
      });

      if (hands.length === 0) {
        return res.status(404).json({ error: 'no_hands', message: 'No hands found for this table' });
      }

      // Stream response with appropriate headers
      if (format === 'xlsx') {
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="hands-${tableId}.xlsx"`);
        await streamXlsx(res, hands);
      } else {
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="hands-${tableId}.csv"`);
        await streamCsv(res, hands);
      }
    } catch (err) {
      // If headers already sent (streaming began), can't send error response
      if (!res.headersSent) {
        res.status(500).json({ error: 'export_failed', message: err.message });
      } else {
        res.end();
      }
    }
  });
};
