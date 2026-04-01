'use strict';

const { TableRepository, InvitedPlayersRepository, TablePresetsRepository } = require('../db/repositories/TableRepository.js');
const { requirePermission, getPlayerPermissions } = require('../auth/requirePermission.js');

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
  app.get('/api/tables', requireAuth, async (req, res) => {
    try {
      const [dbTables, liveSummaries] = await Promise.all([
        TableRepository.listTables(),
        liveTableSummaries(),
      ]);
      const liveMap = new Map((liveSummaries || []).map(s => [s.id, s]));
      const tables = dbTables
        .filter(t => t.mode !== 'bot_cash')
        .map(t => ({
          ...t,
          live: liveMap.get(t.id) ?? null,
        }));
      res.json({ tables });
    } catch (err) {
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // POST /api/tables — create a table
  app.post('/api/tables', requireAuth, canCreateTable, async (req, res) => {
    try {
      const { name, mode, config = {}, scheduledFor = null, privacy = 'open' } = req.body || {};
      if (!name) return res.status(400).json({ error: 'name is required' });
      const validPrivacy = ['open', 'school', 'private'];
      if (!validPrivacy.includes(privacy)) return res.status(400).json({ error: 'privacy must be open, school, or private' });
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
      });
      const table = await TableRepository.getTable(id);
      res.status(201).json(table);
    } catch (err) {
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
