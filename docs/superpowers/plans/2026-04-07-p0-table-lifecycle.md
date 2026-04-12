# P0 Table Lifecycle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Fix the three P0 bugs that block all table testing: bot table redirect broken, old tables persist in lobby, and regular table redirect coverage.

**Architecture:** Tables have two representations — a DB row in `tables` (source of truth for lobby) and an in-memory `GameManager` in `SharedState.tables` Map (source of truth for live play). Both must be kept in sync on table close. Navigation after table creation fires directly from the POST response (no socket dependency); the redirect is synchronous in `handleCreated`.

**Tech Stack:** Node.js/Express (server), React/Vitest (client), Jest/supertest (server tests), Supabase (DB via `server/db/repositories/TableRepository.js`)

---

## Findings Summary

| Bug | Root Cause | Files |
|-----|-----------|-------|
| Bot table no redirect | `POST /api/bot-tables` returns `{ table }` (wrapped); client does `table.id` which is `undefined` | `server/routes/botTables.js:48` |
| Bot table modal no name field | `CreateBotTableModal` has no name input; server auto-generates if missing but spec requires field | `client/src/pages/BotLobbyPage.jsx` |
| Old tables persist in lobby | `disconnect.js` deletes in-memory table on last socket leave but never calls `TableRepository.closeTable()` | `server/socket/handlers/disconnect.js:87-90` |
| Orphaned DB tables | Tables created via REST that nobody joined stay in DB forever (never in memory Map, never cleaned) | `server/lifecycle/tableCleanup.js` |
| Regular table redirect | `handleCreated` in LobbyPage looks correct; needs a test to confirm and lock in the behavior | `client/src/pages/LobbyPage.jsx:772-777` |

---

## Task 1: Fix bot table API response shape

**Files:**
- Modify: `server/routes/botTables.js` (line 48)
- Modify: `server/routes/__tests__/botTables.test.js` (line 85, 99)

- [x] **Step 1: Run the existing bot table server test to see current state**

```bash
cd c:/Users/user/poker-trainer
npx jest server/routes/__tests__/botTables.test.js --no-coverage
```

Expected: All tests pass with current (broken) wrapped response.

- [x] **Step 2: Write a failing test for the correct flat response shape**

Open `server/routes/__tests__/botTables.test.js`. Replace the test at line ~81 (`returns 201 with table on success (player)`) with:

```js
test('returns 201 with flat table object on success (player)', async () => {
  mockCurrentUser = playerUser;
  const res = await request(app).post('/api/bot-tables').send(validBody);
  expect(res.status).toBe(201);
  // Response is the table directly, NOT wrapped in { table }
  expect(res.body).toMatchObject({ id: 'tid-abc', mode: 'bot_cash' });
  expect(res.body.table).toBeUndefined();
  expect(BotTableRepo.createBotTable).toHaveBeenCalledWith(
    expect.objectContaining({
      name: 'My Bot Table',
      creatorId:   'player-1',
      creatorRole: 'player',
      difficulty:  'easy',
      humanSeats:  2,
      blinds:      { small: 5, big: 10 },
    })
  );
});
```

Also update the coach test at line ~98:
```js
test('returns 201 with flat table object on success (coach)', async () => {
  mockCurrentUser = coachUser;
  const res = await request(app).post('/api/bot-tables').send(validBody);
  expect(res.status).toBe(201);
  expect(res.body).toMatchObject({ id: 'tid-abc', mode: 'bot_cash' });
  expect(res.body.table).toBeUndefined();
  expect(BotTableRepo.createBotTable).toHaveBeenCalledWith(
    expect.objectContaining({ creatorRole: 'coach' })
  );
});
```

- [x] **Step 3: Run test to verify it fails**

```bash
npx jest server/routes/__tests__/botTables.test.js --no-coverage
```

Expected: The two updated tests FAIL with `expect(res.body.table).toBeUndefined()` failing.

- [x] **Step 4: Fix the server route**

In `server/routes/botTables.js`, change line 48:

```js
// BEFORE:
return res.status(201).json({ table });

// AFTER:
return res.status(201).json(table);
```

