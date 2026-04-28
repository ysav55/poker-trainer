# Integration Integrity Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 6 issues (2 critical, 4 warning) found during the staging integration audit — broken search, auth bypass, duplicate route, field mismatches, raw DB error leaks, and trial gating gaps.

**Architecture:** All fixes are surgical — no schema migrations, no new dependencies, no architectural changes. The only new file is `server/auth/requireStudentAssignment.js` (middleware extraction). Everything else is modifying existing handlers and components.

**Note on C-3 (client error logger):** The audit report claimed `POST /api/logs/client-error` is blocked by auth. Source code review shows this is **already fixed**: `registerLogRoutes(app)` is called without `requireAuth` at `server/index.js:148`, and the route has no auth middleware — only `clientErrorLimiter` (10 req/min). The staging deploy may be running older code. Deploying the current `feat/phase2` branch resolves this. No code changes needed.

**Tech Stack:** Node.js/Express (Jest), React/Vite (Vitest), Supabase client library

**Test commands:**
- Server: `npx jest <path> --verbose`
- Client: `npx vitest run <path>`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `server/auth/requireStudentAssignment.js` | **Create** | Express middleware — verifies student is assigned to requesting coach |
| `server/auth/__tests__/requireStudentAssignment.test.js` | **Create** | Unit tests for the middleware |
| `server/routes/players.js` | Modify | C-1: Add error logging + ILIKE input sanitization |
| `server/routes/coachStudents.js` | Modify | C-2: Replace inline `verifyStudentAccess` with middleware |
| `server/routes/prepBriefs.js` | Modify | C-2: Add `requireStudentAssignment` middleware |
| `server/routes/reports.js` | Modify | C-2: Add `requireStudentAssignment` middleware |
| `server/routes/__tests__/coachStudents.test.js` | Modify | C-2: Update tests for middleware pattern |
| `server/routes/__tests__/prepBriefs.test.js` | Modify | C-2: Add 403 test for unassigned student |
| `server/routes/__tests__/reports.test.js` | Modify | C-2: Add 403 test for unassigned student |
| `server/routes/staking.js` | Modify | W-1: Add UUID validation to settlements approve/reject |
| `server/routes/alerts.js` | Modify | W-2: Delete `/api/admin/alerts` route |
| `client/src/pages/admin/PlayerCRM.jsx` | Modify | W-2: Change alert fetch URL |
| `client/src/pages/LobbyPage.jsx` | Modify | W-2: Change alert fetch URL + W-3: Fix findIndex + W-4: Use AuthContext isTrial |
| `client/src/__tests__/LobbyPage.test.jsx` | Modify | W-2: Update mock URL |
| `client/src/pages/MainLobby.jsx` | Modify | W-3: Fix findIndex + W-4: Use AuthContext isTrial |
| `server/routes/auth.js` | Modify | W-4: Always return trialStatus + add to profile endpoint |

---

## Task 1: C-1 — Fix Player Search Error Logging + Input Sanitization

**Files:**
- Modify: `server/routes/players.js:7-25`

The search endpoint swallows errors silently. We need to log the actual error to diagnose the staging crash, and sanitize ILIKE wildcard characters in user input.

- [ ] **Step 1: Add error logging and input sanitization to the search handler**

In `server/routes/players.js`, replace the search handler (lines 7-25):

```js
  // GET /api/players/search?q=name — search players by display_name (prefix match)
  app.get('/api/players/search', requireAuth, async (req, res) => {
    const q = (req.query.q ?? '').trim();
    if (q.length < 2) return res.json({ players: [] });
    // Strip ILIKE wildcards to prevent pattern injection
    const sanitized = q.replace(/[%_]/g, '');
    if (sanitized.length < 2) return res.json({ players: [] });
    try {
      const { data, error } = await supabase
        .from('player_profiles')
        .select('id, display_name, avatar_url')
        .ilike('display_name', `${sanitized}%`)
        .eq('is_bot', false)
        .neq('id', req.user.id)
        .order('display_name')
        .limit(10);
      if (error) throw error;
      res.json({ players: data ?? [] });
    } catch (err) {
      console.error('Player search failed:', err.message, err.details ?? '', err.hint ?? '');
      res.status(500).json({ error: 'search_failed' });
    }
  });
```

