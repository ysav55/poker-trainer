# Playlist → Table Launch Bridge — Design Spec

**Date:** 2026-04-13 (revised after codebase archaeology)
**Branch:** `feat/ui-redesign-v1`
**Status:** Design approved, awaiting implementation plan
**Phase in master plan:** 6.5 (between Phase 6 / Save-as-Scenario and Phase 7 / Tournament Polish in `plans/ui-redesign-v2.md`)
**Related WIP:** Migration 052 (`scenarios.hero_seat`) already staged in working tree.

---

## 0. Revision note

This spec was rewritten after an initial architecture round discovered substantial existing infrastructure in `server/services/PlaylistExecutionService.js` (drill session lifecycle) and migration 028 (`drill_sessions`, `playlist_items`, `scenarios.v2`, `hands.scenario_id`, `hands.drill_session_id`). The earlier draft proposed a parallel `TablePlaylistController` + `table_playlist_state` table; this version extends what is already there and fills in the deferred "ScenarioDealer" game-engine bridge plus hero-seat support. Decisions captured in the 11-question brainstorm (section 3) are unchanged.

---

## 1. Problem

Scenarios and playlists exist as first-class curriculum objects in the Hand Builder. The drill-session lifecycle (start/pause/resume/advance/cancel/participation) is already wired up via REST and `PlaylistExecutionService`, but three pieces are missing:

- **ScenarioDealer** — the game engine never consumes the scenario returned by `PlaylistExecutionService.getNextScenario()`. The service's own header comment says *"Game engine wiring is deferred — the game engine will consume it in a future phase."*
- **Hero-seat support** — migration 052 adds `scenarios.hero_seat` but no runtime reads it; nothing rotates a scenario's seat template onto real seats anchored at a coach-chosen hero.
- **Launch panel UI** — current `PlaylistsSection.jsx` targets the legacy `playlist_mode` socket flow (replay-style hand loading); it is not wired to `drill_sessions` and does not expose hero mode, ordering, or auto-advance.

This spec closes those three gaps and replaces the sidebar panel. Everything else on `drill_sessions` stays as-is.

---

## 2. Scope

### In scope

- Coach-initiated playlist launch at a `coached_cash` table.
- Server game-engine bridge (`ScenarioDealer`) that consumes the current drill session's scenario at hand-start, rotates the seat template onto real seats anchored at the coach-chosen hero, overrides per-hand stacks + board, and restores stacks on hand complete.
- `drill_sessions` schema extension: `hero_mode`, `hero_player_id`, `auto_advance` columns. Three hero modes — sticky, per-hand, rotate.
- Resume-vs-restart prompt when a paused drill session already exists for a `(table, playlist)` pair.
- New sidebar panel (`ScenarioLaunchPanel`) replacing `PlaylistsSection`. Coach-only.
- REST endpoints extended (not replaced) to accept and return the new fields. A small socket addition for live hero-change / mode-change between hands.

### Explicitly deferred

- Student-initiated launch from bot tables.
- Per-student scenario assignment (`scenario_assignments`).
- Playlist analytics across sessions.
- Legacy `playlist_mode` code path — left untouched. Not deleted in this feature.

---

## 3. Decision log

| Question | Decision |
|---|---|
| Launch unit | Playlist (filtered to scenarios matching active seat count) |
| Match criteria | Exact seat count; non-matching scenarios skipped silently |
| Hero seat | Fixed in builder via `scenarios.hero_seat`; scenario template rotates onto real seats anchored at chosen hero |
| Ordering | Sequential or random; persistent cursor on `drill_sessions` |
| Hero modes | Coach-controlled: sticky / per-hand / rotate |
| State override (per hand) | Stacks override+restore, blinds keep table, board scenario-wins |
| Launch UI | Dedicated sidebar panel, replaces `PlaylistsSection` |
| Advance | Coach toggles auto vs manual |
| Zero-match playlist | Warning banner + manual override ("launch anyway — wait for count") |
| Cursor persistence | Already DB-persisted in `drill_sessions`; coach prompted resume-vs-restart on re-launch |

