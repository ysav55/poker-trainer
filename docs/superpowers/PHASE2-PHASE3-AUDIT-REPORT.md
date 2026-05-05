# School System Phase 2–3 Audit Report

**Date:** 2026-04-16  
**Status:** ⚠️ **CRITICAL — 9 BLOCKERS ACROSS BOTH PHASES**  
**Auditor Notes:** Tasks 1–13 claimed complete without proper spec compliance + code quality review gates. This audit reveals why **subagent-driven-development discipline is non-negotiable**.

---

## TL;DR

- **Phase 2 (Passwords):** ~85% done. 5 critical bugs + 2 minor issues block shipping.
- **Phase 3 (Visibility):** ~70% done. 4 critical bugs, tournament implementation missing, test coverage gaps.
- **Root cause:** Tasks 1–13 executed without two-stage reviews (spec compliance → code quality). Task 14 (with proper reviews) revealed bugs immediately; Tasks 1–13 shipped bugs silently.
- **Path forward:** Fix 9 blockers, add 15+ missing tests, re-audit Phase 2+3, then continue Tasks 15–19 with **mandatory subagent-driven-development gates**.

---

## Context Map — Where Everything Lives

### Specifications
- **Phase 2 (Passwords):** `docs/superpowers/specs/2026-04-16-school-system-phase2-passwords.md` (534 lines)
- **Phase 3 (Visibility):** `docs/superpowers/specs/2026-04-16-school-system-phase3-visibility-filtering.md` (707 lines)

### Database Migrations
- **Phase 2:** `supabase/migrations/045_school_passwords.sql` (102 lines) — ⚠️ **Missing RPC function**
- **Phase 3:** `supabase/migrations/057_visibility_filtering.sql` (21 lines) — ✅ Schema correct

### Backend Services
- **Phase 2:** `server/services/SchoolPasswordService.js` (353 lines) — ⚠️ **Filtering bug**
- **Phase 3:** `server/services/TableVisibilityService.js` (264 lines) — ⚠️ **Table name mismatch**

### Backend Routes
- **Auth & Schools:** `server/routes/auth.js` (400+ lines) — ⚠️ **Property name mismatch**
- **Admin Passwords:** `server/routes/admin/schools.js` (350+ lines) — ❌ **Missing DELETE endpoint**
- **Tables & Whitelist:** `server/routes/tables.js` (448 lines) — ✅ Mostly correct (Task 14 verified)
- **Tournaments:** `server/routes/tournaments.js` (274 lines) — ❌ **Completely missing visibility filtering**

### Frontend
- **Registration:** `client/src/pages/RegisterPage.jsx` (450+ lines) — ⚠️ **Property mismatch**
- **School Settings:** `client/src/pages/settings/SchoolTab.jsx` (850+ lines) — ⚠️ **Wrong field names**

### Tests
- **Phase 2 Service:** `server/services/__tests__/SchoolPasswordService.test.js` — ⚠️ **Incomplete (placeholders)**
- **Phase 3 Service:** ❌ **No tests found for TableVisibilityService**
- **Auth Routes:** `server/routes/__tests__/auth.test.js` — ⚠️ **Partial coverage**
- **Tables Routes:** `server/routes/__tests__/tables.test.js` — ⚠️ **Missing privacy tests**
- **Privacy Routes:** `server/routes/__tests__/tablesPrivacy.test.js` — ✅ **Strong (Task 14 verified)**

---

## What Was Done (Implementation Status)

### Phase 2: School Passwords

| Component | Status | Notes |
|-----------|--------|-------|
| Migration 045 | ⚠️ Partial | Tables created; **missing RPC function + index** |
| SchoolPasswordService | ⚠️ Partial | All methods present; **filtering logic flaw** |
| Auth routes | ⚠️ Partial | Enhanced POST /api/auth/register; **property mismatch** |
| Admin password routes | ⚠️ Partial | POST/GET/PATCH exist; **DELETE missing** |
| RegisterPage.jsx | ⚠️ Partial | School autocomplete works; **uses wrong field name** |
| SchoolTab.jsx | ⚠️ Partial | Passwords section present; **disable button broken** |
| Tests | ⚠️ Weak | Unit tests are placeholders; missing integration tests |

### Phase 3: Visibility Filtering

