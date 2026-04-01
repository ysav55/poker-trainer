# Poker Trainer — Feature Audit
**Date:** 2026-03-31
**Source:** Live codebase vs. `poker_trainer_component_spec.md` (v1.0) + `USER_STORIES.md` (US-001–US-100)

Legend: ✅ Done · ⚠️ Partial · ❌ Missing

---

## 1. Routes

| Route | Page file | Status | Notes |
|---|---|---|---|
| `/login` | `LoginPage.jsx` | ✅ | |
| `/lobby` | `MainLobby.jsx` | ✅ | |
| `/table/:id` | `TablePage.jsx` | ✅ | |
| `/hand-builder` | `admin/HandBuilder.jsx` | ✅ | |
| `/hand-builder/:id` | `admin/HandBuilder.jsx` | ⚠️ | Edit-mode routing probably shares the same file; version history UI unconfirmed |
| `/stable` | — | ❌ | Page file does not exist |
| `/playlists` | — | ❌ | Page file does not exist |
| `/crm/:id` | `admin/PlayerCRM.jsx` | ✅ | |
| `/tournament` | `admin/TournamentSetup.jsx` | ⚠️ | Lives under `/admin/*`, not at spec route `/tournament` |
| `/multi` | `MultiTablePage.jsx` | ✅ | |
| `/analytics` | — | ❌ | Page file does not exist |
| `/admin/users` | `admin/UserManagement.jsx` | ✅ | |
| `/admin/audit` | — | ❌ | Page file does not exist |
| `/admin/settings` | — | ❌ | Page file does not exist |
| `/admin/roles` | — | ❌ | Page file does not exist |
| `*` (forbidden) | — | ❌ | No dedicated `ForbiddenPage` |

---

## 2. Auth & Session (US-001–005, US-093)

| Component | Status | Notes |
|---|---|---|
| `LoginPage` — form, non-revealing errors, first-login detection | ✅ | |
| `SessionExpiredModal` — non-blocking; preserves route; seat-hold countdown | ⚠️ | 401 redirect works; seat-hold timer and route restoration not confirmed |
| `PasswordResetFlow` — admin-triggered email + time-limited token | ⚠️ | Admin can reset password; email delivery not wired (no `EmailService`) |
| `AccountLockedBanner` — after N failed attempts; auto-unlock path | ❌ | Rate limiting exists (login attempts), no lockout UI banner |
| Session persistence across refresh | ✅ | |
| JWT 7-day expiry, stored in `poker_trainer_jwt` | ✅ | |
| CORS + rate limiting on `/api/auth/login` | ✅ | |

**Missing backend service:** `EmailService` (needed for password reset, lockout notification, role-change emails)

---

## 3. Navigation — shared (US-001–003, US-091–094)

| Component | Status | Notes |
|---|---|---|
| `NavBar` — username, role badge, logout; closes WebSockets | ⚠️ | Top bar exists; explicit WS close on logout not confirmed |
| `RoleBadge` — pill showing current role | ✅ | Role badge visible in lobby nav |
| `NotificationBell` — unread count, opens panel | ❌ | Not implemented |
| `NotificationPanel` — reverse-chron feed, click-to-navigate, persist until dismissed | ❌ | Not implemented |
| `OnboardingTour` — first-login tooltip overlay, role variants | ❌ | Not implemented |
| `HelpDrawer` — collapsible, searchable help panel | ❌ | Not implemented |

**Missing backend service:** `NotificationService` (in-app bell), `PresenceService` (online/away status)

---

## 4. Lobby (US-006–012, US-038, US-078, US-081)

| Component | Status | Notes |
|---|---|---|
| `LobbyPage` — sidebar, stats row, table grid, recent hands, playlists | ✅ | |
| `TableGrid` — real-time, join/watch/lock states, Create Table | ✅ | |
| `StatsRow` — chip count, win rate, hands, session length; click-through | ⚠️ | Stats show; click-through to `/analytics` broken (page missing) |
| `RecentHandsList` — last 10 hands, click → hand review overlay | ⚠️ | Exists; click-to-replay overlay not fully integrated |
| `PlaylistsSection` — assigned playlists with completion %, Start/Continue | ⚠️ | Playlists listed; completion % and Start/Continue CTA not confirmed |
| `UpgradeModal` — Trial user gate on join-attempt | ❌ | Trial role exists; modal gate not implemented |

---

## 5. Table — Player View (US-013–016, US-079, US-085)

| Component | Status | Notes |
|---|---|---|
| `TablePage` — full canvas, seat layout, auto-rejoin on reload | ✅ | |
| `BettingControls` — Fold/Check-Call/Bet-Raise, min/max, optimistic UI, timer default | ✅ | |
| `TurnTimer` — countdown, configurable default action | ✅ | |
| `HoleCardsDisplay` — own cards, face-down for opponents, hide-my-cards toggle | ⚠️ | Cards display correctly; hide-my-cards toggle UI designed but not fully integrated |
| `ObserverView` — read-only, hides opponent cards, Join Next Hand queue | ✅ | |
| `DisconnectionOverlay` — reconnecting spinner, ×5 exponential backoff, state resync | ✅ | |

