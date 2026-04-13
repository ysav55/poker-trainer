# Playlist → Table Launch Bridge — Design Spec

**Date:** 2026-04-13
**Branch:** `feat/ui-redesign-v1`
**Status:** Design approved, awaiting implementation plan
**Phase in master plan:** 6.5 (between Phase 6 / Save-as-Scenario and Phase 7 / Tournament Polish in `plans/ui-redesign-v2.md`)
**Related WIP:** Migration 052 (`scenarios.hero_seat`) already staged in working tree.

---

## 1. Problem

Scenarios and playlists exist as first-class curriculum objects in the Hand Builder, but there is no way to instantiate them at a live table. A coach who builds "AK on wet board" cannot deliver that drill to seated students. The feature this spec describes is the missing bridge: a coach launches a playlist at a coached table, the server filters scenarios to match the active seat count, assigns cards/stacks/board per scenario, and advances the playlist across hands.

---

## 2. Scope

### In scope

- Coach-initiated playlist launch at a `coached_cash` table.
- Server-authoritative playlist runner: filter by active seat count, rotate scenario seat template onto real seats, override stacks + board, advance cursor across hands.
- Sequential and random ordering, with persistent cursor per `(table_id, playlist_id)`.
- Three hero modes: sticky, per-hand, rotate.
- Auto-advance toggle (reuses 5s-countdown UX from existing PlaylistsSection).
- Pause/resume with DB-persisted state; resume-vs-restart prompt on re-launch.
- New sidebar panel (`ScenarioLaunchPanel`) replacing the existing `PlaylistsSection`.
- Coach-only; enforced via existing `socket.data.isCoach` guard.

### Explicitly deferred

- Student-initiated launch from bot tables.
- Per-student scenario assignment (`scenario_assignments` table).
- Playlist analytics / aggregated stats across sessions.
- Cross-table playlist sharing.

These are future extensions. This spec does not preclude them.

---

## 3. Decision log

| Question | Decision |
|---|---|
| Launch unit | Playlist (filtered to scenarios matching active seat count) |
| Match criteria | Exact seat count; non-matching scenarios skipped silently |
| Hero seat | Fixed in builder via `scenarios.hero_seat`; scenario template rotates onto real seats anchored at the chosen hero |
| Ordering | Sequential or random; persistent cursor |
| Hero modes | Coach-controlled: sticky / per-hand / rotate |
| State override (per hand) | Stacks override+restore, blinds keep table, board scenario-wins |
| Launch UI | Dedicated sidebar panel, replaces `PlaylistsSection` |
| Advance | Coach toggles auto vs manual |
| Zero-match playlist | Warning banner + manual override ("launch anyway — wait for count") |
| Cursor persistence | DB-persisted per `(table_id, playlist_id)`; coach prompted resume vs restart on re-launch |

---

## 4. Architecture

### Module layout

```
server/
  game/
    TablePlaylistController.js       NEW — one instance per active (table, playlist)
    mapScenarioToTable.js            NEW — pure seat-rotation function
    GameManager.js                   MODIFIED — single hook for hand-start/complete
  db/repositories/
    TablePlaylistStateRepository.js  NEW
  socket/handlers/
    tablePlaylist.js                 NEW — 6 inbound events, 4 broadcasts
  state/SharedState.js               MODIFIED — adds tablePlaylists: Map<tableId, controller>

supabase/migrations/
  052_scenario_hero_seat.sql         (already WIP in working tree)
  053_table_playlist_state.sql       NEW

client/src/
  components/sidebar/
    PlaylistsSection.jsx             REPLACED
    ScenarioLaunchPanel.jsx          NEW
  hooks/
    useTablePlaylist.js              NEW
```

### Responsibility boundaries