| Component | Status | Notes |
|-----------|--------|-------|
| Migration 057 | ✅ Complete | Schema correct (but service uses wrong table name) |
| TableVisibilityService | ⚠️ Partial | All methods present; **uses `invited_players` not `private_table_whitelist`** |
| GET /api/tables | ✅ Complete | Calls visibility filter correctly |
| POST /api/tables | ✅ Complete | Accepts privacy, validates, assigns school_id |
| PATCH /api/tables privacy | ✅ Complete | (Task 14, verified in code quality review) |
| Whitelist routes (tables) | ✅ Complete | (Task 14, verified in code quality review) |
| GET /api/tournaments | ❌ Missing | No visibility filtering applied |
| POST /api/tournaments | ❌ Missing | No privacy/school_id fields |
| Whitelist routes (tournaments) | ❌ Missing | No endpoints created |
| Tests | ⚠️ Weak | Strong privacy route tests; weak visibility logic tests; no service unit tests |

---

## Critical Blockers — Phase 2 (Must Fix)

### 🔴 Blocker 1: Missing RPC Function `increment_password_uses()`

**Location:** `supabase/migrations/045_school_passwords.sql`

**Problem:** Migration creates tables but NOT the PostgreSQL function. Service calls `.rpc('increment_password_uses', ...)` at line 216 of SchoolPasswordService.js, which will fail:
```
Error: Failed to call RPC: increment_password_uses not found
```

**Impact:** `SchoolPasswordService.recordUsage()` crashes at runtime when registering a student with a school password. Registration flow breaks.

**Fix:** Add to migration 045:
```sql
CREATE OR REPLACE FUNCTION increment_password_uses(password_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE school_passwords SET uses_count = uses_count + 1 WHERE id = password_id;
END;
$$ LANGUAGE plpgsql;
```

**Also missing:** Index on `school_password_uses(player_id)` — add to migration:
```sql
CREATE INDEX idx_password_uses_player_id ON school_password_uses(player_id);
```

---

### 🔴 Blocker 2: validatePassword() Filtering Logic Flaw

**Location:** `server/services/SchoolPasswordService.js`, lines 45–49

**Problem:** 
```javascript
const { data, error } = await supabase
  .from('school_passwords')
  .select('id, group_id, password_hash, active, uses_count, max_uses, expires_at')
  .eq('school_id', schoolId)
  .eq('active', true)  // ← FILTERS; doesn't fetch inactive passwords
  .single();
```

The `.eq('active', true)` filters before returning data. If a password is disabled (active=false), the method returns `{ valid: false, error: 'invalid_password' }` instead of `{ valid: false, error: 'password_disabled' }`. Users get vague error feedback.

**Spec Requirement:**
> A password is usable if and only if ALL three are true:
> 1. active = true
> 2. uses_count < max_uses
> 3. expires_at IS NULL OR expires_at > NOW()

**Impact:** Registration error messages are not granular. Frontend cannot tell user "your password has been disabled by the coach" vs. "password invalid".

**Fix:** Remove `.eq('active', true)`, then check all three conditions with separate error codes:
```javascript
const { data, error } = await supabase
  .from('school_passwords')
  .select('id, group_id, password_hash, active, uses_count, max_uses, expires_at')
  .eq('school_id', schoolId)
  .single();

if (error || !data) return { valid: false, error: 'invalid_password' };

// Check active FIRST
if (!data.active) return { valid: false, error: 'password_disabled' };

// Then check other conditions
if (data.expires_at && new Date(data.expires_at) <= new Date()) {
  return { valid: false, error: 'password_expired' };
}
if (data.uses_count >= data.max_uses) {
  return { valid: false, error: 'password_maxed' };
}

// Verify hash...
```

---

### 🔴 Blocker 3: Missing DELETE Endpoint for Passwords

**Location:** `server/routes/admin/schools.js`

**Problem:** Spec requires `DELETE /api/admin/schools/:schoolId/passwords/:passwordId` (line 279–287 of spec). Route does not exist.

**Routes present:**
- ✅ POST (create)
- ✅ GET (list)
- ✅ PATCH (disable)
- ❌ DELETE (missing)

**Impact:** Coaches cannot permanently delete passwords. Only `active=false` is possible.

**Fix:** Add before line 316 of admin/schools.js:
```javascript
router.delete('/:schoolId/passwords/:passwordId', 
  requireAuth, 
  requireRole('coach'), 
  requireSchoolMembership('schoolId'), 
  async (req, res) => {
    const { schoolId, passwordId } = req.params;
    try {
      const SchoolPasswordService = require('../../services/SchoolPasswordService');
      await SchoolPasswordService.deletePassword(schoolId, passwordId);
      return res.status(204).send();
    } catch (err) {
      log.error('admin', 'password_delete_error', `Failed to delete password: ${err.message}`, { err });
      return res.status(500).json({ error: 'internal_error' });
    }
  }
);
```