---

## 6. Table — Coach & Moderator Sidebar (US-017–023, US-029–032, US-080, US-083)

| Component | Status | Notes |
|---|---|---|
| `CoachSidebar` — tabbed (Game / Hands / Playlists), Moderator label variant | ✅ | |
| `GameTab` — Deal, Pause, Undo, Set Blinds, End Session, player list with stack edit | ✅ | |
| `HandsTab` — library search, history, hand preview, tag picker, load-into-session | ✅ | |
| `PlaylistsTab` — playlist list, assign-to-player, preview hand sequence | ⚠️ | Playlists list and activate work; assign-to-player notification not wired |
| `AutoDealTimer` — post-hand countdown with Deal Now skip | ✅ | |
| `DealErrorToast` — retry on 5xx from deal; escalates after 30s | ⚠️ | Error toasts exist; 30s escalation logic not confirmed |
| Stack adjustment absent (not disabled) for Moderator DOM | ❌ | Not confirmed — needs audit |

---

## 7. Hand Builder & Scenarios (US-039–042, US-095)

| Component | Status | Notes |
|---|---|---|
| `HandBuilderPage` — full-screen builder | ✅ | |
| `HandBuilderCanvas` — player count, positions, stacks, hole cards, community cards, board constraints, save with tags | ✅ | |
| `HandLibrary` — saved hand list, open for edit, version history with revert | ⚠️ | List and open-for-edit work; version history UI not implemented |
| `HandPlaybackPlayer` — street-by-street with pause/rewind, coach annotations, read-only for Player | ⚠️ | ReplayEngine exists server-side; client playback UI not fully integrated into TablePage |
| `TagPicker` — multi-select taxonomy, used in HandsTab + auto cash + mod sidebar | ✅ | |
| Scripted betting actions within scenario builder | ❌ | Not implemented |

---

## 8. Stable Management (US-033–038, US-082, US-096)

| Component | Status | Notes |
|---|---|---|
| `StableManagementPage` — `/stable` route | ❌ | Page does not exist |
| `StableRoster` — per-player row with online/offline status (WS-updated), current location, quick actions | ❌ | |
| `SeatAssignmentPanel` — seat-slot grid, assign via dropdown/drag, notifies player | ❌ | |
| `PrivateTableCreator` — name, mode, invitee picker, invite badge in lobby, expiry | ⚠️ | Basic private table logic exists; invitee picker and lobby badge not confirmed |
| `SessionTemplateBuilder` — name, goals, playlists, bulk-assign students, reminder push | ❌ | |

---

## 9. Playlists (US-043–046)

| Component | Status | Notes |
|---|---|---|
| `PlaylistsPage` — `/playlists` route | ❌ | Standalone page does not exist (playlists only accessible via CoachSidebar) |
| `PlaylistEditor` — ordered hand list, drag-to-reorder, add from library, draft/publish, auto-save | ⚠️ | Create and activate work in sidebar; drag-to-reorder not confirmed; no standalone editor |
| `PlaylistCard` — completion %, Start/Continue CTA, completed state | ⚠️ | Cards shown in sidebar; completion % UI not confirmed |
| `PlaylistProgressBar` — completion modal on final hand, coach notified | ❌ | |

---

## 10. Player CRM (US-047–051)

| Component | Status | Notes |
|---|---|---|
| `PlayerCRMPage` — tabbed, header with role/join date/status | ✅ | |
| `CRM_OverviewTab` — VPIP, PFR, aggression factor, win rate, 30-day chart, frequent tags | ✅ | |
| `CRM_NotesTab` — rich-text composer, chron feed, author+timestamp, @-mention hand ID, edit/delete own | ⚠️ | Notes exist; rich-text formatting and @-mention not confirmed |
| `CRM_ScheduleTab` — calendar/list, create session, 30-min reminder, cancel/reschedule with notification | ⚠️ | Schedule structure exists; reminders not wired (no `NotificationService`) |
| `CRM_HistoryTab` — full history, filters (date/table/session/tags), hand playback, CSV export, pagination | ⚠️ | History and filters exist; hand playback integration and CSV export status unconfirmed |

---

## 11. Tournament (US-024–028, US-052–056, US-092)

