'use strict';

const { PayoutPresetRepository } = require('../db/repositories/PayoutPresetRepository');

module.exports = function registerPayoutPresetRoutes(app, { requireAuth, requireRole }) {
  // GET /api/payout-presets
  // Returns { system: [...], school: [...] } for the caller's school.
  app.get('/api/payout-presets', requireAuth, async (req, res) => {
    try {
      const schoolId = req.user.schoolId || null;
      const result = await PayoutPresetRepository.list(schoolId);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: 'internal_error', message: err.message });
    }
  });

  // GET /api/payout-presets/:id
  // Returns a single preset or 404.
  app.get('/api/payout-presets/:id', requireAuth, async (req, res) => {
    try {
      const preset = await PayoutPresetRepository.getById(req.params.id);
      if (!preset) return res.status(404).json({ error: 'not_found' });
      res.json(preset);
    } catch (err) {
      res.status(500).json({ error: 'internal_error', message: err.message });
    }
  });

  // POST /api/payout-presets
  // Coach only. Creates a school-scoped preset.
  app.post('/api/payout-presets', requireAuth, requireRole('coach'), async (req, res) => {
    try {
      const { name, tiers } = req.body || {};

      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'validation_error', message: 'name is required' });
      }
      if (!Array.isArray(tiers) || tiers.length === 0) {
        return res.status(400).json({ error: 'validation_error', message: 'tiers must be a non-empty array' });
      }

      const preset = await PayoutPresetRepository.create({
        name: name.trim(),
        tiers,
        schoolId: req.user.schoolId || null,
        createdBy: req.user.stableId || null,
      });

      res.status(201).json(preset);
    } catch (err) {
      res.status(500).json({ error: 'internal_error', message: err.message });
    }
  });

  // DELETE /api/payout-presets/:id
  // Coach only. Cannot delete system presets.
  app.delete('/api/payout-presets/:id', requireAuth, requireRole('coach'), async (req, res) => {
    try {
      await PayoutPresetRepository.delete(req.params.id, req.user.schoolId || null);
      res.status(204).end();
    } catch (err) {
      if (err.message === 'NOT_FOUND') return res.status(404).json({ error: 'not_found' });
      if (err.message === 'SYSTEM_PRESET') return res.status(403).json({ error: 'forbidden', message: 'Cannot delete a system preset' });
      res.status(500).json({ error: 'internal_error', message: err.message });
    }
  });
};
