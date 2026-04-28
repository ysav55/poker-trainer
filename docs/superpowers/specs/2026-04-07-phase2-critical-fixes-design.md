# Phase 2 Critical Fixes — Design Spec
**Date:** 2026-04-07
**Branch:** feat/phase2
**Context:** Pre-event fix pass ahead of a live coach reveal (tournament + cash game). 18 critical bugs identified in full Phase 2 code review. This spec covers the triage-prioritised subset required for a working, trustworthy system at the event.

---

## Scope & Non-Scope

**In scope:** 17 targeted bug fixes across 3 batches. Tests for every fix. No refactors beyond what the fix requires.

**Out of scope:** Important/minor issues from the review, staking system (D priority), spec gap items (TableInfoPanel, CRM date filters, MainLobby dead code). These are deferred to a follow-up pass.

**Hard constraints:**
- Never edit an already-applied migration — new migrations only (046+)
- No opportunistic refactors outside fix scope
- No `console.log` in fixed code
- Full test suite must be green at the end of each batch before starting the next
- Each batch lands as one commit

---

## Batch 1 — Gameplay
**Goal:** Tournament runs end-to-end. Cash game sessions survive navigation. Admin/superadmin users function as coaches at the table.

### C-15 — Tournament hands permanently freeze at showdown
**Root cause:** `server/socket/handlers/betting.js` fires `_completeHand()` only when `ctrl.getMode() === 'uncoached_cash'`. `TournamentController.getMode()` returns `'tournament'`, so hands never complete after showdown.

**Fix:** Extend the mode check:
```js
if (['uncoached_cash', 'tournament'].includes(ctrl?.getMode?.())) {
  ctrl._completeHand().catch(() => {});
}
```
**File:** `server/socket/handlers/betting.js`
**Test:** After a hand reaches showdown in tournament mode, `_completeHand` is called and the next hand auto-deals.

---

### C-16 — First tournament hand never logged to DB
**Root cause:** `TournamentController.start()` calls `this.gm.startGame()` directly, bypassing `AutoController._startHand()` which writes to HandLogger, populates `activeHands`, and creates `hands`/`hand_players`/`hand_actions` DB rows. First hand is invisible to analytics.

**Fix:** Replace `this.gm.startGame()` with `this._startHand()` in `TournamentController.start()`.

**File:** `server/game/controllers/TournamentController.js`
**Test:** After `TournamentController.start()`, `activeHands.get(tableId)` is defined and contains a valid `handId`.

---

### C-17 — `tournament:move_player` corrupts moved player state
**Root cause:** `server/socket/handlers/tournament.js` calls `toGm.addPlayer({ id: playerId, name, seat, stack })` passing an object. `GameManager.addPlayer(socketId, name, isCoach, stableId, stack)` takes positional args. The object lands in `socketId`; `name`, `isCoach`, `stableId` are all `undefined`.

**Fix:** Use positional form: `toGm.addPlayer(playerId, name, false, playerId, stack)`

**File:** `server/socket/handlers/tournament.js`
**Test:** After `tournament:move_player`, destination GM has player entry with correct name and stack.

---

### C-9 — Admin/superadmin treated as player seats on join and reconnect
**Root cause:** Both `client/src/hooks/useConnectionManager.js` and `client/src/hooks/useTableSocket.js` hardcode `isCoach: role === 'coach'`. Server-side `server/socket/handlers/joinRoom.js` also applies a narrow role check. Admin and superadmin users are sent `isCoach: false`, losing coach control access until full page reload.

**Fix:** Replace `role === 'coach'` with `['coach', 'admin', 'superadmin'].includes(role)` in all three files. Add explicit check in `joinRoom.js` for the table/tournament open flow so admin/superadmin correctly receive coach privileges when opening or joining a table.

**Files:** `client/src/hooks/useConnectionManager.js`, `client/src/hooks/useTableSocket.js`, `server/socket/handlers/joinRoom.js`
**Test:** `join_room` payload from an admin-role user has `isCoach: true`. Server assigns coach seat to admin/superadmin joiners.

