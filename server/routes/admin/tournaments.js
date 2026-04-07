'use strict';

/**
 * Tournament admin routes.
 *
 * Mounted at /api/admin by server/index.js:
 *   POST   /api/admin/tournaments                    — create tournament table + config
 *
 * Also registers non-admin table-scoped routes when passed `app` (called from
 * registerTournamentRoutes exported below):
 *   GET    /api/tables/:id/tournament                — requireAuth
 *   POST   /api/tables/:id/tournament/start          — requirePermission('tournament:manage')
 */

const express = require('express');

const { requirePermission } = require('../../auth/requirePermission.js');
const { requireTournamentAccess } = require('../../auth/tournamentAuth.js');
const requireAuth            = require('../../auth/requireAuth.js');
const { requireFeature }     = require('../../auth/featureGate.js');
const { TableRepository }      = require('../../db/repositories/TableRepository.js');
const { TournamentRepository } = require('../../db/repositories/TournamentRepository.js');
const { getController }        = require('../../state/SharedState.js');
const { computeIcmPrizes }     = require('../../services/IcmService.js');

const gateTournaments = requireFeature('tournaments');

// ─── Admin sub-router (mounted at /api/admin) ────────────────────────────────

const router = express.Router();

// POST /api/admin/tournaments — create tournament table + config + registry row
router.post(
  '/tournaments',
  requireAuth,
  gateTournaments,
  requirePermission('tournament:manage'),
  async (req, res) => {
    try {
      const {
        name,
        blindSchedule     = [],
        startingStack     = 10000,
        rebuyAllowed      = false,
        rebuyLevelCap     = 0,
        scheduledFor      = null,
        // v2 wizard fields
        payoutStructure   = null,
        payoutMethod      = 'flat',
        showIcmOverlay    = false,
        dealThreshold     = 0,
        addonAllowed      = false,
        addonStack        = null,
        addonDeadlineLevel = 0,
        lateRegMinutes    = 0,
        reentryAllowed    = false,
        reentryLimit      = 0,
        reentryStack      = null,
        minPlayers        = 6,
        scheduledStartAt  = null,
        refPlayerId       = null,
      } = req.body || {};

      if (!name) return res.status(400).json({ error: 'name is required' });
      if (!Array.isArray(blindSchedule) || blindSchedule.length === 0) {
        return res.status(400).json({ error: 'blindSchedule must be a non-empty array' });
      }

      const tableId = `tournament-${Date.now()}`;
      const createdBy = req.user?.stableId ?? req.user?.id;

      await TableRepository.createTable({
        id:           tableId,
        name,
        mode:         'tournament',
        createdBy,
        config:       { starting_stack: startingStack },
        scheduledFor: scheduledFor ?? scheduledStartAt,
      });

      // Wrap subsequent inserts — if any fail, clean up the already-committed table row
      let configId, tournamentId;
      try {
        configId = await TournamentRepository.createConfig({
          tableId,
          blindSchedule,
          startingStack,
          rebuyAllowed,
          rebuyLevelCap,
          payoutStructure,
          payoutMethod,
          showIcmOverlay,
          dealThreshold,
          addonAllowed,
          addonStack,
          addonDeadlineLevel,
          lateRegMinutes,
          reentryAllowed,
          reentryLimit,
          reentryStack,
          minPlayers,
          scheduledStartAt,
        });

        // Create linked registry row in tournaments table
        tournamentId = await TournamentRepository.createLinkedTournament({
          tableId,
          name,
          blindStructure:  blindSchedule,
          startingStack,
          rebuyAllowed,
          addonAllowed,
          minPlayers,
          scheduledStartAt,
          createdBy,
        });

        // Appoint referee if provided
        if (refPlayerId) {
          const supabase = require('../../db/supabase');
          await supabase.from('tournament_referees').insert({
            table_id:     tableId,
            player_id:    refPlayerId,
            appointed_by: createdBy,
            active:       true,
          });
        }
      } catch (innerErr) {
        // Compensating rollback — remove the tables row so no orphaned card appears in lobby
        await TableRepository.deleteTable(tableId).catch(() => {});
        throw innerErr;
      }

      res.status(201).json({ tableId, configId, tournamentId });
    } catch (err) {
      res.status(500).json({ error: 'internal_error', message: err.message });
    }
  }
);

