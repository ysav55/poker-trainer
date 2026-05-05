'use strict';

const { TournamentGroupRepository } = require('../db/repositories/TournamentGroupRepository');
const { TournamentGroupController } = require('../game/controllers/TournamentGroupController');
const { TableRepository }           = require('../db/repositories/TableRepository');
const { TournamentRepository }      = require('../db/repositories/TournamentRepository');
const { requirePermission }         = require('../auth/requirePermission');
const SharedState                   = require('../state/SharedState');
const supabase                      = require('../db/supabase');

function registerTournamentGroupRoutes(app, { requireAuth }) {
  // POST /api/tournament-groups — create a new group
  app.post('/api/tournament-groups', requireAuth, requirePermission('tournament:manage'), async (req, res) => {
    try {
      const {
        name,
        maxPlayers         = 18,
        maxPlayersPerTable = 9,
        minPlayersPerTable = 3,
        blindSchedule      = [],
        startingStack      = 10000,
        schoolId           = null,
        buyIn              = 0,
        privacy            = 'public',
        scheduledAt        = null,
        payoutStructure    = [],
        lateRegEnabled     = false,
        lateRegMinutes     = 20,
      } = req.body ?? {};

      if (!name) return res.status(400).json({ error: 'name is required' });

      const groupId = await TournamentGroupRepository.createGroup({
        schoolId,
        name,
        sharedConfig:       { blind_schedule: blindSchedule, starting_stack: startingStack },
        maxPlayersPerTable,
        minPlayersPerTable,
        createdBy:          req.user?.stableId ?? req.user?.id,
        buyIn,
        privacy,
        scheduledAt,
        payoutStructure,
        lateRegEnabled,
        lateRegMinutes,
      });

      res.status(201).json({ groupId });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/tournament-groups — list all with optional ?status= and ?privacy= filters
  app.get('/api/tournament-groups', requireAuth, async (req, res) => {
    try {
      const { status, privacy } = req.query;
      // Non-admins can only see their own school's data — ignore schoolId query param
      const isAdmin = ['admin', 'superadmin'].includes(req.user?.role);
      const effectiveSchoolId = isAdmin ? (req.query.schoolId ?? null) : (req.user?.schoolId ?? null);
      const groups = await TournamentGroupRepository.listGroups({
        status:   status  ?? null,
        privacy:  privacy ?? null,
        schoolId: effectiveSchoolId,
      });
      res.json({ groups });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/tournament-groups/:id
  app.get('/api/tournament-groups/:id', requireAuth, async (req, res) => {
    try {
      const group         = await TournamentGroupRepository.getGroup(req.params.id);
      if (!group) return res.status(404).json({ error: 'Group not found' });
      const tableIds      = await TournamentGroupRepository.getTableIds(req.params.id);
      const registrations = await TournamentGroupRepository.getRegistrations(req.params.id);
      res.json({ group, tableIds, registrations });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/tournament-groups/:id/register — register player, debit chip bank
  app.post('/api/tournament-groups/:id/register', requireAuth, async (req, res) => {
    try {
      const groupId  = req.params.id;
      const playerId = req.user?.stableId ?? req.user?.id;
      if (!playerId) return res.status(401).json({ error: 'Unauthorized' });

      const group = await TournamentGroupRepository.getGroup(groupId);
      if (!group) return res.status(404).json({ error: 'Tournament not found' });
      if (group.status !== 'pending') return res.status(400).json({ error: 'Tournament is not open for registration' });

      const buyIn = group.buy_in ?? 0;

      // Insert registration first — DB unique constraint on (group_id, player_id) prevents duplicates
      // and eliminates the TOCTOU race between check and insert.
      let registrationId;
      try {
        registrationId = await TournamentGroupRepository.createRegistration(groupId, playerId, buyIn);
      } catch (insertErr) {
        // Unique constraint violation = already registered
        if (insertErr.code === '23505' || /unique/i.test(insertErr.message)) {
          return res.status(409).json({ error: 'Already registered' });
        }
        throw insertErr;
      }

      // Debit chip bank after successful insert
      if (buyIn > 0) {
        const { ChipBankRepository } = require('../db/repositories/ChipBankRepository');
        try {
          await ChipBankRepository.applyTransaction({
            playerId,
            amount:    -buyIn,
            type:      'tournament_entry',
            tableId:   null,
            createdBy: null,
            notes:     `Tournament entry: ${group.name}`,
          });
        } catch (err) {
          // Compensate: remove the registration we just inserted
          try { await TournamentGroupRepository.cancelRegistration(groupId, playerId); } catch (_) {}
          if (err.message === 'insufficient_funds') {
            return res.status(402).json({ error: 'Insufficient chip bank balance' });
          }
          throw err;
        }
      }

      const io = req.app.get('io');
      const registrations = await TournamentGroupRepository.getRegistrations(groupId);
      io.to(groupId).emit('tournament_group:registration_update', { groupId, count: registrations.length });

      res.status(201).json({ registered: true, buyIn });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/tournament-groups/:id/register — unregister (refund), pre-start only
  app.delete('/api/tournament-groups/:id/register', requireAuth, async (req, res) => {
    try {
      const groupId  = req.params.id;
      const playerId = req.user?.stableId ?? req.user?.id;
      if (!playerId) return res.status(401).json({ error: 'Unauthorized' });

      const group = await TournamentGroupRepository.getGroup(groupId);
      if (!group) return res.status(404).json({ error: 'Tournament not found' });
      if (group.status !== 'pending') return res.status(400).json({ error: 'Cannot unregister after tournament has started' });

      const registration = await TournamentGroupRepository.getRegistration(groupId, playerId);
      if (!registration) return res.status(404).json({ error: 'Not registered' });

      // Refund chip bank FIRST — if this fails, registration stays active (no lost funds)
      if (registration.buy_in_amount > 0) {
        const { ChipBankRepository } = require('../db/repositories/ChipBankRepository');
        await ChipBankRepository.applyTransaction({
          playerId,
          amount:    registration.buy_in_amount,
          type:      'tournament_refund',
          tableId:   null,
          createdBy: null,
          notes:     `Tournament refund: ${group.name}`,
        });
      }

      await TournamentGroupRepository.cancelRegistration(groupId, playerId);

      res.json({ unregistered: true, refunded: registration.buy_in_amount });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/tournament-groups/:id/start — start all tables in the group (legacy)
  app.post('/api/tournament-groups/:id/start', requireAuth, requirePermission('tournament:manage'), async (req, res) => {
    try {
      const groupId = req.params.id;
      const group = await TournamentGroupRepository.getGroup(groupId);
      if (!group) return res.status(404).json({ error: 'Group not found' });
      if (group.status !== 'pending') return res.status(400).json({ error: 'Tournament is not pending' });

      const tableIds = await TournamentGroupRepository.getTableIds(groupId);
      if (tableIds.length === 0) return res.status(400).json({ error: 'No tables in group' });

      const io = req.app.get('io');
      const groupCtrl = new TournamentGroupController(groupId, io);
      SharedState.groupControllers.set(groupId, groupCtrl);

      // Start group controller (manages blind timer for all tables)
      await groupCtrl.start(group.shared_config ?? {}, tableIds);

      // Start each table's TournamentController (without blind timer)
      for (const tableId of tableIds) {
        const sm = SharedState.tables.get(tableId);
        if (!sm) continue;
        const ctrl = SharedState.getOrCreateController(tableId, 'tournament', sm.gm ?? sm, io, {});
        if (ctrl.getMode() !== 'tournament') continue;
        ctrl.groupId = groupId;
        const config = await TournamentRepository.getConfig(tableId);
        if (config) await ctrl.start(config);
      }

      res.json({ started: true, tableIds });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/tournament-groups/:id/start — assign players to tables, init TournamentControllers
  app.patch('/api/tournament-groups/:id/start', requireAuth, requirePermission('tournament:manage'), async (req, res) => {
    try {
      const groupId = req.params.id;
      const group   = await TournamentGroupRepository.getGroup(groupId);
      if (!group) return res.status(404).json({ error: 'Group not found' });
      if (group.status !== 'pending') return res.status(400).json({ error: 'Tournament is not pending' });

      const registrations = await TournamentGroupRepository.getRegistrations(groupId);
      if (registrations.length < 2) return res.status(400).json({ error: 'Need at least 2 registered players to start' });

      const io = req.app.get('io');
      const groupCtrl = new TournamentGroupController(groupId, io);
      groupCtrl.config = group;
      SharedState.groupControllers.set(groupId, groupCtrl);

      const sharedConfig = group.shared_config ?? {};
      const players = registrations.map(r => ({
        playerId: r.player_id,
        name:     r.player_profiles?.display_name ?? r.player_id,
      }));

      const tableIds = await groupCtrl.assignPlayersToTables(players, {
        blindSchedule:   sharedConfig.blind_schedule   ?? [],
        startingStack:   sharedConfig.starting_stack   ?? 10000,
        lateRegEnabled:  group.late_reg_enabled ?? false,
        lateRegMinutes:  group.late_reg_minutes ?? 0,
        payoutStructure: group.payout_structure ?? [],
      });

      await groupCtrl.start(sharedConfig, tableIds);

      for (const r of registrations) {
        await TournamentGroupRepository.updateRegistrationStatus(groupId, r.player_id, 'seated');
      }

      io.to(groupId).emit('tournament_group:started', { groupId, tableIds });

      res.json({ started: true, tableIds });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/tournament-groups/:id/cancel — cancel tournament; refund all registrations
  app.patch('/api/tournament-groups/:id/cancel', requireAuth, requirePermission('tournament:manage'), async (req, res) => {
    try {
      const groupId = req.params.id;
      const group   = await TournamentGroupRepository.getGroup(groupId);
      if (!group) return res.status(404).json({ error: 'Group not found' });
      if (!['pending', 'running'].includes(group.status)) {
        return res.status(400).json({ error: 'Tournament cannot be cancelled in current state' });
      }

      const registrations = await TournamentGroupRepository.getRegistrations(groupId);
      const { ChipBankRepository } = require('../db/repositories/ChipBankRepository');

      const failedRefunds = [];

      for (const r of registrations) {
        if (!['registered', 'seated'].includes(r.status)) continue;
        if ((r.buy_in_amount ?? 0) > 0) {
          try {
            await ChipBankRepository.applyTransaction({
              playerId:  r.player_id,
              amount:    r.buy_in_amount,
              type:      'tournament_refund',
              tableId:   null,
              createdBy: null,
              notes:     `Tournament cancelled: ${group.name}`,
            });
          } catch (refundErr) {
            console.error(`[cancel] Failed to refund player ${r.player_id}:`, refundErr.message);
            failedRefunds.push(r.player_id);
            // Continue — process other refunds
          }
        }
        await TournamentGroupRepository.updateRegistrationStatus(groupId, r.player_id, 'cancelled');
      }

      // Use 'cancelled' status — distinct from 'finished' (migration 049 adds this value)
      await TournamentGroupRepository.updateStatus(groupId, 'cancelled');

      const groupCtrl = SharedState.groupControllers.get(groupId);
      if (groupCtrl) {
        groupCtrl.destroy();
        SharedState.groupControllers.delete(groupId);
      }

      const io = req.app.get('io');
      for (const r of registrations) {
        // Emit per-player buy_in_amount — individual registrations may differ
        io.to(r.player_id).emit('tournament_group:cancelled', { groupId, refundAmount: r.buy_in_amount ?? 0 });
      }

      res.json({ cancelled: true, refundedCount: registrations.length, failedRefunds });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/tournament-groups/:id/end
  app.post('/api/tournament-groups/:id/end', requireAuth, requirePermission('tournament:manage'), async (req, res) => {
    try {
      const groupCtrl = SharedState.groupControllers.get(req.params.id);
      if (!groupCtrl) return res.status(404).json({ error: 'Group controller not found' });
      await groupCtrl._endGroup(null);
      res.json({ ended: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/tournament-groups/:id/finalize — distribute prizes; close all tables
  app.post('/api/tournament-groups/:id/finalize', requireAuth, requirePermission('tournament:manage'), async (req, res) => {
    try {
      const groupId = req.params.id;
      const { finalStandings = [] } = req.body ?? {};

      const groupCtrl = SharedState.groupControllers.get(groupId);
      if (!groupCtrl) {
        await TournamentGroupRepository.updateStatus(groupId, 'finished');
        return res.json({ finalized: true });
      }

      if (finalStandings.length === 0) {
        const standings = await TournamentGroupRepository.getStandings(groupId);
        const computed = standings
          .filter(s => s.finish_position != null)
          .sort((a, b) => a.finish_position - b.finish_position)
          .map(s => ({ playerId: s.player_id, place: s.finish_position }));
        await groupCtrl.distributePrizes(computed);
      } else {
        await groupCtrl.distributePrizes(finalStandings);
      }

      res.json({ finalized: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/tournament-groups/:id/standings
  app.get('/api/tournament-groups/:id/standings', requireAuth, async (req, res) => {
    try {
      const standings = await TournamentGroupRepository.getStandings(req.params.id);
      res.json({ standings });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/tournament-groups/:id/move-player
  app.post('/api/tournament-groups/:id/move-player', requireAuth, requirePermission('tournament:manage'), async (req, res) => {
    try {
      const { playerId, fromTableId, toTableId } = req.body ?? {};
      if (!playerId || !fromTableId || !toTableId) {
        return res.status(400).json({ error: 'playerId, fromTableId, toTableId required' });
      }
      const groupCtrl = SharedState.groupControllers.get(req.params.id);
      if (!groupCtrl) return res.status(404).json({ error: 'Group controller not found — group must be started first' });
      await groupCtrl.movePlayer(playerId, fromTableId, toTableId);
      res.json({ moved: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/tournament-groups/:id/auto-balance
  app.post('/api/tournament-groups/:id/auto-balance', requireAuth, requirePermission('tournament:manage'), async (req, res) => {
    try {
      const groupCtrl = SharedState.groupControllers.get(req.params.id);
      if (!groupCtrl) return res.status(404).json({ error: 'Group controller not found — group must be started first' });
      const moves = await groupCtrl.autoBalance();
      res.json({ moves });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

module.exports = { registerTournamentGroupRoutes };
