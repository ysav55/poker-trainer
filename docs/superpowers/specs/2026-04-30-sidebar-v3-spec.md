# Sidebar v3 — Final Spec

**Status:** approved through brainstorming, awaiting plan
**Branch:** `feat/ui-redesign-v1`
**Toggle today:** `?sidebarV3=1`
**Companion docs:** [discovery doc](../../sidebar-v3-vs-old.md) (block-name reference)

---

## 1. Context & Goals

### Why we're doing this

Sidebar v3 was built in 5 phases on `feat/ui-redesign-v1` and shipped behind a query-param toggle. A side-by-side comparison against the old `CoachSidebar.jsx` revealed:
- Major coaching workflows are missing (undo, equity toggles, share-range, replay scrubber, hand library, playlist CRUD, drill controls).
- v3 has duplicated verbs (sit / kick / add-bot / adjust-stack each in 3 places).
- Several disabled stubs erode trust ("Phase X" labels everywhere).
- Naming drift between code (`settings`) and UI (`Setup`).
- Old behaviors that are dead in v3 (action_log_card, annotations) coexist with new behaviors (decision tree, perspective, save-as-drill).

This spec consolidates the discovery into a final shape, rationalizes the duplications, ports missing functionality, and lays out the rollout from "v3 behind flag" to "v3 is the only sidebar".

### Goals (north star)

1. **Coach-first surface.** Every coaching verb reachable in ≤ 2 clicks from any tab.
2. **No fake controls.** Every visible button does something on day-of-ship.
3. **One canonical owner per verb.** Setup tab owns destructive verbs (kick, adjust, add-bot); Live tab is read-mostly.
4. **Reads cheap, writes deliberate.** Live tab is informational + sit-out; mutations require Setup navigation.
5. **Persistent context.** Coach refreshes mid-session, lands back on the same tab.

### Out of scope (parked)

- Multi-tab broadcast for notes (single-coach lock makes this moot).
- Multi-hand drill builder UI (`drills.build_form` stays hidden).
- Drill stats results store (server-side aggregation of correct/mistake/uncertain).
- Tournament-mode v3 sidebar.
- Localization beyond English.
- Visual regression tests, Lighthouse audit, multi-browser E2E.

---

## 2. Decisions ledger (Steps 1–3)

### 2.1 Tier A–D — missing features ported to v3 (ADD)

| ID | Feature | Old block | v3 home |
|---|---|---|---|
| A1 | Sidebar collapse / expand | edge button | chrome left edge, persisted in `localStorage['fs.sb3.collapsed']` |
| B3 | Reset hand | `GameControlsSection` | `footer.live` |
| H1 | Undo last action | `UndoControlsSection` | `footer.live` |
| H2 | Rollback street | `UndoControlsSection` | `footer.live` overflow menu |
| G1 | Coach equity toggle | `GameControlsSection` | `live.equity_toggles` |
| G2 | Players equity toggle | `GameControlsSection` | `live.equity_toggles` |
| G4 | Share Range modal | `GameControlsSection` | `live.share_range_dialog`, button in `live.equity_toggles` |
| K2 | Timeline scrubber | `ReplayControlsSection` | `review.scrubber` |
| K3 | Auto-play replay | `ReplayControlsSection` | `review.scrubber` |
| K4 | Speed control (0.5×/1×/2×/4×) | `ReplayControlsSection` | `review.scrubber` |
| I1 | Search hands by text | `HandLibrarySection` | `drills.hands.search_bar` (Drills tab Hands sub-mode) |
| I2 | Filter library by range matrix | `HandLibrarySection` | `drills.hands.range_filter` |
| I3 | Load hand as scenario (keep / historical stacks) | `HandLibrarySection` | `drills.hands.list` Load menu |
| I4 | Add hand to playlist from library | `HandLibrarySection` | `drills.hands.list` Load menu → Add to Playlist |
| J2 | Inline hand-detail expand in History | `HistorySection` | `history.hand_card.detail_expand` (ephemeral, no URL sync) |
| J4 | Manual refresh button on History | `HistorySection` | `history.refresh_button` |
| L1 | Create playlist | `PlaylistsSection` | `drills.library.playlist_admin` (+ New Playlist) |
| L2 | Delete playlist | `PlaylistsSection` | `drills.library.playlist_admin` (… menu) |
| M1 | Coach Play / Monitor toggle | `PlaylistsSection` | `drills.session.coach_role_toggle` |
| M2 | Auto-start countdown + cancel | `PlaylistsSection` | `drills.session.countdown_banner` |
| M3 | Resume playlist after pause | `PlaylistsSection` | `drills.session.countdown_banner` |
| M6 | Pause / Resume drill mid-session | `PlaylistsSection` | `drills.session.runner` controls |
| M8 | Drill log (last 3 events) | `PlaylistsSection` | `drills.session.event_log` |
| M10 | ScenarioLaunchPanel | `ScenarioLaunchPanel` | `drills.launch_panel` |

### 2.2 Tier E — disabled stubs decided

| ID | Stub | Verdict | Notes |
|---|---|---|---|
| E1 | Tag Hand button | SHIP | Dialog UI + wire existing `coach:update_hand_tags` |
| E2 | Export CSV/Excel | SHIP | Format picker dialog: CSV per-hand + Excel multi-sheet aggregated report |
| E3 | Clear (Drills) | DROP | Footer removed entirely (E4 footer rationalization, option a) |
| E4 | Launch Hand | DROP | Footer removed entirely |
| E5 | Next Spot (Advance Drill) | SHIP | Server adds `coach:manual_advance_spot`; gated by `auto_advance=false + phase=waiting` |
| E6 | Adjust Stack on Live tab | DROP | D4 cascade: setup-only |
| E7 | Reset table config | RESHAPE → "Discard Pending" | Only meaningful for blinds-batching path |
| E8 | Apply Next Hand | RESHAPE → "Apply at Next Hand" | Blinds-only batching (option b) |
| E9 | Save Scenario form | DROP for now | DrillBuild stays hidden; v3 doesn't ship multi-hand builder |

