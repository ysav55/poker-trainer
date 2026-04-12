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

function registerTournamentStandaloneRoutes(app, { requireAuth, requireRole }) {
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
}

// ─── Referee routes ───────────────────────────────────────────────────────────

function registerRefereeRoutes(app, { requireAuth }) {
  const { requirePermission } = require('../auth/requirePermission.js');
  const supabase = require('../db/supabase.js');

  // GET /api/tournaments/:tableId/referee — get active ref
  app.get('/api/tournaments/:tableId/referee', requireAuth, async (req, res) => {
    try {
      const { data } = await supabase
        .from('tournament_referees')
        .select('*, player_profiles!player_id(display_name)')
        .eq('table_id', req.params.tableId)
        .eq('active', true)
        .maybeSingle();
      res.json({ referee: data ?? null });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/tournaments/:tableId/referee — appoint/replace ref
  app.post('/api/tournaments/:tableId/referee', requireAuth, requirePermission('tournament:manage'), async (req, res) => {
    try {
      const { refPlayerId } = req.body;
      if (!refPlayerId) return res.status(400).json({ error: 'refPlayerId is required' });
      const appointerId = req.user?.stableId ?? req.user?.id;

      // Revoke existing active ref
      await supabase
        .from('tournament_referees')
        .update({ active: false, revoked_at: new Date().toISOString(), revoked_by: appointerId })
        .eq('table_id', req.params.tableId)
        .eq('active', true);

      // Insert new ref
      const { data, error } = await supabase
        .from('tournament_referees')
        .insert({
          table_id:     req.params.tableId,
          player_id:    refPlayerId,
          appointed_by: appointerId,
          active:       true,
        })
        .select('*')
        .single();
      if (error) throw error;

      res.status(201).json({ referee: data });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/tournament-refs/:refId — revoke
  app.delete('/api/tournament-refs/:refId', requireAuth, requirePermission('tournament:manage'), async (req, res) => {
    try {
      const revokerId = req.user?.stableId ?? req.user?.id;
      const { error } = await supabase
        .from('tournament_referees')
        .update({ active: false, revoked_at: new Date().toISOString(), revoked_by: revokerId })
        .eq('id', req.params.refId);
      if (error) throw error;
      res.json({ revoked: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/admin-referee-defaults
  app.get('/api/admin-referee-defaults', requireAuth, async (req, res) => {
    try {
      const adminId = req.user?.stableId ?? req.user?.id;
      const { data, error } = await supabase
        .from('admin_referee_defaults')
        .select('*, player_profiles!ref_id(display_name)')
        .eq('admin_id', adminId);
      if (error) throw error;
      res.json({ defaults: data ?? [] });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // PUT /api/admin-referee-defaults
  app.put('/api/admin-referee-defaults', requireAuth, async (req, res) => {
    try {
      const adminId = req.user?.stableId ?? req.user?.id;
      const { refId, schoolId = null } = req.body;
      if (!refId) return res.status(400).json({ error: 'refId is required' });
      const { error } = await supabase
        .from('admin_referee_defaults')
        .upsert({ admin_id: adminId, school_id: schoolId, ref_id: refId }, { onConflict: 'admin_id,school_id' });
      if (error) throw error;
      res.json({ saved: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

module.exports = registerTournamentStandaloneRoutes;
module.exports.registerTournamentStandaloneRoutes = registerTournamentStandaloneRoutes;
module.exports.registerRefereeRoutes = registerRefereeRoutes;
