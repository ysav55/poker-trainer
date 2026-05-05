# Integration Bug Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 9 CRITICAL 500 errors and implement 6 missing WARNING endpoints identified in the staging integration audit.

**Architecture:** Surgical fixes at point-of-failure for DB queries, a single-line systemic fix in requireAuth for the `req.user.id` undefined issue, one migration for UUID default + staking_notes table, and two new route files for missing endpoints.

**Tech Stack:** Node.js, Express, Supabase (PostgREST), Jest + supertest for tests.

**Spec:** `docs/superpowers/specs/2026-04-10-integration-bugfixes-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `supabase/migrations/050_bugfix_uuid_staking_notes.sql` | CREATE | Add UUID default to player_profiles.id + create staking_notes table |
| `server/auth/requireAuth.js` | EDIT | Alias `req.user.id = req.user.stableId` |
| `server/auth/__tests__/requireAuth.test.js` | EDIT | Add test for id alias |
| `server/db/repositories/PlayerRepository.js` | EDIT | Supply UUID in createPlayer INSERT |
| `server/db/repositories/SchoolRepository.js` | EDIT | Disambiguate FK in PROFILE_COLUMNS |
| `server/db/repositories/CRMRepository.js` | EDIT | Fix `created_at` → `updated_at` |
| `server/routes/admin/groups.js` | EDIT | Remove `role` from 2 select strings |
| `server/routes/admin/users.js` | EDIT | Disambiguate FK in pending-resets |
| `server/routes/alerts.js` | EDIT | Add `/api/admin/alerts` alias |
| `server/routes/coachStudents.js` | CREATE | W-2/3/4/5 endpoints |
| `server/routes/logs.js` | CREATE | W-6 client error logging |
| `server/routes/__tests__/coachStudents.test.js` | CREATE | Tests for W-2/3/4/5 |
| `server/routes/__tests__/logs.test.js` | CREATE | Tests for W-6 |
| `server/index.js` | EDIT | Register new routes |

---

### Task 1: Migration 050 — UUID default + staking_notes

**Files:**
- Create: `supabase/migrations/050_bugfix_uuid_staking_notes.sql`

- [ ] **Step 1: Write migration**

```sql
-- supabase/migrations/050_bugfix_uuid_staking_notes.sql
-- Fixes C-1/C-2/C-3 (player creation 500) and adds staking_notes for W-4/W-5.

BEGIN;

-- ── 1. Fix player_profiles.id missing DEFAULT ──────────────────────────────
-- Migration 002 dropped the FK to auth.users but never added gen_random_uuid().
-- createPlayer() and registration handlers INSERT without supplying id.

ALTER TABLE player_profiles
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- ── 2. Create staking_notes table ──────────────────────────────────────────
-- Free-form notes attached to a staking contract, written by the coach.

CREATE TABLE IF NOT EXISTS staking_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES staking_contracts(id) ON DELETE CASCADE,
  coach_id    UUID NOT NULL REFERENCES player_profiles(id) ON DELETE RESTRICT,
  player_id   UUID NOT NULL REFERENCES player_profiles(id) ON DELETE RESTRICT,
  text        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staking_notes_contract
  ON staking_notes(contract_id, created_at DESC);

ALTER TABLE staking_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_staking_notes_all"
  ON staking_notes FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
```

- [ ] **Step 2: Verify migration file exists and SQL is valid**

Run: `cat supabase/migrations/050_bugfix_uuid_staking_notes.sql | head -5`
Expected: First lines of the migration file appear.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/050_bugfix_uuid_staking_notes.sql
git commit -m "fix(db): migration 050 — UUID default on player_profiles.id + staking_notes table"
```

---

### Task 2: Systemic fix — `req.user.id` alias in requireAuth

**Files:**
- Modify: `server/auth/requireAuth.js:18-19`
- Modify: `server/auth/__tests__/requireAuth.test.js:55-65`

- [ ] **Step 1: Write failing test for the id alias**

Add this test inside the existing `describe('valid token')` block in `server/auth/__tests__/requireAuth.test.js`, after the existing `'attaches decoded payload to req.user'` test (around line 65):