- [x] **Step 5: Run test to verify it passes**

```bash
npx jest server/routes/__tests__/botTables.test.js --no-coverage
```

Expected: All tests PASS.

- [x] **Step 6: Run client test to confirm no change needed**

```bash
cd c:/Users/user/poker-trainer/client
npx vitest run src/__tests__/BotLobbyPage.test.jsx
```

Expected: All tests PASS. The client test already mocks `{ id: 'bt-new' }` (flat), which now matches the real API shape.

- [x] **Step 7: Commit**

```bash
cd c:/Users/user/poker-trainer
git add server/routes/botTables.js server/routes/__tests__/botTables.test.js
git commit -m "fix(bot-tables): flatten POST /api/bot-tables response to match /api/tables shape

Fixes the bot table redirect bug: client was receiving { table: { id } }
but extracting table.id (undefined) so navigate never fired.

Consistent with POST /api/tables which returns the table row directly."
```

---

## Task 2: Add name field to bot table creation modal

**Files:**
- Modify: `client/src/pages/BotLobbyPage.jsx` (the `CreateBotTableModal` component)
- Modify: `client/src/__tests__/BotLobbyPage.test.jsx` (add name field tests)

- [x] **Step 1: Write failing tests for the name field**

Add the following tests to `client/src/__tests__/BotLobbyPage.test.jsx` inside the `'BotLobbyPage creation modal'` describe block:

```js
it('shows a table name input in the modal', async () => {
  renderPage();
  await waitFor(() => expect(screen.queryByTestId('loading-state')).toBeNull());
  fireEvent.click(screen.getByTestId('new-game-button'));
  expect(screen.getByTestId('table-name-input')).toBeTruthy();
});

it('Start Game sends name in POST body', async () => {
  mockApiFetch
    .mockResolvedValueOnce({ tables: BOT_TABLES })
    .mockResolvedValueOnce({ id: 'bt-new' });

  renderPage();
  await waitFor(() => expect(screen.queryByTestId('loading-state')).toBeNull());
  fireEvent.click(screen.getByTestId('new-game-button'));
  fireEvent.change(screen.getByTestId('table-name-input'), { target: { value: 'My Table' } });
  fireEvent.click(screen.getByTestId('modal-submit'));

  await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith(
    '/api/bot-tables',
    expect.objectContaining({
      body: expect.stringContaining('"name":"My Table"'),
    })
  ));
});
```

- [x] **Step 2: Run tests to verify they fail**

```bash
cd c:/Users/user/poker-trainer/client
npx vitest run src/__tests__/BotLobbyPage.test.jsx
```

Expected: The two new tests FAIL (`getByTestId('table-name-input')` not found).

- [x] **Step 3: Add name input to CreateBotTableModal**

In `client/src/pages/BotLobbyPage.jsx`, inside `CreateBotTableModal`, add `name` state and the input field.

After the existing `const [error, setError] = useState('');` state line, add:

```js
const [tableName, setTableName] = useState('');
```

In the `handleCreate` body, change the `apiFetch` call body to include `name`:

```js
const table = await apiFetch('/api/bot-tables', {
  method: 'POST',
  body: JSON.stringify({
    name: tableName.trim() || undefined,
    difficulty,
    humanSeats,
    blinds: { small: smallBlind, big: bigBlind },
  }),
});
```

Add the name input field in the JSX, after the `<h2>` title and before the Difficulty section:

```jsx
{/* Table name (optional) */}
<div className="flex flex-col gap-1.5">
  <label className="text-xs text-gray-500 tracking-widest uppercase">
    Table Name <span className="text-gray-600">(optional)</span>
  </label>
  <input
    type="text"
    data-testid="table-name-input"
    className="rounded-lg px-3 py-2 text-sm text-gray-100 outline-none"
    style={{ background: '#0d1117', border: '1px solid #30363d' }}
    value={tableName}
    onChange={(e) => setTableName(e.target.value)}
    placeholder="e.g. Practice Session"
    maxLength={60}
  />
</div>
```

