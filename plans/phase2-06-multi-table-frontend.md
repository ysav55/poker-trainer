# Item 6: Multi-Table Frontend

**Status**: ✅ done
**Blocked by**: Item 1 (GET /api/tables endpoint), Item 5 (routing + AuthContext)
**Reference**: [plans/multi-table-layout.md](multi-table-layout.md) — full vision doc

---

## Context

After Items 1 & 5: React Router installed, `AuthContext` exists, `TablePage` at
`/table/:tableId` renders one table, `GET /api/tables` returns live table list.
This item adds: N concurrent table connections, grid/tab layout, compact table tiles,
broadcast controls.

---

## Socket Strategy: Option A — One Socket Per Table

Per `multi-table-layout.md §7` recommendation: each `TableProvider` opens its own `io()`
connection to the server using the same JWT. Zero server-side changes required.
Acceptable for ≤ 4 tables (browsers support many concurrent WebSocket connections).

---

## New: `client/src/contexts/TableContext.jsx`

```jsx
import { createContext, useContext } from 'react';
import { useTableSocket } from '../hooks/useTableSocket.js';
import { useGameState } from '../hooks/useGameState.js';
import { usePlaylistManager } from '../hooks/usePlaylistManager.js';
import { useNotifications } from '../hooks/useNotifications.js';

// NOTE: useReplay was removed from TableContext (2026-03-30).
// Replay UI was stripped from the client. Server-side ReplayEngine remains intact.

const TableContext = createContext(null);

export function TableProvider({ tableId, children }) {
  const socket = useTableSocket(tableId);
  const gameState = useGameState(socket);
  const playlist = usePlaylistManager(socket);
  const notifications = useNotifications(socket);

  return (
    <TableContext.Provider value={{ tableId, socket, gameState, playlist, notifications }}>
      {children}
    </TableContext.Provider>
  );
}

export const useTable = () => useContext(TableContext);
```

---

## New Hook: `client/src/hooks/useTableSocket.js`

Replaces per-table usage of `useConnectionManager.js`. Creates an isolated socket
connection scoped to a single tableId.

```js
import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '../contexts/AuthContext.jsx';

export function useTableSocket(tableId) {
  const { user } = useAuth();
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = io(import.meta.env.VITE_SERVER_URL ?? '', {
      auth: (cb) => cb({ token: user?.token ?? '' }),
    });

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('join_room', {
        name: user.name,
        isCoach: user.role === 'coach',
        isSpectator: false,
        stableId: user.id,
        tableId,
      });
    });
    socket.on('disconnect', () => setConnected(false));

    socketRef.current = socket;
    return () => socket.disconnect();
  }, [tableId, user?.token]);

  const emit = (event, data) => socketRef.current?.emit(event, data);

  return { socketRef, emit, connected };
}
```

---

## Refactor Existing Hooks to Accept `socket` Param

Currently `useGameState`, `usePlaylistManager`, `useReplay`, `useNotifications` access
`socketRef` via closure from `useConnectionManager`. Make the dependency explicit.

```js
// Before (current):
export function useGameState() {
  const { socketRef } = useConnectionManager(); // internal coupling
  ...
}

// After:
export function useGameState(socket) {
  const { socketRef } = socket; // explicit injection
  ...
}
```

`useSocket.js` (composition layer) is updated to pass `socket` down:
```js
export function useSocket() {
  const socket = useConnectionManager();          // single-table path — backward compat
  const gameState = useGameState(socket);
  ...
}
```

**No changes to `useConnectionManager.js` itself** — it stays as the single-table socket
provider. `useTableSocket.js` is the multi-table equivalent.

---

## Update `TablePage.jsx` (from Item 5)

```jsx
import { TableProvider } from '../contexts/TableContext.jsx';
import { useParams } from 'react-router-dom';

export default function TablePage() {
  const { tableId } = useParams();
  return (
    <TableProvider tableId={tableId}>
      <FullTableView />
    </TableProvider>
  );
}

function FullTableView() {
  const { gameState, socket } = useTable();
  // Render PokerTable + CoachSidebar using TableContext data
  ...
}
```

---

## New: `client/src/pages/MultiTablePage.jsx`

