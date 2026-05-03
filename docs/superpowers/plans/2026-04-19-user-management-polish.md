# User Management Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 8 review issues: silent error swallowing, browser dialogs, missing validation, keyboard support, sorting, page indicator, click-outside, pagination spacing.

**Architecture:** All fixes are isolated — no shared state, no new components. Toast feedback uses existing `useToast()` from `ToastContext`. Server validation uses existing `SchoolRepository.findById()`.

**Tech Stack:** React, Express, existing ToastContext, existing SchoolRepository

---

### Task 1: Toast error feedback in UserDrawerProfile

**Files:**
- Modify: `client/src/components/admin/UserDrawerProfile.jsx`

- [ ] **Step 1: Add useToast import and hook call**

```jsx
// At top of file, add import:
import { useToast } from '../../contexts/ToastContext';

// Inside component, before existing state:
const { addToast } = useToast();
```

- [ ] **Step 2: Replace silent catch in saveField**

Replace:
```jsx
} catch { /* silent */ }
```

With:
```jsx
} catch (err) { addToast(err.message || 'Failed to save', 'error'); }
```

- [ ] **Step 3: Verify manually — edit a user name, check toast doesn't fire on success**

- [ ] **Step 4: Commit**

```bash
git add client/src/components/admin/UserDrawerProfile.jsx
git commit -m "fix: show toast on save errors in UserDrawerProfile"
```

---

### Task 2: Toast error feedback in UserDrawerRoleSchool

**Files:**
- Modify: `client/src/components/admin/UserDrawerRoleSchool.jsx`

- [ ] **Step 1: Add useToast import and hook call**

```jsx
import { useToast } from '../../contexts/ToastContext';

// Inside component:
const { addToast } = useToast();
```

- [ ] **Step 2: Replace 3 silent catch blocks**

In `saveRole`:
```jsx
} catch (err) { addToast(err.message || 'Failed to update role', 'error'); }
```

In `saveSchool`:
```jsx
} catch (err) { addToast(err.message || 'Failed to assign school', 'error'); }
```

In `saveCoach`:
```jsx
} catch (err) { addToast(err.message || 'Failed to assign coach', 'error'); }
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/admin/UserDrawerRoleSchool.jsx
git commit -m "fix: show toast on save errors in UserDrawerRoleSchool"
```

---

### Task 3: Toast error feedback in UserDrawerAccount

**Files:**
- Modify: `client/src/components/admin/UserDrawerAccount.jsx`

- [ ] **Step 1: Add useToast import and hook call**

```jsx
import { useToast } from '../../contexts/ToastContext';

// Inside component:
const { addToast } = useToast();
```

- [ ] **Step 2: Replace 2 silent catch blocks**

In `handleSuspendToggle`:
```jsx
} catch (err) { addToast(err.message || 'Failed to update status', 'error'); }
```

In `handleArchive`:
```jsx
} catch (err) { addToast(err.message || 'Failed to archive user', 'error'); }
```

Note: `handleResetPassword` already has proper error handling via `setResetError` — leave it.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/admin/UserDrawerAccount.jsx
git commit -m "fix: show toast on save errors in UserDrawerAccount"
```

---

### Task 4: Toast error feedback in IncomingZone

**Files:**
- Modify: `client/src/components/admin/IncomingZone.jsx`

- [ ] **Step 1: Add useToast import and hook call**

```jsx
import { useToast } from '../../contexts/ToastContext';

