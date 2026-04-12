# Frontend — React Patterns, State, Tailwind & UI Decisions

> Source of Truth. Last updated: 2026-04-06 (Phase 2 bug fixes + features).

---

## Stack

- **React** + **Vite** + **Tailwind CSS**
- **react-router-dom v6** for routing
- **socket.io-client** for real-time events
- `apiFetch(path, opts)` in `client/src/lib/api.js` — injects JWT from localStorage, base URL from env
- `client/src/lib/supabase.js` — **Proxy stub that throws. No direct Supabase access from the browser.**

---

## Application Shell

```
App.jsx (routes)
  └── AppLayout
        ├── GlobalTopBar   ← app-wide header (logo, chip balance, role pill, avatar)
        ├── SideNav         ← 64px icon-only sidebar with badge counts, role-gated links
        └── <Outlet />      ← page content
```

**TopBar vs GlobalTopBar:** These are different components.
- `GlobalTopBar` — app shell header (always visible)
- `TopBar` — table-specific header (table name, mode badges, BB toggle, leave button)

---

## Routing

All routes in `client/src/App.jsx`. Protected routes require `AuthContext.user` → redirect to `/login`.

Key routes:
| Path | Component | Notes |
|------|-----------|-------|
| `/lobby` | LobbyPage | Main hub — CreateTableModal (with SB/BB/stack/privacy/presets), BuyInModal, spectate flow |
| `/table/:tableId` | TablePage | All via socket; `?spectate=true` joins as spectator; router `state.buyInAmount` passed via join_room |
| `/multi` | MultiTablePage | Reads LobbyContext.activeTables |
| `/review` | ReviewTablePage | Hand replay + annotations |
| `/tournament/:tableId/lobby` | TournamentLobby | Dual-path API fetch (System A/B) |
| `/bot-lobby` | BotLobbyPage | Routes to `/table/:tableId` (BUG-01 fixed 2026-04-06) |
| `/admin/hands` | HandBuilder | Full-page scenario builder (also available inline via TablePage modal) |

**Unrouted file:** `pages/MainLobby.jsx` — exists in filesystem but never rendered. Legacy artifact.

---

## State Management

### Contexts

| Context | File | Manages |
|---------|------|---------|
| `AuthContext` | `contexts/AuthContext.jsx` | `user`, `permissions: Set`, `loading`; methods: `login`, `logout`, `hasPermission`, `isTrial` |
| `LobbyContext` | `contexts/LobbyContext.jsx` | `activeTables[]` polled every 10s; `recentHands[]` **declared but never populated** |
| `TableContext` | `contexts/TableContext.jsx` | Wraps `useTableSocket`, `useGameState`, `usePlaylistManager`, `useNotifications` |

### Socket Hooks (composition pattern)

`useSocket` is the composition layer over 6 focused sub-hooks:

| Hook | Purpose |
|------|---------|
| `useConnectionManager` | Socket lifecycle, joinRoom, auto-rejoin |
| `useGameState` | 18+ game state listeners, 40+ emit helpers |
| `useTableSocket` | **Separate** socket instance for TablePage (distinct from useConnectionManager) |
| `usePlaylistManager` | Playlist state + emit helpers |
| `useReplay` | 7 replay emit helpers (no listeners) |
| `useNotifications` | Error + notification toast queue with TTL timers |
| `usePreferences` | `bbView` persisted to localStorage only |

**`useHistory` does not exist** — referenced in conversation history but not in codebase.

---

## Key Components

### Table / Game
- `PokerTable` — core game: oval felt, board, seats, pot, betting controls, overlays
- `PlayerSeat` — name, stack, hole cards, action badge, equity, hover stats
- `GhostSeat` — replay ghost (no live hover, shows action at cursor)
- `BettingControls` — slide-up fold/check/call/raise + slider
- `HandConfigPanel` — scenario config (hole cards, board, deck mode)

### Coach Tools
- `CoachSidebar` — 15-prop composition layer: GAME / HANDS / PLAYLISTS tabs
  - All sidebar sections live in `client/src/components/sidebar/`
  - In-table replay is still disconnected for the sidebar `onLoadReplay` path (TablePage does not pass replay emit props). **However, the "Go to Review" group-transition flow (Feature 6b) is the preferred replay entry point and is now wired.**
  - "Build Scenario" button in HANDS tab now opens an **inline modal** (`ScenarioBuilder` rendered over the table) instead of navigating to `/admin/hands`. (`onOpenScenarioBuilder` wired in TablePage — Feature 5 fixed 2026-04-06)

### Tournament (Phase 2 additions)
- `TournamentTopBar` — level, blinds, countdown, field size, avg stack (all players)
- `TournamentInfoPanel` — eliminations, ICM, deal button (all players)
- `TournamentSidebar` — start/pause/eliminate/visibility controls (manager only)
- `ManagedByBadge` — manager name + claim/steal buttons (all players)

### Range / Equity
- `RangeMatrix` — 13×13 interactive hand group matrix (drag-select, color modes)
- `RangePicker` — full panel: matrix + presets + range string input
- `SharedRangeOverlay` — coach-broadcast range modal
- `MistakeMatrixPanel` / `PlayerHeatmap` — RangeMatrix variants

### Status & Badges
- `StatusBadge` — session status pill (active / waiting / paused / scenario / tournament)
- `PrivacyBadge` — School / Private (null = Open)
- `ManagedByBadge` — tournament manager indicator
- `TableStatusChip` — compact live status for multi-table view