- **`TablePlaylistController`** — owns cursor, ordering, hero mode, filter + rotation logic. Operates on in-memory state plus a thin DB repo for persistence. Pure enough to unit-test without spinning up sockets or GameManager.
- **`mapScenarioToTable`** — pure function. Inputs: scenario, active seats, chosen hero real seat. Output: `{ seatAssignments, dealerSeat }` or `null` on count mismatch. Zero dependencies. Tested in isolation for seat counts 2–9.
- **`GameManager`** — unchanged core. Gains two hook points: `onHandStart(tableId)` and `onHandComplete(tableId)`. Controller subscribes; injects scenario-driven hand config before the deal, restores overridden stacks after the hand.
- **`TablePlaylistStateRepository`** — read, upsert, delete one row per `(table_id, playlist_id)`. Manages `played_ids` array ops.
- **Socket handler** — thin translation layer; delegates to controller. Enforces coach + coached_cash guards.
- **`ScenarioLaunchPanel`** — single component, three render states (idle, running, resume-prompt). Coach-only.
- **`useTablePlaylist`** — hook wrapping 6 emit helpers + 4 listener subscriptions. Analogous to existing `useReplay`.

### Lifecycle

- Controller created on `scenario:launch_playlist`; stored in `SharedState.tablePlaylists: Map<tableId, TablePlaylistController>`.
- Flushes state to DB on every cursor advance and on `scenario:pause`.
- Destroyed on table cleanup (`tableCleanup.js` hook) or explicit pause-then-swap to a different playlist.

---

## 5. Data model

### Migration 052 (already staged, uncommitted)

```sql
ALTER TABLE scenarios
  ADD COLUMN IF NOT EXISTS hero_seat SMALLINT
  CHECK (hero_seat IS NULL OR (hero_seat >= 0 AND hero_seat <= 9));
```

Nullable. Legacy scenarios without a declared hero will default to their first filled seat at launch time (fallback already encoded in the WIP `createScenarioFromHand` change).

### Migration 053 — `table_playlist_state`

```sql
CREATE TABLE IF NOT EXISTS table_playlist_state (
  table_id       UUID NOT NULL REFERENCES tables(table_id) ON DELETE CASCADE,
  playlist_id    UUID NOT NULL REFERENCES playlists(playlist_id) ON DELETE CASCADE,
  cursor         INTEGER NOT NULL DEFAULT 0,
  ordering       TEXT NOT NULL DEFAULT 'sequential'
                 CHECK (ordering IN ('sequential', 'random')),
  hero_mode      TEXT NOT NULL DEFAULT 'sticky'
                 CHECK (hero_mode IN ('sticky', 'per_hand', 'rotate')),
  hero_player_id UUID REFERENCES players(player_id) ON DELETE SET NULL,
  auto_advance   BOOLEAN NOT NULL DEFAULT false,
  played_ids     UUID[] NOT NULL DEFAULT '{}',
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (table_id, playlist_id)
);

CREATE INDEX IF NOT EXISTS idx_tps_table ON table_playlist_state(table_id);
```

Field notes:

- `cursor` drives sequential order. Ignored for random.
- `played_ids` is the source of truth for "what has already been served". Used to dedup random mode and to recover cleanly when the underlying playlist mutates (scenarios added or removed mid-session). On resume, the next scenario is "first not-in-played_ids in selected ordering".
- `hero_player_id` populated for sticky mode; null for per_hand / rotate.
- Composite primary key allows one table to hold parallel cursors for multiple playlists (coach swaps and returns).

### Existing tables — no changes

- `scenarios` — already holds `seat_configs` (JSONB), `board_flop/turn/river`, `primary_playlist_id`, and now `hero_seat`. Sufficient.
- `playlists` + `playlist_hands` — unchanged. The existing join table already maps playlists to scenarios. (Naming note: scenarios are persisted as `hands` internally; the implementation plan will confirm no alias confusion.)

---

## 6. Seat rotation algorithm

### Inputs

- `scenario.seat_configs` — array of `{ seat, cards, stack }` objects; seat numbers are absolute 0–9.
- `scenario.hero_seat` — SMALLINT, the canonical hero seat within the scenario template.
- `scenario.dealer_seat` — SMALLINT, the scenario's dealer button seat.
- `table.activeSeats` — sorted ascending array of real table seat numbers with active (not sit-out, not busted) players.
- `chosenHeroRealSeat` — the real table seat occupied by the player the coach nominated as hero.

### Algorithm

