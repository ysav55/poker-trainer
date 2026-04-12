# Poker Trainer — Feature Audit
**Last updated:** 2026-04-02 (reflects `feat/phase2` branch)
**Source:** Live codebase vs. `poker_trainer_component_spec.md` (v1.0) + `USER_STORIES.md` (US-001–US-100)

Legend: ✅ Done · ⚠️ Partial · ❌ Missing

---

## Changelog since 2026-03-31

Phase 2 landed significant new surface area. Net additions vs. the previous audit:

| Area | What shipped |
|---|---|
| Auth & Registration | `POST /api/auth/register`, `register-coach`, `reset-password` · `RegisterPage`, `ForgotPasswordPage` (pages exist; **not yet routed** in App.jsx) |
| Chip Bank | Full bank system: buy-in at join, cash-out on disconnect, reload/adjust endpoints, transaction log |
| School Management | Create/edit schools, capacity limits, per-school feature toggles (8 features), member API |
| Announcements | Broadcast to all or individual · unread count badge backend · REST API fully wired |
| Bot Tables | `BotTableController`, `BotDecisionService`, `BotLobbyPage` (`/bot-lobby`), socket visibility enforcement (`private`/`school` privacy modes) |
| Coach Intelligence | `BaselineService`, `SessionQualityService`, `AlertService`, `SessionPrepService`, `ProgressReportService`, `NarratorService` (LLM Tier 2) · `CoachAlertsPage`, `PrepBriefTab`, `ReportsTab`, `StableOverviewPage` pages exist — **client pages use mock data pending API wiring** |
| Tournament pages | `TournamentLobby`, `TournamentStandings`, `RefereeDashboard` — all wired to real API |
| Analytics | `AnalysisPage` (`/analysis`) — wired to real API |
| Leaderboard | `LeaderboardPage` (`/leaderboard`) — wired to real API |
| DB migrations | 008–019: RBAC, user management, tables registry, scenario configs, CRM, tournament, trial/registration, chip bank, table privacy, announcements, school management, coach intelligence, bot tables |
| New routes (server) | `tables.js`, `analysis.js`, `botTables.js`, `chipBank.js`, `prepBriefs.js`, `reports.js`, `alerts.js`, `annotations.js`, `announcements.js` · `admin/users.js`, `admin/crm.js`, `admin/schools.js`, `admin/scenarios.js`, `admin/tournaments.js` |

---

## 1. Routes

| Route | Page file | Status | Notes |
|---|---|---|---|
| `/login` | `LoginPage.jsx` | ✅ | |
| `/lobby` | `MainLobby.jsx` | ✅ | |
| `/leaderboard` | `LeaderboardPage.jsx` | ✅ | New — wired to real API |
| `/analysis` | `AnalysisPage.jsx` | ✅ | New — tag analysis, hand filters, wired |
| `/bot-lobby` | `BotLobbyPage.jsx` | ✅ | New — create/join bot tables |
| `/table/:id` | `TablePage.jsx` | ✅ | |
| `/multi` | `MultiTablePage.jsx` | ✅ | |
| `/tournament/:id/lobby` | `TournamentLobby.jsx` | ✅ | New |
| `/tournament/:id/standings` | `TournamentStandings.jsx` | ✅ | New |
| `/admin/users` | `admin/UserManagement.jsx` | ✅ | |
| `/admin/hands` | `admin/HandBuilder.jsx` | ✅ | Spec route was `/hand-builder` |
| `/admin/crm` | `admin/PlayerCRM.jsx` | ✅ | Spec route was `/crm/:id` — no id param |
| `/admin/tournaments` | `admin/TournamentSetup.jsx` | ✅ | Spec route was `/tournament` |
| `/admin/referee` | `admin/RefereeDashboard.jsx` | ✅ | New — wired to real API |
| `/admin/alerts` | `admin/CoachAlertsPage.jsx` | ⚠️ | Page exists; uses MOCK data |
| `/admin/stable` | `admin/StableOverviewPage.jsx` | ⚠️ | Page exists; uses MOCK data |
| `/register` | `RegisterPage.jsx` | ⚠️ | Page exists, linked from LoginPage; **not in App.jsx router** |
| `/forgot-password` | `ForgotPasswordPage.jsx` | ⚠️ | Page exists, linked from LoginPage; **not in App.jsx router** |
| `/stable` | — | ❌ | Spec route for `StableManagementPage` — not implemented |
| `/playlists` | — | ❌ | Standalone playlists page not implemented |
| `/admin/audit` | — | ❌ | `AuditLogPage` not implemented |
| `/admin/settings` | — | ❌ | `PlatformSettingsPage` not implemented |
| `/admin/roles` | — | ❌ | `RolesPage` not implemented (Superadmin only) |
| `*` (forbidden) | — | ❌ | Wildcard falls back to `/lobby`; no dedicated `ForbiddenPage` |