### Known Duplication (do not expand before consolidating)
- `TableCard` and `BotTableCard` — near-identical layouts; candidate for `variant` prop consolidation
- `ErrorToast` and `NotificationToast` — identical logic, only color differs; consolidate into `Toast` with `type` prop

---

## Tailwind Conventions

- Dark theme throughout
- Role pills: color-coded per role (see GlobalTopBar implementation)
- Toast auto-dismiss: 6s for both error and notification

---

## Auth Flow (Client Side)

- JWT stored in `localStorage` as `poker_trader_jwt`
- Decoded client-side with `atob` for display only (not verified client-side)
- `AuthContext.permissions` fetched from `GET /api/auth/permissions` on mount and after login
- Stable player UUID in `localStorage` as `poker_trainer_player_id`

---

## Pages (26 total — as of 2026-04-04)

**Auth:** LoginPage, RegisterPage, ForgotPasswordPage (stub — no backend)
**Core:** LobbyPage, TablePage, MultiTablePage, BotLobbyPage
**Player Tools:** LeaderboardPage, AnalysisPage, ReviewTablePage, HandHistoryPage, SettingsPage
**Tournament:** TournamentLobby, TournamentStandings
**Admin:** PlayerCRM, StableOverviewPage, HandBuilder, UserManagement, CoachAlertsPage, TournamentSetup, RefereeDashboard
**Admin sub-components:** PrepBriefTab, ReportsTab, UserDetail, UserForm

---

## ReviewTablePage — Dual Modes (as of 2026-04-06)

ReviewTablePage supports two distinct modes depending on how it is entered.

**Static mode** (default — no tableId in location.state):
- Accessed from AnalysisPage (`/review?handId=X`) or HandHistoryPage
- Fetches hand data via REST (`/api/hands/:id`)
- Locally simulates gameState at cursor position (`buildGameState`)
- Timeline + annotation panel are client-side only
- Prev/Next hand navigation uses `location.state.handIds` + `location.state.currentIndex` (passed by AnalysisPage). If absent, Prev/Next bar is hidden entirely.

**Socket mode** (when `location.state.tableId` and `location.state.isReviewSession` are both set):
- Entered via the "Go to Review" coach button on TablePage (Feature 6b)
- Opens a new socket.io connection, joins the table room as a spectator
- gameState driven by `game_state` / `game_state_update` socket events from the server
- Coach sees `SocketReplayControls` bar: Back / Forward / Branch / Unbranch → wired to `replay_step_back`, `replay_step_forward`, `replay_branch`, `replay_unbranch`
- Timeline `onJumpTo` emits `replay_jump_to` to server
- "Back to Play" button (coach-only) emits `transition_back_to_play` → server exits replay → all clients navigate back to `/table/:tableId`
- Spectators see "Coach controls the replay" indicator

---

## TablePage — "Go to Review" Flow (as of 2026-04-06)

- TableTopBar shows coach-only **"▶ Go to Review"** button when `phase === 'waiting'`
- On click: emits `transition_to_review` socket event (no payload needed — server resolves handId from last hand)
- Listens for `transition_to_review` event → `navigate('/review?handId=X', { state: { tableId, isReviewSession: true } })`
- Listens for `transition_back_to_play` event → `navigate('/table/:tableId')`
- Inline ScenarioBuilder modal: `showScenarioBuilder` state controls visibility; `onOpenScenarioBuilder` no longer navigates away

---

## Save as Scenario Modal (UI Redesign V2 — Phase 6)

**Component**: `client/src/components/scenarios/SaveAsScenarioModal.jsx`.
Reusable modal rendered from both HandHistoryPage (per-row "+ Save" button) and ReviewTablePage (top-bar "+ Save as Scenario" button). Coach-only — gated by `COACH_ROLES.has(user?.role)` / role-string check; students do not see the buttons.

**Inputs**: the hand detail object (`{ hand_id, board: [...], players: [...], tags? }`). HandHistoryPage fetches detail lazily via `GET /api/hands/:id` on button click; ReviewTablePage passes the already-loaded `hand` object.

**Save flow (three API calls)**:
1. `POST /api/scenarios/from-hand` `{ hand_id, include_board: true }` — server builds seat_configs/stack_configs from hand_players, picks name from tags.
2. `PATCH /api/scenarios/:id` — applies coach edits: `{ name, board_flop, board_turn, board_river, primary_playlist_id }`. Safe because new scenarios have `play_count === 0` → edit-in-place (no versioning).
3. `POST /api/playlists/:id/items` `{ scenario_id }` — explicit playlist link row.

**Auto-generated name**: `autoName()` helper — hole cards reduced to shorthand (`AKo` / `AQs` / `AA`) + flop ranks + texture suffix (`r` rainbow / `t` two-tone / `m` monotone). Example: `"AKo on K72r"`. Falls back to `"Hand #abc123"` when hole or flop incomplete. Fully overridable in the name input.

**Playlist picker**: fetches `GET /api/playlists` (handles `{playlists:[]}` or bare-array response). Colors via `generatePlaylistColor(index)` from `PLAYLIST_COLORS.js`. Default selection: first playlist whose name (lowercased) contains any hand tag, else the first playlist.

**Design tokens**: uses `colors` from `lib/colors.js` + `generatePlaylistColor`. The only raw hex is `#000` on the gold CTA (idiomatic — matches HandBuilderHeader / EmptyBuilder).

