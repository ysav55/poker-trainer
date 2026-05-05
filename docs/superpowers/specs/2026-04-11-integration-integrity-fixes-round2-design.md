# Integration Integrity Fixes (Round 2) — Design Spec

**Date:** 2026-04-11
**Scope:** 12 issues from live Puppeteer + static analysis audit of staging
**Branch:** `feat/phase2`
**Approach:** Layer-first — backend, then frontend (4 phases), then ops, then tests

---

## Overview

A headless Chrome (Puppeteer) audit of `poker-trainer-staging.fly.dev` with an authenticated `solo_student` session uncovered 2 critical, 7 warning, and 3 info-level issues spanning broken API responses, unauthenticated fetches, accessibility gaps, navigation mismatches, and missing test coverage. All fixes are surgical — no architectural changes required.

---

## Phase 1: Backend Fixes

### Issue 1 — `GET /api/players/:id/stats` returns 404 for new users (CRITICAL)

**Symptom:** New user logs in → lobby calls `/api/players/:id/stats` → 404. Quick Stats panel renders broken `?` placeholders for every metric.

**File:** `server/routes/players.js` (lines 43-54)

**Root cause:** `getPlayerStatsByMode()` returns `null` when the player has no rows in `leaderboard` (overall mode) or `hand_players` (bot/human mode). The handler treats `null` as "player not found" and returns 404 — but the player ID is valid, they just have no history.

**Fix:** When `stats` is null, return a zero-state response instead of 404:

```js
if (!stats) {
  return res.json({
    hands_played: 0, hands_won: 0, net_chips: 0,
    vpip: 0, pfr: 0, wtsd: 0, wsd: 0,
    rank: null, total_players: null,
    trial_days_left: null, hands_left: null,
    trial_status: req.user?.trialStatus ?? null
  });
}
```

No DB change. No client change — client already reads these keys.

**Regression targets:** Stats panel on lobby, StatsPanel detail view, leaderboard rank derivation.

### Issue 10 — Undocumented `GET /api/hands` endpoint (INFO)

**Symptom:** `/api/hands?limit=10` is called on lobby load and works, but is absent from API documentation and endpoint references.

**File:** `server/routes/hands.js`

**Fix:** Add a JSDoc comment above the route. Update memory docs with this endpoint. No code change.

---

## Phase 2: Frontend — Auth & Forms

### Issue 2 — `GET /api/tables` fires unauthenticated on login page (CRITICAL)

**Symptom:** On first page load (before login), `/api/tables` fires → 401 → console error. Repeats on every navigation including `/login`, `/register`, `/forgot-password`.

**File:** `client/src/App.jsx` (line 161), `client/src/contexts/LobbyContext.jsx` (lines 20-24)

**Root cause:** `LobbyProvider` wraps at the app root level, *outside* `RequireAuth`. Its `useEffect` fires `refreshTables()` on mount and every 10 seconds — unconditionally.

**Fix:** Move `LobbyProvider` inside the authenticated route tree. Specifically, render it inside `AppLayout` (which only mounts behind `RequireAuth`) rather than wrapping the entire `AppRoutes` in `App.jsx`.

```jsx
// App.jsx — before
<AuthProvider>
  <LobbyProvider>
    <AppRoutes />
  </LobbyProvider>
</AuthProvider>

// App.jsx — after
<AuthProvider>
  <AppRoutes />
</AuthProvider>

// AppLayout.jsx — wraps children with LobbyProvider
<LobbyProvider>
  <SideNav />
  <main><Outlet /></main>
</LobbyProvider>
```

Login, register, and forgot-password pages don't consume `useLobby()` — no impact.

**Regression targets:** Any component using `useLobby()` — verify it still mounts inside the authenticated tree.

### Issue 3 — Login form missing `name`, `id`, `autocomplete` attributes (WARNING)

**Symptom:** Browser password managers, autofill, accessibility tools, and screen readers cannot identify the login fields. Native form fallback would GET-serialize credentials into the URL.

**File:** `client/src/pages/LoginPage.jsx` — `AuthInput` component (lines 13-29), form tag (line 96)

**Fix:**

| Input | `name` | `id` | `autocomplete` |
|-------|--------|------|-----------------|
| Username | `name` | `login-name` | `username` |
| Password | `password` | `login-password` | `current-password` |

Add `method="post"` to the `<form>` tag (currently has `onSubmit` + `noValidate` but no `method`).

### Issue 9 — JWT in sessionStorage, no persistent login (INFO)

**Decision:** Keep `sessionStorage` (intentional security posture). Add user-facing notice.