### 2.3 Naming consolidations (Step 2)

| Layer | Item | Final |
|---|---|---|
| Tab id rename | `settings` | `setup` (T5) |
| Status pill | new state | DRILL (yellow) — S5 |
| Block ID | `live.bet_status_card` → `live.hand_status_card` (B1) | |
| Block ID | `live.configure_hand_card` → `live.hand_config_card` (B2) | |
| Block ID | `live.table_roster_card` → `live.seats_card` (B3) | |
| Block ID | `live.action_feed_card` → `live.action_log_card` (B4) | |
| Block ID | `setup.seats.detail_card` → `setup.seats.editor` (B5) | |
| Block ID | `setup.players.add_bot_card` → `setup.players.bot_picker` (B6) — but Players sub-mode dropped (V12 cascade); name reserved for any orphan reference | |
| Block ID | `review.save_branch_card` → `review.save_to_drill_card` (B7) | |
| Block ID | `drills.session.active_card` → `drills.session.runner` (B8) | |
| Button copy | `Next Hand →` → `Deal Next Hand →` (C1) | |
| Button copy | `Next Spot →` → `Advance Drill →` (C2) | |
| Button copy | `Save this hand to a drill` → `Save as Drill Hand` (C3) | |
| Button copy | `Review Selected →` → `Open in Review →` (C5) | |
| Button copy | `Exit Replay → Live` → `Back to Live` (C6) | |
| Button copy | `← History` → `← Back` (C7) | |
| Button copy | `Apply Next Hand →` → `Apply at Next Hand →` (C8) | |
| Button copy | `Reset` → `Discard Pending` (C9) | |
| Button copy | `📝 Notes` (NEW — C11) | |

### 2.4 Triaged v3 additions (Step 3)

KEEP: V2 Board texture constraints; V3 Apply Now/Next-Hand auto-detect; V4 Quick range presets; V5 Decision tree; V6 Perspective selector; V7 Street jump buttons; V8 Save as Drill Hand; V9 Filter chips; V10 Session stats tiles; V12 Setup seats grid + editor (final shape); V13 Cash blind presets; V16 Persistent active tab; V17 StatusPill; V18 5-tab structure.

CUT: V1 Hybrid mode (redundant — unset cards = RNG already); V11 History Players sub-view (live mode hides anyway); V14 Separate SB input (back to BB-only, SB auto = BB/2); V15 Drill stats tiles (misleading zeros); X1–X4 chopping-block items (X4 `live.action_log_card` reverted — KEEP).

### 2.5 Duplications resolved (Step 3 Section B)

| Verb | Canonical home |
|---|---|
| Sit-out / Sit-in | All 3 surfaces kept (`live.seats_card`, `setup.seats.editor`, `setup.players.roster` — but Players sub-mode dropped, so 2 surfaces effectively); unified ⏸/▶ icon |
| Add bot | `setup.seats.editor` only |
| Kick player | `setup.seats.editor` only |
| Adjust stack | `setup.seats.editor` only (E6 dropped) |

### 2.6 Notes feature (replaces K5–K7)

| Decision | Value |
|---|---|
| Cardinality | Multiple editable notes per hand (N1.c) |
| Visibility | School-coach team — all coaches at the same school see; students never (N2.b) |
| Edit timing | Live (current hand), Review tab — both full edit. History card is preview-only popover, no edit (refinement of N3.b agreed during Section 3 review: reduce accidental writes during scanning). |
| Format | Plaintext, 500 char limit (N4.a) |
| UI surface on Live | Inline panel above footer (N5.a) |
| Migration of old annotations | DROP entirely — no backfill (N6.a) |

---

## 3. Architecture

### 3.1 Code structure

- Mounted from [client/src/pages/TablePage.jsx](../../../client/src/pages/TablePage.jsx) — `?sidebarV3=1` toggle stays through Phases A–D, becomes default in Phase E with `?sidebarV3=0` escape hatch.
- Root: [client/src/components/sidebar-v3/Sidebar.jsx](../../../client/src/components/sidebar-v3/Sidebar.jsx).
- Tabs in [client/src/components/sidebar-v3/](../../../client/src/components/sidebar-v3/) — one file per tab, plus `shared.jsx` for primitives.
- Adapter: [buildLiveData.js](../../../client/src/components/sidebar-v3/buildLiveData.js) — single source for `data` shape passed to all tabs.
- Hooks reused as-is: useSocket, useGameState, useReplay, usePlaylistManager, useNotifications.
- New hook: `useNotes(handId)`.

### 3.2 File-layout deltas

```
client/src/components/sidebar-v3/
├── Sidebar.jsx                   (modified: tab id rename, footer copy, sidebar collapse)
├── shared.jsx                    (modified: StatusPill +DRILL, drop subtitle prop)
├── TabLive.jsx                   (modified: drop add-bot/kick/adjust icons; restore action_log; add notes/equity/share-range/undo/reset)
├── TabDrills.jsx                 (modified: 3-segment Playlists/Hands/Session; coach role toggle; countdown banner; event log; launch panel; playlist admin)
├── TabHistory.jsx                (modified: drop Players sub-mode; refresh button; per-card notes pip; inline detail expand)
├── TabReview.jsx                 (modified: scrubber/autoplay/speed; notes panel)
├── TabSetup.jsx                  (renamed from TabSettings; modified: drop Players sub-mode; merge into Seats; pending-blinds banner; revert SB/BB to BB-only)
├── LiveConfigureHand.jsx         (modified: drop Hybrid mode option)
├── NotesPanel.jsx                (NEW)
├── TagDialog.jsx                 (NEW — for E1)
├── ExportDialog.jsx              (NEW — for E2)
├── ShareRangeDialog.jsx          (NEW — port from old GameControlsSection)
├── ScrubberStrip.jsx             (NEW — replay timeline + autoplay + speed)
├── EquityToggleRow.jsx           (NEW — coach/players + share-range button)
├── CountdownBanner.jsx           (NEW — auto-start drill countdown)
├── EventLog.jsx                  (NEW — drill log, last 3 events)
├── LaunchPanel.jsx               (NEW — pre-launch drill config)
├── PlaylistAdmin.jsx             (NEW — + new playlist, … rename/delete menu)
├── CoachRoleToggle.jsx           (NEW — Play / Monitor toggle in active drill)
├── HandsLibrary.jsx              (NEW — search + range filter + load-as-scenario)
└── PendingBlindsBanner.jsx       (NEW — for E7/E8 batch model)
```

