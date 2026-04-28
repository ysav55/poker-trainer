# Integration Bug Fixes — Design Spec

**Date:** 2026-04-10
**Source:** Integration Integrity Report (LOGIC_AUDIT.md)
**Scope:** 9 CRITICAL 500 errors + 6 WARNING missing endpoints

---

## 1. Root Cause Summary

### CRITICAL — 500 Errors

| ID | Endpoint | Root Cause |
|----|----------|------------|
| C-1 | POST /api/admin/students | `player_profiles.id` has no `DEFAULT gen_random_uuid()` and `createPlayer()` doesn't supply a UUID |
| C-2 | POST /api/auth/register | Same as C-1 |
| C-3 | POST /api/auth/register-coach | Same as C-1 |
| C-4 | GET /api/admin/groups?includeMembers=1 | Supabase select references `player_profiles.role` — column dropped in migration 043 |
| C-5 | GET /api/admin/schools | `SchoolRepository.PROFILE_COLUMNS` uses `player_roles(roles(name))` — ambiguous because `player_roles` has 2 FKs to `player_profiles` (`player_id` + `assigned_by`) |
| C-6 | GET /api/admin/players/:id/game-sessions | `CRMRepository.getPlayerGameSessions()` selects `created_at` from `session_player_stats` but column is `updated_at` |
| C-7 | GET /api/table-presets | `tables.js:191` passes `req.user.id` to query — JWT only has `stableId`, so `req.user.id` is `undefined` → Supabase can't parse `undefined` as UUID |
| C-8 | GET /api/admin/users/pending-resets | `password_reset_requests` has 2 FKs to `player_profiles` (`player_id` + `resolved_by`) — implicit join `player_profiles(display_name)` is ambiguous |
| C-9 | GET /api/players/search?q=... | Same as C-7 — `.neq('id', req.user.id)` passes `undefined` |

### WARNING — Missing Endpoints (404)

| ID | Endpoint | Status |
|----|----------|--------|
| W-1 | GET /api/admin/alerts | No handler — client calls it from CRM and LobbyPage for nav badge |
| W-2 | GET /api/coach/students/:id/playlists | No handler — student CRM playlists tab |
| W-3 | GET /api/coach/students/:id/scenario-history | No handler — student CRM scenario tab |
| W-4 | GET /api/coach/students/:id/staking | No handler — student CRM staking tab. Also missing `staking_notes` table |
| W-5 | POST /api/coach/students/:id/staking/notes | No handler + no table |
| W-6 | POST /api/logs/client-error | No handler — ErrorBoundary silently drops client JS errors |

---

## 2. Migration 050

**File:** `supabase/migrations/050_bugfix_uuid_staking_notes.sql`

### 2a. Fix player_profiles.id default

```sql
ALTER TABLE player_profiles
  ALTER COLUMN id SET DEFAULT gen_random_uuid();
```

Fixes C-1/C-2/C-3 at the DB level. The FK constraint to `auth.users` was dropped in migration 002, but the DEFAULT was never added.

### 2b. Create staking_notes table

```sql
CREATE TABLE staking_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES staking_contracts(id) ON DELETE CASCADE,
  coach_id    UUID NOT NULL REFERENCES player_profiles(id) ON DELETE RESTRICT,
  player_id   UUID NOT NULL REFERENCES player_profiles(id) ON DELETE RESTRICT,
  text        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_staking_notes_contract ON staking_notes(contract_id, created_at DESC);

ALTER TABLE staking_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_staking_notes_all"
  ON staking_notes FOR ALL TO service_role USING (true) WITH CHECK (true);
```

Required for W-4 (GET) and W-5 (POST).

---

## 3. Systemic Fix: `req.user.id` Alias

**File:** `server/auth/requireAuth.js`

The JWT payload contains `{ stableId, name, role }` — no `id` field. But ~30 route callsites use `req.user.id`, many with fallback `?? req.user.stableId` but some without (notably tables.js, players.js, crm.js).

**Fix:** After `req.user = payload`, add:

```javascript
req.user.id = req.user.stableId;
```

This aliases `id` → `stableId` at the single entry point. Zero blast radius on routes — all existing `req.user.id` and `req.user.stableId` references continue to work correctly.

Fixes C-7 and C-9. Prevents future occurrences of the same bug.

---

## 4. Surgical CRITICAL Fixes

### C-1/C-2/C-3: createPlayer() — belt-and-suspenders UUID

**File:** `server/db/repositories/PlayerRepository.js:342`

Add `id: crypto.randomUUID()` to the INSERT object so it works even before migration 050 is applied:

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

### C-4: Remove `role` from groups queries

**File:** `server/routes/admin/groups.js`

**Line 65** — remove `role` from the nested select:
```
Before: player_profiles(id, display_name, role, status)
After:  player_profiles(id, display_name, status)
```

**Line 181** — same fix:
```
Before: player_profiles(id, display_name, role, status, created_at, last_seen)
After:  player_profiles(id, display_name, status, created_at, last_seen)
```

The `role` column was dropped from `player_profiles` in migration 043 (RBAC retire legacy roles). Role data for display purposes comes from the main player list endpoint, not the groups query.

### C-5: Disambiguate SchoolRepository FK join

**File:** `server/db/repositories/SchoolRepository.js:6`

```
Before: player_roles(roles(name))
After:  player_roles!player_id(roles!role_id(name))
```

The `player_roles` table has two FKs to `player_profiles` (`player_id` and `assigned_by`). Supabase PostgREST can't resolve the implicit join — must specify which FK to follow using `!column_name` syntax. This matches the existing pattern in `CRMRepository.js:93`.

### C-6: Fix session_player_stats column name

