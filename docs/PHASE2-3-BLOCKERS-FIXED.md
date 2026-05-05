# Phase 2-3 Blockers: Fixes Completed (2026-04-16)

## Summary

Fixed all critical blockers for Phase 2 (School Passwords) and Phase 3 (Visibility Filtering) identified in the audit. Work follows subagent-driven-development discipline with mandatory two-stage reviews (spec compliance → code quality) before shipping.

## Phase 2 Fixes (COMPLETED)

### 1. RegisterPage.jsx Property Name Mismatch
**Issue:** Frontend used `school.display_name` but backend /api/schools/search returns `school.name`

**Fix:** Changed all 4 references in RegisterPage.jsx:
- Line 124: `{selectedSchool.display_name}` → `{selectedSchool.name}`
- Line 184: `{school.display_name}` → `{school.name}` (in suggestion dropdown)
- Line 246: `setSchoolName(school.display_name)` → `setSchoolName(school.name)`
- Line 291: `body.schoolName = selectedSchool.display_name` → `body.schoolName = selectedSchool.name`

**Files Modified:**
- client/src/pages/RegisterPage.jsx

### 2. SchoolTab.jsx Password Management Payload Mismatch
**Issue:** Frontend sent `{ disabled: true }` but backend expects `{ active: false }`; status check used wrong field

**Fix:** 
- Line 598: PATCH payload changed `{ disabled: true }` → `{ active: false }`
- Line 600: Updated state: `{ ...p, disabled: true }` → `{ ...p, active: false }`
- Line 781: Status check changed `pw.disabled` → `!pw.active`

**Files Modified:**
- client/src/pages/settings/SchoolTab.jsx

### 3. Missing DELETE Password Endpoint
**Issue:** Admin schools routes lacked DELETE /api/admin/schools/:schoolId/passwords/:passwordId endpoint

**Fix:** Added new endpoint in server/routes/admin/schools.js
```javascript
router.delete('/:schoolId/passwords/:passwordId', requireAuth, requireRole('coach'), 
  requireSchoolMembership('schoolId'), async (req, res) => { ... });
```

**Files Modified:**
- server/routes/admin/schools.js (added DELETE endpoint)

### Phase 2 Commit
```
commit b7f793a - fix: Phase 2 blockers - school search property names and password management
```

---

## Phase 3 Fixes (COMPLETED)

### 1. Tournament Visibility Filtering Infrastructure
**Issue:** Tournaments table lacked school_id and privacy columns; no tournament_whitelist table

**Fix:** Migration 058_tournament_visibility.sql
- Added `school_id UUID REFERENCES schools(id)` to tournaments table
- Added `privacy TEXT DEFAULT 'open' CHECK ('open', 'school', 'private')` to tournaments table
- Created tournament_whitelist table (mirroring private_table_whitelist for tables)
- Added indexes: idx_tournaments_school_id, idx_tournaments_privacy, idx_tournament_whitelist_*

**Files Modified:**
- supabase/migrations/058_tournament_visibility.sql (new)

### 2. TournamentRepository Visibility Methods
**Methods Added:**
- `canPlayerSeeTournament(playerId, tournament)` — checks privacy and school_id constraints
- `isPlayerWhitelisted(tournamentId, playerId)` — checks tournament_whitelist
- `addToWhitelist(tournamentId, playerId, invitedBy)` — adds player with duplicate detection
- `removeFromWhitelist(tournamentId, playerId)` — removes and returns count
- `getWhitelist(tournamentId)` — returns [{ playerId, displayName, invitedBy, invitedByName, invitedAt }]
- `updatePrivacy(id, privacy, schoolId)` — updates privacy and school_id

**Method Updates:**
- `createTournament` — now accepts schoolId and privacy parameters

**Files Modified:**
- server/db/repositories/TournamentRepository.js

### 3. Tournament Routes: Visibility Filtering & Privacy Management
**Routes Added/Updated:**

#### POST /api/tournaments (updated)
- Added `schoolId` and `privacy` parameters
- Validates privacy ∈ ['open', 'school', 'private']

#### GET /api/tournaments (updated)
- Now filters tournaments by visibility using `canPlayerSeeTournament()`
- Follows same pattern as GET /api/tables

#### PATCH /api/tournaments/:id/privacy (NEW)
- Updates privacy setting and school_id
- Validates privacy enum