1. **Count filter.** If `scenario.seat_configs.length !== table.activeSeats.length`, return `null`. Caller interprets null as "skip silently".
2. **Order both lists circularly.**
   - `templateSeats = sorted(scenario.seat_configs.map(c => c.seat))`
   - `realSeats = sorted(table.activeSeats)`
3. **Anchor at hero.** Find `heroTemplateIndex = templateSeats.indexOf(scenario.hero_seat)` and `heroRealIndex = realSeats.indexOf(chosenHeroRealSeat)`. Rotate `templateSeats` so the hero template seat aligns with the hero real seat: for each template index `i`, the real seat receiving that assignment is `realSeats[(heroRealIndex + (i - heroTemplateIndex) + n) % n]` where `n = realSeats.length`.
4. **Produce `seatAssignments`** — array of `{ realSeat, cards, stack, isHero }` where each template seat is mapped to its corresponding real seat, `cards` and `stack` come from the template, and `isHero` marks the entry whose template seat equals `scenario.hero_seat`.
5. **Derive dealer.** `dealerSeat = realSeats[(heroRealIndex + (templateSeats.indexOf(scenario.dealer_seat) - heroTemplateIndex) + n) % n]`. Positions (BTN, SB, BB, UTG…) are computed downstream by the existing `buildPositionMap(seated, dealerSeat)`.

### Properties

- Works for any scenario/table count in 2–9 as long as the counts match.
- Preserves relative circular order between scenario seats and real seats — i.e. two players who sit left of the hero in the scenario sit left of the hero at the real table.
- No visual reshuffle of seated players. Only card deal, stack override, and dealer button move.
- Pure function — zero dependencies on GameManager, DB, or socket state.

### Fallbacks

- If `scenario.hero_seat IS NULL`, fall back to the first seat in `templateSeats` with non-empty cards, else `templateSeats[0]`.
- If `scenario.dealer_seat IS NULL`, fall back to the seat one position right of the hero in template order (standard heads-up / multiway convention).

---

## 7. Socket API

All events require `socket.data.isCoach === true` and the target table to be `mode === 'coached_cash'`. Unauthorized events respond with `scenario:error` and no state change.

### Coach → server

| Event | Payload | Response |
|---|---|---|
| `scenario:launch_playlist` | `{ tableId, playlistId, ordering, heroMode, heroPlayerId?, autoAdvance }` | `{ cursor, nextScenario?, resumable, fitCount }` |
| `scenario:set_hero` | `{ tableId, playerId }` | ack |
| `scenario:set_mode` | `{ tableId, ordering?, heroMode?, autoAdvance? }` | ack |
| `scenario:advance` | `{ tableId }` | `{ nextScenario? }` (manual advance) |
| `scenario:pause` | `{ tableId }` | ack, flushes cursor |
| `scenario:resume` | `{ tableId, playlistId, from: 'cursor' \| 'restart' }` | `{ cursor, nextScenario? }` |

### Server → clients (room-broadcast)

| Event | Payload |
|---|---|
| `scenario:armed` | `{ scenario, seatAssignments, dealerSeat, mapping }` — emitted before `hand:start` |
| `scenario:skipped` | `{ scenarioId, reason: 'count_mismatch' }` |
| `scenario:exhausted` | `{ playlistId }` — no more fitting scenarios |
| `scenario:progress` | `{ cursor, total, played }` |
| `scenario:error` | `{ code, message }` — e.g. `hero_absent`, `persist_error`, `not_coached_mode` |

### Launch sequence

1. Coach opens `ScenarioLaunchPanel`, picks playlist + hero mode + ordering + hero + auto-advance toggle.
2. Client emits `scenario:launch_playlist`.
3. Server looks up `table_playlist_state` for `(tableId, playlistId)`:
   - If row exists and `played_ids.length > 0`, respond `{ resumable: true, priorCursor, priorPlayed }` — client shows resume-vs-restart prompt.
   - Else, upsert fresh row (cursor = 0, `played_ids = '{}'`).
4. Server's `TablePlaylistController` arms next scenario matching active count. If none fit, respond with `fitCount: 0` and wait for seat-count change.
5. On hand start (coach clicks Deal, or auto-advance timer fires), controller:
   - Calls `mapScenarioToTable()`.
   - Overrides stacks for that hand via existing hand-config hook.
   - Injects board config.
   - Emits `scenario:armed` with full mapping.
