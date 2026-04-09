# Phase 3 — End-to-End Feature Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Each batch is independently deployable. Do not start a batch until the prior one is committed and tests pass.

**Goal:** Fix the remaining staging blockers, ship the core intelligence features (5.1 analysis filters, 5.4 replay branching, 5.5 scenario quick-save), and complete the admin UX gaps (7.2 groups UI, bot table redesign). Every batch is fully vertical — working end-to-end from DB through server to client when merged.

**Architecture:** Node.js/Express + Supabase (server), React/Vite/Tailwind (client). All server changes follow the existing route/repository pattern. All client changes use `apiFetch` for REST and `useSocket`/`useTableSocket` for real-time.

**Constraint:** "Think vertically all the time — things must work end-to-end." Each batch ships a complete user-facing slice, not half-finished pipes.

---

## DB State (Already Applied — no action needed)

Migrations 045–049 are now applied to the production Supabase project:
- `045_password_reset_requests` — unblocks `/api/admin/users/pending-resets`
- `046_fix_tournament_referees_constraint`
- `047_tournament_groups_registration_fields` — adds `buy_in`, `privacy`, `scheduled_at`, `payout_structure`, `late_reg_enabled`, `late_reg_minutes` to `tournament_groups`
- `048_tournament_group_registrations` — new `tournament_group_registrations` table
- `049_tournament_groups_add_cancelled_status`

---

## Batch α — Staging Blockers (Already Coded — commit + test)

These fixes are already written in the working tree. Commit them and verify tests pass.

**Files changed:**
| File | What changed |
|------|-------------|
| `client/src/pages/admin/PrepBriefTab.jsx` | `a.severity?.toFixed(2) ?? '—'` — null guard prevents blank page crash |
| `server/routes/admin/users.js` | `GET /users/:id` — fallback query if nested `player_roles(roles(name))` join errors; `POST /users` — auto-assigns self as coach when creator role is `coach` (1.4) |
| `client/src/pages/admin/UserDetail.jsx` | Add "Reset Password" inline form in user detail panel (1.6) |

**Tasks:**

- [ ] Run `npm test` in server + client; confirm all tests pass
- [ ] Commit: "fix(admin): PrepBriefTab null crash, users/:id defensive fallback, coach auto-assign, CRM reset password"

**Regression targets:** UserDetail renders without 500 for any user; PrepBriefTab renders with null severity; new users created by a coach get coach_id set automatically; admin can reset student passwords from user detail panel.

---

## Batch β — Analysis Page Filters (5.1)

**Problem:** Analysis page (`/analysis`) has a player selector and date range but lacks period quick-picks (7d / 30d / all-time), game type filter (cash vs tournament), and tag-type toggle (all / mistakes / auto / sizing / coach). The server `GET /api/analysis/tags` doesn't support `gameType` or `period` params. This is the core intelligence page and the most-requested feature.

**What already exists:**
- `FilterBar` component with player select, date range from/to, Run button
- `TagDistributionChart` with click-through to `FlaggedHandsPanel`
- `ComparePlayersPanel` for multi-player overlay
- Server `getHandIds({ playerId, dateFrom, dateTo })` helper
- `tagType` param already supported on tag query

**What's missing:**
- Period quick-select buttons (7d / 30d / all-time) that auto-populate `dateFrom`/`dateTo`
- `gameType` filter (`cash` | `tournament` | all) — needs server support in `getHandIds`
- Tag type toggle chips (All / Mistakes / Sizing / Auto / Coach)
- Street breakdown view: for a selected tag, show how it distributes across preflop/flop/turn/river

### Files Changed

| File | Action | Why |
|------|--------|-----|
| `server/routes/analysis.js` | Modify | Add `gameType` param to `getHandIds`; join `hands.table_mode` to filter `bot_cash`/`coached_cash`/`tournament` |
| `client/src/pages/AnalysisPage.jsx` | Modify | Add period quick-pick buttons, gameType segmented control, tag-type toggle; wire new params to API calls |
| `client/src/__tests__/AnalysisPage.test.jsx` | Create | Verify filter combinations produce correct `apiFetch` query strings |

### Task 1 — Server: add `gameType` filter to analysis

**File:** `server/routes/analysis.js`

The `getHandIds` helper queries `hand_players` or `hands`. Add optional `gameType` param that filters by `hands.table_mode`:
- `gameType=cash` → `table_mode IN ('coached_cash', 'uncoached_cash', 'bot_cash')`
- `gameType=tournament` → `table_mode = 'tournament'`
- omitted → no filter

