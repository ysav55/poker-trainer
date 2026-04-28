# School System: Phase 2 & 3 Specification Context

## Overview

You are continuing the **School System** multi-phase implementation. Phase 1 (Settings Endpoints) is complete and deployed. This prompt provides context for speccing **Phase 2 (School Passwords)** and **Phase 3 (Visibility Filtering)**.

---

## Phase 1 Summary (Complete)

**Deliverable:** `/api/settings/school/*` endpoints for coach-level customization.

**What shipped:**
- `SchoolSettingsService` — 12 methods (6 get, 6 set) with validation
- 7 routes — GET all settings, PUT per category (identity, table-defaults, staking-defaults, leaderboard, platforms, appearance, auto-pause-timeout)
- `requireSchoolMembership` middleware — gates access by school_id
- Frontend: `SchoolTab.jsx` wired to endpoints (3 new sections: Appearance, Table Defaults, Auto-Pause)
- Tests: Unit + integration coverage for validation, auth, CRUD

**Key design decision:** All settings stored in existing `settings` table (scope='school', scope_id=school_id). No new migrations.

**Reference:** `docs/superpowers/specs/2026-04-15-school-system-phase1-settings.md`

---

## Phase 2: School Passwords (Password-Protected Registration)

### User Story

Coaches want to invite students to join their school. Instead of admins manually assigning students to schools, students can self-register using a school password. Passwords can:
- Be password-protected (one per school, OR multiple with different purposes)
- Track funnel/source (e.g., "Code X = noobs, Code Y = holiday promo")
- Optionally auto-add students to a group on registration
- Have expiry rules: by date, by max uses, by manual toggle (whichever comes first)
- Never be revived—create new ones instead
- Support one user per school, but a player can have multiple users under different schools

### Scope

**In Scope:**
- New table: `school_passwords` with columns: id, school_id, password (hashed), source/funnel, max_uses, uses_count, expires_at, active, created_by, group_id (nullable), created_at
- New endpoint: `POST /api/auth/register` — enhanced registration to accept optional `school_password` parameter
- New endpoints: Admin CRUD `/api/admin/schools/:id/passwords` (create, list, update, delete)
- Frontend: Registration page updated to accept password (optional)
- Frontend: School settings page (SchoolTab) gets "Passwords" section for coach password management
- Validation: Password must exist, be active, not expired, not max-uses exceeded, not already used by this player

**Out of Scope:**
- Email-based invites (defer)
- Bulk password generation (defer)
- Password analytics dashboard (defer)
- Phase 3 visibility filtering (separate phase)

### Key Decisions Needed

**Before speccing:**
1. **Password hashing:** Use bcrypt (same as player passwords in players.csv)? Or simpler hash?
2. **Group auto-add:** Should password creation UI allow choosing a target group? Or is this phase 2 or later?
3. **Registration flow:** Should `/api/auth/register` be modified, or new endpoint `/api/auth/register-with-password`?
4. **Coach vs Admin:** Can coaches CREATE passwords (for their school)? Or admin-only? Spec says coach can manage groups, so assume coach can create passwords.
5. **Duplicate school assignment:** If player tries to register to School A with password, but already has user in School A, reject? Or allow multiple users per school per player?

### Reference Files

- Registration: `server/routes/auth.js`, `client/src/pages/RegisterPage.jsx`
- SchoolTab: `client/src/pages/settings/SchoolTab.jsx` (add Passwords section)
- Admin schools route: `server/routes/admin/schools.js`
- Password hashing: Look at `server/auth/PlayerRoster.js` for bcrypt pattern

---

## Phase 3: Visibility Filtering (School-scoped Tables/Tournaments)

### User Story

Currently, all users see all tables/tournaments. We want school isolation:
- School members see only their school's non-private tables/tournaments by default
- Only admins can create "Open" (cross-platform visible) tables/tournaments
- School members see Open tables, but with clear admin badge
- Non-members cannot see school-scoped content

### Current State

**Database:**
- Tables/tournaments already have `privacy` field: `['open', 'school', 'private']`
- Tables/tournaments don't have `school_id` FK yet

**Backend:**
- `GET /api/tables` returns ALL tables unfiltered (no privacy/school check)
- CreateTableModal lets non-admins choose 'open' (should be removed)

**Frontend:**
- LobbyPage.jsx has tabs: All, Cash, Tournament, Mine, School, Open
- Filtering is client-side only (lines 95–111 in LobbyPage.jsx)

### Scope