| Component | Status | Notes |
|---|---|---|
| `TournamentMgmtPage` — template library + active control panel | ⚠️ | `TournamentSetup.jsx` exists under `/admin`, not at `/tournament`; Referee access not confirmed |
| `TournamentTemplateBuilder` — blind schedule, save, launch from template | ⚠️ | UI exists; launching from template not fully tested |
| `BlindSchedulePanel` — current level highlighted, countdown, manual advance by Referee | ✅ | Blind timer and manual advance implemented |
| `EliminationTracker` — live chip-ordered list, Eliminate action, finished-position log | ⚠️ | Elimination tracking exists; chip-ordered list and finished-position log unconfirmed |
| `RuleExceptionPanel` — award/deduct chips, undo elimination, reason field, Admin approval threshold | ❌ | Not implemented |
| `ConsolidationPanel` — move players to another table, close vacated table | ⚠️ | Experimental structure; not production-ready |
| Rebuy/add-on game logic | ❌ | |
| ICM / chip-chop calculation | ❌ | |
| Late registration window | ❌ | |

---

## 12. Multi-Table View (US-057–059)

| Component | Status | Notes |
|---|---|---|
| `MultiTablePage` — responsive grid, broadcast bar, All/Tournament filter | ⚠️ | Grid and broadcast bar exist; All/Tournament filter toggle not confirmed |
| `TableMiniGrid` — per-table cell, hover Referee actions, click → full view | ⚠️ | Tile cells exist; hover Referee actions not implemented |
| `BroadcastBar` — 280-char message, send to all tables as toast/banner, history, tournament prefix | ⚠️ | Game-control broadcast (Start/Pause/etc.) implemented; text message broadcast not confirmed |

---

## 13. User Management (US-060–066, US-086–088)

| Component | Status | Notes |
|---|---|---|
| `UserManagementPage` — searchable list, New User, empty state | ✅ | |
| `UserListTable` — debounced search, filters (role/status/date), URL-persisted filters, virtual scroll | ⚠️ | Search and role filter exist; URL-persisted filters and virtual scroll unconfirmed |
| `UserDetailPanel` — edit name/email/avatar, Suspend/Reinstate/Delete, Reset Password, per-user Audit Log tab | ⚠️ | Edit and reset exist; avatar upload, per-user Audit Log tab, username-confirm dialog not confirmed |
| `AuditLogPage` — `/admin/audit`, filters, 90-day retention, CSV export | ❌ | Page does not exist |
| `PlatformSettingsPage` — `/admin/settings`, configurable session timeout, blind defaults, etc. | ❌ | Page does not exist |
| `CoachOverview` — coach-filtered view, stable size, reassign student (Superadmin only) | ❌ | Not implemented |

---

## 14. Roles & Permissions (US-067–072, US-089–090, US-100)

| Component | Status | Notes |
|---|---|---|
| `RolesPage` — `/admin/roles`, Superadmin only | ❌ | Page does not exist |
| `PermissionMatrix` — read-only grid, roles × 12 permissions | ❌ | Permission system implemented server-side; no UI matrix |
| `RoleAssignmentPanel` — assign/revoke role, high-friction Admin promotion, session invalidation, email notify, audit-logged | ❌ | Role can be set in UserDetail; formal role assignment flow not implemented |
| `ForbiddenPage` — 403 with role-appropriate explanation, attempt logged | ❌ | |

---

## 15. Stats & Analytics (US-073–078)

| Component | Status | Notes |
|---|---|---|
| `AnalyticsPage` — `/analytics`, tabbed, player self-service + coach/admin views | ❌ | Page does not exist |
| `LeaderboardTable` — rank, avatar, metric, trend arrow, own row highlighted, top-50 + separator | ⚠️ | Leaderboard data exists in DB; no dedicated analytics page |
| `HandTagChart` — bar chart of tag frequency, click → filtered history, date filter, CSV export | ❌ | Tag data exists; chart component not in analytics page |
| `MistakeMatrix` — 6×4 heat map (position × street), click → filtered history | ❌ | |
| `PlatformAnalyticsDashboard` — Admin/Superadmin only, DAU, active sessions, sparklines, 60s refresh | ❌ | |
| `PlayerStatsPage` — VPIP/PFR/aggression/win-rate by position, net chips over time, hand history | ⚠️ | Stats computed and stored; no dedicated player stats page |

---

## 16. Backend Services

| Service | Status | Notes |
|---|---|---|
| `AuthService` / `JwtService` | ✅ | |
| `UserService` / `PlayerRoster` | ✅ | |
| `RBACMiddleware` / `requireRole` | ✅ | |
| `TableService` | ✅ | Embedded in socket handlers |
| `GameEngine` / `GameManager` | ✅ | |
| `HandService` / repositories | ✅ | |
| `PlaylistService` / `PlaylistRepository` | ✅ | |
| `CRMService` | ⚠️ | Notes and schedule stored; no formal CRMService class |
| `TournamentService` | ⚠️ | Embedded in GameManager; no standalone service |
| `NotificationService` | ❌ | No in-app notification delivery system |
| `AnalyticsService` | ⚠️ | `AnalyzerService` for hand tagging; no aggregation service for analytics page |
| `AuditService` | ❌ | No immutable audit log |
| `PresenceService` | ❌ | No dedicated online/offline/away tracking service |
| `WebSocketGateway` | ✅ | Socket.IO handlers |
| `PlatformConfigService` | ❌ | Hardcoded env vars; no configurable settings store |
| `EmailService` | ❌ | No email delivery |