**Fix:** Add helper text below the login form:

```jsx
<p className="text-xs text-gray-500 mt-2 text-center">
  Your session expires when you close this tab.
</p>
```

No auth plumbing changes.

---

## Phase 3: Frontend — Navigation

### Issue 5 — Nav buttons use `type="submit"` instead of `<NavLink>` (WARNING)

**Symptom:** All nav items are `<button onClick={() => navigate(path)}>`. No right-click "open in new tab", no proper browser history entries, no deep-linking support.

**File:** `client/src/components/SideNav.jsx` (lines 139-173)

**Fix:** Replace `<button>` with React Router `<NavLink>`:

1. Import `NavLink` from `react-router-dom`, drop `useNavigate`
2. Replace `<button onClick={() => navigate(path)}>` with `<NavLink to={path}>`
3. Use NavLink's `className` callback for active state styling:
   ```jsx
   <NavLink
     to={item.path}
     className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : ''}`}
   >
   ```
4. Move existing active styles (gold left border, background) into the callback
5. Any `onClick` handlers beyond navigation (e.g., mobile sidebar collapse) remain as `onClick` on the `<NavLink>` — this is supported

### Issue 4 — Role-gated nav items visible to unauthorized roles (WARNING)

**Symptom:** Tournaments, Staking, and Scenarios nav items visible to `solo_student` but their APIs return 403.

**File:** `client/src/components/SideNav.jsx` (lines ~60-90, line 118)

**Root cause:** NAV_ITEMS filtered by `roles` array. Tournaments has all roles listed. Staking has two paths (admin and player). But the API requires `coach+` for tournaments and specific permissions for staking overview.

**Fix:** Switch from role-based to permission-based filtering:

```js
// NAV_ITEMS definition
{ label: 'Tournaments', path: '/tournaments', permission: 'tournament:manage' },
{ label: 'Staking',     path: '/admin/staking', permission: 'staking:view' },

// Filter logic
const { hasPermission } = useAuth();
const visibleItems = NAV_ITEMS.filter(item =>
  !item.permission || hasPermission(item.permission)
);
```

Items without a `permission` key (Lobby, Tables, History, Leaderboard, Bot Games) show for everyone. `hasPermission()` already exists via `useAuth()`.

**Open question:** The player-facing staking page (`/staking`) — if students should see it, it needs a separate permission or stays role-gated. Verify during implementation whether `staking:view` is assigned to student roles.

**Regression targets:** SideNav rendering for all 5 roles. Admin panel access.

---

## Phase 4: Frontend — Accessibility

### Issue 6 — Missing `<h1>` on authenticated pages (WARNING)

**Symptom:** LobbyPage has no `<h1>` — only `<h2>`. Some other pages (HandHistory, BotLobby, Leaderboard) already have `<h1>`. Inconsistent. Violates WCAG 1.3.1 and 2.4.6.

**Fix:** Audit all 26 page components. For each page missing an `<h1>`:

- If the page has a visible title, promote it to `<h1>`
- If a visible `<h1>` clashes with the design, use visually-hidden:
  ```jsx
  <h1 className="sr-only">Lobby</h1>
  ```

Tailwind `sr-only` is already available. One `<h1>` per page. Existing pages with correct `<h1>` left untouched.

---

## Phase 5: Frontend — Assets

### Issue 7 — Google Fonts blocked in staging (WARNING)

**Symptom:** `GET fonts.googleapis.com/css2?family=Inter...` → 403 on staging. App falls back to system fonts.

**Files:**
- `client/index.html` (lines 8-10) — Google Fonts `<link>` tags
- `client/tailwind.config.js` (line 30) — `fontFamily.sans: ['Inter', ...]`
- `client/src/index.css` (line 10) — `font-family: 'Inter', ...`

**Fix:**

1. Download Inter WOFF2 files for weights 300, 400, 500, 600, 700
2. Place in `client/public/fonts/inter/`
3. Create `client/src/fonts.css` with `@font-face` declarations:
   ```css
   @font-face {
     font-family: 'Inter';
     font-weight: 400;
     font-style: normal;
     font-display: swap;
     src: url('/fonts/inter/Inter-Regular.woff2') format('woff2');
   }
   /* repeat for 300, 500, 600, 700 */
   ```
4. Import `fonts.css` in `index.css` before Tailwind directives
5. Remove all 3 Google Fonts `<link>` tags from `index.html`
6. `tailwind.config.js` and `index.css` font-family declarations unchanged — already reference `'Inter'`

**Result:** No external network dependency, no privacy-affecting third-party request, no staging 403.

---

## Phase 6: Ops

### Issue 8 — Ariela Simantov password mismatch (INFO)

**Action:** Admin operation, not code. Reset password for stableId `96cf2876-1a35-4221-abac-2eb146e301ad` via admin panel or Supabase dashboard.

### Issue 11 — Registration collects email, login doesn't use it (INFO)

**Action:** Document current behavior. No code change:
- Registration: `name` + `password` + `email`
- Login: `name` + `password` only
- Email used for password reset, not login
- If email-as-login desired, separate feature — out of scope

---

## Phase 7: Tests

### Server-side — Jest integration tests

**File:** `server/__tests__/integration/api-integrity.test.js` (new)

Three test groups:

1. **Stats empty state (validates Issue 1)**
   - Register new user → `GET /api/players/:id/stats` → expect 200
   - Verify zero-state shape: `hands_played: 0`, `rank: null`, etc.

2. **Permissions matrix (validates Issue 4)**
   - Login as `solo_student` → `GET /api/tournaments` → expect 403
   - Login as `solo_student` → `GET /api/staking/overview` → expect 403
   - Login as `coach` → `GET /api/tournaments` → expect 200

3. **Tables endpoint auth (validates Issue 2)**
   - `GET /api/tables` with no JWT → expect 401
   - `GET /api/tables` with valid JWT → expect 200

### Client-side — Playwright tests

**File:** `tests/e2e/integrity.spec.ts` (new)

Four test groups:

1. **Login form attributes (validates Issue 3)**
   - Navigate to `/login`
   - Assert username input: `name="name"`, `autocomplete="username"`
   - Assert password input: `name="password"`, `autocomplete="current-password"`
   - Assert form: no `method="get"`

2. **Unauthenticated fetch (validates Issue 2)**
   - Navigate to `/login`, intercept network requests
   - Assert no request to `/api/tables` fires before login

3. **Nav visibility per role (validates Issue 4)**
   - Login as `solo_student`
   - Assert Tournaments and Staking nav items NOT visible
   - Login as `coach`
   - Assert Tournaments and Staking ARE visible

4. **Page accessibility (validates Issues 5, 6)**
   - Login → navigate to `/lobby`, `/history`, `/leaderboard`
   - Assert each page has exactly one `<h1>`
   - Assert nav items are `<a>` elements (not `<button>`)

### Playwright setup

If Playwright is not in the project, add `@playwright/test` as devDependency with minimal `playwright.config.ts` targeting `http://localhost:5173`. Tests run against local dev server.