6. Hand plays normally through `GameManager`.
7. On `hand:complete`:
   - Restore stacks to pre-hand values (chip bank untouched — override was per-hand only).
   - Append scenario_id to `played_ids`, advance cursor, persist to DB.
   - Emit `scenario:progress`.
   - If `autoAdvance`, arm next scenario; else idle until `scenario:advance`.

### Hand-config collision

`coached_cash` already lets coaches set custom board/stacks per hand via `handConfig`. When a scenario is armed, scenario config wins; the `HandConfigPanel` shows a "Scenario-driven" readonly banner. Pause restores normal hand-config control.

---

## 8. Client UI

### Location

`client/src/components/sidebar/ScenarioLaunchPanel.jsx` replaces `PlaylistsSection.jsx` in `CoachSidebar`. Coach-only (hidden for students and uncoached modes).

### Three render states

**Idle (no playlist armed)**

- Playlist dropdown (all playlists visible to coach, with color dots from `PLAYLIST_COLORS`).
- Hero dropdown (active players only, disabled until playlist picked).
- Hero mode radio: sticky / per-hand / rotate.
- Ordering radio: sequential / random.
- Auto-advance toggle with inline countdown seconds.
- Primary `Launch` button (gold CTA, disabled until playlist + hero picked).
- Zero-match warning banner when selected playlist has no scenarios fitting current active count; exposes "Launch anyway — wait for count" toggle.

**Running (playlist active)**

- Color-dot + playlist name + `cursor / total` counter.
- Current scenario name.
- Current hero + hero mode.
- Current ordering + auto-advance state.
- Buttons: `Pause`, `Advance →` (manual mode only), `Swap` (pause + re-enter idle for different playlist).
- Rolling log (last 3 events): "skipped — count mismatch", "played — KK vs AQ", etc.

**Resume prompt (on launch when prior state exists)**

- "`<Playlist Name>` was paused at scenario `<cursor> / <total>`."
- Buttons: `Resume from <cursor>`, `Restart`.

### Data sources

- Playlists — existing `GET /api/playlists` (already cached client-side).
- Active players — existing socket table state.
- Progress and skip logs — `scenario:progress`, `scenario:skipped` streams, accumulated in local `useState`, capped at 10 entries.

### Hook

`useTablePlaylist()` returns `{ state, launch, pause, advance, resume, setHero, setMode }` and subscribes to the 4 server broadcasts. Mirrors the `useReplay` hook's shape.

### Visual language

- `PLAYLIST_COLORS` for dots (already in `components/scenarios/PLAYLIST_COLORS.js`).
- lucide-react icons: `Play`, `Pause`, `ChevronRight`, `RefreshCw`.
- `colors.js` tokens throughout — zero hardcoded hex (V2 plan rule).

---

## 9. Edge cases and error handling

**Next scenario does not fit current count.** Controller advances cursor, emits `scenario:skipped`, tries again. Loops up to `remainingPlaylistSize` attempts. If exhausted, emits `scenario:exhausted`; panel shows end-of-playlist state.

**Zero scenarios fit on launch.** Launch responds with `fitCount: 0`. Panel shows warning with override toggle. If override enabled, controller enters "waiting" mode; re-evaluates on seat join/leave/sit-out events.

**Seat count changes mid-playlist.** Controller re-filters on every hand-start. Silent skips show in the rolling log so the coach can see what was bypassed.

**Coach changes hero mid-playlist.** `scenario:set_hero` writes to controller and DB. Applies to the next scenario, not the in-flight hand.

**Hero player leaves the table.**
- Sticky mode: controller pauses, emits `scenario:error { code: 'hero_absent' }`. Panel prompts coach to pick a new hero.
- Per-hand / rotate: controller picks next active player automatically.

**Hand-config collision.** Scenario overrides win. `HandConfigPanel` disables with "Scenario-driven" banner. Pause re-enables it.