```javascript
    test('aliases req.user.id to req.user.stableId', () => {
      const payload = { stableId: 'uuid-abc', name: 'Dave', role: 'coach' };
      verify.mockReturnValueOnce(payload);
      const req  = { headers: { authorization: 'Bearer token' } };
      const res  = makeRes();
      const next = jest.fn();

      requireAuth(req, res, next);

      expect(req.user.id).toBe('uuid-abc');
      expect(req.user.stableId).toBe('uuid-abc');
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest server/auth/__tests__/requireAuth.test.js --testNamePattern="aliases req.user.id" --no-coverage`
Expected: FAIL — `expect(received).toBe(expected)` because `req.user.id` is `undefined`.

- [ ] **Step 3: Implement the alias**

Edit `server/auth/requireAuth.js` — change line 18-19 from:

```javascript
  req.user = payload;
  next();
```

to:

```javascript
  req.user = payload;
  req.user.id = payload.stableId;
  next();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest server/auth/__tests__/requireAuth.test.js --no-coverage`
Expected: ALL PASS (including the new test).

- [ ] **Step 5: Also update the existing test that checks `req.user` equals payload exactly**

The test at line 64 does `expect(req.user).toEqual(payload)`. Since we now mutate the payload by adding `id`, this test needs updating. Change line 64 from:

```javascript
      expect(req.user).toEqual(payload);
```

to:

```javascript
      expect(req.user).toMatchObject(payload);
      expect(req.user.id).toBe(payload.stableId);
```

- [ ] **Step 6: Run full requireAuth test suite**

Run: `npx jest server/auth/__tests__/requireAuth.test.js --no-coverage`
Expected: ALL PASS.

- [ ] **Step 7: Commit**

```bash
git add server/auth/requireAuth.js server/auth/__tests__/requireAuth.test.js
git commit -m "fix(auth): alias req.user.id to stableId — fixes C-7, C-9 and systemic undefined"
```

---

### Task 3: Fix createPlayer UUID generation (C-1/C-2/C-3)

**Files:**
- Modify: `server/db/repositories/PlayerRepository.js:342-350`

- [ ] **Step 1: Edit createPlayer to supply UUID**

In `server/db/repositories/PlayerRepository.js`, change lines 342–350 from:

```javascript
async function createPlayer({ displayName, email, passwordHash, createdBy }) {
  const { data, error } = await supabase
    .from('player_profiles')
    .insert({ display_name: displayName, email, password_hash: passwordHash, created_by: createdBy })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}
```

to:

```javascript
async function createPlayer({ displayName, email, passwordHash, createdBy }) {
  const { data, error } = await supabase
    .from('player_profiles')
    .insert({
      id: crypto.randomUUID(),
      display_name: displayName,
      email,
      password_hash: passwordHash,
      created_by: createdBy,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}
```

- [ ] **Step 2: Verify `crypto` is available (Node 19+, or add import)**

Run: `node -e "console.log(typeof crypto.randomUUID)"` — expected: `function`.

If the project runs Node < 19, add at the top of the file: `const { randomUUID } = require('crypto');` and use `randomUUID()` instead.

- [ ] **Step 3: Run existing auth route tests to verify no regression**

Run: `npx jest server/routes/__tests__/auth.test.js --no-coverage`
Expected: ALL PASS. The mock for `createPlayer` is already in place in that test — the mock doesn't care about the implementation. This confirms the function signature hasn't changed.

- [ ] **Step 4: Commit**

```bash
git add server/db/repositories/PlayerRepository.js
git commit -m "fix(db): supply UUID in createPlayer — belt-and-suspenders for C-1/C-2/C-3"
```

---

### Task 4: Fix groups.js — remove `role` from selects (C-4)

**Files:**
- Modify: `server/routes/admin/groups.js:65`
- Modify: `server/routes/admin/groups.js:181`

- [ ] **Step 1: Fix line 65 — GET /api/admin/groups?includeMembers=1**

In `server/routes/admin/groups.js`, change line 65 from:

```javascript
          ? 'id, name, color, school_id, created_at, player_groups(player_id, player_profiles(id, display_name, role, status))'
```

to:

```javascript
          ? 'id, name, color, school_id, created_at, player_groups(player_id, player_profiles(id, display_name, status))'
```

- [ ] **Step 2: Fix line 181 — GET /api/admin/groups/:id/members**

Change line 181 from:

