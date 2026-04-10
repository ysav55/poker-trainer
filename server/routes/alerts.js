'use strict';

/**
 * Alert REST routes
 *
 *   GET  /api/coach/alerts              — active alerts sorted by severity desc
 *   PATCH /api/coach/alerts/:id         — dismiss or mark acted_on
 *   GET  /api/coach/alerts/config       — coach's threshold configuration
 *   PUT  /api/coach/alerts/config/:alertType — update thresholds for an alert type
 *
 * All endpoints require requireAuth + requireRole('coach').
 *
 * Depends on:
 *   - POK-41: migration adding alert_instances + alert_config tables
 *   - POK-43: BaselineService (for meaningful alert data)
 */

const supabase         = require('../db/supabase');
const AlertService     = require('../services/AlertService');
const NarratorService  = require('../ai/NarratorService');

const VALID_STATUSES    = new Set(['dismissed', 'acted_on']);
const VALID_ALERT_TYPES = new Set([
  'inactivity', 'volume_drop', 'mistake_spike',
  'losing_streak', 'stat_regression', 'positive_milestone',
]);

module.exports = function registerAlertRoutes(app, { requireAuth, requireRole }) {

  // ── GET /api/coach/alerts ────────────────────────────────────────────────────
  // Returns active alerts for this coach, optionally filtered by status.
  // Generates fresh alerts on demand if ?generate=true is passed.
  app.get(
    '/api/coach/alerts',
    requireAuth,
    requireRole('coach'),
    async (req, res) => {
      const coachId = req.user.id ?? req.user.stableId;
      const status  = req.query.status ?? 'active';
      const limit   = Math.min(parseInt(req.query.limit) || 50, 200);

      try {
        if (req.query.generate === 'true') {
          const alerts    = await AlertService.generateAlerts(coachId);
          const narrative = await NarratorService.narrateAlerts(alerts).catch(() => null);
          return res.json({ alerts, narrative, generated: true });
        }

        const { data, error } = await supabase
          .from('alert_instances')
          .select('id, player_id, alert_type, severity, data, status, created_at')
          .eq('coach_id', coachId)
          .eq('status', status)
          .order('severity', { ascending: false })
          .limit(limit);

        if (error) throw error;
        return res.json({ alerts: data ?? [] });
      } catch (err) {
        return res.status(500).json({ error: 'internal_error', message: err.message });
      }
    }
  );

  // ── GET /api/admin/alerts — alias for nav badge in CRM/Lobby ───────────────
  // Same handler as /api/coach/alerts. Admin/superadmin pass requireRole('coach')
  // via hierarchy check.
  app.get(
    '/api/admin/alerts',
    requireAuth,
    requireRole('coach'),
    async (req, res) => {
      const coachId = req.user.id ?? req.user.stableId;
      const status  = req.query.status ?? 'active';
      const limit   = Math.min(parseInt(req.query.limit) || 50, 200);

      try {
        const { data, error } = await supabase
          .from('alert_instances')
          .select('id, player_id, alert_type, severity, data, status, created_at')
          .eq('coach_id', coachId)
          .eq('status', status)
          .order('severity', { ascending: false })
          .limit(limit);

        if (error) throw error;
        return res.json({ alerts: data ?? [] });
      } catch (err) {
        return res.status(500).json({ error: 'internal_error', message: err.message });
      }
    }
  );

  // ── PATCH /api/coach/alerts/:id ──────────────────────────────────────────────
  app.patch(
    '/api/coach/alerts/:id',
    requireAuth,
    requireRole('coach'),
    async (req, res) => {
      const coachId = req.user.id ?? req.user.stableId;
      const { id }  = req.params;
      const { status } = req.body ?? {};

      if (!status || !VALID_STATUSES.has(status)) {
        return res.status(400).json({
          error:   'invalid_status',
          message: 'status must be "dismissed" or "acted_on"',
        });
      }

      try {
        const update = { status };
        if (status === 'dismissed') update.dismissed_at = new Date().toISOString();
        if (status === 'acted_on')  update.acted_on_at  = new Date().toISOString();

        const { data, error } = await supabase
          .from('alert_instances')
          .update(update)
          .eq('id', id)
          .eq('coach_id', coachId)   // ensure coach can only update their own alerts
          .select('id, status')
          .maybeSingle();

        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'not_found' });

        return res.json(data);
      } catch (err) {
        return res.status(500).json({ error: 'internal_error', message: err.message });
      }
    }
  );

  // ── GET /api/coach/alerts/config ─────────────────────────────────────────────
  app.get(
    '/api/coach/alerts/config',
    requireAuth,
    requireRole('coach'),
    async (req, res) => {
      const coachId = req.user.id ?? req.user.stableId;

      try {
        const { data, error } = await supabase
          .from('alert_config')
          .select('alert_type, enabled, threshold')
          .eq('coach_id', coachId);

        if (error) throw error;

        // Merge saved config over defaults so clients always see all types.
        const savedMap = new Map((data ?? []).map(r => [r.alert_type, r]));
        const defaults = _defaultConfig();
        const result   = defaults.map(d => ({
          ...d,
          ...(savedMap.get(d.alert_type) ?? {}),
        }));

        return res.json({ config: result });
      } catch (err) {
        return res.status(500).json({ error: 'internal_error', message: err.message });
      }
    }
  );

  // ── PUT /api/coach/alerts/config/:alertType ──────────────────────────────────
  app.put(
    '/api/coach/alerts/config/:alertType',
    requireAuth,
    requireRole('coach'),
    async (req, res) => {
      const coachId   = req.user.id ?? req.user.stableId;
      const { alertType } = req.params;
      const { enabled, threshold } = req.body ?? {};

      if (!VALID_ALERT_TYPES.has(alertType)) {
        return res.status(400).json({ error: 'invalid_alert_type' });
      }

      try {
        const row = {
          coach_id:   coachId,
          alert_type: alertType,
          ...(enabled    !== undefined && { enabled }),
          ...(threshold  !== undefined && { threshold }),
        };

        const { data, error } = await supabase
          .from('alert_config')
          .upsert(row, { onConflict: 'coach_id,alert_type' })
          .select('alert_type, enabled, threshold')
          .maybeSingle();

        if (error) throw error;
        return res.json(data);
      } catch (err) {
        return res.status(500).json({ error: 'internal_error', message: err.message });
      }
    }
  );
};

// ─── Default config (returned when coach has no overrides) ───────────────────

function _defaultConfig() {
  return [
    { alert_type: 'inactivity',         enabled: true, threshold: { days: 5 } },
    { alert_type: 'volume_drop',        enabled: true, threshold: { drop_pct: 0.5 } },
    { alert_type: 'mistake_spike',      enabled: true, threshold: { spike_ratio: 1.5 } },
    { alert_type: 'losing_streak',      enabled: true, threshold: { streak_length: 3 } },
    { alert_type: 'stat_regression',    enabled: true, threshold: { z_threshold: 2.0 } },
    { alert_type: 'positive_milestone', enabled: true, threshold: null },
  ];
}