### 3.3 Server-side touchpoints

- `server/socket/handlers/coachControls.js` — add new events (Section 5.1).
- `server/socket/handlers/joinRoom.js` + `disconnect.js` — single-coach lock.
- `server/routes/notes.js` — NEW.
- `server/routes/hands.js` — modify (add `GET /api/hands/library`).
- `server/routes/exports.js` — NEW.
- `server/db/repositories/HandNotesRepository.js` — NEW.
- `server/db/repositories/HandRepository.js` — modify (add `searchLibrary`).
- DROP: `server/routes/annotations.js`, any annotation-related repo methods.

### 3.4 State & persistence

| Surface | Source | Notes |
|---|---|---|
| Active tab | `localStorage['fs.sb3.tab']` | Migrate `'settings' → 'setup'` once on mount |
| Sidebar collapsed | `localStorage['fs.sb3.collapsed']` | NEW |
| Game state | socket `gameState` via `useGameState` | Adapter `buildLiveData` extends with `pending_blinds`, `actions_log`, `notes_counts`, `drill_event_log` |
| Notes | REST `useNotes(handId)` | 60s stale-while-revalidate per handId |
| Pending blinds | server `SharedState.pendingBlinds: Map<tableId, {sb,bb,queuedBy,queuedAt}>` | In-memory; survives until table close, server restart, or 1h timeout |
| Single-coach lock | server `SharedState.activeCoachLocks: Map<tableId, coachStableId>` | In-memory; released on socket disconnect |
| Permissions cache | existing 5-min TTL | Unchanged |

---

## 4. Tab-by-tab final layout

Block IDs use consolidated names from Section 2.3.

### 4.1 Live tab

```
header.bar                      [ FeltSide ] [ status_pill ]
tabs.bar                        [ Live ] [ Drills ] [ History ] [ Review ] [ Setup ]

live.hand_status_card           phase · #N · pot · on-clock · timer · board

live.hand_config_card           mode segment: [ RNG | Manual ]    (Hybrid REMOVED)
                                target picker · card grid / range matrix · texture chips
                                quick presets (range mode): Top 5%  Top 15%  Pairs  Suited  Clear
                                [ Apply Now ] / [ Apply Next Hand ]   (auto-detect)

live.equity_card
  └─ live.equity_toggles        [ Show Coach ] [ Show Players ] [ ⬡ Share Range ]
  per-player equity bars

live.seats_card  (READ-MOSTLY)  per seat: # · name · stack · badges · [ ⏸/▶ ]
                                NO add-bot, kick, adjust on Live (canonical = Setup)

live.action_log_card            newest action first; phase + player + verb + amount

live.notes_panel                collapsed by default; opens above footer when 📝 clicked

footer.live                     [ ▶/❚❚ Pause ] [ ⚑ Tag Hand ] [ 📝 Notes ]
                                [ ↶ Undo ] [ ↺ Reset ] [ Deal Next Hand → ]

                                If footer overflow, collapse Tag/Notes/Undo/Rollback/Reset
                                into a ⋯ menu; keep Pause + Deal Next Hand as primaries.
```

`Reset Hand` (B3) emits `coach:reset_hand`. `Undo` (H1) emits `coach:undo_action`. `Rollback Street` (H2) lives in the overflow menu and emits `coach:rollback_street`. All three handlers exist server-side already.

### 4.2 Drills tab

```
header.bar (same)
tabs.bar (same)

drills.mode_segment             [ Playlists | Hands | Session ]   (3-way)

── Playlists mode:
   drills.library.playlist_admin  [ + New Playlist ] (header) + per-row ⋯ menu (rename/delete)
   drills.library.playlist_list   each row: name · count · [ Load ▾ ]
   drills.launch_panel            shown when row selected:
                                   hero mode: [ sticky | per_hand | rotate ]
                                   order:     [ sequential | random ]
                                   [x] Auto-advance       [ ] Allow zero match
                                   [ Launch → ]

── Hands mode (NEW):
   drills.hands.search_bar       [ search hands... ] [ ⬡ Filter by Range ]
   drills.hands.range_filter     collapsible RangeMatrix (existing component)
   drills.hands.list             rows: hand-group · winner · pot · auto-tags · [ Load ▾ ]
                                  Load menu: Load (Keep Stacks) | Load (Historical) | Add to Playlist…

── Session mode:
   drills.session.countdown_banner   "▶ Auto-starting next hand in 5s" + [ Cancel ]
                                      paused state: [ Resume Drill ]

   drills.session.runner             coach_role_toggle: [ Play ] [ Monitor 👁 ]
                                     scenario name · spot description
                                     [ End Drill ]  [ Advance Drill → ]
                                     drills.session.event_log  (last 3 events)

footer.drills                     REMOVED — Drills tab uses no footer.
```

### 4.3 History tab

```
header.bar (same)
tabs.bar (same)

history.session_stats_card      Net / Won / Lost / Biggest Pot / Hands count

history.toolbar                 [ ↻ refresh ] [ All | Won | Lost | Showdown ]

history.hand_strip              horizontal scroll of hand cards
  per card:
    #N · ●Live or net P&L · hero hole cards · board · action summary · pot
    history.hand_card.notes_pip       📝N (only if count > 0; click → read-only popover)
    history.hand_card.detail_expand   click card → inline expand (ephemeral, no URL sync)

footer.history                  [ ↓ Export ▾ ] [ Open in Review → ]
                                Export ▾ → history.export_dialog (CSV / Excel format radio)
```