---

## 4. Architecture

### Reused infrastructure (not modified)

- `drill_sessions` table (migration 028) — status, current_position, items_dealt, items_total, opted_in/out_players, started_at, paused_at, completed_at.
- `playlists` + `playlist_items` (migration 028) — scenario ordering lives here.
- `scenarios` (migration 028) — hole cards per seat, board mode/texture, player_count, `primary_playlist_id` (051), `hero_seat` (052 WIP).
- `PlaylistExecutionService` — `start / getStatus / advance / pause / resume / pick / setParticipation / cancel / getNextScenario`. Service keeps the drill lifecycle; this spec only extends its input/output shape.
- `ScenarioBuilderRepository` — scenario CRUD, already threads `hero_seat` in WIP.
- REST routes `/api/tables/:tableId/drill` (start, get, pause, resume, advance, cancel, pick, participation) — extended, not replaced.

### New modules

```
server/
  game/
    ScenarioDealer.js                NEW — consumes current scenario, maps onto seats, injects config
    mapScenarioToTable.js            NEW — pure seat-rotation function, hero-anchored
  game/controllers/
    CoachedController.js             MODIFIED — calls ScenarioDealer at hand-start, restores stacks at hand-complete
  services/
    PlaylistExecutionService.js      MODIFIED — accept heroMode/heroPlayerId/autoAdvance; persist + return them
  socket/handlers/
    drillSession.js                  NEW — 3 live-update events: scenario:set_hero, scenario:set_mode, scenario:request_resume
  routes/
    scenarioBuilder.js               MODIFIED — /drill endpoints pass the 3 new fields through

supabase/migrations/
  052_scenario_hero_seat.sql         (already WIP in working tree — keep as-is)
  053_drill_session_hero_mode.sql    NEW — add hero_mode, hero_player_id, auto_advance columns

client/src/
  components/sidebar/
    PlaylistsSection.jsx             REPLACED in CoachSidebar composition (file stays for legacy callers)
    ScenarioLaunchPanel.jsx          NEW
  hooks/
    useDrillSession.js               NEW — wraps drill REST + new socket events
```

### Responsibility boundaries

- **`mapScenarioToTable(scenario, activeSeats, chosenHeroRealSeat)`** — pure function returning `{ seatAssignments, dealerSeat }` or `null` on count mismatch. Zero DB/IO deps. Unit-tested in isolation over seat counts 2–9. Hero-anchored rotation only. When `scenario.hero_seat IS NULL`, falls back to first filled seat.
- **`ScenarioDealer`** — glue between `PlaylistExecutionService` and `GameManager`. Called by `CoachedController` at hand-start. Responsibilities: fetch active drill session, call `getNextScenario(tableId, activeCount)`, call `mapScenarioToTable`, call `gm.openConfigPhase` + `gm.updateHandConfig` with `{ mode: 'hybrid', hole_cards, board }`, snapshot pre-hand stacks + override per scenario, emit `scenario:armed` broadcast. At hand-complete: restore stacks, call `PlaylistExecutionService.advance(tableId)`, emit `scenario:progress`.
- **`PlaylistExecutionService`** — grows three optional inputs (`heroMode`, `heroPlayerId`, `autoAdvance`), persists them on `start`, surfaces them on `getStatus`. Everything else unchanged.
- **`CoachedController`** — gains two hook calls: `ScenarioDealer.armIfActive(tableId, gm)` pre-hand, `ScenarioDealer.completeIfActive(tableId, gm, handResult)` post-hand. Keeps its existing `onHandComplete` signature.
- **Socket handler `drillSession.js`** — thin; delegates to `PlaylistExecutionService`. Handles only the live-update events that REST is awkward for: changing hero or mode between hands. Broadcasts go out to the room.
- **`ScenarioLaunchPanel`** — single component, three render states (idle, running, resume-prompt). Coach-only. Uses `useDrillSession` hook which wraps existing REST endpoints (`POST /api/tables/:id/drill`, `PATCH .../pause|resume|cancel|advance`) plus new socket events.
- **`useDrillSession`** — mirror of `useReplay` shape; returns `{ state, launch, pause, resume, advance, cancel, setHero, setMode }`.

