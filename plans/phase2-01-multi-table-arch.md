# Item 1: Multi-Table Architecture

**Status**: ⬜ pending
**Blocked by**: Item 3 (RBAC — table:create permission needed)
**Blocks**: Items 2, 6, 9

---

## Context

**Good news**: Multi-table is already implemented server-side. `SharedState.js` holds a
`Map<tableId, SessionManager>`. Every socket handler reads `socket.data.tableId` (455
occurrences across 43 files). `hands` and `sessions` tables both write `table_id`.
Socket.io rooms map 1:1 with `tableId`.

**What's missing**:
1. No persistent table registry — server restart loses all tables
2. No `GET /api/tables` for client discovery
3. No `POST /api/tables` for explicit table creation
4. No table metadata (name, mode, max_players)
5. No TTL cleanup for idle empty tables
6. `join_room` payload has no `tableId` field — defaults to `'main-table'`

---

## Migration 009 — Tables Registry

```sql
-- supabase/migrations/009_tables_registry.sql

CREATE TABLE tables (
  id TEXT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  mode VARCHAR(30) NOT NULL DEFAULT 'coached_cash'
    CHECK (mode IN ('coached_cash', 'uncoached_cash', 'tournament')),
  status VARCHAR(20) NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'active', 'paused', 'completed')),
  config JSONB DEFAULT '{}',
  created_by UUID REFERENCES player_profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  closed_at TIMESTAMPTZ
);

-- sessions.table_id is already a text column — add FK constraint
ALTER TABLE sessions
  ADD CONSTRAINT fk_sessions_table
  FOREIGN KEY (table_id) REFERENCES tables(id) ON DELETE SET NULL
  NOT VALID;  -- NOT VALID to avoid scanning existing rows with 'main-table' that won't match
```

**Note on NOT VALID**: existing sessions have `table_id = 'main-table'` which won't have a
matching row in `tables`. Use `NOT VALID` to skip historical rows; new sessions will be
enforced. Alternatively, insert a `'main-table'` seed row into `tables` first.

---

## New: `server/db/repositories/TableRepository.js`

```js
import { supabase } from '../supabase.js';

export const TableRepository = {
  async createTable({ id, name, mode = 'coached_cash', config = {}, createdBy }) {
    await supabase.from('tables').upsert({ id, name, mode, config, created_by: createdBy });
  },

  async getTable(id) {
    const { data } = await supabase.from('tables').select('*').eq('id', id).single();
    return data;
  },

  async listTables({ status = 'active' } = {}) {
    const { data } = await supabase
      .from('tables')
      .select('*')
      .neq('status', 'completed')
      .order('created_at', { ascending: false });
    return data ?? [];
  },

  async closeTable(id) {
    await supabase.from('tables')
      .update({ status: 'completed', closed_at: new Date().toISOString() })
      .eq('id', id);
  },

  async updateTableStatus(id, status) {
    await supabase.from('tables').update({ status }).eq('id', id);
  },
};
```

---

## SharedState.js — Add `getTableSummaries()`

```js
// Add to server/state/SharedState.js
function getTableSummaries() {
  return [...tables.entries()].map(([id, sm]) => {
    const state = sm.getState?.() ?? {};
    return {
      id,
      playerCount: state.seated?.length ?? 0,
      street: state.street ?? null,
      phase: state.phase ?? 'waiting',
    };
  });
}
// Export alongside existing exports
```

---

## New API Routes: `server/routes/tables.js`