---

## 17. Cross-Cutting Concerns

| Concern | Status | Notes |
|---|---|---|
| All routes require valid session (401 → `/login` with deep-link restore) | ⚠️ | 401 redirect works; deep-link restoration not confirmed |
| RBAC enforced server-side on every endpoint | ✅ | |
| Coach sidebar absent from Player/Trial/Moderator DOM | ✅ | |
| WebSocket closed on explicit logout | ⚠️ | Logout clears JWT; explicit WS teardown not confirmed |
| Disconnection retry ×5 exponential backoff | ✅ | |
| Page-reload auto-rejoin at table (US-085) | ✅ | |
| Seat-hold grace period on session expiry | ❌ | |
| `DealErrorToast` 30s escalation | ⚠️ | Toast exists; escalation timer not confirmed |
| 503 → full-page maintenance banner with 30s health-check retry | ⚠️ | `/api/health` endpoint exists; client maintenance banner not confirmed |
| Audit logging on all admin actions | ❌ | `AuditService` not implemented |
| Email notifications (invites, resets, role changes, lockout alerts) | ❌ | `EmailService` not implemented |

---

## 18. Summary Table

| Domain | Spec items | ✅ Done | ⚠️ Partial | ❌ Missing |
|---|---|---|---|---|
| Routes | 16 | 8 | 1 | 7 |
| Auth & Session | 7 | 5 | 2 | 1 |
| Navigation (shared) | 6 | 2 | 1 | 3 |
| Lobby | 6 | 2 | 3 | 1 |
| Table — Player | 6 | 4 | 2 | 0 |
| Table — Coach Sidebar | 7 | 4 | 2 | 1 |
| Hand Builder | 6 | 3 | 2 | 1 |
| Stable Management | 5 | 0 | 1 | 4 |
| Playlists | 4 | 0 | 2 | 2 |
| Player CRM | 5 | 1 | 4 | 0 |
| Tournament | 9 | 1 | 4 | 4 |
| Multi-Table | 3 | 0 | 3 | 0 |
| User Management | 6 | 1 | 2 | 3 |
| Roles & Permissions | 4 | 0 | 0 | 4 |
| Stats & Analytics | 6 | 0 | 2 | 4 |
| Backend Services | 16 | 8 | 4 | 4 |
| Cross-Cutting | 11 | 4 | 5 | 2 |
| **Total** | **133** | **43 (32%)** | **39 (29%)** | **51 (38%)** |

---

## 19. Priority Gap List

These are the highest-impact gaps — either blocking other features or covering critical user-facing functionality.

### Tier 1 — Blocking or high-visibility
1. **`NotificationService`** — Blocks: playlist completion alerts, seat assignment notify, session reminders, role-change emails, invite delivery
2. **`AnalyticsPage` + `PlayerStatsPage`** (`/analytics`) — Players have no dedicated stats view; lobby `StatsRow` click-throughs are broken
3. **`StableManagementPage`** (`/stable`) — Entire coach roster workflow is missing; `SeatAssignmentPanel`, `SessionTemplateBuilder`, presence status all depend on this
4. **`PlaylistsPage`** (`/playlists`) — No standalone playlist editor; coaches can only manage playlists through the sidebar
5. **`HandPlaybackPlayer`** — ReplayEngine exists server-side but is not surfaced in the table view for players or the hand builder

### Tier 2 — Spec-required, no implementation
6. **`AuditLogPage`** (`/admin/audit`) — Required for compliance; `AuditService` also missing
7. **`PlatformSettingsPage`** (`/admin/settings`) — No UI for configuring timeouts, blind defaults, turn timer, reconnect grace
8. **`RolesPage` + `PermissionMatrix`** (`/admin/roles`) — Superadmin can't view or edit permissions through the UI
9. **`ForbiddenPage`** — 403 state has no dedicated page; unauthorised access attempts not logged
10. **`AccountLockedBanner`** — Login lockout has no client-side feedback

### Tier 3 — Partially wired, needs completion
11. **`PasswordResetFlow`** — Admin UI exists; email delivery requires `EmailService`
12. **`PlaylistProgressBar` + completion modal** — Coach completion notification not wired
13. **`ConsolidationPanel`** (tournament) — Experimental; not production-ready
14. **`RuleExceptionPanel`** (tournament) — No chip-award/deduct exception flow
15. **`CoachOverview`** (User Management) — Coach roster view and student reassignment missing
