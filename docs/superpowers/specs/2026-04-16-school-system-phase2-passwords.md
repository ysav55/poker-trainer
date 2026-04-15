# School System Phase 2: School Passwords (Password-Protected Registration)

**Date:** 2026-04-16  
**Phase:** 2 of 3 (Settings → Passwords → Visibility Filtering)  
**Status:** Design Approved

---

## Overview

Coaches invite students to join their school via self-service registration using a school password. Passwords are single-use per player, expire by date or max-uses (whichever comes first), and optionally auto-add students to a group. Once expired, coaches create new passwords instead of reviving old ones.

**Phase 2 deliverable:** Full password lifecycle management — creation, validation, expiry, audit tracking, and registration integration.

---

## Scope

### In Scope
- New table: `school_passwords` (password storage, expiry config, usage tracking)
- New table: `school_password_uses` (audit trail, dedup checking)
- Backend validation service: `SchoolPasswordService`
- Admin CRUD endpoints under `/api/admin/schools/:id/passwords`
- Registration integration: `POST /api/auth/register` enhanced to accept optional `schoolPassword`
- **Architecture:** Remove `coachId` from registration (now redundant with school-based grouping); password-registered students assigned `solo_student` role
- Frontend: `RegisterPage.jsx` adds password field
- Frontend: `SchoolTab.jsx` gets "Passwords" section for password management
- **Critical:** Expiry policies (date-based, max-uses, manual toggle, whichever comes first)

### Out of Scope
- Email-based invites (deferred)
- Bulk password generation (deferred)
- Password analytics dashboard (deferred; basic stats only: uses_count, max_uses, daysUntilExpiry)
- Visibility filtering (Phase 3)

---

## Database

### New Tables

#### `school_passwords`
```sql
CREATE TABLE school_passwords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  password_hash VARCHAR(255) NOT NULL,
  source VARCHAR(100), -- e.g., "noobs", "holiday_promo", "spring_cohort"
  max_uses INT NOT NULL DEFAULT 999999,
  uses_count INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMP WITH TIME ZONE, -- null = never expires
  active BOOLEAN NOT NULL DEFAULT true,
  group_id UUID REFERENCES groups(id) ON DELETE SET NULL, -- optional; auto-add on register
  created_by UUID NOT NULL REFERENCES player_profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT must_have_expiry_or_max_uses 
    CHECK (expires_at IS NOT NULL OR max_uses IS NOT NULL)
);

CREATE INDEX idx_school_passwords_school_id ON school_passwords(school_id);
CREATE INDEX idx_school_passwords_active ON school_passwords(active);
```

#### `school_password_uses`
Tracks every password usage. Prevents a player from using the same password twice (dedup). Provides audit trail.
```sql
CREATE TABLE school_password_uses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  password_id UUID NOT NULL REFERENCES school_passwords(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES player_profiles(id),
  registered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(password_id, player_id) -- enforces: one use per password per player
);

CREATE INDEX idx_password_uses_password_id ON school_password_uses(password_id);
CREATE INDEX idx_password_uses_player_id ON school_password_uses(player_id);
```

---

## Expiry Policies (Critical Detail)

A password is **usable** if and only if ALL of the following are true:

1. `active = true` (coach has not manually disabled it)
2. `uses_count < max_uses` (max-uses limit not reached)
3. `expires_at IS NULL` OR `expires_at > NOW()` (date not passed)

If ANY condition is false, the password is **expired** and cannot be used.

| Policy Type | Mechanism | Example | Behavior |
|-------------|-----------|---------|----------|
| **Date-based** | `expires_at` timestamp | 2026-06-30 23:59:59 | Usable until exact moment; expired after |
| **Max-uses** | `max_uses` integer | max_uses=50 | Usable while uses_count < 50; expired when uses_count ≥ 50 |
| **Manual toggle** | `active` boolean | active=false | Expired immediately; coach can re-enable by setting active=true (no data loss) |
| **Whichever comes first** | All three checked together | All checks must pass | If date passed AND max_uses not reached, still expired |

**Never revive:** Once expired, coaches create a new password (with same source if desired). Do NOT add a "re-enable" or "extend" feature.

---

## Backend

### Service: SchoolPasswordService

File: `server/services/SchoolPasswordService.js`