```js
import { requireAuth } from '../auth/requireAuth.js';
import { requirePermission } from '../auth/requirePermission.js';
import { TableRepository } from '../db/repositories/TableRepository.js';
import { getTableSummaries } from '../state/SharedState.js';

// GET /api/tables — list non-completed tables with live status
router.get('/', requireAuth, async (req, res) => {
  const dbTables = await TableRepository.listTables();
  const liveSummaries = Object.fromEntries(
    getTableSummaries().map(s => [s.id, s])
  );
  const result = dbTables.map(t => ({
    ...t,
    playerCount: liveSummaries[t.id]?.playerCount ?? 0,
    street: liveSummaries[t.id]?.street ?? null,
    phase: liveSummaries[t.id]?.phase ?? 'waiting',
  }));
  res.json(result);
});

// POST /api/tables — create a new table
router.post('/', requireAuth, requirePermission('table:create'), async (req, res) => {
  const { name, mode = 'coached_cash', config = {} } = req.body;
  const id = `table-${Date.now()}`; // or nanoid()
  await TableRepository.createTable({ id, name, mode, config, createdBy: req.user.id });
  res.status(201).json({ id });
});

// GET /api/tables/:id
router.get('/:id', requireAuth, async (req, res) => {
  const table = await TableRepository.getTable(req.params.id);
  if (!table) return res.status(404).json({ error: 'Table not found' });
  const live = getTableSummaries().find(s => s.id === req.params.id);
  res.json({ ...table, ...live });
});

// DELETE /api/tables/:id
router.delete('/:id', requireAuth, requirePermission('table:manage'), async (req, res) => {
  await TableRepository.closeTable(req.params.id);
  res.status(204).send();
});
```

Register in `server/index.js`:
```js
import tablesRouter from './routes/tables.js';
app.use('/api/tables', tablesRouter);
```

---

## Socket: `join_room` Extension

In `server/socket/handlers/gameLifecycle.js` (or `joinRoom.js`):

```js
// join_room payload now optionally includes tableId
const tableId = data.tableId ?? 'main-table';
socket.data.tableId = tableId;

// Upsert table record in DB (ensure row exists for any tableId)
await TableRepository.createTable({
  id: tableId,
  name: data.tableName ?? tableId,
  mode: 'coached_cash',
  createdBy: stableIdMap.get(socket.id),
}).catch(() => {}); // ignore if already exists (upsert handles it)
```

This is additive — no existing behavior changes. `tableId` defaults to `'main-table'` for
any client that doesn't send it (backward compatible).

---

## Idle Table TTL Cleanup: `server/lifecycle/tableCleanup.js`

```js
import { tables, getRoomSockets } from '../state/SharedState.js';
import { TableRepository } from '../db/repositories/TableRepository.js';

const IDLE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
const CHECK_INTERVAL_MS = 5 * 60 * 1000;  // check every 5 minutes
const lastActivityMap = new Map();          // tableId → timestamp

export function recordTableActivity(tableId) {
  lastActivityMap.set(tableId, Date.now());
}

export function startTableCleanup(io) {
  setInterval(async () => {
    for (const [tableId] of tables.entries()) {
      const sockets = await io.in(tableId).fetchSockets();
      if (sockets.length > 0) {
        recordTableActivity(tableId);
        continue;
      }
      const lastActivity = lastActivityMap.get(tableId) ?? 0;
      if (Date.now() - lastActivity > IDLE_THRESHOLD_MS) {
        tables.delete(tableId);
        lastActivityMap.delete(tableId);
        await TableRepository.closeTable(tableId).catch(() => {});
        console.log(`[tableCleanup] Evicted idle table: ${tableId}`);
      }
    }
  }, CHECK_INTERVAL_MS);
}
```

Call `startTableCleanup(io)` in `server/index.js` after socket setup.

---

## Key Files to Read Before Implementing

- `server/state/SharedState.js` — full file (understand Map structure + exports)
- `server/socket/handlers/gameLifecycle.js` (or `joinRoom.js`) — `join_room` handler
- `server/index.js` — route registration pattern, socket setup
- `supabase/migrations/001_initial_schema.sql` — sessions table (confirm table_id text column)
- `server/lifecycle/idleTimer.js` — existing idle logic to model tableCleanup after

---

## Tests

- Unit: `TableRepository.createTable`, `listTables`, `closeTable`, `updateTableStatus`
- Unit: `SharedState.getTableSummaries()` — returns correct live status for each table
- Unit: `tableCleanup` — evicts table after 30min idle, skips active tables
- Integration: `GET /api/tables` returns DB tables merged with live SharedState status
- Integration: `POST /api/tables` — creates table in DB + returns id
- Integration: `join_room` with `tableId: 'new-room'` → table upserted in DB, SessionManager created
- Integration: `join_room` without `tableId` → defaults to 'main-table' (backward compat)