- [ ] **Step 2: Run existing tests to verify no regressions**

Run: `npx jest server/routes/__tests__/players --verbose`

Expected: All existing player route tests pass. If there are no player search tests, that's fine — the fix is defensive.

- [ ] **Step 3: Commit**

```bash
git add server/routes/players.js
git commit -m "fix(search): add error logging + sanitize ILIKE wildcards in player search (C-1)"
```

---

## Task 2: C-2 — Extract `requireStudentAssignment` Middleware

**Files:**
- Create: `server/auth/requireStudentAssignment.js`
- Create: `server/auth/__tests__/requireStudentAssignment.test.js`

Extract the `verifyStudentAccess` logic from `coachStudents.js` into a reusable Express middleware.

- [ ] **Step 1: Write the failing test**

Create `server/auth/__tests__/requireStudentAssignment.test.js`:

```js
'use strict';

// ─── Mocks ────────────────────────────────────────────────────────────────────

let mockQueryResult = { data: null, error: null };

const mockMaybeSingle = jest.fn(async () => mockQueryResult);
const mockEq = jest.fn(() => ({ eq: mockEq, maybeSingle: mockMaybeSingle }));
const mockSelect = jest.fn(() => ({ eq: mockEq }));
const mockFrom = jest.fn(() => ({ select: mockSelect }));

jest.mock('../../db/supabase', () => ({ from: mockFrom }));

// ─── Module under test ────────────────────────────────────────────────────────

const requireStudentAssignment = require('../requireStudentAssignment');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(user, paramId) {
  return {
    params: { id: paramId },
    user,
  };
}

function makeRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json   = (data) => { res.body = data; return res; };
  return res;
}

const COACH_ID   = 'coach-aaa';
const STUDENT_ID = 'student-bbb';
const OTHER_STUDENT = 'student-ccc';

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockQueryResult = { data: null, error: null };
});

describe('requireStudentAssignment', () => {
  test('calls next and sets req.studentId when student is assigned to coach', async () => {
    mockQueryResult = { data: { id: STUDENT_ID }, error: null };
    const req  = makeReq({ id: COACH_ID, role: 'coach' }, STUDENT_ID);
    const res  = makeRes();
    const next = jest.fn();

    await requireStudentAssignment(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.studentId).toBe(STUDENT_ID);
  });

  test('returns 403 when student is not assigned to coach', async () => {
    mockQueryResult = { data: null, error: null };
    const req  = makeReq({ id: COACH_ID, role: 'coach' }, OTHER_STUDENT);
    const res  = makeRes();
    const next = jest.fn();

    await requireStudentAssignment(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('forbidden');
  });

  test('admin bypasses ownership check', async () => {
    const req  = makeReq({ id: 'admin-1', role: 'admin' }, STUDENT_ID);
    const res  = makeRes();
    const next = jest.fn();

    await requireStudentAssignment(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.studentId).toBe(STUDENT_ID);
    expect(mockFrom).not.toHaveBeenCalled(); // no DB query for admin
  });

  test('superadmin bypasses ownership check', async () => {
    const req  = makeReq({ id: 'sa-1', role: 'superadmin' }, STUDENT_ID);
    const res  = makeRes();
    const next = jest.fn();

    await requireStudentAssignment(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.studentId).toBe(STUDENT_ID);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  test('returns 500 when DB query fails', async () => {
    mockQueryResult = { data: null, error: { message: 'db down' } };
    const req  = makeReq({ id: COACH_ID, role: 'coach' }, STUDENT_ID);
    const res  = makeRes();
    const next = jest.fn();

    await requireStudentAssignment(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(500);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest server/auth/__tests__/requireStudentAssignment --verbose`

Expected: FAIL — `Cannot find module '../requireStudentAssignment'`

- [ ] **Step 3: Write the middleware**

Create `server/auth/requireStudentAssignment.js`:

```js
'use strict';

const supabase = require('../db/supabase');

/**
 * Express middleware: verifies that the student in req.params.id
 * is assigned to the requesting coach (via coach_id column in player_profiles).
 *
 * Admin and superadmin roles bypass the check.
 * On success, sets req.studentId for downstream handlers.
 */
async function requireStudentAssignment(req, res, next) {
  const coachId   = req.user?.id ?? req.user?.stableId;
  const studentId = req.params.id;
  const role      = req.user?.role;

  // Admin/superadmin can access any student
  if (role === 'admin' || role === 'superadmin') {
    req.studentId = studentId;
    return next();
  }

  try {
    const { data, error } = await supabase
      .from('player_profiles')
      .select('id')
      .eq('id', studentId)
      .eq('coach_id', coachId)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return res.status(403).json({ error: 'forbidden', message: 'Student not assigned to you' });
    }

    req.studentId = studentId;
    next();
  } catch (err) {
    return res.status(500).json({ error: 'internal_error', message: 'Failed to verify student assignment' });
  }
}

module.exports = requireStudentAssignment;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest server/auth/__tests__/requireStudentAssignment --verbose`

Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add server/auth/requireStudentAssignment.js server/auth/__tests__/requireStudentAssignment.test.js
git commit -m "feat(auth): extract requireStudentAssignment middleware (C-2)"
```

---

## Task 3: C-2 — Wire Middleware into coachStudents, prepBriefs, reports

**Files:**
- Modify: `server/routes/coachStudents.js:1-60`
- Modify: `server/routes/prepBriefs.js`
- Modify: `server/routes/reports.js`
- Modify: `server/routes/__tests__/coachStudents.test.js`
- Modify: `server/routes/__tests__/prepBriefs.test.js`
- Modify: `server/routes/__tests__/reports.test.js`

Replace the inline `verifyStudentAccess` in coachStudents with the middleware, and add it to prepBriefs and reports.

- [ ] **Step 1: Update coachStudents.js — remove verifyStudentAccess, use middleware**

In `server/routes/coachStudents.js`:

1. Delete the `verifyStudentAccess` function (lines 25-53).
2. Import the middleware at the top:

```js
const requireStudentAssignment = require('../auth/requireStudentAssignment');
```

3. Add middleware to each route and replace inline guard calls. For each of the 4 routes (`/:id/playlists`, `/:id/scenario-history`, `/:id/staking`, `/:id/staking/notes`), change from:

```js
router.get('/:id/playlists', async (req, res) => {
  try {
    const studentId = await verifyStudentAccess(req, res);
    if (!studentId) return;
    // ...
```

to:

```js
router.get('/:id/playlists', requireStudentAssignment, async (req, res) => {
  try {
    const studentId = req.studentId;
    // ...
```

Remove the `if (!studentId) return;` line from all 4 handlers since the middleware handles the 403 before the handler runs.

- [ ] **Step 2: Update prepBriefs.js — add middleware to both routes**

In `server/routes/prepBriefs.js`:

Add middleware import and wire it. The module receives dependencies as the second argument, so pass `requireStudentAssignment` through that object.

Actually, since prepBriefs uses `app.get()` directly (not a router), we need to add the middleware to the route chain. Change the module signature and add the middleware:

```js
const requireStudentAssignment = require('../auth/requireStudentAssignment');

module.exports = function registerPrepBriefRoutes(app, { requireAuth, requireRole }) {

  app.get(
    '/api/coach/students/:id/prep-brief',
    requireAuth,
    requireRole('coach'),
    requireStudentAssignment,
    async (req, res) => {
      const coachId   = req.user.id ?? req.user.stableId;
      const studentId = req.studentId;
      // ... rest unchanged
    }
  );

  app.post(
    '/api/coach/students/:id/prep-brief/refresh',
    requireAuth,
    requireRole('coach'),
    requireStudentAssignment,
    async (req, res) => {
      const coachId   = req.user.id ?? req.user.stableId;
      const studentId = req.studentId;
      // ... rest unchanged
    }
  );
};
```

Key changes per handler:
1. Add `requireStudentAssignment` after `requireRole('coach')` in the middleware chain
2. Change `const studentId = req.params.id;` to `const studentId = req.studentId;`

- [ ] **Step 3: Update reports.js — add middleware to 3 student-scoped routes**

In `server/routes/reports.js`, same pattern as prepBriefs. Add the middleware to the 3 routes that take `:id` as a student param. Do NOT add it to `GET /api/coach/reports/stable` — that route has no student ID.

```js
const requireStudentAssignment = require('../auth/requireStudentAssignment');
```

Add `requireStudentAssignment` after `requireRole('coach')` for these 3 routes:
- `GET /api/coach/students/:id/reports`
- `GET /api/coach/students/:id/reports/:rid`
- `POST /api/coach/students/:id/reports`

Change `const studentId = req.params.id;` to `const studentId = req.studentId;` in each.

- [ ] **Step 4: Update coachStudents.test.js — mock the middleware**

The test file mocks `requireAuth` and `requireRole` already. Since `coachStudents.js` imports `requireStudentAssignment` directly (not from a dependency-injection argument), add a mock:

At the top of `server/routes/__tests__/coachStudents.test.js`, add before other mocks:

```js
let mockStudentAccessGranted = true;
jest.mock('../../auth/requireStudentAssignment', () =>
  jest.fn((req, res, next) => {
    if (!mockStudentAccessGranted) {
      return res.status(403).json({ error: 'forbidden', message: 'Student not assigned to you' });
    }
    req.studentId = req.params.id;
    next();
  })
);
```

Then update the existing `verifyStudentAccess` describe block: remove the `mockAccessGranted()` helper calls that were mocking the Supabase `player_profiles` query (since the middleware handles that now), and replace with `mockStudentAccessGranted = true;` in `beforeEach`.

Update the "returns 403 when student not assigned" test to set `mockStudentAccessGranted = false;` instead of mocking the Supabase response.

Remove the old `mockAccessGranted()` helper function calls from each test.

- [ ] **Step 5: Add 403 test to prepBriefs.test.js**

In `server/routes/__tests__/prepBriefs.test.js`, add the mock for `requireStudentAssignment`:

```js
let mockStudentAccessGranted = true;
jest.mock('../../auth/requireStudentAssignment', () =>
  jest.fn((req, res, next) => {
    if (!mockStudentAccessGranted) {
      return res.status(403).json({ error: 'forbidden', message: 'Student not assigned to you' });
    }
    req.studentId = req.params.id;
    next();
  })
);
```

Add `mockStudentAccessGranted = true;` to the `beforeEach` block.

Add test cases:

```js
describe('student assignment guard', () => {
  test('GET /prep-brief returns 403 when student not assigned to coach', async () => {
    mockCurrentUser = { id: 'coach-1', stableId: 'coach-1', role: 'coach' };
    mockStudentAccessGranted = false;

    const res = await request(app).get('/api/coach/students/student-99/prep-brief');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('forbidden');
  });

  test('POST /prep-brief/refresh returns 403 when student not assigned to coach', async () => {
    mockCurrentUser = { id: 'coach-1', stableId: 'coach-1', role: 'coach' };
    mockStudentAccessGranted = false;

    const res = await request(app).post('/api/coach/students/student-99/prep-brief/refresh');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('forbidden');
  });
});
```

- [ ] **Step 6: Add 403 tests to reports.test.js**

Same mock pattern as prepBriefs. Add the `requireStudentAssignment` mock and tests:

```js
let mockStudentAccessGranted = true;
jest.mock('../../auth/requireStudentAssignment', () =>
  jest.fn((req, res, next) => {
    if (!mockStudentAccessGranted) {
      return res.status(403).json({ error: 'forbidden', message: 'Student not assigned to you' });
    }
    req.studentId = req.params.id;
    next();
  })
);
```

Add `mockStudentAccessGranted = true;` to the `beforeEach` block.

Add test cases:

```js
describe('student assignment guard', () => {
  test('GET /reports returns 403 when student not assigned', async () => {
    mockCurrentUser = { id: 'coach-1', stableId: 'coach-1', role: 'coach' };
    mockStudentAccessGranted = false;

    const res = await request(app).get('/api/coach/students/student-99/reports');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('forbidden');
  });

  test('GET /reports/:rid returns 403 when student not assigned', async () => {
    mockCurrentUser = { id: 'coach-1', stableId: 'coach-1', role: 'coach' };
    mockStudentAccessGranted = false;

    const res = await request(app).get('/api/coach/students/student-99/reports/report-1');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('forbidden');
  });

  test('POST /reports returns 403 when student not assigned', async () => {
    mockCurrentUser = { id: 'coach-1', stableId: 'coach-1', role: 'coach' };
    mockStudentAccessGranted = false;

    const res = await request(app)
      .post('/api/coach/students/student-99/reports')
      .send({ period_start: '2026-01-01', period_end: '2026-01-31' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('forbidden');
  });
});
```

- [ ] **Step 7: Run all affected tests**

Run: `npx jest server/auth/__tests__/requireStudentAssignment server/routes/__tests__/coachStudents server/routes/__tests__/prepBriefs server/routes/__tests__/reports --verbose`

Expected: All tests PASS

- [ ] **Step 8: Commit**

```bash
git add server/routes/coachStudents.js server/routes/prepBriefs.js server/routes/reports.js server/routes/__tests__/coachStudents.test.js server/routes/__tests__/prepBriefs.test.js server/routes/__tests__/reports.test.js
git commit -m "fix(auth): wire requireStudentAssignment to prep-brief + reports routes (C-2)"
```

---

## Task 4: W-1 — Add UUID Validation to Staking Settlement Approve/Reject

**Files:**
- Modify: `server/routes/staking.js:366-427`

- [ ] **Step 1: Add UUID validation to both handlers**

In `server/routes/staking.js`, add a UUID regex constant near the top (after the `uid` helper, around line 20):

```js
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
```

Then add validation at the top of both handlers.

For `PATCH /settlements/:id/approve` (line 367), add after the opening `try {`:

```js
router.patch('/settlements/:id/approve', async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) {
      return res.status(400).json({ error: 'invalid_id', message: 'The provided ID is not valid.' });
    }
    const settlement = await Repo.findSettlementById(req.params.id);
    // ... rest unchanged
```

For `PATCH /settlements/:id/reject` (line 408), same pattern:

```js
router.patch('/settlements/:id/reject', async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) {
      return res.status(400).json({ error: 'invalid_id', message: 'The provided ID is not valid.' });
    }
    const settlement = await Repo.findSettlementById(req.params.id);
    // ... rest unchanged
```

- [ ] **Step 2: Run existing staking tests (if any) to verify no regressions**

Run: `npx jest server/routes/__tests__/staking --verbose 2>&1 || echo "No staking tests found"`

Expected: Either passes or no test file exists (the spec noted no test coverage for these endpoints).

- [ ] **Step 3: Commit**

```bash
git add server/routes/staking.js
git commit -m "fix(staking): validate UUID params in settlement approve/reject (W-1)"
```

---

## Task 5: W-2 — Delete `/api/admin/alerts` Route + Update Frontend Callers

**Files:**
- Modify: `server/routes/alerts.js:65-92`
- Modify: `client/src/pages/LobbyPage.jsx:823`
- Modify: `client/src/pages/admin/PlayerCRM.jsx:2487`
- Modify: `client/src/__tests__/LobbyPage.test.jsx:60`

- [ ] **Step 1: Delete the duplicate route from alerts.js**

In `server/routes/alerts.js`, delete lines 65-92 (the comment block and the entire `app.get('/api/admin/alerts', ...)` handler).

- [ ] **Step 2: Update LobbyPage.jsx — change alert fetch URL**

In `client/src/pages/LobbyPage.jsx`, change line 823:

```js
// Before:
    apiFetch('/api/admin/alerts')
// After:
    apiFetch('/api/coach/alerts')
```

- [ ] **Step 3: Update PlayerCRM.jsx — change alert fetch URL**

In `client/src/pages/admin/PlayerCRM.jsx`, change line 2487:

```js
// Before:
    apiFetch('/api/admin/alerts')
// After:
    apiFetch('/api/coach/alerts')
```

- [ ] **Step 4: Update LobbyPage.test.jsx — change mock URL**

In `client/src/__tests__/LobbyPage.test.jsx`, change line 60:

```js
// Before:
  if (path === '/api/admin/alerts')    return Promise.resolve({ alerts: [] });
// After:
  if (path === '/api/coach/alerts')    return Promise.resolve({ alerts: [] });
```

- [ ] **Step 5: Run tests**

Run: `npx jest server/routes/__tests__/alerts --verbose` and `npx vitest run client/src/__tests__/LobbyPage.test.jsx`

Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add server/routes/alerts.js client/src/pages/LobbyPage.jsx client/src/pages/admin/PlayerCRM.jsx client/src/__tests__/LobbyPage.test.jsx
git commit -m "fix(alerts): remove duplicate /api/admin/alerts route, use /api/coach/alerts (W-2)"
```

---

## Task 6: W-3 — Fix Leaderboard Rank `findIndex` in LobbyPage + MainLobby

**Files:**
- Modify: `client/src/pages/LobbyPage.jsx:815`
- Modify: `client/src/pages/MainLobby.jsx:369`

The `findIndex` predicate uses `p.stable_id` and `p.id` but the API returns `p.stableId` (camelCase). The rank badge never shows. Note: `LeaderboardPage.jsx` is fine — it uses `idx + 1` from the map loop.

- [ ] **Step 1: Fix LobbyPage.jsx findIndex**

In `client/src/pages/LobbyPage.jsx`, change line 815:

```js
// Before:
        const pos = sorted.findIndex((p) => p.stable_id === userId || p.id === userId);
// After:
        const pos = sorted.findIndex((p) => p.stableId === userId || p.stable_id === userId || p.id === userId);
```

- [ ] **Step 2: Fix MainLobby.jsx findIndex**

In `client/src/pages/MainLobby.jsx`, change line 369:

```js
// Before:
        const pos = sorted.findIndex((p) => p.stable_id === userId || p.id === userId);
// After:
        const pos = sorted.findIndex((p) => p.stableId === userId || p.stable_id === userId || p.id === userId);
```

- [ ] **Step 3: Run client tests**

Run: `npx vitest run client/src/__tests__/LobbyPage.test.jsx`

Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/LobbyPage.jsx client/src/pages/MainLobby.jsx
git commit -m "fix(leaderboard): add stableId to findIndex predicate for rank display (W-3)"
```

---

## Task 7: W-4 — Fix trialStatus Gaps (Backend + Frontend)

**Files:**
- Modify: `server/routes/auth.js:117-124` (login handler)
- Modify: `server/routes/auth.js:247-263` (profile handler)
- Modify: `client/src/pages/LobbyPage.jsx:785`
- Modify: `client/src/pages/MainLobby.jsx:337`

Three gaps to close: login/register conditionally omits trialStatus, profile endpoint never returns it, and two frontend pages bypass AuthContext's `isTrial`.

- [ ] **Step 1: Fix login handler — always return trialStatus**

In `server/routes/auth.js`, change lines 119-124:

```js
// Before:
    const jwtPayload = { stableId, name: entry.name, role: entry.role };
    if (trialStatus) jwtPayload.trialStatus = trialStatus;

    const token = JwtService.sign(jwtPayload);
    log.info('auth', 'login_ok', `${entry.name} logged in`, { name: entry.name, role: entry.role, playerId: stableId });
    res.json({ stableId, name: entry.name, role: entry.role, ...(trialStatus && { trialStatus }), token });

// After:
    const jwtPayload = { stableId, name: entry.name, role: entry.role, trialStatus: trialStatus || null };

    const token = JwtService.sign(jwtPayload);
    log.info('auth', 'login_ok', `${entry.name} logged in`, { name: entry.name, role: entry.role, playerId: stableId });
    res.json({ stableId, name: entry.name, role: entry.role, trialStatus: trialStatus || null, token });
```

- [ ] **Step 2: Fix profile endpoint — add trialStatus**

In `server/routes/auth.js`, change the profile handler (lines 247-263):

```js
  app.get('/api/auth/profile', requireAuth, async (req, res) => {
    const { findById } = require('../db/repositories/PlayerRepository');
    try {
      const player = await findById(req.user.stableId);
      if (!player) return res.status(404).json({ error: 'not_found', message: 'Player not found.' });
      return res.json({
        id:           player.id,
        display_name: player.display_name,
        email:        player.email ?? null,
        role:         req.user.role ?? null,
        school_id:    player.school_id ?? null,
        trialStatus:  computeTrialStatus(player),
      });
    } catch (err) {
      log.error('auth', 'profile_get_error', err.message, { err });
      return res.status(500).json({ error: 'internal_error', message: 'Failed to load profile.' });
    }
  });
```

The only change is adding `trialStatus: computeTrialStatus(player),` to the response object. `computeTrialStatus` is already defined at the top of the file (line 14).

- [ ] **Step 3: Fix LobbyPage.jsx — use AuthContext isTrial**

In `client/src/pages/LobbyPage.jsx`, change line 785:

```js
// Before:
  const isTrial   = role === 'trial';
// After:
  const isTrial   = role === 'trial' || user?.trialStatus === 'active';
```

Note: We don't import `isTrial` from AuthContext because this file destructures `user` and `role` directly from `useAuth()`. Duplicating the check here is cleaner than refactoring the destructuring pattern. The check matches AuthContext's logic exactly.

- [ ] **Step 4: Fix MainLobby.jsx — use same pattern**

In `client/src/pages/MainLobby.jsx`, change line 337:

```js
// Before:
  const isTrial = user?.role === 'trial';
// After:
  const isTrial = user?.role === 'trial' || user?.trialStatus === 'active';
```

- [ ] **Step 5: Also fix the tab definition references in LobbyPage.jsx**

Check that lines 714 and 719 (which also reference `role === 'trial'` for tab definitions and table filtering) also use `isTrial` instead. In `client/src/pages/LobbyPage.jsx`, change lines 712-720:

```js
// Before:
  const tabDefs = (role === 'coach' || role === 'admin' || role === 'superadmin')
    ? COACH_TABLE_TABS
    : role === 'trial'
      ? TRIAL_TABLE_TABS
      : STUDENT_TABLE_TABS;

  const showController = role === 'coach' || role === 'admin' || role === 'superadmin';
  const baseTables = role === 'trial'
    ? tables.filter((t) => t.privacy === 'open' || t.privacy == null)
    : tables;

// After:
  const tabDefs = (role === 'coach' || role === 'admin' || role === 'superadmin')
    ? COACH_TABLE_TABS
    : isTrial
      ? TRIAL_TABLE_TABS
      : STUDENT_TABLE_TABS;

  const showController = role === 'coach' || role === 'admin' || role === 'superadmin';
  const baseTables = isTrial
    ? tables.filter((t) => t.privacy === 'open' || t.privacy == null)
    : tables;
```

Note: `isTrial` is defined later at line 785. Move the `isTrial` definition up to before line 712 (right after the existing `role` destructuring). The line should go near the other role checks.

- [ ] **Step 6: Run tests**

Run: `npx jest server/routes/__tests__/auth --verbose` and `npx vitest run client/src/__tests__/LobbyPage.test.jsx`

Expected: All pass

- [ ] **Step 7: Commit**

```bash
git add server/routes/auth.js client/src/pages/LobbyPage.jsx client/src/pages/MainLobby.jsx
git commit -m "fix(auth): always return trialStatus in login/profile, fix frontend trial checks (W-4)"
```

---

## Task 8: Verify — Run Full Test Suite

- [ ] **Step 1: Run all server tests**

Run: `npx jest --verbose 2>&1 | tail -30`

Expected: All tests pass. Zero failures introduced.

- [ ] **Step 2: Run all client tests**

Run: `cd client && npx vitest run 2>&1 | tail -30`

Expected: All tests pass.

- [ ] **Step 3: If any failures, fix them before proceeding**

Any test failure here is a regression from our changes — investigate and fix before declaring done.
