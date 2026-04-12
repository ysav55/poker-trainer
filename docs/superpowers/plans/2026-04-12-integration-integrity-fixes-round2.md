# Integration Integrity Fixes (Round 2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 12 integration issues found by Puppeteer audit of staging — 2 critical, 7 warning, 3 info.

**Architecture:** Layer-first — backend fixes first (no client changes needed), then 4 frontend phases (auth/forms, navigation, accessibility, assets), then ops, then tests. Each task is independently committable.

**Tech Stack:** Node.js/Express (server), React/Vite/Tailwind (client), Jest/Supertest (server tests), Playwright (E2E tests)

**Spec:** `docs/superpowers/specs/2026-04-11-integration-integrity-fixes-round2-design.md`

---

## Task 1: Backend — Stats empty state for new users (Issue 1, CRITICAL)

**Files:**
- Modify: `server/routes/players.js:43-54`
- Test: `server/routes/__tests__/players.test.js` (create if absent, or add to existing)

- [ ] **Step 1: Write the failing test**

Create or open `server/routes/__tests__/players.test.js`. Add a test for the zero-state response:

```js
describe('GET /api/players/:stableId/stats', () => {
  it('returns zero-state stats when player has no history', async () => {
    // Mock getPlayerStatsByMode to return null (no data)
    HandLogger.getPlayerStatsByMode.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/players/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/stats')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      hands_played: 0,
      hands_won: 0,
      net_chips: 0,
      vpip: 0,
      pfr: 0,
      wtsd: 0,
      wsd: 0,
      rank: null,
      total_players: null,
    });
  });

  it('returns real stats when player has history', async () => {
    const mockStats = { hands_played: 42, hands_won: 10, net_chips: 500, vpip: 25, pfr: 18, wtsd: 30, wsd: 50, rank: 3, total_players: 20 };
    HandLogger.getPlayerStatsByMode.mockResolvedValue(mockStats);

    const res = await request(app)
      .get('/api/players/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/stats')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject(mockStats);
  });
});
```

Follow the same supertest + mock pattern used in `server/routes/__tests__/tables.test.js` — build a minimal Express app, fake `requireAuth` to inject `req.user`, mock `HandLogger.getPlayerStatsByMode`.

- [ ] **Step 2: Run the test, verify it fails**

```bash
npx jest server/routes/__tests__/players.test.js --verbose
```

Expected: first test FAILS (404 instead of 200). Second test passes.

- [ ] **Step 3: Fix the route handler**

In `server/routes/players.js`, replace lines 49-49:

```js
// BEFORE:
if (!stats) return res.status(404).json({ error: 'Player not found' });

// AFTER:
if (!stats) {
  return res.json({
    hands_played: 0, hands_won: 0, net_chips: 0,
    vpip: 0, pfr: 0, wtsd: 0, wsd: 0,
    rank: null, total_players: null,
    trial_days_left: null, hands_left: null,
    trial_status: req.user?.trialStatus ?? null,
  });
}
```

- [ ] **Step 4: Run the test, verify it passes**

```bash
npx jest server/routes/__tests__/players.test.js --verbose
```

Expected: both tests PASS.

- [ ] **Step 5: Run full server test suite to check regression**

```bash
npm run test:server
```

Expected: all tests pass. No regressions.

- [ ] **Step 6: Commit**

```bash
git add server/routes/players.js server/routes/__tests__/players.test.js
git commit -m "fix(api): return zero-state stats for new users instead of 404 (Issue 1)"
```

---

## Task 2: Backend — Document `/api/hands` endpoint (Issue 10, INFO)

**Files:**
- Modify: `server/routes/hands.js:59-60`

- [ ] **Step 1: Add JSDoc to the endpoint**

In `server/routes/hands.js`, replace the comment on line 59:

```js
// BEFORE:
  // GET /api/hands

// AFTER:
  /**
   * GET /api/hands — paginated hand list.
   *
   * Query params:
   *   tableId  {string?}  — filter by table ID
   *   limit    {number?}  — max results, default 20, capped at 100
   *   offset   {number?}  — pagination offset, default 0
   *
   * Response: { hands: Hand[], limit: number, offset: number }
   */
```

- [ ] **Step 2: Commit**

```bash
git add server/routes/hands.js
git commit -m "docs(api): add JSDoc for GET /api/hands endpoint (Issue 10)"
```

---

## Task 3: Frontend — Move LobbyProvider inside authenticated tree (Issue 2, CRITICAL)

**Files:**
- Modify: `client/src/App.jsx:157-167`
- Modify: `client/src/components/AppLayout.jsx`

- [ ] **Step 1: Remove LobbyProvider from App.jsx**

In `client/src/App.jsx`, change the root component:

```jsx
// BEFORE (lines 157-167):
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <LobbyProvider>
          <AppRoutes />
        </LobbyProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

// AFTER:
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
```

Also remove the `LobbyProvider` import from `App.jsx` (line 12):