```
async function getHandIds({ playerId, dateFrom, dateTo, gameType } = {})
```

When `playerId` is set: the existing `hand_players` join already has `hands!inner(started_at)` — extend it to also select `hands!inner(started_at, table_mode)` and add a filter on `table_mode`.

When no `playerId`: the existing `hands` query — add `.in('table_mode', [...])` when `gameType` is set.

Both route handlers (`/api/analysis/tags` and `/api/analysis/hands-by-tag`) must extract `gameType` from `req.query` and pass it to `getHandIds`.

- [ ] **Step 1:** Write failing server test in `server/routes/__tests__/analysisRoutes.test.js` verifying `GET /api/analysis/tags?gameType=cash` returns only hands with cash table modes
- [ ] **Step 2:** Extend `getHandIds` to accept and apply `gameType`
- [ ] **Step 3:** Pass `gameType` through both route handlers
- [ ] **Step 4:** Run server tests — confirm new tests pass, existing pass

### Task 2 — Client: period quick-picks + gameType + tag-type toggle

**File:** `client/src/pages/AnalysisPage.jsx`

Add to `FilterBar`:
1. **Period quick-picks** — three pill buttons: `7d`, `30d`, `All time`. Clicking `7d` sets `dateFrom = today - 7 days`, `dateTo = today`. Clicking `All time` clears both. Active pill highlighted in gold.
2. **Game type segmented control** — `All`, `Cash`, `Tournament` pills. Maps to `gameType` param (`''` | `'cash'` | `'tournament'`).
3. **Tag type toggle** — replace the existing raw `tagType` select (if any) with pill chips: `All`, `Mistakes`, `Auto`, `Sizing`, `Coach`.

State shape (add to existing filters):
```js
const [filters, setFilters] = useState({
  playerId: '',
  dateFrom: '',
  dateTo:   '',
  period:   'all',     // 'all' | '7d' | '30d'
  gameType: '',        // '' | 'cash' | 'tournament'
  tagType:  '',        // '' | 'mistake' | 'auto' | 'sizing' | 'coach'
});
```

When `period` changes, compute and set `dateFrom`/`dateTo` accordingly. When `dateFrom`/`dateTo` changed manually, set `period` back to `'custom'`.

Wire `gameType` and `tagType` into the `apiFetch('/api/analysis/tags?...')` call.

- [ ] **Step 1:** Write failing client tests in `client/src/__tests__/AnalysisPage.test.jsx` asserting the correct query strings for 7d, 30d, cash, tournament combinations
- [ ] **Step 2:** Add period pills, gameType pills, tagType pills to FilterBar
- [ ] **Step 3:** Wire new state to API call
- [ ] **Step 4:** Run client tests — confirm pass

---

## Batch γ — Scenario → Playlist Quick-Save (5.5)

**Problem:** After finishing scenario creation in HandBuilder, there's no way to immediately save it to a playlist. You must switch to the Playlists tab, open a playlist, and add from there.

**What already exists:**
- HandBuilder has two tabs: Scenarios and Playlists
- `ScenarioBuilder` component emits `onSaved(scenario)` when a scenario is saved
- `handleScenarioSaved` in HandBuilder.jsx currently just calls `setSelectedScenario(savedScenario)`
- Playlists loaded at mount via `GET /api/playlists`
- Playlist items managed via `POST /api/playlists/:id/items` (or equivalent)

**What's missing:**
- After `onSaved`, show a "Quick-save to playlist" panel with a dropdown of existing playlists + "Save" button
- No server changes needed — existing playlist endpoints cover it

### Files Changed

| File | Action | Why |
|------|--------|-----|
| `client/src/pages/admin/HandBuilder.jsx` | Modify | After scenario save, render `QuickSavePanel` with playlist dropdown |

### Task 1 — QuickSave panel after scenario creation

**File:** `client/src/pages/admin/HandBuilder.jsx`

After `handleScenarioSaved` sets the saved scenario, render a `QuickSavePanel` inline below the ScenarioBuilder area:

```
QuickSavePanel props:
  scenario: { scenario_id, name }
  playlists: [{ playlist_id, name }]
  onSaved: () => void  // hides the panel, shows success toast
```

Panel renders:
- "Save to playlist" label
- `<select>` populated with `playlists` (plus a "Create new playlist..." option that opens the Playlists tab)
- "Save" button — calls `POST /api/playlists/:id/items` with the scenario ID
- "Skip" link — dismisses without saving

API call:
```
POST /api/playlists/{selectedPlaylistId}/items
Body: { scenarioId: scenario.scenario_id }
```