---

### C-8 — Socket listeners never register (stale ref capture)
**Root cause:** `useGameState.js` and `usePlaylistManager.js` both snapshot `socketRef.current` at effect evaluation time (`const socket = socketRef.current`). If `socketRef.current` is `null` at mount (socket created in a sibling effect), no listeners are registered. If the socket is later recreated, the new socket has no listeners.

**Fix:** `useConnectionManager` exposes `socket` as a piece of React state (via `useState`) alongside the existing `socketRef`. The ref stays for imperative access; the state value drives reactivity. `useGameState` and `usePlaylistManager` declare the socket state value as a dependency so their effects re-run when the socket instance changes.

**Files:** `client/src/hooks/useConnectionManager.js`, `client/src/hooks/useGameState.js`, `client/src/hooks/usePlaylistManager.js`
**Test:** Event listeners are registered when socket is set after initial render. Listeners survive a socket recreation cycle.

---

### C-7 — `leaveRoom` logs users out on every table exit
**Root cause:** `client/src/hooks/useSocket.js` `leaveRoom` calls `sessionStorage.removeItem('poker_trainer_jwt')` and `sessionStorage.removeItem('poker_trainer_player_id')`. On next page load or refresh, no JWT is found → user is forced to login page. `AuthContext.user` and `sessionStorage` are left out of sync.

**Fix:** Remove both `sessionStorage.removeItem` lines from `leaveRoom`. Session clearing belongs exclusively in `logout()`.

**File:** `client/src/hooks/useSocket.js`
**Test:** Calling `leaveRoom` does not remove `poker_trainer_jwt` or `poker_trainer_player_id` from sessionStorage.

---

**Batch 1 execution order:** C-16 → C-15 → C-17 → C-8 → C-9 → C-7
*(Server fixes first in dependency order: log hand before completing it. C-8 is the most structurally significant frontend change — do it before the simpler C-9 and C-7.)*

**Batch 1 done signal:** Full test suite green. Manual smoke: start a tournament, play a hand to showdown, confirm next hand auto-deals. Navigate away from a table, confirm JWT persists in sessionStorage. Admin user joins tournament table as coach.

---

## Batch 2 — Auth & Intelligence
**Goal:** Referee scope enforced. Permissions endpoint returns real data. Alert scoping is coach-isolated. 3-bet baseline is correct.

### C-1 — Referee scope filter silently dropped
**Root cause:** `server/auth/tournamentAuth.js` declares `const query = ...` then calls `query.eq('table_id', tableId)` without reassigning. Supabase query builder is immutable — `.eq()` returns a new object. The filter is discarded. Any active referee for any tournament passes the guard for every tournament.

**Fix:** Change `const query` to `let query` and reassign: `query = query.eq('table_id', tableId)`.

**File:** `server/auth/tournamentAuth.js`
**Test:** A referee scoped to Table A receives 403 on Table B's tournament actions. A referee scoped to Table A passes for Table A.

---

### C-2 + C-3 — Permissions endpoint returns empty; `resolved_by` audit trail always null
**Root cause:** Both bugs share the same cause — `req.user.id` used where `req.user.stableId` is needed. The JWT payload puts the player UUID in `stableId`. `req.user.id` is always `undefined`.

- `auth.js`: `GET /api/auth/permissions` calls `getPlayerPermissions(req.user.id, ...)` → always returns `[]`
- `users.js` (lines 238, 279, 319, 344): `resolved_by: req.user?.id` → always stores `null`

**Fix:** Replace `req.user.id` with `req.user.stableId ?? req.user.id` at all affected locations.

**Files:** `server/routes/auth.js`, `server/routes/admin/users.js`
**Test:** Authenticated user calling `GET /api/auth/permissions` receives non-empty permissions matching their role. Admin resolving a password reset has `resolved_by` set to their UUID (not null).