---

## 2. Auth & Session (US-001–005, US-093)

| Component / Feature | Status | Notes |
|---|---|---|
| `LoginPage` — form, non-revealing errors, first-login detection | ✅ | |
| `RegisterPage` — student self-registration (name, password, optional email/coachId/schoolId) | ⚠️ | Page built, backend `POST /api/auth/register` live; page not in router |
| `ForgotPasswordPage` | ⚠️ | Page built, linked from LoginPage; not in router; `POST /api/auth/reset-password` requires current password (not email reset link) |
| `SessionExpiredModal` — non-blocking; preserves route; seat-hold countdown | ⚠️ | 401 redirect works; seat-hold timer and deep-link restoration not confirmed |
| `PasswordResetFlow` — admin-triggered email + time-limited token | ⚠️ | Self-service password reset wired; email-link flow still requires `EmailService` |
| `AccountLockedBanner` — after N failed attempts; auto-unlock | ❌ | Rate limiting exists; no lockout UI |
| Trial accounts — 7-day window + 20 hands; table join blocked after limits | ✅ | `014_trial_and_registration.sql` + backend enforced |
| Coach application (`POST /api/auth/register-coach`) — admin must approve | ✅ | Backend only; no admin approval UI confirmed |
| JWT 7-day expiry, `poker_trainer_jwt` localStorage | ✅ | |
| CORS + rate limiting on `/api/auth/login` | ✅ | |
| **Missing service:** `EmailService` | ❌ | Needed for email-link reset, role-change notifications, lockout alerts |

---

## 3. Navigation — shared (US-001–003, US-091–094)

| Component | Status | Notes |
|---|---|---|
| `NavBar` / `TopBar` — username, role badge, logout | ✅ | |
| `RoleBadge` — pill showing current role | ✅ | |
| `NotificationBell` + `NotificationPanel` — unread count feed | ⚠️ | Announcements backend ships unread count (`GET /api/announcements/unread-count`); client bell/panel not wired |
| `OnboardingTour` — first-login tooltip overlay | ❌ | |
| `HelpDrawer` — collapsible, searchable help | ❌ | |
| **Missing service:** `PresenceService` | ❌ | Online/away status for stable roster and NavBar |

---

## 4. Lobby (US-006–012, US-038, US-078, US-081)

| Component | Status | Notes |
|---|---|---|
| `LobbyPage` — sidebar, stats row, table grid, recent hands, playlists | ✅ | |
| Navigation tiles — Leaderboard, Multi Table, AI Analysis, Player CRM, Coach Alerts, Stable Report, Hand Scenarios, Tournaments, Referee, Users — role-filtered | ✅ | |
| Trial banner — upgrade notice at top for trial accounts | ✅ | |
| `TableGrid` — real-time, join/watch/lock states, Create Table | ✅ | |
| `StatsRow` — chip count, win rate, hands, leaderboard rank; click-through | ⚠️ | Stats show; click-through to `/analysis` works; `/analytics` spec route differs |
| `RecentHandsList` — last 5 hands; tags, net chips | ✅ | Last 5 (spec says 10) |
| `PlaylistsSection` — assigned playlists with completion %, Start/Continue | ⚠️ | Playlists listed; completion % and Start/Continue CTA not confirmed |
| `UpgradeModal` — Trial user gate on join-attempt | ❌ | Trial role exists; join-gate modal not implemented |

---

## 5. Table — Player View (US-013–016, US-079, US-085)

| Component | Status | Notes |
|---|---|---|
| `TablePage` — full canvas, seat layout, auto-rejoin on reload | ✅ | |
| `BettingControls` — Fold/Check-Call/Bet-Raise, min/max, optimistic UI, timer default | ✅ | |
| `TurnTimer` — countdown, configurable default action | ✅ | |
| `HoleCardsDisplay` — own cards face-down for opponents, hide-my-cards toggle | ⚠️ | Cards display correctly; hide-my-cards toggle designed but integration unconfirmed |
| `ObserverView` — read-only, hides opponent cards, Join Next Hand queue | ✅ | |
| `DisconnectionOverlay` — reconnecting spinner, ×5 exponential backoff, state resync | ✅ | |