```js
// DELETE this line:
import { LobbyProvider } from './contexts/LobbyContext.jsx';
```

- [ ] **Step 2: Add LobbyProvider to AppLayout.jsx**

In `client/src/components/AppLayout.jsx`, wrap the layout content with `LobbyProvider`:

```jsx
// BEFORE:
import React from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import GlobalTopBar from './GlobalTopBar.jsx';
import SideNav from './SideNav.jsx';

export default function AppLayout({ chipBalance, pageTitle, onBack, badges }) {
  const { user } = useAuth();
  const role = user?.role ?? 'player';

  return (
    <div
      className="flex flex-col"
      style={{ height: '100vh', background: '#060a0f' }}
    >
      <GlobalTopBar
        chipBalance={chipBalance}
        pageTitle={pageTitle}
        onBack={onBack}
      />

      <div className="flex flex-1 min-h-0">
        <SideNav role={role} badges={badges ?? {}} />

        <main
          className="flex-1 overflow-y-auto"
          style={{ minWidth: 0 }}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}

// AFTER:
import React from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { LobbyProvider } from '../contexts/LobbyContext.jsx';
import GlobalTopBar from './GlobalTopBar.jsx';
import SideNav from './SideNav.jsx';

export default function AppLayout({ chipBalance, pageTitle, onBack, badges }) {
  const { user } = useAuth();
  const role = user?.role ?? 'player';

  return (
    <LobbyProvider>
      <div
        className="flex flex-col"
        style={{ height: '100vh', background: '#060a0f' }}
      >
        <GlobalTopBar
          chipBalance={chipBalance}
          pageTitle={pageTitle}
          onBack={onBack}
        />

        <div className="flex flex-1 min-h-0">
          <SideNav role={role} badges={badges ?? {}} />

          <main
            className="flex-1 overflow-y-auto"
            style={{ minWidth: 0 }}
          >
            <Outlet />
          </main>
        </div>
      </div>
    </LobbyProvider>
  );
}
```

- [ ] **Step 3: Verify no unauthenticated components use `useLobby()`**

Search for all `useLobby()` calls in the client. Every consumer must be inside a route that renders through `AppLayout` (i.e., behind `RequireAuth`).

```bash
grep -rn "useLobby" client/src/
```

Verify each file is a page/component that only renders inside the authenticated route tree. Login, Register, and ForgotPassword pages must NOT import `useLobby`.

- [ ] **Step 4: Manual smoke test**

Start the dev server (`npm run dev`). Navigate to `http://localhost:5173/login`. Open browser DevTools → Network tab. Confirm:
- No request to `/api/tables` fires on the login page
- After logging in, `/api/tables` fires normally on the lobby

- [ ] **Step 5: Commit**

```bash
git add client/src/App.jsx client/src/components/AppLayout.jsx
git commit -m "fix(client): move LobbyProvider inside auth tree, stop unauthenticated /api/tables fetch (Issue 2)"
```

---

## Task 4: Frontend — Login form attributes and session notice (Issues 3 & 9)

**Files:**
- Modify: `client/src/pages/LoginPage.jsx`

- [ ] **Step 1: Add attributes to AuthInput component**

In `client/src/pages/LoginPage.jsx`, update the `AuthInput` component (lines 11-29) to accept and pass through `name`, `id`, and `autoComplete`:

```jsx
// BEFORE:
function AuthInput({ type = 'text', value, onChange, placeholder, maxLength }) {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      maxLength={maxLength}
      className="w-full rounded-lg px-3 py-2.5 text-sm text-gray-100 placeholder-gray-600 outline-none transition-all duration-150"
      style={INPUT_STYLE}
      onFocus={(e) => {
        e.target.style.borderColor = 'rgba(212,175,55,0.45)';
        e.target.style.boxShadow = '0 0 0 3px rgba(212,175,55,0.08)';
      }}
      onBlur={(e) => {
        e.target.style.borderColor = 'rgba(255,255,255,0.1)';
        e.target.style.boxShadow = 'none';
      }}
    />
  );
}

// AFTER:
function AuthInput({ type = 'text', value, onChange, placeholder, maxLength, name, id, autoComplete }) {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      maxLength={maxLength}
      name={name}
      id={id}
      autoComplete={autoComplete}
      className="w-full rounded-lg px-3 py-2.5 text-sm text-gray-100 placeholder-gray-600 outline-none transition-all duration-150"
      style={INPUT_STYLE}
      onFocus={(e) => {
        e.target.style.borderColor = 'rgba(212,175,55,0.45)';
        e.target.style.boxShadow = '0 0 0 3px rgba(212,175,55,0.08)';
      }}
      onBlur={(e) => {
        e.target.style.borderColor = 'rgba(255,255,255,0.1)';
        e.target.style.boxShadow = 'none';
      }}
    />
  );
}
```

- [ ] **Step 2: Pass attributes to input instances and fix form tag**

In the form (lines 96-143), add the attributes to each `AuthInput` usage and `method="post"` to the form:

```jsx
// BEFORE (line 96):
<form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>

// AFTER:
<form onSubmit={handleSubmit} method="post" className="flex flex-col gap-4" noValidate>
```

Username input (lines 98-104):

```jsx
// BEFORE:
<AuthInput
  value={name}
  onChange={(e) => { setName(e.target.value); setError(''); }}
  placeholder="Enter your name"
  maxLength={32}
/>

// AFTER:
<AuthInput
  value={name}
  onChange={(e) => { setName(e.target.value); setError(''); }}
  placeholder="Enter your name"
  maxLength={32}
  name="name"
  id="login-name"
  autoComplete="username"
/>
```

Password input (lines 109-114):

```jsx
// BEFORE:
<AuthInput
  type="password"
  value={password}
  onChange={(e) => { setPassword(e.target.value); setError(''); }}
  placeholder="Password"
/>

// AFTER:
<AuthInput
  type="password"
  value={password}
  onChange={(e) => { setPassword(e.target.value); setError(''); }}
  placeholder="Password"
  name="password"
  id="login-password"
  autoComplete="current-password"
/>
```

- [ ] **Step 3: Add session expiry notice (Issue 9)**

After the footer links section (after line 164, before the closing `</div>`), add:

```jsx
{/* Session notice */}
<p className="text-[10px] text-gray-600 text-center">
  Your session expires when you close this tab.
</p>
```

- [ ] **Step 4: Manual smoke test**

Open `http://localhost:5173/login` in Chrome. Open DevTools → Elements. Verify:
- Username input has `name="name"`, `id="login-name"`, `autocomplete="username"`
- Password input has `name="password"`, `id="login-password"`, `autocomplete="current-password"`
- Form has `method="post"`
- Session notice text is visible below the form
- Chrome DevTools no longer shows the `[DOM] Input elements should have autocomplete attributes` warning

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/LoginPage.jsx
git commit -m "fix(login): add name/id/autocomplete attrs, form method, session notice (Issues 3, 9)"
```

---

## Task 5: Frontend — Replace nav buttons with NavLink (Issue 5)

**Files:**
- Modify: `client/src/components/SideNav.jsx`

- [ ] **Step 1: Update imports**

In `client/src/components/SideNav.jsx`, change the imports:

```jsx
// BEFORE:
import { useLocation, useNavigate } from 'react-router-dom';

// AFTER:
import { useLocation, NavLink } from 'react-router-dom';
```

- [ ] **Step 2: Remove `useNavigate` from the component body**

In the `SideNav` function (line 116), delete the `useNavigate` call:

```jsx
// DELETE this line:
  const navigate = useNavigate();
```

- [ ] **Step 3: Replace `<button>` with `<NavLink>` in the render**

Replace the button block (lines 138-173) with NavLink:

```jsx
// BEFORE:
        return (
          <button
            key={item.path + (item.hash ?? '')}
            onClick={() => navigate(item.path + (item.hash ?? ''))}
            className="relative flex flex-col items-center justify-center w-full py-2.5 gap-0.5 transition-colors"
            style={{
              borderLeft: active ? '3px solid #d4af37' : '3px solid transparent',
              background: active ? 'rgba(212,175,55,0.07)' : 'transparent',
            }}
            title={item.label}
          >
            <span className="text-base leading-none" role="img" aria-hidden="true">
              {item.icon}
            </span>
            <span
              className="text-[9px] font-medium leading-none mt-0.5"
              style={{ color: active ? '#d4af37' : '#8b949e' }}
            >
              {item.label}
            </span>

            {badge > 0 && (
              <span
                className="absolute top-1 right-2 inline-flex items-center justify-center rounded-full text-[8px] font-bold"
                style={{
                  background: '#d4af37',
                  color: '#0d1117',
                  minWidth: 14,
                  height: 14,
                  padding: '0 3px',
                }}
              >
                {badge > 9 ? '9+' : badge}
              </span>
            )}
          </button>
        );

// AFTER:
        return (
          <NavLink
            key={item.path + (item.hash ?? '')}
            to={item.path + (item.hash ?? '')}
            className="relative flex flex-col items-center justify-center w-full py-2.5 gap-0.5 transition-colors no-underline"
            style={{
              borderLeft: active ? '3px solid #d4af37' : '3px solid transparent',
              background: active ? 'rgba(212,175,55,0.07)' : 'transparent',
            }}
            title={item.label}
          >
            <span className="text-base leading-none" role="img" aria-hidden="true">
              {item.icon}
            </span>
            <span
              className="text-[9px] font-medium leading-none mt-0.5"
              style={{ color: active ? '#d4af37' : '#8b949e' }}
            >
              {item.label}
            </span>

            {badge > 0 && (
              <span
                className="absolute top-1 right-2 inline-flex items-center justify-center rounded-full text-[8px] font-bold"
                style={{
                  background: '#d4af37',
                  color: '#0d1117',
                  minWidth: 14,
                  height: 14,
                  padding: '0 3px',
                }}
              >
                {badge > 9 ? '9+' : badge}
              </span>
            )}
          </NavLink>
        );