// Inside component:
const { addToast } = useToast();
```

- [ ] **Step 2: Replace silent catch in handleBulkAssign**

```jsx
} catch (err) { addToast(err.message || 'Failed to assign users', 'error'); }
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/admin/IncomingZone.jsx
git commit -m "fix: show toast on bulk assign error in IncomingZone"
```

---

### Task 5: Toast errors + replace confirm/alert + click-outside in SchoolsPanel

**Files:**
- Modify: `client/src/components/admin/SchoolsPanel.jsx`

This task addresses 3 issues in one file: silent catches, browser dialogs, and click-outside dismiss.

- [ ] **Step 1: Add imports**

```jsx
import React, { useState, useEffect, useRef } from 'react';
import { useToast } from '../../contexts/ToastContext';
```

- [ ] **Step 2: Add state and refs**

Inside the component, add:
```jsx
const { addToast } = useToast();
const [confirmingDelete, setConfirmingDelete] = useState(null);
const menuRef = useRef(null);
```

- [ ] **Step 3: Add click-outside effect for kebab menu**

```jsx
useEffect(() => {
  if (menuOpen === null) return;
  const handler = (e) => {
    if (menuRef.current && !menuRef.current.contains(e.target)) {
      setMenuOpen(null);
    }
  };
  document.addEventListener('mousedown', handler);
  return () => document.removeEventListener('mousedown', handler);
}, [menuOpen]);
```

- [ ] **Step 4: Replace 3 silent catch blocks with toast**

In `handleCreate`:
```jsx
} catch (err) { addToast(err.message || 'Failed to create school', 'error'); }
```

In `handleRename`:
```jsx
} catch (err) { addToast(err.message || 'Failed to rename school', 'error'); }
```

In `handleDelete` (the actual delete fetch):
```jsx
} catch (err) { addToast(err.message || 'Failed to delete school', 'error'); }
```

- [ ] **Step 5: Replace alert/confirm in handleDelete**

Replace the entire `handleDelete` function:

```jsx
const handleDelete = async (id, name) => {
  const school = schools.find(s => s.id === id);
  if (school && school.total > 0) {
    addToast(`Cannot delete "${name}" — it has ${school.total} members. Remove them first.`, 'error');
    return;
  }
  // Trigger inline confirmation
  setConfirmingDelete(id);
};

const confirmDelete = async (id) => {
  setConfirmingDelete(null);
  try {
    await apiFetch(`/api/admin/schools/${id}`, { method: 'DELETE' });
    if (selectedSchoolId === id) onSelectSchool(null);
    onSchoolsChanged?.();
  } catch (err) { addToast(err.message || 'Failed to delete school', 'error'); }
};
```

- [ ] **Step 6: Replace delete menu button with inline confirmation UI**

In the menu dropdown where the Delete button is rendered (inside `{menuOpen === s.id && (...)}`), replace the delete button:

```jsx
{confirmingDelete === s.id ? (
  <div className="flex items-center gap-1 px-3 py-1.5">
    <button
      onClick={() => { confirmDelete(s.id); setMenuOpen(null); }}
      className="text-xs px-2 py-0.5 rounded"
      style={{ background: '#f85149', color: '#fff', border: 'none', cursor: 'pointer' }}
    >Yes</button>
    <button
      onClick={() => setConfirmingDelete(null)}
      className="text-xs px-2 py-0.5 rounded"
      style={{ background: 'none', border: `1px solid ${colors.borderDefault}`, color: colors.textMuted, cursor: 'pointer' }}
    >No</button>
  </div>
) : (
  <button
    onClick={() => { handleDelete(s.id, s.name); }}
    className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left"
    style={{ color: '#f85149', background: 'none', border: 'none', cursor: 'pointer' }}
  >
    <Trash2 size={11} /> Delete
  </button>
)}
```

- [ ] **Step 7: Add ref to menu container**

On the menu dropdown div (the one with `className="absolute right-0 z-10 ..."`), add the ref:

```jsx
<div ref={menuRef} className="absolute right-0 z-10 rounded shadow-lg py-1" ...>
```

- [ ] **Step 8: Commit**

```bash
git add client/src/components/admin/SchoolsPanel.jsx
git commit -m "fix: replace alert/confirm with toast+inline, add click-outside dismiss in SchoolsPanel"
```

---

### Task 6: Toast error feedback in UserManagement + sortable columns

**Files:**
- Modify: `client/src/pages/admin/UserManagement.jsx`

- [ ] **Step 1: Add useToast import and hook call**

```jsx
import { useToast } from '../../contexts/ToastContext';
import { ChevronUp, ChevronDown, Download, Plus } from 'lucide-react';