### Lifecycle

- Launch: coach POSTs to `/api/tables/:id/drill` with `{ playlist_id, opted_in_players, opted_out_players, hero_mode, hero_player_id, auto_advance }`. Service cancels any prior `active`/`paused` session and creates a fresh row. If a prior `paused` session exists for the same `(table, playlist)`, the REST response flags `resumable: true` and the UI shows the resume-vs-restart prompt; on restart, same POST is re-issued with `force_restart: true`.
- Per hand: `CoachedController` asks `ScenarioDealer` whether a scenario should arm. `ScenarioDealer` calls service `getNextScenario(tableId, activeCount)`; if not null, it arms and broadcasts `scenario:armed`. If null (count mismatch after filter loop), it broadcasts `scenario:skipped` and tells the service to advance; retries up to remaining size; if exhausted, broadcasts `scenario:exhausted` and the dealer stays idle until seat count changes.
- Mid-hand: no state changes take effect; `scenario:set_hero` / `scenario:set_mode` persist and apply next hand.
- Hand complete: stacks restored, cursor advanced via `PlaylistExecutionService.advance`, `scenario:progress` broadcast. If `auto_advance=true` the existing `CoachedController` auto-deal timer fires next hand (reuses prior countdown UX).
- Pause/resume/cancel: REST endpoints. Pause persists position; cancel closes the session.

---

## 5. Data model

### Migration 052 (already staged, uncommitted — keep as-is)

```sql
ALTER TABLE scenarios
  ADD COLUMN IF NOT EXISTS hero_seat SMALLINT
  CHECK (hero_seat IS NULL OR (hero_seat >= 0 AND hero_seat <= 9));
```

### Migration 053 — extend `drill_sessions`

```sql
ALTER TABLE drill_sessions
  ADD COLUMN IF NOT EXISTS hero_mode TEXT NOT NULL DEFAULT 'sticky'
    CHECK (hero_mode IN ('sticky', 'per_hand', 'rotate')),
  ADD COLUMN IF NOT EXISTS hero_player_id UUID
    REFERENCES player_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS auto_advance BOOLEAN NOT NULL DEFAULT false;
```

Field notes:

- `hero_mode` drives who receives the scenario's hero cards on each armed hand. Sticky keeps `hero_player_id` fixed; per-hand requires the coach to pick every hand; rotate cycles through active opted-in players.
- `hero_player_id` is meaningful only in sticky mode. Nullable; set to the player the coach picked on launch. Nullable in per-hand/rotate.
- `auto_advance` controls the auto-deal countdown after `hand_complete`. Default false (manual advance). Coach can flip without relaunch via `scenario:set_mode`.

### No other schema changes

- `scenarios`, `playlists`, `playlist_items`, `hands` all unchanged. `hands.scenario_id` and `hands.drill_session_id` already exist and already get set by existing logging.

---

## 6. Seat rotation algorithm (`mapScenarioToTable`)

### Inputs

- `scenario.seat_configs` — array of `{ seat, cards, stack }`; seat numbers absolute 0–9.
- `scenario.hero_seat` — SMALLINT or null.
- `scenario.dealer_seat` — SMALLINT (from scenario config) or null.
- `activeSeats` — sorted ascending array of real table seats with active non-coach players.
- `chosenHeroRealSeat` — seat on the real table occupied by the player the coach chose as hero.

### Algorithm