- [x] **Step 4: Run tests to verify they pass**

```bash
cd c:/Users/user/poker-trainer/client
npx vitest run src/__tests__/BotLobbyPage.test.jsx
```

Expected: All tests PASS.

- [x] **Step 5: Commit**

```bash
cd c:/Users/user/poker-trainer
git add client/src/pages/BotLobbyPage.jsx client/src/__tests__/BotLobbyPage.test.jsx
git commit -m "feat(bot-lobby): add optional table name field to creation modal

Spec 4.2 requires a name input. Server already auto-generates if omitted."
```

---

## Task 3: Write redirect test for regular table creation (LobbyPage)

The `handleCreated` callback in LobbyPage looks correct in source, but no test covers this flow. This task locks it in so regressions are caught.

**Files:**
- Create: `client/src/__tests__/LobbyPage.test.jsx`

- [x] **Step 1: Create the test file**

Create `client/src/__tests__/LobbyPage.test.jsx`:

```jsx
/**
 * LobbyPage.test.jsx
 *
 * Covers:
 *  - Table creation modal submit → POST /api/tables → navigate to /table/:id
 *  - CreateTableModal opens and closes
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../contexts/AuthContext.jsx', () => ({
  useAuth: () => ({
    user: { id: 'coach-1', role: 'coach' },
    hasPermission: () => true,
  }),
}));

vi.mock('../contexts/LobbyContext.jsx', () => ({
  useLobby: () => ({
    activeTables: [],
    refreshTables: vi.fn(),
  }),
}));

const mockApiFetch = vi.fn();
vi.mock('../lib/api.js', () => ({
  apiFetch: (...args) => mockApiFetch(...args),
}));

// WizardModal is a large component — stub it out
vi.mock('./admin/TournamentSetup.jsx', () => ({
  WizardModal: () => null,
}));

import LobbyPage from '../pages/LobbyPage.jsx';

function renderPage() {
  return render(
    <MemoryRouter>
      <LobbyPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: all data fetches return empty
  mockApiFetch.mockResolvedValue({});
});

// ── Table creation redirect ────────────────────────────────────────────────────

describe('LobbyPage — table creation redirect', () => {
  it('navigates to /table/:id immediately after POST returns table id', async () => {
    // POST /api/tables returns the table row with id directly (NOT wrapped)
    mockApiFetch.mockImplementation((path, opts) => {
      if (opts?.method === 'POST' && path === '/api/tables') {
        return Promise.resolve({ id: 'table-abc123', name: 'Test Table', mode: 'coached_cash' });
      }
      return Promise.resolve({});
    });

    renderPage();

    // Open the create table modal — find NewTableCard button or equivalent
    const newTableBtn = await waitFor(() => screen.getByText(/\+ New Table/i));
    fireEvent.click(newTableBtn);

    // Fill in required name field
    const nameInput = await waitFor(() => screen.getByPlaceholderText(/e.g. Main Table/i));
    fireEvent.change(nameInput, { target: { value: 'Test Table' } });

    // Submit
    const createBtn = screen.getByText(/^Create$/i);
    fireEvent.click(createBtn);

    // Navigate must fire immediately with the id from the POST response
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/table/table-abc123');
    });
  });

  it('does NOT navigate if POST returns no id', async () => {
    mockApiFetch.mockImplementation((path, opts) => {
      if (opts?.method === 'POST' && path === '/api/tables') {
        return Promise.resolve({}); // no id field
      }
      return Promise.resolve({});
    });

    renderPage();

    const newTableBtn = await waitFor(() => screen.getByText(/\+ New Table/i));
    fireEvent.click(newTableBtn);

    const nameInput = await waitFor(() => screen.getByPlaceholderText(/e.g. Main Table/i));
    fireEvent.change(nameInput, { target: { value: 'Test Table' } });

    fireEvent.click(screen.getByText(/^Create$/i));

    // Wait a tick then assert navigate was NOT called with a table path
    await new Promise(r => setTimeout(r, 50));
    expect(mockNavigate).not.toHaveBeenCalledWith(expect.stringMatching(/^\/table\//));
  });
});
```

