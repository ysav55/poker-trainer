'use strict';

/**
 * Prep Brief routes
 *
 *   GET  /api/coach/students/:id/prep-brief         — return cached or generate fresh
 *   POST /api/coach/students/:id/prep-brief/refresh — force regenerate
 *
 * Both require requireAuth + requireRole('coach').
 *
 * Depends on:
 *   - POK-41: DB migration (student_baselines, alert_instances, session_prep_briefs tables)
 *   - POK-43: BaselineService (writes rolling_30d rows; required for meaningful data)
 */

const SessionPrepService = require('../services/SessionPrepService');

module.exports = function registerPrepBriefRoutes(app, { requireAuth, requireRole }) {

  // ── GET /api/coach/students/:id/prep-brief ───────────────────────────────
  app.get(
    '/api/coach/students/:id/prep-brief',
    requireAuth,
    requireRole('coach'),
    async (req, res) => {
      const coachId   = req.user.id ?? req.user.stableId;
      const studentId = req.params.id;

      try {
        const brief = await SessionPrepService.generate(coachId, studentId);
        return res.json(brief);
      } catch (err) {
        return res.status(500).json({ error: 'internal_error', message: err.message });
      }
    }
  );

  // ── POST /api/coach/students/:id/prep-brief/refresh ──────────────────────
  app.post(
    '/api/coach/students/:id/prep-brief/refresh',
    requireAuth,
    requireRole('coach'),
    async (req, res) => {
      const coachId   = req.user.id ?? req.user.stableId;
      const studentId = req.params.id;

      try {
        const brief = await SessionPrepService.refresh(coachId, studentId);
        return res.json(brief);
      } catch (err) {
        return res.status(500).json({ error: 'internal_error', message: err.message });
      }
    }
  );
};