---

### C-4 — AlertService generates alerts for all platform students
**Root cause:** `server/services/AlertService.js` `_fetchStudents()` queries all non-bot students with no `coach_id` filter. In a multi-coach deployment, coach A's `generateAlerts()` call analyses coach B's students and writes alert instances attributed to coach A.

**Fix:** Pass `coachId` into `_fetchStudents(coachId)` and add `.eq('coach_id', coachId)` to the `player_profiles` query. Update the call site in `generateAlerts` to pass `coachId` through.

**File:** `server/services/AlertService.js`
**Test:** `AlertService.generateAlerts(coachId)` only processes students whose `coach_id` matches. Students belonging to other coaches are not present in the result.

---

### C-6 — BaselineService 3-bet percentage always returns 0%
**Root cause:** The preflop action query filters `eq('player_id', playerId)`, fetching only the focal player's own actions. `raisesBefore` counts the player's own raises only — it can never reach 2 from one player's actions alone. 3-bet% is always 0. The same calculation is copied into `ProgressReportService._computePeriodStats`.

**Fix (Option A):** Fetch all preflop actions for the hand IDs the player participated in (no `player_id` filter). Group by hand. For each hand, determine if the focal player raised AND there was at least one prior raise by any other player in that hand. Count those as 3-bet opportunities and 3-bets made.

Logic:
1. Fetch all `hand_ids` where `player_id = playerId` (preflop, already done)
2. For those hand IDs, fetch ALL preflop bet/raise actions across all players (remove `player_id` filter)
3. Group by `hand_id`, order by action sequence
4. For each hand: identify the focal player's raise position. If at least one other player raised before them, it's an opportunity; if the focal player raised in that position, it's a 3-bet.

Apply the same fix to `ProgressReportService._computePeriodStats`.

**Files:** `server/services/BaselineService.js`, `server/services/ProgressReportService.js`
**Test:** A player with a documented 3-bet hand in fixtures gets non-zero 3-bet% from `BaselineService.recompute()`. A player with no 3-bets gets 0%.

---

**Batch 2 execution order:** C-1 → C-2+C-3 → C-4 → C-6
*(Auth fixes first — C-1 is a one-liner. C-6 is the most complex, save for last.)*

**Batch 2 done signal:** Full test suite green. Verify: referee for Table A gets 403 on Table B. `GET /api/auth/permissions` returns non-empty array. Coach alert list contains only their own students. `BaselineService.recompute()` returns non-zero 3-bet% for a player with known 3-bets.

---

## Batch 3 — UX & Admin Polish
**Goal:** Remove anything that would embarrass the coach during the live reveal or silently break tournament referee management.

### C-14 — Migration 037 UNIQUE constraint crashes on 2nd referee revocation
**Root cause:** `UNIQUE NULLS NOT DISTINCT (table_id, group_id, active)` applies to all rows. First revocation creates `(tableId, NULL, false)`. Second revocation creates a duplicate → constraint violation crash.

**Fix:** New migration (046) that drops the bad constraint and replaces it with a partial unique index:
```sql
ALTER TABLE tournament_referees
  DROP CONSTRAINT IF EXISTS tournament_referees_table_id_group_id_active_key;

CREATE UNIQUE INDEX idx_tournament_referees_one_active
  ON tournament_referees (table_id, group_id)
  WHERE active = true;
```

**File:** `supabase/migrations/046_fix_tournament_referees_constraint.sql`
**Test:** Appoint → revoke → appoint → revoke cycle on the same tournament does not throw. Two active referees for different tournaments coexist without conflict.

---

### C-10 — StableOverviewPage ships hardcoded mock data
**Root cause:** `MOCK_STUDENTS`, `MOCK_GROUPS`, `MOCK_AVERAGES` are hardcoded in the component. The comment says "replace with apiFetch when backend ships." The backend endpoints (`GET /api/admin/groups`, `GET /api/players`) are live.