Check what endpoint HandBuilder currently uses to add scenarios to playlists (look in `PlaylistEditor` component) — use the same one.

- [ ] **Step 1:** Read `PlaylistEditor.jsx` and the playlist items server route to confirm the correct endpoint and body format
- [ ] **Step 2:** Write failing test in `client/src/__tests__/HandBuilder.test.jsx` — after scenario save, quick-save panel appears; selecting playlist and clicking Save calls correct endpoint
- [ ] **Step 3:** Add `QuickSavePanel` component and wire `handleScenarioSaved`
- [ ] **Step 4:** Run tests

---

## Batch δ — Replay Branching + Hole Cards (5.4)

**Problem:** The replay tab in ReviewTablePage shows hand history and step controls, but the "branching" feature (try an alternative action at any point and replay from there) has no UI. Hole cards are not shown during replay.

**What already exists:**
- `ReplayEngine.js` — has `branch(state, actionIndex, newAction)` and `unbranch(state)` methods
- Socket handlers: `replay:branch` and `replay:unbranch` events exist (check `server/socket/handlers/replay.js`)
- `useReplay.js` hook — 7 emit helpers including `emitBranch` and `emitUnbranch` (verify)
- `CoachSidebar.jsx` → `ReplayControlsSection` — current replay UI
- `ReviewTablePage` — loads a hand and renders the table + sidebar