```javascript
/**
 * Validate a password during registration.
 * @param {string} schoolId
 * @param {string} plainPassword - plaintext password from user input
 * @returns { valid: boolean, passwordId: uuid?, groupId: uuid?, error?: string }
 */
async validatePassword(schoolId, plainPassword) {
  // 1. Hash plainPassword with SHA256 salt
  // 2. Find password_hash match in school_passwords where school_id = schoolId
  // 3. If found, check: active=true AND uses_count < max_uses AND (expires_at IS NULL OR expires_at > NOW())
  // 4. If all checks pass: return { valid: true, passwordId, groupId }
  // 5. If any check fails: return { valid: false, error: "password_expired|password_disabled|password_maxed" }
  // 6. If not found: return { valid: false, error: "invalid_password" }
}

/**
 * Create a new password (coach-only).
 * @param {string} schoolId
 * @param {string} plainPassword
 * @param {object} config - { source?, maxUses?, expiresAt?, groupId? }
 * @returns password record (passwordHash omitted)
 */
async createPassword(schoolId, plainPassword, config) {
  // 1. Hash plainPassword with SHA256 + random salt (16 bytes)
  // 2. Validate config: source (optional, max 100 chars), maxUses (default 999999), expiresAt (optional), groupId (optional FK)
  // 3. Insert into school_passwords
  // 4. Return record WITHOUT passwordHash exposed
}

/**
 * List all passwords for a school (with stats).
 * @param {string} schoolId
 * @returns array of password records with computed stats
 */
async listPasswords(schoolId) {
  // 1. Query school_passwords where school_id = schoolId
  // 2. For each: compute daysUntilExpiry, isExpired (bool), remainingUses
  // 3. Return with stats (no passwordHash)
}

/**
 * Disable a password immediately (set active=false).
 * @param {string} schoolId
 * @param {string} passwordId
 * @returns updated record
 */
async disablePassword(schoolId, passwordId) {
  // 1. UPDATE school_passwords SET active=false WHERE id=passwordId AND school_id=schoolId
  // 2. Return updated record
}

/**
 * Get password stats (uses_count, max_uses, expires_at, active, daysUntilExpiry).
 * @param {string} schoolId
 * @param {string} passwordId
 * @returns { uses_count, max_uses, expires_at, active, daysUntilExpiry, isExpired }
 */
async getPasswordStats(schoolId, passwordId) {
  // Query and compute
}

/**
 * Record a password usage (called during registration).
 * @param {string} passwordId
 * @param {string} playerId
 * @returns true on success
 * @throws if duplicate (UNIQUE constraint)
 */
async recordUsage(passwordId, playerId) {
  // 1. INSERT into school_password_uses (password_id, player_id, registered_at=NOW())
  // 2. INCREMENT school_passwords.uses_count WHERE id=passwordId
  // 3. Return true
}
```

### Routes: `server/routes/admin/schools.js` Additions

**Auth:** All routes require `requireAuth` + `requireRole('coach')` + `requireSchoolMembership`.

#### `POST /api/admin/schools/:schoolId/passwords`
**Create a password**

**Request:**
```json
{
  "plainPassword": "spring2026",
  "source": "spring_cohort",
  "maxUses": 50,
  "expiresAt": "2026-06-30T23:59:59Z",
  "groupId": "uuid-of-cohort-a"
}
```

**Response (201):**
```json
{
  "id": "uuid",
  "schoolId": "uuid",
  "source": "spring_cohort",
  "maxUses": 50,
  "usesCount": 0,
  "expiresAt": "2026-06-30T23:59:59Z",
  "active": true,
  "groupId": "uuid",
  "createdBy": "uuid",
  "createdAt": "2026-04-16T...",
  "daysUntilExpiry": 75,
  "isExpired": false
}
```

**Errors:**
- 400: Missing plainPassword, invalid source length, maxUses ≤ 0
- 403: Not a coach or not school member
- 404: School not found

---

#### `GET /api/admin/schools/:schoolId/passwords`
**List all passwords for a school (with stats)**

**Response (200):**
```json
{
  "passwords": [
    {
      "id": "uuid",
      "source": "spring_cohort",
      "maxUses": 50,
      "usesCount": 12,
      "expiresAt": "2026-06-30T...",
      "active": true,
      "groupId": "uuid",
      "createdBy": "uuid",
      "createdAt": "2026-04-16T...",
      "daysUntilExpiry": 75,
      "isExpired": false,
      "remainingUses": 38
    },
    ...
  ]
}
```

**Errors:**
- 403: Not coach or not school member
- 404: School not found

---

#### `PATCH /api/admin/schools/:schoolId/passwords/:passwordId`
**Disable a password (set active=false)**