```javascript
      .select('added_at, player_profiles(id, display_name, role, status, created_at, last_seen)')
```

to:

```javascript
      .select('added_at, player_profiles(id, display_name, status, created_at, last_seen)')
```

- [ ] **Step 3: Run existing tests**

Run: `npx jest server/routes --no-coverage --testPathPattern="groups|crm" 2>/dev/null || echo "No group-specific tests found — OK"`
Expected: PASS or no test files found (groups tests may not exist separately).

- [ ] **Step 4: Commit**

```bash
git add server/routes/admin/groups.js
git commit -m "fix(groups): remove dropped 'role' column from Supabase selects — fixes C-4"
```

---

### Task 5: Fix SchoolRepository FK disambiguation (C-5)

**Files:**
- Modify: `server/db/repositories/SchoolRepository.js:6`

- [ ] **Step 1: Disambiguate the PROFILE_COLUMNS join**

In `server/db/repositories/SchoolRepository.js`, change line 6 from:

```javascript
const PROFILE_COLUMNS = 'id, display_name, email, status, avatar_url, school_id, player_roles(roles(name))';
```

to:

```javascript
const PROFILE_COLUMNS = 'id, display_name, email, status, avatar_url, school_id, player_roles!player_id(roles!role_id(name))';
```

The `!column_name` syntax tells Supabase PostgREST which FK to follow. Required because `player_roles` has two FKs to `player_profiles` (`player_id` and `assigned_by`), and `player_roles` has two FKs (`player_id→player_profiles` and `role_id→roles`).

- [ ] **Step 2: Run existing schools route tests**

Run: `npx jest server/routes/__tests__/schools.test.js --no-coverage`
Expected: ALL PASS. The tests mock `SchoolRepository` so they won't exercise the actual Supabase query, but they confirm the route handler logic is intact.

- [ ] **Step 3: Commit**

```bash
git add server/db/repositories/SchoolRepository.js
git commit -m "fix(schools): disambiguate player_roles FK join in SchoolRepository — fixes C-5"
```

---

### Task 6: Fix CRMRepository game-sessions column name (C-6)

**Files:**
- Modify: `server/db/repositories/CRMRepository.js:267-277`

- [ ] **Step 1: Fix select, order, and mapping**

In `server/db/repositories/CRMRepository.js`, change line 267 from:

```javascript
      .select('session_id, hands_played, hands_won, net_chips, vpip_count, pfr_count, wtsd_count, created_at, sessions(table_id, started_at, ended_at)')
```

to:

```javascript
      .select('session_id, hands_played, hands_won, net_chips, vpip_count, pfr_count, wtsd_count, updated_at, sessions(table_id, started_at, ended_at)')
```

Change line 269 from:

```javascript
      .order('created_at', { ascending: false })
```

to:

```javascript
      .order('updated_at', { ascending: false })
```

Change line 277 from:

```javascript
      started_at:   r.sessions?.started_at ?? r.created_at,
```

to:

```javascript
      started_at:   r.sessions?.started_at ?? r.updated_at,
```

- [ ] **Step 2: Run CRM route tests**

Run: `npx jest server/routes/__tests__/crm.test.js --no-coverage`
Expected: ALL PASS.

- [ ] **Step 3: Commit**

```bash
git add server/db/repositories/CRMRepository.js
git commit -m "fix(crm): created_at → updated_at in game-sessions query — fixes C-6"
```

---

### Task 7: Fix pending-resets FK disambiguation (C-8)

**Files:**
- Modify: `server/routes/admin/users.js:116`

- [ ] **Step 1: Disambiguate the join**

In `server/routes/admin/users.js`, change line 116 from:

```javascript
      .select('id, player_id, requested_at, player_profiles(display_name)')
```

to:

```javascript
      .select('id, player_id, requested_at, player_profiles!player_id(display_name)')
```

`password_reset_requests` has two FKs to `player_profiles` (`player_id` and `resolved_by`). The `!player_id` hint tells PostgREST which FK to use.

- [ ] **Step 2: Run admin users tests**