- [x] **Step 2: Run the test**

```bash
cd c:/Users/user/poker-trainer/client
npx vitest run src/__tests__/LobbyPage.test.jsx
```

Expected: Both tests PASS (confirming the redirect works). If the first test FAILS, the redirect is broken — read the failure output and debug `handleCreated` in `LobbyPage.jsx`.

- [x] **Step 3: Commit**

```bash
cd c:/Users/user/poker-trainer
git add client/src/__tests__/LobbyPage.test.jsx
git commit -m "test(lobby): add redirect-on-table-creation coverage

Confirms that POST /api/tables response id drives navigation directly
without depending on socket events."
```

---

## Task 4: Fix old tables persisting — disconnect path

When the last socket disconnects from a room, the table is removed from in-memory but **not** marked completed in the DB. The lobby (which polls DB) continues showing it.

**Files:**
- Modify: `server/socket/handlers/disconnect.js` (lines 86–90)

- [x] **Step 1: Write a targeted unit test for the disconnect cleanup**

Create `server/tests/disconnectTableCleanup.test.js`:

```js
'use strict';

/**
 * Verifies that when the last socket leaves a table,
 * the table is closed in the DB (TableRepository.closeTable is called).
 */

jest.mock('../db/repositories/TableRepository.js', () => ({
  TableRepository: {
    closeTable: jest.fn().mockResolvedValue(undefined),
  },
}));

const { TableRepository } = require('../db/repositories/TableRepository.js');

// Build minimal ctx to invoke the disconnect handler
function buildCtx(overrides = {}) {
  const io = {
    to: jest.fn().mockReturnThis(),
    emit: jest.fn(),
    sockets: {
      adapter: {
        rooms: new Map(),
      },
    },
  };
  const tables = new Map();
  const stableIdMap = new Map();
  const reconnectTimers = new Map();
  const ghostStacks = new Map();
  return {
    io,
    tables,
    stableIdMap,
    reconnectTimers,
    ghostStacks,
    broadcastState: jest.fn(),
    clearActionTimer: jest.fn(),
    log: { info: jest.fn(), error: jest.fn(), trackSocket: jest.fn() },
    ...overrides,
  };
}

function buildSocket(overrides = {}) {
  const listeners = {};
  return {
    id: 'socket-1',
    on: (event, cb) => { listeners[event] = cb; },
    _emit: (event) => { if (listeners[event]) listeners[event](); },
    data: { tableId: 'table-1', name: 'Alice', isCoach: false, isSpectator: false, stableId: 'player-1' },
    ...overrides,
  };
}

test('closeTable is called when last socket leaves the room', (done) => {
  const ctx = buildCtx();
  const socket = buildSocket();

  // Set up a table with a player in it
  const gm = {
    sessionId: 'session-1',
    state: { players: [{ id: 'socket-1', stack: 1000, is_coach: false }], paused: false, current_turn: null },
    setPlayerDisconnected: jest.fn(),
    removePlayer: jest.fn(),
  };
  ctx.tables.set('table-1', gm);

  // Room has NO other sockets (this IS the last one)
  ctx.io.sockets.adapter.rooms.set('table-1', new Set()); // empty after disconnect

  require('./registerDisconnect')(socket, ctx);
  socket._emit('disconnect');

  // TTL is 60s — use jest fake timers to advance
  jest.useFakeTimers();

  // Re-run the disconnect handler (handlers registered in beforeEach)
  // advance past the 60s TTL
  setTimeout(() => {
    jest.runAllTimers();
    jest.useRealTimers();

    // After TTL, TableRepository.closeTable should have been called
    setImmediate(() => {
      expect(TableRepository.closeTable).toHaveBeenCalledWith('table-1');
      done();
    });
  }, 0);
});
```

> **Note:** This test requires re-exporting the disconnect handler in a testable way. If `registerDisconnect` is not exported with that name, adjust the require path. The test is written as a specification of desired behavior — it will FAIL until the fix is applied.

- [x] **Step 2: Adapt the test to match the actual module export**