---

## 6. Table — Coach & Moderator Sidebar (US-017–023, US-029–032, US-080, US-083)

| Component | Status | Notes |
|---|---|---|
| `CoachSidebar` — tabbed (Game / Hands / Playlists), Moderator label variant | ✅ | |
| `GameTab` — Deal, Pause, Undo, Set Blinds, End Session, player list + stack edit | ✅ | |
| `HandsTab` — library search, history, tag picker, load-into-session | ✅ | |
| `PlaylistsTab` — playlist list, activate, assign-to-player | ⚠️ | Activate works; assign-to-player notification not wired |
| `AutoDealTimer` — post-hand countdown with Deal Now skip | ✅ | |
| `DealErrorToast` — retry on 5xx; 30s escalation | ⚠️ | Toast exists; 30s escalation not confirmed |
| Stack adjustment absent (not disabled) in Moderator DOM | ❌ | Needs verification |

---

## 7. Hand Builder & Scenarios (US-039–042)

| Component | Status | Notes |
|---|---|---|
| `HandBuilderPage` (`/admin/hands`) | ✅ | |
| `HandBuilderCanvas` — players, positions, hole cards, community cards, board constraints, save with tags | ✅ | |
| `HandLibrary` — saved hand list, open for edit, version history | ⚠️ | List and edit work; version history UI not implemented |
| `HandPlaybackPlayer` — street-by-street with pause/rewind, coach annotations | ⚠️ | `ReplayEngine` exists server-side; client playback not integrated into TablePage |
| `TagPicker` | ✅ | |
| Scripted betting actions within builder | ❌ | |

---

## 8. Stable Management (US-033–038, US-082, US-096)

| Component | Status | Notes |
|---|---|---|
| `StableManagementPage` — `/stable` route | ❌ | Route and page do not exist |
| `StableRoster` — per-player row with online/offline WS-updated status, quick actions | ❌ | `StableOverviewPage` (`/admin/stable`) exists with mock grade summary but no live roster |
| `SeatAssignmentPanel` | ❌ | |
| `PrivateTableCreator` — invitee picker, lobby badge, expiry | ⚠️ | Table privacy modes implemented (`private`/`school`); UI picker not confirmed |
| `SessionTemplateBuilder` — goals, playlists, bulk-assign, reminders | ❌ | |

---

## 9. Playlists (US-043–046)

| Component | Status | Notes |
|---|---|---|
| `PlaylistsPage` — `/playlists` standalone route | ❌ | Playlists only accessible via CoachSidebar |
| `PlaylistEditor` — ordered hands, drag-to-reorder, draft/publish, auto-save | ⚠️ | Create and activate work in sidebar; drag-to-reorder not confirmed |
| `PlaylistCard` — completion %, Start/Continue, completed state | ⚠️ | Basic cards shown; completion % not confirmed |
| `PlaylistProgressBar` + completion modal + coach notified | ❌ | |

---

## 10. Player CRM (US-047–051)

| Component | Status | Notes |
|---|---|---|
| `PlayerCRMPage` (`/admin/crm`) — tabbed, header with role/join date/status | ✅ | No `:id` param in route; player selection within page |
| `CRM_OverviewTab` — VPIP, PFR, 30-day chart, frequent tags | ✅ | |
| `CRM_NotesTab` — rich-text composer, chron feed, author+timestamp, @-mention | ⚠️ | Notes work; rich-text and @-mention unconfirmed |
| `CRM_ScheduleTab` — sessions, 30-min reminder, cancel/reschedule | ⚠️ | Structure exists; reminders require `NotificationService` |
| `CRM_HistoryTab` — full history, filters, hand playback, CSV export | ⚠️ | History and filters exist; playback integration and CSV export unconfirmed |
| **PREP BRIEF tab** — `PrepBriefTab.jsx` | ⚠️ | Page built; uses mock data; backend `GET /api/coach/students/:id/prep-brief` is live |
| **REPORTS tab** — `ReportsTab.jsx` | ⚠️ | Page built; uses mock data; backend `GET /api/coach/students/:id/reports` is live |

---

## 11. Tournament (US-024–028, US-052–056, US-092)