// Inside component:
const { addToast } = useToast();
```

- [ ] **Step 2: Replace 2 silent catch blocks**

In `handleExport`:
```jsx
} catch (err) { addToast(err.message || 'Failed to export CSV', 'error'); }
```

In `loadSchools`:
```jsx
} catch (err) {
  setSchools([]);
  addToast(err.message || 'Failed to load schools', 'error');
}
```

- [ ] **Step 3: Add sort state**

```jsx
const [sortKey, setSortKey] = useState('name');
const [sortDir, setSortDir] = useState('asc');
```

- [ ] **Step 4: Add sort toggle handler**

```jsx
const toggleSort = (key) => {
  if (sortKey === key) {
    setSortDir(d => d === 'asc' ? 'desc' : 'asc');
  } else {
    setSortKey(key);
    setSortDir('asc');
  }
};
```

- [ ] **Step 5: Update useMemo to use sortKey/sortDir**

Replace the existing sort in the `filtered` useMemo:

```jsx
const filtered = useMemo(() => {
  let list = users;
  if (selectedSchoolId) {
    list = list.filter(u => u.school_id === selectedSchoolId);
  }
  if (search) {
    const q = search.toLowerCase();
    list = list.filter(u =>
      (u.display_name || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q)
    );
  }

  const fieldMap = { name: 'display_name', role: 'role', status: 'status', last_seen: 'last_seen' };
  const field = fieldMap[sortKey] || 'display_name';
  const dir = sortDir === 'asc' ? 1 : -1;

  return [...list].sort((a, b) => {
    const av = a[field] || '';
    const bv = b[field] || '';
    return dir * av.localeCompare(bv);
  });
}, [users, selectedSchoolId, search, sortKey, sortDir]);
```

- [ ] **Step 6: Make column headers clickable**

Replace the `<thead>` section:

```jsx
<thead>
  <tr style={{ color: colors.textMuted, textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.5px' }}>
    {[
      { key: 'name', label: 'Name' },
      { key: 'role', label: 'Role' },
      { key: 'status', label: 'Status' },
      { key: 'last_seen', label: 'Last Seen' },
    ].map(col => (
      <th
        key={col.key}
        className="text-left px-3 py-2"
        style={{ borderBottom: `1px solid ${colors.borderDefault}`, cursor: 'pointer', userSelect: 'none' }}
        onClick={() => toggleSort(col.key)}
      >
        <span className="inline-flex items-center gap-1">
          {col.label}
          {sortKey === col.key && (
            sortDir === 'asc'
              ? <ChevronUp size={10} />
              : <ChevronDown size={10} />
          )}
        </span>
      </th>
    ))}
  </tr>
</thead>
```

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/admin/UserManagement.jsx
git commit -m "fix: add toast errors + sortable column headers in UserManagement"
```

---

### Task 7: Escape key closes drawer

**Files:**
- Modify: `client/src/components/admin/UserDrawer.jsx`

- [ ] **Step 1: Add useEffect for Escape key**

Inside the `UserDrawer` component, after the existing `useEffect` for loading:

```jsx
useEffect(() => {
  const handler = (e) => {
    if (e.key === 'Escape') onClose();
  };
  document.addEventListener('keydown', handler);
  return () => document.removeEventListener('keydown', handler);
}, [onClose]);
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/admin/UserDrawer.jsx
git commit -m "fix: close UserDrawer on Escape key"
```

---

### Task 8: Page indicator + fix Pagination spacing

**Files:**
- Modify: `client/src/components/admin/UserTableRow.jsx`

- [ ] **Step 1: Add page indicator between Prev/Next**

Replace the Pagination component's return:

```jsx
return (
  <div className="flex items-center gap-2" style={{ color: colors.textMuted, fontSize: 12 }}>
    <button onClick={onPrev} disabled={page === 0} style={btnStyle(page === 0)}>
      <ChevronLeft size={12} /> Prev
    </button>
    <span style={{ fontSize: 11, minWidth: 70, textAlign: 'center' }}>
      Page {page + 1} of {pageCount}
    </span>
    <button onClick={onNext} disabled={page >= pageCount - 1} style={btnStyle(page >= pageCount - 1)}>
      Next <ChevronRight size={12} />
    </button>
  </div>
);
```

- [ ] **Step 2: Fix spacing — remove mt-4, return empty span when single page**

When `pageCount <= 1`, return `<span />` instead of `null`:

```jsx
if (pageCount <= 1) return <span />;
```

The wrapper div changes from `mt-4` + `justify-end` to just `gap-2` + no margin (shown in step 1 above — note the `mt-4` is removed and `justify-end` is removed).

- [ ] **Step 3: Commit**

```bash
git add client/src/components/admin/UserTableRow.jsx
git commit -m "fix: add page indicator and fix pagination spacing"
```

---

### Task 9: Validate schoolId on bulk-assign endpoint

**Files:**
- Modify: `server/routes/admin/users.js`
- Modify: `server/routes/admin/__tests__/adminUsers.test.js`

- [ ] **Step 1: Write failing test — reject non-existent schoolId**

In `adminUsers.test.js`, add to the `POST /api/admin/users/bulk-assign-school` describe block:

```javascript
it('rejects non-existent schoolId', async () => {
  const { findById } = require('../../../db/repositories/SchoolRepository');
  findById.mockResolvedValue(null);

  const app = buildApp({ user: { id: 'admin-uuid' } });
  const res = await request(app)
    .post('/api/admin/users/bulk-assign-school')
    .send({ userIds: ['u1'], schoolId: 'nonexistent-id' });

  expect(res.status).toBe(400);
  expect(res.body.error).toMatch(/not found/i);
});

it('accepts valid schoolId', async () => {
  const { findById } = require('../../../db/repositories/SchoolRepository');
  findById.mockResolvedValue({ id: 'school-abc', name: 'Test School' });
  updatePlayer.mockResolvedValue();

  const app = buildApp({ user: { id: 'admin-uuid' } });
  const res = await request(app)
    .post('/api/admin/users/bulk-assign-school')
    .send({ userIds: ['u1'], schoolId: 'school-abc' });

  expect(res.status).toBe(200);
});
```

Also add the SchoolRepository mock at the top of the file (after the existing `jest.mock` blocks):

```javascript
jest.mock('../../../db/repositories/SchoolRepository', () => ({
  findById: jest.fn(),
}));
```

- [ ] **Step 2: Run tests to verify failure**

```bash
cd server && npx jest routes/admin/__tests__/adminUsers.test.js --verbose 2>&1 | tail -20
```

Expected: new tests fail (SchoolRepository not imported in route).

- [ ] **Step 3: Add validation in route handler**

In `server/routes/admin/users.js`, add import at top:

```javascript
const { findById: findSchoolById } = require('../../db/repositories/SchoolRepository');
```

In the `POST /users/bulk-assign-school` handler, after the existing `schoolId === undefined` check, add:

```javascript
if (!schoolId) {
  return res.status(400).json({ error: 'schoolId is required' });
}
const school = await findSchoolById(schoolId);
if (!school) {
  return res.status(400).json({ error: 'School not found' });
}
```

Also remove the old `if (schoolId === undefined)` check since the new `if (!schoolId)` covers both undefined and empty string.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd server && npx jest routes/admin/__tests__/adminUsers.test.js --verbose 2>&1 | tail -30
```

Expected: all tests pass including the 2 new ones.

- [ ] **Step 5: Commit**

```bash
git add server/routes/admin/users.js server/routes/admin/__tests__/adminUsers.test.js
git commit -m "fix: validate schoolId exists before bulk-assign"
```

---

### Task 10: Run full test suite

- [ ] **Step 1: Run all server tests**

```bash
cd server && npx jest --verbose 2>&1 | tail -30
```

Expected: all tests pass, no regressions.

- [ ] **Step 2: Fix any failures**

If tests fail, diagnose and fix.

- [ ] **Step 3: Final commit if any fixes needed**