**Fix:** Wire the page to real APIs. Remove all mock constants. If any data shape mismatches, render a clean empty state — not fabricated numbers.

**File:** `client/src/pages/admin/StableOverviewPage.jsx`
**Test:** Component renders without importing or referencing mock constants. With mocked APIs returning empty arrays, shows empty state. With data, renders correctly.

---

### C-5 — `/api/settings` router missing `requireAuth` at mount
**Root cause:** Every other sensitive router has `requireAuth` at `app.use()`. Settings router only applies it per-route. A route losing its individual guard during maintenance would expose school settings unauthenticated.

**Fix:** Add `requireAuth` at mount in `server/index.js`:
```js
app.use('/api/settings', requireAuth, settingsRouter)
```
Remove now-redundant per-route `requireAuth` calls inside `settingsRouter`.

**Files:** `server/index.js`, `server/routes/settings.js`
**Test:** `GET /api/settings/table-defaults` without a JWT returns 401.

---

### C-13 — `UserManagement` manually decodes JWT
**Root cause:** `atob(token.split('.')[1])` used instead of `useAuth()`. Does not react to auth state changes. Breaks if JWT structure changes.

**Fix:** Replace manual decode with `const { user } = useAuth()` and `user?.role`.

**File:** `client/src/pages/admin/UserManagement.jsx`
**Test:** Component uses `useAuth()` for role detection. No `atob` call present.

---

### C-12 — `TournamentLobby` creates a raw independent socket
**Root cause:** `io(SOCKET_URL, {...})` called directly in `TournamentLobby.jsx`, bypassing the app's shared socket system. Uses the JWT from sessionStorage at creation time (stale after token refresh). Accumulates open connections on fast navigation.

**Fix:** Replace the standalone `io()` call with the app's shared socket via `useSocket` / `useTableSocket`. The lobby subscribes to tournament state events on the shared connection.

**File:** `client/src/pages/TournamentLobby.jsx`
**Test:** TournamentLobby does not call `io()` directly. Socket is sourced from the app's hook.

---

**Batch 3 execution order:** C-14 → C-10 → C-5 → C-13 → C-12
*(Migration first — DB change is independent. C-10 is the highest visibility fix for the reveal. Auth fix and frontend cleanups last.)*

**Batch 3 done signal:** Full test suite green. Verify: StableOverviewPage shows real data or clean empty state — no fake names. Appoint and revoke a referee twice without errors. Unauthenticated request to `/api/settings` returns 401.

---

## Deferred Issues (post-event follow-up)
The following were identified in the review but are not required for the event:

| Issue | Category | Reason deferred |
|-------|----------|----------------|
| I-1 `JwtService` missing `SESSION_SECRET` guard | Auth | No undefined secret in current deploy |
| I-4 `AlertService` `featureGate` fail-open too broad | Auth | Low immediate risk |
| I-3 `SessionPrepService` fetches wrong session | Services | Intelligence layer, not event-critical |
| I-3b `ProgressReportService.stableOverview` not coach-scoped | Services | Coach-scoped data, single-coach deploy |
| I-5 `IcmService` payout % not validated | Services | No misconfigured tournaments in current deploy |
| I-6 Groups no school-scope check | Routes | Single-school deploy |
| I-7/8 Tags/players globally exposed | Routes | Internal deployment |
| I-9 `getPlayerHands` JS pagination | DB | Manageable at current scale |
| I-10 Read-modify-write races | DB | Low concurrency at event |
| I-11 `replaceAutoTags` non-atomic | DB | Low failure probability |
| I-12 Staking no unique constraint | DB | D priority |
| I-13/14 N+1 and full-table scans | DB | Manageable at current scale |
| C-11 StakingPlayerPage silent error | Frontend | D priority |
| I-15–I-24 Frontend and game engine minor issues | Various | Non-blocking for event |
| Spec gaps (TableInfoPanel, CRM filters, MainLobby dead code) | Frontend | Functional gaps, not bugs |
