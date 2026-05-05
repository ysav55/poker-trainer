# User Management Page Redesign — Design Spec

**Date:** 2026-04-19
**Status:** Draft
**Author:** Jo + Claude
**Access:** admin, superadmin (`admin:access` + `user:manage`)

---

## 1. Problem

The current UserManagement page is a flat list with no school context. School assignment is completely missing — both UI and backend. Self-registered users land in the system with no visibility for admins to triage them. The page also has data bugs (coach shows UUID, `created_by_name` never populated, delete says "permanent" but actually archives).

## 2. Goal

Rebuild the User Management page as a **two-panel master-detail layout** that enforces the **Platform > School > Student** hierarchy. Add an intake zone for unassigned users. Fix existing data bugs. Keep the page lean — only essential information at each level.

## 3. Layout

### 3.1 Left Panel (fixed width, ~220px)

Two zones stacked vertically:

#### 3.1.1 Incoming Zone (top)

Purpose: holds self-registered users who have no school assignment, acting as an admin inbox.

- **Who appears here:** Any user where `school_id IS NULL` (regardless of role, but practically `solo_student` or `coached_student` without a school).
- **Card contents:** Display name, role, time since `created_at` (relative: "2h ago", "3d ago").
- **Badge count:** Gold counter in the zone header. Always visible even if zone is collapsed.
- **Staleness:** Cards older than 7 days get a subtle red-tinted border as a nudge.
- **Click a card:** Opens the full detail drawer on the right, with "Assign to School" as a prominent action in the Role & School section.
- **Bulk action:** "Assign All to School" dropdown at the bottom of the zone — picks a school, assigns all incoming users to it in one API call.
- **Empty state:** Zone collapses to a single line: "No pending users" with a green check icon.
- **Data source:** Same `/api/admin/users` endpoint, filtered client-side by `school_id === null`.

#### 3.1.2 Schools List (bottom)

Purpose: navigation filter for the right panel's user table.

- **"All Users" entry:** Always first. Shows total user count. Selecting it shows all users platform-wide (no school filter).
- **School entries:** Each row shows school name + member count badge. Clicking selects that school and scopes the right panel.
- **Selected state:** Gold border/background highlight on active school.
- **Basic CRUD (inline):**
  - **Create:** "+ New School" button at bottom of list. Inline text input or minimal modal — name only. Calls existing `POST /api/admin/schools` endpoint.
  - **Rename:** Right-click or kebab menu on school entry → inline edit. Calls `PUT /api/admin/schools/:id`.
  - **Delete:** Kebab menu → confirm dialog. Only allowed if school has 0 members (or prompts to reassign first). Calls `DELETE /api/admin/schools/:id`.
- **Deep config:** Everything else (capacity, feature toggles, coach assignments) stays on the existing Settings > School page.

### 3.2 Right Panel (flex, fills remaining width)

#### 3.2.1 Header Bar

- **School name** (or "All Users" when platform-scoped) + member count subtitle.
- **Search input:** Client-side, filters on `display_name` + `email`.
- **Role dropdown filter:** All / superadmin / admin / coach / coached_student / solo_student.
- **Status dropdown filter:** Active (default) / Suspended / Archived / All.

#### 3.2.2 User Table

**4 columns:**

| Column | Content | Notes |
|--------|---------|-------|
| Name / Email | `display_name` (bold) + `email` (subtle, below) | Primary identifier |
| Role | Role name | Color-coded: gold for coach, default for students |
| Status | Badge (green/yellow/gray) | active / suspended / archived |
| Last Seen | Relative time | "2h ago", "14d ago", or "Never" |

- **Row click:** Opens detail drawer.
- **No actions column in the table.** All actions live in the detail drawer.
- **Sorting:** Default by `display_name` ascending. Column headers clickable to sort.
- **Pagination:** Client-side, 15 per page. Prev/Next at bottom.

#### 3.2.3 Footer Bar

- Left: "X of Y members shown" + page indicator.
- Right: "+ Add User" button (opens UserForm modal for creation) + "Export CSV" button.

### 3.3 Detail Drawer (right slide-in)

Opens when clicking a user row or an incoming user card. Slides in from the right, overlaying the table. Does not navigate away.

**3 collapsible sections, lazy-rendered (section content only mounts when expanded):**

#### Section 1: Profile (open by default)

- Initials avatar (or uploaded avatar if exists)
- Display name (editable inline or via edit mode)
- Email (editable)
- Joined date (`created_at`, formatted)
- Created by (`created_by_name` — resolved from `created_by` UUID)

#### Section 2: Role & School (collapsed by default)