---

## Files Changed (Summary)

| File | Phase | Change |
|------|-------|--------|
| `server/routes/players.js` | 1 | Return zero-state stats instead of 404 |
| `server/routes/hands.js` | 1 | Add JSDoc for undocumented endpoint |
| `client/src/App.jsx` | 2 | Remove `LobbyProvider` wrapper |
| `client/src/components/AppLayout.jsx` | 2 | Add `LobbyProvider` inside authenticated tree |
| `client/src/contexts/LobbyContext.jsx` | 2 | No change (moved, not modified) |
| `client/src/pages/LoginPage.jsx` | 2 | Add input attrs, form method, session notice |
| `client/src/components/SideNav.jsx` | 3 | NavLink swap + permission-based filtering |
| 20+ page components | 4 | Add `<h1>` where missing |
| `client/index.html` | 5 | Remove Google Fonts `<link>` tags |
| `client/src/fonts.css` | 5 | New — `@font-face` declarations |
| `client/src/index.css` | 5 | Import `fonts.css` |
| `client/public/fonts/inter/` | 5 | New — 5 WOFF2 files |
| `server/__tests__/integration/api-integrity.test.js` | 7 | New — 3 test groups |
| `tests/e2e/integrity.spec.ts` | 7 | New — 4 Playwright test groups |
| `playwright.config.ts` | 7 | New (if not present) |

---

## Decisions Log

| Decision | Rationale |
|----------|-----------|
| Keep `sessionStorage` for JWT | Security-conservative; add user notice instead |
| `<NavLink>` over `type="button"` band-aid | Correct semantic fix; enables deep-linking, new-tab, history |
| Permission-based nav filtering over role-based | Matches server-side enforcement; single source of truth via `hasPermission()` |
| Move `LobbyProvider` into `AppLayout` over token-sniffing | Structural fix; no auth-aware hacks in context |
| Self-host Inter font over CDN fix | Eliminates third-party dependency and staging 403 |
| Playwright over RTL for client tests | Catches real browser behavior (network requests, DOM attributes) |
| Layer-first ordering over issue-first | Minimizes context switching; each phase independently shippable |
