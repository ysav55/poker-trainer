# Phase 2 Critical Fixes — Continuation Handoff Prompt

## Executive Summary

You are continuing **Phase 2 critical fixes** for the Poker Trainer codebase. This is a surgical batch-by-batch refactor to fix 17 high-impact bugs blocking a live coach reveal event (tournaments + cash games).

**Current Status:** 9/15 tasks DONE. Tasks 1-6 (Batch 1, Gameplay) ✅. Tasks 7-9 (Batch 2, Auth/Access) ✅. Tasks 10-15 (Batch 3, Startup/Admin) PENDING.

**Repository:** `c:\Users\user\poker-trainer` | Branch: `feat/phase2` | Main: `master`

---

## What Was Done (Tasks 1-9)

| Task | Issue | Fix | Commit | Status |
|------|-------|-----|--------|--------|
| 1 | C-16 | TournamentController calls `_startHand()` not `gm.startGame()` directly | `0213851` + `c525489` | ✅ |
| 2 | C-15 | Betting handler extends showdown completion to `tournament` mode | `a0ccfc7` + `b5e136a` | ✅ |
| 3 | C-17 | Move player uses positional args to `addPlayer()` | `da94e37` + `7134850` | ✅ |
| 4 | C-8 | Socket listeners register reactively via state (not stale ref) | `9146199` + `f53db9a` | ✅ |
| 5 | C-9 | Admin/superadmin get coach privileges; isCoach role check expanded | `9f326b7` + `a2dd7ba` | ✅ |
| 6 | C-7 | LeaveRoom no longer clears JWT from sessionStorage | `88dfe2e` | ✅ |
| 7 | C-1 | TournamentAuth: `const query` → `let query` with reassignment | `e38757f` | ✅ |
| 8 | C-2+C-3 | Auth routes use `req.user.stableId` not `req.user.id` | `6d250e7` | ✅ |
| 9 | C-4 | AlertService filters by `coach_id` (coach sees only their students' alerts) | `e4dfadf` | ✅ |

**Key Patterns Established:**
- TDD: Write failing test → implement → run full suite → commit
- Immutable Supabase: Use `let query; query = query.eq(...)` pattern
- React state for reactivity: Use `useState` for values that drive effects, not just `useRef`
- Role arrays: `['coach', 'admin', 'superadmin']` for coach-level privileges
- stableId > id: JWT contains `stableId` (UUID), never `id`

---

## Tasks 10-15 (Batch 3) — PENDING

### Task 10: C-6 — BaselineService 3-bet calculation always 0%
**File:** `server/services/BaselineService.js` (also `ProgressReportService.js`)

**Root Cause:** The 3-bet detection query filters by `player_id`, so it only sees the focal player's actions. It looks for "this player raised after opponent's raise", but it can't see the opponent's raise.

**Fix:** Fetch ALL preflop actions (no `player_id` filter), group by hand, find first raiser, check if focal player raised after opponent raised.

**Implementation Detail:**
- Lines ~129-142 in BaselineService have a broken 3-bet block
- Same issue in ProgressReportService.js
- Fetch `hand_actions` ordered by ID (preserves action sequence)
- Group by `hand_id`, find earliest raiser by player_id
- Check if focal player's latest preflop action is a raise AND came after the opponent's first raise

**Tests:** `npx jest "BaselineService" --no-coverage --forceExit` — verify 3-bet % > 0 when player actually 3-bets

---

### Task 11: C-14 — Tournament referees constraint allows duplicate active entries
**File:** `supabase/migrations/046_fix_tournament_referees_constraint.sql`

**Root Cause:** Migration 024 enforces `UNIQUE(table_id, group_id, active)` but allows multiple active=true entries (constraint only triggers if ALL three match). Partial index needed.

**Fix:**
```sql
DROP CONSTRAINT IF EXISTS tournament_referees_table_id_group_id_active_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tournament_referees_one_active
  ON tournament_referees (table_id, group_id)
  WHERE active = true;
```

**Implementation:** Create migration file, apply it locally, verify existing tests pass

**Tests:** Verify no duplicate active entries in tournament_referees table

---

### Task 12: C-10 — StableOverviewPage still uses mock data
**File:** `client/src/pages/admin/StableOverviewPage.jsx`

**Root Cause:** Page has hardcoded `MOCK_STUDENTS`, `MOCK_GROUPS`, `MOCK_AVERAGES` constants instead of fetching from `/api/coach/reports/stable`

**Fix:**
- Add `useState` for `students`, `groups`, `summary`
- Add `useEffect` that fetches `/api/coach/reports/stable`
- Remove mock constants
- Add loading/error/empty states
- Use `useAuth()` hook to get current coach ID

**Tests:** Verify real API call is made, data renders correctly

**Note:** API endpoint may not exist yet — check if `GET /api/coach/reports/stable` is implemented in `server/routes/admin/`

---

### Task 13: C-5 — /api/settings endpoint unprotected
**File:** `server/index.js` (line ~138)

**Root Cause:** Settings router mounted without `requireAuth` middleware, exposing user data

**Fix:**
```js
// Before:
app.use('/api/settings', settingsRouter);

// After:
app.use('/api/settings', requireAuth, settingsRouter);
```

**Tests:** Verify 401 returned for unauthenticated requests to `/api/settings`

---

### Task 14: C-13 — UserManagement manually decodes JWT instead of using useAuth()
**File:** `client/src/pages/admin/UserManagement.jsx`

**Root Cause:** Uses `atob(token.split('.')[1])` to parse JWT; breaks if token structure changes or becomes invalid

**Fix:**
- Remove manual JWT decode
- Add `const { user } = useAuth(); const currentUserRole = user?.role ?? null;`
- Use `currentUserRole` for permission checks

**Tests:** Verify `currentUserRole` is correctly set; permission UI renders correctly

---

### Task 15: C-12 — TournamentLobby creates standalone socket instead of using shared one
**File:** `client/src/pages/TournamentLobby.jsx`

**Root Cause:** Page calls `io(SOCKET_URL, {...})` directly instead of using shared socket from `useTableSocket(tableId)`

**Fix:**
- Remove standalone `io()` call
- Replace with `useTableSocket(tableId, { managerMode: true })`
- Remove duplicate connection/auth logic

**Tests:** Verify socket listeners are registered once (not twice); page receives game_state events

---

## Philosophy & Approach

### 1. **Code = Truth**
- We trust the actual codebase behavior, not the spec
- Spec identifies missing features, not wrong implementations
- Each fix prioritizes: gameplay (A) → tournament (B) → coach intelligence (C) → admin/CRM (E) → staking (D)

### 2. **TDD at Every Step**
- Write failing test first
- Implement fix
- Run FULL test suite (not just the new test)
- No regressions tolerated
- Commit only when all tests pass

### 3. **Surgical Precision**
- One-line fixes remain one-line fixes
- No refactoring outside the stated fix
- No "while we're here" cleanups
- Each file has one clear responsibility

### 4. **Immutable Query Builders**
- Supabase returns new objects on `.eq()`, `.select()`, etc.
- Always use `let query; query = query.filter(...)` pattern
- Do NOT do `const query = supabase...; query.filter(...)`

### 5. **Subagent Dispatch Pattern**
Use `subagent-driven-development` skill:
- Each implementer subagent owns ONE task
- Gets spec, writes test, implements, reports
- Spec compliance review follows
- Code quality review follows
- Fix issues from both reviews
- Commit, mark done, move to next

---

## Testing Strategy

**Server:**
```bash
# Single test file
npx jest "testname" --no-coverage --forceExit

# Full suite
npx jest --no-coverage --forceExit 2>&1 | tail -5
```

**Client:**
```bash
cd client
# Single test
npx vitest run src/__tests__/filename.test.js --reporter=verbose

# Full suite
npx vitest run 2>&1 | tail -15
```

**Key Test Files to Check:**
- Server: `server/tests/` (Jest) — 2400+ tests
- Client: `client/src/__tests__/` (Vitest) — 890+ tests

---

## Memory & Documentation

**CLAUDE.md Hierarchy:**
1. `/c/Users/user/.claude/CLAUDE.md` — Global rules (understand before acting)
2. `c:\Users\user\poker-trainer\CLAUDE.md` — Project-specific (Jo's mission manifest)
3. `docs/memory/` — Auto-updated source of truth (general.md, frontend.md, backend.md, database.md)

**Critical Files:**
- `docs/superpowers/specs/2026-04-07-phase2-critical-fixes-design.md` — Full spec PDF
- `docs/superpowers/plans/2026-04-07-phase2-critical-fixes.md` — Implementation plan with code snippets

---

## Database & Schema Notes

**Key Tables:**
- `player_profiles(id, coach_id, display_name, is_bot, ...)`
- `tournament_referees(id, player_id, table_id, group_id, active)`
- `hand_actions(id, hand_id, player_id, position, action, ...)`
- `tournament_referees` constraint issue: allows dupes when `active=true` + different table_id/group_id

**Supabase Client:**
- Service role key server-side only
- Client reads via Express + JWT
- RLS policies enforce security
- Migrations are numbered sequentially (001, 002, ..., 046)

---

## Key Commits This Session

HEAD at start of this session: `ab50478` (design spec committed)

**Timeline:**
- `0213851` — Task 1 impl
- `c525489` — Task 1 cleanup
- `a0ccfc7` — Task 2 impl
- `b5e136a` — Task 2 cleanup
- `da94e37` — Task 3a impl
- `7134850` — Task 3b impl
- `9146199` — Task 4 impl
- `f53db9a` — Task 4 cleanup
- `9f326b7` — Task 5 impl
- `a2dd7ba` — Task 5 cleanup
- `88dfe2e` — Task 6 impl
- `e38757f` — Task 7 impl
- `6d250e7` — Task 8 impl
- `e4dfadf` — Task 9 impl (latest)

---

## What You'll Need

### Permissions
- Git read/write (commits, branches)
- `npx jest` / `npm test` (server tests)
- `cd client && npm test` / `npm run vitest` (client tests)
- Bash shell access
- File read/write in repo

### Skills to Use
- `subagent-driven-development` for task dispatch
- `receiving-code-review` if any review feedback seems unclear
- `systematic-debugging` if tests fail unexpectedly
- `verification-before-completion` before marking tasks done

### Tools to Use
- `Agent` (general-purpose for implementation)
- `Agent` with `subagent_type=general-purpose` for code review
- `Bash` for test runs
- `Read` / `Edit` / `Grep` / `Glob` for file ops
- `TodoWrite` to track 10-15 tasks

---

## Next Steps

1. **Read the spec:** `docs/superpowers/specs/2026-04-07-phase2-critical-fixes-design.md`
2. **Update MEMORY.md** with this entire context
3. **Dispatch Task 10** (C-6, BaselineService 3-bet): Most complex, will take longest
4. **Follow pattern:** TDD → implement → review → commit
5. **Target:** All 15 tasks done, full test suite passing, ready for `master` merge

---

## Contact & Escalation

If stuck:
1. **Read specs carefully** — they have exact code locations
2. **Check existing patterns** — grep for similar fixes
3. **Run test in isolation** first (not full suite)
4. **Re-read CLAUDE.md** — "Understand before acting" constraint
5. **Use `/triage-issue`** skill if root cause unclear

---

## Success Criteria

✅ All 15 tasks implemented and committed
✅ All server tests pass (2400+)
✅ All client tests pass (890+)
✅ No console errors or TS lint issues
✅ New APIs have auth middleware
✅ Memory files updated
✅ Ready to merge feat/phase2 → master