**What's missing:**
- Branch button in replay controls ("Try different line here")
- Action picker for the branch point (what to do instead)
- Unbranch button ("Return to original line")
- Hole cards displayed in the hand review view (players' cards visible to the coach/reviewer)

### Files Changed

| File | Action | Why |
|------|--------|-----|
| `server/socket/handlers/replay.js` | Verify / modify | Confirm `replay:branch` and `replay:unbranch` handlers exist and are wired |
| `client/src/hooks/useReplay.js` | Verify / modify | Confirm `emitBranch(actionIndex, newAction)` and `emitUnbranch()` emit helpers exist |
| `client/src/components/sidebar/ReplayControlsSection.jsx` | Modify | Add branch/unbranch buttons; show branch indicator when in branched state |
| `client/src/components/PokerTable.jsx` or `PlayerSeat.jsx` | Modify | Show hole cards when `gameState.mode === 'review'` and cards are present |

### Task 1 — Verify server and hook wiring

- [ ] **Step 1:** Read `server/socket/handlers/replay.js` — confirm `replay:branch` and `replay:unbranch` are handled
- [ ] **Step 2:** Read `client/src/hooks/useReplay.js` — confirm emit helpers exist
- [ ] **Step 3:** If either is missing, add the missing handler/emit — follow the existing `replay:step` pattern exactly

### Task 2 — Branch UI in ReplayControlsSection

**File:** `client/src/components/sidebar/ReplayControlsSection.jsx`

Add:
- "Try alternative line" button (visible when `gameState.isReplaying` and current step is not the last)
- When clicked: show a small action picker (`fold` / `check` / `call` / `raise X`) — raise amount input optional
- Confirm button calls `emitBranch(currentActionIndex, selectedAction)`
- When in branched state (`gameState.isBranched === true`): show gold "BRANCHED LINE" indicator + "Return to original" button that calls `emitUnbranch()`

### Task 3 — Hole cards in review mode

**File:** `client/src/components/PlayerSeat.jsx` (or wherever cards are rendered)

In review mode, hole cards are in `gameState.players[n].hole_cards` (already sent by server in `hand_players` data). Currently these may only render for the acting player. In review mode (coach reviewing a hand), all hole cards should show.

Condition: `gameState.tableMode === 'review'` (or equivalent flag) → render all players' cards face-up.

- [ ] **Step 1:** Inspect how cards are currently rendered and under what condition they show/hide
- [ ] **Step 2:** Add condition: if in review mode, show all hole cards regardless of `is_visible` flag
- [ ] **Step 3:** Smoke-test in a review session

---

## Batch ε — Groups: Member Assignment UI (7.2)

**Problem:** `GroupsSection` in `client/src/pages/settings/SchoolTab.jsx` already handles group create/rename/recolor/delete and is fully wired to the backend. What's missing is **member management** — no UI to add or remove students from a group. The `member_count` is displayed but you can't drill into it.

**What already exists:**
- `GroupsSection` in `SchoolTab.jsx` — full group CRUD, color picker, delete, rename
- Server routes: `POST /api/admin/groups/:id/members` (assign), `DELETE /api/admin/groups/:id/members/:playerId` (remove)
- `GET /api/admin/groups/my-school` returns groups with `player_groups(player_id)` for member IDs
- `GET /api/admin/users?role=coached_student` — list of students to assign

**What's missing:**
- Clicking/expanding a group card reveals its current members + an "Add student" dropdown
- Each member has an "×" remove button
- Student list for the dropdown is fetched once and reused across all groups

### Files Changed

| File | Action | Why |
|------|--------|-----|
| `client/src/pages/settings/SchoolTab.jsx` | Modify | Expand `GroupsSection`: expandable member panel per group, add-student dropdown, remove button |

### Task 1 — Expandable member panel in GroupsSection

**File:** `client/src/pages/settings/SchoolTab.jsx`

1. Add `expandedId` state — which group (if any) is showing its member panel
2. Clicking a group card header toggles expansion
3. Expanded panel:
   - Fetches `GET /api/admin/groups/:id/members` to get member list (name + id)
   - Shows each member as a row: name + "×" remove button → `DELETE /api/admin/groups/:id/members/:playerId`
   - "Add student" row: a `<select>` populated with students not already in the group (from a top-level student list fetched once: `GET /api/admin/users?role=coached_student`) + "Add" button → `POST /api/admin/groups/:id/members`
4. Member list refreshes optimistically on add/remove (no full re-fetch needed — update local state)

**Group member endpoint check:** Verify `GET /api/admin/groups/:id/members` exists. If not, it may be a route that's in `groups.js` but needs confirmation — read the route file first.

- [ ] **Step 1:** Read `server/routes/admin/groups.js` to confirm member GET/POST/DELETE endpoints and their exact paths and response shapes
- [ ] **Step 2:** Write failing test: clicking a group card reveals member list; add/remove calls correct endpoints
- [ ] **Step 3:** Add `expandedId` toggle + member panel to `GroupsSection`
- [ ] **Step 4:** Run tests

---

## Batch ζ — Bot Table: Ghost Seats + Privacy + Auto-Destroy

**Problem:** The bot table model is wrong end-to-end. The "Human Seats" field in the modal controls nothing meaningful (BotTableController always spawns `bot_config.bot_count ?? 1` bots, which is never set). The UX makes no sense for solo practice. Users want a simple flow: enter a table, add bots one at a time as ghost seats, control who sees the table.

**New end-to-end flow:**

**For players (coached_student / solo_student):**
- Modal has 2 options:
  - **Solo** — private table, not listed in the bot lobby; only the creator can see it
  - **Open table** — appears in the bot lobby as `"{displayName}'s table"` with public visibility
- No bot count pre-selection — bots are added inside the table one at a time
- After creation → redirect to `/table/:id`

**For coaches/admin/superadmin:**
- Same 2 options + a **Privacy** row (mirrors existing table creation modal): `Public` / `School only` / specific groups whitelist
- Coach-created tables appear in the lobby for their students (per privacy setting)

**Inside the table (bot_cash mode):**
- Empty seats show a ghost "Add Bot" button (not a real player card)
- Clicking "Add Bot" emits a new socket event `bot:add` → server spawns 1 new bot into the table
- Up to `maxBots` bots (configurable, default 8 total seats minus 1 human = 7)
- No pre-spawned bots at creation time — table starts with just the human

**Auto-destroy:**
- When the last human player disconnects (or their socket drops), BotTableController immediately destroys the table (disconnect all bot sockets, mark status='completed' in DB)
- No grace period — bot tables are ephemeral. User re-opens a new one.

### Architecture Notes

**Server-side changes:**

1. `POST /api/bot-tables`: remove `humanSeats` validation; add `privacy` param (`'solo'` | `'open'` for players; `'public'` | `'school'` | `'private'` for coaches). Set `bot_config.bot_count = 0` (no pre-spawned bots). Auto-name `"{displayName}'s table"` for open tables.

2. `BotTableController`: remove `_spawnBots()` call from constructor; add `addBot()` method that spawns 1 bot socket on demand; watch for `onHumanPlayerCountChange(count)` — when count drops to 0, call `destroy()` immediately.

3. New socket handler in `server/socket/handlers/`: `bot:add` event — validates the emitting user is the table creator, calls `controller.addBot()`.

4. `BotTableRepository.createBotTable`: update privacy logic — accept explicit `privacy` param; for open player tables set privacy=`'public'`; for solo set privacy=`'private'`.

5. `BotTableRepository.getBotTables`: current visibility logic already handles coach vs player; update to reflect new privacy values. Player sees own open tables in lobby (not solo ones).

**Client-side changes:**

1. `BotLobbyPage.jsx` → `CreateBotTableModal`: replace all current fields with 2 tiles (Solo / Open table) + privacy row for coaches. Difficulty and blinds remain.

2. `TablePage.jsx` / `PokerTable.jsx` (bot_cash mode): empty seats render an interactive **AddBotSeat** — "＋ Add Bot" button. Clicking emits `bot:add`. Limit: show "Add Bot" only while total seated < 9 and active bots < some max (e.g. 7). 
   - Note: `GhostSeat.jsx` already exists but it's a **read-only replay component** (shows shadow players from recorded hand history with cards, action badges, etc.). Do NOT reuse it for AddBot — it has incompatible semantics. Instead, handle inline in `PokerTable.jsx` or `PlayerSeat.jsx`: when `tableMode === 'bot_cash'` and seat is empty, render a small "＋ Bot" button instead of the standard empty-seat placeholder.

3. `BotTableController._onHumanCount(count)`: when 0, call `this.destroy()` and also emit `table:closed` so client redirects cleanly.

### Files Changed

| File | Action | Why |
|------|--------|-----|
| `server/routes/botTables.js` | Modify | Accept `privacy` param; drop `humanSeats`; set `bot_count=0` in bot_config |
| `server/db/repositories/BotTableRepository.js` | Modify | Update `createBotTable` privacy logic; update `getBotTables` visibility for new privacy values |
| `server/game/controllers/BotTableController.js` | Modify | Remove startup bot spawn; add `addBot()` method; add human-count watcher + instant destroy |
| `server/socket/handlers/` | Create or modify | `bot:add` handler — validate creator, call controller.addBot() |
| `client/src/pages/BotLobbyPage.jsx` | Modify | New modal: Solo/Open tiles + difficulty + blinds + coach privacy row |
| `client/src/pages/TablePage.jsx` | Modify | In bot_cash mode: render GhostSeat "＋ Add Bot" in empty seats; emit `bot:add` on click; handle `table:closed` redirect |

### Tasks

- [ ] **Step 1:** Read `server/socket/handlers/` directory to understand handler registration pattern (where to add `bot:add`)
- [ ] **Step 2:** Server — update `POST /api/bot-tables` (privacy param, drop humanSeats, bot_count=0)
- [ ] **Step 3:** Server — update `BotTableController`: remove constructor spawn, add `addBot()`, add human-count guard → instant destroy
- [ ] **Step 4:** Server — add `bot:add` socket handler
- [ ] **Step 5:** Client — redesign `CreateBotTableModal` (Solo/Open + coach privacy)
- [ ] **Step 6:** Client — `TablePage` bot_cash mode: GhostSeat component + `bot:add` emit + `table:closed` redirect
- [ ] **Step 7:** Client — each occupied bot seat shows an "×" remove button (bot_cash mode only, visible to the human creator); clicking emits `bot:remove` with the bot's stableId
- [ ] **Step 8:** Server — add `bot:remove` socket handler; `BotTableController.removeBot(stableId)` disconnects that bot's socket and removes it from `_botSockets`; GM handles the player-left state (existing leave flow)
- [ ] **Step 9:** Update/add tests for new bot flow
- [ ] **Step 10:** End-to-end smoke: create solo table → Add Bot → bot joins → hand starts → × removes bot → bot leaves

---

## Execution Order

```
Batch α  →  commit (already coded)
Batch β  →  Analysis filters (highest user priority: "core intelligence system, a must")
Batch γ  →  Scenario quick-save (low complexity, high value)
Batch δ  →  Replay branching + hole cards (needs investigation first)
Batch ε  →  Groups UI (backend fully done; pure frontend)
Batch ζ  →  Bot table redesign (UX polish)
```

---

## Definition of Done (each batch)

- [ ] Feature works end-to-end in the browser (not just in tests)
- [ ] All new tests pass; no existing tests broken
- [ ] No console errors introduced
- [ ] API endpoints have auth middleware
- [ ] Committed on `feat/phase2` branch

---

## Open Questions

1. **Replay branching — server state:** When the server processes `replay:branch`, does it modify the in-memory game state or return a separate ephemeral state? Need to read `replay.js` handler before implementing the UI to avoid a wrong assumption.
2. **Bot table privacy:** Does `POST /api/bot-tables` currently accept a `privacy` field? If not, server route needs updating — which affects migration scope.
3. **Schools/groups 500 on staging:** DB schema is correct, FK exists, no orphaned rows. May be a PostgREST schema cache issue on the Supabase project. Will self-resolve on next schema reload; not blocking code changes.