Check the exact export:
```bash
head -5 server/socket/handlers/disconnect.js
```
It exports: `module.exports = function registerDisconnect(socket, ctx) {...}`.

Run the test:
```bash
cd c:/Users/user/poker-trainer
npx jest server/tests/disconnectTableCleanup.test.js --no-coverage
```

Expected: FAIL — `TableRepository.closeTable` was not called.

- [x] **Step 3: Apply the fix to disconnect.js**

In `server/socket/handlers/disconnect.js`, find the block starting at line 86 inside the 60s TTL setTimeout:

```js
// EXISTING CODE (lines 86-90):
const socketsInRoom = io.sockets.adapter.rooms.get(tableId);
if (!socketsInRoom || socketsInRoom.size === 0) {
  tables.delete(tableId);
  console.log(`[prune] table ${tableId} removed — no sockets remain`);
}
```

Replace with:

```js
const socketsInRoom = io.sockets.adapter.rooms.get(tableId);
if (!socketsInRoom || socketsInRoom.size === 0) {
  tables.delete(tableId);
  console.log(`[prune] table ${tableId} removed — no sockets remain`);
  // Close in DB so lobby stops showing this table
  const { TableRepository } = require('../../db/repositories/TableRepository.js');
  TableRepository.closeTable(tableId).catch((err) =>
    console.error(`[prune] failed to close table ${tableId} in DB:`, err.message)
  );
}
```

- [x] **Step 4: Run the test to verify it passes**

```bash
npx jest server/tests/disconnectTableCleanup.test.js --no-coverage
```

Expected: PASS.

- [x] **Step 5: Run the full server test suite to check for regressions**

```bash
npx jest --no-coverage
```

Expected: All tests PASS. If any fail, investigate before proceeding.

- [x] **Step 6: Commit**

```bash
git add server/socket/handlers/disconnect.js server/tests/disconnectTableCleanup.test.js
git commit -m "fix(tables): close DB row when last socket leaves table

Fixes old tables persisting in lobby: in-memory prune already happened
but TableRepository.closeTable() was never called, leaving the row with
status='waiting' forever.

Tables created via REST and then socket-abandoned within a session
will now be cleaned up when the last player disconnects."
```

---

## Task 5: Fix orphaned DB tables (created but never socket-joined)

Tables created via `POST /api/tables` but where no one ever socket-joined have no in-memory entry — so the 60s TTL in `disconnect.js` never fires for them. The 5-min cleanup interval in `tableCleanup.js` only iterates the in-memory `tables` Map and misses these too.

**Files:**
- Modify: `server/lifecycle/tableCleanup.js`

- [x] **Step 1: Write a failing test for DB orphan cleanup**

Create `server/tests/tableCleanupOrphans.test.js`:

```js
'use strict';

jest.mock('../db/repositories/TableRepository.js', () => ({
  TableRepository: {
    activateScheduledTables: jest.fn().mockResolvedValue([]),
    closeTable: jest.fn().mockResolvedValue(undefined),
    listOrphanedTables: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('../logs/logger', () => ({ error: jest.fn() }));

const { TableRepository } = require('../db/repositories/TableRepository.js');
const { startTableCleanup } = require('../lifecycle/tableCleanup.js');

test('listOrphanedTables is called during each cleanup interval', async () => {
  jest.useFakeTimers();
  const io = { in: jest.fn().mockReturnValue({ fetchSockets: jest.fn().mockResolvedValue([]) }) };
  const tables = new Map();

  startTableCleanup(io, tables);

  // Advance one interval (5 minutes)
  jest.advanceTimersByTime(5 * 60 * 1000);

  // Wait for async work
  await Promise.resolve();

  jest.useRealTimers();

  expect(TableRepository.listOrphanedTables).toHaveBeenCalled();
});

test('orphaned tables older than 30 min are closed', async () => {
  const OLD_DATE = new Date(Date.now() - 31 * 60 * 1000).toISOString();
  TableRepository.listOrphanedTables.mockResolvedValue([
    { id: 'orphan-1', created_at: OLD_DATE },
    { id: 'orphan-2', created_at: OLD_DATE },
  ]);

  jest.useFakeTimers();
  const io = { in: jest.fn().mockReturnValue({ fetchSockets: jest.fn().mockResolvedValue([]) }) };
  const tables = new Map(); // no in-memory tables

  startTableCleanup(io, tables);
  jest.advanceTimersByTime(5 * 60 * 1000);
  await Promise.resolve();
  jest.useRealTimers();

  expect(TableRepository.closeTable).toHaveBeenCalledWith('orphan-1');
  expect(TableRepository.closeTable).toHaveBeenCalledWith('orphan-2');
});
```