```jsx
import { useLobby } from '../contexts/LobbyContext.jsx';
import { TableProvider } from '../contexts/TableContext.jsx';
import { TableTile } from '../components/TableTile.jsx';
import { BroadcastBar } from '../components/BroadcastBar.jsx';
import { useState } from 'react';

export default function MultiTablePage() {
  const { activeTables } = useLobby();
  const [focusedTableId, setFocusedTableId] = useState(null);
  const cols = Math.min(activeTables.length, 2);

  return (
    <div className="flex flex-col h-screen">
      <BroadcastBar tables={activeTables} />
      <div className={`grid grid-cols-${cols} gap-1 flex-1 overflow-hidden`}>
        {activeTables.map(t => (
          <TableProvider key={t.id} tableId={t.id}>
            <TableTile
              focused={focusedTableId === t.id}
              onFocus={() => setFocusedTableId(focusedTableId === t.id ? null : t.id)}
            />
          </TableProvider>
        ))}
      </div>
    </div>
  );
}
```

Grid layout: 1 table = full screen; 2 = 50/50 split; 3–4 = 2-col grid.
Click tile to focus (expands to ~70%). Click again to unfocus.

---

## New: `client/src/components/TableTile.jsx`

```jsx
import { useTable } from '../contexts/TableContext.jsx';
import { TableStatusChip } from './TableStatusChip.jsx';

export function TableTile({ focused, onFocus }) {
  const { gameState, tableId } = useTable();

  if (focused) {
    return (
      <div className="relative h-full">
        <PokerTable />  {/* Full render */}
        {isCoach && <CoachSidebar collapsed />}
      </div>
    );
  }

  return (
    <div
      onClick={onFocus}
      className="relative bg-felt-dark border border-gold/20 rounded cursor-pointer hover:border-gold/60 transition-colors"
    >
      <TableStatusChip tableId={tableId} gameState={gameState} />
      {/* Pulsing border for critical alerts */}
    </div>
  );
}
```

---

## New: `client/src/components/TableStatusChip.jsx`

Read-only summary per `multi-table-layout.md §4`:

```jsx
export function TableStatusChip({ tableId, gameState }) {
  const { seated, street, phase, pot, current_player } = gameState ?? {};
  return (
    <div className="p-2 text-sm text-white/80">
      <div className="font-bold">{tableId}</div>
      <div>{seated?.length ?? 0} players · {street ?? 'waiting'}</div>
      <div>Pot: {pot ?? 0}</div>
      {current_player && <div>Action: {current_player}</div>}
      <div className={`text-xs ${phase === 'playing' ? 'text-green-400' : 'text-gray-400'}`}>
        {phase}
      </div>
    </div>
  );
}
```

---

## New: `client/src/components/BroadcastBar.jsx`

Coach-only toolbar. Fan-outs to all open table sockets via `TableContext` would require
access to each TableProvider's socket — instead, pass socket refs up to `MultiTablePage`
and pass down to `BroadcastBar`.

```jsx
export function BroadcastBar({ tables }) {
  const { hasPermission } = useAuth();
  if (!hasPermission('table:manage')) return null;

  // socketRefs collected from each TableProvider via ref callback
  const broadcastAll = (event, data) => {
    // emit to each table's socketRef.current
  };

  return (
    <div className="flex gap-2 p-2 bg-gray-900 border-b border-gold/20">
      <button onClick={() => broadcastAll('start_game', {})}>Start All</button>
      <button onClick={() => broadcastAll('reset_hand', {})}>Reset All</button>
      <button onClick={() => broadcastAll('toggle_pause', {})}>Pause All</button>
      <button onClick={() => broadcastAll('force_next_street', {})}>Advance All</button>
    </div>
  );
}
```

---

## Key Files to Read Before Implementing

- `client/src/hooks/useSocket.js` — composition layer to understand closure structure
- `client/src/hooks/useConnectionManager.js` — socket lifecycle to replicate in `useTableSocket`
- `client/src/hooks/useGameState.js` — how socketRef is currently accessed (closure to break)
- `client/src/App.jsx` — current single-table render to extract into `FullTableView`
- `plans/multi-table-layout.md` — full vision document (layout options, notification model, open questions)

---

## Tests

- Unit: `useTableSocket(tableId)` — creates independent socket connection per tableId
- Unit: `TableStatusChip` — renders correct player count, street, phase from gameState
- Unit: `TableTile` — focused renders `PokerTable`; unfocused renders `TableStatusChip`
- Integration: Two `TableProvider` instances with different tableIds → independent game states
- Integration: `BroadcastBar` — clicking "Start All" emits `start_game` to all open tables
- Integration: Focus mode — clicking tile expands to full render, clicking again collapses