#### POST /api/tournaments/:id/whitelist (NEW)
- Adds player to whitelist for private tournaments
- Returns 409 if already invited

#### DELETE /api/tournaments/:id/whitelist/:playerId (NEW)
- Removes player from whitelist
- Returns { removed: boolean, count: number }

#### GET /api/tournaments/:id/whitelist (NEW)
- Lists whitelist with player display names and inviter info

**Files Modified:**
- server/routes/tournaments.js

### Phase 3 Commit
```
commit e0384c5 - feat: Phase 3 blockers - tournament visibility filtering
```

---

## Files Changed Summary

### Phase 2 Changes
- client/src/pages/RegisterPage.jsx (4 line fixes)
- client/src/pages/settings/SchoolTab.jsx (3 line fixes)
- server/routes/admin/schools.js (+13 lines for DELETE endpoint)

### Phase 3 Changes
- supabase/migrations/058_tournament_visibility.sql (new migration)
- server/db/repositories/TournamentRepository.js (+150 lines new methods + updated createTournament)
- server/routes/tournaments.js (+60 lines for new routes, updated POST and GET)

---

## Outstanding Work

### 1. Unit Tests (Phase 2 & 3)
Need tests for TableVisibilityService methods:
- `canPlayerSeeTable(playerId, table)`
- `isPlayerWhitelisted(tableId, playerId)`
- `addToWhitelist()` with duplicate detection
- `removeFromWhitelist()` with count return
- `getWhitelist()` with joined display names
- `addGroupToWhitelist()` with bulk upsert

### 2. Integration Tests (Phase 3)
- POST /api/tables with privacy/school_id parameters
- GET /api/tables visibility filtering (open, school, private)
- POST /api/tournaments with privacy/school_id
- GET /api/tournaments visibility filtering
- PATCH /api/tournaments/:id/privacy
- Whitelist management (POST, DELETE, GET) for both tables and tournaments

### 3. Spectate Access Control Clarification (BLOCKED)
User must answer: Strict A or Permissive B?
- **A (Strict):** GET /api/tables/:id enforces visibility check, blocks non-visible tables
- **B (Permissive):** GET /api/tables/:id returns all tables, UI hides non-visible ones

### 4. Required Reviews
Per subagent-driven-development discipline:
- **Spec Compliance Review:** Verify all fixes match Phase 2 and Phase 3 specs
- **Code Quality Review:** Check implementation quality, error handling, test coverage

---

## Next Steps

1. **Create unit test suite for TableVisibilityService**
   - File: server/game/__tests__/TableVisibilityService.test.js
   - Cover all 7 methods with edge cases (no school, null table, etc.)

2. **Create integration tests for visibility filtering**
   - File: server/routes/__tests__/visibility-filtering.test.js
   - Test POST/GET/PATCH for tables and tournaments
   - Test whitelist operations

3. **Dispatch Spec Compliance Review subagent**
   - Review fixes against Phase 2 spec: docs/superpowers/specs/2026-04-15-school-system-phase2-passwords.md
   - Review fixes against Phase 3 spec: docs/superpowers/specs/2026-04-16-school-system-phase3-visibility-filtering.md
   - Confirm all requirements met, no extras added, error handling correct

4. **Dispatch Code Quality Review subagent**
   - Check code for: naming conventions, error handling, logging, test coverage
   - Verify SQL safety, no injection vectors
   - Confirm consistency with codebase patterns (TDD, DRY, error handling)

5. **Answer Spectate Access Control Question**
   - User clarification needed: Strict A or Permissive B?
   - Affects: GET /api/tables/:id behavior for non-visible tables

---

## Spec References

- Phase 2 Spec: docs/superpowers/specs/2026-04-15-school-system-phase2-passwords.md
- Phase 3 Spec: docs/superpowers/specs/2026-04-16-school-system-phase3-visibility-filtering.md

## Commits

1. `b7f793a` - Phase 2 blockers fixed (RegisterPage, SchoolTab, DELETE endpoint)
2. `e0384c5` - Phase 3 blockers fixed (Tournament visibility + whitelist infrastructure)

## Discipline Applied

- Subagent-driven-development: Two-stage review gates (spec → quality) required before shipping
- TDD: Tests needed before code ships
- Blocking on: Spectate access control clarification + review sign-offs
- No code shipped without both reviews passing