module.exports = router;

// ─── Table-scoped routes (registered directly on app) ───────────────────────

/**
 * Register /api/tables/:id/tournament routes on the Express app.
 * Called from server/index.js alongside registerTableRoutes.
 */
function registerTournamentRoutes(app) {
  // GET /api/tables/:id/tournament — config + standings
  app.get('/api/tables/:id/tournament', requireAuth, gateTournaments, async (req, res) => {
    try {
      const [config, standings] = await Promise.all([
        TournamentRepository.getConfig(req.params.id),
        TournamentRepository.getStandings(req.params.id),
      ]);

      if (!config) return res.status(404).json({ error: 'Tournament config not found' });

      // Include live management state from in-memory controller (if running)
      const ctrl = getController(req.params.id);
      const managedBy   = ctrl?.managedBy   ?? null;
      const managerName = ctrl?.managerName ?? null;

      res.json({ config, standings, managedBy, managerName });
    } catch (err) {
      res.status(500).json({ error: 'internal_error', message: err.message });
    }
  });

  // POST /api/tables/:id/tournament/start
  app.post(
    '/api/tables/:id/tournament/start',
    requireAuth,
    gateTournaments,
    requireTournamentAccess(),
    async (req, res) => {
      try {
        const config = await TournamentRepository.getConfig(req.params.id);
        if (!config) return res.status(404).json({ error: 'Tournament config not found' });

        const ctrl = getController(req.params.id);
        if (!ctrl || ctrl.getMode() !== 'tournament') {
          return res.status(400).json({
            error: 'Table is not a tournament table or controller not initialised',
          });
        }

        await ctrl.start(config);
        res.json({ started: true });
      } catch (err) {
        res.status(500).json({ error: 'internal_error', message: err.message });
      }
    }
  );

  // POST /api/tables/:id/tournament/advance-level — force-advance to next blind level
  app.post(
    '/api/tables/:id/tournament/advance-level',
    requireAuth,
    gateTournaments,
    requireTournamentAccess(),
    async (req, res) => {
      try {
        const ctrl = getController(req.params.id);
        if (!ctrl || ctrl.getMode() !== 'tournament') {
          return res.status(400).json({ error: 'Table is not a tournament table' });
        }
        await ctrl._advanceLevel();
        res.json({ advanced: true });
      } catch (err) {
        res.status(500).json({ error: 'internal_error', message: err.message });
      }
    }
  );

  // POST /api/tables/:id/tournament/end — end the tournament immediately
  app.post(
    '/api/tables/:id/tournament/end',
    requireAuth,
    gateTournaments,
    requireTournamentAccess(),
    async (req, res) => {
      try {
        const ctrl = getController(req.params.id);
        if (!ctrl || ctrl.getMode() !== 'tournament') {
          return res.status(400).json({ error: 'Table is not a tournament table' });
        }
        const state = ctrl.gm.getState ? ctrl.gm.getState() : {};
        const active = (state.seated ?? state.players ?? []).filter(p => (p.stack ?? 0) > 0);
        const winner = active.sort((a, b) => b.stack - a.stack)[0] ?? null;
        await ctrl._endTournament(winner?.id ?? null);
        res.json({ ended: true });
      } catch (err) {
        res.status(500).json({ error: 'internal_error', message: err.message });
      }
    }
  );

  // POST /api/tables/:id/tournament/pause — pause the level timer
  app.post(
    '/api/tables/:id/tournament/pause',
    requireAuth,
    gateTournaments,
    requireTournamentAccess(),
    (req, res) => {
      const ctrl = getController(req.params.id);
      if (!ctrl || ctrl.getMode() !== 'tournament') {
        return res.status(400).json({ error: 'Table is not a tournament table' });
      }
      const ok = ctrl.pause();
      res.json({ paused: ok });
    }
  );

  // POST /api/tables/:id/tournament/resume — resume after a pause
  app.post(
    '/api/tables/:id/tournament/resume',
    requireAuth,
    gateTournaments,
    requireTournamentAccess(),
    (req, res) => {
      const ctrl = getController(req.params.id);
      if (!ctrl || ctrl.getMode() !== 'tournament') {
        return res.status(400).json({ error: 'Table is not a tournament table' });
      }
      const ok = ctrl.resume();
      res.json({ resumed: ok });
    }
  );

  // POST /api/tables/:id/tournament/eliminate-player — manually eliminate a player
  app.post(
    '/api/tables/:id/tournament/eliminate-player',
    requireAuth,
    gateTournaments,
    requireTournamentAccess(),
    async (req, res) => {
      try {
        const { stableId } = req.body ?? {};
        if (!stableId) return res.status(400).json({ error: 'stableId is required' });

        const ctrl = getController(req.params.id);
        if (!ctrl || ctrl.getMode() !== 'tournament') {
          return res.status(400).json({ error: 'Table is not a tournament table' });
        }
        const result = await ctrl.eliminatePlayerManual(stableId);
        if (!result.success) return res.status(400).json({ error: result.reason });
        res.json({ eliminated: true });
      } catch (err) {
        res.status(500).json({ error: 'internal_error', message: err.message });
      }
    }
  );

  // GET /api/tables/:id/tournament/deal-proposal — compute ICM deal amounts
  app.get(
    '/api/tables/:id/tournament/deal-proposal',
    requireAuth,
    gateTournaments,
    async (req, res) => {
      try {
        const ctrl = getController(req.params.id);
        if (!ctrl || ctrl.getMode() !== 'tournament') {
          return res.status(400).json({ error: 'Table is not a tournament table' });
        }

        const config = await TournamentRepository.getConfig(req.params.id);
        if (!config) return res.status(404).json({ error: 'Tournament config not found' });

        const payout = ctrl.resolvedPayoutStructure ?? config.payout_structure ?? null;
        if (!payout) {
          return res.status(400).json({ error: 'No payout structure configured' });
        }

        const state = ctrl.gm.getState ? ctrl.gm.getState() : {};
        const activePlayers = (state.seated ?? state.players ?? [])
          .filter(p => (p.stack ?? 0) > 0)
          .map(p => ({ playerId: p.id, chips: p.stack ?? 0 }));

        if (activePlayers.length < 2) {
          return res.status(400).json({ error: 'Need at least 2 active players for a deal' });
        }

        const totalPool = (ctrl.entrantCount || activePlayers.length) *
          (config.starting_stack ?? 10000);

        const prizes = computeIcmPrizes(activePlayers, payout, totalPool);
        res.json({ prizes, totalPool, playerCount: activePlayers.length });
      } catch (err) {
        res.status(500).json({ error: 'internal_error', message: err.message });
      }
    }
  );

  // POST /api/tables/:id/tournament/deal-proposal/accept — accept ICM deal and end tournament
  app.post(
    '/api/tables/:id/tournament/deal-proposal/accept',
    requireAuth,
    gateTournaments,
    requireTournamentAccess(),
    async (req, res) => {
      try {
        const ctrl = getController(req.params.id);
        if (!ctrl || ctrl.getMode() !== 'tournament') {
          return res.status(400).json({ error: 'Table is not a tournament table' });
        }

        // Mark as a deal in config
        const supabase = require('../../db/supabase');
        await supabase
          .from('tournament_configs')
          .update({ is_deal: true })
          .eq('table_id', req.params.id);

        // End tournament — chip leader is nominal winner but all prizes are ICM-split
        const state = ctrl.gm.getState ? ctrl.gm.getState() : {};
        const active = (state.seated ?? state.players ?? []).filter(p => (p.stack ?? 0) > 0);
        const winner = active.sort((a, b) => b.stack - a.stack)[0] ?? null;
        await ctrl._endTournament(winner?.id ?? null);

        res.json({ accepted: true });
      } catch (err) {
        res.status(500).json({ error: 'internal_error', message: err.message });
      }
    }
  );
}

module.exports.registerTournamentRoutes = registerTournamentRoutes;
