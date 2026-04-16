'use strict';

const { TableRepository, InvitedPlayersRepository, TablePresetsRepository } = require('../db/repositories/TableRepository.js');
const { requirePermission, getPlayerPermissions } = require('../auth/requirePermission.js');
const TableVisibilityService = require('../services/TableVisibilityService.js');
const supabase = require('../db/supabase.js');
const log = require('../logs/logger.js');

// Attempt to load getTableSummaries defensively — it may not exist yet
let getTableSummaries;
try {
  ({ getTableSummaries } = require('../state/SharedState.js'));
} catch (_) {
  // SharedState doesn't export getTableSummaries yet; fallback defined below
}

async function liveTableSummaries() {
  try {
    if (typeof getTableSummaries === 'function') return getTableSummaries();
    return [];
  } catch (_) {
    return [];
  }
}

/**
 * Ownership guard used by PATCH and DELETE.
 * Returns the table row on success, or sends an error response and returns null.
 */
async function assertCanManage(req, res, tableId) {
  const table = await TableRepository.getTable(tableId);
  if (!table) {
    res.status(404).json({ error: 'Table not found' });
    return null;
  }
  const perms = await getPlayerPermissions(req.user.id);
  const isOwner = table.created_by === req.user.id;
  const isAdmin = perms.has('admin:access');
  if (!isOwner && !isAdmin) {
    res.status(403).json({ error: 'Not your table' });
    return null;
  }
  return table;
}