### 4.4 Review tab

```
header.bar (same)
tabs.bar (same)

review.replay_header            perspective chips · cursor counter · branched badge · ← Live

review.scrubber                 [◀] [▶/❚❚]  [============●============]  speed: 0.5× 1× 2× 4×

review.replay_controls          [ ‹ Prev ] [ Next › ]
                                streets: [ Preflop ] [ Flop ] [ Turn ] [ River ]
                                [ Play From Here ] / [ Back to Replay ]

review.decision_tree            clickable per-action timeline; "now" pin on cursor

review.notes_panel              collapsible; shows + add/edit/delete notes for the hand

review.save_to_drill_card       [ Save as Drill Hand ]
                                opens chip-pick playlist OR + New Playlist inline

footer.review                   [ ← Back ] [ Back to Live ]
```

### 4.5 Setup tab

```
header.bar (same)
tabs.bar (same)

setup.section_segment           [ Blinds | Seats ]   (Players sub-mode REMOVED)

── Blinds:
   setup.blinds.pending_banner  shown when phase ≠ waiting + dirty:
                                "Blinds change queued: 50/100 → 100/200 (applies at next hand)"
                                [ Discard Pending ]

   setup.blinds.current_card    BB input only (SB auto = BB/2)
                                validation: BB > 0 integer
                                [ Apply Now ]            (phase = waiting)
                                [ Apply at Next Hand → ] (phase ≠ waiting)

   setup.blinds.cash_presets    Level 1..N rows (one click = apply or queue)

── Seats:
   setup.seats.map_grid         3-col grid of 9 cells; seat# · name · stack · badge
                                empty = dashed border; click selects

   setup.seats.editor           opens below for selected cell
     EMPTY:    difficulty picker · [ + Add Bot to seat N ]
     OCCUPIED: name · stack · status · [ Edit Stack ] [ Sit In/Out ] [ Kick ]

footer.setup                    REMOVED — Apply lives inside the Blinds section.
```

### 4.6 Chrome / cross-cutting

| Region | Final state |
|---|---|
| Sidebar collapse (A1) | edge button left of sidebar; toggles 0–24px ↔ 360px; `localStorage['fs.sb3.collapsed']` |
| `header.bar` | logo + status pill only (subtitle removed — X3) |
| `header.status_pill` priority | REVIEW > DRILL > SCENARIO > PAUSED > LIVE |
| `tabs.bar` | 5 tabs unchanged: Live / Drills / History / Review / Setup |
| Footer presence | Live (6 actions) · Drills (none) · History (2) · Review (2) · Setup (none) |
| New dialogs | `live.tag_dialog`, `live.share_range_dialog`, `history.export_dialog` |
| New panels | `live.notes_panel`, `review.notes_panel`, `live.equity_toggles`, `setup.blinds.pending_banner` |
| Removed | Hybrid mode, drill stats tiles, History Players sub-view, Setup Players sub-mode, header subtitle, drills footer, setup footer, drills.build_form (stays hidden), separate SB input, Live add-bot/kick/adjust stubs, action_feed phase-2 placeholder (replaced by real action log) |

---

## 5. Cross-cutting features

### 5.1 Notes (Coach hand notes)

**Component:** `NotesPanel.jsx` (shared, mode-driven: `inline-live` | `review` | `preview`).
**Hook:** `useNotes(handId)` — wraps REST CRUD; 60s stale-while-revalidate per handId.

**Surfaces (per N3.b):**

| Surface | Mode | Behavior |
|---|---|---|
| `live.notes_panel` | `inline-live` | Collapsed below `live.seats_card`. 📝 in `footer.live` expands inline. Bound to current `gameState.hand_id`. Add/edit/delete. Auto-collapses on hand change (warns if unsaved draft). |
| `review.notes_panel` | `review` | Always rendered when hand is loaded in Review. Bound to `selectedHandId`. Add/edit/delete. |
| `history.hand_card.notes_pip` | `preview` (read-only) | 📝N pip on cards with notes. Click → small popover (first 3 notes + "see more in Review"). No edit. |

**Note record (server):**
```
{ id, hand_id, school_id, author_player_id, author_name, body, created_at, updated_at }
```

**Per-note UI:** author + relative timestamp at top, plaintext body (line breaks preserved), `[edit]` toggles inline textarea, `[×]` opens browser confirm.

**RBAC:** read + write require `requireRole('coach')` (hierarchy-aware) AND school_id match. Students never see. Coaches at same school can edit each other's notes (school-team trust model).

### 5.2 Sidebar collapse (A1)

- Edge button: vertical strip (24×60px) on LEFT side of sidebar. `<` when expanded, `>` when collapsed.
- Expanded: 360px (current). Collapsed: 24px (edge stays clickable).
- Persisted: `localStorage['fs.sb3.collapsed']` boolean.
- Animation: 200ms ease.
- Children unmount when collapsed; re-mount on expand (tab state preserved via localStorage).

### 5.3 Status pill states

Mutually exclusive. Priority chain (top wins):

| State | Color | Trigger |
|---|---|---|
| REVIEW | blue | `data.replay.active === true` |
| DRILL | yellow | `data.playlist.active === true && !replay.active` (NEW — S5) |
| SCENARIO | purple | `data.handConfig.has_overrides && phase === 'waiting'` |
| PAUSED | orange | `gameState.is_paused === true` |
| LIVE | green | default |

### 5.4 Dialogs

All share a base `Dialog.jsx` primitive (centered, backdrop closes, Esc closes, primary gold, cancel ghost).