1. **Count filter.** If `scenario.seat_configs.length !== activeSeats.length`, return `null`. Caller interprets null as skip.
2. **Sort both sequences.** `templateSeats = sorted(scenario.seat_configs.map(c => c.seat))`; `realSeats = sorted(activeSeats)`.
3. **Resolve hero template seat.** `heroTemplateSeat = scenario.hero_seat ?? <first seat in templateSeats whose cards are non-empty> ?? templateSeats[0]`.
4. **Compute rotation offset.** `heroTemplateIndex = templateSeats.indexOf(heroTemplateSeat)`; `heroRealIndex = realSeats.indexOf(chosenHeroRealSeat)`. For every template index `i`, the target real seat is `realSeats[(heroRealIndex + (i - heroTemplateIndex) + n) % n]` where `n = realSeats.length`.
5. **Build `seatAssignments`.** For each seat_config entry at template index `i`: `{ realSeat: realSeats[...], cards: cfg.cards, stack: cfg.stack, isHero: i === heroTemplateIndex }`.
6. **Derive dealer seat.** `dealerTemplateSeat = scenario.dealer_seat ?? <seat immediately right of hero in templateSeats circular order>`. `dealerIndex = templateSeats.indexOf(dealerTemplateSeat)`. `dealerSeat = realSeats[(heroRealIndex + (dealerIndex - heroTemplateIndex) + n) % n]`.
7. **Return** `{ seatAssignments, dealerSeat }`.

### Properties

- Works for counts 2–9 as long as they match.
- Preserves circular relative order — two players left of the hero in the scenario end up left of the hero at the real table.
- No visual reshuffle: real players stay in their physical seats; only cards, stacks, and dealer button move.
- Pure — no DB, socket, or `gm` dependency. Trivially unit-testable.

### Relationship to `loadScenarioIntoConfig`

The existing `loadScenarioIntoConfig` in `server/socket/services/scenarioService.js` uses dealer-anchored rotation for the legacy `playlist_mode` flow. `ScenarioDealer` does **not** call it — scenario v2 drill sessions need hero-anchored rotation. The two code paths stay separate. Legacy code is untouched.

---

## 7. API surface

### REST — extended (not new endpoints)

- `POST /api/tables/:tableId/drill` — accept `hero_mode`, `hero_player_id`, `auto_advance`, `force_restart`. If prior paused session for same `(table, playlist)` and `force_restart` is falsy, respond `409 { resumable: true, prior_session_id, current_position }` instead of creating. Otherwise create as today.
- `GET /api/tables/:tableId/drill` — response payload gains `hero_mode`, `hero_player_id`, `auto_advance`.
- `PATCH /api/tables/:tableId/drill/pause | resume | advance | cancel` — unchanged.
- `PATCH /api/tables/:tableId/drill/participation` — unchanged.

Auth for all drill endpoints already goes through `canManage` (coach-or-above).

### Socket — new (3 inbound, 3 broadcasts)

| Event | Direction | Payload |
|---|---|---|
| `scenario:set_hero` | in | `{ tableId, playerId }` |
| `scenario:set_mode` | in | `{ tableId, heroMode?, autoAdvance? }` |
| `scenario:request_resume` | in | `{ tableId, playlistId, mode: 'resume' \| 'restart' }` |
| `scenario:armed` | out | `{ scenarioId, seatAssignments, dealerSeat, heroPlayerId }` |
| `scenario:skipped` | out | `{ scenarioId, reason: 'count_mismatch' }` |
| `scenario:progress` | out | `{ position, total, dealt, completed }` |

All inbound events gated by `requireCoach` and `coached_cash` table-mode check.

### Existing socket events — do not repurpose

Legacy `playlist_mode` events (`update_hand_tags`, `create_playlist`, etc. in `playlists.js`) stay untouched. This feature runs alongside them; no events are renamed.

---

## 8. Client UI

Coach-only panel in the sidebar composition. Students never see it. Hidden on `uncoached_cash`, `tournament`, `bot_cash` modes.

### Idle state

- Playlist dropdown — all coach-visible playlists with `PLAYLIST_COLORS` dots.
- Hero dropdown — active opted-in players only; disabled until playlist picked.
- Hero mode radio — sticky / per-hand / rotate.
- Ordering radio — sequential / random. (Service currently reads `playlists.ordering`; panel surfaces this and POSTs override if needed — final wiring confirmed in plan.)
- Auto-advance toggle with seconds readout.
- `Launch` CTA (gold) disabled until playlist + hero picked.
- Zero-match warning when selected playlist has no scenarios fitting active count; exposes "Launch anyway — wait for count" toggle.