module.exports = function registerTableRoutes(app, { requireAuth }) {
  const canCreateTable = requirePermission('table:create');

  // GET /api/tables — list non-completed tables merged with live SharedState.
  // Decision (Phase 2): bot_cash tables are excluded here — they are managed
  // on GET /api/bot-tables (BotLobbyPage) to keep the main lobby clean.
  // Filters tables by visibility: open (always visible), school (same school only),
  // private (whitelisted players only).
  app.get('/api/tables', requireAuth, async (req, res) => {
    try {
      const [dbTables, liveSummaries] = await Promise.all([
        TableRepository.listTables(),
        liveTableSummaries(),
      ]);
      const liveMap = new Map((liveSummaries || []).map(s => [s.id, s]));

      // Filter tables: exclude bot_cash, then apply visibility filtering
      const visibleTables = [];
      for (const table of dbTables) {
        // Skip bot_cash tables
        if (table.mode === 'bot_cash') continue;

        // Check if player can see this table based on privacy level
        const canSee = await TableVisibilityService.canPlayerSeeTable(req.user.id, table);
        if (!canSee) continue;

        visibleTables.push({
          ...table,
          live: liveMap.get(table.id) ?? null,
        });
      }

      res.json({ tables: visibleTables });
    } catch (err) {
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // POST /api/tables — create table with school_id and privacy configuration
  app.post('/api/tables', requireAuth, canCreateTable, async (req, res) => {
    try {
      const { name, mode, config = {}, scheduledFor = null, privacy = 'school', privateConfig = {} } = req.body || {};

      if (!name) return res.status(400).json({ error: 'name_required', message: 'Table name is required' });

      // Validate privacy
      const validPrivacy = ['open', 'school', 'private'];
      if (!validPrivacy.includes(privacy)) {
        return res.status(400).json({ error: 'invalid_privacy', message: 'Privacy must be open, school, or private' });
      }

      // Check admin status for 'open' privacy
      const perms = await getPlayerPermissions(req.user.id);
      const isAdmin = perms.has('admin:access');
      if (privacy === 'open' && !isAdmin) {
        return res.status(400).json({ error: 'forbidden_privacy', message: 'Only admins can create open tables' });
      }

      // Get school_id from user
      const { data: player, error: playerError } = await supabase
        .from('player_profiles')
        .select('school_id')
        .eq('id', req.user.id)
        .single();

      if (playerError) throw playerError;

      let schoolId = null;
      if (isAdmin && privacy === 'open') {
        schoolId = null; // Open tables have no school
      } else {
        schoolId = player.school_id; // Coach: assigned to their school
      }

      // Validate private table config
      if (privacy === 'private') {
        const whitelistedPlayers = privateConfig.whitelistedPlayers || [];
        if (whitelistedPlayers.length === 0) {
          return res.status(400).json({
            error: 'invalid_private_config',
            message: 'Private tables require at least one whitelisted player'
          });
        }
      }

      // Create table
      const id = 'table-' + Date.now();
      await TableRepository.createTable({
        id,
        name,
        mode,
        config,
        createdBy: req.user.id,
        scheduledFor,
        privacy,
        controllerId: req.user.id,
        school_id: schoolId
      });

      // Add whitelisted players if private
      if (privacy === 'private') {
        const whitelistedPlayers = privateConfig.whitelistedPlayers || [];
        const groupId = privateConfig.groupId;

        // Add individual players
        for (const playerId of whitelistedPlayers) {
          await TableVisibilityService.addToWhitelist(id, playerId, req.user.id);
        }

        // Auto-add group members if groupId provided
        if (groupId) {
          await TableVisibilityService.addGroupToWhitelist(id, groupId, req.user.id);
        }
      }

      const table = await TableRepository.getTable(id);
      res.status(201).json(table);
    } catch (err) {
      log.error('tables', 'create_table_error', `Failed to create table: ${err.message}`, { err });
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // GET /api/tables/:id — get single table + live status
  app.get('/api/tables/:id', requireAuth, async (req, res) => {
    try {
      const [table, liveSummaries] = await Promise.all([
        TableRepository.getTable(req.params.id),
        liveTableSummaries(),
      ]);
      if (!table) return res.status(404).json({ error: 'Table not found' });
      const liveMap = new Map((liveSummaries || []).map(s => [s.id, s]));
      res.json({ ...table, live: liveMap.get(table.id) ?? null });
    } catch (err) {
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // PATCH /api/tables/:id — update table (ownership required)
  app.patch('/api/tables/:id', requireAuth, async (req, res) => {
    try {
      const table = await assertCanManage(req, res, req.params.id);
      if (!table) return; // response already sent
      const { name, config, scheduledFor, status, privacy } = req.body || {};
      await TableRepository.updateTable(req.params.id, { name, config, scheduledFor, status, privacy });
      const updated = await TableRepository.getTable(req.params.id);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // DELETE /api/tables/:id — close table (ownership required)
  app.delete('/api/tables/:id', requireAuth, async (req, res) => {
    try {
      const table = await assertCanManage(req, res, req.params.id);
      if (!table) return; // response already sent
      await TableRepository.closeTable(req.params.id);
      res.status(204).end();
    } catch (err) {
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // POST /api/tables/:id/controller — transfer controller to another player
  app.post('/api/tables/:id/controller', requireAuth, async (req, res) => {
    try {
      const table = await assertCanManage(req, res, req.params.id);
      if (!table) return;
      const { playerId } = req.body || {};
      if (!playerId) return res.status(400).json({ error: 'playerId is required' });
      await TableRepository.setController(req.params.id, playerId);
      res.json({ ok: true, controllerId: playerId });
    } catch (err) {
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // POST /api/tables/:id/toggle-pause — toggle pause via REST (coach/admin only)
  app.post('/api/tables/:id/toggle-pause', requireAuth, async (req, res) => {
    try {
      const COACH_ROLES = new Set(['coach', 'admin', 'superadmin']);
      if (!COACH_ROLES.has(req.user?.role)) {
        return res.status(403).json({ error: 'Only coaches can pause' });
      }
      const { tables } = require('../state/SharedState');
      const gm = tables.get(req.params.id);
      if (!gm) return res.status(404).json({ error: 'Table not active' });
      const result = gm.togglePause();
      // Broadcast state change to all connected sockets
      const io = req.app.get('io');
      if (io) {
        const room = io.sockets.adapter.rooms.get(req.params.id);
        if (room) {
          for (const socketId of room) {
            const sock = io.sockets.sockets.get(socketId);
            if (!sock) continue;
            sock.emit('game_state', gm.getPublicState(socketId, sock.data.isCoach));
          }
        }
      }
      res.json({ ok: true, paused: result.paused });
    } catch (err) {
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // GET /api/tables/:id/invited — list invited players
  app.get('/api/tables/:id/invited', requireAuth, async (req, res) => {
    try {
      const table = await assertCanManage(req, res, req.params.id);
      if (!table) return;
      const invited = await InvitedPlayersRepository.listInvited(req.params.id);
      res.json({ invited });
    } catch (err) {
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // POST /api/tables/:id/invited — add an invited player
  app.post('/api/tables/:id/invited', requireAuth, async (req, res) => {
    try {
      const table = await assertCanManage(req, res, req.params.id);
      if (!table) return;
      const { playerId } = req.body || {};
      if (!playerId) return res.status(400).json({ error: 'playerId is required' });
      await InvitedPlayersRepository.addInvite(req.params.id, playerId, req.user.id);
      res.status(201).json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // DELETE /api/tables/:id/invited/:playerId — remove an invited player
  app.delete('/api/tables/:id/invited/:playerId', requireAuth, async (req, res) => {
    try {
      const table = await assertCanManage(req, res, req.params.id);
      if (!table) return;
      await InvitedPlayersRepository.removeInvite(req.params.id, req.params.playerId);
      res.status(204).end();
    } catch (err) {
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // ── Privacy & Whitelist Management ───────────────────────────────────────────

  // PATCH /api/tables/:id/privacy — edit privacy settings after creation
  app.patch('/api/tables/:id/privacy', requireAuth, async (req, res) => {
    try {
      const table = await assertCanManage(req, res, req.params.id);
      if (!table) return; // response already sent

      const { privacy, privateConfig = {} } = req.body || {};

      // Validate privacy value
      const validPrivacy = ['open', 'school', 'private'];
      if (!validPrivacy.includes(privacy)) {
        return res.status(400).json({
          error: 'invalid_privacy',
          message: 'Privacy must be open, school, or private'
        });
      }

      // If switching to private, validate privateConfig
      if (privacy === 'private') {
        const whitelistedPlayers = privateConfig.whitelistedPlayers || [];
        if (whitelistedPlayers.length === 0) {
          return res.status(400).json({
            error: 'invalid_private_config',
            message: 'Private tables require at least one whitelisted player'
          });
        }
      }

      // Clear old whitelist if table was previously private
      if (table.privacy === 'private') {
        const oldWhitelist = await TableVisibilityService.getWhitelist(req.params.id);
        for (const entry of oldWhitelist) {
          await TableVisibilityService.removeFromWhitelist(req.params.id, entry.playerId);
        }
      }

      // Add new whitelist entries if switching to private
      if (privacy === 'private') {
        const whitelistedPlayers = privateConfig.whitelistedPlayers || [];
        const groupId = privateConfig.groupId;

        // Add individual players
        for (const playerId of whitelistedPlayers) {
          await TableVisibilityService.addToWhitelist(req.params.id, playerId, req.user.id);
        }

        // Auto-add group members if groupId provided
        if (groupId) {
          await TableVisibilityService.addGroupToWhitelist(req.params.id, groupId, req.user.id);
        }
      }

      // Update table privacy
      await TableRepository.updateTable(req.params.id, { privacy });
      const updated = await TableRepository.getTable(req.params.id);
      res.json(updated);
    } catch (err) {
      log.error('tables', 'privacy_update_error', `Failed to update privacy: ${err.message}`, { err });
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // POST /api/tables/:id/whitelist — add player to whitelist
  app.post('/api/tables/:id/whitelist', requireAuth, async (req, res) => {
    try {
      const table = await assertCanManage(req, res, req.params.id);
      if (!table) return; // response already sent

      const { playerId } = req.body || {};
      if (!playerId) {
        return res.status(400).json({
          error: 'invalid_request',
          message: 'playerId is required'
        });
      }

      // Table must be private
      if (table.privacy !== 'private') {
        return res.status(400).json({
          error: 'invalid_request',
          message: 'Table must be private to whitelist players'
        });
      }

      // Add player to whitelist
      try {
        await TableVisibilityService.addToWhitelist(req.params.id, playerId, req.user.id);
      } catch (err) {
        // Check for duplicate constraint violation
        if (err.message && err.message.includes('duplicate')) {
          return res.status(409).json({
            error: 'conflict',
            message: 'Player is already invited to this table'
          });
        }
        throw err;
      }

      // Fetch and return updated whitelist
      const whitelist = await TableVisibilityService.getWhitelist(req.params.id);
      res.status(201).json({ whitelist });
    } catch (err) {
      log.error('tables', 'whitelist_add_error', `Failed to add to whitelist: ${err.message}`, { err });
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // DELETE /api/tables/:id/whitelist/:playerId — remove player from whitelist
  app.delete('/api/tables/:id/whitelist/:playerId', requireAuth, async (req, res) => {
    try {
      const table = await assertCanManage(req, res, req.params.id);
      if (!table) return; // response already sent

      const { playerId } = req.params;

      // Remove player from whitelist
      try {
        await TableVisibilityService.removeFromWhitelist(req.params.id, playerId);
      } catch (err) {
        // Check if no rows were affected (entry not found)
        if (err.message && (err.message.includes('no rows') || err.code === 'PGRST116')) {
          return res.status(404).json({
            error: 'not_found',
            message: 'Whitelist entry not found'
          });
        }
        throw err;
      }

      res.status(204).end();
    } catch (err) {
      log.error('tables', 'whitelist_remove_error', `Failed to remove from whitelist: ${err.message}`, { err });
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // ── Table Presets ────────────────────────────────────────────────────────────

  // GET /api/table-presets — list presets for authenticated coach
  app.get('/api/table-presets', requireAuth, async (req, res) => {
    try {
      const presets = await TablePresetsRepository.list(req.user.id);
      res.json({ presets });
    } catch (err) {
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // POST /api/table-presets — save a new preset
  app.post('/api/table-presets', requireAuth, async (req, res) => {
    try {
      const { name, config = {} } = req.body || {};
      if (!name) return res.status(400).json({ error: 'name is required' });
      const { id } = await TablePresetsRepository.save({ coachId: req.user.id, name, config });
      const preset = await TablePresetsRepository.get(id);
      res.status(201).json(preset);
    } catch (err) {
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // PATCH /api/table-presets/:id — update name/config
  app.patch('/api/table-presets/:id', requireAuth, async (req, res) => {
    try {
      const { name, config } = req.body || {};
      await TablePresetsRepository.update(req.params.id, req.user.id, { name, config });
      const preset = await TablePresetsRepository.get(req.params.id);
      res.json(preset);
    } catch (err) {
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // POST /api/table-presets/:id/clone — clone a preset
  app.post('/api/table-presets/:id/clone', requireAuth, async (req, res) => {
    try {
      const { id } = await TablePresetsRepository.clone(req.params.id, req.user.id);
      const preset = await TablePresetsRepository.get(id);
      res.status(201).json(preset);
    } catch (err) {
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // DELETE /api/table-presets/:id — delete a preset
  app.delete('/api/table-presets/:id', requireAuth, async (req, res) => {
    try {
      await TablePresetsRepository.delete(req.params.id, req.user.id);
      res.status(204).end();
    } catch (err) {
      res.status(500).json({ error: 'internal_error' });
    }
  });
};