| Dialog | Trigger | Body | Submit |
|---|---|---|---|
| `live.tag_dialog` (E1) | `⚑ Tag Hand` | chip list of tags + add custom; toggle on current `gameState.hand_id` | `coach:update_hand_tags { hand_id, tags: [...] }` |
| `history.export_dialog` (E2) | `↓ Export ▾` | format radio: CSV (per-hand rows) / Excel (multi-sheet aggregated report) | `GET /api/exports/hands?tableId&format=csv\|xlsx` → download |
| `live.share_range_dialog` (G4) | `⬡ Share Range` in `live.equity_toggles` | label input + RangeMatrix (existing) | `coach:share_range { groups, label }` |

### 5.5 Pending Blinds banner (E7/E8)

**Component:** `PendingBlindsBanner.jsx` — only mounted in `setup.blinds`.

**Behavior:**
- Render gate: form (sb,bb) ≠ live (sb,bb) AND `gameState.phase !== 'waiting'`.
- Display: `Blinds change queued: 50/100 → 100/200 (applies at next hand)` + `[ Discard Pending ]`.
- `Apply at Next Hand →` button emits `coach:apply_blinds_at_next_hand { sb, bb }`.
- Server queues delta in `SharedState.pendingBlinds`. On `phase: → waiting`, `GameManager` checks and applies.
- `Discard Pending` reverts form to live values + emits `coach:discard_pending_blinds`.
- If `phase === 'waiting'` from start → button reads `Apply Now` and applies immediately via existing `coach:set_blind_levels`.
- Stale guard: if `queuedAt` > 1h, server discards on next reset and emits `pending_blinds_expired`.

---

## 6. Data model + migrations

### 6.1 Migration `064_hand_notes.sql` (NEW)

```sql
-- hand_notes — coach hand-level notes (school-scoped read/write)
BEGIN;

CREATE TABLE IF NOT EXISTS hand_notes (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  hand_id            UUID         NOT NULL REFERENCES hands(hand_id) ON DELETE CASCADE,
  school_id          UUID         NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  author_player_id   UUID         REFERENCES player_profiles(id) ON DELETE SET NULL,
  body               TEXT         NOT NULL CHECK (char_length(body) > 0 AND char_length(body) <= 500),
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hand_notes_hand_id   ON hand_notes (hand_id);
CREATE INDEX IF NOT EXISTS idx_hand_notes_school_id ON hand_notes (school_id);

COMMIT;
```

Cascade behavior:
- Hand deleted → notes deleted.
- School deleted → notes deleted.
- Author player deleted → `author_player_id` NULL; UI renders "Coach (deleted)".

### 6.2 Migration `065_drop_hand_annotations.sql`

```sql
BEGIN;
DROP TABLE IF EXISTS hand_annotations CASCADE;
COMMIT;
```

No backfill (per N6.a — confirmed no production payload).

Same PR deletes:
- `server/routes/annotations.js`
- `app.use('/api/annotations'...)` registration
- Old client annotation UI in `client/src/components/sidebar/ReplayControlsSection.jsx` (which dies entirely at Phase E cutover)

### 6.3 Pending blinds — in-memory only

```js
// server/state/SharedState.js — extend
const pendingBlinds = new Map();  // tableId → { sb, bb, queuedBy, queuedAt }
```

Surfaced via `gameState.pending_blinds: null | {...}` for the table the user is viewing.

Single-pending rule: re-queue overwrites. Server restart wipes (acceptable; coach re-queues).

### 6.4 Single-coach lock — in-memory only

```js
// server/state/SharedState.js — extend
const activeCoachLocks = new Map();  // tableId → coachStableId
```

Released on socket disconnect when last socket from that stableId leaves the room.

### 6.5 Repository changes

**NEW: `server/db/repositories/HandNotesRepository.js`**
```
listForHand(handId, schoolId)            → Promise<Note[]>
create(handId, schoolId, authorPlayerId, body) → Promise<Note>
update(noteId, schoolId, body)           → Promise<Note>     (school-scoped guard)
delete(noteId, schoolId)                 → Promise<void>     (school-scoped guard)
countForHand(handId, schoolId)           → Promise<number>   (for notes_pip badge)
batchCounts(handIds, schoolId)           → Promise<Map<handId, number>>
```

**MODIFIED: `server/db/repositories/HandRepository.js`** — add `searchLibrary({ schoolId, query, rangeFilter, limit, offset })`.

**DROPPED:** any `AnnotationRepository.js` and imports.

---

## 7. Server contracts

### 7.1 NEW socket events

All in `server/socket/handlers/coachControls.js`. Wrapped by existing `requireCoach(socket, action)` + school-scope checks where needed.

| Event | Payload | Behavior | Backs |
|---|---|---|---|
| `coach:apply_blinds_at_next_hand` | `{ tableId, sb, bb }` | Validate (int>0, sb<bb, in-hand). Store in `pendingBlinds`. Broadcast `pending_blinds_updated`. | E8 |
| `coach:discard_pending_blinds` | `{ tableId }` | `pendingBlinds.delete(tableId)`. Broadcast `pending_blinds_updated` (null). | E7 |
| `coach:share_range` | `{ tableId, groups: string[], label: string }` | Persist in `tableSharedRanges` Map; broadcast `range_shared` to non-coach sockets in room. Cleared on hand reset. | G4 |
| `coach:set_equity_visibility_coach` | `{ tableId, visible: boolean }` | `SharedState.equityVisibility[tableId].coach = visible`. | G1 |
| `coach:set_equity_visibility_players` | `{ tableId, visible: boolean }` | `SharedState.equityVisibility[tableId].players = visible`. Reuses existing `coach:toggle_equity_display` if compatible — else new event. | G2 |
| `coach:manual_advance_spot` | `{ tableId }` | Guards: drill active + `auto_advance === false` + phase=waiting. Calls `PlaylistExecutionService.advance(tableId)`. Acks `{ ok: true }` or `{ error }`. | E5 |