---

### 🔴 Blocker 4: Frontend/Backend Property Mismatch (display_name vs name)

**Location:** 
- Backend: `server/routes/auth.js` line 312 returns `{ id, name, status }`
- Frontend: `client/src/pages/RegisterPage.jsx` line 184 expects `school.display_name`

**Problem:**
```javascript
// Backend returns:
{ id: "...", name: "My Poker School", status: "active" }

// Frontend tries to access:
school.display_name  // ← UNDEFINED
```

When user selects a school (line 246 of RegisterPage.jsx):
```javascript
setSchoolName(school.display_name);  // Sets to undefined
```

On form submit (line 291), `body.schoolName = selectedSchool.display_name` sends undefined, causing registration to fail silently.

**Impact:** School autocomplete appears to work, but registration fails. Student cannot register with school password.

**Fix:** Either:
- Option A: Change RegisterPage to use `school.name` (line 184, 246)
- Option B: Change SchoolRepository.searchByName() to alias `name AS display_name` (consistent with codebase pattern of using display_name)

**Recommendation:** Option B for consistency.

---

### 🔴 Blocker 5: Disable Button Sends Wrong Field

**Location:** `client/src/pages/settings/SchoolTab.jsx`, lines 598, 600, 781

**Problem:**
- Spec requires: `PATCH /api/admin/schools/:schoolId/passwords/:passwordId` with body `{ "active": false }`
- Backend route validates (line 285): `const { active } = req.body`; expects boolean
- Frontend sends (line 598): `{ disabled: true }`

**Result:** Backend rejects request with 400 (unexpected field or type error).

**Impact:** Coach clicks "Disable" button, request fails silently, UI shows wrong state.

**Fix:** 
```javascript
// Line 598: Change from
body: JSON.stringify({ disabled: true })
// To:
body: JSON.stringify({ active: false })

// Line 600: Update state check
setPasswords(prev => prev.map(p => 
  p.id === passwordId ? { ...p, active: false } : p
));

// Line 781: Update display check
const isDisabled = !pw.active;  // Was: pw.disabled
```

---

### 🟠 Minor Issues — Phase 2

**Issue 6:** Password creation validation incomplete
- Missing: `source` max length validation (spec says max 100 chars)
- Missing: `maxUses` must be integer (currently accepts floats)

**Issue 7:** Test coverage incomplete
- Unit tests in SchoolPasswordService.test.js are mostly placeholders (lines 191–225)
- Missing integration tests for createPassword, listPasswords, disablePassword, recordUsage
- Missing error code granularity tests (password_expired, password_maxed, password_disabled)

---

## Critical Blockers — Phase 3 (Must Fix)

### 🔴 Blocker 1: Whitelist Table Name Mismatch

**Location:**
- Migration: `supabase/migrations/057_visibility_filtering.sql` creates `private_table_whitelist`
- Service: `server/services/TableVisibilityService.js` uses `invited_players` (lines 121, 143, 160, 175, 196, 249)

**Problem:** Service queries wrong table. For example, line 143:
```javascript
const { error } = await supabase
  .from('invited_players')  // ← Migration creates private_table_whitelist
  .upsert([{ table_id: tableId, player_id: playerId, invited_by: invitedBy }]);
```

**Why it "works":** `invited_players` exists from migration 015 (pre-existing table). But migration 057 creates a new table (`private_table_whitelist`) that's never used.

**Impact:** Two tables exist in the database. Service writes to `invited_players`; migration creates `private_table_whitelist` (unused). This violates the spec and creates confusion.

**Fix (pick one):**
- **Option A (recommended):** Update service to use `private_table_whitelist` everywhere (matches migration 057)
- **Option B:** Update migration 057 to reference `invited_players` instead (reuse existing table)

**Recommendation:** Option A — migration 057 is authoritative; service should match it.

---

### 🔴 Blocker 2: Tournament Visibility Filtering Completely Missing

**Location:** `server/routes/tournaments.js` (274 lines)

**Problem:** Spec Task 13 requires same visibility filtering for tournaments as tables:
- GET /api/tournaments: Apply privacy + school_id filtering
- POST /api/tournaments: Accept privacy, validate 'open' restriction, assign school_id
- PATCH /api/tournaments/:id/privacy: New route
- Whitelist endpoints: POST /api/tournaments/:id/whitelist, DELETE /api/tournaments/:id/whitelist/:playerId

**Current state:**
- ❌ GET /api/tournaments: Returns ALL tournaments (no filtering)
- ❌ POST /api/tournaments: No privacy field accepted, no school_id assigned
- ❌ No PATCH privacy route
- ❌ No whitelist routes

