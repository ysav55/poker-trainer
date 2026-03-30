'use strict';

const { TableRepository } = require('../db/repositories/TableRepository.js');
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

  // GET /api/tables — list non-completed tables merged with live SharedState
  app.get('/api/tables', requireAuth, async (req, res) => {
    try {
      const [dbTables, liveSummaries] = await Promise.all([
        TableRepository.listTables(),
        liveTableSummaries(),
      ]);
      const liveMap = new Map((liveSummaries || []).map(s => [s.id, s]));
      const tables = dbTables.map(t => ({
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
      const { name, mode, config = {}, scheduledFor = null } = req.body || {};
      if (!name) return res.status(400).json({ error: 'name is required' });
      const id = 'table-' + Date.now();
      await TableRepository.createTable({
        id,
        name,
        mode,
        config,
        createdBy: req.user.id,
        scheduledFor,
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
      const { name, config, scheduledFor, status } = req.body || {};
      await TableRepository.updateTable(req.params.id, { name, config, scheduledFor, status });
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
};