### 7.2 Existing socket events — wiring only

| Event | v3 surface |
|---|---|
| `coach:update_hand_tags` | `live.tag_dialog` (E1 — needs client wiring) |
| `coach:adjust_stack` | `setup.seats.editor` |
| `coach:add_bot` | `setup.seats.editor` |
| `coach:kick_player` | `setup.seats.editor` |
| `coach:set_player_in_hand` | `live.seats_card`, `setup.seats.editor`, `drills.session.coach_role_toggle` |
| `coach:set_blind_levels` | `setup.blinds.current_card` Apply Now path (phase=waiting) |
| `coach:start_configured_hand` | `footer.live` Deal Next Hand |
| `coach:reset_hand` | `footer.live` Reset (B3) — needs client wiring |
| `coach:undo_action` | `footer.live` Undo (H1) — needs client wiring |
| `coach:rollback_street` | overflow menu (H2) — needs client wiring |
| `coach:branch_to_drill` | `review.save_to_drill_card` |
| `coach:activate_playlist` / `coach:deactivate_playlist` | `drills.library.playlist_list`, `drills.session.runner` |
| `coach:toggle_pause` | `footer.live` Pause |
| `coach:set_mode` | `live.hand_config_card` mode segment |
| `coach:update_hand_config` | `live.hand_config_card` Apply |
| `replay:*` (step/jump/branch/unbranch/exit/load) | Review tab |

### 7.3 NEW REST endpoints

All under `/api`. JWT-required + `requireRole('coach')`.

#### Notes — `server/routes/notes.js`

| Method | Path | Body | Returns | Guards |
|---|---|---|---|---|
| GET | `/api/hands/:handId/notes` | — | `{ notes: Note[] }` | school-match |
| POST | `/api/hands/:handId/notes` | `{ body }` | `{ note }` (201) | school-match + body 1–500 chars trimmed |
| PATCH | `/api/notes/:noteId` | `{ body }` | `{ note }` | school-match (any same-school coach can edit) |
| DELETE | `/api/notes/:noteId` | — | 204 | school-match |
| POST | `/api/hands/notes-counts` | `{ handIds: [] }` | `{ counts: { handId: number } }` | school-match (batched for `notes_pip`) |

#### Hand library — `server/routes/hands.js` (modify)

| Method | Path | Query | Returns |
|---|---|---|---|
| GET | `/api/hands/library` | `?q=text&range=AKo,QQ&limit=20&offset=0` | `{ hands: HandSummary[], total }` |

Server-side scope: hands belonging to coach's school. Filters: text matches winner name / hand_id / auto_tag; range matches hands where any in-hand player has a hole-card combo group in filter set. `limit` clamped to 100.

#### Exports — `server/routes/exports.js` (NEW)

| Method | Path | Query | Returns |
|---|---|---|---|
| GET | `/api/exports/hands` | `?tableId=...&format=csv\|xlsx` | file stream w/ Content-Type + Content-Disposition |

`format=csv` → per-hand columns: `hand_id, started_at, phase_ended, winner, pot, board, action_count, auto_tags`.
`format=xlsx` → `exceljs` workbook (4 sheets):
- **Hands** — same as CSV columns
- **Stats** — per-player VPIP / PFR / W$SD / hands count / net P&L
- **Auto-tag breakdown** — tag → count, sorted desc
- **Players** — name, hands played, net, biggest pot, peak EV

Streamed via `worksheet.commit()` for memory efficiency.

### 7.4 REMOVED REST endpoints

`POST /api/hands/:id/annotations`, `GET /api/hands/:id/annotations`, `DELETE /api/annotations/:id`, all routes under `/api/annotations` — drop in same PR as migration `065`.

### 7.5 Adapter (`buildLiveData.js`) shape additions

```js
{
  ...existing fields,
  status: 'live' | 'paused' | 'scenario' | 'review' | 'drill',
  pending_blinds: null | { sb, bb, queuedBy, queuedAt },
  shared_range: null | { groups, label, broadcastedAt },
  actions_log: HandAction[],
  notes_counts: Record<handId, number>,
  drill_event_log: { ts, type, message }[],
}
```

### 7.6 Drill log (`drills.session.event_log`)

Client-only ring buffer, last 3 events. Subscribes to existing socket emits (`hand_started`, `hand_ended`, `playlist_advanced`, `coach_role_changed`, etc.). No server change.

---

## 8. Error handling + edge cases

### 8.1 Mid-hand & state-validity guards

| Scenario | Resolution |
|---|---|
| Reset Hand mid-betting | `coach:reset_hand` runs `GameManager.resetHand()`. `live.notes_panel` flushes draft (warn-on-discard). Pending blinds survive. |
| Undo at start of hand | server rejects with `{ error: 'no_actions' }`; UI button disabled when `actions.length === 0`. |
| Manual Advance while auto-advancing | server rejects `{ error: 'auto_advance_on' }`; UI disabled when `auto_advance === true`. |
| Sit-out the on-clock player | server defers to next action boundary (existing `pending_seat_changes` pattern). UI shows `SIT (queued)` badge. |
| Kick the on-clock player | confirm dialog; server defers to next action boundary; `Kick (queued)` indicator. |
| Apply Now when phase ≠ waiting | UI gate renders `Apply at Next Hand →` instead. Server rejects 400 if mismatched. |
| Apply at Next Hand stale (queuedAt > 1h) | server discards on next reset; `pending_banner` shows `(expired — re-apply)`. |
| Add Bot at full table | server rejects `{ error: 'table_full' }`; UI disables when `seats.filled === seats.max`. |
| Save as Drill Hand outside Review | UI gates: button only renders when `replay.review_active === true`. |

### 8.2 Multi-coach (eliminated by single-coach lock)

The single-coach lock (Section 6.4) eliminates concurrent-coach races on the same table. Lock claim, release, multi-tab, and reconnect handling per Section 6.4. Real remaining race: two coaches join simultaneously into an unowned lock — Node single-threaded mutex; whoever's event handler runs first claims, second is denied with observer-mode downgrade and toast.