```

Note: Keep the existing `isActive` function and `active` variable — NavLink's built-in `isActive` doesn't account for the `hash` matching logic this component uses. The existing `isActive(item)` logic (lines 120-123) handles hash-based matching correctly.

- [ ] **Step 4: Manual smoke test**

Open `http://localhost:5173/lobby`. Verify:
- Nav items render as `<a>` elements (inspect in DevTools)
- Right-click → "Open in new tab" works
- Active item still has gold left border
- Clicking items navigates correctly
- Badge counts still appear

- [ ] **Step 5: Commit**

```bash
git add client/src/components/SideNav.jsx
git commit -m "fix(nav): replace button elements with NavLink for proper anchor semantics (Issue 5)"
```

---

## Task 6: Frontend — Permission-based nav filtering (Issue 4)

**Files:**
- Modify: `client/src/components/SideNav.jsx`

- [ ] **Step 1: Add `permission` key to NAV_ITEMS that need gating**

Update the NAV_ITEMS array. Add a `permission` property to items that should be restricted. Items without `permission` remain visible to all authenticated users:

```js
// BEFORE (Tournaments, line 62-67):
  {
    icon: '🏆',
    label: 'Tournaments',
    path: '/tournaments',
    roles: ['coach', ...STUDENT_ROLES, 'admin', 'superadmin'],
  },

// AFTER:
  {
    icon: '🏆',
    label: 'Tournaments',
    path: '/tournaments',
    roles: ['coach', ...STUDENT_ROLES, 'admin', 'superadmin'],
    permission: 'tournament:manage',
  },
```

```js
// BEFORE (Staking — coach path, lines 75-79):
  {
    icon: '💰',
    label: 'Staking',
    path: '/admin/staking',
    roles: ['coach', 'admin', 'superadmin'],
  },

// AFTER:
  {
    icon: '💰',
    label: 'Staking',
    path: '/admin/staking',
    roles: ['coach', 'admin', 'superadmin'],
    permission: 'staking:view',
  },
```

```js
// BEFORE (Staking — student path, lines 80-84):
  {
    icon: '💰',
    label: 'Staking',
    path: '/staking',
    roles: ['coached_student', 'solo_student', 'trial'],
  },

// AFTER:
  {
    icon: '💰',
    label: 'Staking',
    path: '/staking',
    roles: ['coached_student', 'solo_student', 'trial'],
    permission: 'staking:view',
  },
```

- [ ] **Step 2: Update the filter logic to use permissions**

Import `useAuth` and update the component to use permission-based filtering:

```jsx
// BEFORE (line 114-118):
export default function SideNav({ role, badges = {} }) {
  const location = useLocation();

  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(role));

// AFTER:
import { useAuth } from '../contexts/AuthContext.jsx';

// ... (inside the component)
export default function SideNav({ role, badges = {} }) {
  const location = useLocation();
  const { hasPermission } = useAuth();

  const visibleItems = NAV_ITEMS.filter((item) =>
    item.roles.includes(role) && (!item.permission || hasPermission(item.permission))
  );
```

Note: Keep the `roles` check as a first filter (fast, no async), then layer the `permission` check on top. This way items still need the correct role AND the correct permission.

- [ ] **Step 3: Manual smoke test**

Login as a solo_student. Verify:
- Tournaments nav item is NOT visible
- Staking nav item is NOT visible
- Lobby, Tables, History, Bot Games, Leaderboard ARE visible

Login as a coach. Verify:
- Tournaments IS visible
- Staking IS visible
- All other items visible as before

- [ ] **Step 4: Commit**

```bash
git add client/src/components/SideNav.jsx
git commit -m "fix(nav): gate Tournaments and Staking by permission, not just role (Issue 4)"
```

---

## Task 7: Frontend — Add `<h1>` to pages missing it (Issue 6)

**Files:**
- Modify: multiple page components (list below)

Pages that already have `<h1>`: `HandHistoryPage.jsx`, `BotLobbyPage.jsx`, `LeaderboardPage.jsx`, `LoginPage.jsx` — skip these.

Pages that need `<h1>` added:

| Page | File | Recommended h1 text |
|------|------|---------------------|
| Lobby | `client/src/pages/LobbyPage.jsx` | "Lobby" |
| Main Lobby | `client/src/pages/MainLobby.jsx` | "Lobby" |
| Multi-Table | `client/src/pages/MultiTablePage.jsx` | "Multi-Table" |
| Table | `client/src/pages/TablePage.jsx` | "Table" |
| Review Table | `client/src/pages/ReviewTablePage.jsx` | "Review Table" |
| Settings | `client/src/pages/SettingsPage.jsx` | "Settings" |
| Analysis | `client/src/pages/AnalysisPage.jsx` | "Analysis" |
| Staking (player) | `client/src/pages/StakingPlayerPage.jsx` | "Staking" |
| Tournament List | `client/src/pages/TournamentListPage.jsx` | "Tournaments" |
| Tournament Detail | `client/src/pages/TournamentDetailPage.jsx` | "Tournament" |
| Tournament Control | `client/src/pages/TournamentControlPage.jsx` | "Tournament Control" |
| Tournament Lobby | `client/src/pages/TournamentLobby.jsx` | "Tournament Lobby" |
| Tournament Standings | `client/src/pages/TournamentStandings.jsx` | "Tournament Standings" |
| User Management | `client/src/pages/admin/UserManagement.jsx` | "User Management" |
| Player CRM | `client/src/pages/admin/PlayerCRM.jsx` | "Player CRM" |
| Hand Builder | `client/src/pages/admin/HandBuilder.jsx` | "Hand Builder" |
| Coach Alerts | `client/src/pages/admin/CoachAlertsPage.jsx` | "Alerts" |
| Staking (admin) | `client/src/pages/admin/StakingPage.jsx` | "Staking Management" |
| Tournament Setup | `client/src/pages/admin/TournamentSetup.jsx` | "Tournament Setup" |
| Referee Dashboard | `client/src/pages/admin/RefereeDashboard.jsx` | "Referee Dashboard" |
| Tournament Balancer | `client/src/pages/admin/TournamentBalancer.jsx` | "Tournament Balancer" |

- [ ] **Step 1: Add visually-hidden `<h1>` to each page**

For each page listed above, add a `sr-only` `<h1>` as the first child inside the outermost wrapper `<div>`:

```jsx
<h1 className="sr-only">Lobby</h1>
```

Use the text from the "Recommended h1 text" column.

For pages that already have a visible header element (like a styled `<span>` or `<h2>` that serves as the page title), you can either:
1. Promote it to `<h1>` if the styling works, OR
2. Add a separate `sr-only` `<h1>` and keep the existing heading

Prefer option 2 (sr-only) for consistency — it avoids cascading style changes.

- [ ] **Step 2: Verify no page has duplicate `<h1>`**

```bash
grep -rn "<h1" client/src/pages/ | grep -v "sr-only" | grep -v node_modules
```

Cross-reference with the sr-only h1s you just added. Each page should have exactly one `<h1>`.

- [ ] **Step 3: Manual spot-check**

Open 3-4 pages in the browser. Use DevTools → Elements to verify each has exactly one `<h1>`. Check that `sr-only` h1s are visually hidden but present in the DOM.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/
git commit -m "fix(a11y): add h1 to all pages missing one for screen reader support (Issue 6)"
```

---

## Task 8: Frontend — Self-host Inter font (Issue 7)

**Files:**
- Modify: `client/index.html`
- Create: `client/src/fonts.css`
- Create: `client/public/fonts/inter/` (5 WOFF2 files)
- Modify: `client/src/index.css`

- [ ] **Step 1: Download Inter WOFF2 files**

Download the 5 weight variants from the Inter release (https://github.com/rsms/inter/releases). Extract only the WOFF2 files for weights 300, 400, 500, 600, 700:

```bash
mkdir -p client/public/fonts/inter
```

Place these files:
- `client/public/fonts/inter/Inter-Light.woff2` (weight 300)
- `client/public/fonts/inter/Inter-Regular.woff2` (weight 400)
- `client/public/fonts/inter/Inter-Medium.woff2` (weight 500)
- `client/public/fonts/inter/Inter-SemiBold.woff2` (weight 600)
- `client/public/fonts/inter/Inter-Bold.woff2` (weight 700)

Alternative: use `fontsource` package (`npm install @fontsource/inter`) which bundles the WOFF2 files. If using fontsource, skip step 2 and instead `import '@fontsource/inter/300.css'` etc. in `main.jsx`. The manual approach below avoids the dependency.

- [ ] **Step 2: Create `client/src/fonts.css`**

```css
/* Self-hosted Inter font — replaces Google Fonts CDN dependency */

@font-face {
  font-family: 'Inter';
  font-weight: 300;
  font-style: normal;
  font-display: swap;
  src: url('/fonts/inter/Inter-Light.woff2') format('woff2');
}

@font-face {
  font-family: 'Inter';
  font-weight: 400;
  font-style: normal;
  font-display: swap;
  src: url('/fonts/inter/Inter-Regular.woff2') format('woff2');
}

@font-face {
  font-family: 'Inter';
  font-weight: 500;
  font-style: normal;
  font-display: swap;
  src: url('/fonts/inter/Inter-Medium.woff2') format('woff2');
}

@font-face {
  font-family: 'Inter';
  font-weight: 600;
  font-style: normal;
  font-display: swap;
  src: url('/fonts/inter/Inter-SemiBold.woff2') format('woff2');
}