**File:** `server/db/repositories/CRMRepository.js:263-286`

Three changes:
1. **Line 267 select:** `created_at` → `updated_at`
2. **Line 269 order:** `.order('created_at', ...)` → `.order('updated_at', ...)`
3. **Line 277 mapping:** `r.created_at` → `r.updated_at`

The `session_player_stats` table (migration 001) only has `updated_at`, not `created_at`.

### C-7: Fixed by Section 3

`req.user.id` now resolves to `req.user.stableId` via requireAuth alias.

### C-8: Disambiguate pending-resets FK join

**File:** `server/routes/admin/users.js:116`

```
Before: player_profiles(display_name)
After:  player_profiles!player_id(display_name)
```

`password_reset_requests` has two FKs to `player_profiles` (`player_id` and `resolved_by`). Same ambiguity pattern as C-5.

### C-9: Fixed by Section 3

`req.user.id` now resolves correctly.

---

## 5. New Endpoints (WARNING Fixes)

### W-1: GET /api/admin/alerts

**File:** `server/routes/alerts.js`

Add a duplicate route registration for `/api/admin/alerts` that reuses the exact same handler as `/api/coach/alerts`. Same auth: `requireAuth` + `requireRole('coach')` (admin/superadmin pass hierarchy check).

### W-2 through W-5: Coach Student Endpoints

**New file:** `server/routes/coachStudents.js`

Express router mounted at `/api/coach/students` with `requireAuth` + `requireRole('coach')`.

**Shared middleware:** `verifyStudentAccess` — confirms the `:id` param refers to a player whose `coach_id` matches the authenticated caller (or caller is admin/superadmin).

#### W-2: GET /:id/playlists

Query logic:
1. Get playlists where `created_by = coachId`
2. For each, count items from `playlist_items`
3. For each, aggregate from `drill_sessions` where student is in `opted_in_players`: sum `items_dealt`
4. Return `{ playlists: [{ id, name, total, played, correct: null }] }`

Note: `correct` is null — no per-hand correctness field exists in schema. Client handles null gracefully.

#### W-3: GET /:id/scenario-history

Query logic:
1. Query `hands` where `scenario_id IS NOT NULL`
2. Join `hand_players` on `player_id = :id`
3. Join `scenarios` for name
4. Order by `created_at DESC`, limit 50
5. Return `{ history: [{ id, hand_id, scenario_name, created_at }] }`

#### W-4: GET /:id/staking

Query logic:
1. Fetch `staking_contracts` where `player_id = :id AND coach_id = caller`
2. Aggregate `staking_sessions` by month: `SUM(buy_in)`, `SUM(cashout)`, net
3. Fetch `staking_notes` where `player_id = :id AND coach_id = caller`, ordered by `created_at DESC`
4. Return `{ contract, monthly: [{ month, buy_ins, cashouts, net }], notes: [{ id, text, created_at }] }`

#### W-5: POST /:id/staking/notes

Body: `{ text: string }`

Logic:
1. Verify active contract exists for this student-coach pair
2. Insert into `staking_notes` with `contract_id`, `coach_id`, `player_id`, `text`
3. Return `{ note: { id, text, created_at } }`

### W-6: POST /api/logs/client-error

**New file:** `server/routes/logs.js`

- **No auth required** — ErrorBoundary fires before JWT is available
- Accept `{ message, stack, componentStack, boundary }`
- Rate limit: 10 req/min per IP (via `express-rate-limit`)
- Write to existing `alpha_logs` table with `category: 'client_error'`, `event: 'react_error'`
- Return `204 No Content`

---

## 6. Route Registration

**File:** `server/index.js`

Add imports and registration:
```javascript
const coachStudentsRouter = require('./routes/coachStudents.js');
const registerLogRoutes   = require('./routes/logs.js');

// After existing route registrations:
app.use('/api/coach/students', requireAuth, requireRole('coach'), coachStudentsRouter);
registerLogRoutes(app);
```

---

## 7. Files Changed Summary

| File | Type | What |
|------|------|------|
| `supabase/migrations/050_bugfix_uuid_staking_notes.sql` | NEW | UUID default + staking_notes table |
| `server/auth/requireAuth.js` | EDIT | Add `req.user.id = req.user.stableId` alias |
| `server/db/repositories/PlayerRepository.js` | EDIT | Add `id: crypto.randomUUID()` to createPlayer |
| `server/db/repositories/SchoolRepository.js` | EDIT | Disambiguate FK in PROFILE_COLUMNS |
| `server/db/repositories/CRMRepository.js` | EDIT | Fix `created_at` → `updated_at` |
| `server/routes/admin/groups.js` | EDIT | Remove `role` from 2 select strings |
| `server/routes/admin/users.js` | EDIT | Disambiguate FK in pending-resets query |
| `server/routes/alerts.js` | EDIT | Add `/api/admin/alerts` alias route |
| `server/routes/coachStudents.js` | NEW | W-2/3/4/5 endpoints |
| `server/routes/logs.js` | NEW | W-6 client error logging |
| `server/index.js` | EDIT | Register new routes |

---

## 8. Regression Targets

These adjacent features share code paths with our changes and should be tested:

- **Login flow** — uses the same `PlayerRepository` but creates users differently; verify it still works
- **GET /api/admin/groups** (without `includeMembers`) — verify still returns groups
- **GET /api/admin/schools/:id** — uses same `SchoolRepository.getMembers()` internally
- **Existing staking routes** (`/api/staking/*`) — verify no interference from new `staking_notes` table
- **All coach alert routes** — verify the new alias doesn't shadow existing paths
- **Table create + presets flow** — verify `req.user.id` alias works end-to-end
