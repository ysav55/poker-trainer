# Backend — Express/Node Architecture, Socket Events & API Patterns

> Source of Truth. Last updated: 2026-04-06 (Phase 2 bug fixes + features).

---

## Stack

- **Node.js + Express** — REST API on port 3001
- **Socket.io** — real-time game events
- **Supabase JS client** (service-role key) — server-side only, never in browser
- **JWT** signed by `SESSION_SECRET` (required — server exits if missing); 7-day expiry

---

## Server Bootstrap (`server/index.js` — ~110 lines)

1. Validate env (`SESSION_SECRET` required)
2. Express: CORS, JSON body, Morgan logging, `authLimiter` on `/api/auth/*`
3. Mount all route modules
4. Initialize Socket.io with `socketAuthMiddleware`
5. Register all 11 socket handler modules
6. Start lifecycle: `idleTimer`, `activateScheduledTables`, shutdown handlers

---

## Auth Middleware — Use the Right One

| Middleware | File | Use When |
|-----------|------|----------|
| `requireAuth` | `server/auth/requireAuth.js` | Any authenticated endpoint |
| `requireRole(role)` | `server/auth/requireRole.js` | Role-based gating (e.g., `requireRole('coach')`) |
| `requirePermission(key)` | `server/auth/requirePermission.js` | System-level permission keys (16 keys from DB chain) |
| `requireTournamentAccess()` | — | Tournament-scoped access (checks `tournament_referees` table) |
| `requireFeature(gate)` | `server/services/featureGate.js` | School-scoped feature flags |
| `socketAuthMiddleware` | `server/auth/socketAuthMiddleware.js` | `io.use()` — sets `socket.data.*` |
| `requireCoach(socket, action)` | `server/auth/socketGuards.js` | Socket-level coach guard |

---

## REST API Route Modules

```
/api/auth              → routes/auth.js
/api/hands             → routes/hands.js
/api/players           → routes/players.js
/api/sessions          → routes/sessions.js
/api/playlists         → routes/playlists.js
/api/analysis          → routes/analysis.js        [requireFeature('analysis')]
/api/annotations       → routes/annotations.js
/api/announcements     → routes/announcements.js
/api/coach             → routes/alerts.js, prepBriefs.js, reports.js
/api/bot-tables        → routes/botTables.js
/api/tournaments       → routes/tournaments.js
/api/tournament-groups → routes/tournamentGroups.js
/api/tables            → routes/tables.js
/api/blind-presets     → routes/blindPresets.js
/api/payout-presets    → routes/payoutPresets.js
/api/settings          → routes/settings.js
/api/staking           → routes/staking.js
/api/scenarios         → routes/scenarioBuilder.js
/api/chip-bank         → routes/chipBank.js        [requireFeature('chip_bank')]
/api/alpha-report      → routes/alphaReport.js
/health                → routes/health.js           [no auth — pings Supabase, returns 503 if down]
/api/admin             → routes/admin/*.js (schools, groups, students, org-settings, users)
```

---

## Socket Handler Modules (11 files in `server/socket/handlers/`)

`gameLifecycle`, `betting`, `replay`, `handConfig`, `joinRoom`, `disconnect`, `misc`, `playlists`, `coachControls`, `scenarioBuilder`, `tournament`

**Socket event naming convention:** `namespace:event_name` (e.g., `tournament:blind_up`). Never invent new names without updating the spec.

**Replay handler additions (2026-04-06):**
Two new events added to `server/socket/handlers/replay.js` (coach-only):
- `transition_to_review` `{ handId? }` — loads hand into ReplayEngine (`phase` must be `'waiting'`), broadcasts `transition_to_review { handId, tableId, actionCount }` to all room clients. Resolves handId from payload or falls back to `activeHands.get(tableId).handId`.
- `transition_back_to_play` — calls `gm.exitReplay()`, broadcasts `transition_back_to_play { tableId }` to all room clients.

---

## Game Engine