| Component | Status | Notes |
|---|---|---|
| `TournamentMgmtPage` (`/admin/tournaments`) — template library + control panel | ✅ | |
| `TournamentTemplateBuilder` — blind schedule, save, launch from template | ⚠️ | UI exists; launch-from-template not fully tested |
| `TournamentLobby` (`/tournament/:id/lobby`) — pre-game lobby, start CTA | ✅ | New; wired to real API |
| `TournamentStandings` (`/tournament/:id/standings`) — live standings | ✅ | New; wired to real API |
| `RefereeDashboard` (`/admin/referee`) — advance blind, end tournament, table view | ✅ | New; wired to real API |
| `BlindSchedulePanel` — current level highlighted, countdown, manual advance | ✅ | |
| `EliminationTracker` — chip-ordered list, Eliminate action, position log | ⚠️ | Elimination tracking exists; chip-ordered list and finished-position log unconfirmed |
| `RuleExceptionPanel` — award/deduct chips, undo elimination, reason + Admin approval | ❌ | |
| `ConsolidationPanel` — move players to another table | ⚠️ | Experimental; not production-ready |
| Rebuy / add-on | ❌ | |
| ICM / chip-chop | ❌ | |
| Late registration | ❌ | |

---

## 12. Multi-Table View (US-057–059)

| Component | Status | Notes |
|---|---|---|
| `MultiTablePage` — responsive grid, broadcast bar | ✅ | |
| All/Tournament filter toggle | ⚠️ | Not confirmed |
| `TableMiniGrid` — per-table cell; hover Referee actions | ⚠️ | Cells exist; hover Referee actions not implemented |
| `BroadcastBar` — 280-char message broadcast to all tables as toast | ⚠️ | Game-control broadcast works (Start/Pause/etc.); text message broadcast unconfirmed |

---

## 13. User Management (US-060–066, US-086–088)

| Component | Status | Notes |
|---|---|---|
| `UserManagementPage` — searchable list, New User | ✅ | |
| `UserListTable` — debounced search, role/status filters, URL-persisted, virtual scroll | ⚠️ | Search + role filter exist; URL-persist and virtual scroll unconfirmed |
| `UserDetailPanel` — edit, Suspend/Reinstate/Delete, Reset Password | ⚠️ | Core edit and reset work; per-user Audit Log tab missing |
| Coach application approval flow (admin approves `register-coach` requests) | ❌ | Backend enforces approval; no admin UI for it |
| `AuditLogPage` (`/admin/audit`) | ❌ | |
| `PlatformSettingsPage` (`/admin/settings`) | ❌ | |
| `CoachOverview` — coach-filtered view, stable size, reassign student | ❌ | |

---

## 14. Roles & Permissions (US-067–072, US-089–090, US-100)

| Component | Status | Notes |
|---|---|---|
| RBAC enforced server-side (migration 008) | ✅ | |
| `RolesPage` (`/admin/roles`) + `PermissionMatrix` — Superadmin only | ❌ | |
| `RoleAssignmentPanel` — formal role assignment flow, session invalidation, email notify | ❌ | Role settable in UserDetail; formal flow not implemented |
| `ForbiddenPage` — 403 with explanation; attempt logged | ❌ | Wildcard redirects to `/lobby` |

---

## 15. Stats & Analytics (US-073–078)

| Component | Status | Notes |
|---|---|---|
| `AnalysisPage` (`/analysis`) — tag analysis, hand filters | ✅ | New — fully wired to real API |
| `LeaderboardPage` (`/leaderboard`) — ranked table, period filter, search, medals | ✅ | New — wired to real API |
| `MistakeMatrixPanel` — 6×4 heat map (position × street) | ⚠️ | Component exists (`MistakeMatrixPanel.test.jsx` present); integration in AnalysisPage unconfirmed |
| `PlayerHeatmap` | ⚠️ | Test file exists; integration unconfirmed |
| `PlatformAnalyticsDashboard` — Admin/Superadmin only, DAU, sparklines, 60s refresh | ❌ | |
| `PlayerStatsPage` — dedicated VPIP/PFR/win-rate-by-position page | ❌ | Stats in lobby stats row; no dedicated self-service stats page |

---

## 16. Bot Tables (new — not in original spec)

| Feature | Status | Notes |
|---|---|---|
| `BotLobbyPage` (`/bot-lobby`) — create/join bot cash tables | ✅ | |
| `BotTableController` — autonomous hand lifecycle (start, showdown, reset) | ✅ | |
| `BotDecisionService` — bot action logic | ✅ | |
| Socket visibility enforcement (`private` = creator only; `school` = same-school members) | ✅ | |
| Bot seats indicator on table | ⚠️ | `BotSeatIndicator.test.jsx` present; integration unconfirmed |
| `BotTableCard` in lobby grid | ⚠️ | Test file present; lobby integration unconfirmed |

