# User Management Polish — Design Spec

**Date:** 2026-04-19
**Status:** Draft
**Author:** Jo + Claude
**Parent:** `docs/superpowers/specs/2026-04-19-user-management-redesign-design.md`

---

## 1. Problem

The User Management redesign shipped with functional issues identified during code review:

- **Silent error swallowing:** 11 catch blocks across 6 files discard errors with `/* silent */`. The user gets no feedback when saves, assignments, or deletions fail.
- **Browser dialogs:** `SchoolsPanel` uses native `alert()` and `confirm()` — breaks the dark theme, not mobile-friendly, blocks the JS thread.
- **Missing validation:** `POST /users/bulk-assign-school` doesn't validate that `schoolId` is a real UUID or exists in the database.
- **Missing keyboard support:** Drawer has no Escape-to-close.
- **No column sorting:** Table headers are static text; users can't sort by role, status, or last seen.
- **No page indicator:** Pagination shows Prev/Next buttons but not "Page X of Y".
- **Kebab menu doesn't close on outside click:** SchoolsPanel context menu stays open until the same button is clicked again.
- **Pagination spacing:** `mt-4` on Pagination conflicts with footer's `py-2`; layout shifts when pagination appears/disappears.

## 2. Goal

Fix all 8 issues. No new features, no layout changes.

## 3. Changes

### 3.1 Toast-based error feedback (replaces silent catch blocks)

**Pattern:** Every async action that can fail shows a toast on error via the existing `useToast()` hook from `ToastContext`.

**Files affected:**
- `UserDrawerProfile.jsx` — `saveField` catch
- `UserDrawerRoleSchool.jsx` — `saveRole`, `saveSchool`, `saveCoach` catch blocks
- `UserDrawerAccount.jsx` — `handleSuspendToggle`, `handleArchive` catch blocks
- `IncomingZone.jsx` — `handleBulkAssign` catch
- `SchoolsPanel.jsx` — `handleCreate`, `handleRename`, `handleDelete` catch blocks
- `UserManagement.jsx` — `handleExport` catch, `loadSchools` catch

**Implementation:** Import `useToast` in each component. In each catch block, call `addToast(err.message || 'Action failed', 'error')`. Remove all `/* silent */` comments.

**Exception:** `UserDrawer.jsx` fetch catch (line 46) — this already sets `user` to null and shows "User not found". Leave as-is.

### 3.2 Replace confirm()/alert() in SchoolsPanel

Replace native `alert()` with `addToast(message, 'error')` for the member-guard message.

Replace native `confirm()` with inline confirmation UI — same pattern as the archive confirmation in `UserDrawerAccount.jsx`: show a confirm/cancel button pair where the delete button was. State: `confirmingDelete` holds the school id being confirmed, or null.

### 3.3 Validate schoolId on bulk-assign-school endpoint

In `server/routes/admin/users.js`, the `POST /users/bulk-assign-school` handler must:
1. Validate `schoolId` is a non-empty string (already done — but also reject empty string).
2. Query `schools` table to verify the school exists before proceeding.
3. Return `400` with `{ error: 'School not found' }` if it doesn't exist.

Uses the existing `SchoolRepository.getById(schoolId)` (or equivalent query).

### 3.4 Escape key closes drawer

Add a `useEffect` in `UserDrawer.jsx` that listens for `keydown` on `document`. When `event.key === 'Escape'`, call `onClose()`. Clean up on unmount.

### 3.5 Sortable column headers

Add sort state to `UserManagement.jsx`: `sortKey` (name | role | status | last_seen) and `sortDir` (asc | desc). Default: `sortKey='name'`, `sortDir='asc'`.

Column headers become clickable: clicking toggles direction if same column, or sets new column to asc. Show a small chevron indicator on the active sort column.

Sort logic lives in the existing `useMemo` for `filtered`. Map each `sortKey` to the relevant field (`display_name`, `role`, `status`, `last_seen`) and apply `localeCompare` or date comparison.

### 3.6 Page indicator in Pagination

In the `Pagination` component (`UserTableRow.jsx`), render `Page {page + 1} of {pageCount}` text between the Prev and Next buttons. The `page` and `pageCount` props are already passed — just not rendered.

### 3.7 Click-outside closes kebab menu

Add a `useEffect` in `SchoolsPanel.jsx` that, when `menuOpen !== null`, registers a `mousedown` listener on `document`. If the click target is outside the menu, set `menuOpen(null)`. Use a ref on the menu container. Clean up on unmount or when menu closes.

### 3.8 Fix Pagination spacing

- Remove `mt-4` from the Pagination wrapper div — the footer already provides padding.
- When `pageCount <= 1`, render an empty `<span />` instead of `null` so the footer layout doesn't shift (flex spacing stays stable).

## 4. Files Expected to Change

| File | Change |
|------|--------|
| `client/src/components/admin/UserDrawerProfile.jsx` | Add `useToast`, toast on error |
| `client/src/components/admin/UserDrawerRoleSchool.jsx` | Add `useToast`, toast on error |
| `client/src/components/admin/UserDrawerAccount.jsx` | Add `useToast`, toast on error |
| `client/src/components/admin/IncomingZone.jsx` | Add `useToast`, toast on error |
| `client/src/components/admin/SchoolsPanel.jsx` | Add `useToast`, toast on error, replace confirm/alert, click-outside |
| `client/src/pages/admin/UserManagement.jsx` | Add `useToast`, toast on error, sortable columns |
| `client/src/components/admin/UserDrawer.jsx` | Escape key listener |
| `client/src/components/admin/UserTableRow.jsx` | Page indicator, fix spacing |
| `server/routes/admin/users.js` | schoolId existence validation |
| `server/routes/admin/__tests__/adminUsers.test.js` | Tests for schoolId validation |

## 5. Out of Scope

- New features, layout changes, or component restructuring
- Toast styling changes (existing ToastContainer handles rendering)
- Server-side sorting or pagination
