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
      } = req.body ?? {};

      if (!name) return res.status(400).json({ error: 'name is required' });

      const tableCount = Math.ceil(maxPlayers / maxPlayersPerTable);
      const groupId = await TournamentGroupRepository.createGroup({
        schoolId,
        name,
        sharedConfig:       { blind_schedule: blindSchedule, starting_stack: startingStack },
        maxPlayersPerTable,
        minPlayersPerTable,
        createdBy:          req.user?.stableId ?? req.user?.id,
      });

      // Create tables and link to group
      const tableIds = [];
      for (let i = 0; i < tableCount; i++) {
        const tableId = `tournament-group-${groupId}-table-${i + 1}`;
        await TableRepository.createTable({
          id:        tableId,
          name:      `${name} — Table ${i + 1}`,
          mode:      'tournament',
          createdBy: req.user?.stableId ?? req.user?.id,
          config:    { starting_stack: startingStack, tournament_group_id: groupId },
        });
        await supabase.from('tables').update({ tournament_group_id: groupId }).eq('id', tableId);
        await TournamentRepository.createConfig({
          tableId,
          blindSchedule,
          startingStack,
        });
        tableIds.push(tableId);
      }

      res.status(201).json({ groupId, tableIds });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/tournament-groups/:id
  app.get('/api/tournament-groups/:id', requireAuth, async (req, res) => {
    try {
      const group = await TournamentGroupRepository.getGroup(req.params.id);
      if (!group) return res.status(404).json({ error: 'Group not found' });
      const tableIds = await TournamentGroupRepository.getTableIds(req.params.id);
      res.json({ group, tableIds });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/tournament-groups/:id/start — start all tables in the group
  app.post('/api/tournament-groups/:id/start', requireAuth, requirePermission('tournament:manage'), async (req, res) => {
    try {
      const groupId = req.params.id;
      const group = await TournamentGroupRepository.getGroup(groupId);
      if (!group) return res.status(404).json({ error: 'Group not found' });

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