---

## 17. School Management (new — not in original spec)

| Feature | Status | Notes |
|---|---|---|
| REST API (`/api/admin/schools`) — CRUD, member management, feature toggles | ✅ | |
| Capacity limits (maxCoaches, maxStudents) | ✅ | |
| 8 per-school feature toggles (replay, analysis, chip_bank, playlists, tournaments, crm, leaderboard, scenarios) | ✅ | |
| Admin UI for school management | ❌ | API only; no client page |

---

## 18. Chip Bank (new — not in original spec)

| Feature | Status | Notes |
|---|---|---|
| Persistent chip balance in Supabase (`player_chip_bank`) | ✅ | |
| Atomic buy-in at `join_room`, cash-out on disconnect | ✅ | |
| REST endpoints (balance, reload, adjust, history) | ✅ | |
| Client buy-in via `join_room` `buyInAmount` param | ✅ | |
| Client UI (balance display, reload button) | ❌ | API only; no client wallet UI |

---

## 19. Announcements (new — not in original spec)

| Feature | Status | Notes |
|---|---|---|
| REST API (`/api/announcements`) — create, list, unread count, mark read | ✅ | |
| Per-player and broadcast targeting (`all` / `individual`) | ✅ | |
| Client `NotificationBell` wired to unread count | ❌ | Backend ready; bell component not wired |
| Client `NotificationPanel` feed | ❌ | |

---

## 20. Coach Intelligence (new — not in original spec)

| Feature | Status | Notes |
|---|---|---|
| `BaselineService` — computes per-player baselines | ✅ | |
| `SessionQualityService` — session quality scoring | ✅ | |
| `AlertService` + 6 detectors (MistakeSpike, Inactivity, VolumeDrop, LosingStreak, Regression, Milestone) | ✅ | |
| `SessionPrepService` — assembles prep brief | ✅ | |
| `ProgressReportService` — weekly/monthly report generation | ✅ | |
| `NarratorService` (LLM Tier 2) — narrative text for reports and prep briefs | ✅ | Calls Claude API; fails gracefully if unavailable |
| `CoachAlertsPage` (`/admin/alerts`) — alert feed UI | ⚠️ | **Mock data only**; backend `GET /api/coach/alerts` not yet wired in client |
| `PrepBriefTab` (in CRM) | ⚠️ | **Mock data only**; backend `GET /api/coach/students/:id/prep-brief` live but not wired in client |
| `ReportsTab` (in CRM) | ⚠️ | **Mock data only**; backend `GET /api/coach/students/:id/reports` live but not wired in client |
| `StableOverviewPage` (`/admin/stable`) | ⚠️ | **Mock data only**; backend `GET /api/coach/reports/stable` not yet wired in client |

---

## 21. Backend Services

| Service | Status | Notes |
|---|---|---|
| `AuthService` / `JwtService` | ✅ | + register, register-coach, reset-password |
| `UserService` / `PlayerRoster` | ✅ | |
| `RBACMiddleware` / `requireRole` / `requirePermission` | ✅ | |
| `TableService` (`routes/tables.js`) | ✅ | Full CRUD + privacy modes |
| `GameEngine` / `GameManager` | ✅ | |
| `HandService` / repositories | ✅ | |
| `PlaylistService` | ✅ | |
| `AnalysisService` / `AnalyzerService` | ✅ | |
| `CRMService` (`admin/crm.js`) | ✅ | |
| `TournamentService` (`admin/tournaments.js`) | ✅ | |
| `AlertService` + detectors | ✅ | |
| `BaselineService` | ✅ | |
| `SessionQualityService` | ✅ | |
| `SessionPrepService` | ✅ | |
| `ProgressReportService` | ✅ | |
| `NarratorService` (LLM) | ✅ | |
| `BotDecisionService` + `BotTableController` | ✅ | |
| `AlphaReporter` | ✅ | |
| **`NotificationService`** — in-app delivery, bell badge, push | ❌ | Announcements API ships data; no client delivery layer |
| **`AuditService`** — immutable append-only log | ❌ | |
| **`PresenceService`** — online/offline/away tracking | ❌ | |
| **`PlatformConfigService`** — configurable settings store | ❌ | Settings still hardcoded env vars |
| **`EmailService`** — transactional email | ❌ | |

---

## 22. Cross-Cutting Concerns