**Impact:** Spec Task 13 is not implemented. Tournaments are visible to all users regardless of school/privacy.

**Fix:** Apply same pattern as tables.js routes. Estimate 150–200 lines of code.

---

### 🔴 Blocker 3: No Unit Tests for TableVisibilityService

**Location:** Missing test file

**Problem:** TableVisibilityService has 7 public methods (canPlayerSeeTable, getVisibleTables, isPlayerWhitelisted, addToWhitelist, removeFromWhitelist, getWhitelist, addGroupToWhitelist). None have unit tests.

**Current state:** 
- Tests exist for routes (tablesPrivacy.test.js) which call the service
- But the service methods themselves are untested in isolation

**Impact:** Service logic bugs (e.g., the whitelis table name mismatch) are hidden by route tests.

**Fix:** Create `server/services/__tests__/TableVisibilityService.test.js` with 20+ tests:
```javascript
describe('TableVisibilityService', () => {
  describe('canPlayerSeeTable', () => {
    it('returns true for open privacy', () => { ... });
    it('returns true for school privacy when player in school', () => { ... });
    it('returns false for school privacy when player not in school', () => { ... });
    it('returns true for private when player whitelisted', () => { ... });
    it('returns false for private when player not whitelisted', () => { ... });
  });
  // ... more tests for other methods
});
```

---

### 🟠 Blocker 4: POST /api/tables Privacy Validation Not Tested

**Location:** `server/routes/__tests__/tables.test.js`

**Problem:** 
- POST /api/tables route accepts privacy, validates 'open' for non-admins, assigns school_id
- But tests (lines 1–150) do NOT cover these fields

**Current test gaps:**
- ❌ Test: Non-admin tries to create 'open' table → should return 400 `forbidden_privacy`
- ❌ Test: Admin creates 'open' table → should succeed with school_id=NULL
- ❌ Test: Coach creates 'school' table → should have school_id set to coach's school
- ❌ Test: Private table requires ≥1 whitelisted player
- ❌ Test: Group auto-add when groupId provided

**Impact:** Privacy logic is untested. A regression could break table creation privacy enforcement without triggering test failures.

**Fix:** Add 8–10 tests to tables.test.js covering privacy field, school_id assignment, and whitelist validation.

---

### 🟠 Minor Issues — Phase 3

**Issue 5:** GET /api/tables visibility filtering not explicitly tested
- Route calls TableVisibilityService.getVisibleTables(); tests don't assert the filter worked
- Missing: Test that non-school members don't see school-private tables

**Issue 6:** Spectate access control not enforced
- Spec mentions (section "Spectate Access Control") preventing coaches from spectating other schools' tables
- GET /api/tables/:id (line 170) does NOT call canPlayerSeeTable
- User can directly request GET /api/tables/:id and bypass visibility checks

**Issue 7:** Tournament whitelist references wrong table
- If service is updated to use `private_table_whitelist`, tournaments need the same whitelist schema
- But migration 057 only covers tables, not tournaments

---

## How to Proceed — Step-by-Step

### Phase 1: Fix Phase 2 Blockers (4–5 hours)

**Priority 1 (Critical):**
1. [ ] Add RPC function + missing index to migration 045
2. [ ] Fix validatePassword() filtering logic in SchoolPasswordService.js
3. [ ] Add DELETE endpoint to admin/schools.js
4. [ ] Fix property names (display_name → name) in RegisterPage.jsx
5. [ ] Fix disable button field (disabled → active) in SchoolTab.jsx

**Priority 2 (Testing):**
6. [ ] Complete unit tests for SchoolPasswordService (remove placeholders)
7. [ ] Add integration tests for POST /api/auth/register with schoolPassword
8. [ ] Add integration tests for admin password CRUD endpoints

**Phase 2 Re-audit:**
9. [ ] After fixes, re-dispatch **spec compliance reviewer** for Phase 2
10. [ ] After spec passes, dispatch **code quality reviewer**
11. [ ] After code quality passes, merge Phase 2

---

### Phase 2: Fix Phase 3 Blockers (6–8 hours)

**Priority 1 (Critical):**
1. [ ] Decide: Rewrite service to use `private_table_whitelist`, or update migration to use `invited_players`?
2. [ ] Implement tournament visibility filtering (GET, POST, privacy routes, whitelist routes)
3. [ ] Add validation to POST /api/tournaments (privacy, school_id, whitelist)