- **Role selector:** Dropdown with 5 roles. Changing role calls `PUT /api/admin/users/:id` with `{ role }`.
- **School assignment:** Dropdown of all schools + "Unassigned" option. Changing school calls the school member assignment endpoint. For incoming users, this is the primary action — displayed with a gold highlight / call-to-action styling.
- **Coach assignment:** Dropdown of coaches (filtered to selected school's coaches if school is set). Only shown when role is `coached_student`.

#### Section 3: Account (collapsed by default)

- **Reset password:** Password input + "Set" button. Calls `POST /api/admin/users/:id/reset-password`.
- **Suspend / Unsuspend:** Toggle button. Calls `PUT /api/admin/users/:id` with `{ status }`.
- **Archive:** Button with confirmation (type user's name). Calls `DELETE /api/admin/users/:id`. Label says "Archive user" (not "Delete" — matches actual backend behavior).

**Drawer footer:** "Close" button. No separate "Edit" / "Save" — each field/action is independently saveable.

## 4. Backend Changes Required

### 4.1 Fix: Populate `coach_name` in user list response

`GET /api/admin/users` currently returns `coach_id` but not the coach's display name. Join `player_profiles` on `coach_id` to return `coach_name`. (Needed for the detail drawer's Role & School section, not the table itself.)

### 4.2 Fix: Populate `created_by_name` in user detail response

`GET /api/admin/users/:id` currently returns `created_by` (UUID) but never resolves the creator's name. Join `player_profiles` on `created_by` to return `created_by_name`.

### 4.3 School assignment endpoint (NEW — none exists today)

No dedicated endpoint exists. The CRM route (`POST /api/admin/crm/students`) does an inline `player_profiles.update({ school_id })` during creation, but there's no standalone assign/reassign.

Add support via the existing `PUT /api/admin/users/:id` — accept `{ schoolId: uuid | null }` in the body. Backend updates `player_profiles.school_id`. This keeps the API surface small and consistent with how role/status/coach are already updated through the same PUT.

### 4.4 Bulk school assignment

For the "Assign All" action in the Incoming zone:
- `POST /api/admin/users/bulk-assign-school` with `{ userIds: uuid[], schoolId: uuid }`
- Or loop individual assignments client-side (simpler, acceptable for small incoming counts).

### 4.5 School list with member counts

The left panel needs schools + member counts. Check if `GET /api/admin/schools` already returns member counts. If not, add a count join or a dedicated lightweight endpoint.

## 5. Existing Features — Disposition

| Feature | Status | Action |
|---------|--------|--------|
| User list + pagination | KEEP | Reduce to 4 columns |
| Search (client-side) | KEEP | No change |
| Role filter | KEEP | No change |
| Status filter | KEEP | Default to "active" |
| Create user (modal) | KEEP | No change to UserForm |
| CSV export | KEEP | No change |
| Reset password (modal) | MOVE | Into detail drawer, Account section |
| Reset password (inline in detail) | KEEP | Lives in Account section |
| Delete user (modal) | MOVE | Into detail drawer, Account section. Rename to "Archive" |
| Suspend/unsuspend | MOVE | Into detail drawer, Account section |
| Edit user (modal) | REMOVE | Replaced by inline editing in drawer sections |
| Pending resets banner | REMOVE | Reset action accessible via detail drawer |
| UserDetail modal | REPLACE | Becomes detail drawer |
| "Login as User" stub | SKIP | Not in scope |
| Group assignment | SKIP | Not in scope |

## 6. Files Expected to Change

| File | Change |
|------|--------|
| `client/src/pages/admin/UserManagement.jsx` | Major rewrite — two-panel layout, drawer integration |
| `client/src/pages/admin/UserDetail.jsx` | Rewrite as slide-in drawer with 3 collapsible sections |
| `client/src/pages/admin/UserForm.jsx` | Minor — remove edit mode (drawer handles it), keep create mode |
| `client/src/components/admin/UserTableRow.jsx` | Simplify to 4 columns, remove actions menu |
| `client/src/components/admin/UserFilters.jsx` | May merge into right panel header |
| `client/src/components/admin/ResetPasswordModal.jsx` | Remove — functionality moves to drawer |
| `client/src/components/admin/DeleteConfirmModal.jsx` | Keep (used inside drawer's Account section) |
| `server/routes/admin/users.js` | Add school assignment, fix coach_name/created_by_name |
| `server/db/repositories/PlayerRepository.js` | Add joins for coach_name, created_by_name |
| New: `client/src/components/admin/IncomingZone.jsx` | Incoming user cards component |
| New: `client/src/components/admin/SchoolsPanel.jsx` | Schools list with basic CRUD |
| New: `client/src/components/admin/UserDrawer.jsx` | Detail drawer shell with lazy sections |

## 7. Navigation & Sidebar

The User Management page must appear in the **SideNav** for admin and superadmin roles.

- **Location:** Under the "COACHING" section (or a dedicated "ADMIN" section if one exists), alongside Students, Groups, etc.
- **Label:** "Users"
- **Icon:** Consistent with existing sidebar style (lucide icon, e.g. `Users` or `UserCog`)
- **Route:** `/admin/users` (existing route — just needs a sidebar entry)
- **Visibility guard:** Only rendered when `user.role` is `admin` or `superadmin`
- **File to change:** `client/src/components/SideNav.jsx` (or wherever sidebar links are defined)

## 8. Out of Scope

- Group assignment UI
- "Login as User" impersonation
- Server-side pagination (current user counts don't warrant it)
- School settings/feature-toggle management (stays on Settings page)
- Leaderboard integration
