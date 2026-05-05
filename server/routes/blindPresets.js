'use strict';

const { BlindPresetRepository } = require('../db/repositories/BlindPresetRepository');

module.exports = function registerBlindPresetRoutes(app, { requireAuth, requireRole }) {
  // GET /api/blind-presets
  // Returns { system: [...], school: [...] } for the caller's school.
  app.get('/api/blind-presets', requireAuth, async (req, res) => {
    try {
      const schoolId = req.user.schoolId || null;
      const result = await BlindPresetRepository.list(schoolId);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: 'internal_error', message: err.message });
    }
  });

  // GET /api/blind-presets/:id
  // Returns a single preset or 404.
  app.get('/api/blind-presets/:id', requireAuth, async (req, res) => {
    try {
      const preset = await BlindPresetRepository.getById(req.params.id);
      if (!preset) return res.status(404).json({ error: 'not_found' });
      res.json(preset);
    } catch (err) {
      res.status(500).json({ error: 'internal_error', message: err.message });
    }
  });

  // POST /api/blind-presets
  // Coach only. Creates a school-scoped preset.
  app.post('/api/blind-presets', requireAuth, requireRole('coach'), async (req, res) => {
    try {
      const { name, description, levels } = req.body || {};

      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'validation_error', message: 'name is required' });
      }
      if (!Array.isArray(levels) || levels.length === 0) {
        return res.status(400).json({ error: 'validation_error', message: 'levels must be a non-empty array' });
      }

      const preset = await BlindPresetRepository.create({
        name: name.trim(),
        description: description || null,
        levels,
        schoolId: req.user.schoolId || null,
        createdBy: req.user.stableId || null,
      });

      res.status(201).json(preset);
    } catch (err) {
      res.status(500).json({ error: 'internal_error', message: err.message });
    }
  });

  // DELETE /api/blind-presets/:id
  // Coach only. Cannot delete system presets.
  app.delete('/api/blind-presets/:id', requireAuth, requireRole('coach'), async (req, res) => {
    try {
      await BlindPresetRepository.delete(req.params.id, req.user.schoolId || null);
      res.status(204).end();
    } catch (err) {
      if (err.message === 'NOT_FOUND') return res.status(404).json({ error: 'not_found' });
      if (err.message === 'SYSTEM_PRESET') return res.status(403).json({ error: 'forbidden', message: 'Cannot delete a system preset' });
      res.status(500).json({ error: 'internal_error', message: err.message });
    }
  });
};