| File | Purpose |
|------|---------|
| `GameManager.js` | Core state machine — delegates to sub-modules |
| `bettingRound.js` | Pure functions: `isBettingRoundOver`, `findNextActingPlayer` |
| `ShowdownResolver.js` | Pure showdown computation → returns `stackDeltas` Map |
| `ReplayEngine.js` | `load/step/branch/unbranch/exit` — mutates state by reference |
| `SessionManager.js` | GM wrapper — tracks VPIP/PFR/WTSD/WSD stats |
| `HandEvaluator.js` | `evaluate(holeCards, board)` → `{rank 0-9, rankName, ...}` |
| `HandGenerator.js` | Fill-the-Gaps algo for hybrid/manual hand config |
| `positions.js` | `buildPositionMap(seated, dealerSeat)` → `{playerId: 'BTN'\|'SB'\|...}` |
| `BotDecisionService.js` | easy/medium/hard bot action selection |
| `BotTableController.js` | Autonomous hand lifecycle for bot_cash tables |

### Controllers

| File | Extends | Purpose |
|------|---------|---------|
| `TableController.js` | — | Base class; defines interface (`onHandComplete`, `getMode`, `onPlayerJoin`, `onPlayerLeave`, `destroy`) |
| `CoachedController.js` | `TableController` | `coached_cash` — coach controls hand lifecycle |
| `AutoController.js` | `TableController` | `uncoached_cash` — self-contained hand lifecycle (see below) |
| `TournamentController.js` | `AutoController` | `tournament` — adds blind schedule, eliminations |
| `BotTableController.js` | `AutoController` | `bot_cash` — spawns bot sockets |

**AutoController lifecycle (fixed 2026-04-06):**
- `_startHand()` — calls `gm.startGame()`, logs to HandLogger (`tableMode: 'uncoached_cash'`), sets `activeHands`, calls `_broadcastState()`
- `_completeHand()` — guarded by `_handActive` flag; snapshots state, calls `gm.resetForNextHand()`, calls `onHandComplete()`, logs `endHand`, runs analyzer, clears `activeHands`
- `onHandComplete()` — emits `hand_complete`, runs bust detection (sits out `stack <= 0` players, emits `player_busted`), schedules `_startHand()` after 2s
- `onPlayerJoin(stableId)` — auto-starts first hand when 2nd eligible player joins
- `_broadcastState()` — per-socket `game_state` emit (same pattern as BotTableController)
- `betting.js` triggers `ctrl._completeHand()` when `freshState.phase === 'showdown'` for `uncoached_cash` tables
- `joinRoom.js` calls `ctrl.onPlayerJoin(stableId)` for non-coach joins on all table modes

---

## Analyzer Pipeline (CRITICAL — Do Not Change the Pattern)

`analyzeAndTagHand(handId)` in `server/game/AnalyzerService.js`:
1. Call `buildAnalyzerContext(handId)` once
2. Run all 9 analyzers from `ANALYZER_REGISTRY` via **`Promise.allSettled`** (not `Promise.all` — one failure must never break others)
3. Each analyzer returns `{ tag, tag_type, player_id?, action_id? }[]`
4. Write auto-tags atomically via `replaceAutoTags()` — this is the **only** function that may delete `auto`, `mistake`, or `sizing` tags

**9 analyzers** (`server/game/tagAnalyzers/`):
`street.js`, `preflop.js`, `postflop.js`, `potType.js`, `board.js`, `mistakes.js`, `sizing.js`, `positional.js`, `handStrength.js`

---

## Services (`server/services/`)

| Service | Purpose |
|---------|---------|
| `BaselineService` | 30-day rolling VPIP/PFR/WTSD/WSD/cbet/aggression; upserts `student_baselines` |
| `SessionQualityService` | `compute(playerId, sessionId)` → 0–100 score; stored in `session_player_stats.quality_score` |
| `AlertService` | 6 detectors: inactivity, volume_drop, mistake_spike, losing_streak, stat_regression, positive_milestone; dedup upsert |
| `SessionPrepService` | 7-section pre-session brief; 1-hour cache in `session_prep_briefs` |
| `NarratorService` | Claude Haiku narration; returns `null` gracefully when `ANTHROPIC_API_KEY` absent |
| `ProgressReportService` | 8-section report, 0–100 grade, weekly/monthly/custom |
| `featureGate.js` | School-scoped feature enable/disable (1-min in-memory cache) |
| `PlaylistExecutionService` | Drill-session lifecycle (start/pause/resume/advance), hero mode + auto-advance, resumable on prior pause |
| `ScenarioDealer` (`game/`) | Arms scenarios at `open_config_phase`, hero-anchored seat rotation via `mapScenarioToTable`, restores stacks at hand-complete |