@font-face {
  font-family: 'Inter';
  font-weight: 700;
  font-style: normal;
  font-display: swap;
  src: url('/fonts/inter/Inter-Bold.woff2') format('woff2');
}
```

- [ ] **Step 3: Import fonts.css in index.css**

In `client/src/index.css`, add the import BEFORE the Tailwind directives:

```css
// BEFORE:
@tailwind base;
@tailwind components;
@tailwind utilities;

// AFTER:
@import './fonts.css';

@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 4: Remove Google Fonts from index.html**

In `client/index.html`, delete lines 8-10:

```html
<!-- DELETE these 3 lines: -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
```

- [ ] **Step 5: Verify `tailwind.config.js` and `index.css` font references unchanged**

Confirm `tailwind.config.js` line 30 still has `sans: ['Inter', 'system-ui', 'sans-serif']` and `index.css` line 10 still has `font-family: 'Inter', system-ui, sans-serif`. No changes needed — they reference `'Inter'` by name, which the `@font-face` declarations now provide.

- [ ] **Step 6: Manual smoke test**

Open `http://localhost:5173/login`. Open DevTools → Network → Filter by "Font". Verify:
- No requests to `fonts.googleapis.com`
- WOFF2 files load from `/fonts/inter/`
- Text renders in Inter (compare glyph shapes to previous)

- [ ] **Step 7: Commit**

```bash
git add client/public/fonts/inter/ client/src/fonts.css client/src/index.css client/index.html
git commit -m "fix(fonts): self-host Inter font, remove Google Fonts CDN dependency (Issue 7)"
```

---

## Task 9: Ops — Password reset and email documentation (Issues 8, 11)

**Files:**
- No code files changed

- [ ] **Step 1: Reset Ariela Simantov's password (Issue 8)**

Use the admin panel or Supabase SQL editor. If using SQL:

```sql
-- Generate a new bcrypt hash for the desired password, then update:
UPDATE player_profiles
SET password_hash = '$2b$10$<new_hash_here>'
WHERE stable_id = '96cf2876-1a35-4221-abac-2eb146e301ad';
```

Or use the platform's password reset endpoint if available:
```bash
curl -X POST https://poker-trainer-staging.fly.dev/api/admin/users/96cf2876-1a35-4221-abac-2eb146e301ad/reset-password \
  -H "Authorization: Bearer <admin_jwt>" \
  -H "Content-Type: application/json" \
  -d '{"newPassword": "0505591661"}'
```

- [ ] **Step 2: Document email field behavior (Issue 11)**

No code change. The current behavior is intentional:
- Registration collects `name` + `password` + `email`
- Login uses `name` + `password` only
- Email is stored for password reset flow
- No email-based login path exists

This is already documented in the spec. No further action needed unless email-as-login is requested as a future feature.

---

## Task 10: Tests — Jest integration tests for API integrity (Issue 12, part 1)

**Files:**
- Create: `server/routes/__tests__/apiIntegrity.test.js`

- [ ] **Step 1: Create the test file with stats empty-state tests**

Create `server/routes/__tests__/apiIntegrity.test.js`:

```js
'use strict';

/**
 * API Integrity — integration-style tests validating fixes from the
 * 2026-04-11 staging audit (Round 2).
 *
 * Tests run against a minimal Express app with mocked DB layer.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../db/repositories/HandRepository', () => ({
  HandRepository: {
    getHands: jest.fn(),
    getPlayerStatsByMode: jest.fn(),
  },
}));

jest.mock('../../db/repositories/PlayerRepository', () => ({
  PlayerRepository: {
    getPlayerStatsByMode: jest.fn(),
    getAllPlayersWithStats: jest.fn(),
    getPlayerHoverStats: jest.fn(),
  },
}));

jest.mock('../../db/repositories/TableRepository', () => ({
  TableRepository: {
    listTables: jest.fn(),
  },
}));

jest.mock('../../state/SharedState', () => {
  const instance = { tables: new Map() };
  instance.getTableSummaries = jest.fn(() => []);
  return Object.assign(instance, { getTableSummaries: instance.getTableSummaries });
});

jest.mock('../../auth/requirePermission', () => ({
  requirePermission: jest.fn(() => (req, res, next) => next()),
  getPlayerPermissions: jest.fn(),
  invalidatePermissionCache: jest.fn(),
}));

// ─── Setup ────────────────────────────────────────────────────────────────────

const express = require('express');
const request = require('supertest');

function buildApp({ user = null } = {}) {
  const app = express();
  app.use(express.json());

  const requireAuth = (req, res, next) => {
    if (!user) return res.status(401).json({ error: 'auth_required', message: 'Login required' });
    req.user = user;
    next();
  };

  // Mount the routes under test
  const { PlayerRepository } = require('../../db/repositories/PlayerRepository');
  const registerPlayerRoutes = require('../players');
  const registerTableRoutes = require('../tables');

  // HandLogger shim — routes expect HandLogger methods
  const HandLogger = {
    getPlayerStatsByMode: PlayerRepository.getPlayerStatsByMode,
    getPlayerHoverStats: PlayerRepository.getPlayerHoverStats,
    getAllPlayersWithStats: PlayerRepository.getAllPlayersWithStats,
  };

  registerPlayerRoutes(app, { requireAuth, HandLogger });

  const sharedState = require('../../state/SharedState');
  const { requirePermission } = require('../../auth/requirePermission');
  registerTableRoutes(app, { requireAuth, requirePermission, sharedState });

  return app;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

const { PlayerRepository } = require('../../db/repositories/PlayerRepository');

describe('API Integrity — Issue 1: Stats empty state', () => {
  const coachUser = { id: 'coach-1', name: 'Coach', role: 'coach', stableId: 'coach-1' };
  const newUserId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

  afterEach(() => jest.clearAllMocks());

  it('returns 200 with zero-state stats when player has no history', async () => {
    PlayerRepository.getPlayerStatsByMode.mockResolvedValue(null);
    const app = buildApp({ user: { ...coachUser, trialStatus: 'active' } });

    const res = await request(app).get(`/api/players/${newUserId}/stats`);

    expect(res.status).toBe(200);
    expect(res.body.hands_played).toBe(0);
    expect(res.body.hands_won).toBe(0);
    expect(res.body.net_chips).toBe(0);
    expect(res.body.rank).toBeNull();
    expect(res.body.trial_status).toBe('active');
  });

  it('returns real stats when player has history', async () => {
    const stats = { hands_played: 42, hands_won: 10, net_chips: 500 };
    PlayerRepository.getPlayerStatsByMode.mockResolvedValue(stats);
    const app = buildApp({ user: coachUser });

    const res = await request(app).get(`/api/players/${newUserId}/stats`);

    expect(res.status).toBe(200);
    expect(res.body.hands_played).toBe(42);
  });
});

describe('API Integrity — Issue 2: Tables endpoint auth', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns 401 when no JWT is provided', async () => {
    const app = buildApp({ user: null });

    const res = await request(app).get('/api/tables');

    expect(res.status).toBe(401);
  });

  it('returns 200 when authenticated', async () => {
    const app = buildApp({ user: { id: 'u1', role: 'solo_student' } });

    const res = await request(app).get('/api/tables');

    expect(res.status).toBe(200);
  });
});
```

Note: The exact mock setup depends on how `registerPlayerRoutes` and `registerTableRoutes` are wired. Inspect the route registration functions to confirm the dependency injection pattern matches. Adjust the `HandLogger` shim if the route uses different method names.

- [ ] **Step 2: Run the tests**

```bash
npx jest server/routes/__tests__/apiIntegrity.test.js --verbose
```

Expected: All tests PASS (the route fix from Task 1 is already applied).

- [ ] **Step 3: Commit**

```bash
git add server/routes/__tests__/apiIntegrity.test.js
git commit -m "test(api): add integrity tests for stats empty state and tables auth (Issue 12)"
```

---

## Task 11: Tests — Playwright E2E tests for client integrity (Issue 12, part 2)

**Files:**
- Create: `e2e/16-integrity.spec.js`

- [ ] **Step 1: Create the Playwright test file**

Create `e2e/16-integrity.spec.js`:

```js
// @ts-check
const { test, expect } = require('./fixtures');
const { loginViaAPI, logout } = require('./helpers/auth');

test.describe('Integration Integrity — Round 2', () => {

  test.describe('Issue 3: Login form attributes', () => {
    test('login inputs have name, id, and autocomplete attributes', async ({ page }) => {
      await page.goto('/login');

      const nameInput = page.locator('input[placeholder="Enter your name"]');
      await expect(nameInput).toHaveAttribute('name', 'name');
      await expect(nameInput).toHaveAttribute('id', 'login-name');
      await expect(nameInput).toHaveAttribute('autocomplete', 'username');

      const passwordInput = page.locator('input[type="password"]');
      await expect(passwordInput).toHaveAttribute('name', 'password');
      await expect(passwordInput).toHaveAttribute('id', 'login-password');
      await expect(passwordInput).toHaveAttribute('autocomplete', 'current-password');
    });

    test('login form does not use method="get"', async ({ page }) => {
      await page.goto('/login');
      const form = page.locator('form');
      const method = await form.getAttribute('method');
      expect(method).not.toBe('get');
    });
  });

  test.describe('Issue 2: No unauthenticated /api/tables fetch', () => {
    test('login page does not fire /api/tables request', async ({ page }) => {
      const tableRequests = [];
      page.on('request', (req) => {
        if (req.url().includes('/api/tables')) {
          tableRequests.push(req.url());
        }
      });

      await page.goto('/login');
      // Wait a bit to ensure no delayed fetch fires
      await page.waitForTimeout(2000);

      expect(tableRequests).toHaveLength(0);
    });
  });

  test.describe('Issue 4: Nav visibility per role', () => {
    test('solo_student cannot see Tournaments or Staking nav items', async ({ studentPage }) => {
      await studentPage.goto('/lobby');
      await studentPage.waitForSelector('nav');

      // These should NOT be visible
      await expect(studentPage.locator('nav a[title="Tournaments"]')).toHaveCount(0);
      await expect(studentPage.locator('nav a[title="Staking"]')).toHaveCount(0);

      // These SHOULD be visible
      await expect(studentPage.locator('nav a[title="Lobby"]')).toBeVisible();
      await expect(studentPage.locator('nav a[title="History"]')).toBeVisible();
      await expect(studentPage.locator('nav a[title="Leaderboard"]')).toBeVisible();
    });

    test('coach can see Tournaments and Staking nav items', async ({ coachPage }) => {
      await coachPage.goto('/lobby');
      await coachPage.waitForSelector('nav');

      await expect(coachPage.locator('nav a[title="Tournaments"]')).toBeVisible();
      await expect(coachPage.locator('nav a[title="Staking"]')).toBeVisible();
    });
  });

  test.describe('Issues 5 & 6: Nav uses anchors, pages have h1', () => {
    test('nav items are <a> elements, not <button>', async ({ studentPage }) => {
      await studentPage.goto('/lobby');
      await studentPage.waitForSelector('nav');

      // All nav items inside the sidebar should be <a> tags
      const navButtons = studentPage.locator('nav button');
      await expect(navButtons).toHaveCount(0);

      const navLinks = studentPage.locator('nav a');
      const count = await navLinks.count();
      expect(count).toBeGreaterThan(0);
    });

    test('lobby page has exactly one h1', async ({ studentPage }) => {
      await studentPage.goto('/lobby');
      await studentPage.waitForSelector('nav');

      const h1s = studentPage.locator('h1');
      await expect(h1s).toHaveCount(1);
    });

    test('history page has exactly one h1', async ({ studentPage }) => {
      await studentPage.goto('/history');
      await studentPage.waitForSelector('h1');

      const h1s = studentPage.locator('h1');
      await expect(h1s).toHaveCount(1);
    });

    test('leaderboard page has exactly one h1', async ({ studentPage }) => {
      await studentPage.goto('/leaderboard');
      await studentPage.waitForSelector('h1');

      const h1s = studentPage.locator('h1');
      await expect(h1s).toHaveCount(1);
    });
  });
});
```

- [ ] **Step 2: Verify the test file uses the correct fixture pattern**

The test uses `{ studentPage }` and `{ coachPage }` from `./fixtures.js` — these are pre-authenticated page objects. Confirm the fixture file exports these (it does — see `e2e/fixtures.js`).

For the login page tests that need an unauthenticated page, use the default `{ page }` fixture.

- [ ] **Step 3: Run the tests**

```bash
npm run test:e2e -- --grep "Integration Integrity"
```

Expected: All tests PASS.

If the auth-setup project hasn't been run, run it first:

```bash
npm run test:e2e:setup
npm run test:e2e -- --grep "Integration Integrity"
```

- [ ] **Step 4: Commit**

```bash
git add e2e/16-integrity.spec.js
git commit -m "test(e2e): add Playwright tests for login form, nav visibility, a11y (Issue 12)"
```

---

## Task 12: Update e2e helpers for NavLink migration

**Files:**
- Modify: `e2e/helpers/auth.js:79`

- [ ] **Step 1: Update `expectLobbyLoaded` helper**

The existing helper checks for `nav button[title="Lobby"]` — after the NavLink migration (Task 5), nav items are `<a>` elements, not `<button>`. Update:

```js
// BEFORE (line 79):
  await expect(page.locator('nav button[title="Lobby"]')).toBeVisible({ timeout: 10_000 });

// AFTER:
  await expect(page.locator('nav a[title="Lobby"]')).toBeVisible({ timeout: 10_000 });
```

- [ ] **Step 2: Search for other `nav button` selectors in e2e tests**

```bash
grep -rn "nav button" e2e/
```

Update any other occurrences from `nav button[title=` to `nav a[title=`.

- [ ] **Step 3: Run full E2E suite to verify no selector breakage**

```bash
npm run test:e2e
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add e2e/
git commit -m "fix(e2e): update nav selectors from button to anchor after NavLink migration"
```

---

## Post-Implementation Checklist

- [ ] Run `npm run test:server` — all server tests pass
- [ ] Run `npm run test:client` — all client tests pass
- [ ] Run `npm run test:e2e` — all E2E tests pass
- [ ] Run linter: `npx eslint client/src/ server/ --quiet` — no new errors
- [ ] Manual smoke test on `http://localhost:5173`:
  - Login page: no console errors, no network 401s, password manager autofill works
  - Lobby: Quick Stats renders `0` for new users (not `?`)
  - Nav: right-click → "Open in new tab" works on sidebar items
  - Nav: solo_student doesn't see Tournaments or Staking
  - Fonts: Inter loads from `/fonts/inter/`, no Google Fonts requests
- [ ] Update `docs/memory/frontend.md` and `docs/memory/backend.md` with changes
