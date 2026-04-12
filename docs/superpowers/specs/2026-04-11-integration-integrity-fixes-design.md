# Integration Integrity Fixes — Design Spec

**Date:** 2026-04-11
**Scope:** 7 fixes (3 critical, 4 warning) from the staging integration audit
**Branch:** `feat/phase2`

---

## Overview

Live API probing of `poker-trainer-staging.fly.dev` revealed 3 critical and 4 warning-level issues across search, authorization, error logging, data leakage, route guards, field mismatches, and trial gating. All 7 are surgical fixes — no architectural changes required.

---

## C-1 — Player Search 500 for 2+ Character Queries

**Symptom:** `GET /api/players/search?q=ab` returns `{"error":"search_failed"}` (HTTP 500). Feature is completely non-functional — the frontend skips queries under 2 chars, so the backend is only ever called in the crashing range.

**File:** `server/routes/players.js` (lines 7-25)

**Current code:** `.ilike('display_name', `${q}%`)` — standard Supabase parameterized ILIKE. Syntax appears correct. The catch block swallows the actual error.

**Root cause:** Unknown until the Supabase error is surfaced. Likely candidates: RLS policy blocking the query, missing column on the table/view (`is_bot`, `avatar_url`), or schema mismatch between local and deployed.

**Fix:**
1. Add `console.error('Player search failed:', err.message, err.details)` to the catch block to surface the actual DB error
2. Sanitize `q` input: strip `%` and `_` characters to prevent LIKE pattern injection
3. Diagnose and fix the actual DB-layer issue once the error is visible
4. Return `{ players: [] }` for empty results (already done), `{ error: "search_failed" }` with 500 only for true server errors (already done)

**Regression targets:** Table creation player-invite flow, tournament player search, any player-lookup UI

---

## C-2 — Authorization Bypass on Prep-Brief & Reports

**Symptom:** Any authenticated coach can read any student's prep briefs, reports, and AI narratives by substituting the student ID in the URL. Data privacy violation.

**Guarded routes (working):**
- `GET /api/coach/students/:id/playlists` — 403
- `GET /api/coach/students/:id/scenario-history` — 403
- `GET /api/coach/students/:id/staking` — 403
- `POST /api/coach/students/:id/staking/notes` — 403

**Unguarded routes (broken):**
- `GET /api/coach/students/:id/prep-brief` — 200 (should be 403)
- `POST /api/coach/students/:id/prep-brief/refresh` — 200 (should be 403)
- `GET /api/coach/students/:id/reports` — 200 (should be 403)
- `GET /api/coach/students/:id/reports/:rid` — 200 (should be 403)
- `POST /api/coach/students/:id/reports` — 200 (should be 403)

**Current guard:** `verifyStudentAccess()` is an async function in `server/routes/coachStudents.js` (lines 29-53). Checks `player_profiles.coach_id = coachId` with admin/superadmin bypass. Called inline at the top of each guarded handler.

**Fix:** Extract to shared Express middleware:

1. **New file:** `server/auth/requireStudentAssignment.js`
   - Express middleware that reads `:id` from `req.params`
   - Queries `player_profiles` for `id = :id AND coach_id = req.user.id`
   - Admin/superadmin bypass (same as current)
   - Returns 403 `{ error: "forbidden", message: "Student not assigned to you" }` on failure
   - Sets `req.studentId` on success for downstream handlers

2. **Apply to all 9 routes:**
   - 4 in `coachStudents.js` — replace inline `verifyStudentAccess()` calls with middleware
   - 2 in `prepBriefs.js` — add middleware to route registration
   - 3 in `reports.js` — add middleware to route registration

3. **Delete** the `verifyStudentAccess()` function from `coachStudents.js`

**Regression targets:** All `/api/coach/students/:id/*` endpoints, admin access to student data

---

## C-3 — Client Error Logger Blocked by Auth

**Symptom:** `POST /api/logs/client-error` requires authentication, but the frontend error boundary intentionally sends errors without an auth header (errors can occur before login, during token expiry, or after logout). Zero client errors are ever logged.

**File:** `server/routes/logs.js` (line 15) — already has a `clientErrorLimiter` middleware applied, but it sits behind `requireAuth`

**Fix:**
1. **Exempt from auth:** Register the route before the `requireAuth` middleware, or use a route-specific override
2. **Rate limit by IP:** In-memory Map with 1-minute sliding window, 10 requests per IP per minute. No external dependency. Clean up stale entries on a 5-minute interval.
3. **Body size cap:** 10KB max via `express.json({ limit: '10kb' })` on this route only
4. **Accept both modes:** If an `Authorization` header is present and valid, attach `userId` to the log entry. If absent, log as anonymous with IP.
5. **Schema validation:** Require `{ message: string, stack?: string, url?: string, userAgent?: string }`. Reject malformed bodies with 400.

**Regression targets:** Error boundary component, any existing error logging consumers

---

## W-1 — Raw PostgreSQL Error Leaking in Staking Settlements

**Symptom:** `PATCH /api/staking/settlements/:id/approve` and `/reject` with non-UUID `:id` returns raw PG error: `"invalid input syntax for type uuid: \"not-a-uuid\""`. Leaks DB implementation details.