### Running state

- Color dot + playlist name + `position / total`.
- Current scenario name.
- Current hero + mode pill.
- Ordering + auto-advance pill.
- Buttons: `Pause`, `Advance →` (manual only), `Swap` (cancels current + re-enters idle).
- Rolling log — last 3 events from `scenario:armed` / `scenario:skipped` / `scenario:progress`.

### Resume prompt

Rendered when `POST /api/tables/:tableId/drill` returns `409 resumable`:
- "`<Playlist Name>` was paused at position `<n / total>`."
- Buttons: `Resume from <n>` (PATCH `/resume`), `Restart` (re-POST with `force_restart: true`).

### Data / hooks

- `useDrillSession()` returns `{ session, launch, pause, resume, advance, cancel, setHero, setMode }` and subscribes to the 3 broadcasts. Internally combines REST calls with socket listeners.
- Playlist list: existing `GET /api/playlists`.
- Active players: existing socket table state.

### Visual language

- `PLAYLIST_COLORS` (already in `components/scenarios/PLAYLIST_COLORS.js`) for dots.
- lucide-react icons: `Play`, `Pause`, `ChevronRight`, `RefreshCw`, `CircleAlert`.
- `colors.js` tokens throughout — zero hardcoded hex.

---

## 9. Edge cases and error handling

**Next scenario does not fit current count.** `ScenarioDealer` calls `PlaylistExecutionService.getNextScenario(tableId, activeCount)`, which already filters by `player_count`. If null, the dealer calls service `advance` and tries again; broadcasts `scenario:skipped` for each skip. Up to `items_total - items_dealt` attempts. If exhausted, broadcasts `scenario:exhausted` and stops arming until seat count changes.

**Zero scenarios fit on launch.** REST `POST` validates after creating the session: if `getNextScenario` returns null immediately, response includes `fit_count: 0`. Panel shows warning; if user enables "Launch anyway", dealer stays idle; re-checks at each hand-start trigger (covers join/leave/sit-out).

**Seat count changes mid-playlist.** Dealer re-filters at every hand-start. Skips accumulate in the log.

**Coach changes hero mid-drill.** `scenario:set_hero` writes `hero_player_id` via `PlaylistExecutionService.updateHeroPlayer` (new one-liner service method) and broadcasts `scenario:progress` to keep clients in sync. Applies next arm; does not retroactively change the in-flight hand.

**Hero leaves table.**
- Sticky: dealer pauses, broadcasts `scenario:error { code: 'hero_absent' }`; panel prompts new hero.
- Per-hand: dealer emits `scenario:error { code: 'hero_required' }` and holds the deal until coach provides one via `scenario:set_hero`.
- Rotate: dealer auto-picks next active opted-in player.

**Hand-config collision.** When dealer arms a scenario, it calls `gm.openConfigPhase` + `gm.updateHandConfig` the same way `loadScenarioIntoConfig` does. The coach's manual `HandConfigPanel` remains functional but shows a "Scenario-driven" readonly banner while armed. Pause re-enables it.

**Stack override.** Pre-hand snapshot stored in-memory on the dealer instance keyed by `tableId + handId`. Override applied via existing `gm.adjustStack(playerId, stack)`. On hand-complete hook, stacks restored from snapshot before any accounting. Chip bank untouched.

**Resume after playlist mutation.** `playlist_items` may have been edited between pause and resume. Service `getNextScenario` uses current playlist_items at call time; if `current_position` index is out-of-range or the scenario at that index no longer fits, it falls through to the eligible filter. No data loss.

**Persistence failure.** DB writes inside `ScenarioDealer.completeIfActive` are best-effort; on failure the dealer logs, keeps in-memory snapshot, retries on next hand. Coach sees `scenario:error { code: 'persist_error' }`.