| Concern | Status | Notes |
|---|---|---|
| All routes require valid session; 401 → `/login` | ✅ | |
| RBAC enforced server-side on every endpoint | ✅ | |
| Deep-link restoration after re-auth | ⚠️ | `RequireAuth` passes `state.from`; restoration not confirmed end-to-end |
| WebSocket closed on explicit logout | ⚠️ | JWT cleared; explicit WS teardown not confirmed |
| Disconnection retry ×5 exponential backoff | ✅ | |
| Page-reload auto-rejoin at table | ✅ | |
| Seat-hold grace period on session expiry | ❌ | |
| 503 → full-page maintenance banner with health-check retry | ⚠️ | `/api/health` endpoint exists; client banner not confirmed |
| Audit logging on all admin actions | ❌ | `AuditService` not implemented |
| Email notifications (invites, resets, role changes, lockout) | ❌ | `EmailService` not implemented |
| School-level feature gate (`feature_disabled` 403) | ✅ | Enforced server-side |

---

## 23. Summary Table

| Domain | Spec/scope items | ✅ Done | ⚠️ Partial | ❌ Missing |
|---|---|---|---|---|
| Routes | 23 | 13 | 3 | 7 |
| Auth & Session | 8 | 5 | 3 | 1 |
| Navigation (shared) | 6 | 2 | 1 | 3 |
| Lobby | 7 | 5 | 2 | 1 |
| Table — Player | 6 | 4 | 2 | 0 |
| Table — Coach Sidebar | 7 | 4 | 2 | 1 |
| Hand Builder | 5 | 3 | 1 | 1 |
| Stable Management | 5 | 0 | 1 | 4 |
| Playlists | 4 | 0 | 2 | 2 |
| Player CRM | 7 | 2 | 5 | 0 |
| Tournament | 10 | 5 | 3 | 3 |
| Multi-Table | 4 | 1 | 3 | 0 |
| User Management | 6 | 1 | 2 | 3 |
| Roles & Permissions | 4 | 1 | 0 | 3 |
| Stats & Analytics | 6 | 2 | 2 | 2 |
| Bot Tables (new) | 5 | 3 | 2 | 0 |
| School Management (new) | 5 | 4 | 0 | 1 |
| Chip Bank (new) | 5 | 4 | 0 | 1 |
| Announcements (new) | 5 | 3 | 0 | 2 |
| Coach Intelligence (new) | 10 | 6 | 4 | 0 |
| Backend Services | 19 | 14 | 0 | 5 |
| Cross-Cutting | 11 | 4 | 4 | 3 |
| **Total** | **163** | **86 (53%)** | **43 (26%)** | **34 (21%)** |

---

## 24. Priority Gap List

### Tier 1 — High-value, backend is ready, just needs client wiring
1. **Coach Intelligence pages** — `CoachAlertsPage`, `PrepBriefTab`, `ReportsTab`, `StableOverviewPage` all have live backend APIs; client pages use hardcoded mock data. Wire each page to its `apiFetch` call.
2. **`NotificationBell` / `NotificationPanel`** — `GET /api/announcements/unread-count` and `GET /api/announcements` are live; bell is not wired.
3. **`RegisterPage` + `ForgotPasswordPage` routes** — pages exist and are linked from LoginPage, but neither is registered in `App.jsx`. Add the two `<Route>` entries.

### Tier 2 — New features missing client UI
4. **School Management admin page** — full REST API exists; no client UI to create/edit schools or manage members/feature toggles.
5. **Chip Bank wallet UI** — full bank API exists (balance, reload, history); no client balance display or reload button for players/coaches.
6. **Coach application approval** — `POST /api/auth/register-coach` backend exists; no admin UI to list and approve pending coach applications.

### Tier 3 — Spec features not yet built
7. **`StableManagementPage`** (`/stable`) — `StableRoster`, `SeatAssignmentPanel`, `SessionTemplateBuilder` all missing.
8. **`PlaylistsPage`** (`/playlists`) — standalone playlist editor with drag-to-reorder.
9. **`AuditLogPage`** (`/admin/audit`) + `AuditService` — required for compliance stories.
10. **`PlatformSettingsPage`** (`/admin/settings`) + `PlatformConfigService`.
11. **`RolesPage`** (`/admin/roles`) + `PermissionMatrix`.
12. **`ForbiddenPage`** — 403 state currently redirects to `/lobby`.
13. **`UpgradeModal`** — Trial users can see table tiles but no join-gate modal.
14. **`PlaylistProgressBar`** + completion modal + coach notification.
15. **`HandPlaybackPlayer`** — `ReplayEngine` exists server-side; not surfaced in TablePage or HandBuilder.
