# Poker Trainer — Architecture Reference

> Generated: 2026-04-06. Last updated: 2026-04-06 (RBAC schema migration complete — hierarchy-aware requireRole, isCoach broadened to admin/superadmin, socket delegation via controller_id, permission cache TTLs, migrations 042–044, frontend role cleanup, 2403 tests passing).

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Frontend Layer](#2-frontend-layer)
   - [Routing](#21-routing)
   - [Pages](#22-pages)
   - [Components](#23-components)
   - [Hooks & Contexts](#24-hooks--contexts)
3. [Backend Layer](#3-backend-layer)
   - [Server Bootstrap](#31-server-bootstrap)
   - [REST API Contract](#32-rest-api-contract)
   - [Socket Event Layer](#33-socket-event-layer)
4. [Game Engine](#4-game-engine)
5. [Services & Background Jobs](#5-services--background-jobs)
6. [Auth & Permissions](#6-auth--permissions)
7. [Data Layer](#7-data-layer)
   - [Repositories](#71-repositories)
   - [Shared In-Memory State](#72-shared-in-memory-state)
8. [Database Schema](#8-database-schema)
9. [Issues & Audit Findings](#9-issues--audit-findings)

---

## 1. System Overview

```
┌───────────────────────────────────────────────────────────┐
│  Browser (React + Vite + Tailwind)                        │
│  Routing: react-router-dom v6                             │
│  Comms: apiFetch() (REST/JWT) + socket.io-client         │
└─────────────────────────┬─────────────────────────────────┘
                          │ HTTP :3001 + WebSocket
┌─────────────────────────▼─────────────────────────────────┐
│  Node.js Express Server (server/index.js)                 │
│  ├── 40+ REST route modules                               │
│  ├── Socket.io + 11 socket handler modules                │
│  ├── Game Engine (GameManager + controllers)              │
│  ├── 9 SharedState Maps (in-memory)                       │
│  └── 10 services + 6 alert detectors                      │
└─────────────────────────┬─────────────────────────────────┘
                          │ Supabase JS client (service role)
┌─────────────────────────▼─────────────────────────────────┐
│  Supabase (PostgreSQL)                                    │
│  40 migrations, ~40 tables, leaderboard view + triggers   │
└───────────────────────────────────────────────────────────┘
```

**Stack**: Node.js/Express/Socket.io · React/Vite/Tailwind · Supabase (Postgres)  
**Hosting**: Fly.io (scale-to-zero, 512 MB)  
**Auth**: JWT (7d) signed by SESSION_SECRET; dual-path CSV+DB (CSV primary; full DB cutover pending ISS-99)  
**Roles**: superadmin → admin → coach → coached_student / solo_student (5 canonical; `moderator`/`referee`/`player` retiring via migration 043; `trial` is now a status flag)  
**Permissions**: 16 keys resolved via `player_roles → roles → role_permissions → permissions` chain  

### Key Architectural Boundaries

| System | Description |
|--------|-------------|
| **System A (table-based)** | `tables` table + TournamentController + socket events. Tables run in-memory as SessionManagers. |
| **System B (standalone tournament)** | `tournaments` + `tournament_players` tables. Managed via REST only. Migration 040 added `table_id` FK to bridge them but they remain mostly separate. |
| **Bot tables** | `bot_cash` mode tables; BotTableController spawns socket.io-client bots internally. Tracked in `tables` with `mode='bot_cash'`. |

---

## 2. Frontend Layer

### 2.1 Routing

All routes defined in `client/src/App.jsx`. Protected routes require `AuthContext.user` (redirects to `/login` if absent).

| Path | Component | Auth | Notes |
|------|-----------|------|-------|
| `/login` | LoginPage | Public | Redirects to /lobby if already logged in |
| `/register` | RegisterPage | Public | |
| `/forgot-password` | ForgotPasswordPage | Public | **STUB** — no backend; directs to coach contact |
| `/lobby` | LobbyPage | ✓ | Main hub — stats, tables, alerts, announcements |
| `/table/:tableId` | TablePage | ✓ | Full-screen table; handles coached/auto/tournament modes |
| `/multi` | MultiTablePage | ✓ | Adaptive grid of multiple tables |
| `/review` | ReviewTablePage | ✓ | Hand replay + coach annotations |
| `/tournament/:tableId/lobby` | TournamentLobby | ✓ | Registration + info for System A tournaments |
| `/tournament/:tableId/standings` | TournamentStandings | ✓ | Final standings |
| `/tournament-group/:groupId/lobby` | TournamentLobby | ✓ | Multi-table group lobby (same component) |
| `/bot-lobby` | BotLobbyPage | ✓ | Create/join bot practice tables. After creation navigates to `/table/:tableId`. |
| `/leaderboard` | LeaderboardPage | ✓ | All-time player rankings |
| `/analysis` | AnalysisPage | ✓ Coach+ | Tag analysis with charts |
| `/history` | HandHistoryPage | ✓ | Paginated hand history with filters |
| `/staking` | StakingPlayerPage | ✓ | Player staking contract view |
| `/settings` | SettingsPage | ✓ | Tabbed settings hub |
| `/admin/users` | UserManagement | ✓ admin:access | User CRUD |
| `/admin/hands` | HandBuilder | ✓ admin:access | Scenario builder + hand loader |
| `/admin/crm` | PlayerCRM | ✓ admin:access | Stable management |
| `/admin/tournaments` | TournamentSetup | ✓ admin:access | Tournament creation wizard |
| `/admin/referee` | RefereeDashboard | ✓ admin:access | Tournament referee controls |
| `/admin/alerts` | CoachAlertsPage | ✓ admin:access | Coach alerts feed |
| `/admin/stable` | Redirect → /admin/crm | | Legacy redirect |
| `/admin/staking` | StakingPage | ✓ admin:access | Admin staking contract manager |
| `/admin/tournaments/group/:groupId/balancer` | TournamentBalancer | ✓ admin:access | MTT table balancer |
| `*` | Navigate → /lobby | | Catch-all |

**Unrouted pages** (exist in filesystem, not in App.jsx):
- `pages/MainLobby.jsx` — never rendered; appears to be an older version of LobbyPage

### 2.2 Pages

#### Core
| Page | API Calls | Socket | Role |
|------|-----------|--------|------|
| **LobbyPage** | GET /api/players/:id/stats, GET /api/players, GET /api/admin/alerts, GET /api/hands?limit=10, POST /api/tables, GET /api/table-presets, POST /api/table-presets | None (polling via LobbyContext) | Any. CreateTableModal: SB/BB/stack/privacy/presets. BuyInModal shown for non-coach joining uncoached table (50–200 BB slider, chip balance). Spectate button → `?spectate=true`. |
| **TablePage** | None (all via socket) | 40+ emits, all game_state + tournament events | Any. `?spectate=true` URL param joins as spectator. `location.state.buyInAmount` passed to join_room. Listens to `player_busted` → bust toast (6s). Sit-out toggle (uncoached_cash, non-spectator only). Spectator tag button (coach/admin spectators). |
| **MultiTablePage** | None (reads LobbyContext.activeTables) | None directly | Any |
| **ReviewTablePage** | GET/POST /api/hands/:id/annotations, DELETE /api/annotations/:id, GET /api/hands/:id | **Two modes**: static (REST only) or socket-driven (when `location.state.isReviewSession` + `tableId`). In socket mode joins live table room as spectator, drives PokerTable from `game_state_update` events. | Any; coach required to add/delete annotations |
| **BotLobbyPage** | GET /api/bot-tables, POST /api/bot-tables | None | Any. After create/join, navigates to `/table/:tableId`. |

#### Tournament
| Page | API Calls | Notes |
|------|-----------|-------|
| **TournamentLobby** | GET /api/tournaments/:id (fallback: GET /api/tables/:id/tournament), PATCH /api/tournaments/:id/status, POST /api/tournaments/:id/register | Dual-path fetch signals incomplete System A/B migration |
| **TournamentStandings** | GET /api/tables/:id/tournament | System A only |

#### Admin
| Page | API Calls |
|------|-----------|
| **TournamentSetup** | POST /api/admin/tournaments, GET /api/blind-presets, GET /api/payout-presets, GET /api/players |
| **TournamentBalancer** | GET /api/tournament-groups/:id, GET /api/tournament-groups/:id/standings, POST /api/tournament-groups/:id/auto-balance, POST /api/tournament-groups/:id/move-player |
| **PlayerCRM** | GET /api/admin/players, GET /api/admin/players/:id/crm, POST/PUT /api/admin/players/:id/notes, GET/PUT /api/admin/players/:id/tags |
| **UserManagement** | GET /api/admin/users, POST/PUT/DELETE /api/admin/users/:id |
| **HandBuilder** | GET/POST /api/admin/scenarios, GET /api/scenarios, GET /api/scenarios/folders |
| **RefereeDashboard** | GET /api/tournaments/:id, POST /api/tournaments/:id/referee, GET /api/admin-referee-defaults |
| **CoachAlertsPage** | GET /api/coach/alerts, PATCH /api/coach/alerts/:id, GET/PUT /api/coach/alerts/config |
| **StakingPage** | GET /api/staking/overview, POST /api/staking/contracts, PATCH /api/staking/contracts/:id |

#### Settings Tabs
| Tab | API Calls |
|-----|-----------|
| **ProfileTab** | GET /api/auth/profile, PUT /api/auth/profile, POST /api/auth/reset-password |
| **SchoolTab** | GET /api/settings/school, PUT /api/settings/school/identity, PUT /api/settings/school/staking-defaults |
| **PlatformTab** | GET /api/admin/org-settings, PUT /api/admin/org-settings/limits |
| **AlertsTab** | GET /api/coach/alerts/config, PUT /api/coach/alerts/config/:type |
| **TableDefaultsTab** | GET /api/settings/table-defaults, PUT /api/settings/table-defaults |
| **OrgTab** | GET/PUT /api/admin/org-settings/blind-structures, /leaderboard, /autospawn |
| **DangerZoneTab** | POST /api/auth/verify-password, POST /api/auth/deactivate |

### 2.3 Components

#### Layout & Navigation
| Component | Purpose |
|-----------|---------|
| `AppLayout` | Sticky GlobalTopBar + left SideNav + scrollable Outlet |
| `GlobalTopBar` | App-wide header: logo, page title, chip balance, role pill, avatar dropdown |
| `SideNav` | 64px icon-only sidebar with badge counts, role-gated links |
| `TopBar` | **Table-specific** header: BB toggle, table name, mode badges, player count, leave button |

> **TopBar vs GlobalTopBar**: Different contexts — table game view vs app shell. Both needed.

#### Table Cards (Lobby)
| Component | Purpose | Notes |
|-----------|---------|-------|
| `TableCard` | Lobby card for coached/auto/tournament tables | Full card with status, privacy, blinds, mode badge pill (Coached/Auto Deal/Tournament/Bot Table), action buttons |
| `BuyInModal` | Buy-in dialog for joining uncoached tables | BB slider (50–200), chip bank balance, confirm → navigate with `location.state.buyInAmount` |
| `BotTableCard` | Lobby card for bot tables | Variant with difficulty + human/bot counts |
| `NewTableCard` | "+" button to create a table | Minimal trigger component |
| `TableTile` | Multi-table grid tile | When focused → expands to full PokerTable |
| `TableStatusChip` | Compact status for multi-table header bar | Phase, players, pot, acting player |

> **Duplication**: `TableCard` and `BotTableCard` have near-identical layouts. Candidate for consolidation with a `variant` prop.

#### Game Table
| Component | Purpose |
|-----------|---------|
| `PokerTable` | Core game: oval felt, board, seats, pot, betting controls, overlays |
| `PlayerSeat` | Individual seat: name, stack, hole cards, action badge, equity, hover stats |
| `GhostSeat` | Replay ghost player (different from PlayerSeat — no live hover, shows action at cursor) |
| `BoardCards` | 5 community card slots with phase label |
| `Card` | Single playing card (face-up or face-down) |
| `BettingControls` | Slide-up betting panel: fold/check/call/raise + slider |
| `HandConfigPanel` | Scenario config: hole cards, board, deck mode |

#### Coach Tools
| Component | Purpose |
|-----------|---------|
| `CoachSidebar` | 15-prop composition layer: GAME / HANDS / PLAYLISTS tabs. "Build Scenario" button in HANDS tab opens inline `ScenarioBuilder` modal (no page nav). |
| `sidebar/GameControlsSection` | RNG/MANUAL toggle, deal button, equity toggles, share range |
| `sidebar/BlindLevelsSection` | Set SB/BB |
| `sidebar/HandLibrarySection` | Hand search, range filter, load/playlist buttons |
| `sidebar/PlayersSection` | Seat management |
| `sidebar/PlaylistsSection` | Playlist CRUD in sidebar |
| `sidebar/ReplayControlsSection` | Replay navigation |
| `sidebar/UndoControlsSection` | Undo/rollback |
| `sidebar/AdjustStacksSection` | Manual stack adjustment |
| `sidebar/HistorySection` | Recent hands |
| `TagHandPill` | Floating collapsible tag pill during active hands |
| `PlaylistEditor` | Modal editor for playlist CRUD |
| `ScenarioBuilder` | Full scenario builder UI. Used as standalone page in `/admin/hands` and as inline modal in `TablePage`. |
| `ScenarioPickerModal` | Modal to browse/select scenarios for a playlist |

#### Tournament Components
| Component | Purpose | Audience |
|-----------|---------|---------|
| `TournamentTopBar` | Level, blinds, countdown, field size, avg stack | All players |
| `TournamentInfoPanel` | Right panel: eliminations, ICM, deal button | All players |
| `TournamentSidebar` | Left panel: start/pause/eliminate/visibility controls | Manager only |
| `ManagedByBadge` | Floating badge: manager name + claim/steal buttons | All players |

#### Equity & Range Display
| Component | Purpose |
|-----------|---------|
| `EquityBadge` | % overlay on player seat |
| `PlayerRangePanel` | Floating panel showing assigned range in config phase |
| `SharedRangeOverlay` | Coach-broadcast range modal (hand matrix) |
| `RangeMatrix` | 13×13 interactive hand group matrix (drag-select, color modes) |
| `RangePicker` | Full panel: matrix + presets + range string input |
| `MistakeMatrixPanel` | RangeMatrix variant showing mistake frequency per hand group |
| `PlayerHeatmap` | RangeMatrix variant showing dealt hand frequency heatmap |

#### Status & Badge Components
| Component | Purpose |
|-----------|---------|
| `StatusBadge` | Session status pill: active / waiting / paused / scenario / tournament |
| `TableStatusChip` | Compact live table status for multi-table view |
| `PrivacyBadge` | Table privacy indicator: School / Private (null for Open) |
| `ManagedByBadge` | Tournament manager indicator |

> These are distinct enough to keep separate — different data, different locations in UI.

#### Toasts & Feedback
| Component | Notes |
|-----------|-------|
| `ErrorToast` | Red, 6s auto-dismiss |
| `NotificationToast` | Gold, 6s auto-dismiss |

> **Duplication**: ErrorToast and NotificationToast have identical logic, only color differs. Consolidate into `Toast` with `type` prop.

#### Utilities
| File | Exports |
|------|---------|
| `utils/chips.js` | `fmtChips(amount, bigBlind, bbView)` |
| `utils/comboUtils.js` | `handGroupToCombos`, `comboToHandGroup`, `selectedHandGroupsToComboArray`, `comboArrayToHandGroups` |
| `utils/rangeParser.js` | `parseRange`, `validateRange`, `countCombos` |
| `lib/api.js` | `apiFetch(path, opts)` — injects JWT header from localStorage, base URL from env |
| `lib/supabase.js` | **Proxy stub that throws** — no direct Supabase access from browser |

### 2.4 Hooks & Contexts

#### AuthContext (`contexts/AuthContext.jsx`)
- State: `user { id (=stableId), name, role, token }`, `permissions: Set<string>`, `loading`
- Methods: `login()`, `register()`, `logout()`, `hasPermission(key)`, `isTrial` (derived)
- Permissions fetched from `GET /api/auth/permissions` on mount and after login
- JWT decoded client-side with `atob` (not verified — display only)

#### LobbyContext (`contexts/LobbyContext.jsx`)
- State: `activeTables[]` (polled every 10s via `GET /api/tables`), `recentHands[]` (**declared but never populated**)
- Methods: `refreshTables()`

#### TableContext (`contexts/TableContext.jsx`)
- Wraps: `useTableSocket`, `useGameState`, `usePlaylistManager`, `useNotifications`
- Exposes: `{ tableId, socket, gameState, playlist, notifications }`

#### Socket Hooks
| Hook | Purpose |
|------|---------|
| `useSocket` | Composition layer over all sub-hooks; 40+ combined methods |
| `useConnectionManager` | Socket.io lifecycle, auto-rejoin on reconnect, global error forwarding |
| `useGameState` | Game state listeners (18+ events), 40+ game emit helpers |
| `useTableSocket` | **Separate socket** for TablePage; distinct from useConnectionManager. Reads `?spectate=true` URL param → passes `isSpectator` to join_room. Reads `location.state.buyInAmount` → passes to join_room. Returns `{ socketRef, emit, connected, isSpectator }`. |
| `usePlaylistManager` | Playlist state + emit helpers |
| `useReplay` | 7 replay emit helpers |
| `useNotifications` | Error + notification toast queue with TTL timers |
| `usePreferences` | `bbView` persisted to localStorage |
| `useHistory` | **FILE DOES NOT EXIST** — referenced in conversation but not in codebase |

---

## 3. Backend Layer

### 3.1 Server Bootstrap

`server/index.js` (~110 lines):
1. Validate env (`SESSION_SECRET` required — exits if missing)
2. Express: CORS, JSON body, Morgan logging, `authLimiter` on `/api/auth/*`
3. Mount all route modules (see API contract)
4. Initialize Socket.io with `socketAuthMiddleware`
5. Register all 11 socket handler modules
6. Start lifecycle: `idleTimer`, `activateScheduledTables`, shutdown handlers

### 3.2 REST API Contract

**Route mount points** (from index.js):

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
/health                → routes/health.js           [no auth]
/api/admin             → routes/admin/*.js
```

#### /api/auth
| Method | Path | Middleware | Purpose |
|--------|------|-----------|---------|
| POST | /register | authLimiter | Self-register (trial window: 7d / 20 hands) |
| POST | /login | authLimiter | Authenticate → JWT |
| POST | /register-coach | authLimiter | Coach application (pending until admin approves) |
| GET | /profile | requireAuth | Own profile |
| PUT | /profile | requireAuth | Update name/email |
| POST | /reset-password | requireAuth | Change password (requires current) |
| POST | /verify-password | requireAuth | Verify password (for gating destructive actions) |
| POST | /deactivate | requireAuth | Soft-delete own account |
| GET | /permissions | requireAuth | List caller's permissions |

#### /api/hands
| Method | Path | Middleware | Purpose |
|--------|------|-----------|---------|
| GET | /tags | requireAuth | Distinct tags for filter UI |
| GET | /tables | requireAuth | Distinct table IDs for filter UI |
| GET | /history | requireAuth | Filterable paginated hand browser |
| GET | / | requireAuth | List hands (tableId, limit, offset) |
| GET | /:handId | requireAuth | Single hand detail |
| GET | /:handId/equity | requireAuth | Compute equity per street |
| GET | /:handId/annotations | requireAuth | List annotations |
| POST | /:handId/annotations | requireAuth | Add annotation |
| DELETE | /annotations/:id | requireAuth | Delete annotation (author or coach) |

#### /api/players
| Method | Path | Middleware | Purpose |
|--------|------|-----------|---------|
| GET | /:id/hover-stats | **no auth** | Hover tooltip stats (intentional spectator access) |
| GET | /:id/stats | requireAuth | Player stats by mode (overall/bot/human) |
| GET | / | requireAuth | All players with stats |
| GET | /:id/hands | requireAuth | Player hand history |

#### /api/sessions
| Method | Path | Middleware | Purpose |
|--------|------|-----------|---------|
| GET | /:id/stats | requireAuth | End-of-session stats |
| GET | /:id/report | requireAuth | Session HTML report |
| GET | /current | requireAuth | Live in-memory stats |

#### /api/tables
| Method | Path | Middleware | Purpose |
|--------|------|-----------|---------|
| GET | / | requireAuth | List non-completed tables (merged with SharedState) |
| POST | / | requireAuth + requirePermission('table:create') | Create table |
| GET | /:id | requireAuth | Single table + live status |
| PATCH | /:id | requireAuth (owner or admin) | Update table |
| DELETE | /:id | requireAuth (owner or admin) | Close table |
| POST | /:id/controller | requireAuth (owner or admin) | Transfer controller |
| GET/POST/DELETE | /:id/invited, /:id/invited/:playerId | requireAuth (owner or admin) | Whitelist management |
| GET | /table-presets | requireAuth | List quick-pick presets |
| POST/PATCH/DELETE | /table-presets, /table-presets/:id | requireAuth | Preset CRUD |
| POST | /table-presets/:id/clone | requireAuth | Clone preset |
| GET | /:id/tournament | requireAuth + requireFeature('tournaments') | System A tournament config + standings |
| POST | /:id/tournament/start | requireAuth + requireFeature + requireTournamentAccess | Start tournament |
| POST | /:id/tournament/advance-level | requireAuth + requireFeature + requireTournamentAccess | Force advance blind level |
| POST | /:id/tournament/end | requireAuth + requireFeature + requireTournamentAccess | End tournament |
| POST | /:id/tournament/pause | requireAuth + requireFeature + requireTournamentAccess | Pause timer |
| POST | /:id/tournament/resume | requireAuth + requireFeature + requireTournamentAccess | Resume timer |
| POST | /:id/tournament/eliminate-player | requireAuth + requireFeature + requireTournamentAccess | Eliminate player |
| GET | /:id/tournament/deal-proposal | requireAuth + requireFeature | ICM deal amounts |
| POST | /:id/tournament/deal-proposal/accept | requireAuth + requireFeature + requireTournamentAccess | Accept deal |

#### /api/tournaments (System B standalone)
| Method | Path | Middleware | Purpose |
|--------|------|-----------|---------|
| POST | / | requireAuth + requireRole('coach') | Create tournament |
| GET | / | requireAuth + requireRole('coach') | List tournaments |
| GET | /:id | requireAuth + requireRole('coach') | Tournament detail |
| POST | /:id/register | requireAuth + requireRole('coach') | Register player |
| PATCH | /:id/status | requireAuth + requireRole('coach') | Update status |
| GET | /:id/standings | requireAuth | Standings (no role restriction) |
| PATCH | /:id/standings/:playerId | requireAuth + requireRole('coach') | Update standing |
| PATCH | /:id/level | requireAuth + requireRole('coach') | Advance level |

#### /api/tournament-groups
| Method | Path | Middleware | Purpose |
|--------|------|-----------|---------|
| POST | / | requirePermission('tournament:manage') | Create group + tables |
| GET | /:id | requireAuth | Group details |
| POST | /:id/start | requirePermission('tournament:manage') | Start all tables |
| POST | /:id/end | requirePermission('tournament:manage') | End entire group |
| GET | /:id/standings | requireAuth | Combined standings |
| POST | /:id/move-player | requirePermission('tournament:manage') | Move player between tables |
| POST | /:id/auto-balance | requirePermission('tournament:manage') | Auto-balance players |

#### /api/coach
| Method | Path | Middleware | Purpose |
|--------|------|-----------|---------|
| GET | /alerts | requireRole('coach') | Get/generate alerts |
| PATCH | /alerts/:id | requireRole('coach') | Update alert status |
| GET | /alerts/config | requireRole('coach') | Alert config |
| PUT | /alerts/config/:type | requireRole('coach') | Update alert config |
| GET | /students/:id/prep-brief | requireRole('coach') | Prep brief (cached 1h) |
| POST | /students/:id/prep-brief/refresh | requireRole('coach') | Force regenerate |
| GET | /students/:id/reports | requireRole('coach') | List progress reports |
| GET | /students/:id/reports/:rid | requireRole('coach') | Report detail |
| POST | /students/:id/reports | requireRole('coach') | Generate custom report |
| GET | /reports/stable | requireRole('coach') | Stable-wide summary |

#### /api/staking
| Method | Path | Middleware | Purpose |
|--------|------|-----------|---------|
| GET | /contracts | requireAuth | Coach sees own; player sees own |
| POST | /contracts | requirePermission('staking:manage') | Create contract |
| PATCH | /contracts/:id | requirePermission('staking:manage') | Update contract |
| GET | /contracts/:id/state | requireAuth (party only) | Compute current state |
| GET | /contracts/:id/monthly | requireAuth (party only) | Monthly breakdown |
| GET/POST | /contracts/:id/sessions | requireAuth (party only) | List / log session |
| PATCH | /sessions/:id | requireAuth (party only; player within 48h) | Edit session |
| DELETE | /sessions/:id | requireAuth (party only; player within 48h) | Delete session |
| POST | /sessions/:id/dispute | requireAuth (party only) | Dispute session |
| POST | /sessions/:id/resolve | requirePermission('staking:manage') | Resolve dispute |
| GET/POST | /contracts/:id/settlements | requireAuth (party only) | List / propose settlement |
| PATCH | /settlements/:id/approve | requireAuth (party only) | Approve settlement |
| PATCH | /settlements/:id/reject | requireAuth (party only) | Reject settlement |
| GET/POST | /contracts/:id/adjustments | requireAuth / requirePermission | List / create adjustment |
| GET | /overview | requirePermission('staking:manage') | All active contracts |

#### /api/scenarios (Scenario Builder v2)
| Method | Path | Middleware | Purpose |
|--------|------|-----------|---------|
| GET/POST | /folders | requirePermission('hand:tag') | Folder tree CRUD |
| PATCH/DELETE | /folders/:id | requirePermission('hand:tag') | Update / delete folder |
| GET/POST | / | requirePermission('hand:tag') | List / create scenario |
| GET/PATCH/DELETE | /:id | requirePermission('hand:tag') | Scenario detail / edit / soft-delete |
| POST | /:id/duplicate | requirePermission('hand:tag') | Duplicate |
| POST | /from-hand | requirePermission('hand:tag') | Create scenario from hand |
| GET | /:id/versions | requirePermission('hand:tag') | Version history |
| PATCH/DELETE | /playlists/:id (soft) | requirePermission('hand:tag') | Playlist meta update / soft-delete |
| GET/POST | /playlists/:id/items | requirePermission('hand:tag') | Playlist items |
| PATCH/DELETE | /playlists/:id/items/:itemId | requirePermission('hand:tag') | Reorder / remove item |
| POST | /playlists/:id/items/reorder | requirePermission('hand:tag') | Bulk reorder |

#### /api/playlists (Legacy — hand-based playlists)
| Method | Path | Middleware | Purpose |
|--------|------|-----------|---------|
| GET | / | requireAuth + requireFeature('playlists') | List playlists |
| POST | / | + requirePermission('playlist:manage') | Create |
| GET/POST | /:id/hands | requireFeature | List / add hand |
| DELETE | /:id/hands/:handId | + requirePermission | Remove hand |
| DELETE | /:id | + requirePermission | Delete playlist |

#### /api/settings
| Method | Path | Middleware | Purpose |
|--------|------|-----------|---------|
| GET/PUT/DELETE | /table-defaults | requireAuth | Table defaults (scoped to caller's role) |
| GET/POST/PATCH/DELETE | /presets, /presets/:id | requireAuth | Table preset CRUD |
| GET | /school | requireAuth (coach+ only) | School settings |
| PUT | /school/identity | requireAuth (coach+) | Update school name/desc |
| PUT | /school/staking-defaults | requireAuth (coach+) | Staking defaults |
| GET/PUT | /school/platforms | requireAuth (coach+) | Platform list |
| PUT | /school/leaderboard | requireAuth (coach+) | Leaderboard config |

#### /api/admin
| Method | Path | Middleware | Purpose |
|--------|------|-----------|---------|
| GET/POST | /users | requirePermission('user:manage') | List / create user |
| GET | /users/export-csv | requirePermission('user:manage') | CSV export |
| GET/PUT/DELETE | /users/:id | requirePermission('user:manage') | User detail / update / archive |
| PATCH | /users/:id/status, /role, /coach | requirePermission('user:manage') | Status / role / coach assignment |
| POST | /users/:id/reset-password, /roles | requirePermission('user:manage') | Password reset / granular roles |
| GET/POST | /players | requirePermission('crm:view') | CRM player list |
| GET | /players/:id/crm | requirePermission('crm:view') | Full CRM view |
| GET/POST/PUT | /players/:id/notes, /tags, /schedule | crm:view / crm:edit | CRM notes/tags/schedule |
| GET | /players/:id/snapshots, /game-sessions, /groups | crm:view | Historical data |
| POST | /students | requirePermission('crm:edit') | Create student |
| POST | /snapshots/compute | requirePermission('user:manage') | Trigger snapshot (async) |
| GET/POST/PATCH/DELETE | /groups | crm:view / crm:edit | Group CRUD |
| GET/POST/DELETE | /groups/:id/members, /members/:playerId | crm:view / crm:edit | Group members |
| GET/POST/PATCH/DELETE | /schools | requirePermission('school:manage') | School CRUD |
| GET/POST/DELETE | /schools/:id/members, /members/:playerId | school:manage | School members |
| GET/PUT | /schools/:id/features, /group-policy | school:manage | School feature flags + group policy |
| GET/PUT | /org-settings/* | requirePermission('user:manage') | Org-level settings |
| GET/POST/PATCH/DELETE | /org-settings/blind-structures, /autospawn, /leaderboard, /groups | user:manage | Org settings sections |
| POST | /tournaments | requireFeature('tournaments') + requirePermission('tournament:manage') | Create tournament (with rollback) |
| POST | /scenarios | requirePermission('hand:tag') | Save legacy scenario config |
| GET | /scenarios | requirePermission('hand:tag') | List legacy scenario configs |

#### /api/blind-presets & /api/payout-presets
CRUD for system/school-scoped blind and payout structure presets. Coach-level create/delete.

#### /api/announcements
| Method | Path | Middleware | Purpose |
|--------|------|-----------|---------|
| POST | / | requireRole('coach') | Create announcement |
| GET | / | requireAuth | List visible announcements |
| GET | /unread-count | requireAuth | Badge count |
| PATCH | /:id/read | requireAuth | Mark read |

#### /api/bot-tables
| Method | Path | Middleware | Purpose |
|--------|------|-----------|---------|
| POST | / | requireAuth | Create bot table |
| GET | / | requireAuth | List bot tables (role-scoped visibility) |

#### /api/analysis
| Method | Path | Middleware | Purpose |
|--------|------|-----------|---------|
| GET | /tags | requireAuth + requireFeature('analysis') | Aggregate tag counts |
| GET | /hands-by-tag | requireAuth + requireFeature('analysis') | Hands matching a tag |

#### /api/chip-bank (requires requireFeature('chip_bank'))
CRUD for chip balances and transactions. Coach can reload. Admin can adjust.

#### /health
No auth. Returns `{ status, tables, db, dbError? }`. Returns 503 if DB down.

### 3.3 Socket Event Layer

#### Architecture
- **Auth**: `socketAuthMiddleware` reads JWT from `socket.handshake.auth.token`. Populates `socket.data.{ authenticated, stableId, playerId (= stableId), role, isCoach, isBot, jwtName }`. Unauthenticated connections allowed (spectators).
- **Namespaces**: None — all events on default namespace.
- **11 handler modules** registered per connection via `socket/index.js`.

#### Client → Server Events
| Event | Handler | Guard | Purpose |
|-------|---------|-------|---------|
| `join_room` | joinRoom | optional auth | Join table (player/coach/spectator). Enforces privacy, mode, trial limits. |
| `disconnect` | disconnect | — | Built-in. Starts 60s TTL before player removal. |
| `start_game` | gameLifecycle | requireCoach | Start new hand. |
| `reset_hand` | gameLifecycle | requireCoach | Reset to waiting phase. |
| `start_configured_hand` | gameLifecycle | requireCoach | Start scenario hand. |
| `toggle_equity_display` | gameLifecycle | requireCoach | Toggle equity visibility. |
| `place_bet` | betting | (turn check) | Player action: fold/check/call/raise/all-in. |
| `open_config_phase` | handConfig | requireCoach | Enter scenario setup mode. |
| `update_hand_config` | handConfig | requireCoach | Update hole cards/board/deck in config phase. |
| `load_hand_scenario` | handConfig | requireCoach | Load historical hand as scenario. Position-mapped. |
| `manual_deal_card` | coachControls | requireCoach | Deal specific card to player or board. |
| `undo_action` | coachControls | requireCoach | Undo last action (marks as reverted in DB). |
| `rollback_street` | coachControls | requireCoach | Rewind to previous street. |
| `set_player_in_hand` | coachControls | requireCoach | Toggle player seat inclusion. |
| `toggle_pause` | coachControls | requireCoach OR moderator | Pause/resume. Saves timer remainder. |
| `set_blind_levels` | coachControls | requireCoach | Change SB/BB. |
| `set_mode` | coachControls | requireCoach | Change table mode (RNG/manual/hybrid). |
| `force_next_street` | coachControls | requireCoach | Skip to next street. |
| `award_pot` | coachControls | requireCoach | Award pot to specified winner. |
| `adjust_stack` | coachControls | requireCoach | Adjust player stack. |
| `toggle_range_display` | coachControls | requireCoach | Toggle range visibility to players. |
| `toggle_heatmap_display` | coachControls | requireCoach | Toggle heatmap visibility. |
| `share_range` | coachControls | requireCoach | Share range diagram to all players. |
| `clear_shared_range` | coachControls | requireCoach | Clear shared range. |
| `transfer_controller` | coachControls | requireCoach | Transfer table control. |
| `load_replay` | replay | requireCoach | Load hand into replay mode. |
| `replay_step_forward` | replay | requireCoach | Advance replay by one action. |
| `replay_step_back` | replay | requireCoach | Rewind replay by one action. |
| `replay_jump_to` | replay | requireCoach | Jump to action index. |
| `replay_branch` | replay | requireCoach | Branch from replay into live play. |
| `replay_unbranch` | replay | requireCoach | Return to replay from branch. |
| `replay_exit` | replay | requireCoach | Exit replay mode. |
| `transition_to_review` | replay | requireCoach | Load hand into ReplayEngine and broadcast `transition_to_review` to all clients (phase must be `waiting`). `handId` optional — falls back to last hand. |
| `transition_back_to_play` | replay | requireCoach | Exit replay and broadcast `transition_back_to_play` to all clients. |
| `update_hand_tags` | playlists | requireCoach | Tag a hand. Auto-creates playlists. |
| `create_playlist` | playlists | requireCoach | Create named playlist. |
| `get_playlists` | playlists | none | Fetch all playlists for table. |
| `add_to_playlist` | playlists | requireCoach | Add hand to playlist. |
| `remove_from_playlist` | playlists | requireCoach | Remove hand from playlist. |
| `delete_playlist` | playlists | requireCoach | Delete playlist. |
| `activate_playlist` | playlists | requireCoach | Activate playlist drill mode. |
| `deactivate_playlist` | playlists | requireCoach | Deactivate playlist mode. |
| `save_scenario_to_playlist` | scenarioBuilder | requireCoach | Save custom scenario. |
| `get_scenario_configs` | scenarioBuilder | requireCoach | Fetch saved scenario configs. |
| `tournament:claim_management` | tournament | authenticated | Claim orphaned tournament management. |
| `tournament:release_management` | tournament | none | Release management intentionally. |
| `tournament:steal_management` | tournament | authenticated + bcrypt password | Steal management from lower-ranked manager. |
| `tournament:move_player` | tournament | requireCoach | Move player between tables. Broadcasts to both. |
| `tournament:pause` | tournament | isManager | Pause tournament. |
| `tournament:resume` | tournament | isManager | Resume tournament. |
| `tournament:eliminate_player` | tournament | isManager | Manually eliminate player. |
| `tournament:set_hand_visibility` | tournament | isManager | Control hand visibility. |
| `tournament:set_icm_overlay` | tournament | isManager | Toggle ICM overlay. |
| `tournament:request_reentry` | tournament | none | Request re-entry after elimination. |
| `tournament:request_addon` | tournament | none | Request add-on during break. |
| `player_sit_out` | misc | non-coach, non-spectator | Sit player out for next hand (marks in_hand=false). |
| `player_sit_in` | misc | non-coach, non-spectator | Return player to active rotation (marks in_hand=true). |
| `client_error` | misc | none | Log client error to server. |

#### Server → Client Events
| Event | When | Receivers | Payload |
|-------|------|-----------|---------|
| `table_config` | join_room | joining socket | `{ mode }` |
| `room_joined` | join_room success | joining socket | `{ playerId, isCoach, isSpectator, isManager, name, tableId }` |
| `game_state` | any state change | all in room | Full game state (role-filtered) |
| `notification` | various | all in room | `{ type, message }` |
| `hand_started` | start_game | requesting socket | `{ handId }` |
| `hand_complete` | reset_hand | all in room | Showdown result |
| `session_stats` | reset_hand | all in room | Session statistics |
| `action_timer` | timer start/clear | all in room | `{ playerId, duration, startedAt }` or null |
| `equity_update` | street change | all in room | `{ phase, equities[], showToPlayers }` |
| `equity_settings` | toggle equity/range/heatmap | all in room | `{ showToPlayers, showRangesToPlayers, showHeatmapToPlayers }` |
| `coach_disconnected` | coach disconnect | all in room | `{ message }` |
| `range_shared` | share_range / clear | all in room | `{ handGroups[], label }` or null |
| `controller_transferred` | transfer_controller | all in room | `{ toPlayerId, byPlayerId, byName }` |
| `replay_loaded` | load_replay | requesting socket | `{ handId, actionCount }` |
| `transition_to_review` | transition_to_review | all in room | `{ handId, tableId, actionCount }` — all clients navigate to ReviewTablePage in socket mode |
| `transition_back_to_play` | transition_back_to_play | all in room | `{ tableId }` — all clients navigate back to `/table/:tableId` |
| `showdown_result` | force_next_street / award_pot / auto | all in room | Showdown details |
| `playlist_state` | any playlist mutation | requesting socket | `{ playlists[] }` |
| `hand_tags_saved` | update_hand_tags | requesting socket | `{ handId, coach_tags[] }` |
| `scenario_saved` | save_scenario_to_playlist | requesting socket | `{ scenarioId, playlistId, scenarioName }` |
| `scenario_configs` | get_scenario_configs | requesting socket | `{ configs[] }` |
| `tournament:late_reg_rejected` | join_room (late reg closed) | joining socket | `{ reason }` |
| `tournament:claim_result` | claim_management | requesting socket | `{ granted, managedBy?, managerName? }` |
| `tournament:steal_result` | steal_management | requesting socket | `{ granted, reason? }` |
| `tournament:pause_result` | tournament:pause | requesting socket | `{ ok }` |
| `tournament:resume_result` | tournament:resume | requesting socket | `{ ok }` |
| `tournament:eliminate_result` | eliminate_player | requesting socket | Result from controller |
| `tournament:reentry_rejected` | request_reentry (denied) | requesting socket | `{ reason }` |
| `tournament:addon_rejected` | request_addon (denied) | requesting socket | `{ reason }` |
| `player_busted` | AutoController.onHandComplete | busted socket only | `{ message }` — player stack reached 0; they are sat out automatically. |
| `error` | validation / auth failure | requesting socket | `{ message }` |
| `sync_error` | game state sync failure | requesting socket | `{ message }` |

---

## 4. Game Engine

All game engine modules live in `server/game/`.

### State Machine

```
GameManager (core state — 700+ lines)
  └── SessionManager (decorator — VPIP/PFR/WTSD tracking)
        └── Controller (TableController subclass per mode)
              ├── CoachedController     (coached_cash — manual deal)
              ├── AutoController        (uncoached_cash — self-contained lifecycle: _startHand/DB log, _completeHand/analyzer, onHandComplete/bust-detection/2s re-deal, onPlayerJoin auto-start; canPause/canUndo/canReplay=false)
              ├── BotTableController    (bot_cash — spawns socket.io-client bots)
              ├── TournamentController  (tournament — blind timer, management)
              └── TournamentGroupController (MTT group — shared blind schedule)
```

### GameManager State Shape

```javascript
{
  table_id, mode, phase, paused, players[],
  board[], pot, current_bet, min_raise, current_turn,
  dealer_seat, small_blind, big_blind, deck[],
  winner, winner_name, history[], street_snapshots[],
  config_phase, config,
  showdown_result, side_pots[],
  last_raise_was_full, last_aggressor,
  playlist_mode: { active, playlistId, currentIndex, hands[] },
  is_scenario,
  replay_mode: { active, source_hand_id, actions[], cursor, branched, pre_branch_snapshot, ... }
}
```

### Pure Game Modules

| Module | Exports | Notes |
|--------|---------|-------|
| `bettingRound.js` | `isBettingRoundOver`, `findNextActingPlayer` | Pure, zero deps |
| `ShowdownResolver.js` | `resolve(activePlayers, allPlayers, board, pot)` | Pure; returns stackDeltas Map |
| `SidePotCalculator.js` | `buildSidePots(players)` | Pure; returns [{amount, eligiblePlayerIds}] |
| `HandEvaluator.js` | `evaluate(holeCards, board)` → {rank 0-9, rankName, bestFive, kickers} | Pure; wheel handled correctly |
| `HandGenerator.js` | `generateHand(config, players)` | Fill-the-Gaps algo; texture support; 100-attempt fallback (silent) |
| `BoardGenerator.js` | `generateFlop(texture, excluded)`, `buildDealConfig(scenario)` | Texture generators |
| `Deck.js` | `createDeck`, `shuffleDeck`, `isValidCard`, `getUsedCards` | Pure utilities |
| `EquityService.js` | `computeEquity(players, board)` | Wraps poker-odds-calculator; returns [] on error |
| `RangeParser.js` | `parseRange`, `validateRange`, `countCombos`, `pickFromRange` | Supports AA-TT, AKs, 66+, connector ranges |
| `positions.js` | `buildPositionMap`, `getPosition`, `isInPosition` | Hardcoded POSITION_NAMES by table size |
| `ReplayEngine.js` | `load`, `stepForward/Back`, `jumpTo`, `branch`, `unbranch`, `exit` | Mutates state by reference; deep-copy on branch |
| `BotDecisionService.js` | `decide(gameState, botId, difficulty)` | Easy/medium/hard; pot odds only; no board/position awareness |

### Tag Analyzer Pipeline

`AnalyzerService.buildAnalyzerContext(handId)` → assembles context, runs 9 analyzers via `Promise.allSettled`.

| Analyzer | Tags Produced | Type |
|----------|--------------|------|
| street | WALK, SAW_FLOP, SAW_TURN, SAW_RIVER, WENT_TO_SHOWDOWN | auto |
| preflop | 3BET_POT, FOUR_BET_POT, SQUEEZE_POT, ALL_IN_PREFLOP, LIMPED_POT, BTN_OPEN, BLIND_DEFENSE | auto |
| postflop | C_BET, CHECK_RAISE, BLUFF_CATCH, DONK_BET, RIVER_RAISE | auto |
| potType | WHALE_POT, MULTIWAY, SHORT_STACK, DEEP_STACK, OVERBET | auto |
| board | RAINBOW_BOARD, TWO_TONE_BOARD, MONOTONE_BOARD, UNPAIRED/PAIRED/TRIPS_BOARD, CONNECTED/ONE_GAP/DISCONNECTED_BOARD, ACE_HIGH/BROADWAY/MID/LOW_BOARD, WET/DRY_BOARD | auto |
| mistakes | UNDO_USED, OPEN_LIMP, OVERLIMP, COLD_CALL_3BET, FOLD_TO_PROBE, LIMP_RERAISE, SQUEEZE_LIMP, EQUITY_FOLD, MIN_RAISE | mistake |
| sizing | PROBE_BET (<0.25), THIRD_POT_BET (0.25-0.49), HALF_POT_BET (0.50-0.79), POT_BET (0.80-1.10), OVERBET (1.10-2.00), OVERBET_JAM (>2.00) | sizing |
| positional | C_BET_IP, C_BET_OOP (with player_id) | auto |
| handStrength | STRONG_HAND, MARGINAL_HAND, WEAK_HAND, BUSTED_DRAW | auto |
| equity | EQUITY_FAVORITE, EQUITY_UNDERDOG, EQUITY_COIN_FLIP (with player_id) | auto |

**Tag write rule**: `replaceAutoTags()` is the only function that deletes `auto`, `mistake`, or `sizing` tags. Coach tags are never auto-replaced.

---

## 5. Services & Background Jobs

### Services (`server/services/`)

| Service | Purpose | Key Dependencies |
|---------|---------|-----------------|
| `AlertService` | Generate 6 detector types; dedup-upsert to `alert_instances` | 6 detector modules, student_baselines |
| `BaselineService` | 30-day rolling VPIP/PFR/WTSD/cbet baselines; upsert to `student_baselines` | session_player_stats, hand_actions |
| `ProgressReportService` | 8-section report, 0–100 grade, weekly/monthly/custom | student_baselines, hand_tags |
| `SessionPrepService` | 7-section pre-session brief; 1-hour cache in `session_prep_briefs` | BaselineService, NarratorService |
| `SessionQualityService` | 0–100 session quality score; stored in `session_player_stats.quality_score` | session_player_stats |
| `PlaylistExecutionService` | Start/advance drill sessions; filter by seated player count | drill_sessions, playlist_items |
| `IcmService` | ICM payout calculation for tournaments | Pure math |
| `StakingCalcService` | Compute contract state (makeup, profit split) | staking_sessions, staking_settlements |
| `SettingsService` | Resolve user preferences (multi-scope: org → school → coach → table) | settings table |
| `NarratorService` | Claude Haiku narration via Anthropic API; returns null if key absent | ANTHROPIC_API_KEY |

### Alert Detectors (`server/services/detectors/`)
`InactivityDetector`, `VolumeDropDetector`, `MistakeSpikeDetector`, `LosingStreakDetector`, `RegressionDetector`, `MilestoneDetector`

### Other (`server/`)

| Module | Purpose |
|--------|---------|
| `ai/NarratorService.js` | Same as services/NarratorService — **potential duplicate** |
| `reports/SessionReport.js` | HTML report generation |
| `logs/AlphaReporter.js` | Alpha report generator (writes to alpha_logs) |
| `logs/logger.js` | Structured logger (level, category, event) |
| `jobs/snapshotJob.js` | Periodic player snapshot computation |
| `lifecycle/tableCleanup.js` | Evict idle tables (30 min, 0 sockets); trigger quality + baseline recompute |
| `lifecycle/shutdown.js` | SIGINT/SIGTERM → markAllHandsIncomplete |
| `lifecycle/idleTimer.js` | Optional: shutdown server after N minutes (IDLE_TIMEOUT_MINUTES) |
| `state/SharedState.js` | 9 in-memory Maps (see section 7.2) |

---

## 6. Auth & Permissions

### Middleware Chain

| Middleware | File | Purpose |
|-----------|------|---------|
| `requireAuth` | auth/requireAuth.js | Validates JWT; attaches `req.user = { stableId, name, role }` |
| `requireRole(role)` | auth/requireRole.js | **Hierarchy-aware** — `requireRole('coach')` passes for admin/superadmin. `ROLE_HIERARCHY` constant in the file. |
| `requirePermission(...keys)` | auth/requirePermission.js | Resolves `player_roles → roles → role_permissions → permissions`; in-memory cache with **5-min TTL** |
| `requireFeature(key)` | auth/featureGate.js | School-scoped feature flag; 1-min TTL; defaults to enabled if no school |
| `requireTournamentAccess()` | auth/tournamentAuth.js | Either `tournament:manage` permission OR row in `tournament_referees` |

### Permission Keys (16 total)

```
table:create     table:manage     hand:tag         hand:analyze
user:manage      user:view        playlist:create  playlist:manage
crm:view         crm:edit         admin:access     tournament:manage
school:manage    staking:manage   staking:view     staking:report
```

### Feature Gate Keys (9 total)

```
replay  analysis  chip_bank  playlists  tournaments  crm  leaderboard  scenarios  groups
```

### Socket Auth

`socketAuthMiddleware` populates `socket.data`:
- `authenticated`, `stableId`, `playerId` (= stableId), `role`, `isCoach`, `isBot`, `jwtName`
- `isCoach = true` for `coach`, `admin`, `superadmin` (broadened 2026-04-06)
- `socket.data.playerId` is set to `stableId` — used by `socketPermissions.requireSocketPermission`. ~~Was never set (BUG-04) — fixed 2026-04-06.~~

**Socket Delegation:** At `join_room` time, if `table.controller_id === socket.data.stableId` and the socket is not already coach-tier, `socket.data.isCoach = true` and `socket.data.isDelegate = true` are set. This grants a designated table controller all coach socket powers regardless of their role.

### Tournament Auth

- `requireTournamentAccess()` — checks `tournament:manage` permission OR `tournament_referees` row
- Management steal requires bcrypt password verification stored in `tournament_configs`
- Manager role hierarchy: ROLE_RANK object (superadmin > admin > coach — referee removed 2026-04-06)

### Trial Accounts (dual-window)

`trial` is no longer a role — it is a status flag (`trial_active` computed column on `player_profiles`, migration 044). New logins include `trialStatus: 'active'` in the JWT. Client checks `user.role === 'trial' || user.trialStatus === 'active'` for backward compatibility with active sessions bearing the old role value.

---

## 7. Data Layer

### 7.1 Repositories

All repositories live in `server/db/repositories/`. Exported flat via `server/db/index.js`.

| Repository | Tables Touched | Notes |
|-----------|---------------|-------|
| `HandRepository` | hands, hand_players, hand_actions, hand_tags, stack_adjustments | `endHand` uses Promise.allSettled — tolerates partial player update failures |
| `PlayerRepository` | player_profiles, player_roles, leaderboard | `listPlayers` does 2-step role lookup (workaround for PostgREST cache); `getPlayerHands` is 3-query flow |
| `SessionRepository` | sessions, session_player_stats | |
| `TagRepository` | hand_tags | Delete-then-insert (not atomic) |
| `PlaylistRepository` | playlists, playlist_hands | `removeHandFromPlaylist` re-sequences with N+1 updates |
| `SchoolRepository` | schools, player_profiles, settings, groups | `findAll` makes N getMemberCounts queries |
| `ChipBankRepository` | player_chip_bank, chip_transactions | All writes via `apply_chip_transaction` RPC (atomic) |
| `AnnouncementRepository` | announcements, announcement_reads | `unreadCount` uses 2 queries instead of 1 COUNT+JOIN |
| `TableRepository` | tables, invited_players, table_presets | |
| `TournamentRepository` | tournament_configs, tournament_standings, tournaments, tournament_players | Covers both System A (configs) and System B (tournaments) |
| `BotTableRepository` | tables, player_profiles | School visibility filter applied client-side |
| `CRMRepository` | player_notes, player_tags, coaching_sessions, player_performance_snapshots, session_player_stats | |
| `ScenarioRepository` | scenario_configs | Legacy v1 scenarios |
| `ScenarioBuilderRepository` | scenarios, scenario_folders, playlists, playlist_items, drill_sessions | `incrementPlayCount` is read-then-write (race condition) |
| `StakingRepository` | staking_contracts, staking_sessions, staking_settlements, staking_adjustments | `assertParty()` guard on all contract-party endpoints |
| `BlindPresetRepository` | blind_structure_presets | System + school presets |
| `PayoutPresetRepository` | payout_presets | System + school presets |
| `TournamentGroupRepository` | tournament_groups, tournament_group_standings | |

### 7.2 Shared In-Memory State

`server/state/SharedState.js` — singleton, all maps keyed as described:

| Map | Key | Value | Notes |
|-----|-----|-------|-------|
| `tables` | tableId | SessionManager | Core per-table game state |
| `activeHands` | tableId | `{ handId, sessionId }` | Current hand context |
| `stableIdMap` | socketId | stableId | Socket → player identity |
| `reconnectTimers` | socketId | `{ timer, tableId, name, isCoach, configSnapshot }` | 60s reconnect grace |
| `ghostStacks` | stableId | stack | Saved on TTL expiry for reconnect |
| `actionTimers` | tableId | `{ timeout, startedAt, duration, playerId }` | Decision timer |
| `pausedTimerRemainders` | tableId | `{ playerId, remainingMs }` | Timer pause state |
| `equityCache` | tableId | `{ phase, equities[] }` | Cached equity calculations |
| `equitySettings` | tableId | `{ showToPlayers, showRangesToPlayers, showHeatmapToPlayers }` | |
| `groupControllers` | groupId | TournamentGroupController | Separate map for MTT groups |

---

## 8. Database Schema

44 migrations (041 applied to production; 042–044 committed on feat/phase2, pending deploy). Tables below show final state as of migration 044.

### Core Identity

**player_profiles** (001, 009, 014, 014b, 019, 020, 043, 044)
- `id uuid PK`, `display_name text UNIQUE COLLATE case_insensitive`, `email varchar(255) UNIQUE`, `password_hash`, `status CHECK(active/suspended/archived)`, `school_id → schools`, `coach_id → player_profiles`, `trial_expires_at`, `trial_hands_remaining`, `trial_active BOOLEAN GENERATED ALWAYS` (computed — migration 044), `is_bot bool`
- **Removed in migration 043**: `is_coach bool`, `is_roster bool` — use `player_roles` join instead

**roles / permissions / role_permissions / player_roles** (008, 014b, 017, 025)
- Standard RBAC. 9 seeded roles. 16 seeded permissions. Role-permission matrix in role_permissions.

**schools** (014, 017, 027, 038)
- `id uuid`, `name`, `max_coaches`, `max_students`, `status`, `description`, `default_tournament_ref_id → player_profiles`

**settings** (014)
- Generic key/value store. `scope ENUM(org,school,coach,table)`, `scope_id uuid`, `key text`, `value jsonb`. UNIQUE on (scope, scope_id, key). Used for feature flags, table defaults, leaderboard config, staking defaults, autospawn.

### Hand Data

**sessions** (001, 010, 014, 023)
- `session_id uuid PK`, `table_id → tables`, `status CHECK(active/completed/abandoned)`, `session_type CHECK(live/drill/replay)`

**hands** (001, 004, 006, 014, 023, 028, 041)
- `hand_id uuid PK`, `session_id → sessions`, `table_id → tables`, `board text[]`, `final_pot int`, `winner_id → player_profiles`, `is_scenario_hand bool`, `scenario_id → scenarios`, `drill_session_id → drill_sessions`, `table_mode TEXT CHECK(coached_cash/uncoached_cash/tournament/bot_cash)` (NULL for historical hands — added migration 041)

**hand_players** (001, 004, 005, 006, 023)
- `(hand_id, player_id) PK`, `position varchar(8) CHECK(BTN/SB/BB/UTG/UTG+1/UTG+2/CO/HJ/MP)`, `stack_start`, `stack_end`, `hole_cards text[]`, `is_winner`, `vpip`, `pfr`, `wtsd`, `wsd`, `three_bet`

**hand_actions** (001, 004, 006)
- `id bigserial PK`, `hand_id`, `player_id`, `street`, `action`, `amount`, `stack_at_action`, `pot_at_action`, `decision_time_ms`, `position varchar(8)`, `is_reverted`

**hand_tags** (001, 006, 023)
- `id bigserial PK`, `hand_id`, `tag`, `tag_type CHECK(auto/mistake/coach/sizing)`, `player_id` (nullable), `action_id` (nullable)
- 3 partial unique indexes replace old UNIQUE constraint (migration 006)

**hand_annotations** (021)
- `id uuid PK`, `hand_id`, `action_index int`, `author_id`, `text CHECK LENGTH <= 2000`

### Statistics

**leaderboard** (001, 005, 023)
- Per-player all-time aggregate. Maintained by trigger `trg_leaderboard_after_hand_player`.
- Columns: `total_hands`, `total_wins`, `net_chips`, `vpip_count`, `pfr_count`, `wtsd_count`, `wsd_count`, `three_bet_count`, `last_hand_at`
- View `leaderboard_view` computes percentages (vpip_pct, pfr_pct, etc.)

**session_player_stats** (001, 005, 018)
- Per-session per-player stats. `quality_score int CHECK(0-100)`, `quality_breakdown jsonb`

**stack_adjustments** (005) — Audit log for coach-issued restocks

**student_baselines** (018)
- Rolling 30-day + weekly/monthly baselines. UNIQUE on (player_id, period_type, period_start).

**player_performance_snapshots** (012)
- Weekly aggregate snapshots. UNIQUE on (player_id, period_start).

### Tables & Tournaments (System A)

**tables** (010, 015, 019, 020, 023, 028, 032, 033, 035)
- `id text PK`, `mode CHECK(coached_cash/uncoached_cash/tournament/bot_cash)`, `status CHECK(scheduled/waiting/active/paused/completed)`, `privacy ENUM(open/school/private)`, `controller_id → player_profiles`, `bot_config jsonb`, `tournament_group_id → tournament_groups`

**tournament_configs** (013, 023, 033, 040)
- System A tournament config per table. `blind_schedule jsonb`, `starting_stack`, `rebuy_allowed`, `reentry_allowed`, `addon_allowed`, `payout_preset_id → payout_presets`, `payout_method CHECK(flat/icm)`, `tournament_group_id → tournament_groups`, `scheduled_start_at`

**tournament_standings** (013, 023)
- Per-table elimination tracking. `(table_id, player_id)` unique index.

**tournament_groups** (032, 033)
- MTT group linking multiple tables. `shared_config jsonb`, `max_players_per_table`, `min_players_per_table`, `is_deal bool`

**tournament_group_standings** (032)
- Per-player standings within a group. `group_id`, `player_id`, `finish_position`, `chips_at_elimination`

**invited_players** (015, 023) — Whitelist for private tables

**table_presets** (015, 023) — Coach-owned table configuration snapshots

### Tournaments (System B — Standalone)

**tournaments** (020, 040)
- `id uuid PK`, `status CHECK(pending/running/paused/finished)`, `blind_structure jsonb`, `current_level_index int`, `table_id → tables` (added 040 to bridge System A), `scheduled_start_at`, `min_players`

**tournament_players** (020)
- `(tournament_id, player_id)` unique index, `chip_count`, `is_eliminated`, `finish_position`

### Playlists & Scenarios

**playlists** (001, 014, 028)
- `playlist_id uuid PK`, `name`, `table_id`, `school_id`, `folder_id → scenario_folders`, `tags text[]`, `ordering CHECK(sequential/random/manual)`, `advance_mode CHECK(auto/manual)`, `is_shareable`, `deleted_at`

**playlist_hands** (001, 011) — Legacy: hand_id ↔ playlist_id junction with `display_order`

**playlist_items** (028) — New: scenario_id ↔ playlist_id junction with `position`. UNIQUE on (playlist_id, position).

**scenario_configs** (011, 014) — Legacy v1 scenario configs

**scenarios** (028)
- Scenario Builder v2. Versioned: `version int`, `parent_id → scenarios`, `is_current bool`, `play_count int`. Soft-deleted via `deleted_at`. `card_mode CHECK(fixed/range)`, `board_mode CHECK(none/specific/texture)`, `blind_mode bool`

**scenario_folders** (028) — Nested folder hierarchy (self-referential `parent_id`)

**drill_sessions** (028)
- Active drill session at a table. `status CHECK(active/paused/completed/cancelled)`, `opted_in_players uuid[]`, `opted_out_players uuid[]`

### CRM

**player_notes** (012) — `note_type CHECK(general/session_review/goal/weakness)`
**player_tags** (012) — `(player_id, tag)` PK. Freeform labels.
**coaching_sessions** (012) — Scheduled 1-on-1 sessions. `status CHECK(scheduled/completed/cancelled)`

### Chip Bank

**player_chip_bank** (015b) — `player_id PK`, `balance int CHECK >= 0`
**chip_transactions** (015b) — Immutable log. `type ENUM(reload/buy_in/cash_out/adjustment/staking_deposit/staking_withdrawal)`

Atomic write via `apply_chip_transaction()` Supabase RPC function.

### Coach Intelligence

**alert_instances** (018) — `alert_type`, `severity decimal(3,2) CHECK(0-1)`, `status CHECK(active/dismissed/acted_on)`
**alert_config** (018, 026) — Per-coach alert configuration with override support (target_type: default/player/school)
**session_prep_briefs** (018) — 1-hour cache for prep briefs
**progress_reports** (018) — UNIQUE on (coach_id, player_id, report_type, period_start)

### Announcements

**announcements** (016, 022) — `target_type ENUM(all/group/individual)`, `target_id text`
**announcement_reads** (016) — Read receipts

### Staking

**staking_contracts** (025) — `coach_split_pct + player_split_pct = 100`, `makeup_policy CHECK(carries/resets_monthly/resets_on_settle)`, `auto_renew bool`
**staking_sessions** (025) — `game_format CHECK(cash/tournament/sit_and_go)`, `status CHECK(pending/confirmed/disputed/deleted)`
**staking_settlements** (025) — Dual-approval (coach_approved + player_approved). `status CHECK(proposed/approved/rejected/voided)`
**staking_adjustments** (025) — `type CHECK(forgive_makeup/adjust_makeup/correction/bonus/penalty)`

### Groups

**groups** (024) — School-scoped or global. `color varchar(7)`.
**player_groups** (024) — `(player_id, group_id)` PK.

### Presets

**blind_structure_presets** (029, 036) — System + school presets. 4 seeded system presets.
**payout_presets** (030, 031) — System + school presets. 4 seeded system presets.

### Logs

**alpha_logs** (007) — Append-only structured log. `level CHECK(error/warn/info/debug)`, `category CHECK(socket/http/game/db/auth/system)`. RLS disabled — service role only.

---

## 9. Issues & Audit Findings

### Critical Bugs

| ID | Location | Issue | Status |
|----|----------|-------|--------|
| **BUG-01** | `pages/BotLobbyPage.jsx:177,181` | Routed to `/game/:tableId` — no such route. Bot games unreachable after creation. | ✅ Fixed 2026-04-06 — changed to `/table/:tableId` |
| **BUG-02** | `pages/ReviewTablePage.jsx` | "Prev Hand" and "Next Hand" both called `navigate(-1)`. No actual hand navigation. | ✅ Fixed 2026-04-06 — AnalysisPage passes `{ handIds, currentIndex }` via `location.state`; ReviewTablePage implements real prev/next. Buttons hidden when no list available. |
| **BUG-03** | `components/TournamentInfoPanel.jsx` | `setActionError` useState declared after its first use in a useEffect closure. Ordering bug. | ✅ Fixed 2026-04-06 — moved declaration to top with other state. |
| **BUG-04** | `server/auth/socketPermissions.js` | `requireSocketPermission` checks `socket.data.playerId` which was never set by `socketAuthMiddleware`. Guard always failed silently. | ✅ Fixed 2026-04-06 — middleware now sets `socket.data.playerId = payload.stableId`. |

### Features Shipped (2026-04-06)

| Feature | What Changed |
|---------|-------------|
| **Inline Scenario Builder** | `CoachSidebar` "Build Scenario" button previously called `navigate('/admin/hands')`, abandoning the live table. Now opens a `ScenarioBuilder` modal overlay inside `TablePage`. Coach never leaves the table context. |
| **Socket-driven Replay (6a)** | `ReviewTablePage` now has two modes. Static mode (default) works as before. Socket mode activates when `location.state.{ tableId, isReviewSession }` are set — opens a new socket connection, joins the live table room as a spectator, and receives `game_state_update` events from the server's `ReplayEngine`. Coach sees `SocketReplayControls` wired to `replay_step_back/forward/branch/unbranch`. Timeline `onJumpTo` emits `replay_jump_to`. |
| **"Go to Review" Group Transition (6b)** | Coach-only "▶ Go to Review" button added to `TableTopBar` (enabled only when `phase === 'waiting'`). Emits `transition_to_review` → server loads hand into `ReplayEngine`, broadcasts event to room → all clients navigate to `ReviewTablePage` in socket mode. "Back to Play" button (coach-only) emits `transition_back_to_play` → server exits replay, broadcasts → all clients return to `/table/:tableId`. Independent per-table — multiple concurrent reviews work. |
| **Hand Mode Tracking** | `hands.table_mode` column added (migration 041, applied to production). `HandRepository.startHand()` accepts `tableMode`. `gameLifecycle.js` reads `getController(tableId).getMode()` at both `start_game` and `start_configured_hand` and passes it to `startHand()`. All new hands now record their mode; historical rows are NULL. |
| **AutoController Lifecycle Rewrite** | AutoController was a 27-line stub with no real lifecycle. Rewritten with full `_startHand()` (DB log, SharedState, broadcast), `_completeHand()` (guarded by `_handActive`, runs analyzer), `onHandComplete()` (bust detection, 2s re-deal timer), `onPlayerJoin()` (auto-starts first hand at 2-player threshold), `_broadcastState()` (per-socket game_state). `betting.js` now triggers `ctrl._completeHand()` when `phase === 'showdown'` for uncoached tables. `joinRoom.js` calls `ctrl.onPlayerJoin(stableId)` for all non-coach joins. |
| **Buy-In Modal** | `BuyInModal` component added to `LobbyPage`. Shown for non-coach clicking JOIN on an `uncoached_cash` table. Slider: 50–200 BB, default 100 BB. Displays chip bank balance. On confirm: `navigate('/table/:id', { state: { buyInAmount } })`. `useTableSocket` reads `location.state.buyInAmount` and passes it to `join_room`. Server already handled `buyInAmount` — no server change needed. |
| **Spectate Flow** | Coach/admin cards in lobby now show a SPECTATE secondary action. Navigates to `/table/:tableId?spectate=true`. `useTableSocket` reads `?spectate=true` URL param and passes `isSpectator: true` to `join_room`. Server `joinAsSpectator()` already handled this — no server change needed. Returns `isSpectator` flag from hook. |
| **Mode Badges on TableCard** | `TableCard` renders a mode pill badge: gold "Coached" / green "Auto Deal" / blue "Tournament" / purple "Bot Table". `mapTableToCard()` in `LobbyPage` now passes `mode` field. |
| **Player Sit-Out / Sit-In** | New `player_sit_out` / `player_sit_in` socket events (C→S, `misc.js`). Non-coach, non-spectator only. Calls `gm.setPlayerInHand(socket.id, false/true)` and broadcasts state. `TablePage` exposes sit-out toggle button for uncoached_cash, non-spectator players. |
| **Bust Detection** | `AutoController.onHandComplete()` iterates seated players after each hand. Any player with `stack <= 0` receives `player_busted` event (S→C) and is sat out via `gm.setPlayerInHand`. `TablePage` listens for `player_busted` and shows a 6s bust toast. |

### Security Gaps

| ID | Location | Issue |
|----|----------|-------|
| **SEC-01** | `server/auth/requireRole.js` | No role hierarchy — `requireRole('coach')` fails for admins/superadmins. Admin trying to act as coach is rejected. |
| **SEC-02** | `server/auth/requirePermission.js` | Permission cache has **no TTL**. Manual call to `invalidatePermissionCache` required. Revoked permissions may persist indefinitely. |
| **SEC-03** | `server/auth/featureGate.js` | `schoolIdCache` maps playerIds to schoolIds **forever**. Player moved to a new school retains old school's feature set until app restart. |
| **SEC-04** | `server/auth/PlayerRoster.js` | No account lockout after failed login attempts (rate limit on auth routes exists but is IP-based, not account-based). |
| **SEC-05** | `server/routes/players.js` | `GET /api/players/:id/hover-stats` has no auth middleware — intentional for spectators, but exposes player names and stats publicly. |

### Data Integrity Gaps

| ID | Location | Issue |
|----|----------|-------|
| **DATA-01** | `HandRepository.endHand()` | Uses `Promise.allSettled` for hand_players updates. Partial failures (some players updated, others not) are tolerated silently. Hand is marked complete regardless. |
| **DATA-02** | `TagRepository.replaceAutoTags()` | Delete-then-insert with no transaction. Another query could see empty state between the two operations. |
| **DATA-03** | `ScenarioBuilderRepository.incrementPlayCount()` | Read-then-write pattern. Concurrent updates will lose increments (race condition). |
| **DATA-04** | `PlaylistRepository.removeHandFromPlaylist()` | N+1 UPDATE loop to re-sequence display_order. Non-atomic — can corrupt order if interrupted. |

### Performance Issues

| ID | Location | Issue |
|----|----------|-------|
| **PERF-01** | `SchoolRepository.findAll()` | N separate getMemberCounts queries (one per school). |
| **PERF-02** | `PlayerRepository.getPlayerHands()` | 3-query sequential flow; could be 1 joined query. |
| **PERF-03** | `PlayerRepository.listPlayers()` | 2 separate role lookup queries instead of join (documented workaround for PostgREST schema cache). |
| **PERF-04** | `AnnouncementRepository.unreadCount()` | 2 queries instead of 1 COUNT with LEFT JOIN. |
| **PERF-05** | `PlayerSeat.jsx` | Fetches hover stats from `/api/players/:id/hover-stats` on each hover event — no debounce or memoization. |

### Incomplete / Stub Features

| ID | Location | Issue |
|----|----------|-------|
| **STUB-01** | `pages/ForgotPasswordPage.jsx` | No backend implementation. Directs users to contact coach manually. |
| **STUB-02** | `pages/LeaderboardPage.jsx` | Period filter (7d/30d/all) and gameType filter (cash/tournament) are not connected to API. Always returns all-time data. |
| **STUB-03** | `pages/LeaderboardPage.jsx` | Coach view tabs (mySchool/custom) marked "soon" — non-functional. |
| **STUB-04** | `GET /api/hands/:handId/equity` | Returns 501 if EquityService not available. |
| **STUB-05** | `announcements` target_type='group' | Visibility logic documented as "future work — not yet implemented". Group-targeted announcements behave like 'all'. |

### Architectural Issues

| ID | Location | Issue |
|----|----------|-------|
| **ARCH-01** | System A vs System B | Two parallel tournament architectures. Migration 040 adds `table_id` FK to `tournaments` to bridge them but they remain mostly separate. TournamentLobby has dual API path with fallback, indicating in-flight migration. |
| **ARCH-02** | `server/game/GameManager.js` | 700+ lines; manages game rules, state snapshots, history, replay, and playlist simultaneously. Too broad. |
| **ARCH-03** | `server/ai/NarratorService.js` | Appears to duplicate `server/services/NarratorService.js` — two files with the same name in different directories. Verify which is canonical. |
| **ARCH-04** | `hooks/useTableSocket.js` vs `hooks/useConnectionManager.js` | Both create independent socket.io connections. TablePage may open two WebSocket connections simultaneously. |
| **ARCH-05** | `replay_mode.pre_branch_snapshot` | Deep-copies entire GameManager state on every `replay_branch`. For long sessions this creates transient memory spikes. No cleanup until `unbranch` or `exit`. |
| **ARCH-06** | `pages/MainLobby.jsx` | Exists in filesystem but is not rendered anywhere in App.jsx. Appears to be a vestigial older version of LobbyPage. |
| **ARCH-07** | Socket event naming | Tournament events use `tournament:` prefix; all other events are flat. Inconsistent convention. |
| **ARCH-08** | `LobbyContext.recentHands` | Declared in context state but never populated. Dead state. |
| **ARCH-09** | `player_profiles.is_coach`, `is_roster` | Deprecated boolean columns still present (use player_roles instead). Not enforced to be false for new records. |
| **ARCH-10** | `HandGenerator.js` texture fallback | After 100 failed texture-match attempts, silently falls back to 3 random cards. Coach's requested texture is not delivered; no error or warning emitted. |

### Duplicate / Overlap

| ID | Components | Finding |
|----|-----------|---------|
| **DUP-01** | `ErrorToast` vs `NotificationToast` | Identical logic, only color differs. Consolidate into `Toast` with `type` prop. |
| **DUP-02** | `TableCard` vs `BotTableCard` | Near-identical card layout. Consolidate with `variant` prop. |
| **DUP-03** | `scenario_configs` (011) vs `scenarios` (028) | Two schema generations for scenarios. `scenario_configs` is legacy v1; `scenarios` is current. Old table still written by `/api/admin/scenarios`. |
| **DUP-04** | `playlist_hands` (001) vs `playlist_items` (028) | Two junction tables. `playlist_hands` links hands; `playlist_items` links scenarios. Both coexist. `PlaylistRepository` uses `playlist_hands`; `ScenarioBuilderRepository` uses `playlist_items`. |
| **DUP-05** | `server/ai/NarratorService.js` vs `server/services/NarratorService.js` | Likely same code in two locations. Verify and consolidate. |

---

*This document was generated by automated codebase exploration across 7 parallel research agents. Verify specific line numbers against current source before acting on any finding.*