**In Scope:**
- Database: Add `school_id` FK to `tables` and `tournament_groups` (via migration)
- Backend: Update `GET /api/tables` and `GET /api/tournaments` to filter by school + privacy
- Backend: Validate on `POST /api/tables` — reject 'open' from non-admins, enforce school_id for coaches
- Frontend: Remove 'open' option from CreateTableModal for non-admins
- Frontend: Add privacy modal (described below) when editing table privacy
- Frontend: Default privacy to 'school' instead of 'open'
- Frontend: Add admin badge to Open tables in lobby

**Privacy Modal (Key Feature):**
When coach clicks "Edit Privacy" or switches between School/Private, show modal:
- Title: "Set Privacy"
- Tabs/buttons: "School" / "Private"
- If "Private": show student whitelist + group selector
  - Render students from school (alphabetically sorted)
  - Text filter for name search
  - Checkboxes to invite students
  - Group selector (optional): auto-add whole group
  - Edited freely: can add/remove students anytime
  - When modal closes: saves settings and applies them
- Switching between School/Private: clears whitelist (if switching FROM Private, warn before clearing)

**Out of Scope:**
- Email-based invites (defer)
- Cross-school visibility (not supported; school isolation is hard rule)
- Dynamic role-based access (defer — use simple school_id check)

### Key Decisions Needed

**Before speccing:**
1. **Table school_id assignment:** Infer from coach creating it, or explicit param? If coach creates table, set school_id = coach.school_id?
2. **Backward compat:** Existing tables have no school_id. Should they be:
   - a) Set to admin's school on migration? 
   - b) Treated as "open only"?
   - c) Left null (dangerous — invisible)?
3. **Tournament groups:** Same FK question — do they get school_id too?
4. **Private table RLS:** If table is private with whitelist, do we need RLS or check in app? (Recommend app-level for now.)
5. **Spectate access:** Can coaches spectate tables outside their school? Or block it?

### Reference Files

- Table list: `server/routes/tables.js` (GET /api/tables)
- Lobby UI: `client/src/pages/LobbyPage.jsx` (CreateTableModal, filterTables)
- CreateTableModal: `client/src/components/tables/CreateTableModal.jsx`
- Privacy modal: New component needed (scope to design)
- Tournament routes: `server/routes/tournaments.js`

---

## Critical Context

### School Architecture

- Schools are **orthogonal to admins** — schools are player-level groupings; admins are a global role
- School members: coaches + coached_students + solo_students (anyone with school_id)
- Admins: no school_id (or shared across all schools)
- One user per school, but a player can have multiple users (one per school)

### Permission Model

- Coach role: can customize settings (Phase 1), manage groups, manage passwords, create tables/tournaments (school-scoped)
- Admin role: global access, can toggle features, read any school settings, create Open tables/tournaments
- Students: can join tables in their school

### Integration Points (Phase 1 → Phase 2/3)

- Phase 1 settings (table defaults, staking defaults, etc.) used by Phase 2 (registration flow) and Phase 3 (table creation validation)
- Phase 2 passwords reference `school_id`, which drives Phase 3 visibility
- Phase 3 filtering uses `school_id` from coach creating table

---

## Spec Format

When you write specs for Phase 2 and Phase 3:

1. **Database:** List migrations needed, exact schema changes
2. **Backend:** Services, routes, validation, auth middleware
3. **Frontend:** Components, API calls, state management
4. **Auth & Permissions:** Who can do what
5. **Error Handling:** Status codes + messages
6. **Testing:** Unit + integration test coverage
7. **Definition of Done:** Checklist for shipping

See `docs/superpowers/specs/2026-04-15-school-system-phase1-settings.md` for format.

---

## Next Steps

1. **Enter brainstorming:** Use `brainstorming` skill
2. **Explore current code:** Check LobbyPage.jsx, CreateTableModal, tables route for privacy handling
3. **Answer key decisions:** Address the "Key Decisions Needed" bullets above
4. **Propose approaches:** 2–3 options per phase with trade-offs
5. **Write specs:** One per phase, saved to `docs/superpowers/specs/`
6. **Plan implementation:** Use `writing-plans` skill
7. **Execute:** Via subagent-driven-development or inline execution

---

## Files to Review Before Starting

- `docs/superpowers/specs/2026-04-15-school-system-phase1-settings.md` — reference spec format
- `client/src/pages/LobbyPage.jsx` — current lobby + table creation UI
- `server/routes/tables.js` — current table list endpoint
- `client/src/pages/RegisterPage.jsx` — current registration flow
- `server/auth/PlayerRoster.js` — password hashing pattern
- `CLAUDE.md` — global conventions (migrations, RLS, etc.)

---

## Good luck! Pick a phase to start with (recommend Phase 2 first, simpler scope).
