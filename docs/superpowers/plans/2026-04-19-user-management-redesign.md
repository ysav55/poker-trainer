# User Management Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the admin User Management page as a two-panel master-detail layout with school-scoped navigation, an incoming-user intake zone, and a slide-in detail drawer — enforcing the Platform > School > Student hierarchy.

**Architecture:** Left panel splits into Incoming Zone (unassigned users) and Schools List (navigation filter). Right panel shows a scoped user table. All user actions consolidated into a lazy-rendered, collapsible-section detail drawer that slides in from the right. Backend extended to support school assignment via existing PUT endpoint and to fix coach_name/created_by_name data gaps.

**Tech Stack:** React, Tailwind CSS, Lucide icons, Express, Supabase (PostgreSQL)

**Spec:** `docs/superpowers/specs/2026-04-19-user-management-redesign-design.md`

---

## File Structure

| File | Responsibility | Action |
|------|---------------|--------|
| `server/db/repositories/PlayerRepository.js` | Add `school_id` to `listPlayers` SELECT + `updatePlayer` patch, add `school_id` to `normalizeUser` | Modify |
| `server/routes/admin/users.js` | Accept `schoolId` in PUT, add `school_id`+`coach_name`+`created_by_name` to responses, add bulk-assign endpoint | Modify |
| `server/routes/admin/__tests__/adminUsers.test.js` | Tests for school assignment + bulk assign + coach_name + created_by_name | Modify |
| `client/src/components/SideNav/SideNav.jsx` | Add admin-only "Users" link | Modify |
| `client/src/components/admin/UserDrawer.jsx` | Detail drawer shell — lazy collapsible sections | Create |
| `client/src/components/admin/UserDrawerProfile.jsx` | Profile section (name, email, avatar, dates) | Create |
| `client/src/components/admin/UserDrawerRoleSchool.jsx` | Role, school, coach assignment section | Create |
| `client/src/components/admin/UserDrawerAccount.jsx` | Reset password, suspend, archive section | Create |
| `client/src/components/admin/IncomingZone.jsx` | Incoming user cards for left panel | Create |
| `client/src/components/admin/SchoolsPanel.jsx` | Schools list with basic CRUD | Create |
| `client/src/pages/admin/UserManagement.jsx` | Major rewrite — two-panel layout | Modify |
| `client/src/components/admin/UserTableRow.jsx` | Simplify to 4 columns, remove actions menu | Modify |
| `client/src/components/admin/UserFilters.jsx` | Remove file — filters merge into right panel header | Delete |
| `client/src/components/admin/ResetPasswordModal.jsx` | Remove file — functionality moves to drawer | Delete |
| `client/src/pages/admin/UserDetail.jsx` | Remove file — replaced by UserDrawer | Delete |
| `client/src/pages/admin/UserForm.jsx` | Remove edit mode, keep create-only | Modify |

---

## Task 1: Backend — Add `school_id` to user responses and `updatePlayer`

**Files:**
- Modify: `server/db/repositories/PlayerRepository.js:447-486` (listPlayers), `server/db/repositories/PlayerRepository.js:408-417` (updatePlayer)
- Modify: `server/routes/admin/users.js:42-54` (normalizeUser), `server/routes/admin/users.js:246-268` (PUT handler)
- Test: `server/routes/admin/__tests__/adminUsers.test.js`

- [ ] **Step 1: Write failing test — PUT accepts schoolId**

In `server/routes/admin/__tests__/adminUsers.test.js`, add after the existing PUT tests (around line 320):

```javascript
describe('PUT /users/:id — school assignment', () => {
  it('updates school_id when schoolId is provided', async () => {
    const { updatePlayer } = require('../../../db/repositories/PlayerRepository');
    updatePlayer.mockResolvedValue();

    const res = await request(app)
      .put('/users/user-1')
      .send({ schoolId: 'school-abc' });

    expect(res.status).toBe(200);
    expect(updatePlayer).toHaveBeenCalledWith('user-1', expect.objectContaining({
      schoolId: 'school-abc',
    }));
  });

  it('accepts null schoolId to unassign from school', async () => {
    const { updatePlayer } = require('../../../db/repositories/PlayerRepository');
    updatePlayer.mockResolvedValue();

    const res = await request(app)
      .put('/users/user-1')
      .send({ schoolId: null });

    expect(res.status).toBe(200);
    expect(updatePlayer).toHaveBeenCalledWith('user-1', expect.objectContaining({
      schoolId: null,
    }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest server/routes/admin/__tests__/adminUsers.test.js --testNamePattern="school assignment" -v`
Expected: FAIL — `schoolId` not passed through to `updatePlayer`

- [ ] **Step 3: Add `schoolId` to `updatePlayer` in PlayerRepository**

In `server/db/repositories/PlayerRepository.js`, inside `updatePlayer` (around line 413), add the school_id mapping:

```javascript
async function updatePlayer(id, patch) {
  const dbPatch = {};
  if (patch.displayName !== undefined) dbPatch.display_name = patch.displayName;
  if (patch.email       !== undefined) dbPatch.email        = patch.email;
  if (patch.status      !== undefined) dbPatch.status       = patch.status;
  if (patch.avatarUrl   !== undefined) dbPatch.avatar_url   = patch.avatarUrl;
  if (patch.coachId     !== undefined) dbPatch.coach_id     = patch.coachId;
  if (patch.schoolId    !== undefined) dbPatch.school_id    = patch.schoolId;
  const { error } = await supabase.from('player_profiles').update(dbPatch).eq('id', id);
  if (error) throw error;
}
```

- [ ] **Step 4: Accept `schoolId` in PUT route handler**

In `server/routes/admin/users.js`, update the PUT handler (around line 249) to extract `schoolId`:

```javascript
// Inside PUT /users/:id handler:
const { displayName, email, status, avatarUrl, roleName, schoolId } = req.body;
const patch = {};
if (displayName !== undefined) patch.displayName = displayName;
if (email       !== undefined) patch.email       = email;
if (status      !== undefined) patch.status      = status;
if (avatarUrl   !== undefined) patch.avatarUrl   = avatarUrl;
if (schoolId    !== undefined) patch.schoolId    = schoolId;
```

- [ ] **Step 5: Add `school_id` to `listPlayers` SELECT and `normalizeUser`**

In `server/db/repositories/PlayerRepository.js`, update the `listPlayers` query (around line 452) to include `school_id`:

```javascript
.select('id, display_name, email, status, avatar_url, last_seen, coach_id, created_at, school_id')
```

In `server/routes/admin/users.js`, update `normalizeUser` (around line 42) to include `school_id`:

```javascript
function normalizeUser(row) {
  return {
    id:           row.id,
    display_name: row.display_name,
    email:        row.email      ?? null,
    status:       row.status     ?? 'active',
    avatar_url:   row.avatar_url ?? null,
    last_seen:    row.last_seen  ?? null,
    coach_id:     row.coach_id   ?? null,
    school_id:    row.school_id  ?? null,
    created_at:   row.created_at ?? null,
    role:         row.player_roles !== undefined ? normalizeRole(row.player_roles) : (row.role ?? null),
  };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx jest server/routes/admin/__tests__/adminUsers.test.js --testNamePattern="school assignment" -v`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add server/db/repositories/PlayerRepository.js server/routes/admin/users.js server/routes/admin/__tests__/adminUsers.test.js