**Priority 2 (Testing):**
4. [ ] Create unit tests for TableVisibilityService (all 7 methods)
5. [ ] Add integration tests for POST /api/tables with privacy/school_id
6. [ ] Add integration tests for GET /api/tables visibility filtering
7. [ ] Add integration tests for tournament visibility

**Phase 3 Re-audit:**
8. [ ] After fixes, re-dispatch **spec compliance reviewer** for Phase 3
9. [ ] After spec passes, dispatch **code quality reviewer**
10. [ ] After code quality passes, merge Phase 3

---

### Phase 3: Continue Tasks 14+ with Proper Discipline (2 hours per task)

**Tasks 15–19 (Frontend + Tournaments):**
- **Task 15:** Update GET /api/tournaments filtering (will be quick once service is fixed)
- **Task 16:** Create PrivacyConfigModal component
- **Task 17:** Integrate into CreateTableModal
- **Task 18:** Update LobbyPage + TableCard
- **Task 19:** Spectate access control

**For EVERY task:**
1. Write failing tests (TDD)
2. Implement to pass tests
3. Dispatch **spec compliance reviewer** → verify against spec, no gaps
4. **If spec compliance passes:** Dispatch **code quality reviewer** → verify design, patterns, maintainability
5. **If code quality passes:** Mark task complete, move to next

**Do NOT proceed to next task until BOTH reviews pass.**

---

## The Subagent-Driven Development Discipline

This audit reveals why **subagent-driven-development with mandatory two-stage reviews is critical:**

### What Happened (Tasks 1–13)
1. Tasks claimed "done" ✓
2. No spec compliance review
3. No code quality review
4. Bug-ridden code merged silently
5. **9 blockers discovered in audit only because Task 14 required proper reviews**

### What Should Happen (Tasks 14+)
1. Write code (with failing tests first)
2. **Spec compliance review:** Does it match spec exactly? No gaps, no scope creep?
   - Task 14: ✅ PASS (all 3 routes correct)
3. **Code quality review:** Is it well-designed? Are error paths robust? Will it maintain?
   - Task 14: ⚠️ Had 2 bugs (duplicate detection, missing-entry detection) → Fixed → Re-reviewed → ✅ PASS
4. Mark complete only after BOTH gates pass
5. Move to next task

### Why This Matters
- **Bugs caught early:** Task 14 bugs were caught before shipping, then fixed, then verified fixed
- **Spec compliance verified:** Not assumed; confirmed by reading actual code against spec
- **Regression prevention:** Tests catch future changes that break the behavior
- **Knowledge capture:** Each review documents "what works" for future developers

### Cost vs. Benefit
- **Cost:** ~1 extra hour per task for dispatch + wait + feedback
- **Benefit:** Zero bugs shipped, 100% spec compliance, confidence in quality
- **ROI:** Shipping clean code is cheaper than fixing bugs in production

---

## Summary Table

| Phase | Component | Status | Blockers | Notes |
|-------|-----------|--------|----------|-------|
| 2 | Migration 045 | ⚠️ Partial | 2 | Missing RPC, missing index |
| 2 | SchoolPasswordService | ⚠️ Partial | 1 | Filtering logic flaw |
| 2 | Auth routes | ⚠️ Partial | 1 | Property name mismatch |
| 2 | Admin routes | ⚠️ Partial | 1 | Missing DELETE endpoint |
| 2 | RegisterPage | ⚠️ Partial | 1 | Uses wrong field name |
| 2 | SchoolTab | ⚠️ Partial | 1 | Disable button broken |
| 2 | Tests | ⚠️ Weak | — | Placeholders, missing integration tests |
| 3 | Migration 057 | ✅ Complete | — | Schema correct |
| 3 | TableVisibilityService | ⚠️ Partial | 1 | Wrong table name |
| 3 | Tables routes | ✅ Complete | — | (Task 14 verified) |
| 3 | Tournaments routes | ❌ Missing | 1 | Completely unimplemented |
| 3 | Tests | ⚠️ Weak | 1 | Missing service unit tests |
| **Total** | | | **9 Critical** | 4 Phase 2, 4 Phase 3, 1 (RPC) affects both |

---

## Questions for User

1. **Whitelist table name:** Should service be updated to use `private_table_whitelist` (migration 057), or should migration be updated to use `invited_players` (existing table)?

2. **Spectate access:** Should GET /api/tables/:id also enforce visibility checks, or only GET /api/tables (list view)?

3. **Priority:** Should we fix Phase 2 blockers first (simpler, affects registration), then Phase 3? Or work in parallel?

---

**Report prepared:** 2026-04-16  
**Next step:** Awaiting answers to 3 questions above, then proceed with fixes + re-audits.
