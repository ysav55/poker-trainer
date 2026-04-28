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

// Privacy values valid for non-coach roles (players)
const PLAYER_PRIVACIES = new Set(['solo', 'open']);
// Privacy values valid for coach/admin/superadmin roles
const COACH_PRIVACIES  = new Set(['public', 'school', 'private']);

const COACH_ROLES = new Set(['coach', 'admin', 'superadmin']);

module.exports = function registerBotTableRoutes(app, { requireAuth }) {
  // ── POST /api/bot-tables ──────────────────────────────────────────────────
  app.post('/api/bot-tables', requireAuth, async (req, res) => {
    const { difficulty, privacy: rawPrivacy, blinds } = req.body || {};
    const user = req.user;

    const isCoachRole = COACH_ROLES.has(user.role);

    // ── Privacy validation and default ────────────────────────────────────────
    const defaultPrivacy = isCoachRole ? 'school' : 'solo';
    const privacy = rawPrivacy ?? defaultPrivacy;

    if (isCoachRole) {
      if (!COACH_PRIVACIES.has(privacy)) {
        return res.status(400).json({
          error: 'invalid_privacy',
          message: `privacy for coaches must be one of: ${[...COACH_PRIVACIES].join(', ')}.`,
        });
      }
    } else {
      if (!PLAYER_PRIVACIES.has(privacy)) {
        return res.status(400).json({
          error: 'invalid_privacy',
          message: `privacy must be one of: ${[...PLAYER_PRIVACIES].join(', ')}.`,
        });
      }
    }

    // ── Auto-generate name ────────────────────────────────────────────────────
    // For open/public tables use the user's display name; solo/private get timestamp.
    const isPublicish = privacy === 'open' || privacy === 'public';
    const displayName = user.displayName || user.name || user.stableId;
    const resolvedName = isPublicish
      ? `${displayName}'s table`
      : `Bot Game — ${new Date().toISOString().replace('T', ' ').slice(0, 16)}`;

    if (!VALID_DIFFICULTIES.includes(difficulty))
      return res.status(400).json({ error: 'invalid_difficulty', message: `difficulty must be one of: ${VALID_DIFFICULTIES.join(', ')}.` });

    if (!blinds || typeof blinds.small !== 'number' || typeof blinds.big !== 'number'
        || blinds.small <= 0 || blinds.big <= 0 || blinds.big < blinds.small)
      return res.status(400).json({ error: 'invalid_blinds', message: 'blinds must have positive small and big values, with big >= small.' });

    try {
      const table = await createBotTable({
        name:        resolvedName,
        creatorId:   user.stableId || user.id,
        creatorRole: user.role,
        difficulty,
        privacy,
        blinds,
        schoolId:    user.schoolId ?? null,
      });
      return res.status(201).json(table);
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
