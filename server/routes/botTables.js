'use strict';

/**
 * Bot Tables REST routes.
 *
 *   POST /api/bot-tables  — create a new bot_cash table (any authenticated user)
 *   GET  /api/bot-tables  — list bot tables visible to the calling user
 *
 * Requires migration 019.
 */

const { createBotTable, getBotTables } = require('../db/repositories/BotTableRepository');

const VALID_DIFFICULTIES = ['easy', 'medium', 'hard'];

module.exports = function registerBotTableRoutes(app, { requireAuth }) {
  // ── POST /api/bot-tables ──────────────────────────────────────────────────
  app.post('/api/bot-tables', requireAuth, async (req, res) => {
    const { name, difficulty, humanSeats, blinds } = req.body || {};
    const user = req.user;

    // ── Auto-generate name if not provided ────────────────────────────────────
    const resolvedName = (name && typeof name === 'string' && name.trim().length > 0)
      ? name.trim()
      : `Bot Game — ${new Date().toISOString().replace('T', ' ').slice(0, 16)}`;

    if (!VALID_DIFFICULTIES.includes(difficulty))
      return res.status(400).json({ error: 'invalid_difficulty', message: `difficulty must be one of: ${VALID_DIFFICULTIES.join(', ')}.` });

    const seats = parseInt(humanSeats, 10);
    if (!Number.isInteger(seats) || seats < 1 || seats > 8)
      return res.status(400).json({ error: 'invalid_human_seats', message: 'humanSeats must be an integer between 1 and 8.' });

    if (!blinds || typeof blinds.small !== 'number' || typeof blinds.big !== 'number'
        || blinds.small <= 0 || blinds.big <= 0 || blinds.big < blinds.small)
      return res.status(400).json({ error: 'invalid_blinds', message: 'blinds must have positive small and big values, with big >= small.' });

    try {
      const table = await createBotTable({
        name:        resolvedName,
        creatorId:   user.stableId || user.id,
        creatorRole: user.role,
        difficulty,
        humanSeats:  seats,
        blinds,
        schoolId:    user.schoolId ?? null,
      });
      return res.status(201).json({ table });
    } catch (err) {
      return res.status(500).json({ error: 'internal_error', message: 'Failed to create bot table.' });
    }
  });

  // ── GET /api/bot-tables ───────────────────────────────────────────────────
  app.get('/api/bot-tables', requireAuth, async (req, res) => {
    const user = req.user;
    try {
      const tables = await getBotTables(user.stableId || user.id, user.role);
      return res.json({ tables });
    } catch (err) {
      return res.status(500).json({ error: 'internal_error', message: 'Failed to retrieve bot tables.' });
    }
  });
};