**Stack override edge cases.**
- Scenario stack > player's chip bank: override for the hand regardless. Chip bank is untouched; restore uses pre-hand snapshot.
- Scenario stack = 0 for a seat: treat that seat as sit-out for the hand.
- Restore at `hand:complete` uses the pre-arming stack snapshot, not the arbitrary "full stack" value.

**Cursor resume after playlist mutation.** `played_ids` is canonical. Next scenario on resume = first unplayed, in selected ordering. Numeric cursor is re-synced from `played_ids.length` at resume time. If a played scenario was deleted from the playlist, it is simply dropped from the played set on next persist.

**Persistence failure.** DB write fails → controller logs, keeps in-memory state, retries on next hand. Coach sees `scenario:error { code: 'persist_error' }` toast.

**Scenario fetch 404** (deleted mid-session) → skip + log.

**Non-coach sockets.** All events rejected with `scenario:error { code: 'forbidden' }`.

**Non-coached_cash table.** Launch rejected with `scenario:error { code: 'not_coached_mode' }`.

---

## 10. Testing strategy

### Unit (pure logic)

- `server/game/__tests__/mapScenarioToTable.test.js` — all seat counts 2–9, hero anchor correctness, dealer placement, null on mismatch, null-hero fallback.
- `server/game/__tests__/TablePlaylistController.test.js` — cursor advance sequential/random, `played_ids` dedup, filter loop, hero mode transitions, skip-loop exhaustion, waiting-mode re-evaluation on seat change.

### Repository

- `server/db/__tests__/TablePlaylistStateRepository.test.js` — upsert, read, `played_ids` array append/dedup, keyed retrieval `(table_id, playlist_id)`, cascade delete when the parent table or playlist is removed.

### Socket integration

- `server/socket/handlers/__tests__/tablePlaylist.test.js` — coach-only guard, `coached_cash`-only guard, full launch → armed → hand-complete → progress flow against a mock `GameManager`, resume vs restart branching, error codes.

### Client

- `client/src/__tests__/ScenarioLaunchPanel.test.jsx` — idle / running / resume-prompt render states, hero picker disabled until playlist picked, zero-match warning, override toggle, rolling log cap at 10.
- `client/src/__tests__/useTablePlaylist.test.js` — emit helpers, listener subscriptions, state accumulation.

### Out of scope for this spec

- End-to-end Playwright coverage (folded into Phase 8 of the master V2 plan).

### Target

Approximately 40–50 new tests across 6 files. Full suite must stay green (currently 1065 passing).

---

## 11. Implementation phasing (for plan document)

This spec produces one implementation plan with four phases:

1. **Foundation** — migration 053, `TablePlaylistStateRepository`, `mapScenarioToTable`, `TablePlaylistController` (unit-tested in isolation).
2. **Server integration** — socket handlers, `GameManager` hook points, `SharedState` wiring, hand-config collision.
3. **Client panel** — `ScenarioLaunchPanel`, `useTablePlaylist` hook, replacement of `PlaylistsSection` in `CoachSidebar`.
4. **Integration + edge cases** — resume flow, waiting mode, hero-absent handling, end-to-end manual verification at a 3-handed coached table.

Each phase ships with its own tests. Master V2 plan gains Phase 6.5 between existing Phases 6 and 7.

### After this feature

Once Phase 6.5 ships green, resume the master V2 plan at:

- **Phase 7** — Tournament polish (token migration, lucide icons, `StatusBadge` extraction, CollapsibleSection adoption across `TournamentListPage`, `TournamentDetailPage`, `TournamentControlPage`).
- **Phase 8** — Final verification (full build, full test suite, visual spot-check across breakpoints, role-gate checks, redirect verification, lint clean).

Both phases are already specified in `plans/ui-redesign-v2.md`. This spec does not modify them.

---

## 12. Open questions deferred to implementation

- Exact name alignment: scenarios persist as `hands` in the legacy schema; the plan doc should confirm whether `playlist_hands` rows referencing scenarios need any adjustment.
- Whether the existing auto-advance 5s countdown UI in `PlaylistsSection` is reusable as a component or should be re-implemented in `ScenarioLaunchPanel`.
- Whether `scenario:armed` payload needs to include `positionMap` pre-computed or lets the existing client-side map builder handle it.

These are resolved during `writing-plans`, not here.