**Scenario deleted mid-session.** Service returns null; dealer skips and advances.

**Non-coach socket.** All new socket events reject with `scenario:error { code: 'forbidden' }`.

**Non-coached_cash table.** Launch endpoint already requires `canManage`; dealer additionally checks `controller.getMode() === 'coached_cash'` and throws early otherwise.

---

## 10. Testing strategy

### Unit (pure)

- `server/game/__tests__/mapScenarioToTable.test.js` — all counts 2–9, hero anchor correctness, dealer placement, null on mismatch, null-hero fallback, null-dealer fallback.
- `server/game/__tests__/ScenarioDealer.test.js` — arm / skip / exhaust / complete paths with mocked `gm`, `service`, `io`. Stack snapshot + restore.

### Service

- `server/services/__tests__/PlaylistExecutionService.hero.test.js` — hero_mode / hero_player_id / auto_advance round-trip through `start` + `getStatus`. Resume branch returning `resumable: true`.

### Repository — no new tests required (column additions covered by migration apply + service test).

### Route

- `server/routes/__tests__/drillHeroFields.test.js` — POST with new fields persists them; GET returns them; POST without force_restart against paused session returns 409 resumable; POST with force_restart creates fresh.

### Socket

- `server/socket/handlers/__tests__/drillSession.test.js` — coach-only guard, coached_cash-only guard, `set_hero`, `set_mode`, `request_resume`.

### Controller integration

- `server/game/controllers/__tests__/CoachedController.scenario.test.js` — `onHandStart` calls dealer.arm; `onHandComplete` calls dealer.complete; no-op when no active session.

### Client

- `client/src/__tests__/ScenarioLaunchPanel.test.jsx` — idle/running/resume render branches, disabled-launch gating, zero-match warning, override toggle, log cap, `Swap` behavior.
- `client/src/__tests__/useDrillSession.test.js` — REST wiring (mocked `apiFetch`), socket listener accumulation, emit helpers.

### Target

Approx 45–55 new tests across 8 files. Full suite must stay green (currently 1065 passing).

---

## 11. Implementation phasing

One plan, four phases:

1. **Foundation** — migration 053; `mapScenarioToTable` pure function + tests; `PlaylistExecutionService` extension + tests. No game-engine wiring yet.
2. **Game engine bridge** — `ScenarioDealer` + unit tests; `CoachedController` hook calls + controller integration test; route extension for new fields + route test; resume-vs-restart REST branch.
3. **Socket live-update layer** — `drillSession.js` handler with 3 inbound events, 3 broadcasts, guards + tests.
4. **Client panel** — `useDrillSession` hook + tests; `ScenarioLaunchPanel` + tests; replace `PlaylistsSection` slot in `CoachSidebar`; manual verification at a 3-handed coached table.

Each phase ships with its tests and a commit. Master V2 plan gains Phase 6.5 between existing Phases 6 and 7.

### After this feature

Once Phase 6.5 ships green, resume the master V2 plan at:

- **Phase 7** — Tournament polish (token migration, lucide icons, `StatusBadge` extraction, `CollapsibleSection` adoption across the three tournament pages).
- **Phase 8** — Final verification (full build, full test suite, visual spot-check at breakpoints, role-gate checks, redirect verification, lint clean).

Both phases are already specified in `plans/ui-redesign-v2.md`; this spec does not modify them.

---

## 12. Open questions deferred to implementation

- Whether `playlists.ordering` (already persisted on the playlist row) is authoritative or whether the launch POST should accept an override. Plan phase 1 should confirm by reading the playlist row in `PlaylistExecutionService.start`.
- Whether `scenario:armed` needs to include a pre-computed `positionMap` or lets client code derive BTN/SB/BB from `dealerSeat` using existing `buildPositionMap`.
- Final naming of the new service method for hero updates (`updateHeroPlayer` vs inline in `setParticipation`). Plan phase 1 picks one.

These are resolved during plan writing, not here.