### 8.3 RBAC failures

| Scenario | Resolution |
|---|---|
| Student visits `?sidebarV3=1` on coached_cash | sidebar renders Live tab read-only; `actingAsCoach === false` hides footer actions. No harm. |
| Coach without school assignment hits notes endpoint | 403 `{ error: 'no_school_assignment' }`; toast: "Your coach account isn't assigned to a school. Contact admin." |
| Coach from school A views hand from school B | `GET /api/hands/:id/notes` returns `{ notes: [] }` (filtered by school). No 403, just no leak. |
| Stale JWT on socket | existing `socketAuthMiddleware` rejects; client receives `disconnect`. Reconnection prompt. |

### 8.4 Network / socket failures

| Scenario | Resolution |
|---|---|
| REST notes write times out | UI shows pending state; on failure, toast + restore draft. |
| Socket disconnect mid-Apply Blinds queue | Optimistic UI; on reconnect, refetch `gameState`. If server lost queue (memory wipe), banner disappears. |
| Manual advance ack timeout | event log shows "Advance failed — try again". Button re-enabled after 3s. |
| Excel export fails mid-stream | server returns 500 with partial download. Document: "If Excel fails, try CSV." |

### 8.5 Data integrity

| Scenario | Resolution |
|---|---|
| Hand deleted with notes attached | `ON DELETE CASCADE` drops notes |
| Table closed with pending blinds | `pendingBlinds.delete(tableId)` in `tableCleanup.js` lifecycle hook |
| Server restart wipes pending blinds | accepted; coach re-queues |
| Author player deleted | `author_player_id` set NULL; UI renders "Coach (deleted)" |
| Drill log overflow | client ring buffer caps at last 3 events |
| Notes count drift | accepted up to 60s stale-while-revalidate; invalidate on note CRUD |

### 8.6 UI / browser

| Scenario | Resolution |
|---|---|
| localStorage disabled | fallback to in-memory tab/collapse state; resets on reload |
| Multiple browser tabs of same coach on same table | each tab has own React state; mutations propagate via socket. Sidebar collapse and tab-position per browser-tab. Acceptable. |
| Notes panel open at hand transition | auto-close + drop draft (with confirm if non-empty) |
| Equity toggles off + drill running | drill mode doesn't override toggles; coach preference persists per-table in `SharedState.equityVisibility` |
| Resize sidebar < 360px | enforce min-width 360px when expanded; collapsed = 24px. No intermediate widths. |
| Browser back/forward in History expand | ephemeral (Q-6.6.6 → a) — no URL sync |

### 8.7 Performance / scale

| Scenario | Resolution |
|---|---|
| Notes pip count badge on N cards | batch endpoint `POST /api/hands/notes-counts` |
| Hand library no-filter search | server enforces `limit ≤ 100`, default 20 |
| Excel export over 5K hands | exceljs streaming via `worksheet.commit()`; target ≤ 30s, ≤ 100MB at 10K hands |
| RangeMatrix toggle while typing search | debounce search input 300ms; range filter applies immediately |
| Action log card with 100+ actions | virtualize via `react-window` if > 30 entries; defer until empirically needed |

---

## 9. Testing strategy

### 9.1 Layers

| Layer | Framework | Location |
|---|---|---|
| Server unit | Jest (existing) | `server/tests/*.test.js` |
| Server integration | Jest + supertest + mocked Supabase | `server/tests/*.integration.test.js` |
| Client unit | Jest + React Testing Library | `client/src/**/__tests__/*.test.{js,jsx}` |
| E2E | Playwright (existing) | `e2e/` |
| Migration sanity | bare SQL on disposable Postgres | CI hook |

### 9.2 New tests required

Grouped by feature so they map to plan chunks:

**Notes:** repo CRUD + school filter; route auth + body validation; `useNotes` cache; `live.notes_panel` UX; `history.hand_card.notes_pip` badge gating; migration 064 applies clean.

**Pending blinds:** queue/auto-apply/discard; reject Apply Now ≠ waiting; single-pending overwrite; restart wipes (in-memory contract); banner render gate (4 states snapshot).

**Single-coach lock:** first claim; same-coach reclaim; different-coach denied; release on last disconnect; multi-tab same-coach holds one lock.

**Tier E:** `live.tag_dialog` round-trip; manual advance gating; (E9 deferred).

**Annotation removal:** migration 065 runs clean; `/api/hands/:id/annotations` 404; old socket no-op; old client UI grep absent post-Phase-E.

**Tab/feature wiring:** `settings → setup` localStorage migration; `header.status_pill` priority chain (5 cases snapshot); sidebar collapse toggle (body unmounts/remounts).

**Replay scrubber (K2/K3/K4):** drag emits `replay:replayJumpTo`; autoplay step interval; autoplay stops at end.

**Hand library (I1/I2/I3/I4):** filter combinations; pagination; load (Keep vs Historical) payload; Add to Playlist payload; school scope.

**Excel/CSV export (E2):** valid CSV columns; xlsx 4-sheet structure parsed via `exceljs.read`; non-coach 403; auto-tag breakdown matches actuals.

**Drill features (M1/M2/M3/M6/M8/M10):** Coach Play/Monitor emits; countdown 5s + cancellable; ring buffer 3-event; LaunchPanel full payload.

### 9.3 E2E flows

| Spec | Scenario |
|---|---|
| `e2e/sidebar-v3.coach-happy.spec.ts` | Coach login → table → playlist → drill → end → tag → notes → Excel |
| `e2e/sidebar-v3.coach-lock.spec.ts` | Coach A → B blocked → A leaves → B reloads → claims |
| `e2e/sidebar-v3.pending-blinds.spec.ts` | Mid-hand BB change → banner → end hand → applies at reset |