**Fix:**
1. Add UUID format validation at the top of both handlers (regex: `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`)
2. Return `400 { error: "invalid_id", message: "The provided ID is not valid." }` before the DB query
3. Check if a UUID validator already exists in the codebase to reuse; if not, create a small `server/auth/validateUUID.js` utility or inline it

**Regression targets:** Staking settlement approve/reject flows

---

## W-2 — `/api/admin/alerts` Duplicate Route

**Symptom:** `GET /api/admin/alerts` is accessible to coaches, inconsistent with all other `/api/admin/*` routes which require admin+.

**Root cause:** This route is a duplicate of `GET /api/coach/alerts` — identical DB query (filters by requesting coach's own `coach_id`). The `/api/admin/` path is misleading; it's not admin-scoped data.

**File:** `server/routes/alerts.js` (lines 68-92)

**Fix:**
1. Delete the `GET /api/admin/alerts` route entirely from `alerts.js`
2. Update frontend callers to use `/api/coach/alerts`:
   - `client/src/pages/admin/PlayerCRM.jsx` (line 2487)
   - `client/src/pages/LobbyPage.jsx` (line 823)
   - `client/src/__tests__/LobbyPage.test.jsx` (line 60)

**Regression targets:** Alert badge in sidebar/nav, CoachAlertsPage

---

## W-3 — Leaderboard Rank `findIndex` Field Mismatch

**Symptom:** The leaderboard `findIndex` predicate uses `Y.stable_id` and `Y.id`, but the API returns `Y.stableId` (camelCase). `findIndex` always returns -1, so the logged-in user's rank number never displays.

**Fix:** In the leaderboard component (source file, not minified bundle), change the `findIndex` predicate to include `Y.stableId`:

```js
.findIndex(Y => Y.stableId === i || Y.stable_id === i || Y.id === i)
```

**Regression targets:** Leaderboard page — user rank badge display

---

## W-4 — `trialStatus` Field Gaps

**Symptom:** Trial feature gating (`isTrial`) silently fails because `trialStatus` is inconsistently available.

**Current state (better than report suggested):**
- Login handler in `server/routes/auth.js` already computes `trialStatus` via `computeTrialStatus()` — but conditionally omits it when inactive: `...(trialStatus && { trialStatus })`
- JWT payload also conditionally includes it: `if (trialStatus) jwtPayload.trialStatus = trialStatus`
- Profile endpoint (`GET /api/auth/profile`) never returns it
- Frontend AuthContext correctly checks both paths: `role === 'trial' || trialStatus === 'active'`
- But `LobbyPage.jsx` (line 785) and `MainLobby.jsx` (line 337) bypass AuthContext and use `role === 'trial'` directly

**Fix (3 changes):**

1. **Login/register response:** Always return `trialStatus` — value is `"active"` or `null`. Change from conditional spread to explicit field:
   ```js
   // Before: ...(trialStatus && { trialStatus })
   // After:  trialStatus: trialStatus || null
   ```
   Same for JWT payload — always include `trialStatus` (even as `null`).

2. **Profile endpoint:** Add `trialStatus` to `GET /api/auth/profile` response using the same `computeTrialStatus()` function. This allows the frontend to refresh trial state without re-login.

3. **Frontend components:** Change `LobbyPage.jsx` and `MainLobby.jsx` to use AuthContext's `isTrial` instead of inline `role === 'trial'` checks.

**Regression targets:** Login flow, profile fetch, trial banner display, trial feature gates

---

## Files Changed (Summary)

| File | Change |
|---|---|
| `server/routes/players.js` | C-1: Add error logging, sanitize ILIKE input |
| `server/auth/requireStudentAssignment.js` | C-2: New middleware (extracted from coachStudents.js) |
| `server/routes/coachStudents.js` | C-2: Replace inline guard with middleware |
| `server/routes/prepBriefs.js` | C-2: Add student assignment middleware |
| `server/routes/reports.js` | C-2: Add student assignment middleware |
| `server/routes/logs.js` | C-3: Exempt from auth, add rate limit + body cap |
| `server/routes/staking.js` (or settlements handler) | W-1: Add UUID validation |
| `server/routes/alerts.js` | W-2: Delete `/api/admin/alerts` route |
| `client/src/pages/admin/PlayerCRM.jsx` | W-2: Change `/api/admin/alerts` to `/api/coach/alerts` |
| `client/src/pages/LobbyPage.jsx` | W-2: Change `/api/admin/alerts` to `/api/coach/alerts` |
| `client/src/__tests__/LobbyPage.test.jsx` | W-2: Update test mock URL |
| `client/src/pages/LeaderboardPage.jsx` | W-3: Fix `findIndex` predicate |
| `server/routes/auth.js` | W-4: Always return `trialStatus`, add to profile |
| `client/src/pages/LobbyPage.jsx` | W-4: Use AuthContext `isTrial` |
| `client/src/pages/MainLobby.jsx` | W-4: Use AuthContext `isTrial` |

---

## Test Plan

Each fix gets:
1. Unit/integration test for the specific fix
2. Regression test for adjacent paths listed above
3. Manual staging verification after deploy

**C-2 specifically** needs negative tests: coach A requesting coach B's student data returns 403 on all 9 routes.