**Request:**
```json
{ "active": false }
```

**Response (200):** Updated password record

**Errors:**
- 400: active must be boolean
- 403: Not coach or not school member
- 404: Password or school not found

---

#### `DELETE /api/admin/schools/:schoolId/passwords/:passwordId`
**Delete (soft or hard delete per preference)**

**Response (204):** No content

**Errors:**
- 403: Not coach
- 404: Password not found

---

### Registration Integration: Enhanced `POST /api/auth/register`

**File:** `server/routes/auth.js`

**Request (NEW parameter):**
```json
{
  "name": "alice",
  "password": "secret123",
  "email": "alice@example.com",
  "schoolPassword": "spring2026 (optional, NEW)"
}
```

**Note:** `coachId` has been removed from registration. With school-based grouping, role assignment is simplified: password-registered students are `solo_student` by default. Coaches can manage coaching relationships separately (out of scope for Phase 2).

**Backend Logic:**
1. Validate name, password, email (existing validation)
2. Check if name already taken (existing)
3. **NEW:** If `schoolPassword` provided:
   a. Extract school_id from password validation context (determined by schoolPassword uniqueness — or require schoolId param? See note below)
   b. Call `SchoolPasswordService.validatePassword(schoolId, schoolPassword)`
   c. If invalid → return 400 with specific error (expired, maxed, disabled, invalid)
   d. If valid → extract groupId from password record
4. School capacity check (existing logic, updated to use schoolId from password if provided)
5. Hash user password with bcrypt (existing)
6. Create player (existing)
7. **NEW:** If valid password:
   a. Assign player to school_id from password
   b. If password.groupId not null → auto-add player to group via GroupRepository
   c. Call `SchoolPasswordService.recordUsage(passwordId, playerId)`
   d. Increment password.uses_count
8. Assign role: `solo_student` (password-registered students start as solo)
9. Return JWT + player info

**Note:** School passwords are unique per school, but not globally unique (two schools can have the same password "123456"). So we need a way to determine which school the password belongs to. Options:
- Require both `schoolId` and `schoolPassword` params (explicit)
- Search all schools for matching password (implicit, slower)
- Recommend: Add optional `schoolId` param; if omitted, search all schools (user-friendly but slower)

---

## Frontend

### Updates: `client/src/pages/RegisterPage.jsx`

Add optional password input field:
- Label: "School Password (optional)"
- Hint: "Ask your coach for a school password to join their coaching group"
- Validation: Shown only if user explicitly types
- On submit: Include `schoolPassword` in POST body if provided
- Error handling: Display specific error from server (password expired, maxed, disabled, invalid)

---

### Updates: `client/src/pages/settings/SchoolTab.jsx`

Add new "Passwords" section (similar to other sections in SchoolTab):

**UI Structure:**
- Section header: "School Passwords"
- Description: "Create passwords to invite students to your school"
- List area:
  - Each password shows: source, uses_count / max_uses, expires in N days (or "Expired"), active status
  - Disable button (icon: eye-slash or similar)
  - Delete button (icon: trash)
- Create button: Opens password form modal

**Password Form Modal:**
- Fields:
  - Plain password (text input, min 4 chars)
  - Source (text input, e.g., "Spring Cohort", optional)
  - Max Uses (number input, default 999999)
  - Expires At (date/time picker, optional)
  - Group (dropdown: "— Select Group —", list of school groups, optional)
- Validation:
  - Password required, min 4 chars
  - maxUses > 0
  - expiresAt in future (if provided)
- On submit: POST to `/api/admin/schools/:schoolId/passwords`, refresh list
- Error messages: Display from server

---

## Auth & Permissions

| Endpoint | Role | Permission |
|----------|------|-----------|
| `POST /api/admin/schools/:id/passwords` | Coach+ | `requireRole('coach')` + `requireSchoolMembership` |
| `GET /api/admin/schools/:id/passwords` | Coach+ | Same |
| `PATCH /api/admin/schools/:id/passwords/:id` | Coach+ | Same |
| `DELETE /api/admin/schools/:id/passwords/:id` | Coach+ | Same |
| `POST /api/auth/register` (with schoolPassword) | Public | No auth required (registration endpoint) |

---

## Error Handling

