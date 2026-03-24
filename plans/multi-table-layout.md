# Multi-Table Layout — Vision & Design Plan

> Status: Brainstorm / Vision
> Author: Architecture planning session, 2026-03-24
> Scope: Big-picture concepts and trade-offs only — no implementation code

---

## Background

The server already supports multiple simultaneous tables. Each call to
`getOrCreateTable(tableId)` creates an independent `SessionManager` instance
keyed by an arbitrary `tableId` string. Socket.io rooms map 1-to-1 with
`tableId`. The client, however, knows about exactly one table at a time: it
calls `join_room` once and renders a single `PokerTable`.

This document explores how the UI could scale to 2–4 concurrent tables without
redesigning the server's core Socket.io architecture.

---

## 1. Layout Concepts

### 1a. Grid View (primary recommendation)
Divide the viewport into a responsive CSS grid of equal-sized table tiles.
- 1 table → full screen (current behaviour, no change)
- 2 tables → side-by-side split (50/50)
- 3 tables → 2-up top row + 1 centred below, or 3-column row
- 4 tables → 2×2 grid

Each tile is a scaled-down `PokerTable`. The coach can click a tile to "focus"
it, temporarily expanding it to ~70% of the viewport while the others shrink
to a sidebar strip.

Tradeoff: Card text and chip counts become very small at the 4-table scale on a
laptop. Minimum tile size should be enforced (≈ 480 px wide); beyond that,
switch to a scrollable strip or tabs.

### 1b. Tabs
A tab bar at the top lists every table the coach has joined. Switching tabs
swaps the full-screen view. Urgent events on background tabs badge the tab
with a colour or count indicator.

Tradeoff: Simple but blind — you cannot see two tables simultaneously. Good
fallback on small screens.

### 1c. Sidebar Navigation
A narrow left sidebar lists all tables with a status thumbnail (player count,
street, pot). Clicking navigates to that table. A small persistent "alert strip"
at the bottom of the sidebar shows live notifications from all tables.

Tradeoff: Good for 4+ tables; poor for simultaneous comparison.

### 1d. Picture-in-Picture (PiP)
One table occupies the main view. Other tables appear as small floating tiles
(draggable, resizable) overlaid in corners. Coaches can pop any table to the
main view.

Tradeoff: Flexible, but drag-and-drop UI complexity is high and the floating
tiles can obscure the main table.

### 1e. Split-Screen (2 tables only)
Vertical 50/50 split with a draggable divider. Each pane is a full `PokerTable`
component. Practical for a coach who runs exactly two rooms in parallel.

**Recommendation**: implement Grid View as the primary layout, with a Tabs
fallback for screens narrower than 1024 px. PiP can be a future enhancement.

---

## 2. Coach Experience

A coach currently joins a single table as `coach_<tableId>`. For multi-table,
the coach needs to:

1. **Create / name tables** before the session (e.g., "Table A", "Table B").
   A simple pre-session lobby screen lets the coach type table IDs or pick from
   recently used ones.

2. **Join all tables simultaneously.** The coach opens one `useSocket`-equivalent
   connection per table, or a single connection with multi-room awareness. See
   section 7 for the socket strategy.

3. **Act on any table without switching context.** In grid view, betting
   controls and coach sidebars render inside each tile. The coach clicks the
   tile to bring its controls forward.

4. **Global controls.** A "broadcast bar" spans all tiles and lets the coach
   issue commands to all tables at once: "Start hand on all tables", "Reset all
   tables", "Pause all tables".

5. **Focus mode.** Double-click a tile to expand it. Keyboard shortcut (e.g.
   `1`–`4`) should also jump to a table.

6. **Per-table CoachSidebar** remains accessible in focus mode. In thumbnail
   mode, the sidebar collapses to icon buttons (start, reset, pause).

---

## 3. Spectator / Student Experience

Students join a single table, so they see the existing single-table UI.
No changes are needed from the student's perspective.

However, a **table lobby screen** (shown before joining) helps students find
the correct table when multiple are running:

- List active tables fetched from `GET /api/tables` (new endpoint).
- Each row shows: table name, player count, current street, whether the hand
  is in progress.
- Students click a row to join.

The lobby auto-refreshes every 5–10 seconds, or subscribes to a server-sent
event / short-poll channel.

---

## 4. Table Status at a Glance

Each tile (coach grid view) or sidebar row (spectator lobby) should surface:

| Datum | Source |
|---|---|
| Table name / ID | `gameState.room` |
| Player count (seated vs total) | `gameState.seated.length` |
| Current street | `gameState.street` |
| Pot size (chips or BB) | `gameState.pot` |
| Phase (waiting / playing / replay / paused) | `gameState.phase` |
| Action-on player | `gameState.current_player` |
| All-in indicator | derived from `gameState.seated` stacks |
| Timer remaining | `actionTimer` |

A compact "status chip" component — distinct from the full `PokerTable` —
renders this data in thumbnail tiles and sidebar rows. It consumes a subset of
`game_state` and is purely presentational.

---

## 5. Cross-Table Actions

### Broadcast controls (coach-only)
A toolbar above the grid exposes:
- **Start all hands** — fires `start_game` to every joined table
- **Reset all** — fires `reset_hand` to every joined table
- **Pause / resume all** — fires `toggle_pause` to every joined table
- **Advance all to next street** — fires `force_next_street` to every joined table (useful for synchronised drills)

These are client-side fan-outs: the coach's browser emits the same event on
each socket connection. No new server-side "broadcast channel" is required.

