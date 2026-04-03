'use strict';

/**
 * Standalone Tournament REST routes (POK-95).
 *
 * All coach-only endpoints require requireAuth + requireRole('coach').
 * Standings read requires only requireAuth.
 *
 *   POST   /api/tournaments                             — create tournament
 *   GET    /api/tournaments                             — list all (coach)
 *   GET    /api/tournaments/:id                         — detail + players + level (coach)
 *   POST   /api/tournaments/:id/register                — register player (coach)
 *   PATCH  /api/tournaments/:id/status                  — start/pause/end (coach)
 *   GET    /api/tournaments/:id/standings               — chip counts + eliminations (auth)
 *   PATCH  /api/tournaments/:id/standings/:playerId     — update standing (coach)
 *   PATCH  /api/tournaments/:id/level                   — advance blind level (coach)
 */

const { TournamentRepository } = require('../db/repositories/TournamentRepository');

const VALID_STATUSES = new Set(['pending', 'running', 'paused', 'finished']);

module.exports = function registerTournamentStandaloneRoutes(app, { requireAuth, requireRole }) {
  const coachOnly = [requireAuth, requireRole('coach')];

  // POST /api/tournaments — create tournament
  app.post('/api/tournaments', ...coachOnly, async (req, res) => {
    try {
      const {
        name,
        blindStructure = [],
        startingStack  = 10000,
        rebuyAllowed   = false,
        addonAllowed   = false,
      } = req.body ?? {};

      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'name is required' });
      }
      if (!Array.isArray(blindStructure) || blindStructure.length === 0) {
        return res.status(400).json({ error: 'blindStructure must be a non-empty array' });
      }

      const id = await TournamentRepository.createTournament({
        name: name.trim(),
        blindStructure,
        startingStack,
        rebuyAllowed,
        addonAllowed,
        createdBy: req.user.id,
      });

      res.status(201).json({ id });
    } catch (err) {
      res.status(500).json({ error: 'internal_error', message: err.message });
    }
  });

  // GET /api/tournaments — list all tournaments
  app.get('/api/tournaments', ...coachOnly, async (req, res) => {
    try {
      const tournaments = await TournamentRepository.listTournaments();
      res.json({ tournaments });
    } catch (err) {
      res.status(500).json({ error: 'internal_error', message: err.message });
    }
  });

  // GET /api/tournaments/:id — tournament detail + registered players + current level
  app.get('/api/tournaments/:id', ...coachOnly, async (req, res) => {
    try {
      const tournament = await TournamentRepository.getTournamentById(req.params.id);
      if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
      res.json(tournament);
    } catch (err) {
      res.status(500).json({ error: 'internal_error', message: err.message });
    }
  });

  // POST /api/tournaments/:id/register — register a player
  app.post('/api/tournaments/:id/register', ...coachOnly, async (req, res) => {
    try {
      const { playerId } = req.body ?? {};
      if (!playerId) return res.status(400).json({ error: 'playerId is required' });

      const tournament = await TournamentRepository.getTournamentById(req.params.id);
      if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
      if (tournament.status !== 'pending') {
        return res.status(409).json({ error: 'Cannot register players after tournament has started' });
      }

      const row = await TournamentRepository.registerPlayer(
        req.params.id,
        playerId,
        tournament.starting_stack,
      );
      res.status(201).json(row);
    } catch (err) {
      res.status(500).json({ error: 'internal_error', message: err.message });
    }
  });

  // PATCH /api/tournaments/:id/status — start, pause, or end
  app.patch('/api/tournaments/:id/status', ...coachOnly, async (req, res) => {
    try {
      const { status } = req.body ?? {};
      if (!status || !VALID_STATUSES.has(status)) {
        return res.status(400).json({
          error: 'status must be one of: pending, running, paused, finished',
        });
      }

      const tournament = await TournamentRepository.getTournamentById(req.params.id);
      if (!tournament) return res.status(404).json({ error: 'Tournament not found' });

      await TournamentRepository.updateTournamentStatus(req.params.id, status);
      res.json({ status });
    } catch (err) {
      res.status(500).json({ error: 'internal_error', message: err.message });
    }
  });

  // GET /api/tournaments/:id/standings — chip counts + eliminations (requireAuth only)
  app.get('/api/tournaments/:id/standings', requireAuth, async (req, res) => {
    try {
      const standings = await TournamentRepository.getTournamentStandings(req.params.id);
      res.json({ standings });
    } catch (err) {
      res.status(500).json({ error: 'internal_error', message: err.message });
    }
  });

  // PATCH /api/tournaments/:id/standings/:playerId — update chip count / mark eliminated
  app.patch('/api/tournaments/:id/standings/:playerId', ...coachOnly, async (req, res) => {
    try {
      const { chipCount, isEliminated, finishPosition } = req.body ?? {};
      if (chipCount === undefined && isEliminated === undefined && finishPosition === undefined) {
        return res.status(400).json({
          error: 'At least one of chipCount, isEliminated, finishPosition is required',
        });
      }

      await TournamentRepository.updatePlayerStanding(
        req.params.id,
        req.params.playerId,
        { chipCount, isEliminated, finishPosition },
      );
      res.json({ updated: true });
    } catch (err) {
      res.status(500).json({ error: 'internal_error', message: err.message });
    }
  });

  // PATCH /api/tournaments/:id/level — advance blind level
  app.patch('/api/tournaments/:id/level', ...coachOnly, async (req, res) => {
    try {
      const tournament = await TournamentRepository.getTournamentById(req.params.id);
      if (!tournament) return res.status(404).json({ error: 'Tournament not found' });

      const nextIndex = await TournamentRepository.advanceLevel(req.params.id);
      const levels = Array.isArray(tournament.blind_structure) ? tournament.blind_structure : [];
      const currentLevel = levels[nextIndex] ?? null;

      res.json({ current_level_index: nextIndex, currentLevel });
    } catch (err) {
      res.status(500).json({ error: 'internal_error', message: err.message });
    }
  });
};