Run: `npx jest server/routes/__tests__/adminUsers.test.js server/routes/admin/__tests__/adminUsers.test.js --no-coverage 2>/dev/null`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add server/routes/admin/users.js
git commit -m "fix(users): disambiguate player_profiles FK in pending-resets query — fixes C-8"
```

---

### Task 8: Add GET /api/admin/alerts alias (W-1)

**Files:**
- Modify: `server/routes/alerts.js:33-62`

- [ ] **Step 1: Add the alias route**

In `server/routes/alerts.js`, immediately after the existing `app.get('/api/coach/alerts', ...)` block (after line 63), add a duplicate registration with the admin path. Find the closing `);` of the first route handler and add this right after it:

```javascript
  // ── GET /api/admin/alerts — alias for nav badge in CRM/Lobby ───────────────
  // Same handler as /api/coach/alerts. Admin/superadmin pass requireRole('coach')
  // via hierarchy check.
  app.get(
    '/api/admin/alerts',
    requireAuth,
    requireRole('coach'),
    async (req, res) => {
      const coachId = req.user.id ?? req.user.stableId;
      const status  = req.query.status ?? 'active';
      const limit   = Math.min(parseInt(req.query.limit) || 50, 200);

      try {
        const { data, error } = await supabase
          .from('alert_instances')
          .select('id, player_id, alert_type, severity, data, status, created_at')
          .eq('coach_id', coachId)
          .eq('status', status)
          .order('severity', { ascending: false })
          .limit(limit);

        if (error) throw error;
        return res.json({ alerts: data ?? [] });
      } catch (err) {
        return res.status(500).json({ error: 'internal_error', message: err.message });
      }
    }
  );
```

Note: This is a simplified copy without the `?generate=true` branch, since the admin badge only needs the alert list.

- [ ] **Step 2: Commit**

```bash
git add server/routes/alerts.js
git commit -m "feat(alerts): add GET /api/admin/alerts alias for nav badge — fixes W-1"
```

---

### Task 9: Create coachStudents.js — W-2/3/4/5 endpoints

**Files:**
- Create: `server/routes/coachStudents.js`

- [ ] **Step 1: Create the route file with all four endpoints**

Create `server/routes/coachStudents.js`:

```javascript
'use strict';

const express  = require('express');
const supabase = require('../db/supabase');

const router = express.Router();

// ─── Shared: verify coach has access to this student ─────────────────────────

async function verifyStudentAccess(req, res) {
  const coachId   = req.user.id ?? req.user.stableId;
  const studentId = req.params.id;
  const role      = req.user.role;

  // Admin/superadmin can access any student
  if (['admin', 'superadmin'].includes(role)) return studentId;

  const { data, error } = await supabase
    .from('player_profiles')
    .select('id')
    .eq('id', studentId)
    .eq('coach_id', coachId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    res.status(403).json({ error: 'forbidden', message: 'Student not assigned to you' });
    return null;
  }
  return studentId;
}

// ── GET /:id/playlists ──────────────────────────────────────────────────────
// Returns coach's playlists with per-student play stats.