**Feature gates:** `replay`, `analysis`, `chip_bank`, `playlists`, `tournaments`, `crm`, `leaderboard`, `scenarios`, `groups`

---

## Shared In-Memory State (`server/state/SharedState.js`)

7 Maps encapsulated here. All live state lives here — not in individual handler files.

---

## Repositories (`server/db/repositories/`)

| Repository | Domain |
|-----------|--------|
| `HandRepository` | Hands + hand actions |
| `PlayerRepository` | Player profiles, stats |
| `PlaylistRepository` | Playlists + scenarios |
| `TagRepository` | Hand tags |
| `SessionRepository` | Session records |
| `SchoolRepository` | School CRUD, members, capacity, feature toggles |
| `ChipBankRepository` | Chip balance, buy-in, cash-out, history |
| `AnnouncementRepository` | Announcements |
| `GroupRepository` | Group CRUD, members, policy enforcement |
| `TournamentRepository` | Tournament records (System B) |

All repositories re-exported flat from `server/db/index.js`.

---

## socketAuthMiddleware — Fields Set on `socket.data`

After middleware runs on authenticated connections:
```
socket.data.authenticated = true
socket.data.stableId      = payload.stableId   // JWT stableId
socket.data.playerId      = payload.stableId   // same as stableId — alias for requireSocketPermission
socket.data.role          = payload.role
socket.data.isCoach       = COACH_TIER.has(role) // true for coach, admin, superadmin
socket.data.isBot         = (role === 'bot')
socket.data.jwtName       = payload.name
```

`isCoach` is broadened to include `admin` and `superadmin` (RBAC schema migration 2026-04-06). Also set at `join_room` if `socket.data.stableId === table.controller_id` (delegation — see below).

**BUG-04 fixed 2026-04-06:** `socket.data.playerId` was never set. `requireSocketPermission` in `socketPermissions.js` checks `socket.data.playerId` — was silently rejecting every permission check. Now set to `stableId`.

---

## Roles & Permissions Schema (RBAC Migration 2026-04-06)

### Canonical Roles (5)
| Role | Tier | Description |
|------|------|-------------|
| `superadmin` | 1 | Platform owner |
| `admin` | 1 | Org-level admin |
| `coach` | 2 | School coach / instructor |
| `coached_student` | 3 | Student with a coach |
| `solo_student` | 3 | Student without a coach |

**Retired roles** (migration 043 — pending deploy): `player`, `moderator`, `referee`
**Trial** is now a status flag (`trial_active` computed column on `player_profiles`), not a role. JWT dual-window: old tokens with `role: 'trial'` continue to work; new tokens include `trialStatus: 'active'` field.

### Role Hierarchy in `requireRole()`
`requireRole('coach')` passes for coach, admin, superadmin. `requireRole('admin')` passes for admin, superadmin. Defined in `ROLE_HIERARCHY` constant in `server/auth/requireRole.js`.

### Socket Delegation
At `join_room` time, if `socket.data.stableId === table.controller_id` and the socket is not already a coach-tier user:
```js
socket.data.isCoach   = true;
socket.data.isDelegate = true;
```
This grants full coach socket powers to a designated table controller regardless of their role.

### Permission Cache TTL
`requirePermission.js`: 5-minute TTL (`permissionCacheTime` Map). `featureGate.js` schoolId cache: 10-minute TTL. Both use the same pattern.

### New Permission Grants (migration 042)
- `crm:edit` → coach (was coach-only for view)
- `staking:view` → coached_student, solo_student

---

## Player Identity (CRITICAL)

- `player_id` in all DB tables = stable UUID from `localStorage poker_trainer_player_id`, **NOT** `socket.id`
- `stableIdMap` on server populated at `join_room`
- Coach stableId = real JWT UUID (tracked in `hand_players`, `hand_actions`, leaderboard)
- `GET /api/players/:id/hover-stats` — **intentionally no auth** (spectator access by design)

---

## Auth Path

- Dual-path: `players.csv` (bcrypt rounds=12) + DB-backed `player_profiles.password_hash`
- `PlayerRoster.authenticate()` falls back to CSV if no DB record exists
- Login uses `.eq()` on `display_name` (COLLATE case_insensitive — `ilike` throws on nondeterministic collations)
- Full DB cutover requires admin to re-provision users via `/admin/users` (ISS-99)
