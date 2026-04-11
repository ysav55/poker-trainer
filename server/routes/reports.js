'use strict';

/**
 * Progress Report routes
 *
 *   GET  /api/coach/students/:id/reports          — list reports for a student
 *   GET  /api/coach/students/:id/reports/:rid     — single report with full data
 *   POST /api/coach/students/:id/reports          — generate custom report
 *   GET  /api/coach/reports/stable                — stable-wide summary
 *
 * All endpoints require requireAuth + requireRole('coach').
 *
 * Depends on:
 *   - POK-41/018: migration adding progress_reports table
 *   - POK-43: BaselineService (writes rolling_30d rows used in leak_evolution)
 */

const ProgressReportService = require('../services/ProgressReportService');
const requireStudentAssignment = require('../auth/requireStudentAssignment');

const VALID_TYPES = new Set(['weekly', 'monthly', 'custom']);

module.exports = function registerReportRoutes(app, { requireAuth, requireRole }) {

  // ── GET /api/coach/reports/stable ────────────────────────────────────────────
  // Must be registered BEFORE /:id routes to avoid ":id" capturing "stable".
  app.get(
    '/api/coach/reports/stable',
    requireAuth,
    requireRole('coach'),
    async (req, res) => {
      const coachId = req.user.id ?? req.user.stableId;
      try {
        const overview = await ProgressReportService.stableOverview(coachId);
        return res.json(overview);
      } catch (err) {
        return res.status(500).json({ error: 'internal_error', message: err.message });
      }
    }
  );

  // ── GET /api/coach/students/:id/reports ──────────────────────────────────────
  app.get(
    '/api/coach/students/:id/reports',
    requireAuth,
    requireRole('coach'),
    requireStudentAssignment,
    async (req, res) => {
      const coachId   = req.user.id ?? req.user.stableId;
      const studentId = req.studentId;
      const type      = req.query.type;
      const limit     = Math.min(parseInt(req.query.limit) || 10, 50);

      if (type && !VALID_TYPES.has(type)) {
        return res.status(400).json({ error: 'invalid_type', message: 'type must be weekly, monthly, or custom' });
      }

      try {
        const reports = await ProgressReportService.list(coachId, studentId, { type, limit });
        return res.json({ reports });
      } catch (err) {
        return res.status(500).json({ error: 'internal_error', message: err.message });
      }
    }
  );

  // ── GET /api/coach/students/:id/reports/:rid ─────────────────────────────────
  app.get(
    '/api/coach/students/:id/reports/:rid',
    requireAuth,
    requireRole('coach'),
    requireStudentAssignment,
    async (req, res) => {
      const coachId   = req.user.id ?? req.user.stableId;
      const studentId = req.studentId;
      const reportId  = req.params.rid;

      try {
        const report = await ProgressReportService.getById(coachId, studentId, reportId);
        if (!report) return res.status(404).json({ error: 'not_found' });
        return res.json(report);
      } catch (err) {
        return res.status(500).json({ error: 'internal_error', message: err.message });
      }
    }
  );

  // ── POST /api/coach/students/:id/reports ─────────────────────────────────────
  app.post(
    '/api/coach/students/:id/reports',
    requireAuth,
    requireRole('coach'),
    requireStudentAssignment,
    async (req, res) => {
      const coachId   = req.user.id ?? req.user.stableId;
      const studentId = req.studentId;
      const { period_start, period_end, type } = req.body ?? {};

      if (!period_start || !period_end) {
        return res.status(400).json({ error: 'missing_fields', message: 'period_start and period_end are required' });
      }
      if (isNaN(new Date(period_start)) || isNaN(new Date(period_end))) {
        return res.status(400).json({ error: 'invalid_dates', message: 'period_start and period_end must be valid ISO dates' });
      }
      if (type && !VALID_TYPES.has(type)) {
        return res.status(400).json({ error: 'invalid_type', message: 'type must be weekly, monthly, or custom' });
      }

      try {
        const report = await ProgressReportService.generate(coachId, studentId, period_start, period_end, type);
        return res.status(201).json(report);
      } catch (err) {
        return res.status(500).json({ error: 'internal_error', message: err.message });
      }
    }
  );
};