### Per-table actions
All current per-table actions (manual card deal, stack adjust, playlist load,
etc.) remain scoped to a single table. The coach must be in focus mode for that
table to issue these commands.

### Cross-table hand synchronisation (future)
A "sync mode" could lock all tables to the same hand scenario and step them
through the same street simultaneously. Out of scope for the initial layout
feature but worth considering in the event model design.

---

## 6. Notification Model

### Priority tiers
1. **Critical** (red, audio alert): Player all-in, time bank < 5 s, coach disconnected from a table
2. **Warning** (amber): Action timer running out (< 10 s), player folded in an unexpected spot
3. **Info** (blue/white): Hand started, hand ended, player joined/left

### Surfacing across tables
In grid view, a notification banner appears inside the originating tile.
A global notification tray (top-right corner, outside all tiles) aggregates
critical and warning events from every table with the table name as a prefix.

The existing `notification` socket event already carries `{ type, message }`.
The multi-table layer adds `tableId` to the rendered notification so the coach
can immediately see which table requires attention.

In thumbnail mode, a pulsing coloured border on the tile (red for critical,
amber for warning) draws the eye without requiring the coach to read text.

### Sound
A single soft audio cue (different tones for critical vs warning) fires for
cross-table critical events. Off by default; mutable per-table or globally.

---

## 7. Socket Architecture

### Option A: One socket connection per table (recommended for ≤ 4 tables)
The client opens a separate `io()` connection for each table, each passing the
same JWT but a different `tableId` in `join_room`. Zero server changes required;
each `useSocket` hook stays isolated.

Tradeoff: N WebSocket connections per coach browser tab. At 4 tables this is
acceptable (browsers support many concurrent WS connections).

### Option B: Socket.io namespaces per table
Each table becomes its own Socket.io namespace (`/table-A`, `/table-B`).
Requires server changes for dynamic namespace creation and lifecycle management.

### Option C: Single connection, multiple room subscriptions
One socket joins multiple rooms; actions include an explicit `tableId` field.
`game_state` events include `tableId` so the client can demux updates.

Tradeoff: Complex; all handlers need `tableId` awareness and risk of
event fan-out bugs.

**Recommendation**: Start with Option A. Migrate to Option C if connection
count becomes a concern at scale.

---

## 8. Scaling Considerations

**Memory**: Each `SessionManager` is lightweight (< 1 MB). The current 512 MB
Fly.io instance handles 4+ tables with ease.

**Idle table cleanup**: Tables currently stay in the `tables` Map forever.
For multi-table sessions, implement a TTL: evict a table after 30 minutes of
zero connected sockets.

**Reconnection**: Each `useSocket` instance already handles reconnect-and-rejoin
via `joinParamsRef`. In multi-table mode, all N socket instances need independent
reconnect logic. The JWT is shared, so token refresh only needs to happen once
and be distributed to all sockets.

**DB writes**: `HandLoggerSupabase` already uses `tableId` as a scoping key.
No schema changes needed for concurrent multi-table hand logging.

**Auto-sleep (Fly.io)**: With a coach open across 4 tables, at least one socket
is always connected — the idle timer is naturally satisfied.

---

## 9. Open Questions

1. Should the coach join all tables from a single browser tab, or open one
   tab per table? Multi-tab is simpler but loses the unified grid view.

2. Who creates tables? Currently any `join_room` with a novel `tableId` creates
   a table. Should the coach explicitly provision tables to prevent accidental
   creation by students?

3. Table naming vs table IDs. A separate human-readable label would improve
   multi-table UI. Requires either a new `table_name` param in `join_room` or
   a server-side table registry.

4. Hand synchronisation. Should the coach run the same drill on all tables
   simultaneously? If so, a "broadcast scenario load" event is needed.

5. Spectator table discovery. A `GET /api/tables` endpoint would expose live
   table status — needs to be careful not to leak hole cards.

6. Mobile / tablet. Grid layout is likely unusable on phones. Define a
   responsive breakpoint strategy early (tabs-only on < 1024 px).

7. Per-table session reports. Should there be one combined report for a
   multi-table session, or one per table?

---

## 10. Recommended Phasing

| Phase | Scope |
|---|---|
| 0 — Foundation | `GET /api/tables` endpoint. `tableId` selection on join screen. No layout change. |
| 1 — Coach grid | `useMultiTable` hook. Grid layout (1–4 tiles). Compact status chip. Focus-on-click. |
| 2 — Notifications | Cross-table notification tray. Pulsing tile borders. Priority tiers. |
| 3 — Broadcast controls | Global start/reset/pause toolbar. Coach fan-outs commands to all tables. |
| 4 — Spectator lobby | Table list with live status. Students pick a table before joining. |
| 5 — Polish | Keyboard shortcuts (1–4 to focus table). Sound cues. Responsive/tablet layout. Idle table TTL cleanup. |

---

## Key Files for Implementation

| File | Role |
|---|---|
| `client/src/hooks/useSocket.js` | Extract per-table socket logic into a `useTableSocket(tableId)` hook |
| `client/src/App.jsx` | Top-level layout to restructure; currently owns the single `useSocket` call |
| `client/src/components/PokerTable.jsx` | Make scale-aware (tile vs full-screen mode) |
| `server/index.js` | Add `GET /api/tables` endpoint; `getOrCreateTable` and `broadcastState` are the primitives |
| `server/game/SessionManager.js` | One instance per table; `getSessionStats()` feeds the status chip |