### 9.4 Coverage targets

- Server new code: ≥ 80% line coverage.
- Client new components: snapshot + interaction test for each non-trivial new component.
- Migrations: 100% — every migration runs in CI on fresh Postgres.

---

## 10. Rollout plan

One feature flag (`?sidebarV3=1`) through Phases A–D; default flips in Phase E with `?sidebarV3=0` escape hatch.

### Phase A — Foundation cleanup (low risk)

- Tab id `settings → setup` (migration of localStorage value once on mount).
- Drop `header.subtitle` (X3).
- Wire `live.action_log_card` to `gameState.actions` in adapter.
- Cut Hybrid mode (V1), History Players sub-mode (V11), drill stats tiles (V15), separate SB input (V14).
- Remove disabled stub on Live `seats_card` for adjust/kick/add-bot (D2/D3/D4).
- Add status pill DRILL state (S5).
- Update button copy (C1–C11).
- Wire stubs needing no server work: Tag Hand (E1) + tag dialog, drop drill footer entirely (E3/E4 → footer removed), Adjust Stack on Live (E6) dropped, Save Scenario (E9) deferred.

### Phase B — Notes feature (medium risk, isolated)

- Migration `064_hand_notes.sql`.
- `HandNotesRepository.js` + `routes/notes.js`.
- `NotesPanel.jsx` + `useNotes` hook.
- Mount surfaces: `live.notes_panel`, `review.notes_panel`, `history.hand_card.notes_pip`.
- Add 📝 to `footer.live`.
- Adapter `notes_counts`.

### Phase C — Single-coach lock + pending blinds (medium risk, server state)

- Single-coach lock in `joinRoom.js` + `disconnect.js`.
- Pending blinds Map + `coach:apply_blinds_at_next_hand` / `coach:discard_pending_blinds`.
- `PendingBlindsBanner.jsx` + render gate.
- `GameManager` reset hook to consume queued delta.

### Phase D — Missing-feature ports + restructure (higher risk, large surface — subdivide)

- Sidebar collapse (A1).
- Equity toggles (G1, G2) + Share Range button.
- Share Range modal (G4).
- Undo / Rollback / Reset in `footer.live` (B3, H1, H2).
- Replay scrubber + autoplay + speed (K2/K3/K4).
- Hand library inside Drills (I1/I2/I3/I4 + F.c.1).
- History toolbar refresh (J4) + inline detail expand (J2).
- Setup tab restructure (V12 final, drop Players sub-mode).
- Drills tab restructure (3-segment, drop footer, LaunchPanel, PlaylistAdmin, CountdownBanner, EventLog, CoachRoleToggle, `manual_advance_spot`).
- Excel + CSV export (E2) — `routes/exports.js`, `ExportDialog.jsx`, `exceljs` dep.

### Phase E — Cutover (highest risk, irreversible UX)

One commit:
1. Default sidebar to v3 in `TablePage.jsx`. Keep `?sidebarV3=0` as escape hatch for ≥ 1 release.
2. Delete old sidebar tree: `client/src/components/CoachSidebar.jsx`, all of `client/src/components/sidebar/`, branch in `TablePage`.
3. Migration `065_drop_hand_annotations.sql` + delete `routes/annotations.js` + delete client annotation UI in `ReplayControlsSection.jsx` (dies with old sidebar).
4. Update copy / docs referencing "old sidebar" or `?sidebarV3=1` instructions.

Pre-merge: full E2E suite green; ≥ 24h staging soak; production after sign-off.

### Risk matrix

| Phase | Risk | Worst-case if broken | Rollback |
|---|---|---|---|
| A | Low | Cosmetic regression on opt-in v3 | Revert PR |
| B | Low–Medium | Notes don't save / leak | Revert PR + drop `hand_notes` |
| C | Medium | Coach lockout / pending blinds lost | Revert PR (in-memory only) |
| D | Medium | Live tab regression on opt-in v3 | Revert PR; users on default unaffected |
| E | Highest | All coaches default into v3 with regression | Revert default-true commit; `?sidebarV3=0` for hot-fix while we patch |

---

## 11. Cutover prerequisites

- [ ] Production has no annotation data we care about (verbally confirmed during Step 1; reverify before migration 065).
- [ ] Old sidebar has no orphan callers (test imports etc. — covered by cutover commit grep).
- [ ] `?sidebarV3=0` escape hatch tested on staging.
- [ ] Phase D walkthrough sign-off.

If any Phase D blockers prevent feature parity, Phase E defers indefinitely.

---

## 12. Open items / verify-before-implement

These are spec assumptions to confirm during plan-writing or implementation kickoff. None are blocking spec acceptance, but each should be checked before code lands.

1. **`coach:set_equity_visibility_players` socket event vs existing `coach:toggle_equity_display`.** Spec assumes a new event; if the existing one already supports per-table state with the right shape, prefer reusing it. Audit before implementing G2.
2. **`requireCoach(socket, action)` school-scope check** — current implementation enforces role but not always school. Section 5.1 RBAC requires a school match; if not present, add a small wrapper helper. Audit before implementing notes endpoints.
3. **`exceljs` dependency** — confirm not already in `server/package.json`. If present, reuse; else add. Affects bundle size / Fly.io image.
4. **`PlaylistExecutionService.advance(tableId)` API surface** — Section 7.1 assumes a public `advance` method exists. If not, expose one. Audit before implementing E5.
5. **`coach:share_range` broadcast scope** — players in the same room only; verify existing socket room model supports student-only emit (excluding coach). May need `socket.broadcast.to(room).emit(...)` filter on `socket.data.role !== 'coach'`.
6. **Player profile `school_id` column** — confirm it exists and is non-null for coach accounts. Required for school-scope check on every notes/library route.
7. **`hands.school_id` column** — needed for hand-library school filter (Section 5.4). If absent, derive via `hands.table_id → tables.school_id` join or add a column in a migration.

---

**End of spec.**