| HTTP | Error Code | Scenario | Message |
|------|-----------|----------|---------|
| 400 | `invalid_school_password` | Password invalid, expired, or max-uses exceeded | "Password is invalid, expired, or has reached max uses" |
| 400 | `password_already_used` | Player already used this password | "You have already registered with this password" |
| 400 | `invalid_password_format` | Password creation validation failed | "Password must be at least 4 characters" |
| 400 | `missing_field` | Required field missing in create request | "Missing required field: plainPassword" |
| 409 | `password_disabled` | Coach disabled the password | "Password is disabled" |
| 404 | `school_not_found` | School doesn't exist | "School not found" |
| 404 | `password_not_found` | Password doesn't exist | "Password not found" |
| 403 | `forbidden` | Not a coach or not school member | "You do not have permission to manage this school's passwords" |
| 500 | `internal_error` | Database error | "An error occurred while processing your request" |

---

## Testing

### Unit Tests: SchoolPasswordService

- [ ] `validatePassword`: password valid (all checks pass)
- [ ] `validatePassword`: password expired by date
- [ ] `validatePassword`: password maxed out (uses_count ≥ max_uses)
- [ ] `validatePassword`: password disabled (active=false)
- [ ] `validatePassword`: password not found
- [ ] `createPassword`: creates password with all fields
- [ ] `createPassword`: creates password with minimal fields (no source, no expiry)
- [ ] `createPassword`: validates plainPassword length (min 4)
- [ ] `createPassword`: validates maxUses > 0
- [ ] `createPassword`: hashes password securely (SHA256 + salt)
- [ ] `disablePassword`: sets active=false
- [ ] `recordUsage`: inserts into school_password_uses
- [ ] `recordUsage`: increments uses_count
- [ ] `recordUsage`: rejects duplicate (same password + player)

### Integration Tests: Routes

- [ ] Coach can create password for their school
- [ ] Coach cannot create password for another school (403)
- [ ] Student cannot create password (403)
- [ ] Coach can list passwords for their school
- [ ] Coach can disable password
- [ ] Coach can delete password
- [ ] Coach cannot manage another school's passwords (403)
- [ ] Create password validates all fields (empty source, negative maxUses, date in past)

### Integration Tests: Registration

- [ ] Register with valid schoolPassword assigns player to school + group
- [ ] Register with invalid schoolPassword returns 400
- [ ] Register with expired schoolPassword returns 400
- [ ] Register with maxed-out schoolPassword returns 400
- [ ] Register with same schoolPassword twice (same player) returns 400 on second attempt
- [ ] Register without schoolPassword works as before (no school assignment)
- [ ] Multiple players can use same password (each once per player)

### Frontend Tests: RegisterPage

- [ ] Password input field appears
- [ ] Password input is optional
- [ ] Server error displays (e.g., "Password expired")
- [ ] Successful registration with password redirects to home

### Frontend Tests: SchoolTab

- [ ] Passwords section loads
- [ ] List shows all passwords with stats
- [ ] Create button opens form modal
- [ ] Form validates: plainPassword required, maxUses > 0, expiresAt in future
- [ ] Disable button sets active=false and refreshes list
- [ ] Delete button removes password
- [ ] Error messages display on failed creation

---

## Implementation Order

1. **Database:** Create migrations for `school_passwords` and `school_password_uses`
2. **Backend Service:** `SchoolPasswordService.js` with all methods
3. **Backend Routes:** Add endpoints to `admin/schools.js`
4. **Registration Integration:** Enhance `POST /api/auth/register` to accept `schoolPassword`
5. **Tests:** Service + route integration tests
6. **Frontend:** `RegisterPage.jsx` + `SchoolTab.jsx` updates
7. **Manual QA:** Test full flow: create password → register with password → verify school/group assignment

---

## Rollout Notes

- Phase 2 is backward-compatible: existing registration flow still works (schoolPassword is optional)
- Coaches can start creating passwords immediately after Phase 1 ships
- No breaking changes to existing endpoints
- Default password max-uses is 999999 (effectively unlimited if no expiresAt)

---

## Definition of Done

- [ ] `school_passwords` and `school_password_uses` tables created via migration
- [ ] `SchoolPasswordService` passes all unit tests
- [ ] All 5 routes pass integration tests
- [ ] `POST /api/auth/register` integration with password flow works end-to-end
- [ ] `RegisterPage.jsx` wired to POST body with schoolPassword
- [ ] `SchoolTab.jsx` has working "Passwords" section (create, list, disable, delete)
- [ ] Expiry logic correct: date-based, max-uses, manual toggle (whichever comes first)
- [ ] No console errors or unhandled promise rejections
- [ ] TypeScript/linter clean
- [ ] Endpoints documented in `/docs/memory/backend.md`
