# General — Business Logic & Cross-Cutting Concerns

> Source of Truth. Last updated: 2026-04-06 (Phase 2 bug fixes + features).
> Conflicts with legacy `/docs` files? This file wins.

---

## Product Purpose

A poker coaching platform used by coaches, students, and referees. Core loop: coach runs live session → hands are played and recorded → system auto-tags mistakes → coach reviews and annotates → student improves over time.

---

## Roles & Permission Model

**9 roles** (hierarchy top → bottom):
`superadmin` → `admin` → `coach` → `moderator` / `referee` / `player` / `trial` / `coached_student` / `solo_student`

**16 permission keys** resolved via `player_roles → roles → role_permissions → permissions` DB chain:
`table:create`, `table:manage`, `hand:tag`, `hand:analyze`, `user:manage`, `user:view`, `playlist:create`, `playlist:manage`, `crm:view`, `crm:edit`, `admin:access`, `tournament:manage`, `school:manage` (+ 3 others)

**Two auth middleware types — use the right one:**
- `requirePermission(key)` — system-level permissions (role-based)
- `requireTournamentAccess()` — scoped tournament access (checked via `tournament_referees` table)

**Trial limits:** 7-day window / 20 hands — enforced at `join_room` socket handler.

---

## Game Modes

| Mode | Description |
|------|-------------|
| `coached_cash` | Coach controls dealing/config/undo; players bet; coach is observer |
| `uncoached_cash` | Auto-deals; all users (including coaches) are seated players |
| `tournament` | Auto-deals with blind schedule and elimination tracking |
| `bot_cash` | Autonomous; BotDecisionService plays all seats; no coach required |

---

## Two Tournament Systems (CRITICAL — Do Not Cross-Wire Without a Spec)

| System | Tables | Access | Status |
|--------|--------|--------|--------|
| **System A** (table-based) | `tables` + TournamentController + socket events | `/table/:tableId` | Primary live engine |
| **System B** (standalone) | `tournaments` + `tournament_players` | REST only | Separate registry |

Migration `040_tournament_bridge.sql` added `table_id` FK to bridge them but they remain **mostly separate**. `TournamentLobby` dual-path fetches (System B first, falls back to System A). Do not merge these systems unless a spec explicitly says to.

---

## Key Business Rules

- `replaceAutoTags()` is the **only** function that may delete `auto`, `mistake`, or `sizing` tags. Nothing else touches those. Coach tags (`coach` type) are never auto-replaced.
- `Promise.allSettled` is used in the analyzer pipeline intentionally — one failing analyzer must never break others.
- Socket events follow the pattern `namespace:event_name` (e.g., `tournament:blind_up`). Do not invent event names without updating the spec.
- `player_id` in all DB tables = stable UUID from localStorage `poker_trainer_player_id`, NOT socket.id.
- Coach stableId = real JWT UUID — tracked in `hand_players`, `hand_actions`, leaderboard.

---

## Known Issues Status (updated 2026-04-06)

**Fixed in this session:**

| ID | Fix | Where |
|----|-----|-------|
| BUG-01 | Bot table routed to `/game/` → fixed to `/table/` | BotLobbyPage.jsx:177,181 |
| BUG-02 | Prev/Next hand both called `navigate(-1)` → real prev/next via `location.state.handIds` | ReviewTablePage + AnalysisPage |
| BUG-03 | `setActionError` declared at line 272 but first used at line 164 in TournamentInfoPanel → moved to top | TournamentInfoPanel.jsx |
| BUG-04 | `socket.data.playerId` never set in socketAuthMiddleware → `requireSocketPermission` silently failed for every call | socketAuthMiddleware.js |
| Feature 5 | Coach leaves table to build scenarios → inline ScenarioBuilder modal in TablePage | TablePage.jsx |
| Feature 6a | ReviewTablePage client-side only → socket-driven mode when `location.state.isReviewSession` | ReviewTablePage.jsx |
| Feature 6b | No group review transition → "Go to Review" button + `transition_to_review` / `transition_back_to_play` socket events | TablePage + replay.js |

**Still open:**

| Issue | Priority |
|-------|----------|
| No unified Student Profile page (6 separate pages to understand one student) | P1 |
| Leaderboard period/game-type filters are non-functional stubs | P1 |
| No annotation notifications to students | P1 |
| In-table replay via CoachSidebar HANDS tab `onLoadReplay` still disconnected (TablePage doesn't pass replay emit props) | P2 — review now accessible via "Go to Review" which is the preferred path |

---

## Deployment

- **Host**: Fly.io — `poker-trainer-ysav55`, region `iad`, 512 MB shared CPU
- **Auto-sleep**: scale-to-zero; wakes in ~1s
- **Idle timer**: `IDLE_TIMEOUT_MINUTES = "20"` in `fly.toml`
- **Dev CORS**: defaults to `http://localhost:5173` when `NODE_ENV ≠ production`

---

## Standing Operational Rules

- After every major change: update `GETTING_STARTED.md` and `ISSUES_REGISTRY.md`.
- Migrations numbered sequentially (`040_`, `041_`…). Never edit an already-applied migration. Always write a new one.
- No `console.log` debug statements in committed code.
- New API endpoints must have auth middleware — no unprotected endpoints.