git commit -m "feat: add school_id to user responses and PUT endpoint"
```

---

## Task 2: Backend — Resolve `coach_name` and `created_by_name`

**Files:**
- Modify: `server/routes/admin/users.js:86-106` (GET /users), `server/routes/admin/users.js:168-207` (GET /users/:id)
- Test: `server/routes/admin/__tests__/adminUsers.test.js`

- [ ] **Step 1: Write failing test — GET /users returns coach_name**

```javascript
describe('GET /users — coach_name resolution', () => {
  it('returns coach_name alongside coach_id', async () => {
    const { listPlayers } = require('../../../db/repositories/PlayerRepository');
    listPlayers.mockResolvedValue([
      { id: 'u1', display_name: 'Student', email: null, status: 'active',
        coach_id: 'coach-1', school_id: null, created_at: '2026-01-01',
        role: 'coached_student' },
    ]);

    // Mock supabase for coach name lookup
    const supabase = require('../../../db/supabase.js');
    supabase.from.mockReturnValue(supabase);
    supabase.select.mockReturnValue(supabase);
    supabase.eq.mockReturnValue(supabase);
    supabase.maybeSingle.mockResolvedValue({
      data: { display_name: 'Coach Bob' }, error: null,
    });

    const res = await request(app).get('/users');
    expect(res.status).toBe(200);
    const user = res.body.find(u => u.id === 'u1') || res.body.users?.find(u => u.id === 'u1');
    expect(user.coach_name).toBe('Coach Bob');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest server/routes/admin/__tests__/adminUsers.test.js --testNamePattern="coach_name" -v`
Expected: FAIL — `coach_name` not in response

- [ ] **Step 3: Implement coach_name resolution in GET /users**

In `server/routes/admin/users.js`, after `listPlayers` returns and `normalizeUser` maps the results (around line 98), add a coach name resolution pass:

```javascript
// After: const users = raw.map(normalizeUser);
// Resolve coach names
const coachIds = [...new Set(users.map(u => u.coach_id).filter(Boolean))];
const coachNames = {};
if (coachIds.length > 0) {
  const { data: coaches } = await supabase
    .from('player_profiles')
    .select('id, display_name')
    .in('id', coachIds);
  for (const c of coaches || []) coachNames[c.id] = c.display_name;
}
for (const u of users) {
  u.coach_name = u.coach_id ? (coachNames[u.coach_id] ?? null) : null;
}
```

- [ ] **Step 4: Implement created_by_name resolution in GET /users/:id**

In `server/routes/admin/users.js`, inside the GET `/:id` handler (around line 190), after normalizing the user, add:

```javascript
// After normalizing the user object
if (user.created_by) {
  const { data: creator } = await supabase
    .from('player_profiles')
    .select('display_name')
    .eq('id', user.created_by)
    .maybeSingle();
  user.created_by_name = creator?.display_name ?? null;
} else {
  user.created_by_name = null;
}
```

Note: The GET /:id handler must also include `created_by` in its select query. Check the existing select and add `created_by` if missing.

- [ ] **Step 5: Run tests**

Run: `npx jest server/routes/admin/__tests__/adminUsers.test.js -v`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add server/routes/admin/users.js server/routes/admin/__tests__/adminUsers.test.js
git commit -m "fix: resolve coach_name and created_by_name in admin user responses"
```

---

## Task 3: Backend — Bulk school assignment endpoint

**Files:**
- Modify: `server/routes/admin/users.js`
- Test: `server/routes/admin/__tests__/adminUsers.test.js`

- [ ] **Step 1: Write failing test**

```javascript
describe('POST /users/bulk-assign-school', () => {
  it('assigns multiple users to a school', async () => {
    const { updatePlayer } = require('../../../db/repositories/PlayerRepository');
    updatePlayer.mockResolvedValue();

    const res = await request(app)
      .post('/users/bulk-assign-school')
      .send({ userIds: ['u1', 'u2', 'u3'], schoolId: 'school-abc' });

    expect(res.status).toBe(200);
    expect(res.body.assigned).toBe(3);
    expect(updatePlayer).toHaveBeenCalledTimes(3);
    expect(updatePlayer).toHaveBeenCalledWith('u1', { schoolId: 'school-abc' });
    expect(updatePlayer).toHaveBeenCalledWith('u2', { schoolId: 'school-abc' });
    expect(updatePlayer).toHaveBeenCalledWith('u3', { schoolId: 'school-abc' });
  });

  it('rejects empty userIds array', async () => {
    const res = await request(app)
      .post('/users/bulk-assign-school')
      .send({ userIds: [], schoolId: 'school-abc' });

    expect(res.status).toBe(400);
  });

  it('rejects missing schoolId', async () => {
    const res = await request(app)
      .post('/users/bulk-assign-school')
      .send({ userIds: ['u1'] });

    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest server/routes/admin/__tests__/adminUsers.test.js --testNamePattern="bulk-assign" -v`
Expected: FAIL — 404 route not found

- [ ] **Step 3: Implement bulk-assign-school endpoint**

In `server/routes/admin/users.js`, add before the `/:id` routes (order matters — Express matches first):

```javascript
// ── POST /users/bulk-assign-school ────────────────────────────────────────────
router.post('/bulk-assign-school', async (req, res) => {
  try {
    const { userIds, schoolId } = req.body || {};
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'userIds must be a non-empty array' });
    }
    if (schoolId === undefined) {
      return res.status(400).json({ error: 'schoolId is required' });
    }
    await Promise.all(userIds.map(id => updatePlayer(id, { schoolId })));
    res.json({ success: true, assigned: userIds.length });
  } catch (err) {
    res.status(500).json({ error: err.message || 'internal_error' });
  }
});
```

- [ ] **Step 4: Run tests**

Run: `npx jest server/routes/admin/__tests__/adminUsers.test.js --testNamePattern="bulk-assign" -v`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `npx jest server/routes/admin/__tests__/adminUsers.test.js -v`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add server/routes/admin/users.js server/routes/admin/__tests__/adminUsers.test.js
git commit -m "feat: add POST /users/bulk-assign-school endpoint"
```

---

## Task 4: SideNav — Add admin-only "Users" link

**Files:**
- Modify: `client/src/components/SideNav/SideNav.jsx`

- [ ] **Step 1: Import `UserCog` icon**

In `client/src/components/SideNav/SideNav.jsx` line 3, add `UserCog` to the lucide imports:

```javascript
import {
  Home, Table2, Trophy, Clock, Medal,
  Users, FolderOpen, Target, DollarSign, UserCog,
  Settings, PanelLeftClose, PanelLeftOpen, LogOut,
} from 'lucide-react';
```

- [ ] **Step 2: Add ADMIN_ROLES constant and ADMIN_ITEMS array**

After the `COACHING_ITEMS` array (line 30), add:

```javascript
const ADMIN_ROLES = new Set(['admin', 'superadmin']);

const ADMIN_ITEMS = [
  { icon: UserCog, label: 'Users', path: '/admin/users' },
];
```

- [ ] **Step 3: Add ADMIN NavGroup to the JSX**

After the COACHING NavGroup closing tag (line 101), add:

```jsx
{/* ADMIN — admin+ only */}
{ADMIN_ROLES.has(role) && (
  <NavGroup label="ADMIN" expanded={expanded}>
    {ADMIN_ITEMS.map((item) => (
      <NavItem
        key={item.path}
        icon={item.icon}
        label={item.label}
        path={item.path}
        expanded={expanded}
        active={isActive(item.path)}
      />
    ))}
  </NavGroup>
)}
```

- [ ] **Step 4: Verify in browser**

Run dev server (`npm run dev` in client), log in as admin/superadmin. Confirm:
- "ADMIN" section appears below COACHING
- "Users" link navigates to `/admin/users`
- Link does NOT appear for coach or student roles

- [ ] **Step 5: Commit**

```bash
git add client/src/components/SideNav/SideNav.jsx
git commit -m "feat: add Users link to SideNav for admin/superadmin"
```

---

## Task 5: UserDrawer — Collapsible section shell with lazy rendering

**Files:**
- Create: `client/src/components/admin/UserDrawer.jsx`

- [ ] **Step 1: Create the drawer shell**

```jsx
import React, { useState, useEffect } from 'react';
import { X, ChevronDown, ChevronRight } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { colors } from '../../lib/colors';

function CollapsibleSection({ title, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const [mounted, setMounted] = useState(defaultOpen);

  const toggle = () => {
    if (!mounted) setMounted(true);
    setOpen(prev => !prev);
  };

  return (
    <div style={{ borderBottom: `1px solid ${colors.borderDefault}` }}>
      <button
        onClick={toggle}
        className="flex items-center justify-between w-full px-5 py-3 text-left"
        style={{ color: colors.textPrimary, background: 'none', border: 'none', cursor: 'pointer' }}
      >
        <span className="text-xs font-semibold tracking-wider uppercase">{title}</span>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {mounted && (
        <div style={{ display: open ? 'block' : 'none', padding: '0 20px 16px' }}>
          {children}
        </div>
      )}
    </div>
  );
}

export { CollapsibleSection };

export default function UserDrawer({ userId, schools, onClose, onUserUpdated }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    apiFetch(`/api/admin/users/${userId}`)
      .then(data => setUser(data))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, [userId]);

  if (!userId) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.4)' }}
      />
      {/* Drawer */}
      <div
        className="fixed top-0 right-0 z-50 h-full flex flex-col overflow-y-auto"
        style={{
          width: 420,
          background: colors.bgSurface,
          borderLeft: `1px solid ${colors.borderDefault}`,
          boxShadow: '-4px 0 24px rgba(0,0,0,0.3)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: `1px solid ${colors.borderDefault}` }}
        >
          <span className="text-sm font-bold" style={{ color: colors.textPrimary }}>
            User Details
          </span>
          <button onClick={onClose} style={{ color: colors.textMuted, background: 'none', border: 'none', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <span style={{ color: colors.textMuted }}>Loading…</span>
          </div>
        ) : !user ? (
          <div className="flex-1 flex items-center justify-center">
            <span style={{ color: colors.textMuted }}>User not found</span>
          </div>
        ) : (
          <div className="flex-1">
            {/* Lazy-rendered sections — children injected by parent */}
            {/* Sections are passed as render props or children */}
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-3" style={{ borderTop: `1px solid ${colors.borderDefault}` }}>
          <button
            onClick={onClose}
            className="w-full py-2 rounded text-sm font-semibold"
            style={{
              background: 'transparent',
              border: `1px solid ${colors.borderDefault}`,
              color: colors.textMuted,
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verify file renders without errors**

Import `UserDrawer` in the browser console or a test page to confirm no syntax/import errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/admin/UserDrawer.jsx
git commit -m "feat: create UserDrawer shell with collapsible lazy-rendered sections"
```

---

## Task 6: UserDrawer — Profile section

**Files:**
- Create: `client/src/components/admin/UserDrawerProfile.jsx`

- [ ] **Step 1: Create the Profile section component**

```jsx
import React, { useState } from 'react';
import { apiFetch } from '../../lib/api';
import { colors } from '../../lib/colors';

function Initials({ name }) {
  const letters = (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div
      className="flex items-center justify-center rounded-full text-lg font-bold"
      style={{
        width: 56, height: 56,
        background: `rgba(212,175,55,0.15)`,
        border: `2px solid ${colors.gold}`,
        color: colors.gold,
      }}
    >
      {letters}
    </div>
  );
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  } catch { return iso; }
}

function InfoRow({ label, children }) {
  return (
    <div className="flex flex-col gap-0.5 mb-3">
      <span className="text-xs font-semibold tracking-wider" style={{ color: colors.textMuted }}>{label}</span>
      <div className="text-sm" style={{ color: colors.textPrimary }}>{children}</div>
    </div>
  );
}

export default function UserDrawerProfile({ user, onUserUpdated }) {
  const [editName, setEditName] = useState(false);
  const [editEmail, setEditEmail] = useState(false);
  const [name, setName] = useState(user.display_name || '');
  const [email, setEmail] = useState(user.email || '');
  const [saving, setSaving] = useState(false);

  const saveField = async (field, value) => {
    setSaving(true);
    try {
      await apiFetch(`/api/admin/users/${user.id}`, {
        method: 'PUT',
        body: JSON.stringify({ [field]: value }),
      });
      onUserUpdated?.();
    } catch { /* toast error */ }
    finally { setSaving(false); }
  };

  return (
    <div>
      <div className="flex items-center gap-4 mb-4">
        <Initials name={user.display_name} />
        <div>
          {editName ? (
            <div className="flex items-center gap-2">
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                className="rounded px-2 py-1 text-sm"
                style={{ background: colors.bgCanvas, border: `1px solid ${colors.borderDefault}`, color: colors.textPrimary }}
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter') { saveField('displayName', name); setEditName(false); }
                  if (e.key === 'Escape') { setName(user.display_name || ''); setEditName(false); }
                }}
              />
              <button
                onClick={() => { saveField('displayName', name); setEditName(false); }}
                disabled={saving}
                className="text-xs px-2 py-1 rounded"
                style={{ background: colors.gold, color: '#0d1117', border: 'none', cursor: 'pointer' }}
              >
                Save
              </button>
            </div>
          ) : (
            <span
              className="text-base font-bold cursor-pointer"
              style={{ color: colors.textPrimary }}
              onClick={() => setEditName(true)}
              title="Click to edit"
            >
              {user.display_name || '—'}
            </span>
          )}
        </div>
      </div>

      <InfoRow label="EMAIL">
        {editEmail ? (
          <div className="flex items-center gap-2">
            <input
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="rounded px-2 py-1 text-sm"
              style={{ background: colors.bgCanvas, border: `1px solid ${colors.borderDefault}`, color: colors.textPrimary }}
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter') { saveField('email', email); setEditEmail(false); }
                if (e.key === 'Escape') { setEmail(user.email || ''); setEditEmail(false); }
              }}
            />
            <button
              onClick={() => { saveField('email', email); setEditEmail(false); }}
              disabled={saving}
              className="text-xs px-2 py-1 rounded"
              style={{ background: colors.gold, color: '#0d1117', border: 'none', cursor: 'pointer' }}
            >
              Save
            </button>
          </div>
        ) : (
          <span
            className="cursor-pointer"
            onClick={() => setEditEmail(true)}
            title="Click to edit"
          >
            {user.email || '—'}
          </span>
        )}
      </InfoRow>

      <InfoRow label="JOINED">{formatDate(user.created_at)}</InfoRow>
      {user.created_by_name && <InfoRow label="CREATED BY">{user.created_by_name}</InfoRow>}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/admin/UserDrawerProfile.jsx
git commit -m "feat: create UserDrawerProfile section with inline editing"
```

---

## Task 7: UserDrawer — Role & School section

**Files:**
- Create: `client/src/components/admin/UserDrawerRoleSchool.jsx`

- [ ] **Step 1: Create the Role & School section component**

```jsx
import React, { useState, useEffect } from 'react';
import { apiFetch } from '../../lib/api';
import { colors } from '../../lib/colors';

const ROLES = ['superadmin', 'admin', 'coach', 'coached_student', 'solo_student'];

export default function UserDrawerRoleSchool({ user, schools, onUserUpdated }) {
  const [role, setRole] = useState(user.role || '');
  const [schoolId, setSchoolId] = useState(user.school_id || '');
  const [coachId, setCoachId] = useState(user.coach_id || '');
  const [coaches, setCoaches] = useState([]);
  const [saving, setSaving] = useState(false);

  const isIncoming = !user.school_id;

  // Load coaches when role is coached_student
  useEffect(() => {
    if (role !== 'coached_student') { setCoaches([]); return; }
    apiFetch('/api/admin/users?role=coach')
      .then(data => {
        const list = Array.isArray(data) ? data : (data.users ?? data.players ?? []);
        setCoaches(list);
      })
      .catch(() => setCoaches([]));
  }, [role]);

  const saveRole = async (newRole) => {
    setSaving(true);
    try {
      await apiFetch(`/api/admin/users/${user.id}`, {
        method: 'PUT',
        body: JSON.stringify({ roleName: newRole }),
      });
      setRole(newRole);
      onUserUpdated?.();
    } catch { /* toast */ }
    finally { setSaving(false); }
  };

  const saveSchool = async (newSchoolId) => {
    setSaving(true);
    try {
      await apiFetch(`/api/admin/users/${user.id}`, {
        method: 'PUT',
        body: JSON.stringify({ schoolId: newSchoolId || null }),
      });
      setSchoolId(newSchoolId);
      onUserUpdated?.();
    } catch { /* toast */ }
    finally { setSaving(false); }
  };

  const saveCoach = async (newCoachId) => {
    setSaving(true);
    try {
      await apiFetch(`/api/admin/users/${user.id}`, {
        method: 'PUT',
        body: JSON.stringify({ coachId: newCoachId || null }),
      });
      setCoachId(newCoachId);
      onUserUpdated?.();
    } catch { /* toast */ }
    finally { setSaving(false); }
  };

  const selectStyle = {
    background: colors.bgCanvas,
    border: `1px solid ${colors.borderDefault}`,
    color: colors.textPrimary,
    padding: '6px 10px',
    borderRadius: 4,
    fontSize: 13,
    width: '100%',
    cursor: 'pointer',
  };

  const labelStyle = {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    marginBottom: 4,
    display: 'block',
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Role */}
      <div>
        <span style={labelStyle}>Role</span>
        <select
          value={role}
          onChange={e => saveRole(e.target.value)}
          disabled={saving}
          style={selectStyle}
        >
          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      {/* School */}
      <div>
        <span style={labelStyle}>School</span>
        <div style={isIncoming ? {
          padding: 2,
          borderRadius: 6,
          border: `2px solid ${colors.gold}`,
          background: 'rgba(212,175,55,0.06)',
        } : {}}>
          <select
            value={schoolId}
            onChange={e => saveSchool(e.target.value)}
            disabled={saving}
            style={selectStyle}
          >
            <option value="">— Unassigned —</option>
            {(schools || []).map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        {isIncoming && (
          <span className="text-xs mt-1 block" style={{ color: colors.gold }}>
            This user needs a school assignment
          </span>
        )}
      </div>

      {/* Coach (conditional) */}
      {role === 'coached_student' && (
        <div>
          <span style={labelStyle}>Coach</span>
          <select
            value={coachId}
            onChange={e => saveCoach(e.target.value)}
            disabled={saving}
            style={selectStyle}
          >
            <option value="">— No coach —</option>
            {coaches.map(c => (
              <option key={c.id} value={c.id}>{c.display_name}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/admin/UserDrawerRoleSchool.jsx
git commit -m "feat: create UserDrawerRoleSchool section with school assignment"
```

---

## Task 8: UserDrawer — Account section

**Files:**
- Create: `client/src/components/admin/UserDrawerAccount.jsx`

- [ ] **Step 1: Create the Account section component**

```jsx
import React, { useState } from 'react';
import { apiFetch } from '../../lib/api';
import { colors } from '../../lib/colors';

export default function UserDrawerAccount({ user, onUserUpdated, onClose }) {
  // Password reset
  const [password, setPassword] = useState('');
  const [resetSuccess, setResetSuccess] = useState(false);
  const [resetError, setResetError] = useState(null);

  // Suspend
  const [suspending, setSuspending] = useState(false);

  // Archive
  const [showArchive, setShowArchive] = useState(false);
  const [archiveTyped, setArchiveTyped] = useState('');
  const [archiving, setArchiving] = useState(false);

  const isSuspended = user.status === 'suspended';

  const handleResetPassword = async () => {
    if (!password.trim()) return;
    setResetError(null);
    try {
      await apiFetch(`/api/admin/users/${user.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ password }),
      });
      setPassword('');
      setResetSuccess(true);
    } catch (err) {
      setResetError(err.message || 'Failed to reset password');
    }
  };

  const handleSuspendToggle = async () => {
    setSuspending(true);
    try {
      await apiFetch(`/api/admin/users/${user.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: isSuspended ? 'active' : 'suspended' }),
      });
      onUserUpdated?.();
    } catch { /* toast */ }
    finally { setSuspending(false); }
  };

  const handleArchive = async () => {
    setArchiving(true);
    try {
      await apiFetch(`/api/admin/users/${user.id}`, { method: 'DELETE' });
      onUserUpdated?.();
      onClose?.();
    } catch { /* toast */ }
    finally { setArchiving(false); }
  };

  const inputStyle = {
    background: colors.bgCanvas,
    border: `1px solid ${colors.borderDefault}`,
    color: colors.textPrimary,
    padding: '6px 10px',
    borderRadius: 4,
    fontSize: 13,
    width: '100%',
  };

  const labelStyle = {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    marginBottom: 4,
    display: 'block',
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Reset Password */}
      <div>
        <span style={labelStyle}>Reset Password</span>
        {resetSuccess ? (
          <span className="text-xs" style={{ color: '#3fb950' }}>Password updated successfully</span>
        ) : (
          <div className="flex items-center gap-2">
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="New password"
              style={inputStyle}
              onKeyDown={e => { if (e.key === 'Enter') handleResetPassword(); }}
            />
            <button
              onClick={handleResetPassword}
              disabled={!password.trim()}
              className="text-xs px-3 py-1.5 rounded font-semibold"
              style={{
                background: colors.gold,
                color: '#0d1117',
                border: 'none',
                cursor: password.trim() ? 'pointer' : 'not-allowed',
                opacity: password.trim() ? 1 : 0.5,
              }}
            >
              Set
            </button>
          </div>
        )}
        {resetError && <span className="text-xs mt-1 block" style={{ color: '#f85149' }}>{resetError}</span>}
      </div>

      {/* Suspend / Unsuspend */}
      <div>
        <span style={labelStyle}>{isSuspended ? 'Unsuspend User' : 'Suspend User'}</span>
        <button
          onClick={handleSuspendToggle}
          disabled={suspending}
          className="text-xs px-4 py-2 rounded font-semibold"
          style={{
            background: isSuspended ? 'rgba(63,185,80,0.1)' : 'rgba(227,179,65,0.1)',
            border: `1px solid ${isSuspended ? 'rgba(63,185,80,0.3)' : 'rgba(227,179,65,0.3)'}`,
            color: isSuspended ? '#3fb950' : '#e3b341',
            cursor: 'pointer',
          }}
        >
          {suspending ? '…' : isSuspended ? 'Reactivate' : 'Suspend'}
        </button>
      </div>

      {/* Archive */}
      <div>
        <span style={labelStyle}>Archive User</span>
        {!showArchive ? (
          <button
            onClick={() => setShowArchive(true)}
            className="text-xs px-4 py-2 rounded font-semibold"
            style={{
              background: 'rgba(248,81,73,0.1)',
              border: '1px solid rgba(248,81,73,0.3)',
              color: '#f85149',
              cursor: 'pointer',
            }}
          >
            Archive this user…
          </button>
        ) : (
          <div className="flex flex-col gap-2">
            <span className="text-xs" style={{ color: '#f85149' }}>
              Type <strong>{user.display_name}</strong> to confirm
            </span>
            <input
              value={archiveTyped}
              onChange={e => setArchiveTyped(e.target.value)}
              placeholder={user.display_name}
              style={inputStyle}
            />
            <div className="flex gap-2">
              <button
                onClick={handleArchive}
                disabled={archiveTyped !== user.display_name || archiving}
                className="text-xs px-3 py-1.5 rounded font-semibold"
                style={{
                  background: archiveTyped === user.display_name ? '#f85149' : 'rgba(248,81,73,0.2)',
                  color: '#fff',
                  border: 'none',
                  cursor: archiveTyped === user.display_name ? 'pointer' : 'not-allowed',
                }}
              >
                {archiving ? 'Archiving…' : 'Confirm Archive'}
              </button>
              <button
                onClick={() => { setShowArchive(false); setArchiveTyped(''); }}
                className="text-xs px-3 py-1.5 rounded"
                style={{ background: 'transparent', border: `1px solid ${colors.borderDefault}`, color: colors.textMuted, cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/admin/UserDrawerAccount.jsx
git commit -m "feat: create UserDrawerAccount section — reset password, suspend, archive"
```

---

## Task 9: Wire drawer sections into UserDrawer

**Files:**
- Modify: `client/src/components/admin/UserDrawer.jsx`

- [ ] **Step 1: Import section components and wire into CollapsibleSections**

Update `client/src/components/admin/UserDrawer.jsx` — replace the placeholder `{/* Sections are passed as render props or children */}` block with:

```jsx
import UserDrawerProfile from './UserDrawerProfile';
import UserDrawerRoleSchool from './UserDrawerRoleSchool';
import UserDrawerAccount from './UserDrawerAccount';
```

And replace the sections placeholder inside the `<div className="flex-1">` block:

```jsx
<div className="flex-1">
  <CollapsibleSection title="Profile" defaultOpen={true}>
    <UserDrawerProfile user={user} onUserUpdated={() => {
      onUserUpdated?.();
      // Refresh drawer data
      apiFetch(`/api/admin/users/${userId}`).then(setUser);
    }} />
  </CollapsibleSection>

  <CollapsibleSection title="Role & School">
    <UserDrawerRoleSchool
      user={user}
      schools={schools}
      onUserUpdated={() => {
        onUserUpdated?.();
        apiFetch(`/api/admin/users/${userId}`).then(setUser);
      }}
    />
  </CollapsibleSection>

  <CollapsibleSection title="Account">
    <UserDrawerAccount
      user={user}
      onUserUpdated={onUserUpdated}
      onClose={onClose}
    />
  </CollapsibleSection>
</div>
```

- [ ] **Step 2: Verify drawer renders all 3 sections**

Open the app, navigate to `/admin/users`, click a user row. Confirm:
- Profile section opens by default with user data
- Role & School section collapsed, expands on click, shows dropdowns
- Account section collapsed, expands on click, shows password/suspend/archive

- [ ] **Step 3: Commit**

```bash
git add client/src/components/admin/UserDrawer.jsx
git commit -m "feat: wire Profile, Role & School, Account sections into UserDrawer"
```

---

## Task 10: IncomingZone — unassigned users intake panel

**Files:**
- Create: `client/src/components/admin/IncomingZone.jsx`

- [ ] **Step 1: Create IncomingZone component**

```jsx
import React, { useState } from 'react';
import { Check } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { colors } from '../../lib/colors';

function timeAgo(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const STALE_DAYS = 7;

function isStale(iso) {
  if (!iso) return false;
  return (Date.now() - new Date(iso).getTime()) > STALE_DAYS * 86400000;
}

export default function IncomingZone({ users, schools, onSelectUser, onUsersUpdated }) {
  const [bulkSchoolId, setBulkSchoolId] = useState('');
  const [assigning, setAssigning] = useState(false);

  const incoming = users.filter(u => !u.school_id);

  const handleBulkAssign = async () => {
    if (!bulkSchoolId || incoming.length === 0) return;
    setAssigning(true);
    try {
      await apiFetch('/api/admin/users/bulk-assign-school', {
        method: 'POST',
        body: JSON.stringify({
          userIds: incoming.map(u => u.id),
          schoolId: bulkSchoolId,
        }),
      });
      setBulkSchoolId('');
      onUsersUpdated?.();
    } catch { /* toast */ }
    finally { setAssigning(false); }
  };

  // Empty state
  if (incoming.length === 0) {
    return (
      <div
        className="flex items-center gap-2 px-3 py-2"
        style={{ borderBottom: `1px solid ${colors.borderDefault}`, color: '#3fb950', fontSize: 11 }}
      >
        <Check size={12} />
        <span>No pending users</span>
      </div>
    );
  }

  return (
    <div style={{ borderBottom: `2px solid ${colors.gold}`, padding: 12 }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span style={{ color: colors.gold, fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>
          Incoming
        </span>
        <span style={{
          background: colors.gold, color: '#0d1117',
          fontSize: 10, fontWeight: 800,
          padding: '2px 7px', borderRadius: 10,
        }}>
          {incoming.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-1.5" style={{ maxHeight: 240, overflowY: 'auto' }}>
        {incoming.map(u => (
          <div
            key={u.id}
            onClick={() => onSelectUser(u.id)}
            className="cursor-pointer rounded-md px-2 py-2 transition-colors"
            style={{
              background: 'rgba(212,175,55,0.06)',
              border: `1px solid ${isStale(u.created_at) ? 'rgba(248,81,73,0.35)' : 'rgba(212,175,55,0.2)'}`,
            }}
          >
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold" style={{ color: colors.textPrimary }}>
                {u.display_name || u.id.slice(0, 8)}
              </span>
              <span style={{ color: colors.textMuted, fontSize: 9 }}>{timeAgo(u.created_at)}</span>
            </div>
            <div style={{ color: colors.textMuted, fontSize: 10, marginTop: 2 }}>
              {u.role || 'solo_student'} · no school
            </div>
          </div>
        ))}
      </div>

      {/* Bulk assign */}
      <div className="flex items-center gap-1 mt-2">
        <select
          value={bulkSchoolId}
          onChange={e => setBulkSchoolId(e.target.value)}
          className="flex-1 text-xs rounded px-1 py-1"
          style={{
            background: colors.bgCanvas,
            border: `1px solid ${colors.borderDefault}`,
            color: colors.textMuted,
            fontSize: 10,
          }}
        >
          <option value="">Assign all to…</option>
          {(schools || []).map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <button
          onClick={handleBulkAssign}
          disabled={!bulkSchoolId || assigning}
          className="text-xs px-2 py-1 rounded"
          style={{
            background: bulkSchoolId ? colors.gold : 'transparent',
            color: bulkSchoolId ? '#0d1117' : colors.textMuted,
            border: bulkSchoolId ? 'none' : `1px solid ${colors.borderDefault}`,
            cursor: bulkSchoolId ? 'pointer' : 'not-allowed',
            fontSize: 10,
            fontWeight: 600,
          }}
        >
          Go
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/admin/IncomingZone.jsx
git commit -m "feat: create IncomingZone component for unassigned user intake"
```

---

## Task 11: SchoolsPanel — school list with basic CRUD

**Files:**
- Create: `client/src/components/admin/SchoolsPanel.jsx`

- [ ] **Step 1: Create SchoolsPanel component**

```jsx
import React, { useState } from 'react';
import { MoreHorizontal, Trash2, Pencil, Plus } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { colors } from '../../lib/colors';

export default function SchoolsPanel({ schools, selectedSchoolId, totalUsers, onSelectSchool, onSchoolsChanged }) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [menuOpen, setMenuOpen] = useState(null); // school id
  const [renaming, setRenaming] = useState(null); // school id
  const [renameVal, setRenameVal] = useState('');
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      await apiFetch('/api/admin/schools', {
        method: 'POST',
        body: JSON.stringify({ name: newName.trim() }),
      });
      setNewName('');
      setCreating(false);
      onSchoolsChanged?.();
    } catch { /* toast */ }
    finally { setSaving(false); }
  };

  const handleRename = async (id) => {
    if (!renameVal.trim()) return;
    setSaving(true);
    try {
      await apiFetch(`/api/admin/schools/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: renameVal.trim() }),
      });
      setRenaming(null);
      setRenameVal('');
      onSchoolsChanged?.();
    } catch { /* toast */ }
    finally { setSaving(false); }
  };

  const handleDelete = async (id, name) => {
    const school = schools.find(s => s.id === id);
    if (school && school.total > 0) {
      alert(`Cannot delete "${name}" — it has ${school.total} members. Remove them first.`);
      return;
    }
    if (!confirm(`Delete school "${name}"?`)) return;
    try {
      await apiFetch(`/api/admin/schools/${id}`, { method: 'DELETE' });
      if (selectedSchoolId === id) onSelectSchool(null);
      onSchoolsChanged?.();
    } catch { /* toast */ }
  };

  const itemStyle = (isSelected) => ({
    padding: '8px 10px',
    borderRadius: 6,
    cursor: 'pointer',
    marginBottom: 3,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: isSelected ? 'rgba(212,175,55,0.1)' : 'transparent',
    border: isSelected ? `1px solid rgba(212,175,55,0.3)` : '1px solid transparent',
    color: isSelected ? colors.textPrimary : colors.textMuted,
  });

  return (
    <div className="flex flex-col flex-1 px-3 py-3" style={{ overflow: 'auto' }}>
      {/* Section label */}
      <div className="flex items-center justify-between mb-2">
        <span style={{ color: colors.textMuted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>
          Schools
        </span>
      </div>

      {/* All Users */}
      <div style={itemStyle(selectedSchoolId === null)} onClick={() => onSelectSchool(null)}>
        <span className="text-xs">All Users</span>
        <span style={{ fontSize: 10, opacity: 0.6 }}>{totalUsers}</span>
      </div>

      {/* School entries */}
      {(schools || []).map(s => (
        <div key={s.id} style={{ position: 'relative' }}>
          {renaming === s.id ? (
            <div className="flex items-center gap-1 mb-1">
              <input
                value={renameVal}
                onChange={e => setRenameVal(e.target.value)}
                className="flex-1 text-xs rounded px-2 py-1"
                style={{ background: colors.bgCanvas, border: `1px solid ${colors.borderDefault}`, color: colors.textPrimary }}
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter') handleRename(s.id);
                  if (e.key === 'Escape') { setRenaming(null); setRenameVal(''); }
                }}
              />
            </div>
          ) : (
            <div
              style={itemStyle(selectedSchoolId === s.id)}
              onClick={() => onSelectSchool(s.id)}
              onContextMenu={e => { e.preventDefault(); setMenuOpen(menuOpen === s.id ? null : s.id); }}
            >
              <span className="text-xs truncate" style={{ maxWidth: 130 }}>{s.name}</span>
              <div className="flex items-center gap-1">
                <span style={{ fontSize: 10, color: '#3fb950' }}>{s.total}</span>
                <button
                  onClick={e => { e.stopPropagation(); setMenuOpen(menuOpen === s.id ? null : s.id); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textMuted, padding: 2 }}
                >
                  <MoreHorizontal size={12} />
                </button>
              </div>
            </div>
          )}

          {/* Context menu */}
          {menuOpen === s.id && (
            <div
              className="absolute right-0 z-10 rounded shadow-lg py-1"
              style={{
                top: '100%',
                background: colors.bgSurface,
                border: `1px solid ${colors.borderDefault}`,
                minWidth: 120,
              }}
            >
              <button
                onClick={() => { setRenaming(s.id); setRenameVal(s.name); setMenuOpen(null); }}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left"
                style={{ color: colors.textPrimary, background: 'none', border: 'none', cursor: 'pointer' }}
              >
                <Pencil size={11} /> Rename
              </button>
              <button
                onClick={() => { handleDelete(s.id, s.name); setMenuOpen(null); }}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left"
                style={{ color: '#f85149', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                <Trash2 size={11} /> Delete
              </button>
            </div>
          )}
        </div>
      ))}

      {/* Create school */}
      {creating ? (
        <div className="flex items-center gap-1 mt-1">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="School name"
            className="flex-1 text-xs rounded px-2 py-1"
            style={{ background: colors.bgCanvas, border: `1px solid ${colors.borderDefault}`, color: colors.textPrimary }}
            autoFocus
            onKeyDown={e => {
              if (e.key === 'Enter') handleCreate();
              if (e.key === 'Escape') { setCreating(false); setNewName(''); }
            }}
          />
          <button
            onClick={handleCreate}
            disabled={!newName.trim() || saving}
            className="text-xs px-2 py-1 rounded"
            style={{ background: colors.gold, color: '#0d1117', border: 'none', cursor: 'pointer', fontWeight: 600 }}
          >
            Add
          </button>
        </div>
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1 mt-2 text-xs"
          style={{ color: colors.textMuted, background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <Plus size={12} /> New School
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/admin/SchoolsPanel.jsx
git commit -m "feat: create SchoolsPanel with inline create, rename, delete"
```

---

## Task 12: Simplify UserTableRow to 4 columns

**Files:**
- Modify: `client/src/components/admin/UserTableRow.jsx`

- [ ] **Step 1: Read the current file**

Read `client/src/components/admin/UserTableRow.jsx` to confirm current column structure.

- [ ] **Step 2: Rewrite UserTableRow with 4 columns, no actions menu**

Replace the entire component export. Keep `Pagination` export intact. The new row has: Name/Email, Role, Status, Last Seen. No actions column — row click opens drawer.

```jsx
import React from 'react';
import { colors } from '../../lib/colors';

const STATUS_COLORS = {
  active:    { bg: 'rgba(63,185,80,0.1)',   text: '#3fb950' },
  suspended: { bg: 'rgba(227,179,65,0.1)',  text: '#e3b341' },
  archived:  { bg: 'rgba(110,118,129,0.1)', text: '#6e7681' },
};

function timeAgo(iso) {
  if (!iso) return 'Never';
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function UserTableRow({ user, onClick }) {
  const sc = STATUS_COLORS[user.status] || STATUS_COLORS.archived;

  return (
    <tr
      onClick={() => onClick?.(user.id)}
      className="transition-colors"
      style={{ borderBottom: `1px solid #161b22`, cursor: 'pointer' }}
      onMouseEnter={e => e.currentTarget.style.background = 'rgba(212,175,55,0.04)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <td style={{ padding: '10px 12px' }}>
        <span className="text-sm font-semibold block" style={{ color: colors.textPrimary }}>
          {user.display_name || '—'}
        </span>
        <span className="text-xs" style={{ color: colors.textMuted }}>
          {user.email || ''}
        </span>
      </td>
      <td style={{ padding: '10px 12px' }}>
        <span className="text-xs" style={{
          color: user.role === 'coach' ? colors.gold : colors.textMuted,
        }}>
          {user.role || '—'}
        </span>
      </td>
      <td style={{ padding: '10px 12px' }}>
        <span
          className="text-xs px-2 py-0.5 rounded-full"
          style={{ background: sc.bg, color: sc.text }}
        >
          {user.status || 'unknown'}
        </span>
      </td>
      <td style={{ padding: '10px 12px' }}>
        <span className="text-xs" style={{ color: colors.textMuted }}>
          {timeAgo(user.last_seen)}
        </span>
      </td>
    </tr>
  );
}

export function Pagination({ page, pageCount, onPrev, onNext }) {
  if (pageCount <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-3 py-2">
      <button
        onClick={onPrev}
        disabled={page === 0}
        className="text-xs px-3 py-1 rounded"
        style={{
          background: 'transparent',
          border: `1px solid ${colors.borderDefault}`,
          color: page === 0 ? colors.textMuted : colors.textPrimary,
          cursor: page === 0 ? 'not-allowed' : 'pointer',
          opacity: page === 0 ? 0.4 : 1,
        }}
      >
        ← Prev
      </button>
      <span className="text-xs" style={{ color: colors.textMuted }}>
        {page + 1} / {pageCount}
      </span>
      <button
        onClick={onNext}
        disabled={page >= pageCount - 1}
        className="text-xs px-3 py-1 rounded"
        style={{
          background: 'transparent',
          border: `1px solid ${colors.borderDefault}`,
          color: page >= pageCount - 1 ? colors.textMuted : colors.textPrimary,
          cursor: page >= pageCount - 1 ? 'not-allowed' : 'pointer',
          opacity: page >= pageCount - 1 ? 0.4 : 1,
        }}
      >
        Next →
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/admin/UserTableRow.jsx
git commit -m "refactor: simplify UserTableRow to 4 columns, remove actions menu"
```

---

## Task 13: Simplify UserForm to create-only

**Files:**
- Modify: `client/src/pages/admin/UserForm.jsx`

- [ ] **Step 1: Remove edit mode logic**

In `client/src/pages/admin/UserForm.jsx`:
- Remove the `isCreate` conditional — it's always create now
- Remove the `user` prop handling for pre-population (lines 48–50 defaults)
- Change header to always say "CREATE USER"
- Remove the PUT branch in submit handler (line 109–112)
- Always show password field (remove the `isCreate &&` guard on line 190)

The component signature becomes:
```jsx
export default function UserForm({ onClose, onSaved }) {
```

Submit always POSTs:
```javascript
const handleSubmit = async (e) => {
  e.preventDefault();
  setSaving(true);
  setError(null);
  try {
    const body = { displayName: name, email: email || undefined, password, role };
    if (role === 'coached_student' && coachId) body.coachId = coachId;
    await apiFetch('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    onSaved?.();
    onClose?.();
  } catch (err) {
    setError(err.message || 'Failed to create user');
  } finally {
    setSaving(false);
  }
};
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/admin/UserForm.jsx
git commit -m "refactor: simplify UserForm to create-only mode"
```

---

## Task 14: Rewrite UserManagement — two-panel layout

**Files:**
- Modify: `client/src/pages/admin/UserManagement.jsx`
- Delete: `client/src/components/admin/UserFilters.jsx`
- Delete: `client/src/components/admin/ResetPasswordModal.jsx`
- Delete: `client/src/pages/admin/UserDetail.jsx`

- [ ] **Step 1: Delete removed files**

```bash
rm client/src/components/admin/UserFilters.jsx
rm client/src/components/admin/ResetPasswordModal.jsx
rm client/src/pages/admin/UserDetail.jsx
```

- [ ] **Step 2: Rewrite UserManagement.jsx**

Replace the entire file with the two-panel layout:

```jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Download, Plus } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { colors } from '../../lib/colors';
import UserForm from './UserForm';
import IncomingZone from '../../components/admin/IncomingZone';
import SchoolsPanel from '../../components/admin/SchoolsPanel';
import UserDrawer from '../../components/admin/UserDrawer';
import UserTableRow, { Pagination } from '../../components/admin/UserTableRow';

const PAGE_SIZE = 15;
const ROLES = ['superadmin', 'admin', 'coach', 'coached_student', 'solo_student'];

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [schools, setSchools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);

  // Filters
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterStatus, setFilterStatus] = useState('active');

  // School scope
  const [selectedSchoolId, setSelectedSchoolId] = useState(null);

  // Modals / Drawer
  const [showCreate, setShowCreate] = useState(false);
  const [drawerUserId, setDrawerUserId] = useState(null);

  // ── Data loading ──────────────────────────────────────────────────────────────

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set('status', filterStatus);
      if (filterRole) params.set('role', filterRole);
      const qs = params.toString();
      const data = await apiFetch(`/api/admin/users${qs ? `?${qs}` : ''}`);
      setUsers(Array.isArray(data) ? data : (data.users ?? data.players ?? []));
    } catch (err) {
      setError(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterRole]);

  const loadSchools = useCallback(async () => {
    try {
      const data = await apiFetch('/api/admin/schools');
      setSchools(Array.isArray(data) ? data : (data.schools ?? []));
    } catch { setSchools([]); }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);
  useEffect(() => { loadSchools(); }, [loadSchools]);

  const reloadAll = useCallback(() => {
    loadUsers();
    loadSchools();
  }, [loadUsers, loadSchools]);

  // ── Filtering ─────────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = users;

    // School scope
    if (selectedSchoolId) {
      list = list.filter(u => u.school_id === selectedSchoolId);
    }

    // Search
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(u =>
        (u.display_name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q)
      );
    }

    // Sort by name
    list = [...list].sort((a, b) =>
      (a.display_name || '').localeCompare(b.display_name || '')
    );

    return list;
  }, [users, selectedSchoolId, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Reset page on filter change
  useEffect(() => { setPage(0); }, [search, filterRole, filterStatus, selectedSchoolId]);

  // ── CSV export ────────────────────────────────────────────────────────────────

  const handleExport = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/admin/users/export-csv', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await res.text();
      const blob = new Blob([text], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'users.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* toast */ }
  };

  // ── Scope label ───────────────────────────────────────────────────────────────

  const selectedSchool = schools.find(s => s.id === selectedSchoolId);
  const scopeLabel = selectedSchool ? selectedSchool.name : 'All Users';
  const scopeCount = filtered.length;

  // ── Render ────────────────────────────────────────────────────────────────────

  const selectStyle = {
    background: colors.bgCanvas,
    border: `1px solid ${colors.borderDefault}`,
    color: colors.textMuted,
    padding: '4px 8px',
    borderRadius: 4,
    fontSize: 11,
    cursor: 'pointer',
  };

  return (
    <div className="flex h-full" style={{ background: colors.bgCanvas }}>

      {/* ═══ LEFT PANEL ═══ */}
      <div
        className="flex flex-col shrink-0"
        style={{
          width: 220,
          borderRight: `1px solid ${colors.borderDefault}`,
          background: colors.bgSurface,
        }}
      >
        <IncomingZone
          users={users}
          schools={schools}
          onSelectUser={setDrawerUserId}
          onUsersUpdated={reloadAll}
        />
        <SchoolsPanel
          schools={schools}
          selectedSchoolId={selectedSchoolId}
          totalUsers={users.length}
          onSelectSchool={setSelectedSchoolId}
          onSchoolsChanged={loadSchools}
        />
      </div>

      {/* ═══ RIGHT PANEL ═══ */}
      <div className="flex flex-col flex-1 min-w-0">

        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: `1px solid ${colors.borderDefault}` }}
        >
          <div>
            <span className="text-sm font-bold" style={{ color: colors.textPrimary }}>
              {scopeLabel}
            </span>
            <span className="text-xs ml-2" style={{ color: colors.textMuted }}>
              {scopeCount} user{scopeCount !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <input
              placeholder="Search…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="rounded px-2 py-1 text-xs"
              style={{
                background: colors.bgCanvas,
                border: `1px solid ${colors.borderDefault}`,
                color: colors.textPrimary,
                width: 140,
              }}
            />
            <select
              value={filterRole}
              onChange={e => setFilterRole(e.target.value)}
              style={selectStyle}
            >
              <option value="">All Roles</option>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              style={selectStyle}
            >
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="px-4 py-2 text-xs" style={{ color: '#f85149' }}>{error}</div>
        )}

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <span style={{ color: colors.textMuted }}>Loading…</span>
            </div>
          ) : paged.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <span style={{ color: colors.textMuted }}>No users found</span>
            </div>
          ) : (
            <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ color: colors.textMuted, textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.5px' }}>
                  <th className="text-left px-3 py-2" style={{ borderBottom: `1px solid ${colors.borderDefault}` }}>Name</th>
                  <th className="text-left px-3 py-2" style={{ borderBottom: `1px solid ${colors.borderDefault}` }}>Role</th>
                  <th className="text-left px-3 py-2" style={{ borderBottom: `1px solid ${colors.borderDefault}` }}>Status</th>
                  <th className="text-left px-3 py-2" style={{ borderBottom: `1px solid ${colors.borderDefault}` }}>Last Seen</th>
                </tr>
              </thead>
              <tbody>
                {paged.map(u => (
                  <UserTableRow key={u.id} user={u} onClick={setDrawerUserId} />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-4 py-2"
          style={{ borderTop: `1px solid ${colors.borderDefault}` }}
        >
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: colors.textMuted }}>
              {paged.length} of {filtered.length} shown
            </span>
            <Pagination
              page={page}
              pageCount={pageCount}
              onPrev={() => setPage(p => Math.max(0, p - 1))}
              onNext={() => setPage(p => Math.min(pageCount - 1, p + 1))}
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1 text-xs px-3 py-1.5 rounded font-semibold"
              style={{ background: '#238636', color: '#fff', border: 'none', cursor: 'pointer' }}
            >
              <Plus size={14} /> Add User
            </button>
            <button
              onClick={handleExport}
              className="flex items-center gap-1 text-xs px-3 py-1.5 rounded"
              style={{
                background: 'transparent',
                border: `1px solid ${colors.borderDefault}`,
                color: colors.textMuted,
                cursor: 'pointer',
              }}
            >
              <Download size={14} /> Export
            </button>
          </div>
        </div>
      </div>

      {/* ═══ MODALS / DRAWER ═══ */}
      {showCreate && (
        <UserForm
          onClose={() => setShowCreate(false)}
          onSaved={reloadAll}
        />
      )}
      {drawerUserId && (
        <UserDrawer
          userId={drawerUserId}
          schools={schools}
          onClose={() => setDrawerUserId(null)}
          onUserUpdated={reloadAll}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify in browser**

Run the app, navigate to `/admin/users`. Confirm:
- Left panel shows Incoming zone + Schools list
- Right panel shows scoped user table with 4 columns
- Clicking a school scopes the table
- Clicking a row opens the detail drawer
- "+ Add User" opens create modal
- Export CSV works
- Search/role/status filters work

- [ ] **Step 4: Commit**

```bash
git rm client/src/components/admin/UserFilters.jsx client/src/components/admin/ResetPasswordModal.jsx client/src/pages/admin/UserDetail.jsx
git add client/src/pages/admin/UserManagement.jsx
git commit -m "feat: rewrite UserManagement as two-panel layout with drawer, incoming zone, school scoping"
```

---

## Task 15: Remove stale imports and verify clean build

**Files:**
- Verify: all modified/deleted files

- [ ] **Step 1: Check for broken imports across the codebase**

Search for imports of deleted files:

```bash
grep -r "UserFilters\|ResetPasswordModal\|UserDetail" client/src/ --include="*.jsx" --include="*.js" -l
```

Fix any remaining imports that reference deleted files.

- [ ] **Step 2: Run lint / type check**

```bash
cd client && npx eslint src/pages/admin/ src/components/admin/ --ext .jsx,.js
```

Fix any lint errors.

- [ ] **Step 3: Run full backend test suite**

```bash
npx jest server/ --verbose
```

Expected: All tests pass.

- [ ] **Step 4: Verify full app in browser**

- Login as superadmin → "ADMIN" section in sidebar with "Users" link
- Click "Users" → two-panel layout loads
- Incoming zone shows unassigned users (or green check if none)
- Schools panel shows schools with counts
- Click a school → table scopes
- Click "All Users" → table shows everyone
- Click a user row → drawer slides in
- Profile section: name/email editable inline
- Role & School section: dropdowns for role, school, coach
- Account section: reset password, suspend, archive
- "+ Add User" → create form modal
- Export CSV → downloads file
- Login as coach → no "ADMIN" section, no "Users" link

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "chore: clean up stale imports and fix lint after user management redesign"
```

---

## Summary

| Task | What it does | Commit message |
|------|-------------|----------------|
| 1 | Backend: school_id in responses + updatePlayer | `feat: add school_id to user responses and PUT endpoint` |
| 2 | Backend: resolve coach_name + created_by_name | `fix: resolve coach_name and created_by_name in admin user responses` |
| 3 | Backend: bulk school assignment endpoint | `feat: add POST /users/bulk-assign-school endpoint` |
| 4 | SideNav: admin-only Users link | `feat: add Users link to SideNav for admin/superadmin` |
| 5 | UserDrawer shell with collapsible sections | `feat: create UserDrawer shell with collapsible lazy-rendered sections` |
| 6 | UserDrawerProfile section | `feat: create UserDrawerProfile section with inline editing` |
| 7 | UserDrawerRoleSchool section | `feat: create UserDrawerRoleSchool section with school assignment` |
| 8 | UserDrawerAccount section | `feat: create UserDrawerAccount section — reset password, suspend, archive` |
| 9 | Wire sections into drawer | `feat: wire Profile, Role & School, Account sections into UserDrawer` |
| 10 | IncomingZone component | `feat: create IncomingZone component for unassigned user intake` |
| 11 | SchoolsPanel component | `feat: create SchoolsPanel with inline create, rename, delete` |
| 12 | Simplify UserTableRow to 4 cols | `refactor: simplify UserTableRow to 4 columns, remove actions menu` |
| 13 | Simplify UserForm to create-only | `refactor: simplify UserForm to create-only mode` |
| 14 | Rewrite UserManagement (main page) | `feat: rewrite UserManagement as two-panel layout` |
| 15 | Clean up imports + verify | `chore: clean up stale imports and fix lint` |