router.get('/:id/playlists', async (req, res) => {
  try {
    const studentId = await verifyStudentAccess(req, res);
    if (!studentId) return;

    const coachId = req.user.id ?? req.user.stableId;

    // 1. Get coach's playlists
    const { data: rawPlaylists, error: plErr } = await supabase
      .from('playlists')
      .select('playlist_id, name')
      .eq('created_by', coachId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (plErr) throw plErr;
    const playlists = rawPlaylists ?? [];

    if (playlists.length === 0) return res.json({ playlists: [] });

    // 2. Count items per playlist
    const playlistIds = playlists.map(p => p.playlist_id);
    const { data: items, error: itErr } = await supabase
      .from('playlist_items')
      .select('playlist_id')
      .in('playlist_id', playlistIds);

    if (itErr) throw itErr;

    const itemCounts = {};
    for (const it of (items ?? [])) {
      itemCounts[it.playlist_id] = (itemCounts[it.playlist_id] ?? 0) + 1;
    }

    // 3. Count items dealt to this student via drill_sessions
    const { data: drills, error: drErr } = await supabase
      .from('drill_sessions')
      .select('playlist_id, items_dealt, opted_in_players')
      .in('playlist_id', playlistIds)
      .in('status', ['completed', 'active']);

    if (drErr) throw drErr;

    const playedCounts = {};
    for (const d of (drills ?? [])) {
      const optedIn = d.opted_in_players ?? [];
      if (optedIn.includes(studentId)) {
        playedCounts[d.playlist_id] = (playedCounts[d.playlist_id] ?? 0) + (d.items_dealt ?? 0);
      }
    }

    // 4. Assemble response
    const result = playlists.map(p => ({
      id:      p.playlist_id,
      name:    p.name,
      total:   itemCounts[p.playlist_id] ?? 0,
      played:  playedCounts[p.playlist_id] ?? 0,
      correct: null, // no per-hand correctness tracked in schema
    }));

    res.json({ playlists: result });
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// ── GET /:id/scenario-history ───────────────────────────────────────────────
// Returns hands where the student played a scenario, with scenario name.

router.get('/:id/scenario-history', async (req, res) => {
  try {
    const studentId = await verifyStudentAccess(req, res);
    if (!studentId) return;

    // hands joined with hand_players (filter to this student) + scenarios (for name)
    const { data, error } = await supabase
      .from('hand_players')
      .select('hand_id, hands!inner(hand_id, scenario_id, created_at, scenarios!scenario_id(id, name))')
      .eq('player_id', studentId)
      .not('hands.scenario_id', 'is', null)
      .order('hands(created_at)', { ascending: false })
      .limit(50);

    if (error) throw error;

    const history = (data ?? []).map(hp => ({
      id:            hp.hand_id,
      hand_id:       hp.hands?.hand_id ?? hp.hand_id,
      scenario_name: hp.hands?.scenarios?.name ?? null,
      created_at:    hp.hands?.created_at ?? null,
    }));

    res.json({ history });
  } catch (err) {
    // Fallback: simpler query if nested joins fail
    try {
      const studentId = req.params.id;
      const { data: hands, error: hErr } = await supabase
        .from('hands')
        .select('hand_id, scenario_id, created_at')
        .not('scenario_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(200);

      if (hErr) throw hErr;

      // Filter to hands this student was in
      const handIds = (hands ?? []).map(h => h.hand_id);
      if (handIds.length === 0) return res.json({ history: [] });

      const { data: playerHands } = await supabase
        .from('hand_players')
        .select('hand_id')
        .eq('player_id', studentId)
        .in('hand_id', handIds);

      const playerHandSet = new Set((playerHands ?? []).map(ph => ph.hand_id));

      // Get scenario names
      const scenarioIds = [...new Set((hands ?? []).map(h => h.scenario_id).filter(Boolean))];
      const { data: scenarios } = await supabase
        .from('scenarios')
        .select('id, name')
        .in('id', scenarioIds);

      const scenarioMap = {};
      for (const s of (scenarios ?? [])) scenarioMap[s.id] = s.name;

      const history = (hands ?? [])
        .filter(h => playerHandSet.has(h.hand_id))
        .slice(0, 50)
        .map(h => ({
          id:            h.hand_id,
          hand_id:       h.hand_id,
          scenario_name: scenarioMap[h.scenario_id] ?? null,
          created_at:    h.created_at,
        }));

      res.json({ history });
    } catch (fallbackErr) {
      res.status(500).json({ error: 'internal_error', message: fallbackErr.message });
    }
  }
});

// ── GET /:id/staking ────────────────────────────────────────────────────────
// Returns the staking contract, monthly breakdown, and notes for a student.

router.get('/:id/staking', async (req, res) => {
  try {
    const studentId = await verifyStudentAccess(req, res);
    if (!studentId) return;

    const coachId = req.user.id ?? req.user.stableId;

    // 1. Get active contract
    const { data: contract, error: cErr } = await supabase
      .from('staking_contracts')
      .select('*')
      .eq('player_id', studentId)
      .eq('coach_id', coachId)
      .in('status', ['active', 'paused'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cErr) throw cErr;
    if (!contract) return res.json({ contract: null, monthly: [], notes: [] });

    // 2. Aggregate monthly sessions
    const { data: sessions, error: sErr } = await supabase
      .from('staking_sessions')
      .select('session_date, buy_in, cashout')
      .eq('contract_id', contract.id)
      .neq('status', 'deleted')
      .order('session_date', { ascending: true });

    if (sErr) throw sErr;

    const monthMap = {};
    for (const s of (sessions ?? [])) {
      const month = s.session_date?.slice(0, 7); // YYYY-MM
      if (!month) continue;
      if (!monthMap[month]) monthMap[month] = { month, buy_ins: 0, cashouts: 0, net: 0 };
      const buyIn   = parseFloat(s.buy_in)   || 0;
      const cashout = parseFloat(s.cashout)   || 0;
      monthMap[month].buy_ins  += buyIn;
      monthMap[month].cashouts += cashout;
      monthMap[month].net      += cashout - buyIn;
    }
    const monthly = Object.values(monthMap);

    // 3. Fetch notes
    const { data: notes, error: nErr } = await supabase
      .from('staking_notes')
      .select('id, text, created_at')
      .eq('contract_id', contract.id)
      .order('created_at', { ascending: false });

    if (nErr) throw nErr;

    res.json({ contract, monthly, notes: notes ?? [] });
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// ── POST /:id/staking/notes ─────────────────────────────────────────────────
// Add a free-form note to the staking contract.

router.post('/:id/staking/notes', async (req, res) => {
  try {
    const studentId = await verifyStudentAccess(req, res);
    if (!studentId) return;

    const coachId = req.user.id ?? req.user.stableId;
    const { text } = req.body ?? {};

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: 'text_required', message: 'Note text is required' });
    }

    // Find active contract
    const { data: contract, error: cErr } = await supabase
      .from('staking_contracts')
      .select('id')
      .eq('player_id', studentId)
      .eq('coach_id', coachId)
      .in('status', ['active', 'paused'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cErr) throw cErr;
    if (!contract) {
      return res.status(404).json({ error: 'no_contract', message: 'No active staking contract for this student' });
    }

    const { data: note, error: nErr } = await supabase
      .from('staking_notes')
      .insert({
        contract_id: contract.id,
        coach_id:    coachId,
        player_id:   studentId,
        text:        text.trim(),
      })
      .select('id, text, created_at')
      .single();

    if (nErr) throw nErr;

    res.status(201).json({ note });
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

module.exports = router;
```

- [ ] **Step 2: Commit route file**

```bash
git add server/routes/coachStudents.js
git commit -m "feat(coach): add student playlists, scenario-history, staking endpoints — W-2/3/4/5"
```

---

### Task 10: Create logs.js — client error logging (W-6)

**Files:**
- Create: `server/routes/logs.js`

- [ ] **Step 1: Create the route file**

Create `server/routes/logs.js`:

```javascript
'use strict';

const rateLimit = require('express-rate-limit');
const supabase  = require('../db/supabase');

const clientErrorLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests' },
});

module.exports = function registerLogRoutes(app) {

  // ── POST /api/logs/client-error ───────────────────────────────────────────
  // Fire-and-forget logging for React ErrorBoundary.
  // No auth required — ErrorBoundary can't attach a JWT.
  app.post('/api/logs/client-error', clientErrorLimiter, async (req, res) => {
    try {
      const { message, stack, componentStack, boundary } = req.body ?? {};

      await supabase.from('alpha_logs').insert({
        level:    'error',
        category: 'client',
        event:    'react_error',
        message:  (message ?? 'unknown error').slice(0, 2000),
        meta: {
          stack:          (stack ?? '').slice(0, 4000),
          componentStack: (componentStack ?? '').slice(0, 2000),
          boundary:       boundary ?? 'unknown',
          userAgent:      req.headers['user-agent'] ?? null,
        },
      });
    } catch (_) {
      // Logging must never throw — swallow errors silently
    }

    res.status(204).end();
  });
};
```

- [ ] **Step 2: Commit**

```bash
git add server/routes/logs.js
git commit -m "feat(logs): add POST /api/logs/client-error for ErrorBoundary — W-6"
```

---

### Task 11: Register new routes in index.js

**Files:**
- Modify: `server/index.js:55-57` (imports) and `server/index.js:141-144` (registration)

- [ ] **Step 1: Add imports**

In `server/index.js`, after line 57 (`const { registerTournamentGroupRoutes } = ...`), add:

```javascript
const coachStudentsRouter        = require('./routes/coachStudents.js');
const registerLogRoutes          = require('./routes/logs.js');
```

- [ ] **Step 2: Add route registrations**

In `server/index.js`, after line 144 (`registerTournamentGroupRoutes(app, { requireAuth });`), add:

```javascript
app.use('/api/coach/students', requireAuth, requireRole('coach'), coachStudentsRouter);
registerLogRoutes(app);
```

- [ ] **Step 3: Commit**

```bash
git add server/index.js
git commit -m "feat(routes): register coachStudents + logs routes in server bootstrap"
```

---

### Task 12: Write tests for coachStudents routes (W-2/3/4/5)

**Files:**
- Create: `server/routes/__tests__/coachStudents.test.js`

- [ ] **Step 1: Create test file**

Create `server/routes/__tests__/coachStudents.test.js`:

```javascript
'use strict';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockChain = {
  from:       jest.fn(),
  select:     jest.fn(),
  insert:     jest.fn(),
  eq:         jest.fn(),
  neq:        jest.fn(),
  in:         jest.fn(),
  is:         jest.fn(),
  not:        jest.fn(),
  order:      jest.fn(),
  limit:      jest.fn(),
  range:      jest.fn(),
  maybeSingle: jest.fn(),
  single:     jest.fn(),
};
// Every method returns the chain for fluent calls
for (const key of Object.keys(mockChain)) {
  if (key !== 'maybeSingle' && key !== 'single') {
    mockChain[key].mockReturnValue(mockChain);
  }
}
mockChain.maybeSingle.mockResolvedValue({ data: null, error: null });
mockChain.single.mockResolvedValue({ data: null, error: null });

jest.mock('../../db/supabase.js', () => mockChain);

let mockCurrentUser = null;
jest.mock('../../auth/requireAuth.js', () =>
  jest.fn((req, res, next) => {
    if (!mockCurrentUser) return res.status(401).json({ error: 'auth_required' });
    req.user = mockCurrentUser;
    next();
  })
);

jest.mock('../../auth/requireRole.js', () =>
  jest.fn(() => (req, res, next) => next())
);

// ─── Imports ──────────────────────────────────────────────────────────────────

const express  = require('express');
const request  = require('supertest');
const requireAuth = require('../../auth/requireAuth.js');
const requireRole = require('../../auth/requireRole.js');
const router      = require('../coachStudents.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/coach/students', requireAuth, requireRole('coach'), router);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrentUser = { stableId: 'coach-1', id: 'coach-1', name: 'Coach', role: 'coach' };

  // Reset chain mock defaults
  for (const key of Object.keys(mockChain)) {
    if (typeof mockChain[key].mockReturnValue === 'function' && key !== 'maybeSingle' && key !== 'single') {
      mockChain[key].mockReturnValue(mockChain);
    }
  }
  mockChain.maybeSingle.mockResolvedValue({ data: null, error: null });
  mockChain.single.mockResolvedValue({ data: null, error: null });
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/coach/students/:id/playlists', () => {
  test('returns 403 when student is not assigned to coach', async () => {
    // verifyStudentAccess: maybeSingle returns null
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const app = buildApp();
    const res = await request(app).get('/api/coach/students/stu-1/playlists');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('forbidden');
  });

  test('returns empty playlists when coach has none', async () => {
    // verifyStudentAccess: student found
    mockChain.maybeSingle.mockResolvedValueOnce({ data: { id: 'stu-1' }, error: null });
    // playlists query: override the chain ending
    // We need to make the chain resolve with empty playlists
    // The order() at the end of the playlists query should resolve
    mockChain.order.mockResolvedValueOnce({ data: [], error: null });

    const app = buildApp();
    const res = await request(app).get('/api/coach/students/stu-1/playlists');
    expect(res.status).toBe(200);
    expect(res.body.playlists).toEqual([]);
  });
});

describe('GET /api/coach/students/:id/staking', () => {
  test('returns null contract when no active staking contract', async () => {
    // verifyStudentAccess
    mockChain.maybeSingle
      .mockResolvedValueOnce({ data: { id: 'stu-1' }, error: null })  // student check
      .mockResolvedValueOnce({ data: null, error: null });             // contract check

    const app = buildApp();
    const res = await request(app).get('/api/coach/students/stu-1/staking');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ contract: null, monthly: [], notes: [] });
  });
});

describe('POST /api/coach/students/:id/staking/notes', () => {
  test('returns 400 when text is missing', async () => {
    // verifyStudentAccess
    mockChain.maybeSingle.mockResolvedValueOnce({ data: { id: 'stu-1' }, error: null });

    const app = buildApp();
    const res = await request(app)
      .post('/api/coach/students/stu-1/staking/notes')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('text_required');
  });

  test('returns 404 when no active contract', async () => {
    // verifyStudentAccess
    mockChain.maybeSingle
      .mockResolvedValueOnce({ data: { id: 'stu-1' }, error: null })  // student check
      .mockResolvedValueOnce({ data: null, error: null });             // contract check

    const app = buildApp();
    const res = await request(app)
      .post('/api/coach/students/stu-1/staking/notes')
      .send({ text: 'Great session!' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('no_contract');
  });
});

describe('admin bypass', () => {
  test('admin can access any student without coach_id match', async () => {
    mockCurrentUser = { stableId: 'admin-1', id: 'admin-1', name: 'Admin', role: 'admin' };
    // playlists query returns empty
    mockChain.order.mockResolvedValueOnce({ data: [], error: null });

    const app = buildApp();
    const res = await request(app).get('/api/coach/students/any-student/playlists');
    // admin skips verifyStudentAccess DB check
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx jest server/routes/__tests__/coachStudents.test.js --no-coverage`
Expected: ALL PASS.

- [ ] **Step 3: Commit**

```bash
git add server/routes/__tests__/coachStudents.test.js
git commit -m "test(coach): add unit tests for coachStudents endpoints"
```

---

### Task 13: Write tests for logs route (W-6)

**Files:**
- Create: `server/routes/__tests__/logs.test.js`

- [ ] **Step 1: Create test file**

Create `server/routes/__tests__/logs.test.js`:

```javascript
'use strict';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockInsert = jest.fn().mockResolvedValue({ error: null });
jest.mock('../../db/supabase.js', () => ({
  from: jest.fn(() => ({ insert: mockInsert })),
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

const express            = require('express');
const request            = require('supertest');
const registerLogRoutes  = require('../logs.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  registerLogRoutes(app);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/logs/client-error', () => {
  test('returns 204 on valid error payload', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/logs/client-error')
      .send({ message: 'TypeError: x is not a function', stack: 'at foo.js:1', boundary: 'App' });
    expect(res.status).toBe(204);
  });

  test('inserts into alpha_logs with correct shape', async () => {
    const app = buildApp();
    await request(app)
      .post('/api/logs/client-error')
      .send({ message: 'fail', stack: 'stack', componentStack: 'comp', boundary: 'Root' });

    expect(mockInsert).toHaveBeenCalledTimes(1);
    const row = mockInsert.mock.calls[0][0];
    expect(row.level).toBe('error');
    expect(row.category).toBe('client');
    expect(row.event).toBe('react_error');
    expect(row.message).toBe('fail');
    expect(row.meta.boundary).toBe('Root');
  });

  test('returns 204 even when DB insert fails', async () => {
    mockInsert.mockRejectedValueOnce(new Error('db down'));
    const app = buildApp();
    const res = await request(app)
      .post('/api/logs/client-error')
      .send({ message: 'err' });
    expect(res.status).toBe(204);
  });

  test('does not require authentication', async () => {
    const app = buildApp();
    // No auth header — should still succeed
    const res = await request(app)
      .post('/api/logs/client-error')
      .send({ message: 'crash' });
    expect(res.status).toBe(204);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx jest server/routes/__tests__/logs.test.js --no-coverage`
Expected: ALL PASS.

- [ ] **Step 3: Commit**

```bash
git add server/routes/__tests__/logs.test.js
git commit -m "test(logs): add unit tests for client error logging endpoint"
```

---

### Task 14: Final verification — run full test suite

**Files:** None (verification only)

- [ ] **Step 1: Run the complete server test suite**

Run: `npx jest server/ --no-coverage --forceExit 2>&1 | tail -20`
Expected: All tests pass. Note any failures — they may be pre-existing.

- [ ] **Step 2: If any NEW failures appear, fix them before proceeding**

Compare failing test names against the files we changed. Only investigate failures related to our changes.

- [ ] **Step 3: Final commit if any test fixes were needed**

```bash
git add -A
git commit -m "fix(tests): resolve test regressions from integration bugfixes"
```