- [x] **Step 2: Run to verify it fails**

```bash
npx jest server/tests/tableCleanupOrphans.test.js --no-coverage
```

Expected: FAIL — `listOrphanedTables` does not exist yet.

- [x] **Step 3: Add `listOrphanedTables` to TableRepository**

In `server/db/repositories/TableRepository.js`, add after the `activateScheduledTables` method:

```js
/**
 * Returns tables that:
 * - Have status 'waiting' or 'active' (not completed)
 * - Were created more than `olderThanMinutes` minutes ago
 * These are candidates for cleanup when no in-memory room exists for them.
 */
async listOrphanedTables(olderThanMinutes = 30) {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('tables')
    .select('id, created_at')
    .in('status', ['waiting', 'active'])
    .lt('created_at', cutoff);
  if (error) throw error;
  return data ?? [];
},
```

- [x] **Step 4: Update `tableCleanup.js` to close orphaned DB tables**

In `server/lifecycle/tableCleanup.js`, inside the `setInterval` callback, after the existing loop over `tables.entries()`, add:

```js
// Close DB tables that have no in-memory room and are older than IDLE_THRESHOLD_MS
try {
  const { TableRepository } = require('../db/repositories/TableRepository.js');
  const orphans = await TableRepository.listOrphanedTables(IDLE_THRESHOLD_MS / 60_000);
  for (const orphan of orphans) {
    if (!tables.has(orphan.id)) {
      await TableRepository.closeTable(orphan.id).catch(() => {});
      console.log(`[tableCleanup] Closed orphaned DB table: ${orphan.id}`);
    }
  }
} catch (err) {
  console.error('[tableCleanup] orphan cleanup failed:', err.message);
}
```

- [x] **Step 5: Run the orphan tests**

```bash
npx jest server/tests/tableCleanupOrphans.test.js --no-coverage
```

Expected: Both tests PASS.

- [x] **Step 6: Run the full server test suite**

```bash
npx jest --no-coverage
```

Expected: All tests PASS.

- [x] **Step 7: Commit**

```bash
git add server/db/repositories/TableRepository.js server/lifecycle/tableCleanup.js server/tests/tableCleanupOrphans.test.js
git commit -m "fix(tables): clean up orphaned DB tables in 5-min maintenance interval

Tables created via REST but never joined (no socket room) persisted
in DB with status='waiting' indefinitely. They now get closed after
the same 30-min idle threshold used for in-memory table cleanup.

Adds TableRepository.listOrphanedTables() and calls it each interval."
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Flow 2.1 — coach creates coached table → redirect to `/table/:tableId` (Task 3 test + existing code)
- ✅ Flow 3.1 — uncoached table → redirect to `/table/:tableId` (same path as 2.1)
- ✅ Flow 4.2 — bot table: name field added (Task 2), redirect fixed (Task 1)
- ✅ Flow 2.9 — table closes when all players leave (Tasks 4 + 5)

**What this plan does NOT cover (out of scope for P0):**
- Flow 4.3 "Add Bot" in-table button — requires new socket event, separate task
- Coach "Close Table" UI button emitting socket event to kick players — separate task
- P1+ fixes (UserForm 500, tournament unification, leaderboard filters)

**Known test complexity:** Task 4's unit test for `disconnect.js` uses fake timers around a 60s TTL — if it proves too brittle, skip the unit test and rely on the full integration test in `server/db/__tests__/botTable.integration.test.js` to catch regressions. The DB fix itself is a one-liner and low risk.
